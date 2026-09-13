import { describe, expect, it } from "vitest";

import {
  AI_OPENAI_INPUT_COUNT_RUNTIME_ELIGIBLE_V1,
  AI_OPENAI_INPUT_TOKEN_COUNT_ENDPOINT_V1,
  assertOpenAiInputCountMatchesProviderRequestV1,
  createOpenAiInputTokenCountResultV1,
} from "./openai-input-token-count-v1.ts";

const request = {
  requestFingerprint: "sha256:complete-request-a",
  modelId: "gpt-5.4-mini",
  coverage: "complete_generation_request",
} as const;

describe("OpenAI complete input-token count V1", () => {
  it("uses the official Responses input-token count boundary", () => {
    expect(AI_OPENAI_INPUT_TOKEN_COUNT_ENDPOINT_V1).toBe(
      "/responses/input_tokens",
    );
  });

  it("records an exact provider-reported complete-input count", () => {
    const result = createOpenAiInputTokenCountResultV1({
      request,
      inputTokens: 12_345,
      countedAt: "2026-09-11T20:00:00.000Z",
      providerRequestId: "req_count_1",
    });

    expect(result).toEqual({
      version: "ai-openai-input-token-count-v1",
      authority: "openai_responses_input_token_count",
      endpoint: "/responses/input_tokens",
      requestFingerprint: "sha256:complete-request-a",
      modelId: "gpt-5.4-mini",
      inputTokens: 12_345,
      countedAt: "2026-09-11T20:00:00.000Z",
      providerRequestId: "req_count_1",
      billingTreatment: "production_billing_status_unverified",
    });
  });

  it("binds the count to the identical immutable request", () => {
    const result = createOpenAiInputTokenCountResultV1({
      request,
      inputTokens: 12_345,
      countedAt: "2026-09-11T20:00:00.000Z",
      providerRequestId: null,
    });

    expect(
      assertOpenAiInputCountMatchesProviderRequestV1(result, request),
    ).toBe(12_345);
  });

  it("rejects a changed provider request after counting", () => {
    const result = createOpenAiInputTokenCountResultV1({
      request,
      inputTokens: 12_345,
      countedAt: "2026-09-11T20:00:00.000Z",
      providerRequestId: null,
    });

    expect(() =>
      assertOpenAiInputCountMatchesProviderRequestV1(result, {
        ...request,
        requestFingerprint: "sha256:changed-request",
      }),
    ).toThrow("AI_OPENAI_INPUT_COUNT_REQUEST_MISMATCH");
  });

  it("rejects model changes between count and provider request", () => {
    const result = createOpenAiInputTokenCountResultV1({
      request,
      inputTokens: 12_345,
      countedAt: "2026-09-11T20:00:00.000Z",
      providerRequestId: null,
    });

    expect(() =>
      assertOpenAiInputCountMatchesProviderRequestV1(result, {
        ...request,
        modelId: "gpt-5.4",
      }),
    ).toThrow("AI_OPENAI_INPUT_COUNT_REQUEST_MISMATCH");
  });

  it("rejects invalid token counts", () => {
    expect(() =>
      createOpenAiInputTokenCountResultV1({
        request,
        inputTokens: -1,
        countedAt: "2026-09-11T20:00:00.000Z",
        providerRequestId: null,
      }),
    ).toThrow("AI_OPENAI_INPUT_COUNT_INVALID");
  });

  it("cannot label fixture counting as production-authoritative or vice versa", () => {
    expect(() => createOpenAiInputTokenCountResultV1({
      request,
      inputTokens: 10,
      countedAt: "2026-09-11T20:00:00.000Z",
      providerRequestId: null,
      authority: "test_fixture",
      billingTreatment: "production_billing_status_unverified",
    })).toThrow("AI_OPENAI_INPUT_COUNT_AUTHORITY_BILLING_MISMATCH");

    expect(() => createOpenAiInputTokenCountResultV1({
      request,
      inputTokens: 10,
      countedAt: "2026-09-11T20:00:00.000Z",
      providerRequestId: null,
      authority: "openai_responses_input_token_count",
      billingTreatment: "test_fixture_no_charge",
    })).toThrow("AI_OPENAI_INPUT_COUNT_AUTHORITY_BILLING_MISMATCH");
  });

  it("remains production-ineligible by default", () => {
    expect(AI_OPENAI_INPUT_COUNT_RUNTIME_ELIGIBLE_V1).toBe(false);
  });
});
