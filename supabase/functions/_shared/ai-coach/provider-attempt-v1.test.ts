import { describe, expect, it } from "vitest";
import { extractOpenAiProviderAttemptObservationV1, providerObservationToUsageEventAttemptV1 } from "./provider-attempt-v1.ts";

function observation(payload: unknown, headers: Headers | Record<string, string> | null = null) {
  return extractOpenAiProviderAttemptObservationV1({ payload, headers, httpStatus: 200, startedAt: "2026-09-11T10:00:00.000Z", completedAt: "2026-09-11T10:00:01.250Z", attemptNumber: 1, retryNumber: 0, fallbackFromAttemptId: null });
}

describe("6B.6A provider-attempt metering extraction", () => {
  it("extracts request identity and provider-reported token usage defensively", () => {
    expect(observation({ id: "resp_test_1", status: "completed", usage: { input_tokens: 1200, input_tokens_details: { cached_tokens: 200 }, output_tokens: 300, total_tokens: 1500 } })).toEqual({
      version: "ai-provider-attempt-observation-v1", provider: "openai", providerRequestId: "resp_test_1", providerRequestIdSource: "response_body", providerStatus: "completed", httpStatus: 200,
      usage: { availability: "reported", inputTokens: 1200, cachedInputTokens: 200, outputTokens: 300, totalTokens: 1500, source: "provider_response" },
      usageDetails: { cachedInputTokens: 200, cacheWriteTokens: null, reasoningOutputTokens: null },
      unmodeledBillableTokenClasses: [],
      startedAt: "2026-09-11T10:00:00.000Z", completedAt: "2026-09-11T10:00:01.250Z", latencyMs: 1250, attemptNumber: 1, retryNumber: 0, fallbackFromAttemptId: null, rawProviderPayloadStored: false,
    });
  });

  it("accepts reasoning as an output subset and fails closed on nonzero cache-write tokens", () => {
    expect(observation({ status: "completed", usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 10, cache_write_tokens: 0 }, output_tokens: 20, output_tokens_details: { reasoning_tokens: 12 }, total_tokens: 120 } })).toMatchObject({
      usage: { availability: "reported" },
      usageDetails: { cachedInputTokens: 10, cacheWriteTokens: 0, reasoningOutputTokens: 12 },
      unmodeledBillableTokenClasses: [],
    });
    expect(observation({ status: "completed", usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 5 }, output_tokens: 20, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 120 } })).toMatchObject({
      usage: { availability: "unavailable" },
      unmodeledBillableTokenClasses: ["cache_write"],
    });
  });

  it("uses a response header request id only when the body id is unavailable", () => {
    expect(observation({ status: "completed" }, { "x-request-id": "req_header_1" })).toMatchObject({ providerRequestId: "req_header_1", providerRequestIdSource: "response_header" });
  });

  it("keeps missing or inconsistent usage unknown rather than zero", () => {
    expect(observation({ status: "completed" }).usage).toEqual({ availability: "unavailable", inputTokens: null, cachedInputTokens: null, outputTokens: null, totalTokens: null, source: "provider_usage_unavailable" });
    expect(observation({ status: "completed", usage: { input_tokens: 100, output_tokens: 10, total_tokens: 999 } }).usage.availability).toBe("unavailable");
  });

  it("keeps cached usage null when the provider omits only cached-token detail", () => {
    expect(observation({ status: "completed", usage: { input_tokens: 100, output_tokens: 10, total_tokens: 110 } }).usage).toEqual({ availability: "reported", inputTokens: 100, cachedInputTokens: null, outputTokens: 10, totalTokens: 110, source: "provider_response" });
  });

  it("keeps retry and fallback attempt relationships explicit without raw payload retention", () => {
    const result = extractOpenAiProviderAttemptObservationV1({ payload: { status: "failed" }, headers: null, httpStatus: 500, startedAt: "2026-09-11T10:00:00.000Z", completedAt: "2026-09-11T10:00:02.000Z", attemptNumber: 3, retryNumber: 1, fallbackFromAttemptId: "attempt-previous" });
    expect(result).toMatchObject({ providerStatus: "failed", attemptNumber: 3, retryNumber: 1, fallbackFromAttemptId: "attempt-previous", rawProviderPayloadStored: false });
    expect(result).not.toHaveProperty("payload");
    expect(providerObservationToUsageEventAttemptV1(result)).toMatchObject({
      usage: { availability: "unavailable" },
      execution: { providerRequestId: null, providerRequestIdSource: "unavailable", status: "failed", retryNumber: 1, fallbackFromAttemptId: "attempt-previous", errorCategory: "unknown" },
    });
  });
});
