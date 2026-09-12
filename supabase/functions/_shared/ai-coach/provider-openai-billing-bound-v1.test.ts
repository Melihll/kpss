import { describe, expect, it } from "vitest";

import {
  AI_OPENAI_CONTEXT_WINDOWS_V1,
  AI_OPENAI_COACH_INPUT_TOKEN_LIMIT_V1,
  AI_OPENAI_OUTPUT_BOUND_SEMANTICS_V1,
  AI_OPENAI_PRODUCTION_BILLING_BOUNDS_V1,
  AI_OPENAI_PRODUCTION_INPUT_BOUND_PROVEN_V1,
  createOpenAiProductionBillingBoundV1,
  type AiOpenAiInputTokenBoundProofV1,
} from "./provider-openai-billing-bound-v1.ts";

function proof(
  inputTokens = 20_000,
  overrides: Partial<AiOpenAiInputTokenBoundProofV1> = {},
): AiOpenAiInputTokenBoundProofV1 {
  const request = {
    requestFingerprint: "sha256:exact-request",
    modelId: "gpt-5.4-mini-2026-03-17",
    coverage: "complete_generation_request" as const,
  };
  return {
    authority: "approved_server_config",
    routeCatalogVersion:
      "ai-openai-runtime-catalog-v1-2026-09-11",
    pricingVersion:
      "ai-openai-pricing-v1-2026-09-11",
    provider: "openai",
    modelId: "gpt-5.4-mini-2026-03-17",

    requestPayloadCoverage: "complete",
    tokenBoundMethod:
      "openai_responses_input_tokens_exact",
    enforcement: "server_rejects_above_bound",

    request,
    count: {
      version: "ai-openai-input-token-count-v1",
      authority: "openai_responses_input_token_count",
      endpoint: "/responses/input_tokens",
      requestFingerprint: request.requestFingerprint,
      modelId: request.modelId,
      inputTokens,
      countedAt: "2026-09-11T20:00:00.000Z",
      providerRequestId: "count-request-1",
      billingTreatment: "production_billing_status_unverified",
    },

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
      "gpt-5.4-nano-2026-03-17": 400_000,
      "gpt-5.4-mini-2026-03-17": 400_000,
      "gpt-5.4-2026-03-05": 1_050_000,
    });
    expect(AI_OPENAI_COACH_INPUT_TOKEN_LIMIT_V1).toBe(200_000);
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
        modelId: "gpt-5.4-mini-2026-03-17",
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
        proof(20_000, {
          modelId: "gpt-5.4-nano-2026-03-17",
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
        proof(200_001),
        "2026-09-11T20:30:00.000Z",
      ),
    ).toThrow("AI_OPENAI_INPUT_BOUND_INVALID");
  });

  it("accepts the exact Coach product input boundary", () => {
    const bound = createOpenAiProductionBillingBoundV1(
      "standard",
      proof(200_000),
      "2026-09-11T20:30:00.000Z",
    );

    expect(
      bound.inputTokenUpperBound,
    ).toBe(200_000);
  });
});
