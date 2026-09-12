import { describe, expect, it } from "vitest";

import {
  AI_FX_POLICY_V1_VERSION,
  estimateAiEvidenceV1,
  routeAiCapabilityV1,
  type AiFxSnapshotV1,
  type AiPricingCatalogV1,
  type AiRouteCatalogV1,
} from "../../../../packages/domain/src/ai-coach/ai-economics-v1.ts";

import {
  AI_OPENAI_PRICING_CATALOG_V1,
  AI_OPENAI_ROUTE_CATALOG_V1,
} from "./provider-runtime-catalog-v1.ts";

import {
  AI_PROVIDER_BILLABLE_BOUND_V1_VERSION,
  authorizeControlledDevObservedProviderCostV1,
  type AiProviderBillableBoundV1,
} from "./provider-runtime-config-v1.ts";

import {
  AI_PROVIDER_RUNTIME_SERVER_KEYS_V1,
  resolveAiProviderRuntimeActivationV1,
} from "./provider-runtime-activation-v1.ts";

const AT = "2026-09-12T09:00:00.000Z";
const USER_ID = "controlled-dev-user";
const PROFILE_ID = "controlled-dev-profile";

const LOCAL_ROUTES: AiRouteCatalogV1 = {
  ...AI_OPENAI_ROUTE_CATALOG_V1,
  version: "openai-controlled-dev-route-v1",
  environment: "local",
};

const LOCAL_PRICING: AiPricingCatalogV1 = {
  ...AI_OPENAI_PRICING_CATALOG_V1,
  environment: "local",
  entries: AI_OPENAI_PRICING_CATALOG_V1.entries.map((entry) => ({
    ...entry,
    sourceKind: "authoritative_config" as const,
  })),
};

const LOCAL_FX: AiFxSnapshotV1 = {
  policyVersion: AI_FX_POLICY_V1_VERSION,
  snapshotVersion: "usd-try-controlled-dev-2026-09-12",
  source: "tcmb-controlled-dev-test-authority",
  sourceKind: "authoritative_config",
  baseCurrency: "USD",
  quoteCurrency: "TRY",
  rate: 40,
  effectiveAt: "2026-09-12T00:00:00.000Z",
  loadedAt: "2026-09-12T08:30:00.000Z",
  maxAgeSeconds: 96 * 60 * 60,
};

function activation() {
  const keys = AI_PROVIDER_RUNTIME_SERVER_KEYS_V1;

  const result = resolveAiProviderRuntimeActivationV1({
    deploymentEnvironment: "local_dev",
    serverConfig: {
      [keys.enabled]: "true",
      [keys.environment]: "local_dev",
      [keys.scope]: "one_controlled_dev_smoke_v1",
      [keys.allowedUserId]: USER_ID,
      [keys.allowedProfileId]: PROFILE_ID,
      [keys.acceptUnresolvedCountBillingRisk]: "true",
    },
    userId: USER_ID,
    examProfileId: PROFILE_ID,
  });

  if (result.availability !== "available") {
    throw new Error(`activation unavailable: ${result.reason}`);
  }

  return result;
}

function fixture() {
  const route = routeAiCapabilityV1({
    runtimeEnvironment: "local",
    capability: "today_analysis",
    evidence: estimateAiEvidenceV1(4_000),
    expectedResponse: "medium",
    complexity: "medium",
    budgetState: "normal",
  }, LOCAL_ROUTES);

  if (
    route.disposition !== "model"
    || route.provider === null
    || route.modelId === null
    || route.tier === "no_model"
  ) {
    throw new Error("expected model route");
  }

  const source = {
    authority: "approved_server_config" as const,
    sourceId: "controlled-dev-test-source",
    verificationId: "controlled-dev-cost-test-v1",
    verifiedAt: "2026-09-12T08:00:00.000Z",
    loadedAt: "2026-09-12T08:05:00.000Z",
  };

  const bound: AiProviderBillableBoundV1 = {
    version: AI_PROVIDER_BILLABLE_BOUND_V1_VERSION,
    tier: route.tier,
    provider: route.provider,
    modelId: route.modelId,
    pricingVersion: route.pricingVersion,
    effectiveFrom: source.verifiedAt,
    source,

    inputTokenUpperBound: 1_000,
    outputTokenUpperBound: route.maxOutputTokens,
    requestFingerprint: "sha256:controlled-dev-test",
    inputBoundMethod: "openai_responses_input_tokens_exact",
    inputCountVersion: "ai-openai-input-token-count-v1",
    inputCountBillingTreatment: "unresolved",

    requestPayloadCoverage: "complete",
    inputBoundEnforcement: "server_rejects_above_bound",
    providerOutputLimitEnforced: true,

    reasoningTokensPricedAs: "output",
    endpointClass: "global_standard",
    serviceTier: "default",
    cacheWriteBillingTreatment: "documented_no_additional_charge",

    coveredBillableTokenClasses: [
      "input",
      "cached_input",
      "output",
      "reasoning_output",
    ],
    uncoveredBillableTokenClasses: [],
  };

  return {
    route,
    bound,
    pricingCatalog: LOCAL_PRICING,
    fxSnapshot: LOCAL_FX,
    activation: activation(),
    evaluatedAt: AT,
    userId: USER_ID,
    examProfileId: PROFILE_ID,
  };
}

describe("6B.6B.2 controlled DEV observed-cost authorization", () => {
  it("authorizes the exact local DEV unresolved-count path", () => {
    const result = authorizeControlledDevObservedProviderCostV1(fixture());

    expect(result).toMatchObject({
      authority: "controlled_dev_runtime",
      runtimeEnvironment: "local",
      inputTokenUpperBound: 1_000,
    });

    expect(result.tryMaximum).toBeGreaterThan(0);
    expect(result.tryMaximum).toBeLessThanOrEqual(300);
  });

  it("rejects identity that does not match the activation allowlist", () => {
    expect(() =>
      authorizeControlledDevObservedProviderCostV1({
        ...fixture(),
        userId: "other-user",
      })
    ).toThrow("AI_CONTROLLED_DEV_ACTIVATION_INVALID");
  });

  it("rejects production even when a DEV activation object exists", () => {
    const base = fixture();

    expect(() =>
      authorizeControlledDevObservedProviderCostV1({
        ...base,
        route: {
          ...base.route,
          runtimeEnvironment: "production",
          catalogEnvironment: "production",
        },
      })
    ).toThrow("AI_CONTROLLED_DEV_COST_BOUND_INVALID");
  });

  it("rejects test-fixture pricing authority", () => {
    const base = fixture();

    expect(() =>
      authorizeControlledDevObservedProviderCostV1({
        ...base,
        pricingCatalog: {
          ...base.pricingCatalog,
          environment: "test_fixture",
          entries: base.pricingCatalog.entries.map((entry) => ({
            ...entry,
            sourceKind: "test_fixture" as const,
          })),
        },
      })
    ).toThrow("AI_CONTROLLED_DEV_COST_BOUND_INVALID");
  });

  it("rejects test-fixture FX authority", () => {
    const base = fixture();

    expect(() =>
      authorizeControlledDevObservedProviderCostV1({
        ...base,
        fxSnapshot: {
          ...base.fxSnapshot,
          sourceKind: "test_fixture",
        },
      })
    ).toThrow("AI_CONTROLLED_DEV_FX_UNAVAILABLE");
  });

  it("rejects any attempt to relabel unresolved input-count billing as fixture/no-charge", () => {
    const base = fixture();

    expect(() =>
      authorizeControlledDevObservedProviderCostV1({
        ...base,
        bound: {
          ...base.bound,
          inputCountBillingTreatment: "test_fixture_no_charge",
        },
      })
    ).toThrow("AI_CONTROLLED_DEV_COST_BOUND_INVALID");
  });
});