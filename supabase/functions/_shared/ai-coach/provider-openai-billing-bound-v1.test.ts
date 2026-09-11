import { describe, expect, it } from "vitest";

import {
  AI_OPENAI_CONTEXT_WINDOWS_V1,
  AI_OPENAI_OUTPUT_BOUND_SEMANTICS_V1,
  AI_OPENAI_PRODUCTION_BILLING_BOUNDS_V1,
  AI_OPENAI_PRODUCTION_INPUT_BOUND_PROVEN_V1,
  createOpenAiProductionBillingBoundV1,
  type AiOpenAiInputTokenBoundProofV1,
} from "./provider-openai-billing-bound-v1.ts";

function proof(
  overrides: Partial<AiOpenAiInputTokenBoundProofV1> = {},
): AiOpenAiInputTokenBoundProofV1 {
  return {
    authority: "approved_server_config",
    routeCatalogVersion:
      "ai-openai-runtime-catalog-v1-2026-09-11",
    pricingVersion:
      "ai-openai-pricing-v1-2026-09-11",
    provider: "openai",
    modelId: "gpt-5.4-mini",

    requestPayloadCoverage: "complete",
    tokenBoundMethod:
      "provider_compatible_complete_payload_tokenizer",
    enforcement: "server_rejects_above_bound",

    inputTokenUpperBound: 20_000,

    source: {
      authority: "approved_server_config",
      sourceId: "test-approved-tokenizer-proof",
      verificationId: "test-verification",
      verifiedAt: "2026-09-11T20:00:00.000Z",
      loadedAt: "2026-09-11T20:00:00.000Z",
    },

    ...overrides,
  };
}

describe("OpenAI production billing bound V1", () => {
  it("keeps production input billing proof disabled by default", () => {
    expect(AI_OPENAI_PRODUCTION_INPUT_BOUND_PROVEN_V1).toBe(false);
    expect(AI_OPENAI_PRODUCTION_BILLING_BOUNDS_V1).toEqual([]);
  });

  it("records Responses output + reasoning bound semantics", () => {
    expect(AI_OPENAI_OUTPUT_BOUND_SEMANTICS_V1).toEqual({
      provider: "openai",
      api: "responses",
      maxOutputTokensIncludesVisibleOutput: true,
      maxOutputTokensIncludesReasoning: true,
      reasoningUsageNestedUnderOutputTokens: true,
      reasoningTokensPricedAs: "output",
    });
  });

  it("records the authoritative model context windows", () => {
    expect(AI_OPENAI_CONTEXT_WINDOWS_V1).toEqual({
      "gpt-5.4-nano": 400_000,
      "gpt-5.4-mini": 400_000,
      "gpt-5.4": 1_050_000,
    });
  });

  it("creates a complete standard-tier bound only from approved proof", () => {
    const bound = createOpenAiProductionBillingBoundV1(
      "standard",
      proof(),
      "2026-09-11T20:30:00.000Z",
    );

    expect(bound).toEqual(
      expect.objectContaining({
        tier: "standard",
        provider: "openai",
        modelId: "gpt-5.4-mini",
        inputTokenUpperBound: 20_000,
        outputTokenUpperBound: 900,
        requestPayloadCoverage: "complete",
        inputBoundEnforcement: "server_rejects_above_bound",
        providerOutputLimitEnforced: true,
        reasoningTokensPricedAs: "output",
        uncoveredBillableTokenClasses: [],
      }),
    );
  });

  it("rejects a proof for the wrong route model", () => {
    expect(() =>
      createOpenAiProductionBillingBoundV1(
        "standard",
        proof({
          modelId: "gpt-5.4-nano",
        }),
        "2026-09-11T20:30:00.000Z",
      ),
    ).toThrow("AI_OPENAI_INPUT_BOUND_PROOF_INVALID");
  });

  it("rejects incomplete-payload or unsupported tokenizer proof", () => {
    const invalid = {
      ...proof(),
      requestPayloadCoverage: "partial",
    } as unknown as AiOpenAiInputTokenBoundProofV1;

    expect(() =>
      createOpenAiProductionBillingBoundV1(
        "standard",
        invalid,
        "2026-09-11T20:30:00.000Z",
      ),
    ).toThrow("AI_OPENAI_INPUT_BOUND_PROOF_INVALID");
  });

  it("rejects a bound that exceeds the model context window", () => {
    expect(() =>
      createOpenAiProductionBillingBoundV1(
        "standard",
        proof({
          inputTokenUpperBound: 399_101,
        }),
        "2026-09-11T20:30:00.000Z",
      ),
    ).toThrow("AI_OPENAI_CONTEXT_BOUND_EXCEEDED");
  });

  it("accepts the exact standard context boundary", () => {
    const bound = createOpenAiProductionBillingBoundV1(
      "standard",
      proof({
        inputTokenUpperBound: 399_100,
      }),
      "2026-09-11T20:30:00.000Z",
    );

    expect(
      bound.inputTokenUpperBound + bound.outputTokenUpperBound,
    ).toBe(400_000);
  });
});