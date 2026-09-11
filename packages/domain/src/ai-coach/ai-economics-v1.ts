export const AI_MODEL_ROUTER_V1_VERSION = "ai-model-router-v1" as const;
export const AI_EVIDENCE_ESTIMATE_V1_VERSION = "ai-evidence-estimate-v1" as const;
export const AI_PRICING_CATALOG_V1_CONTRACT_VERSION = "ai-pricing-catalog-v1" as const;
export const AI_FX_POLICY_V1_VERSION = "ai-fx-policy-v1" as const;
export const AI_USAGE_EVENT_V1_VERSION = "ai-usage-event-v1" as const;
export const AI_MONTHLY_BUDGET_POLICY_V1_VERSION = "ai-monthly-budget-policy-v1" as const;
export const AI_COST_PREFLIGHT_V1_VERSION = "ai-cost-preflight-v1" as const;

export const AI_COACH_CAPABILITIES_V1 = [
  "deterministic_signal_evaluation",
  "intent_extraction",
  "short_explanation",
  "today_analysis",
  "week_analysis",
  "subject_analysis",
  "planner_explanation",
  "proactive_explanation",
  "conversation_summary",
  "complex_status_analysis",
] as const;

export type AiCoachCapabilityV1 = (typeof AI_COACH_CAPABILITIES_V1)[number];
export type AiModelTierV1 = "no_model" | "economy" | "standard" | "strong";
export type AiEvidenceSizeClassV1 = "small" | "medium" | "large";
export type AiExpectedResponseClassV1 = "none" | "short" | "medium" | "long";
export type AiComplexityClassV1 = "low" | "medium" | "high";
export type AiBudgetStateV1 = "normal" | "watch" | "constrained" | "hard_limit";
export type AiRuntimeEnvironmentV1 = "test" | "local" | "production";

export interface AiEvidenceEstimateV1 {
  readonly version: typeof AI_EVIDENCE_ESTIMATE_V1_VERSION;
  readonly bytes: number;
  readonly sizeClass: AiEvidenceSizeClassV1;
  readonly estimatedInputTokens: number;
  readonly method: "utf8_byte_count_upper_bound";
  readonly providerTokenizerUsed: false;
  readonly conservativeEstimate: true;
  readonly costWatch: boolean;
}

export interface AiRouteCatalogEntryV1 {
  readonly tier: Exclude<AiModelTierV1, "no_model">;
  readonly provider: string;
  readonly modelId: string;
  readonly maxOutputTokens: number;
  readonly timeoutMs: number;
  readonly retryPolicy: {
    readonly maxAttempts: number;
    readonly retryableCategories: readonly ("timeout" | "rate_limit" | "provider_unavailable")[];
  };
  readonly fallbackTier: Exclude<AiModelTierV1, "no_model"> | null;
}

export interface AiRouteCatalogV1 {
  readonly version: string;
  readonly contractVersion: typeof AI_MODEL_ROUTER_V1_VERSION;
  readonly effectiveFrom: string;
  readonly pricingVersion: string;
  readonly environment: "test_fixture" | "local" | "production";
  readonly routes: readonly AiRouteCatalogEntryV1[];
}

export interface AiModelRouterInputV1 {
  readonly runtimeEnvironment: AiRuntimeEnvironmentV1;
  readonly capability: AiCoachCapabilityV1;
  readonly evidence: AiEvidenceEstimateV1;
  readonly expectedResponse: AiExpectedResponseClassV1;
  readonly budgetState: AiBudgetStateV1 | "unknown";
  readonly complexity?: AiComplexityClassV1;
}

export interface AiModelRouteDecisionV1 {
  readonly version: typeof AI_MODEL_ROUTER_V1_VERSION;
  readonly runtimeEnvironment: AiRuntimeEnvironmentV1;
  readonly catalogEnvironment: AiRouteCatalogV1["environment"];
  readonly catalogVersion: string;
  readonly pricingVersion: string;
  readonly capability: AiCoachCapabilityV1;
  readonly disposition: "model" | "no_model" | "blocked";
  readonly provider: string | null;
  readonly modelId: string | null;
  readonly tier: AiModelTierV1;
  readonly maxOutputTokens: number;
  readonly timeoutMs: number;
  readonly retryPolicy: AiRouteCatalogEntryV1["retryPolicy"];
  readonly fallbackTier: Exclude<AiModelTierV1, "no_model"> | null;
  readonly reasonCode:
    | "deterministic_capability_no_model"
    | "capability_default_route"
    | "evidence_or_complexity_escalation"
    | "budget_watch_route_cap"
    | "budget_constrained_economy_only"
    | "budget_hard_limit_blocked"
    | "budget_unknown_fail_closed";
  readonly authority: {
    readonly serverOwnedSelection: true;
    readonly clientOverrideAllowed: false;
    readonly rawUserTextUsed: false;
    readonly providerCallMade: false;
  };
}

export interface AiPricingEntryV1 {
  readonly provider: string;
  readonly modelId: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly billingCurrency: string;
  readonly inputPerMillionTokens: number;
  readonly cachedInputPerMillionTokens: number | null;
  readonly outputPerMillionTokens: number;
  readonly sourceKind: "test_fixture" | "authoritative_config";
}

export interface AiPricingCatalogV1 {
  readonly contractVersion: typeof AI_PRICING_CATALOG_V1_CONTRACT_VERSION;
  readonly version: string;
  readonly effectiveFrom: string;
  readonly environment: "test_fixture" | "local" | "production";
  readonly entries: readonly AiPricingEntryV1[];
}

export interface AiFxSnapshotV1 {
  readonly policyVersion: typeof AI_FX_POLICY_V1_VERSION;
  readonly snapshotVersion: string;
  readonly source: string;
  readonly sourceKind: "test_fixture" | "authoritative_config";
  readonly baseCurrency: string;
  readonly quoteCurrency: "TRY";
  readonly rate: number;
  readonly effectiveAt: string;
}

export interface AiReportedUsageV1 {
  readonly availability: "reported" | "unavailable";
  readonly inputTokens: number | null;
  readonly cachedInputTokens: number | null;
  readonly outputTokens: number | null;
  readonly totalTokens: number | null;
  readonly source: "provider_response" | "provider_usage_unavailable";
}

export type AiNativeCostV1 =
  | {
      readonly state: "known";
      readonly pricingVersion: string;
      readonly nativeAmount: number;
      readonly nativeCurrency: string;
      readonly components: {
        readonly uncachedInput: number;
        readonly cachedInput: number;
        readonly output: number;
      };
    }
  | {
      readonly state: "unpriced";
      readonly pricingVersion: string;
      readonly nativeAmount: null;
      readonly nativeCurrency: string | null;
      readonly reason: "pricing_entry_unavailable" | "authoritative_production_pricing_unavailable" | "cached_input_price_unavailable" | "usage_unavailable";
    }
  | {
      readonly state: "not_applicable";
      readonly pricingVersion: string;
      readonly nativeAmount: 0;
      readonly nativeCurrency: null;
      readonly reason: "no_model_route";
    };

export type AiTryCostV1 =
  | {
      readonly state: "known";
      readonly amount: number;
      readonly currency: "TRY";
      readonly fx: AiFxSnapshotV1;
    }
  | {
      readonly state: "unknown";
      readonly amount: null;
      readonly currency: "TRY";
      readonly reason: "native_cost_unpriced" | "fx_snapshot_unavailable" | "authoritative_production_fx_unavailable" | "fx_currency_mismatch";
      readonly fx: AiFxSnapshotV1 | null;
    }
  | {
      readonly state: "not_applicable";
      readonly amount: 0;
      readonly currency: "TRY";
      readonly reason: "no_model_route";
      readonly fx: null;
    };

export type AiProviderAttemptStatusV1 = "succeeded" | "failed" | "timeout" | "cancelled";
export type AiProviderErrorCategoryV1 = "none" | "timeout" | "rate_limit" | "provider_unavailable" | "invalid_response" | "unknown";

export interface AiUsageEventV1 {
  readonly version: typeof AI_USAGE_EVENT_V1_VERSION;
  readonly providerAttemptId: string;
  readonly userId: string;
  readonly examProfileId: string | null;
  readonly capability: AiCoachCapabilityV1;
  readonly requestId: string;
  readonly correlationId: string;
  readonly routeVersion: typeof AI_MODEL_ROUTER_V1_VERSION;
  readonly routeCatalogVersion: string;
  readonly provider: string;
  readonly modelId: string;
  readonly tier: Exclude<AiModelTierV1, "no_model">;
  readonly routeReasonCode: AiModelRouteDecisionV1["reasonCode"];
  readonly pricingVersion: string;
  readonly usage: AiReportedUsageV1;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly latencyMs: number;
  readonly status: AiProviderAttemptStatusV1;
  readonly retryNumber: number;
  readonly fallbackFromAttemptId: string | null;
  readonly errorCategory: AiProviderErrorCategoryV1;
  readonly nativeCost: AiNativeCostV1;
  readonly tryCost: AiTryCostV1;
  readonly accountingMonth: string;
  readonly privacy: {
    readonly rawPromptStored: false;
    readonly rawConversationStored: false;
    readonly fullCoachContextStored: false;
  };
}

export interface CreateAiUsageEventInputV1 {
  readonly providerAttemptId: string;
  readonly identity: { readonly userId: string; readonly examProfileId: string | null };
  readonly feature: { readonly capability: AiCoachCapabilityV1; readonly requestId: string; readonly correlationId: string };
  readonly route: AiModelRouteDecisionV1;
  readonly usage: AiReportedUsageV1;
  readonly execution: {
    readonly startedAt: string;
    readonly completedAt: string;
    readonly status: AiProviderAttemptStatusV1;
    readonly retryNumber: number;
    readonly fallbackFromAttemptId: string | null;
    readonly errorCategory: AiProviderErrorCategoryV1;
  };
  readonly pricingCatalog: AiPricingCatalogV1;
  readonly fxSnapshot: AiFxSnapshotV1 | null;
}

export interface AiCostReservationV1 {
  readonly reservationId: string;
  readonly userId: string;
  readonly examProfileId: string | null;
  readonly accountingMonth: string;
  readonly tryAmount: number;
  readonly state: "active" | "released" | "consumed";
  readonly expiresAt: string;
}

export interface AiMonthlyBudgetSummaryV1 {
  readonly version: typeof AI_MONTHLY_BUDGET_POLICY_V1_VERSION;
  readonly scope: "user" | "profile";
  readonly userId: string;
  readonly examProfileId: string | null;
  readonly accountingMonth: string;
  readonly availability: "known" | "unknown";
  readonly unknownReason: "unpriced_usage_present" | null;
  readonly spentTry: number | null;
  readonly reservedTry: number | null;
  readonly committedTry: number | null;
  readonly remainingTry: number | null;
  readonly utilizationPercent: number | null;
  readonly budgetState: AiBudgetStateV1 | null;
  readonly uniqueAttemptCount: number;
  readonly unpricedAttemptCount: number;
  readonly duplicateAttemptCount: number;
  readonly thresholds: typeof AI_MONTHLY_BUDGET_POLICY_V1.thresholds;
}

export interface AiCostPreflightV1 {
  readonly version: typeof AI_COST_PREFLIGHT_V1_VERSION;
  readonly route: AiModelRouteDecisionV1;
  readonly evidence: AiEvidenceEstimateV1;
  readonly estimateKind: "upper_bound_not_actual_billing";
  readonly estimatedUsage: AiReportedUsageV1;
  readonly estimatedNativeCost: AiNativeCostV1;
  readonly estimatedTryCost: AiTryCostV1;
  readonly allowed: boolean;
  readonly reasonCode: "within_budget" | "route_blocked" | "budget_unknown" | "cost_unknown" | "hard_limit" | "estimated_cost_exceeds_remaining";
  readonly reservationProposal: AiCostReservationV1 | null;
  readonly reservationPersistence: "not_implemented_in_6b5";
  readonly providerCallMade: false;
}

export const AI_EVIDENCE_SIZE_LIMITS_V1 = Object.freeze({
  smallMaxBytes: 16_384,
  mediumMaxBytes: 32_768,
  largeMaxBytes: 65_536,
  costWatchBytes: 24_576,
});

export const AI_MONTHLY_BUDGET_POLICY_V1 = Object.freeze({
  version: AI_MONTHLY_BUDGET_POLICY_V1_VERSION,
  currency: "TRY" as const,
  accountingTimezone: "Europe/Istanbul" as const,
  thresholds: Object.freeze({
    normalTargetTry: 150,
    watchStartsTry: 150,
    constrainedStartsTry: 200,
    heavyTargetTry: 250,
    hardLimitTry: 300,
  }),
});

export const AI_ROUTE_CATALOG_V1_TEST_FIXTURE: AiRouteCatalogV1 = deepFreeze({
  version: "ai-route-catalog-test-fixture-v1",
  contractVersion: AI_MODEL_ROUTER_V1_VERSION,
  effectiveFrom: "2026-09-01T00:00:00.000Z",
  pricingVersion: "ai-pricing-test-fixture-v1",
  environment: "test_fixture",
  routes: [
    { tier: "economy", provider: "fixture-provider", modelId: "fixture-economy-v1", maxOutputTokens: 500, timeoutMs: 8_000, retryPolicy: { maxAttempts: 2, retryableCategories: ["timeout", "rate_limit", "provider_unavailable"] }, fallbackTier: null },
    { tier: "standard", provider: "fixture-provider", modelId: "fixture-standard-v1", maxOutputTokens: 900, timeoutMs: 12_000, retryPolicy: { maxAttempts: 2, retryableCategories: ["timeout", "rate_limit", "provider_unavailable"] }, fallbackTier: "economy" },
    { tier: "strong", provider: "fixture-provider", modelId: "fixture-strong-v1", maxOutputTokens: 1_400, timeoutMs: 18_000, retryPolicy: { maxAttempts: 2, retryableCategories: ["timeout", "rate_limit", "provider_unavailable"] }, fallbackTier: "standard" },
  ],
});

export const AI_PRICING_CATALOG_V1_TEST_FIXTURE: AiPricingCatalogV1 = deepFreeze({
  contractVersion: AI_PRICING_CATALOG_V1_CONTRACT_VERSION,
  version: "ai-pricing-test-fixture-v1",
  effectiveFrom: "2026-09-01T00:00:00.000Z",
  environment: "test_fixture",
  entries: [
    { provider: "fixture-provider", modelId: "fixture-economy-v1", effectiveFrom: "2026-09-01T00:00:00.000Z", effectiveTo: null, billingCurrency: "USD", inputPerMillionTokens: 1, cachedInputPerMillionTokens: 0.25, outputPerMillionTokens: 4, sourceKind: "test_fixture" },
    { provider: "fixture-provider", modelId: "fixture-standard-v1", effectiveFrom: "2026-09-01T00:00:00.000Z", effectiveTo: null, billingCurrency: "USD", inputPerMillionTokens: 3, cachedInputPerMillionTokens: 0.75, outputPerMillionTokens: 12, sourceKind: "test_fixture" },
    { provider: "fixture-provider", modelId: "fixture-strong-v1", effectiveFrom: "2026-09-01T00:00:00.000Z", effectiveTo: null, billingCurrency: "USD", inputPerMillionTokens: 10, cachedInputPerMillionTokens: 2.5, outputPerMillionTokens: 40, sourceKind: "test_fixture" },
  ],
});

export const AI_FX_SNAPSHOT_V1_TEST_FIXTURE: AiFxSnapshotV1 = deepFreeze({
  policyVersion: AI_FX_POLICY_V1_VERSION,
  snapshotVersion: "usd-try-test-fixture-2026-09-01",
  source: "test-fixture-only",
  sourceKind: "test_fixture",
  baseCurrency: "USD",
  quoteCurrency: "TRY",
  rate: 40,
  effectiveAt: "2026-09-01T00:00:00.000Z",
});

const CAPABILITY_DEFAULT_TIER: Readonly<Record<AiCoachCapabilityV1, AiModelTierV1>> = Object.freeze({
  deterministic_signal_evaluation: "no_model",
  intent_extraction: "economy",
  short_explanation: "economy",
  today_analysis: "standard",
  week_analysis: "strong",
  subject_analysis: "standard",
  planner_explanation: "standard",
  proactive_explanation: "economy",
  conversation_summary: "economy",
  complex_status_analysis: "strong",
});

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value as Record<string, unknown>)) deepFreeze(item);
  }
  return value;
}

function assertFiniteNonNegative(value: number, code: string): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(code);
}

function assertIntegerNonNegative(value: number | null, code: string): void {
  if (value !== null && (!Number.isInteger(value) || value < 0)) throw new Error(code);
}

function assertExactKeys(value: object, keys: readonly string[], code: string): void {
  const allowed = new Set(keys);
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new Error(code);
}

function isIsoInstant(value: string): boolean {
  return Number.isFinite(Date.parse(value)) && value.includes("T");
}

function assertRuntimeEnvironment(value: unknown): asserts value is AiRuntimeEnvironmentV1 {
  if (value !== "test" && value !== "local" && value !== "production") throw new Error("AI_RUNTIME_ENVIRONMENT_REQUIRED");
}

function round(value: number, digits = 9): number {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function tierRank(tier: Exclude<AiModelTierV1, "no_model">): number {
  return { economy: 0, standard: 1, strong: 2 }[tier];
}

function tierAtRank(rank: number): Exclude<AiModelTierV1, "no_model"> {
  return (["economy", "standard", "strong"] as const)[Math.max(0, Math.min(2, rank))]!;
}

export function estimateAiEvidenceV1(bytes: number): AiEvidenceEstimateV1 {
  if (!Number.isInteger(bytes) || bytes < 0 || bytes > AI_EVIDENCE_SIZE_LIMITS_V1.largeMaxBytes) throw new Error("AI_EVIDENCE_BYTES_OUT_OF_RANGE");
  const sizeClass: AiEvidenceSizeClassV1 = bytes <= AI_EVIDENCE_SIZE_LIMITS_V1.smallMaxBytes
    ? "small"
    : bytes <= AI_EVIDENCE_SIZE_LIMITS_V1.mediumMaxBytes ? "medium" : "large";
  return deepFreeze({
    version: AI_EVIDENCE_ESTIMATE_V1_VERSION,
    bytes,
    sizeClass,
    estimatedInputTokens: bytes,
    method: "utf8_byte_count_upper_bound",
    providerTokenizerUsed: false,
    conservativeEstimate: true,
    costWatch: bytes >= AI_EVIDENCE_SIZE_LIMITS_V1.costWatchBytes,
  });
}

export function routeAiCapabilityV1(input: AiModelRouterInputV1, catalog: AiRouteCatalogV1): AiModelRouteDecisionV1 {
  assertExactKeys(input, ["runtimeEnvironment", "capability", "evidence", "expectedResponse", "budgetState", "complexity"], "AI_ROUTE_INPUT_UNKNOWN_FIELD");
  assertRuntimeEnvironment(input.runtimeEnvironment);
  if (!["test_fixture", "local", "production"].includes(catalog.environment)) throw new Error("AI_ROUTE_CATALOG_INVALID");
  if (input.runtimeEnvironment === "production" && catalog.environment !== "production") throw new Error("AI_ROUTE_PRODUCTION_CATALOG_UNAVAILABLE");
  if (!AI_COACH_CAPABILITIES_V1.includes(input.capability)) throw new Error("AI_ROUTE_CAPABILITY_UNSUPPORTED");
  const classified = estimateAiEvidenceV1(input.evidence.bytes);
  if (JSON.stringify(classified) !== JSON.stringify(input.evidence)) throw new Error("AI_ROUTE_EVIDENCE_CLASSIFICATION_MISMATCH");
  if (catalog.contractVersion !== AI_MODEL_ROUTER_V1_VERSION || catalog.routes.length === 0) throw new Error("AI_ROUTE_CATALOG_INVALID");
  if (!isIsoInstant(catalog.effectiveFrom) || new Set(catalog.routes.map((item) => item.tier)).size !== catalog.routes.length) throw new Error("AI_ROUTE_CATALOG_INVALID");
  if (catalog.routes.some((item) => !item.provider.trim() || !item.modelId.trim() || !Number.isInteger(item.maxOutputTokens) || item.maxOutputTokens <= 0 || !Number.isInteger(item.timeoutMs) || item.timeoutMs <= 0 || !Number.isInteger(item.retryPolicy.maxAttempts) || item.retryPolicy.maxAttempts < 1)) throw new Error("AI_ROUTE_CATALOG_INVALID");
  const base = CAPABILITY_DEFAULT_TIER[input.capability];
  const noRetry = { maxAttempts: 0, retryableCategories: [] as const };
  const authority = { serverOwnedSelection: true, clientOverrideAllowed: false, rawUserTextUsed: false, providerCallMade: false } as const;
  if (base === "no_model") return deepFreeze({
    version: AI_MODEL_ROUTER_V1_VERSION, runtimeEnvironment: input.runtimeEnvironment, catalogEnvironment: catalog.environment,
    catalogVersion: catalog.version, pricingVersion: catalog.pricingVersion,
    capability: input.capability, disposition: "no_model", provider: null, modelId: null, tier: "no_model", maxOutputTokens: 0, timeoutMs: 0,
    retryPolicy: noRetry, fallbackTier: null, reasonCode: "deterministic_capability_no_model", authority,
  });
  if (input.budgetState === "unknown" || input.budgetState === "hard_limit") return deepFreeze({
    version: AI_MODEL_ROUTER_V1_VERSION, runtimeEnvironment: input.runtimeEnvironment, catalogEnvironment: catalog.environment,
    catalogVersion: catalog.version, pricingVersion: catalog.pricingVersion,
    capability: input.capability, disposition: "blocked", provider: null, modelId: null, tier: "no_model", maxOutputTokens: 0, timeoutMs: 0,
    retryPolicy: noRetry, fallbackTier: null, reasonCode: input.budgetState === "unknown" ? "budget_unknown_fail_closed" : "budget_hard_limit_blocked", authority,
  });
  let rank = tierRank(base);
  let reasonCode: AiModelRouteDecisionV1["reasonCode"] = "capability_default_route";
  if (input.evidence.sizeClass === "large" || input.expectedResponse === "long" || input.complexity === "high") {
    rank = Math.min(2, rank + 1);
    reasonCode = "evidence_or_complexity_escalation";
  }
  if (input.budgetState === "watch" && rank > 1) {
    rank = 1;
    reasonCode = "budget_watch_route_cap";
  }
  if (input.budgetState === "constrained") {
    rank = 0;
    reasonCode = "budget_constrained_economy_only";
  }
  const tier = tierAtRank(rank);
  const route = catalog.routes.find((item) => item.tier === tier);
  if (!route) throw new Error("AI_ROUTE_TIER_UNAVAILABLE");
  return deepFreeze({
    version: AI_MODEL_ROUTER_V1_VERSION, runtimeEnvironment: input.runtimeEnvironment, catalogEnvironment: catalog.environment,
    catalogVersion: catalog.version, pricingVersion: catalog.pricingVersion,
    capability: input.capability, disposition: "model", provider: route.provider, modelId: route.modelId, tier,
    maxOutputTokens: route.maxOutputTokens, timeoutMs: route.timeoutMs, retryPolicy: structuredClone(route.retryPolicy),
    fallbackTier: route.fallbackTier, reasonCode, authority,
  });
}

function validateUsage(usage: AiReportedUsageV1): void {
  assertExactKeys(usage, ["availability", "inputTokens", "cachedInputTokens", "outputTokens", "totalTokens", "source"], "AI_USAGE_UNKNOWN_FIELD");
  assertIntegerNonNegative(usage.inputTokens, "AI_USAGE_INPUT_TOKENS_INVALID");
  assertIntegerNonNegative(usage.cachedInputTokens, "AI_USAGE_CACHED_TOKENS_INVALID");
  assertIntegerNonNegative(usage.outputTokens, "AI_USAGE_OUTPUT_TOKENS_INVALID");
  assertIntegerNonNegative(usage.totalTokens, "AI_USAGE_TOTAL_TOKENS_INVALID");
  if (usage.availability === "reported") {
    if (usage.inputTokens === null || usage.cachedInputTokens === null || usage.outputTokens === null || usage.totalTokens === null) throw new Error("AI_USAGE_REPORTED_VALUES_REQUIRED");
    if (usage.cachedInputTokens > usage.inputTokens || usage.totalTokens !== usage.inputTokens + usage.outputTokens || usage.source !== "provider_response") throw new Error("AI_USAGE_REPORTED_VALUES_INCONSISTENT");
  } else if ([usage.inputTokens, usage.cachedInputTokens, usage.outputTokens, usage.totalTokens].some((value) => value !== null) || usage.source !== "provider_usage_unavailable") {
    throw new Error("AI_USAGE_UNAVAILABLE_MUST_BE_NULL");
  }
}

export function calculateAiNativeCostV1(
  route: AiModelRouteDecisionV1,
  usage: AiReportedUsageV1,
  catalog: AiPricingCatalogV1,
  occurredAt: string,
): AiNativeCostV1 {
  validateUsage(usage);
  assertRuntimeEnvironment(route.runtimeEnvironment);
  if (route.disposition !== "model" || route.provider === null || route.modelId === null) return { state: "not_applicable", pricingVersion: catalog.version, nativeAmount: 0, nativeCurrency: null, reason: "no_model_route" };
  if (usage.availability === "unavailable") return { state: "unpriced", pricingVersion: catalog.version, nativeAmount: null, nativeCurrency: null, reason: "usage_unavailable" };
  if (route.runtimeEnvironment === "production" && catalog.environment !== "production") return { state: "unpriced", pricingVersion: catalog.version, nativeAmount: null, nativeCurrency: null, reason: "authoritative_production_pricing_unavailable" };
  const at = Date.parse(occurredAt);
  const entry = catalog.entries.find((item) => item.provider === route.provider && item.modelId === route.modelId && Date.parse(item.effectiveFrom) <= at && (item.effectiveTo === null || at < Date.parse(item.effectiveTo)));
  if (!entry || catalog.version !== route.pricingVersion) return { state: "unpriced", pricingVersion: catalog.version, nativeAmount: null, nativeCurrency: null, reason: "pricing_entry_unavailable" };
  if (route.runtimeEnvironment === "production" && entry.sourceKind !== "authoritative_config") return { state: "unpriced", pricingVersion: catalog.version, nativeAmount: null, nativeCurrency: entry.billingCurrency, reason: "authoritative_production_pricing_unavailable" };
  assertFiniteNonNegative(entry.inputPerMillionTokens, "AI_PRICING_INPUT_INVALID");
  assertFiniteNonNegative(entry.outputPerMillionTokens, "AI_PRICING_OUTPUT_INVALID");
  if (entry.cachedInputPerMillionTokens !== null) assertFiniteNonNegative(entry.cachedInputPerMillionTokens, "AI_PRICING_CACHED_INPUT_INVALID");
  if (usage.cachedInputTokens! > 0 && entry.cachedInputPerMillionTokens === null) return { state: "unpriced", pricingVersion: catalog.version, nativeAmount: null, nativeCurrency: entry.billingCurrency, reason: "cached_input_price_unavailable" };
  const uncachedTokens = usage.inputTokens! - usage.cachedInputTokens!;
  const uncachedInput = round(uncachedTokens * entry.inputPerMillionTokens / 1_000_000);
  const cachedInput = round(usage.cachedInputTokens! * (entry.cachedInputPerMillionTokens ?? 0) / 1_000_000);
  const output = round(usage.outputTokens! * entry.outputPerMillionTokens / 1_000_000);
  return { state: "known", pricingVersion: catalog.version, nativeAmount: round(uncachedInput + cachedInput + output), nativeCurrency: entry.billingCurrency, components: { uncachedInput, cachedInput, output } };
}

export function convertAiCostToTryV1(nativeCost: AiNativeCostV1, fx: AiFxSnapshotV1 | null, runtimeEnvironment: AiRuntimeEnvironmentV1): AiTryCostV1 {
  assertRuntimeEnvironment(runtimeEnvironment);
  if (nativeCost.state === "not_applicable") return { state: "not_applicable", amount: 0, currency: "TRY", reason: "no_model_route", fx: null };
  if (nativeCost.state === "unpriced") return { state: "unknown", amount: null, currency: "TRY", reason: "native_cost_unpriced", fx };
  if (runtimeEnvironment === "production" && (fx === null || fx.sourceKind !== "authoritative_config")) return { state: "unknown", amount: null, currency: "TRY", reason: "authoritative_production_fx_unavailable", fx };
  if (fx === null) return { state: "unknown", amount: null, currency: "TRY", reason: "fx_snapshot_unavailable", fx: null };
  assertFiniteNonNegative(fx.rate, "AI_FX_RATE_INVALID");
  if (fx.rate === 0) throw new Error("AI_FX_RATE_INVALID");
  if (fx.baseCurrency !== nativeCost.nativeCurrency || fx.quoteCurrency !== "TRY") return { state: "unknown", amount: null, currency: "TRY", reason: "fx_currency_mismatch", fx };
  return { state: "known", amount: round(nativeCost.nativeAmount * fx.rate, 6), currency: "TRY", fx: structuredClone(fx) };
}

export function aiAccountingMonthV1(iso: string): string {
  if (!isIsoInstant(iso)) throw new Error("AI_USAGE_TIMESTAMP_INVALID");
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: AI_MONTHLY_BUDGET_POLICY_V1.accountingTimezone, year: "numeric", month: "2-digit" }).formatToParts(new Date(iso));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}`;
}

export function createAiUsageEventV1(input: CreateAiUsageEventInputV1): AiUsageEventV1 {
  assertExactKeys(input, ["providerAttemptId", "identity", "feature", "route", "usage", "execution", "pricingCatalog", "fxSnapshot"], "AI_USAGE_EVENT_INPUT_UNKNOWN_FIELD");
  assertExactKeys(input.identity, ["userId", "examProfileId"], "AI_USAGE_IDENTITY_UNKNOWN_FIELD");
  assertExactKeys(input.feature, ["capability", "requestId", "correlationId"], "AI_USAGE_FEATURE_UNKNOWN_FIELD");
  assertExactKeys(input.execution, ["startedAt", "completedAt", "status", "retryNumber", "fallbackFromAttemptId", "errorCategory"], "AI_USAGE_EXECUTION_UNKNOWN_FIELD");
  if (input.route.disposition !== "model" || input.route.provider === null || input.route.modelId === null || input.route.tier === "no_model") throw new Error("AI_USAGE_EVENT_REQUIRES_PROVIDER_ATTEMPT");
  if (input.feature.capability !== input.route.capability) throw new Error("AI_USAGE_EVENT_CAPABILITY_ROUTE_MISMATCH");
  for (const value of [input.providerAttemptId, input.identity.userId, input.feature.requestId, input.feature.correlationId]) if (!value.trim()) throw new Error("AI_USAGE_EVENT_ID_REQUIRED");
  if (!isIsoInstant(input.execution.startedAt) || !isIsoInstant(input.execution.completedAt) || Date.parse(input.execution.completedAt) < Date.parse(input.execution.startedAt)) throw new Error("AI_USAGE_EXECUTION_TIME_INVALID");
  if (!Number.isInteger(input.execution.retryNumber) || input.execution.retryNumber < 0) throw new Error("AI_USAGE_RETRY_INVALID");
  if (input.execution.fallbackFromAttemptId === input.providerAttemptId) throw new Error("AI_USAGE_FALLBACK_SELF_REFERENCE");
  if ((input.execution.status === "succeeded") !== (input.execution.errorCategory === "none")) throw new Error("AI_USAGE_STATUS_ERROR_MISMATCH");
  const nativeCost = calculateAiNativeCostV1(input.route, input.usage, input.pricingCatalog, input.execution.completedAt);
  const tryCost = convertAiCostToTryV1(nativeCost, input.fxSnapshot, input.route.runtimeEnvironment);
  return deepFreeze({
    version: AI_USAGE_EVENT_V1_VERSION,
    providerAttemptId: input.providerAttemptId,
    userId: input.identity.userId,
    examProfileId: input.identity.examProfileId,
    capability: input.feature.capability,
    requestId: input.feature.requestId,
    correlationId: input.feature.correlationId,
    routeVersion: input.route.version,
    routeCatalogVersion: input.route.catalogVersion,
    provider: input.route.provider,
    modelId: input.route.modelId,
    tier: input.route.tier,
    routeReasonCode: input.route.reasonCode,
    pricingVersion: input.pricingCatalog.version,
    usage: structuredClone(input.usage),
    startedAt: input.execution.startedAt,
    completedAt: input.execution.completedAt,
    latencyMs: Date.parse(input.execution.completedAt) - Date.parse(input.execution.startedAt),
    status: input.execution.status,
    retryNumber: input.execution.retryNumber,
    fallbackFromAttemptId: input.execution.fallbackFromAttemptId,
    errorCategory: input.execution.errorCategory,
    nativeCost,
    tryCost,
    accountingMonth: aiAccountingMonthV1(input.execution.completedAt),
    privacy: { rawPromptStored: false, rawConversationStored: false, fullCoachContextStored: false },
  });
}

function budgetState(committedTry: number): AiBudgetStateV1 {
  const { watchStartsTry, constrainedStartsTry, hardLimitTry } = AI_MONTHLY_BUDGET_POLICY_V1.thresholds;
  if (committedTry >= hardLimitTry) return "hard_limit";
  if (committedTry >= constrainedStartsTry) return "constrained";
  if (committedTry >= watchStartsTry) return "watch";
  return "normal";
}

export function aggregateMonthlyAiUsageV1(input: {
  readonly userId: string;
  readonly examProfileId: string | null;
  readonly accountingMonth: string;
  readonly events: readonly AiUsageEventV1[];
  readonly reservations?: readonly AiCostReservationV1[];
}): AiMonthlyBudgetSummaryV1 {
  if (!/^\d{4}-\d{2}$/.test(input.accountingMonth)) throw new Error("AI_BUDGET_MONTH_INVALID");
  const scopedEvents = input.events.filter((item) => item.userId === input.userId && (input.examProfileId === null || item.examProfileId === input.examProfileId) && item.accountingMonth === input.accountingMonth);
  if (scopedEvents.some((event) => aiAccountingMonthV1(event.completedAt) !== event.accountingMonth)) throw new Error("AI_USAGE_ACCOUNTING_MONTH_MISMATCH");
  const unique = new Map<string, AiUsageEventV1>();
  let duplicateAttemptCount = 0;
  for (const event of scopedEvents) {
    const existing = unique.get(event.providerAttemptId);
    if (existing && JSON.stringify(existing) !== JSON.stringify(event)) throw new Error("AI_USAGE_ATTEMPT_CONFLICT");
    if (existing) duplicateAttemptCount += 1;
    else unique.set(event.providerAttemptId, event);
  }
  const values = [...unique.values()];
  const unpricedAttemptCount = values.filter((event) => event.tryCost.state !== "known").length;
  const activeReservations = (input.reservations ?? []).filter((item) => item.userId === input.userId && (input.examProfileId === null || item.examProfileId === input.examProfileId) && item.accountingMonth === input.accountingMonth && item.state === "active");
  if (activeReservations.some((item) => !Number.isFinite(item.tryAmount) || item.tryAmount < 0)) throw new Error("AI_BUDGET_RESERVATION_AMOUNT_INVALID");
  const reservedTry = round(activeReservations.reduce((sum, item) => sum + item.tryAmount, 0), 6);
  if (unpricedAttemptCount > 0) return deepFreeze({
    version: AI_MONTHLY_BUDGET_POLICY_V1_VERSION, scope: input.examProfileId === null ? "user" : "profile", userId: input.userId, examProfileId: input.examProfileId, accountingMonth: input.accountingMonth,
    availability: "unknown", unknownReason: "unpriced_usage_present", spentTry: null, reservedTry, committedTry: null, remainingTry: null,
    utilizationPercent: null, budgetState: null, uniqueAttemptCount: values.length, unpricedAttemptCount, duplicateAttemptCount,
    thresholds: AI_MONTHLY_BUDGET_POLICY_V1.thresholds,
  });
  const spentTry = round(values.reduce((sum, event) => sum + (event.tryCost.state === "known" ? event.tryCost.amount : 0), 0), 6);
  const committedTry = round(spentTry + reservedTry, 6);
  const hard = AI_MONTHLY_BUDGET_POLICY_V1.thresholds.hardLimitTry;
  return deepFreeze({
    version: AI_MONTHLY_BUDGET_POLICY_V1_VERSION, scope: input.examProfileId === null ? "user" : "profile", userId: input.userId, examProfileId: input.examProfileId, accountingMonth: input.accountingMonth,
    availability: "known", unknownReason: null, spentTry, reservedTry, committedTry, remainingTry: round(Math.max(0, hard - committedTry), 6),
    utilizationPercent: round(committedTry / hard * 100, 4), budgetState: budgetState(committedTry), uniqueAttemptCount: values.length,
    unpricedAttemptCount: 0, duplicateAttemptCount, thresholds: AI_MONTHLY_BUDGET_POLICY_V1.thresholds,
  });
}

export function preflightAiCostV1(input: {
  readonly route: AiModelRouteDecisionV1;
  readonly evidence: AiEvidenceEstimateV1;
  readonly pricingCatalog: AiPricingCatalogV1;
  readonly fxSnapshot: AiFxSnapshotV1 | null;
  readonly budget: AiMonthlyBudgetSummaryV1;
  readonly operationalOverheadTokens: number;
  readonly reservationIdentity: { readonly reservationId: string; readonly userId: string; readonly examProfileId: string | null; readonly expiresAt: string };
  readonly estimatedAt: string;
}): AiCostPreflightV1 {
  const { route, evidence, budget } = input;
  if (input.reservationIdentity.userId !== budget.userId || (budget.examProfileId !== null && input.reservationIdentity.examProfileId !== budget.examProfileId)) throw new Error("AI_COST_PREFLIGHT_SCOPE_MISMATCH");
  if (route.disposition !== "model") return deepFreeze({ version: AI_COST_PREFLIGHT_V1_VERSION, route, evidence, estimateKind: "upper_bound_not_actual_billing", estimatedUsage: { availability: "unavailable", inputTokens: null, cachedInputTokens: null, outputTokens: null, totalTokens: null, source: "provider_usage_unavailable" }, estimatedNativeCost: { state: "not_applicable", pricingVersion: route.pricingVersion, nativeAmount: 0, nativeCurrency: null, reason: "no_model_route" }, estimatedTryCost: { state: "not_applicable", amount: 0, currency: "TRY", reason: "no_model_route", fx: null }, allowed: false, reasonCode: "route_blocked", reservationProposal: null, reservationPersistence: "not_implemented_in_6b5", providerCallMade: false });
  if (!Number.isInteger(input.operationalOverheadTokens) || input.operationalOverheadTokens < 0) throw new Error("AI_PREFLIGHT_OVERHEAD_INVALID");
  const inputTokens = evidence.estimatedInputTokens + input.operationalOverheadTokens;
  const estimatedUsage: AiReportedUsageV1 = { availability: "reported", inputTokens, cachedInputTokens: 0, outputTokens: route.maxOutputTokens, totalTokens: inputTokens + route.maxOutputTokens, source: "provider_response" };
  const nativeCost = calculateAiNativeCostV1(route, estimatedUsage, input.pricingCatalog, input.estimatedAt);
  const tryCost = convertAiCostToTryV1(nativeCost, input.fxSnapshot, route.runtimeEnvironment);
  let reasonCode: AiCostPreflightV1["reasonCode"] = "within_budget";
  if (budget.availability === "unknown") reasonCode = "budget_unknown";
  else if (tryCost.state !== "known") reasonCode = "cost_unknown";
  else if (budget.budgetState === "hard_limit") reasonCode = "hard_limit";
  else if (tryCost.amount > budget.remainingTry!) reasonCode = "estimated_cost_exceeds_remaining";
  const allowed = reasonCode === "within_budget";
  const reservationProposal = allowed && tryCost.state === "known" ? {
    reservationId: input.reservationIdentity.reservationId,
    userId: input.reservationIdentity.userId,
    examProfileId: input.reservationIdentity.examProfileId,
    accountingMonth: budget.accountingMonth,
    tryAmount: tryCost.amount,
    state: "active" as const,
    expiresAt: input.reservationIdentity.expiresAt,
  } : null;
  return deepFreeze({ version: AI_COST_PREFLIGHT_V1_VERSION, route, evidence, estimateKind: "upper_bound_not_actual_billing", estimatedUsage, estimatedNativeCost: nativeCost, estimatedTryCost: tryCost, allowed, reasonCode, reservationProposal, reservationPersistence: "not_implemented_in_6b5", providerCallMade: false });
}
