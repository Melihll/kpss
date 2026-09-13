import { describe, expect, it } from "vitest";
import {
  AI_FX_SNAPSHOT_V1_TEST_FIXTURE,
  AI_PRICING_CATALOG_V1_TEST_FIXTURE,
  AI_ROUTE_CATALOG_V1_TEST_FIXTURE,
  estimateAiEvidenceV1,
  type AiCoachCapabilityV1,
  type AiModelTierV1,
} from "../ai-coach.bundle.js";
import {
  AI_PROVIDER_BILLABLE_BOUND_V1_VERSION,
  AI_PROVIDER_RUNTIME_CONFIG_V1_VERSION,
  authorizeProductionProviderCostMaximumV1,
  resolveProductionAiRuntimeConfigV1,
  routeProductionAiCapabilityV1,
  type AiProductionRuntimeConfigCandidateV1,
} from "./provider-runtime-config-v1.ts";

const NOW = "2026-09-11T12:00:00.000Z";
const MODEL_CAPABILITIES: readonly AiCoachCapabilityV1[] = [
  "intent_extraction", "short_explanation", "today_analysis", "week_analysis", "subject_analysis",
  "planner_explanation", "proactive_explanation", "conversation_summary", "complex_status_analysis",
];

function candidate(): AiProductionRuntimeConfigCandidateV1 {
  const capabilityRoutes = Object.fromEntries([
    ["deterministic_signal_evaluation", ["no_model"]],
    ...MODEL_CAPABILITIES.map((capability) => [capability, ["economy", "standard", "strong"]]),
  ]) as Record<AiCoachCapabilityV1, readonly AiModelTierV1[]>;
  const source = { authority: "approved_server_config" as const, sourceId: "test-only-authoritative-source", verificationId: "test-approval", verifiedAt: "2026-09-10T08:00:00.000Z", loadedAt: "2026-09-10T09:00:00.000Z" };
  const routeCatalog = { ...AI_ROUTE_CATALOG_V1_TEST_FIXTURE, version: "test-production-route-v1", environment: "production" as const, pricingVersion: "test-production-pricing-v1" };
  return {
    version: AI_PROVIDER_RUNTIME_CONFIG_V1_VERSION,
    environment: "production",
    routeCatalog,
    routeSource: source,
    pricingCatalog: {
      ...AI_PRICING_CATALOG_V1_TEST_FIXTURE,
      version: "test-production-pricing-v1",
      environment: "production",
      entries: AI_PRICING_CATALOG_V1_TEST_FIXTURE.entries.map((entry) => ({ ...entry, sourceKind: "authoritative_config" as const })),
    },
    pricingSource: source,
    fxSnapshot: { ...AI_FX_SNAPSHOT_V1_TEST_FIXTURE, sourceKind: "authoritative_config", source: "test-only-approved-fx", effectiveAt: "2026-09-11T00:00:00.000Z", loadedAt: "2026-09-11T00:05:00.000Z", maxAgeSeconds: 86_400 },
    capabilityRoutes,
    billingBounds: routeCatalog.routes.map((route) => ({
      version: AI_PROVIDER_BILLABLE_BOUND_V1_VERSION,
      tier: route.tier,
      provider: route.provider,
      modelId: route.modelId,
      pricingVersion: routeCatalog.pricingVersion,
      effectiveFrom: routeCatalog.effectiveFrom,
      source,
      inputTokenUpperBound: 50_000,
      outputTokenUpperBound: route.maxOutputTokens,
      requestFingerprint: `sha256:test-${route.tier}`,
      inputBoundMethod: "approved_static_test_bound",
      inputCountVersion: "test-input-count-v1",
      inputCountBillingTreatment: "documented_no_charge",
      requestPayloadCoverage: "complete",
      inputBoundEnforcement: "server_rejects_above_bound",
      providerOutputLimitEnforced: true,
      reasoningTokensPricedAs: "output",
      endpointClass: "global_standard",
      serviceTier: "default",
      cacheWriteBillingTreatment: "documented_no_additional_charge",
      coveredBillableTokenClasses: ["input", "cached_input", "output", "reasoning_output"],
      uncoveredBillableTokenClasses: [],
    })),
  };
}

describe("6B.6A production provider runtime configuration boundary", () => {
  it("is explicitly unavailable when no authoritative server configuration exists", () => {
    expect(resolveProductionAiRuntimeConfigV1(null, NOW)).toEqual({ version: AI_PROVIDER_RUNTIME_CONFIG_V1_VERSION, availability: "unavailable", evaluatedAt: NOW, reason: "production_config_missing", config: null });
  });

  it("rejects test fixture catalogs as production authority", () => {
    expect(resolveProductionAiRuntimeConfigV1({ ...candidate(), routeCatalog: AI_ROUTE_CATALOG_V1_TEST_FIXTURE }, NOW)).toMatchObject({ availability: "unavailable", reason: "production_route_catalog_unavailable" });
    expect(resolveProductionAiRuntimeConfigV1({ ...candidate(), pricingCatalog: AI_PRICING_CATALOG_V1_TEST_FIXTURE }, NOW)).toMatchObject({ availability: "unavailable", reason: "production_pricing_unavailable" });
    expect(resolveProductionAiRuntimeConfigV1({ ...candidate(), fxSnapshot: AI_FX_SNAPSHOT_V1_TEST_FIXTURE }, NOW)).toMatchObject({ availability: "unavailable", reason: "production_fx_source_unverified" });
  });

  it("fails closed when the authoritative FX snapshot is stale", () => {
    expect(resolveProductionAiRuntimeConfigV1({ ...candidate(), fxSnapshot: { ...candidate().fxSnapshot, effectiveAt: "2026-09-01T00:00:00.000Z", loadedAt: "2026-09-01T00:01:00.000Z", maxAgeSeconds: 86_400 } }, NOW)).toMatchObject({ availability: "unavailable", reason: "production_fx_stale" });
  });

  it("fails closed when any billable token class lacks an enforced upper bound", () => {
    expect(resolveProductionAiRuntimeConfigV1({ ...candidate(), billingBounds: [] }, NOW)).toMatchObject({ availability: "unavailable", reason: "production_billing_bound_unavailable" });
    const base = candidate();
    expect(resolveProductionAiRuntimeConfigV1({ ...base, billingBounds: base.billingBounds.map((bound, index) => index === 0 ? { ...bound, uncoveredBillableTokenClasses: ["tool_tokens"] } : bound) }, NOW)).toMatchObject({ availability: "unavailable", reason: "production_billing_bound_unavailable" });
  });

  it("resolves an injected authoritative configuration and enforces capability route allowlists", () => {
    const resolved = resolveProductionAiRuntimeConfigV1(candidate(), NOW);
    expect(resolved).toMatchObject({ availability: "available" });
    const route = routeProductionAiCapabilityV1({ capability: "today_analysis", evidence: estimateAiEvidenceV1(10_000), expectedResponse: "medium", budgetState: "normal" }, resolved);
    expect(route).toMatchObject({ runtimeEnvironment: "production", disposition: "model", tier: "standard", provider: "fixture-provider" });
    expect(authorizeProductionProviderCostMaximumV1(route, resolved)).toMatchObject({ authority: "production_runtime_config", runtimeEnvironment: "production", provider: route.provider, modelId: route.modelId, modelTier: route.tier, inputTokenUpperBound: 50_000, outputTokenUpperBound: 900 });

    const base = candidate();
    const denied: AiProductionRuntimeConfigCandidateV1 = { ...base, capabilityRoutes: { ...base.capabilityRoutes, today_analysis: ["economy"] } };
    expect(() => routeProductionAiCapabilityV1({ capability: "today_analysis", evidence: estimateAiEvidenceV1(10_000), expectedResponse: "medium", budgetState: "normal" }, resolveProductionAiRuntimeConfigV1(denied, NOW))).toThrow("AI_PRODUCTION_CAPABILITY_ROUTE_UNAVAILABLE");
  });
});
