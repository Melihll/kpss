import { describe, expect, it } from "vitest";
import {
  buildCoachContextV1,
  estimateAiEvidenceV1,
  projectCoachEvidenceViewV1,
  routeAiCapabilityV1,
} from "../ai-coach.bundle.js";
import { coachContextV1Fixture } from "../../../../packages/domain/src/ai-coach/fixtures/coach-context-v1.ts";
import {
  blockedCoachContextV1Fact,
  unknownCoachContextV1Fact,
} from "../../../../packages/domain/src/ai-coach/coach-context-v1.ts";
import { AI_OPENAI_ROUTE_CATALOG_V1 } from "./provider-runtime-catalog-v1.ts";
import {
  OPENAI_COACH_RESPONSE_SCHEMA_V1,
  buildOpenAiCoachRequestV1,
  fingerprintOpenAiCoachRequestV1,
  stableCanonicalJsonV1,
  suppliedCoachEvidenceFactPathsV1,
  validateGroundedCoachResponseV1,
} from "./openai-coach-request-v1.ts";

function evidence() {
  const input = coachContextV1Fixture("healthy_normal_week");
  input.nextWork = unknownCoachContextV1Fact(
    "canonical_selector_unavailable",
    ["planning_task_state_v1", "canonical_material_truth_v1"],
  );
  input.week = {
    ...input.week,
    value: {
      ...input.week.value!,
      progressPosition: blockedCoachContextV1Fact(
        "pln002_completeness_unresolved",
        ["study_intent_ledger", "planning_task_state_v1"],
        input.generatedAt,
      ),
    },
  };
  const context = buildCoachContextV1(input);
  return projectCoachEvidenceViewV1(context, { scope: "today_explain", capability: "explain" });
}

function request() {
  const projected = evidence();
  const route = routeAiCapabilityV1({
    runtimeEnvironment: "production",
    capability: "today_analysis",
    evidence: estimateAiEvidenceV1(new TextEncoder().encode(JSON.stringify(projected)).byteLength),
    expectedResponse: "medium",
    budgetState: "normal",
  }, AI_OPENAI_ROUTE_CATALOG_V1);
  return buildOpenAiCoachRequestV1({ route, capability: "today_analysis", evidence: projected, locale: "tr-TR" });
}

describe("immutable OpenAI Coach request V1", () => {
  it("builds one frozen server-owned text-only request for count and generation", () => {
    const value = request();
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.responseBody)).toBe(true);
    expect(value.responseBody).toMatchObject({
      model: "gpt-5.4-mini-2026-03-17",
      store: false,
      truncation: "disabled",
      service_tier: "default",
      background: false,
      tools: [],
      tool_choice: "none",
      max_output_tokens: 900,
      reasoning: { effort: "none" },
    });
    expect(value.inputCountBody).toEqual(expect.objectContaining({
      model: value.responseBody.model,
      instructions: value.responseBody.instructions,
      input: value.responseBody.input,
      text: value.responseBody.text,
      tools: [],
      truncation: "disabled",
    }));
    expect(value.authority).toMatchObject({ toolsAllowed: false, mutationAllowed: false, storedByProvider: false });
  });

  it("keeps provider schema minimal while preserving local response bounds", () => {
    const schema = JSON.stringify(OPENAI_COACH_RESPONSE_SCHEMA_V1);

    expect(schema).not.toContain('"minLength"');
    expect(schema).not.toContain('"maxLength"');
    expect(schema).not.toContain('"uniqueItems"');
    expect(schema).toContain('"maxItems":32');

    expect(() => validateGroundedCoachResponseV1({
      capability: "today_analysis",
      evidence: evidence(),
      providerValue: {
        answer: "Local validator item length sinirini korur.",
        sourceFactPaths: ["x".repeat(513)],
        acknowledgedUnknowns: [],
        staleOrBlockedWarnings: [],
      },
    })).toThrow("GROUNDED_COACH_RESPONSE_FACT_REFS_INVALID");
  });

  it("sends the exact deterministic grounding reference catalog used by local validation", () => {
    const projected = evidence();

    const route = routeAiCapabilityV1({
      runtimeEnvironment: "production",
      capability: "today_analysis",
      evidence: estimateAiEvidenceV1(
        new TextEncoder().encode(
          JSON.stringify(projected),
        ).byteLength,
      ),
      expectedResponse: "medium",
      budgetState: "normal",
    }, AI_OPENAI_ROUTE_CATALOG_V1);

    const value = buildOpenAiCoachRequestV1({
      route,
      capability: "today_analysis",
      evidence: projected,
      locale: "tr-TR",
    });

    const payload = JSON.parse(
      value.responseBody.input[0].content[0].text,
    );

    const expectedFactPaths =
      [...suppliedCoachEvidenceFactPathsV1(projected)];

    const expectedUnknownPaths =
      [...new Set(
        projected.unknowns.map((item) => item.path),
      )].sort();

    const expectedWarningPaths =
      [...new Set(
        projected.unknowns
          .filter(
            (item) =>
              item.availability === "blocked"
              || item.availability === "stale",
          )
          .map((item) => item.path),
      )].sort();

    expect(
      payload.referenceCatalog,
    ).toEqual({
      sourceFactPaths: expectedFactPaths,
      acknowledgedUnknownPaths:
        expectedUnknownPaths,
      staleOrBlockedWarningPaths:
        expectedWarningPaths,
    });

    expect(
      value.responseBody.instructions,
    ).toContain(
      "referenceCatalog.sourceFactPaths",
    );

    expect(
      value.responseBody.instructions,
    ).toContain(
      "referenceCatalog.acknowledgedUnknownPaths",
    );

    expect(
      value.responseBody.instructions,
    ).toContain(
      "referenceCatalog.staleOrBlockedWarningPaths",
    );

    expect(expectedFactPaths.length).toBeGreaterThan(0);

    const accepted =
      validateGroundedCoachResponseV1({
        capability: "today_analysis",
        evidence: projected,
        providerValue: {
          answer:
            "Sağlanan exact referans kataloğundaki kanıta dayanır.",
          sourceFactPaths: [
            expectedFactPaths[0],
          ],
          acknowledgedUnknowns: [],
          staleOrBlockedWarnings: [],
        },
      });

    expect(
      accepted.sourceFactPaths,
    ).toEqual([
      expectedFactPaths[0],
    ]);

    expect(
      () =>
        validateGroundedCoachResponseV1({
          capability: "today_analysis",
          evidence: projected,
          providerValue: {
            answer:
              "Katalog dışı referans reddedilmelidir.",
            sourceFactPaths: [
              "evidence.fabricated.path",
            ],
            acknowledgedUnknowns: [],
            staleOrBlockedWarnings: [],
          },
        }),
    ).toThrow(
      "GROUNDED_COACH_RESPONSE_HALLUCINATED_FACT_REFERENCE",
    );
  });

  it("canonicalizes object keys deterministically without reordering arrays", () => {
    expect(stableCanonicalJsonV1({ z: 1, a: { d: 4, b: 2 }, list: [3, 1] }))
      .toBe('{"a":{"b":2,"d":4},"list":[3,1],"z":1}');
  });

  it("produces a deterministic SHA-256 fingerprint over the complete generation request", async () => {
    const left = await fingerprintOpenAiCoachRequestV1(request());
    const right = await fingerprintOpenAiCoachRequestV1(request());
    expect(left).toEqual(right);
    expect(left.value).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(left.coverage).toBe("complete_generation_request");
  });

  it("changes the fingerprint when any sent field or model changes", async () => {
    const base = request();
    const baseFingerprint = await fingerprintOpenAiCoachRequestV1(base);
    const outputChanged = { ...base, responseBody: { ...base.responseBody, max_output_tokens: base.responseBody.max_output_tokens + 1 } };
    const modelChanged = { ...base, responseBody: { ...base.responseBody, model: "gpt-5.4-2026-03-05" } };
    expect((await fingerprintOpenAiCoachRequestV1(outputChanged)).value).not.toBe(baseFingerprint.value);
    expect((await fingerprintOpenAiCoachRequestV1(modelChanged)).value).not.toBe(baseFingerprint.value);
  });

  it("rejects a hallucinated fact reference", () => {
    expect(() => validateGroundedCoachResponseV1({
      capability: "today_analysis",
      evidence: evidence(),
      providerValue: {
        answer: "Bugünkü durumu özetledim.",
        sourceFactPaths: ["evidence.notSupplied"],
        acknowledgedUnknowns: [],
        staleOrBlockedWarnings: [],
      },
    })).toThrow("GROUNDED_COACH_RESPONSE_HALLUCINATED_FACT_REFERENCE");
  });

  it("rejects the broad evidence root as a factual citation", () => {
    expect(() => validateGroundedCoachResponseV1({
      capability: "today_analysis",
      evidence: evidence(),
      providerValue: {
        answer: "Genel kanıta dayandığını iddia etti.",
        sourceFactPaths: ["evidence"],
        acknowledgedUnknowns: [],
        staleOrBlockedWarnings: [],
      },
    })).toThrow("GROUNDED_COACH_RESPONSE_HALLUCINATED_FACT_REFERENCE");
  });

  it("preserves explicit unknown and blocked references", () => {
    const projected = evidence();
    const nextUnknown = projected.unknowns.find((item) => item.reason === "canonical_selector_unavailable");
    const trajectoryBlocked = projected.unknowns.find((item) => item.reason === "pln002_completeness_unresolved");
    expect(nextUnknown).toBeDefined();
    expect(trajectoryBlocked).toBeDefined();
    const result = validateGroundedCoachResponseV1({
      capability: "today_analysis",
      evidence: projected,
      providerValue: {
        answer: "Kanonik sonraki iş bilinmiyor; ilerleme konumu PLN-002 nedeniyle kesinleştirilemez.",
        sourceFactPaths: ["evidence.canonicalWork.next", "evidence.week.value.progressPosition"],
        acknowledgedUnknowns: [nextUnknown!.path],
        staleOrBlockedWarnings: [trajectoryBlocked!.path],
      },
    });
    expect(result.acknowledgedUnknowns).toEqual([nextUnknown!.path]);
    expect(result.staleOrBlockedWarnings).toEqual([trajectoryBlocked!.path]);
    expect(result.noMutationPerformed).toBe(true);
  });
});
