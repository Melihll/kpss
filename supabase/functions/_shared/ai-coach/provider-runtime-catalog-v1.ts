import type {
  AiCoachCapabilityV1,
  AiModelTierV1,
  AiPricingCatalogV1,
  AiRouteCatalogV1,
} from "../../../../packages/domain/src/ai-coach/ai-economics-v1.ts";

import type {
  AiAuthoritativeConfigSourceV1,
} from "./provider-runtime-config-v1.ts";

export const AI_OPENAI_RUNTIME_CATALOG_V1_VERSION =
  "ai-openai-runtime-catalog-v1-2026-09-11" as const;

export const AI_OPENAI_PRICING_CATALOG_V1_VERSION =
  "ai-openai-pricing-v1-2026-09-11" as const;

/**
 * Production-shaped authoritative route/pricing candidate.
 *
 * IMPORTANT:
 * This does NOT make provider runtime eligible by itself.
 *
 * 6B.6A still requires:
 * - authoritative FX
 * - complete billable bounds
 * - provable complete-payload input bound
 * - server-side output/reasoning limits
 * - atomic reservation/orchestration
 *
 * No provider call may be authorized from this file alone.
 */

export const AI_OPENAI_ROUTE_SOURCE_V1: AiAuthoritativeConfigSourceV1 = {
  authority: "approved_server_config",
  sourceId:
    "https://developers.openai.com/api/docs/models/gpt-5.4-nano|https://developers.openai.com/api/docs/models/gpt-5.4-mini|https://developers.openai.com/api/docs/models/gpt-5.4",
  verificationId: "openai-model-docs-verified-2026-09-11",
  verifiedAt: "2026-09-11T19:30:00.000Z",
  loadedAt: "2026-09-11T19:30:00.000Z",
};

export const AI_OPENAI_PRICING_SOURCE_V1: AiAuthoritativeConfigSourceV1 = {
  authority: "approved_server_config",
  sourceId:
    "https://developers.openai.com/api/docs/models/gpt-5.4-nano|https://developers.openai.com/api/docs/models/gpt-5.4-mini|https://developers.openai.com/api/docs/models/gpt-5.4",
  verificationId: "openai-official-pricing-verified-2026-09-11",
  verifiedAt: "2026-09-11T19:30:00.000Z",
  loadedAt: "2026-09-11T19:30:00.000Z",
};

const RETRYABLE_PROVIDER_CATEGORIES = [
  "timeout",
  "rate_limit",
  "provider_unavailable",
] as const;

export const AI_OPENAI_ROUTE_CATALOG_V1 = {
  version: AI_OPENAI_RUNTIME_CATALOG_V1_VERSION,
  contractVersion: "ai-model-router-v1",
  effectiveFrom: "2026-09-11T00:00:00.000Z",
  pricingVersion: AI_OPENAI_PRICING_CATALOG_V1_VERSION,
  environment: "production",

  routes: [
    {
      tier: "economy",
      provider: "openai",
      modelId: "gpt-5.4-nano",

      // Product cap, intentionally far below model theoretical maximum.
      maxOutputTokens: 500,
      timeoutMs: 8_000,

      retryPolicy: {
        maxAttempts: 2,
        retryableCategories: RETRYABLE_PROVIDER_CATEGORIES,
      },

      fallbackTier: null,
    },

    {
      tier: "standard",
      provider: "openai",
      modelId: "gpt-5.4-mini",

      maxOutputTokens: 900,
      timeoutMs: 12_000,

      retryPolicy: {
        maxAttempts: 2,
        retryableCategories: RETRYABLE_PROVIDER_CATEGORIES,
      },

      fallbackTier: "economy",
    },

    {
      tier: "strong",
      provider: "openai",
      modelId: "gpt-5.4",

      maxOutputTokens: 1_400,
      timeoutMs: 18_000,

      retryPolicy: {
        maxAttempts: 2,
        retryableCategories: RETRYABLE_PROVIDER_CATEGORIES,
      },

      fallbackTier: "standard",
    },
  ],
} as const satisfies AiRouteCatalogV1;

export const AI_OPENAI_PRICING_CATALOG_V1 = {
  contractVersion: "ai-pricing-catalog-v1",
  version: AI_OPENAI_PRICING_CATALOG_V1_VERSION,
  effectiveFrom: "2026-09-11T00:00:00.000Z",
  environment: "production",

  entries: [
    {
      provider: "openai",
      modelId: "gpt-5.4-nano",
      effectiveFrom: "2026-09-11T00:00:00.000Z",
      effectiveTo: null,
      billingCurrency: "USD",
      inputPerMillionTokens: 0.20,
      cachedInputPerMillionTokens: 0.02,
      outputPerMillionTokens: 1.25,
      sourceKind: "authoritative_config",
    },

    {
      provider: "openai",
      modelId: "gpt-5.4-mini",
      effectiveFrom: "2026-09-11T00:00:00.000Z",
      effectiveTo: null,
      billingCurrency: "USD",
      inputPerMillionTokens: 0.75,
      cachedInputPerMillionTokens: 0.075,
      outputPerMillionTokens: 4.50,
      sourceKind: "authoritative_config",
    },

    {
      provider: "openai",
      modelId: "gpt-5.4",
      effectiveFrom: "2026-09-11T00:00:00.000Z",
      effectiveTo: null,
      billingCurrency: "USD",
      inputPerMillionTokens: 2.50,
      cachedInputPerMillionTokens: 0.25,
      outputPerMillionTokens: 15.00,
      sourceKind: "authoritative_config",
    },
  ],
} as const satisfies AiPricingCatalogV1;

export const AI_OPENAI_CAPABILITY_ROUTES_V1 = {
  deterministic_signal_evaluation: ["no_model"],

  intent_extraction: ["economy"],
  short_explanation: ["economy"],
  proactive_explanation: ["economy"],
  conversation_summary: ["economy"],

  today_analysis: ["standard", "strong"],
  subject_analysis: ["standard", "strong"],
  planner_explanation: ["standard", "strong"],

  week_analysis: ["standard", "strong"],
  complex_status_analysis: ["strong"],
} as const satisfies Readonly<
  Record<AiCoachCapabilityV1, readonly AiModelTierV1[]>
>;

/**
 * Route + pricing authority alone is insufficient.
 * FX + complete billing bounds are intentionally still missing.
 */
export const AI_OPENAI_RUNTIME_V1_PROVIDER_CALL_ELIGIBLE = false as const;