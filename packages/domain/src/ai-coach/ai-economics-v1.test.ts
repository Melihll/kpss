import { describe, expect, it } from "vitest";
import {
  AI_EVIDENCE_SIZE_LIMITS_V1,
  AI_FX_SNAPSHOT_V1_TEST_FIXTURE,
  AI_MONTHLY_BUDGET_POLICY_V1,
  AI_PRICING_CATALOG_V1_TEST_FIXTURE,
  AI_ROUTE_CATALOG_V1_TEST_FIXTURE,
  aggregateMonthlyAiUsageV1,
  aiAccountingMonthV1,
  calculateAiNativeCostV1,
  convertAiCostToTryV1,
  createAiUsageEventV1,
  estimateAiEvidenceV1,
  preflightAiCostV1,
  routeAiCapabilityV1,
  type AiModelRouteDecisionV1,
  type AiPricingCatalogV1,
  type AiReportedUsageV1,
  type AiUsageEventV1,
} from "./index";

const USER_A = "10000000-0000-4000-8000-000000000001";
const USER_B = "10000000-0000-4000-8000-000000000002";
const PROFILE_A = "20000000-0000-4000-8000-000000000001";
const STARTED_AT = "2026-09-10T09:00:00.000Z";
const COMPLETED_AT = "2026-09-10T09:00:01.250Z";

function route(
  capability: Parameters<typeof routeAiCapabilityV1>[0]["capability"] = "today_analysis",
  overrides: Partial<Parameters<typeof routeAiCapabilityV1>[0]> = {},
): AiModelRouteDecisionV1 {
  return routeAiCapabilityV1({
    runtimeEnvironment: "test",
    capability,
    evidence: estimateAiEvidenceV1(12_000),
    expectedResponse: "medium",
    budgetState: "normal",
    ...overrides,
  }, AI_ROUTE_CATALOG_V1_TEST_FIXTURE);
}

function usage(overrides: Partial<AiReportedUsageV1> = {}): AiReportedUsageV1 {
  return {
    availability: "reported",
    inputTokens: 1_000,
    cachedInputTokens: 200,
    outputTokens: 300,
    totalTokens: 1_300,
    source: "provider_response",
    ...overrides,
  };
}

function event(overrides: {
  attempt?: string;
  retry?: number;
  fallbackFrom?: string | null;
  pricing?: AiPricingCatalogV1;
  userId?: string;
  profileId?: string | null;
} = {}): AiUsageEventV1 {
  return createAiUsageEventV1({
    providerAttemptId: overrides.attempt ?? "attempt-1",
    identity: { userId: overrides.userId ?? USER_A, examProfileId: overrides.profileId === undefined ? PROFILE_A : overrides.profileId },
    feature: { capability: "today_analysis", requestId: "request-1", correlationId: "correlation-1" },
    route: route(),
    usage: usage(),
    execution: {
      providerRequestId: `provider-${overrides.attempt ?? "attempt-1"}`,
      providerRequestIdSource: "response_body",
      startedAt: STARTED_AT,
      completedAt: COMPLETED_AT,
      status: "succeeded",
      retryNumber: overrides.retry ?? 0,
      fallbackFromAttemptId: overrides.fallbackFrom ?? null,
      errorCategory: "none",
    },
    pricingCatalog: overrides.pricing ?? AI_PRICING_CATALOG_V1_TEST_FIXTURE,
    fxSnapshot: AI_FX_SNAPSHOT_V1_TEST_FIXTURE,
  });
}

function eventAtTry(amount: number, attempt: string, userId = USER_A, profileId: string | null = PROFILE_A): AiUsageEventV1 {
  const base = event({ attempt, userId, profileId });
  return {
    ...base,
    tryCost: { ...base.tryCost, state: "known", amount, currency: "TRY", fx: AI_FX_SNAPSHOT_V1_TEST_FIXTURE },
  } as AiUsageEventV1;
}

describe("Evre 6B.5 centralized AI economics foundation", () => {
  it("A. maps the same bounded capability metadata to a byte-equivalent route", () => {
    expect(JSON.stringify(route())).toBe(JSON.stringify(route()));
    expect(route()).toMatchObject({ disposition: "model", tier: "standard", authority: { serverOwnedSelection: true, clientOverrideAllowed: false, rawUserTextUsed: false, providerCallMade: false } });
  });

  it("B. routes deterministic signal evaluation to no-model", () => {
    expect(route("deterministic_signal_evaluation", { expectedResponse: "none" })).toMatchObject({ disposition: "no_model", provider: null, modelId: null, tier: "no_model", maxOutputTokens: 0, reasonCode: "deterministic_capability_no_model" });
  });

  it("C. selects economy, standard, and strong tiers centrally", () => {
    expect(route("intent_extraction").tier).toBe("economy");
    expect(route("today_analysis").tier).toBe("standard");
    expect(route("week_analysis").tier).toBe("strong");
    expect(route("week_analysis", { budgetState: "watch" })).toMatchObject({ tier: "standard", reasonCode: "budget_watch_route_cap" });
    expect(route("week_analysis", { budgetState: "constrained" })).toMatchObject({ tier: "economy", reasonCode: "budget_constrained_economy_only" });
    expect(route("week_analysis", { budgetState: "hard_limit" })).toMatchObject({ disposition: "blocked", tier: "no_model", reasonCode: "budget_hard_limit_blocked" });
  });

  it("D. classifies deterministic evidence-size boundaries and flags cost-watch scopes", () => {
    expect(estimateAiEvidenceV1(AI_EVIDENCE_SIZE_LIMITS_V1.smallMaxBytes).sizeClass).toBe("small");
    expect(estimateAiEvidenceV1(AI_EVIDENCE_SIZE_LIMITS_V1.smallMaxBytes + 1).sizeClass).toBe("medium");
    expect(estimateAiEvidenceV1(AI_EVIDENCE_SIZE_LIMITS_V1.mediumMaxBytes + 1).sizeClass).toBe("large");
    expect(estimateAiEvidenceV1(27_820)).toMatchObject({ sizeClass: "medium", costWatch: true, providerTokenizerUsed: false });
    expect(() => estimateAiEvidenceV1(AI_EVIDENCE_SIZE_LIMITS_V1.largeMaxBytes + 1)).toThrow("AI_EVIDENCE_BYTES_OUT_OF_RANGE");
  });

  it("E. fails closed when pricing is unknown instead of using zero", () => {
    const empty: AiPricingCatalogV1 = { ...AI_PRICING_CATALOG_V1_TEST_FIXTURE, entries: [] };
    expect(calculateAiNativeCostV1(route(), usage(), empty, COMPLETED_AT)).toEqual({ state: "unpriced", pricingVersion: empty.version, nativeAmount: null, nativeCurrency: null, reason: "pricing_entry_unavailable" });
  });

  it("E2. rejects fixture routing in production and fails closed on non-authoritative price or FX", () => {
    expect(() => routeAiCapabilityV1({
      runtimeEnvironment: "production",
      capability: "today_analysis",
      evidence: estimateAiEvidenceV1(100),
      expectedResponse: "short",
      budgetState: "normal",
    }, AI_ROUTE_CATALOG_V1_TEST_FIXTURE)).toThrow("AI_ROUTE_PRODUCTION_CATALOG_UNAVAILABLE");

    const productionRoute = { ...route(), runtimeEnvironment: "production", catalogEnvironment: "production" } as AiModelRouteDecisionV1;
    const native = calculateAiNativeCostV1(productionRoute, usage(), AI_PRICING_CATALOG_V1_TEST_FIXTURE, COMPLETED_AT);
    expect(native).toEqual({ state: "unpriced", pricingVersion: "ai-pricing-test-fixture-v1", nativeAmount: null, nativeCurrency: null, reason: "authoritative_production_pricing_unavailable" });

    const knownNative = calculateAiNativeCostV1(route(), usage(), AI_PRICING_CATALOG_V1_TEST_FIXTURE, COMPLETED_AT);
    expect(convertAiCostToTryV1(knownNative, null, "production", COMPLETED_AT)).toEqual({ state: "unknown", amount: null, currency: "TRY", reason: "authoritative_production_fx_unavailable", fx: null });
    expect(convertAiCostToTryV1(knownNative, AI_FX_SNAPSHOT_V1_TEST_FIXTURE, "production", COMPLETED_AT)).toMatchObject({ state: "unknown", amount: null, reason: "authoritative_production_fx_unavailable" });
    expect(convertAiCostToTryV1(knownNative, { ...AI_FX_SNAPSHOT_V1_TEST_FIXTURE, sourceKind: "authoritative_config", effectiveAt: "2026-09-01T00:00:00.000Z", loadedAt: "2026-09-01T00:01:00.000Z", maxAgeSeconds: 60 }, "production", COMPLETED_AT)).toMatchObject({ state: "unknown", amount: null, reason: "fx_snapshot_stale" });

    const { runtimeEnvironment: _environment, ...environmentlessRoute } = route();
    expect(() => calculateAiNativeCostV1(environmentlessRoute as AiModelRouteDecisionV1, usage(), AI_PRICING_CATALOG_V1_TEST_FIXTURE, COMPLETED_AT)).toThrow("AI_RUNTIME_ENVIRONMENT_REQUIRED");
    expect(() => convertAiCostToTryV1(knownNative, AI_FX_SNAPSHOT_V1_TEST_FIXTURE, undefined as never, COMPLETED_AT)).toThrow("AI_RUNTIME_ENVIRONMENT_REQUIRED");
  });

  it("F. charges cached input at the separately versioned cached-token price", () => {
    const cost = calculateAiNativeCostV1(route(), usage(), AI_PRICING_CATALOG_V1_TEST_FIXTURE, COMPLETED_AT);
    expect(cost).toMatchObject({ state: "known", pricingVersion: "ai-pricing-test-fixture-v1", nativeCurrency: "USD", components: { uncachedInput: 0.0024, cachedInput: 0.00015, output: 0.0036 }, nativeAmount: 0.00615 });
  });

  it("F2. preserves missing cached-token detail as unknown while conservatively pricing all input normally", () => {
    const cost = calculateAiNativeCostV1(route(), usage({ cachedInputTokens: null }), AI_PRICING_CATALOG_V1_TEST_FIXTURE, COMPLETED_AT);
    expect(cost).toMatchObject({ state: "known", components: { uncachedInput: 0.003, cachedInput: 0, output: 0.0036 }, nativeAmount: 0.0066 });
  });

  it("G/H. records retry and fallback as separate attempt events", () => {
    const first = event({ attempt: "attempt-initial" });
    const retry = event({ attempt: "attempt-retry", retry: 1 });
    const fallback = event({ attempt: "attempt-fallback", retry: 0, fallbackFrom: first.providerAttemptId });
    const summary = aggregateMonthlyAiUsageV1({ userId: USER_A, examProfileId: PROFILE_A, accountingMonth: "2026-09", events: [first, retry, fallback] });
    expect(summary.uniqueAttemptCount).toBe(3);
    expect(retry.retryNumber).toBe(1);
    expect(fallback.fallbackFromAttemptId).toBe("attempt-initial");
  });

  it("I. never double-counts an identical provider attempt and rejects conflicting reuse", () => {
    const original = event();
    const summary = aggregateMonthlyAiUsageV1({ userId: USER_A, examProfileId: PROFILE_A, accountingMonth: "2026-09", events: [original, original] });
    expect(summary).toMatchObject({ uniqueAttemptCount: 1, duplicateAttemptCount: 1 });
    expect(() => aggregateMonthlyAiUsageV1({ userId: USER_A, examProfileId: PROFILE_A, accountingMonth: "2026-09", events: [original, { ...original, retryNumber: 1 }] })).toThrow("AI_USAGE_ATTEMPT_CONFLICT");
  });

  it("J. freezes the FX snapshot and historical TRY estimate on each event", () => {
    const first = event();
    const changedFx = createAiUsageEventV1({
      providerAttemptId: "attempt-new-fx",
      identity: { userId: USER_A, examProfileId: PROFILE_A },
      feature: { capability: "today_analysis", requestId: "request-2", correlationId: "correlation-2" },
      route: route(), usage: usage(),
      execution: { providerRequestId: "provider-request-new-fx", providerRequestIdSource: "response_body", startedAt: STARTED_AT, completedAt: COMPLETED_AT, status: "succeeded", retryNumber: 0, fallbackFromAttemptId: null, errorCategory: "none" },
      pricingCatalog: AI_PRICING_CATALOG_V1_TEST_FIXTURE,
      fxSnapshot: { ...AI_FX_SNAPSHOT_V1_TEST_FIXTURE, snapshotVersion: "new-fixture", rate: 50 },
    });
    expect(first.tryCost).toMatchObject({ state: "known", amount: 0.246, fx: { snapshotVersion: "usd-try-test-fixture-2026-09-01", rate: 40 } });
    expect(changedFx.tryCost).toMatchObject({ state: "known", amount: 0.3075, fx: { snapshotVersion: "new-fixture", rate: 50 } });
    expect(first.tryCost).toMatchObject({ amount: 0.246 });
  });

  it("K. does not rewrite an old event when a new pricing version is introduced", () => {
    const old = event();
    const nextPricing: AiPricingCatalogV1 = {
      ...AI_PRICING_CATALOG_V1_TEST_FIXTURE,
      version: "ai-pricing-test-fixture-v2",
      entries: AI_PRICING_CATALOG_V1_TEST_FIXTURE.entries.map((entry) => ({ ...entry, inputPerMillionTokens: entry.inputPerMillionTokens * 2 })),
    };
    const nextRoute = { ...route(), pricingVersion: nextPricing.version } as AiModelRouteDecisionV1;
    const newer = createAiUsageEventV1({
      providerAttemptId: "attempt-v2", identity: { userId: USER_A, examProfileId: PROFILE_A },
      feature: { capability: "today_analysis", requestId: "request-v2", correlationId: "correlation-v2" }, route: nextRoute, usage: usage(),
      execution: { providerRequestId: "provider-request-v2", providerRequestIdSource: "response_body", startedAt: STARTED_AT, completedAt: COMPLETED_AT, status: "succeeded", retryNumber: 0, fallbackFromAttemptId: null, errorCategory: "none" },
      pricingCatalog: nextPricing, fxSnapshot: AI_FX_SNAPSHOT_V1_TEST_FIXTURE,
    });
    expect(old.pricingVersion).toBe("ai-pricing-test-fixture-v1");
    expect(newer.pricingVersion).toBe("ai-pricing-test-fixture-v2");
    expect(old.nativeCost).not.toEqual(newer.nativeCost);
  });

  it("L/M. aggregates monthly spend and applies normal/watch/constrained/hard-limit thresholds", () => {
    const summary = (amount: number) => aggregateMonthlyAiUsageV1({ userId: USER_A, examProfileId: PROFILE_A, accountingMonth: "2026-09", events: [eventAtTry(amount, `attempt-${amount}`)] });
    expect(summary(149.99).budgetState).toBe("normal");
    expect(summary(150).budgetState).toBe("watch");
    expect(summary(200).budgetState).toBe("constrained");
    expect(summary(300)).toMatchObject({ budgetState: "hard_limit", remainingTry: 0, utilizationPercent: 100 });
    expect(aggregateMonthlyAiUsageV1({
      userId: USER_A,
      examProfileId: PROFILE_A,
      accountingMonth: "2026-09",
      events: [eventAtTry(149, "attempt-reserved")],
      reservations: [{ reservationId: "reservation-active", userId: USER_A, examProfileId: PROFILE_A, accountingMonth: "2026-09", tryAmount: 1, state: "active", expiresAt: "2026-09-11T10:00:00.000Z" }],
    })).toMatchObject({ spentTry: 149, reservedTry: 1, committedTry: 150, budgetState: "watch" });
    expect(AI_MONTHLY_BUDGET_POLICY_V1.thresholds).toEqual({ normalTargetTry: 150, watchStartsTry: 150, constrainedStartsTry: 200, heavyTargetTry: 250, hardLimitTry: 300 });
  });

  it("L2. assigns the Europe/Istanbul calendar month at exact UTC boundaries", () => {
    expect(aiAccountingMonthV1("2026-08-31T20:59:59.999Z")).toBe("2026-08");
    expect(aiAccountingMonthV1("2026-08-31T21:00:00.000Z")).toBe("2026-09");
    expect(aiAccountingMonthV1("2026-09-30T20:59:59.999Z")).toBe("2026-09");
    expect(aiAccountingMonthV1("2026-09-30T21:00:00.000Z")).toBe("2026-10");
    expect(() => aggregateMonthlyAiUsageV1({ userId: USER_A, examProfileId: PROFILE_A, accountingMonth: "2026-09", events: [{ ...event(), completedAt: "2026-09-30T21:00:00.000Z" }] })).toThrow("AI_USAGE_ACCOUNTING_MONTH_MISMATCH");
  });

  it("N. creates a deterministic upper-bound preflight reservation proposal without provider use", () => {
    const budget = aggregateMonthlyAiUsageV1({ userId: USER_A, examProfileId: null, accountingMonth: "2026-09", events: [eventAtTry(100, "attempt-spend")] });
    const result = preflightAiCostV1({
      route: route("week_analysis"), evidence: estimateAiEvidenceV1(27_820), pricingCatalog: AI_PRICING_CATALOG_V1_TEST_FIXTURE,
      fxSnapshot: AI_FX_SNAPSHOT_V1_TEST_FIXTURE, budget, operationalOverheadTokens: 500,
      reservationIdentity: { reservationId: "reservation-1", userId: USER_A, examProfileId: PROFILE_A, expiresAt: "2026-09-10T09:05:00.000Z" },
      estimatedAt: COMPLETED_AT,
    });
    expect(result).toMatchObject({ estimateKind: "upper_bound_not_actual_billing", allowed: true, reasonCode: "within_budget", providerCallMade: false, reservationPersistence: "not_implemented_in_6b5", reservationProposal: { state: "active" } });
    expect(result.estimatedUsage.inputTokens).toBe(28_320);
    expect(() => preflightAiCostV1({
      route: route("week_analysis"), evidence: estimateAiEvidenceV1(27_820), pricingCatalog: AI_PRICING_CATALOG_V1_TEST_FIXTURE,
      fxSnapshot: AI_FX_SNAPSHOT_V1_TEST_FIXTURE, budget, operationalOverheadTokens: 500,
      reservationIdentity: { reservationId: "forged-scope", userId: USER_B, examProfileId: PROFILE_A, expiresAt: "2026-09-10T09:05:00.000Z" },
      estimatedAt: COMPLETED_AT,
    })).toThrow("AI_COST_PREFLIGHT_SCOPE_MISMATCH");
  });

  it("O. excludes events outside the requested user/profile", () => {
    const events = [event(), event({ attempt: "attempt-b", userId: USER_B, profileId: null }), event({ attempt: "attempt-other-profile", profileId: null })];
    const profile = aggregateMonthlyAiUsageV1({ userId: USER_A, examProfileId: PROFILE_A, accountingMonth: "2026-09", events });
    const userWide = aggregateMonthlyAiUsageV1({ userId: USER_A, examProfileId: null, accountingMonth: "2026-09", events });
    expect(profile).toMatchObject({ scope: "profile", uniqueAttemptCount: 1 });
    expect(userWide).toMatchObject({ scope: "user", uniqueAttemptCount: 2 });
  });

  it("P. rejects client-style model/cost/usage overrides", () => {
    expect(() => routeAiCapabilityV1({ ...({ runtimeEnvironment: "test", capability: "today_analysis", evidence: estimateAiEvidenceV1(100), expectedResponse: "short", budgetState: "normal", provider: "forged", modelId: "forged" } as any) }, AI_ROUTE_CATALOG_V1_TEST_FIXTURE)).toThrow("AI_ROUTE_INPUT_UNKNOWN_FIELD");
    expect(() => createAiUsageEventV1({ ...({ providerAttemptId: "attempt-forged", identity: { userId: USER_A, examProfileId: PROFILE_A }, feature: { capability: "today_analysis", requestId: "request", correlationId: "correlation" }, route: route(), usage: { ...usage(), nativeCost: 0 }, execution: { providerRequestId: null, providerRequestIdSource: "unavailable", startedAt: STARTED_AT, completedAt: COMPLETED_AT, status: "succeeded", retryNumber: 0, fallbackFromAttemptId: null, errorCategory: "none" }, pricingCatalog: AI_PRICING_CATALOG_V1_TEST_FIXTURE, fxSnapshot: AI_FX_SNAPSHOT_V1_TEST_FIXTURE } as any) })).toThrow("AI_USAGE_UNKNOWN_FIELD");
  });

  it("Q. stores no raw prompt, conversation, CoachContext, or secret", () => {
    const value = event();
    const serialized = JSON.stringify(value);
    expect(value.privacy).toEqual({ rawPromptStored: false, rawConversationStored: false, fullCoachContextStored: false });
    expect(value).not.toHaveProperty("prompt");
    expect(value).not.toHaveProperty("userMessage");
    expect(value).not.toHaveProperty("conversationText");
    expect(value).not.toHaveProperty("coachContext");
    expect(value).not.toHaveProperty("apiKey");
    expect(serialized).not.toMatch(/sk-[a-z0-9]|secret-token|raw-user-text/i);
  });

  it("fails budget accounting closed when any attempt is unpriced", () => {
    const value = { ...event(), tryCost: { state: "unknown", amount: null, currency: "TRY", reason: "native_cost_unpriced", fx: null } } as AiUsageEventV1;
    expect(aggregateMonthlyAiUsageV1({ userId: USER_A, examProfileId: PROFILE_A, accountingMonth: "2026-09", events: [value] })).toMatchObject({ availability: "unknown", budgetState: null, unpricedAttemptCount: 1 });
  });
});
