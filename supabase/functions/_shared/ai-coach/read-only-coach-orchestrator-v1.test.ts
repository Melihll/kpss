import { describe, expect, it } from "vitest";
import { buildCoachContextV1 } from "../ai-coach.bundle.js";
import type { AiFxSnapshotV1, AiPricingCatalogV1, AiRouteCatalogV1 } from "../../../../packages/domain/src/ai-coach/ai-economics-v1.ts";
import { coachContextV1Fixture, type CoachContextV1FixtureKind } from "../../../../packages/domain/src/ai-coach/fixtures/coach-context-v1.ts";
import { blockedCoachContextV1Fact, unknownCoachContextV1Fact } from "../../../../packages/domain/src/ai-coach/coach-context-v1.ts";
import { AI_OPENAI_PRICING_CATALOG_V1, AI_OPENAI_ROUTE_CATALOG_V1 } from "./provider-runtime-catalog-v1.ts";
import { AI_PROVIDER_RUNTIME_SERVER_KEYS_V1, resolveAiProviderRuntimeActivationV1 } from "./provider-runtime-activation-v1.ts";
import { runReadOnlyCoachCapabilityV1, type OpenAiGenerationTransportV1, type OpenAiInputCountTransportV1, type ReadOnlyCoachAccountingGatewayV1 } from "./read-only-coach-orchestrator-v1.ts";

const AT = "2026-09-10T09:00:00.000Z";
const LOCAL_ROUTES: AiRouteCatalogV1 = {
  ...AI_OPENAI_ROUTE_CATALOG_V1,
  version: "openai-local-route-test-v1",
  pricingVersion: "openai-local-pricing-test-v1",
  environment: "test_fixture",
};
const LOCAL_PRICING: AiPricingCatalogV1 = {
  ...AI_OPENAI_PRICING_CATALOG_V1,
  version: "openai-local-pricing-test-v1",
  environment: "test_fixture",
  entries: AI_OPENAI_PRICING_CATALOG_V1.entries.map((entry) => ({
    ...entry,
    sourceKind: "test_fixture" as const,
    effectiveFrom: "2026-09-01T00:00:00.000Z",
  })),
};
const LOCAL_FX: AiFxSnapshotV1 = {
  policyVersion: "ai-fx-policy-v1",
  snapshotVersion: "fx-local-test-v1",
  source: "test-fixture-only",
  sourceKind: "test_fixture",
  baseCurrency: "USD",
  quoteCurrency: "TRY",
  rate: 40,
  effectiveAt: "2026-09-10T00:00:00.000Z",
  loadedAt: "2026-09-10T00:05:00.000Z",
  maxAgeSeconds: 86_400,
};

interface Counters {
  count: number;
  reserve: number;
  mark: number;
  provider: number;
  settle: number;
  release: number;
  reconcile: number;
  events: any[];
  reservations: any[];
}

function accounting(counters: Counters, options: { reserveAllowed?: boolean; settlementStatus?: string; markError?: Error } = {}): ReadOnlyCoachAccountingGatewayV1 {
  return {
    reserve: async (input: any) => {
      counters.reserve += 1;
      counters.reservations.push(input);
      return { allowed: options.reserveAllowed !== false, reason: options.reserveAllowed === false ? "hard_limit" : "reserved", reservationId: options.reserveAllowed === false ? null : input.reservationId, status: options.reserveAllowed === false ? null : "reserved", accountingMonth: "2026-09", committedTry: input.costAuthorization.tryMaximum, idempotent: false } as any;
    },
    markStarted: async () => {
      counters.mark += 1;
      if (options.markError) throw options.markError;
      return {};
    },
    settle: async (input: any) => { counters.settle += 1; counters.events.push(input.event); return { status: options.settlementStatus ?? "settled" }; },
    release: async () => { counters.release += 1; return {}; },
    reconcile: async () => { counters.reconcile += 1; return {}; },
  };
}

function providerPayload(inputTokens: number, value: unknown, overrides: Record<string, unknown> = {}) {
  return {
    id: "resp_mock_1",
    status: "completed",
    output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(value) }] }],
    usage: {
      input_tokens: inputTokens,
      input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      output_tokens: 100,
      output_tokens_details: { reasoning_tokens: 20 },
      total_tokens: inputTokens + 100,
    },
    ...overrides,
  };
}

function harness(options: {
  fixture?: CoachContextV1FixtureKind;
  countError?: Error;
  countFingerprint?: string;
  countModel?: string;
  countClientRequestId?: string;
  countTransportAuthority?: OpenAiInputCountTransportV1["authority"];
  generationTransportAuthority?: OpenAiGenerationTransportV1["authority"];
  reserveAllowed?: boolean;
  settlementStatus?: string;
  markError?: Error;
  providerError?: Error;
  outcomeUnknown?: boolean;
  providerValue?: unknown;
  providerUsage?: Record<string, unknown>;
  sentFingerprint?: string;
  sentModel?: string;
  sentClientRequestId?: string;
  sentProviderRequestId?: string;
  forceRuntimeUnknowns?: boolean;
} = {}) {
  const counters: Counters = { count: 0, reserve: 0, mark: 0, provider: 0, settle: 0, release: 0, reconcile: 0, events: [], reservations: [] };
  const inputCountTransport: OpenAiInputCountTransportV1 = {
    authority: options.countTransportAuthority ?? "test_fixture",
    count: async ({ fingerprint, clientRequestId }) => {
      counters.count += 1;
      if (options.countError) throw options.countError;
      return { object: "response.input_tokens", inputTokens: 1_000, countedAt: AT, requestFingerprint: options.countFingerprint ?? fingerprint.value, modelId: options.countModel ?? fingerprint.modelId, clientRequestId: options.countClientRequestId ?? clientRequestId, providerRequestId: "count_mock_1" };
    },
  };
  const generationTransport: OpenAiGenerationTransportV1 = {
    authority: options.generationTransportAuthority ?? "test_fixture",
    execute: async ({ request, fingerprint, clientRequestId }) => {
      counters.provider += 1;
      if (options.providerError) throw options.providerError;
      if (options.outcomeUnknown) return { outcome: "unknown", startedAt: AT, observedAt: "2026-09-10T09:00:02.000Z", clientRequestId, reason: "timeout_billing_unknown" };
      const defaultFactPath = request.capability === "today_analysis" ? "evidence.today" : "evidence.week";
      const providerValue = options.providerValue ?? { answer: "Sağlanan kanıta göre kısa durum analizi.", sourceFactPaths: [defaultFactPath], acknowledgedUnknowns: [], staleOrBlockedWarnings: [] };
      const payload = providerPayload(1_000, providerValue);
      if (options.providerUsage) payload.usage = options.providerUsage as any;
      return { outcome: "known", requestFingerprint: options.sentFingerprint ?? fingerprint.value, modelId: options.sentModel ?? fingerprint.modelId, clientRequestId: options.sentClientRequestId ?? clientRequestId, providerRequestId: options.sentProviderRequestId ?? "req_mock_1", payload, headers: { "x-request-id": "req_mock_1" }, httpStatus: 200, startedAt: AT, completedAt: "2026-09-10T09:00:01.000Z" };
    },
  };
  const input: any = {
    contextClient: {}, serviceClient: {}, userId: "user-esra", examProfileId: "profile-kpss-2027",
    capability: "today_analysis", requestId: "request-1", correlationId: "correlation-1", reservationId: "reservation-1", providerAttemptId: "attempt-1",
    requestedAt: AT, reservationExpiresAt: "2026-09-10T09:10:00.000Z", runtimeEnvironment: "test", routingBudgetState: "normal",
    routeCatalog: LOCAL_ROUTES, pricingCatalog: LOCAL_PRICING, fxSnapshot: LOCAL_FX,
    dependencies: {
      loadContext: async () => {
        const fixture = coachContextV1Fixture(options.fixture ?? "healthy_normal_week");
        if (options.forceRuntimeUnknowns) {
          fixture.nextWork = unknownCoachContextV1Fact(
            "canonical_selector_unavailable",
            ["planning_task_state_v1", "canonical_material_truth_v1"],
          );
          fixture.week = {
            ...fixture.week,
            value: {
              ...fixture.week.value!,
              progressPosition: blockedCoachContextV1Fact(
                "pln002_completeness_unresolved",
                ["study_intent_ledger", "planning_task_state_v1"],
                fixture.generatedAt,
              ),
            },
          };
        }
        return buildCoachContextV1(fixture);
      },
      inputCountTransport, generationTransport, accounting: accounting(counters, options),
    },
  };
  return { counters, input };
}

async function runCapability(capability: "today_analysis" | "subject_analysis" | "week_analysis", fixture: CoachContextV1FixtureKind = "healthy_normal_week") {
  const test = harness({ fixture });
  test.input.capability = capability;
  if (capability === "subject_analysis") test.input.subjectId = "subject-law";
  return { ...test, result: await runReadOnlyCoachCapabilityV1(test.input) };
}

describe("6B.6B.1 mocked read-only Coach orchestration A-Z", () => {
  it("A. today_analysis completes the full reserved and grounded path", async () => {
    const { result, counters } = await runCapability("today_analysis");
    expect(result.response.noMutationPerformed).toBe(true);
    expect(counters).toMatchObject({ count: 1, reserve: 1, mark: 1, provider: 1, settle: 1, reconcile: 0 });
  });
  it("B. subject_analysis uses the bounded subject evidence scope", async () => {
    const { result } = await runCapability("subject_analysis");
    expect(result.response.capability).toBe("subject_analysis");
  });
  it("C. week_analysis uses the centralized strong route", async () => {
    const { result } = await runCapability("week_analysis");
    expect(result.observability.routeTier).toBe("strong");
  });
  it("D. canonical next-work unknown remains explicit", async () => {
    const test = harness({ forceRuntimeUnknowns: true });
    const context = await (test.input.dependencies.loadContext as any)({});
    expect(context.nextWork).toMatchObject({ availability: "unknown", unknownReason: "canonical_selector_unavailable" });
    await runReadOnlyCoachCapabilityV1(test.input);
  });
  it("E. PLN-002 trajectory remains blocked", async () => {
    const test = harness({ forceRuntimeUnknowns: true });
    const context = await (test.input.dependencies.loadContext as any)({});
    expect(context.week.value.progressPosition).toMatchObject({ availability: "blocked", unknownReason: "pln002_completeness_unresolved" });
    await runReadOnlyCoachCapabilityV1(test.input);
  });
  it("F. stale evidence is not promoted to a current fact", async () => {
    const test = harness({ fixture: "stale_partial_fact" });
    const context = await (test.input.dependencies.loadContext as any)({});
    expect(JSON.stringify(context)).toContain('"availability":"stale"');
    await runReadOnlyCoachCapabilityV1(test.input);
  });
  it("G. hallucinated fact references are rejected after accounting", async () => {
    const test = harness({ providerValue: { answer: "Uydurma", sourceFactPaths: ["evidence.fake"], acknowledgedUnknowns: [], staleOrBlockedWarnings: [] } });
    await expect(runReadOnlyCoachCapabilityV1(test.input)).rejects.toThrow("HALLUCINATED_FACT_REFERENCE");
    expect(test.counters.settle).toBe(1);
  });
  it("H. a changed request fingerprint after count is rejected before reservation", async () => {
    const test = harness({ countFingerprint: "sha256:changed" });
    await expect(runReadOnlyCoachCapabilityV1(test.input)).rejects.toThrow("INPUT_COUNT_REQUEST_MISMATCH");
    expect(test.counters).toMatchObject({ reserve: 0, provider: 0 });
  });
  it("I. a model change after count is rejected before reservation", async () => {
    const test = harness({ countModel: "gpt-5.4-2026-03-05" });
    await expect(runReadOnlyCoachCapabilityV1(test.input)).rejects.toThrow("INPUT_COUNT_REQUEST_MISMATCH");
    expect(test.counters.provider).toBe(0);
  });
  it("J. token count unavailable enters neither reservation nor provider", async () => {
    const test = harness({ countError: new Error("count unavailable") });
    await expect(runReadOnlyCoachCapabilityV1(test.input)).rejects.toThrow("count unavailable");
    expect(test.counters).toMatchObject({ reserve: 0, provider: 0 });
  });
  it("K. an unsupported billing bound prevents provider entry", async () => {
    const test = harness();
    test.input.routeCatalog = { ...LOCAL_ROUTES, routes: LOCAL_ROUTES.routes.map((route) => ({ ...route, modelId: "unknown-model" })) };
    test.input.pricingCatalog = { ...LOCAL_PRICING, entries: LOCAL_PRICING.entries.map((entry) => ({ ...entry, modelId: "unknown-model" })) };
    await expect(runReadOnlyCoachCapabilityV1(test.input)).rejects.toThrow("CONTEXT_BOUND_EXCEEDED");
    expect(test.counters.provider).toBe(0);
  });
  it("L. stale FX prevents reservation and provider", async () => {
    const test = harness();
    test.input.fxSnapshot = { ...LOCAL_FX, effectiveAt: "2026-01-01T00:00:00.000Z" };
    await expect(runReadOnlyCoachCapabilityV1(test.input)).rejects.toThrow("FX_UNAVAILABLE");
    expect(test.counters).toMatchObject({ reserve: 0, provider: 0 });
  });
  it("M. a denied atomic reservation yields zero provider attempts", async () => {
    const test = harness({ reserveAllowed: false });
    await expect(runReadOnlyCoachCapabilityV1(test.input)).rejects.toThrow("BUDGET_DENIED:hard_limit");
    expect(test.counters.provider).toBe(0);
  });
  it("N. the hard-ceiling decision comes from the accounting gateway", async () => {
    const test = harness({ reserveAllowed: false });
    await expect(runReadOnlyCoachCapabilityV1(test.input)).rejects.toThrow("hard_limit");
    expect(test.counters.reserve).toBe(1);
  });
  it("O. profile is breakdown only while the same user reaches reservation authority", async () => {
    const test = harness();
    await runReadOnlyCoachCapabilityV1(test.input);
    expect(test.counters.reservations[0]).toMatchObject({ userId: "user-esra", examProfileId: "profile-kpss-2027" });
  });
  it("P. a cross-user/profile context is rejected before counting", async () => {
    const test = harness();
    test.input.userId = "another-user";
    await expect(runReadOnlyCoachCapabilityV1(test.input)).rejects.toThrow("CONTEXT_SCOPE_MISMATCH");
    expect(test.counters.count).toBe(0);
  });
  it("Q. timeout before count/billing creates no reservation", async () => {
    const test = harness({ countError: new Error("input count timeout") });
    await expect(runReadOnlyCoachCapabilityV1(test.input)).rejects.toThrow("input count timeout");
    expect(test.counters.reserve).toBe(0);
  });
  it("R. timeout with unknown provider outcome enters reconciliation", async () => {
    const test = harness({ outcomeUnknown: true });
    await expect(runReadOnlyCoachCapabilityV1(test.input)).rejects.toThrow("PROVIDER_OUTCOME_UNKNOWN");
    expect(test.counters).toMatchObject({ provider: 1, settle: 0, reconcile: 1 });
  });
  it("S. successful reported usage settles within reservation", async () => {
    const test = harness();
    await runReadOnlyCoachCapabilityV1(test.input);
    expect(test.counters.events[0].tryCost.state).toBe("known");
    expect(test.counters.events[0].tryCost.amount).toBeLessThanOrEqual(test.counters.reservations[0].costAuthorization.tryMaximum);
  });
  it("T. synthetic actual-over-reserved reconciliation is fail-closed", async () => {
    const test = harness({ settlementStatus: "reconciliation_required" });
    await expect(runReadOnlyCoachCapabilityV1(test.input)).rejects.toThrow("ACCOUNTING_RECONCILIATION_REQUIRED");
    expect(test.counters.provider).toBe(1);
  });
  it("U. retry metadata is recorded as a separate attempt", async () => {
    const test = harness();
    test.input.retryNumber = 1; test.input.providerAttemptId = "attempt-retry"; test.input.reservationId = "reservation-retry";
    await runReadOnlyCoachCapabilityV1(test.input);
    expect(test.counters.events[0]).toMatchObject({ providerAttemptId: "attempt-retry", retryNumber: 1 });
  });
  it("V. fallback metadata is recorded separately", async () => {
    const test = harness();
    test.input.fallbackFromAttemptId = "attempt-original"; test.input.providerAttemptId = "attempt-fallback";
    await runReadOnlyCoachCapabilityV1(test.input);
    expect(test.counters.events[0]).toMatchObject({ providerAttemptId: "attempt-fallback", fallbackFromAttemptId: "attempt-original" });
  });
  it("W. duplicate attempt identity is delegated to idempotent accounting authority", async () => {
    const test = harness();
    await runReadOnlyCoachCapabilityV1(test.input);
    expect(test.counters.reservations[0].providerAttemptId).toBeUndefined();
    expect(test.counters.events[0].providerAttemptId).toBe("attempt-1");
  });
  it("X. no Planner mutation surface is present", async () => {
    const test = harness(); await runReadOnlyCoachCapabilityV1(test.input);
    expect(test.counters).not.toHaveProperty("plannerMutation");
  });
  it("Y. no task/material/workload/capacity mutation surface is present", async () => {
    const test = harness(); await runReadOnlyCoachCapabilityV1(test.input);
    expect(test.counters.events).toHaveLength(1);
  });
  it("Z. accounting receives no raw prompt or CoachContext", async () => {
    const test = harness(); await runReadOnlyCoachCapabilityV1(test.input);
    const serialized = JSON.stringify({ reservations: test.counters.reservations, events: test.counters.events });
    expect(serialized).not.toMatch(/"(prompt|coach_context|conversation)"\s*:/i);
  });

  it("releases a reservation when the provider attempt never starts", async () => {
    const test = harness({ markError: new Error("attempt start unavailable") });
    await expect(runReadOnlyCoachCapabilityV1(test.input)).rejects.toThrow("attempt start unavailable");
    expect(test.counters).toMatchObject({ mark: 1, release: 1, provider: 0, reconcile: 0 });
  });

  it("requires reconciliation when a thrown transport error has unknown provider outcome", async () => {
    const test = harness({ providerError: new Error("connection lost") });
    await expect(runReadOnlyCoachCapabilityV1(test.input)).rejects.toThrow("connection lost");
    expect(test.counters).toMatchObject({ provider: 1, settle: 0, reconcile: 1 });
  });

  it("rejects cross-request count identity before reservation", async () => {
    const test = harness({ countClientRequestId: "count:another-request" });
    await expect(runReadOnlyCoachCapabilityV1(test.input)).rejects.toThrow("INPUT_COUNT_RESPONSE_INVALID");
    expect(test.counters).toMatchObject({ reserve: 0, provider: 0 });
  });

  it("rejects cross-attempt generation identity into reconciliation", async () => {
    const test = harness({ sentClientRequestId: "attempt:another-attempt" });
    await expect(runReadOnlyCoachCapabilityV1(test.input)).rejects.toThrow("SENT_REQUEST_MISMATCH");
    expect(test.counters).toMatchObject({ settle: 0, reconcile: 1 });
  });

  it("rejects provider request-id mismatch into reconciliation", async () => {
    const test = harness({ sentProviderRequestId: "req_different" });
    await expect(runReadOnlyCoachCapabilityV1(test.input)).rejects.toThrow("PROVIDER_REQUEST_ID_MISMATCH");
    expect(test.counters).toMatchObject({ settle: 0, reconcile: 1 });
  });
});


function controlledDevActivationForOrchestratorTest() {
  const keys = AI_PROVIDER_RUNTIME_SERVER_KEYS_V1;

  const activation = resolveAiProviderRuntimeActivationV1({
    deploymentEnvironment: "local_dev",
    serverConfig: {
      [keys.enabled]: "true",
      [keys.environment]: "local_dev",
      [keys.scope]: "one_controlled_dev_smoke_v1",
      [keys.allowedUserId]: "user-esra",
      [keys.allowedProfileId]: "profile-kpss-2027",
      [keys.acceptUnresolvedCountBillingRisk]: "true",
    },
    userId: "user-esra",
    examProfileId: "profile-kpss-2027",
  });

  if (activation.availability !== "available") {
    throw new Error(`controlled DEV activation unavailable: ${activation.reason}`);
  }

  return activation;
}

function configureControlledLocalDevOrchestratorTest(
  test: ReturnType<typeof harness>,
) {
  test.input.runtimeEnvironment = "local";

  test.input.routeCatalog = {
    ...LOCAL_ROUTES,
    environment: "local",
  };

  test.input.pricingCatalog = {
    ...LOCAL_PRICING,
    environment: "local",
    entries: LOCAL_PRICING.entries.map((entry) => ({
      ...entry,
      sourceKind: "authoritative_config" as const,
    })),
  };

  test.input.fxSnapshot = {
    ...LOCAL_FX,
    source: "tcmb-controlled-dev-test-authority",
    sourceKind: "authoritative_config",
  };

  test.input.providerRuntimeActivation =
    controlledDevActivationForOrchestratorTest();

  return test;
}

describe("6B.6B.2 controlled local DEV orchestration authority", () => {
  it("uses official count authority and controlled DEV cost authority", async () => {
    const test = configureControlledLocalDevOrchestratorTest(
      harness({
        countTransportAuthority: "openai_dev_gateway",
        generationTransportAuthority: "openai_dev_gateway",
      }),
    );

    const result = await runReadOnlyCoachCapabilityV1(test.input);

    expect(result.noMutationPerformed).toBe(true);

    expect(test.counters).toMatchObject({
      count: 1,
      reserve: 1,
      mark: 1,
      provider: 1,
      settle: 1,
      reconcile: 0,
    });

    expect(test.counters.reservations[0].costAuthorization).toMatchObject({
      authority: "controlled_dev_runtime",
      runtimeEnvironment: "local",
    });
  });

  it("rejects local DEV without activation before token counting", async () => {
    const test = harness({
      countTransportAuthority: "openai_dev_gateway",
      generationTransportAuthority: "openai_dev_gateway",
    });

    test.input.runtimeEnvironment = "local";

    test.input.routeCatalog = {
      ...LOCAL_ROUTES,
      environment: "local",
    };

    test.input.pricingCatalog = {
      ...LOCAL_PRICING,
      environment: "local",
      entries: LOCAL_PRICING.entries.map((entry) => ({
        ...entry,
        sourceKind: "authoritative_config" as const,
      })),
    };

    test.input.fxSnapshot = {
      ...LOCAL_FX,
      sourceKind: "authoritative_config",
    };

    await expect(
      runReadOnlyCoachCapabilityV1(test.input),
    ).rejects.toThrow(
      "READ_ONLY_COACH_CONTROLLED_DEV_AUTHORITY_INVALID",
    );

    expect(test.counters.count).toBe(0);
    expect(test.counters.provider).toBe(0);
  });

  it("rejects fixture transports inside controlled local DEV before counting", async () => {
    const test =
      configureControlledLocalDevOrchestratorTest(harness());

    await expect(
      runReadOnlyCoachCapabilityV1(test.input),
    ).rejects.toThrow(
      "READ_ONLY_COACH_CONTROLLED_DEV_AUTHORITY_INVALID",
    );

    expect(test.counters.count).toBe(0);
    expect(test.counters.provider).toBe(0);
  });

  it("rejects real-gateway authority inside test runtime", async () => {
    const test = harness({
      countTransportAuthority: "openai_dev_gateway",
      generationTransportAuthority: "openai_dev_gateway",
    });

    await expect(
      runReadOnlyCoachCapabilityV1(test.input),
    ).rejects.toThrow(
      "READ_ONLY_COACH_TEST_TRANSPORT_AUTHORITY_INVALID",
    );

    expect(test.counters.count).toBe(0);
    expect(test.counters.provider).toBe(0);
  });
});
