import type {
  AiModelRouteDecisionV1,
  AiModelTierV1,
} from "../../../../packages/domain/src/ai-coach/ai-economics-v1.ts";

import {
  AI_PROVIDER_BILLABLE_BOUND_V1_VERSION,
  type AiAuthoritativeConfigSourceV1,
  type AiProviderBillableBoundV1,
} from "./provider-runtime-config-v1.ts";

import {
  AI_OPENAI_INPUT_TOKEN_COUNT_V1_VERSION,
  assertOpenAiInputCountMatchesProviderRequestV1,
  type AiOpenAiCompleteRequestIdentityV1,
  type AiOpenAiInputTokenCountResultV1,
} from "./openai-input-token-count-v1.ts";

import {
  AI_OPENAI_PRICING_CATALOG_V1_VERSION,
  AI_OPENAI_ROUTE_CATALOG_V1,
  AI_OPENAI_RUNTIME_CATALOG_V1_VERSION,
} from "./provider-runtime-catalog-v1.ts";

export const AI_OPENAI_BILLING_BOUND_POLICY_V1_VERSION =
  "ai-openai-billing-bound-policy-v1" as const;

/**
 * Official model context windows.
 *
 * Product output caps remain much smaller than the provider model maximums.
 * The complete input bound must include the ENTIRE payload presented to the
 * provider tokenizer, not only Coach evidence text.
 */
export const AI_OPENAI_CONTEXT_WINDOWS_V1 = Object.freeze({
  "gpt-5.4-nano-2026-03-17": 400_000,
  "gpt-5.4-mini-2026-03-17": 400_000,
  "gpt-5.4-2026-03-05": 1_050_000,
} as const);

/** Keep every selected route below GPT-5.4's >272K long-context price tier. */
export const AI_OPENAI_COACH_INPUT_TOKEN_LIMIT_V1 = 200_000 as const;

/**
 * Static production requests must remain materially smaller than the
 * conservative token ceiling.
 *
 * JSON byte size is evaluated over the exact generation request body by the
 * server-owned caller. The 100 KB byte ceiling leaves a large margin below the
 * 200K token reservation ceiling while retaining the existing bounded Coach
 * evidence/conversation contract.
 */
export const AI_OPENAI_STATIC_PRODUCTION_REQUEST_BYTE_LIMIT_V1 =
  100_000 as const;

export const AI_OPENAI_STATIC_PRODUCTION_BOUND_V1_VERSION =
  "ai-openai-static-production-bound-v1" as const;

/**
 * Responses API max_output_tokens covers visible output + reasoning tokens.
 *
 * Therefore one enforced product-level max_output_tokens value bounds both
 * output classes together for these text-only Coach routes.
 */
export const AI_OPENAI_OUTPUT_BOUND_SEMANTICS_V1 = Object.freeze({
  provider: "openai" as const,
  api: "responses" as const,
  maxOutputTokensIncludesVisibleOutput: true as const,
  maxOutputTokensIncludesReasoning: true as const,
  reasoningUsageNestedUnderOutputTokens: true as const,
  reasoningTokensPricedAs: "output" as const,
});

/**
 * Proof required before a production billing bound may be produced.
 *
 * No such proof is shipped by default in this phase.
 */
export interface AiOpenAiInputTokenBoundProofV1 {
  readonly authority: "approved_server_config" | "test_fixture";

  readonly routeCatalogVersion: string;

  readonly pricingVersion:
    typeof AI_OPENAI_PRICING_CATALOG_V1_VERSION;

  readonly provider: "openai";
  readonly modelId:
    | "gpt-5.4-nano-2026-03-17"
    | "gpt-5.4-mini-2026-03-17"
    | "gpt-5.4-2026-03-05";

  /**
   * Must cover the complete serialized provider request payload:
   * instructions, evidence, signals, schema/tool metadata and all other
   * billable provider input.
   */
  readonly requestPayloadCoverage: "complete";

  readonly tokenBoundMethod:
    "openai_responses_input_tokens_exact";

  readonly enforcement:
    "server_rejects_above_bound";

  readonly request: AiOpenAiCompleteRequestIdentityV1;
  readonly count: AiOpenAiInputTokenCountResultV1;

  readonly source: AiAuthoritativeConfigSourceV1;
}

function isIsoInstant(value: string): boolean {
  return value.includes("T") && Number.isFinite(Date.parse(value));
}

function sourceIsApproved(
  source: AiAuthoritativeConfigSourceV1,
  evaluatedAt: string,
): boolean {
  return source.authority === "approved_server_config"
    && Boolean(source.sourceId.trim())
    && Boolean(source.verificationId.trim())
    && isIsoInstant(source.verifiedAt)
    && isIsoInstant(source.loadedAt)
    && Date.parse(source.verifiedAt) <= Date.parse(source.loadedAt)
    && Date.parse(source.loadedAt) <= Date.parse(evaluatedAt);
}


export interface AiOpenAiStaticProductionBoundInputV1 {
  readonly requestFingerprint: string;
  readonly modelId: string;
  readonly serializedProviderRequestBytes: number;
  readonly source: AiAuthoritativeConfigSourceV1;
}

/**
 * Builds a production-cost upper bound without calling
 * POST /responses/input_tokens.
 *
 * The input-token reservation is deliberately the full Coach product ceiling
 * (200K), not an estimate derived from the request.
 *
 * The request itself must first satisfy a strict server-side serialized byte
 * bound. This keeps the generation request far below both the product token
 * ceiling and each selected model context window.
 */
export function createOpenAiStaticProductionBillingBoundV1(
  tier: Exclude<AiModelTierV1, "no_model">,
  input: AiOpenAiStaticProductionBoundInputV1,
  evaluatedAt: string,
): AiProviderBillableBoundV1 {
  if (!isIsoInstant(evaluatedAt)) {
    throw new Error(
      "AI_OPENAI_STATIC_BOUND_EVALUATED_AT_INVALID",
    );
  }

  const route =
    AI_OPENAI_ROUTE_CATALOG_V1.routes.find(
      (item) =>
        item.tier === tier
        && item.provider === "openai",
    );

  if (!route) {
    throw new Error(
      "AI_OPENAI_STATIC_BOUND_ROUTE_UNAVAILABLE",
    );
  }

  if (
    input.modelId !== route.modelId
    || !input.requestFingerprint.trim()
  ) {
    throw new Error(
      "AI_OPENAI_STATIC_BOUND_REQUEST_IDENTITY_INVALID",
    );
  }

  if (
    !Number.isInteger(
      input.serializedProviderRequestBytes,
    )
    || input.serializedProviderRequestBytes <= 0
    || input.serializedProviderRequestBytes
      > AI_OPENAI_STATIC_PRODUCTION_REQUEST_BYTE_LIMIT_V1
  ) {
    throw new Error(
      "AI_OPENAI_STATIC_BOUND_REQUEST_TOO_LARGE",
    );
  }

  if (
    !sourceIsApproved(
      input.source,
      evaluatedAt,
    )
  ) {
    throw new Error(
      "AI_OPENAI_STATIC_BOUND_SOURCE_INVALID",
    );
  }

  const contextWindow =
    AI_OPENAI_CONTEXT_WINDOWS_V1[
      route.modelId as keyof typeof AI_OPENAI_CONTEXT_WINDOWS_V1
    ];

  if (
    !contextWindow
    || AI_OPENAI_COACH_INPUT_TOKEN_LIMIT_V1
      + route.maxOutputTokens
      > contextWindow
  ) {
    throw new Error(
      "AI_OPENAI_STATIC_BOUND_CONTEXT_EXCEEDED",
    );
  }

  return Object.freeze({
    version:
      AI_PROVIDER_BILLABLE_BOUND_V1_VERSION,

    tier:
      route.tier,

    provider:
      "openai",

    modelId:
      route.modelId,

    pricingVersion:
      AI_OPENAI_PRICING_CATALOG_V1_VERSION,

    effectiveFrom:
      input.source.verifiedAt,

    source:
      input.source,

    /*
     * Reserve the full product input ceiling.
     * No count-endpoint result participates in production accounting.
     */
    inputTokenUpperBound:
      AI_OPENAI_COACH_INPUT_TOKEN_LIMIT_V1,

    outputTokenUpperBound:
      route.maxOutputTokens,

    requestFingerprint:
      input.requestFingerprint,

    inputBoundMethod:
      "approved_static_production_bound",

    inputCountVersion:
      AI_OPENAI_STATIC_PRODUCTION_BOUND_V1_VERSION,

    inputCountBillingTreatment:
      "not_applicable_static_bound",

    requestPayloadCoverage:
      "complete",

    inputBoundEnforcement:
      "server_rejects_above_bound",

    providerOutputLimitEnforced:
      true,

    reasoningTokensPricedAs:
      "output",

    endpointClass:
      "global_standard",

    serviceTier:
      "default",

    cacheWriteBillingTreatment:
      "documented_no_additional_charge",

    coveredBillableTokenClasses: [
      "input",
      "cached_input",
      "output",
      "reasoning_output",
    ] as const,

    uncoveredBillableTokenClasses:
      [] as const,
  });
}


export function createOpenAiProductionBillingBoundV1(
  tier: Exclude<AiModelTierV1, "no_model">,
  proof: AiOpenAiInputTokenBoundProofV1,
  evaluatedAt: string,
): AiProviderBillableBoundV1 {
  if (!isIsoInstant(evaluatedAt)) {
    throw new Error("AI_OPENAI_BOUND_EVALUATED_AT_INVALID");
  }

  const routeEntry = AI_OPENAI_ROUTE_CATALOG_V1.routes.find(
    (candidate) => candidate.tier === tier,
  );

  if (!routeEntry) {
    throw new Error("AI_OPENAI_BOUND_ROUTE_UNAVAILABLE");
  }
  const route = {
    runtimeEnvironment: "production",
    disposition: "model",
    tier: routeEntry.tier,
    provider: routeEntry.provider,
    modelId: routeEntry.modelId,
    catalogVersion: AI_OPENAI_RUNTIME_CATALOG_V1_VERSION,
    pricingVersion: AI_OPENAI_PRICING_CATALOG_V1_VERSION,
    maxOutputTokens: routeEntry.maxOutputTokens,
  } as unknown as AiModelRouteDecisionV1;
  return createOpenAiRequestBillingBoundV1(route, proof, evaluatedAt);
}

export function createOpenAiRequestBillingBoundV1(
  route: AiModelRouteDecisionV1,
  proof: AiOpenAiInputTokenBoundProofV1,
  evaluatedAt: string,
): AiProviderBillableBoundV1 {
  if (!isIsoInstant(evaluatedAt)) throw new Error("AI_OPENAI_BOUND_EVALUATED_AT_INVALID");
  if (
    route.disposition !== "model" || route.provider !== "openai" || route.modelId === null || route.tier === "no_model"
  ) throw new Error("AI_OPENAI_BOUND_ROUTE_UNAVAILABLE");

  if (
    (proof.authority !== "approved_server_config" && proof.authority !== "test_fixture")
    || proof.routeCatalogVersion !== route.catalogVersion
    || proof.pricingVersion !== route.pricingVersion
    || proof.provider !== "openai"
    || proof.modelId !== route.modelId
    || proof.requestPayloadCoverage !== "complete"
    || proof.tokenBoundMethod !==
      "openai_responses_input_tokens_exact"
    || proof.enforcement !== "server_rejects_above_bound"
    || !sourceIsApproved(proof.source, evaluatedAt)
    || proof.request.modelId !== route.modelId
    || proof.count.version !== AI_OPENAI_INPUT_TOKEN_COUNT_V1_VERSION
  ) {
    throw new Error("AI_OPENAI_INPUT_BOUND_PROOF_INVALID");
  }

  if (
    proof.authority === "approved_server_config"
    && proof.count.billingTreatment !== "production_billing_status_unverified"
  ) {
    throw new Error("AI_OPENAI_INPUT_COUNT_AUTHORITY_INVALID");
  }

  if (
    proof.authority === "test_fixture"
    && (proof.count.authority !== "test_fixture" || proof.count.billingTreatment !== "test_fixture_no_charge")
  ) throw new Error("AI_OPENAI_INPUT_COUNT_AUTHORITY_INVALID");

  const exactInputTokens = assertOpenAiInputCountMatchesProviderRequestV1(
    proof.count,
    proof.request,
  );
  if (exactInputTokens <= 0 || exactInputTokens > AI_OPENAI_COACH_INPUT_TOKEN_LIMIT_V1) {
    throw new Error("AI_OPENAI_INPUT_BOUND_INVALID");
  }

  const contextWindow =
    AI_OPENAI_CONTEXT_WINDOWS_V1[route.modelId as keyof typeof AI_OPENAI_CONTEXT_WINDOWS_V1];

  if (
    !contextWindow
    || exactInputTokens + route.maxOutputTokens > contextWindow
  ) {
    throw new Error("AI_OPENAI_CONTEXT_BOUND_EXCEEDED");
  }

  return Object.freeze({
    version: AI_PROVIDER_BILLABLE_BOUND_V1_VERSION,
    tier: route.tier,
    provider: "openai",
    modelId: route.modelId,
    pricingVersion: route.pricingVersion,
    effectiveFrom: proof.source.verifiedAt,
    source: proof.source,

    inputTokenUpperBound: exactInputTokens,
    outputTokenUpperBound: route.maxOutputTokens,
    requestFingerprint: proof.request.requestFingerprint,
    inputBoundMethod: "openai_responses_input_tokens_exact",
    inputCountVersion: proof.count.version,
    inputCountBillingTreatment: proof.authority === "test_fixture" ? "test_fixture_no_charge" : "unresolved",

    requestPayloadCoverage: "complete",
    inputBoundEnforcement: "server_rejects_above_bound",
    providerOutputLimitEnforced: true,

    reasoningTokensPricedAs: "output",
    endpointClass: proof.authority === "test_fixture" ? "test_fixture" : "global_standard",
    serviceTier: proof.authority === "test_fixture" ? "test_fixture" : "default",
    cacheWriteBillingTreatment: proof.authority === "test_fixture" ? "test_fixture" : "documented_no_additional_charge",

    coveredBillableTokenClasses: ["input", "cached_input", "output", "reasoning_output"] as const,
    uncoveredBillableTokenClasses: [] as const,
  });
}

/**
 * Deliberately empty.
 *
 * Authoritative route/pricing and FX policy exist, but no approved complete
 * payload tokenizer/input-bound proof has been committed yet.
 *
 * Therefore production runtime remains fail-closed.
 */
export const AI_OPENAI_PRODUCTION_BILLING_BOUNDS_V1 =
  Object.freeze([]) as readonly AiProviderBillableBoundV1[];

export const AI_OPENAI_PRODUCTION_INPUT_BOUND_PROVEN_V1 = false as const;
