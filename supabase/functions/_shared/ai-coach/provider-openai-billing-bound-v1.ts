import type {
  AiModelTierV1,
} from "../../../../packages/domain/src/ai-coach/ai-economics-v1.ts";

import {
  AI_PROVIDER_BILLABLE_BOUND_V1_VERSION,
  type AiAuthoritativeConfigSourceV1,
  type AiProviderBillableBoundV1,
} from "./provider-runtime-config-v1.ts";

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
  "gpt-5.4-nano": 400_000,
  "gpt-5.4-mini": 400_000,
  "gpt-5.4": 1_050_000,
} as const);

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
  readonly authority: "approved_server_config";

  readonly routeCatalogVersion:
    typeof AI_OPENAI_RUNTIME_CATALOG_V1_VERSION;

  readonly pricingVersion:
    typeof AI_OPENAI_PRICING_CATALOG_V1_VERSION;

  readonly provider: "openai";
  readonly modelId:
    | "gpt-5.4-nano"
    | "gpt-5.4-mini"
    | "gpt-5.4";

  /**
   * Must cover the complete serialized provider request payload:
   * instructions, evidence, signals, schema/tool metadata and all other
   * billable provider input.
   */
  readonly requestPayloadCoverage: "complete";

  readonly tokenBoundMethod:
    "provider_compatible_complete_payload_tokenizer";

  readonly enforcement:
    "server_rejects_above_bound";

  readonly inputTokenUpperBound: number;

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

export function createOpenAiProductionBillingBoundV1(
  tier: Exclude<AiModelTierV1, "no_model">,
  proof: AiOpenAiInputTokenBoundProofV1,
  evaluatedAt: string,
): AiProviderBillableBoundV1 {
  if (!isIsoInstant(evaluatedAt)) {
    throw new Error("AI_OPENAI_BOUND_EVALUATED_AT_INVALID");
  }

  const route = AI_OPENAI_ROUTE_CATALOG_V1.routes.find(
    (candidate) => candidate.tier === tier,
  );

  if (!route) {
    throw new Error("AI_OPENAI_BOUND_ROUTE_UNAVAILABLE");
  }

  if (
    proof.authority !== "approved_server_config"
    || proof.routeCatalogVersion !== AI_OPENAI_RUNTIME_CATALOG_V1_VERSION
    || proof.pricingVersion !== AI_OPENAI_PRICING_CATALOG_V1_VERSION
    || proof.provider !== "openai"
    || proof.modelId !== route.modelId
    || proof.requestPayloadCoverage !== "complete"
    || proof.tokenBoundMethod !==
      "provider_compatible_complete_payload_tokenizer"
    || proof.enforcement !== "server_rejects_above_bound"
    || !sourceIsApproved(proof.source, evaluatedAt)
  ) {
    throw new Error("AI_OPENAI_INPUT_BOUND_PROOF_INVALID");
  }

  if (
    !Number.isInteger(proof.inputTokenUpperBound)
    || proof.inputTokenUpperBound <= 0
  ) {
    throw new Error("AI_OPENAI_INPUT_BOUND_INVALID");
  }

  const contextWindow =
    AI_OPENAI_CONTEXT_WINDOWS_V1[
      route.modelId as keyof typeof AI_OPENAI_CONTEXT_WINDOWS_V1
    ];

  if (
    !contextWindow
    || proof.inputTokenUpperBound + route.maxOutputTokens > contextWindow
  ) {
    throw new Error("AI_OPENAI_CONTEXT_BOUND_EXCEEDED");
  }

  return Object.freeze({
    version: AI_PROVIDER_BILLABLE_BOUND_V1_VERSION,
    tier,
    provider: "openai",
    modelId: route.modelId,
    pricingVersion: AI_OPENAI_PRICING_CATALOG_V1_VERSION,
    effectiveFrom: proof.source.verifiedAt,
    source: proof.source,

    inputTokenUpperBound: proof.inputTokenUpperBound,
    outputTokenUpperBound: route.maxOutputTokens,

    requestPayloadCoverage: "complete",
    inputBoundEnforcement: "server_rejects_above_bound",
    providerOutputLimitEnforced: true,

    reasoningTokensPricedAs: "output",

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