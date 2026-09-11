import { describe, expect, it } from "vitest";

import {
  estimateAiEvidenceV1,
  routeAiCapabilityV1,
} from "../../../../packages/domain/src/ai-coach/ai-economics-v1.ts";

import {
  resolveProductionAiRuntimeConfigV1,
} from "./provider-runtime-config-v1.ts";

import {
  AI_OPENAI_CAPABILITY_ROUTES_V1,
  AI_OPENAI_PRICING_CATALOG_V1,
  AI_OPENAI_PRICING_SOURCE_V1,
  AI_OPENAI_ROUTE_CATALOG_V1,
  AI_OPENAI_ROUTE_SOURCE_V1,
  AI_OPENAI_RUNTIME_V1_PROVIDER_CALL_ELIGIBLE,
} from "./provider-runtime-catalog-v1.ts";

describe("OpenAI production runtime catalog V1", () => {
  it("uses the expected three production routes", () => {
    expect(AI_OPENAI_ROUTE_CATALOG_V1.environment).toBe("production");
    expect(AI_OPENAI_ROUTE_CATALOG_V1.routes).toHaveLength(3);

    expect(
      AI_OPENAI_ROUTE_CATALOG_V1.routes.map((route) => ({
        tier: route.tier,
        provider: route.provider,
        modelId: route.modelId,
        maxOutputTokens: route.maxOutputTokens,
      })),
    ).toEqual([
      {
        tier: "economy",
        provider: "openai",
        modelId: "gpt-5.4-nano",
        maxOutputTokens: 500,
      },
      {
        tier: "standard",
        provider: "openai",
        modelId: "gpt-5.4-mini",
        maxOutputTokens: 900,
      },
      {
        tier: "strong",
        provider: "openai",
        modelId: "gpt-5.4",
        maxOutputTokens: 1400,
      },
    ]);
  });

  it("contains authoritative production pricing", () => {
    expect(AI_OPENAI_PRICING_CATALOG_V1.environment).toBe("production");

    expect(AI_OPENAI_PRICING_CATALOG_V1.entries).toEqual([
      expect.objectContaining({
        modelId: "gpt-5.4-nano",
        billingCurrency: "USD",
        inputPerMillionTokens: 0.2,
        cachedInputPerMillionTokens: 0.02,
        outputPerMillionTokens: 1.25,
        sourceKind: "authoritative_config",
      }),
      expect.objectContaining({
        modelId: "gpt-5.4-mini",
        billingCurrency: "USD",
        inputPerMillionTokens: 0.75,
        cachedInputPerMillionTokens: 0.075,
        outputPerMillionTokens: 4.5,
        sourceKind: "authoritative_config",
      }),
      expect.objectContaining({
        modelId: "gpt-5.4",
        billingCurrency: "USD",
        inputPerMillionTokens: 2.5,
        cachedInputPerMillionTokens: 0.25,
        outputPerMillionTokens: 15,
        sourceKind: "authoritative_config",
      }),
    ]);
  });

  it("records official OpenAI provenance", () => {
    expect(AI_OPENAI_ROUTE_SOURCE_V1.authority).toBe("approved_server_config");
    expect(AI_OPENAI_PRICING_SOURCE_V1.authority).toBe("approved_server_config");

    expect(AI_OPENAI_ROUTE_SOURCE_V1.sourceId).toContain("developers.openai.com");
    expect(AI_OPENAI_PRICING_SOURCE_V1.sourceId).toContain("developers.openai.com");
  });

  it("keeps capability routing bounded", () => {
    expect(AI_OPENAI_CAPABILITY_ROUTES_V1).toEqual({
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
    });
  });

  it("routes representative capabilities correctly", () => {
    const evidence = estimateAiEvidenceV1(8_000);

    const economy = routeAiCapabilityV1(
      {
        runtimeEnvironment: "production",
        capability: "intent_extraction",
        evidence,
        expectedResponse: "short",
        budgetState: "normal",
      },
      AI_OPENAI_ROUTE_CATALOG_V1,
    );

    expect(economy.tier).toBe("economy");
    expect(economy.modelId).toBe("gpt-5.4-nano");

    const standard = routeAiCapabilityV1(
      {
        runtimeEnvironment: "production",
        capability: "today_analysis",
        evidence,
        expectedResponse: "medium",
        budgetState: "normal",
      },
      AI_OPENAI_ROUTE_CATALOG_V1,
    );

    expect(standard.tier).toBe("standard");
    expect(standard.modelId).toBe("gpt-5.4-mini");

    const strong = routeAiCapabilityV1(
      {
        runtimeEnvironment: "production",
        capability: "complex_status_analysis",
        evidence,
        expectedResponse: "medium",
        budgetState: "normal",
      },
      AI_OPENAI_ROUTE_CATALOG_V1,
    );

    expect(strong.tier).toBe("strong");
    expect(strong.modelId).toBe("gpt-5.4");
  });

  it("does not activate provider runtime without FX and billing bounds", () => {
    expect(AI_OPENAI_RUNTIME_V1_PROVIDER_CALL_ELIGIBLE).toBe(false);

    const resolution = resolveProductionAiRuntimeConfigV1(
      {
        version: "ai-provider-runtime-config-v1",
        environment: "production",
        routeCatalog: AI_OPENAI_ROUTE_CATALOG_V1,
        routeSource: AI_OPENAI_ROUTE_SOURCE_V1,
        pricingCatalog: AI_OPENAI_PRICING_CATALOG_V1,
        pricingSource: AI_OPENAI_PRICING_SOURCE_V1,
        capabilityRoutes: AI_OPENAI_CAPABILITY_ROUTES_V1,
      },
      "2026-09-11T20:00:00.000Z",
    );

    expect(resolution.availability).toBe("unavailable");

    if (resolution.availability === "unavailable") {
      expect(resolution.reason).toBe("production_fx_unavailable");
      expect(resolution.config).toBeNull();
    }
  });
});