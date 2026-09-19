import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { handleProactiveCoachHttpV1 } from "./proactive-coach-http-v1.ts";

const NOW = "2026-09-10T09:00:00.000Z";

function safeRuntime() {
  return {
    version: "proactive-coach-runtime-v1",
    sourceContext: { version: "coach-context-v1", requestId: "request-proactive-http" },
    signalSet: { version: "coach-signal-set-v1", returnedCount: 0, availableCount: 0, truncated: false },
    selection: {
      version: "proactive-coach-selection-v1",
      evaluatedAt: NOW,
      currentDate: "2026-09-10",
      outcome: "silence",
      selectedCandidate: null,
      selectedFingerprint: null,
      selectedConditionKey: null,
      suppressions: [],
      authority: {
        mode: "deterministic_in_app_selection_only",
        inAppOnly: true,
        generatesProse: false,
        llmCallsAllowed: false,
        providerCallsAllowed: false,
        dbWritesAllowed: false,
        plannerProposalAllowed: false,
        plannerConfirmationAllowed: false,
        plannerApplyAllowed: false,
      },
    },
    presentationRecorded: false,
    authority: {
      mode: "server_owned_read_only_proactive_selection",
      deterministicOnly: true,
      clientIdentityAuthorityAllowed: false,
      generatesProse: false,
      dbWritesAllowed: false,
      providerCallsAllowed: false,
      llmCallsAllowed: false,
      plannerPreviewAllowed: false,
      plannerProposalAllowed: false,
      plannerConfirmationAllowed: false,
      plannerApplyAllowed: false,
    },
  } as const;
}

function baseInput(run = vi.fn(async () => safeRuntime())) {
  return {
    body: { surfaceSessionId: "surface-http" },
    contextClient: Object.freeze({}),
    userId: "user-server-owned",
    examProfileId: "profile-server-owned",
    currentDate: "2026-09-10",
    requestId: "request-proactive-http",
    requestedAt: NOW,
    dependencies: { run },
  } as const;
}

describe("Proactive Coach HTTP boundary V1", () => {
  it("returns accepted deterministic selection data without claiming presentation", async () => {
    const run = vi.fn(async () => safeRuntime());
    const result = await handleProactiveCoachHttpV1(baseInput(run));
    expect(result).toEqual({
      status: 200,
      body: {
        version: "proactive-coach-http-v1",
        status: "OK",
        runtime: safeRuntime(),
      },
    });
    expect(run).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-server-owned",
      examProfileId: "profile-server-owned",
      currentDate: "2026-09-10",
      requestedAt: NOW,
      surfaceSessionId: "surface-http",
    }));
    expect(JSON.stringify(result)).not.toContain("answer");
  });

  it("K. rejects every client attempt to inject server/runtime authority", async () => {
    const forbidden = [
      "userId", "examProfileId", "profileId", "currentDate", "now",
      "activeStudySession", "presentations", "userControls",
      "dismissedFingerprints", "snoozes", "disabledCategories",
      "clearObservations", "candidates", "signals", "plannerAuthority",
      "providerAuthority", "llmAuthority",
    ];
    for (const key of forbidden) {
      const result = await handleProactiveCoachHttpV1({
        ...baseInput(),
        body: { surfaceSessionId: "surface-http", [key]: "injected" },
      });
      expect(result).toMatchObject({ status: 400, body: { error: { code: "PROACTIVE_COACH_CLIENT_AUTHORITY_REFUSED" } } });
    }
  });

  it("L. rejects malformed surfaceSessionId and normalizes valid bounded input", async () => {
    for (const surfaceSessionId of [undefined, null, "", "   ", "bad\nvalue", "x".repeat(257)]) {
      const result = await handleProactiveCoachHttpV1({ ...baseInput(), body: { surfaceSessionId } });
      expect(result).toMatchObject({ status: 400, body: { error: { code: "PROACTIVE_COACH_SURFACE_SESSION_ID_INVALID" } } });
    }
    const run = vi.fn(async () => safeRuntime());
    await handleProactiveCoachHttpV1({ ...baseInput(run), body: { surfaceSessionId: "  cafe\u0301  " } });
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ surfaceSessionId: "caf\u00e9" }));
  });

  it("M-P. repeated exact calls are deterministic, read-only, provider-free and do not record presentation", async () => {
    const run = vi.fn(async () => safeRuntime());
    const first = await handleProactiveCoachHttpV1(baseInput(run));
    const second = await handleProactiveCoachHttpV1(baseInput(run));
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(run).toHaveBeenCalledTimes(2);
    expect((first.body as any).runtime).toMatchObject({
      presentationRecorded: false,
      authority: {
        dbWritesAllowed: false,
        providerCallsAllowed: false,
        llmCallsAllowed: false,
        plannerPreviewAllowed: false,
        plannerProposalAllowed: false,
        plannerConfirmationAllowed: false,
        plannerApplyAllowed: false,
      },
    });
  });

  it("fails closed on runtime exception or authority-contract violation", async () => {
    const failed = await handleProactiveCoachHttpV1(baseInput(vi.fn(async () => { throw new Error("READ_FAILED"); })));
    expect(failed).toMatchObject({ status: 503, body: { error: { code: "PROACTIVE_COACH_RUNTIME_UNAVAILABLE" } } });

    const unsafe = structuredClone(safeRuntime()) as any;
    unsafe.authority.dbWritesAllowed = true;
    const rejected = await handleProactiveCoachHttpV1(baseInput(vi.fn(async () => unsafe)));
    expect(rejected).toMatchObject({ status: 500, body: { error: { code: "PROACTIVE_COACH_BOUNDARY_CONTRACT_FAILED" } } });
  });

  it("is wired in app-api with authenticated actor/profile and server date/time only", () => {
    const source = fs.readFileSync(new URL("../../app-api/index.ts", import.meta.url), "utf8");
    expect(source).toContain('route === "/ai-coach/proactive"');
    expect(source).toContain("handleProactiveCoachHttpV1");
    const match = source.match(/if \(request\.method === "POST" && route === "\/ai-coach\/proactive"\) \{([\s\S]*?)\n    \}/);
    expect(match).not.toBeNull();
    const block = match![1];
    expect(block).toContain("contextClient: client");
    expect(block).toContain("userId");
    expect(block).toContain("examProfileId: profile.id");
    expect(block).toContain("currentDate: today");
    expect(block).toContain("requestId: crypto.randomUUID()");
    expect(block).toContain("requestedAt: new Date().toISOString()");
    expect(block).not.toMatch(/body\.(userId|profileId|examProfileId|currentDate|now)/);
  });

  it("new runtime and HTTP modules contain no mutation, provider, LLM or Planner lifecycle execution", () => {
    const files = ["proactive-coach-runtime-v1.ts", "proactive-coach-http-v1.ts"];
    for (const file of files) {
      const source = fs.readFileSync(new URL(file, import.meta.url), "utf8");
      expect(source).not.toMatch(/\.(insert|update|upsert|delete|rpc)\s*\(/);
      expect(source).not.toMatch(/create_planner_v2_proposal|confirm_planner|apply_planner|buildPlannerV2Preview/);
      expect(source).not.toMatch(/openai|anthropic|generateText|chat\.completions|responses\.create/i);
      expect(source).not.toMatch(/ai_coach_proactive_presentations[\s\S]*\.(insert|update|upsert|delete)\s*\(/);
    }
  });
});
