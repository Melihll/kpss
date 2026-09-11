import type { AiProviderAttemptStatusV1, AiProviderErrorCategoryV1, AiReportedUsageV1, CreateAiUsageEventInputV1 } from "../../../../packages/domain/src/ai-coach/ai-economics-v1.ts";

export const AI_PROVIDER_ATTEMPT_OBSERVATION_V1_VERSION = "ai-provider-attempt-observation-v1" as const;

export interface AiProviderAttemptObservationV1 {
  readonly version: typeof AI_PROVIDER_ATTEMPT_OBSERVATION_V1_VERSION;
  readonly provider: "openai";
  readonly providerRequestId: string | null;
  readonly providerRequestIdSource: "response_body" | "response_header" | "unavailable";
  readonly providerStatus: "completed" | "failed" | "incomplete" | "cancelled" | "unknown";
  readonly httpStatus: number;
  readonly usage: AiReportedUsageV1;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly latencyMs: number;
  readonly attemptNumber: number;
  readonly retryNumber: number;
  readonly fallbackFromAttemptId: string | null;
  readonly rawProviderPayloadStored: false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function integerOrNull(value: unknown): number | null {
  return Number.isInteger(value) && (value as number) >= 0 ? value as number : null;
}

function headerValue(headers: Headers | Readonly<Record<string, string>> | null, name: string): string | null {
  if (headers === null) return null;
  if (typeof (headers as Headers).get === "function") return (headers as Headers).get(name);
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return entry?.[1] ?? null;
}

function extractRequestId(payload: unknown, headers: Headers | Readonly<Record<string, string>> | null): Pick<AiProviderAttemptObservationV1, "providerRequestId" | "providerRequestIdSource"> {
  if (isRecord(payload) && typeof payload.id === "string" && payload.id.trim()) return { providerRequestId: payload.id.trim(), providerRequestIdSource: "response_body" };
  const fromHeader = headerValue(headers, "x-request-id") ?? headerValue(headers, "request-id");
  if (fromHeader?.trim()) return { providerRequestId: fromHeader.trim(), providerRequestIdSource: "response_header" };
  return { providerRequestId: null, providerRequestIdSource: "unavailable" };
}

function extractUsage(payload: unknown): AiReportedUsageV1 {
  if (!isRecord(payload) || !isRecord(payload.usage)) return { availability: "unavailable", inputTokens: null, cachedInputTokens: null, outputTokens: null, totalTokens: null, source: "provider_usage_unavailable" };
  const inputTokens = integerOrNull(payload.usage.input_tokens);
  const outputTokens = integerOrNull(payload.usage.output_tokens);
  const totalTokens = integerOrNull(payload.usage.total_tokens);
  const details = isRecord(payload.usage.input_tokens_details) ? payload.usage.input_tokens_details : null;
  const cachedInputTokens = details && Object.prototype.hasOwnProperty.call(details, "cached_tokens") ? integerOrNull(details.cached_tokens) : null;
  if (inputTokens === null || outputTokens === null || totalTokens === null || totalTokens !== inputTokens + outputTokens || (details && Object.prototype.hasOwnProperty.call(details, "cached_tokens") && cachedInputTokens === null) || (cachedInputTokens !== null && cachedInputTokens > inputTokens)) return { availability: "unavailable", inputTokens: null, cachedInputTokens: null, outputTokens: null, totalTokens: null, source: "provider_usage_unavailable" };
  return { availability: "reported", inputTokens, cachedInputTokens, outputTokens, totalTokens, source: "provider_response" };
}

function providerStatus(payload: unknown): AiProviderAttemptObservationV1["providerStatus"] {
  if (!isRecord(payload) || typeof payload.status !== "string") return "unknown";
  return (["completed", "failed", "incomplete", "cancelled"] as const).find((value) => value === payload.status) ?? "unknown";
}

export function extractOpenAiProviderAttemptObservationV1(input: {
  readonly payload: unknown;
  readonly headers: Headers | Readonly<Record<string, string>> | null;
  readonly httpStatus: number;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly attemptNumber: number;
  readonly retryNumber: number;
  readonly fallbackFromAttemptId: string | null;
}): AiProviderAttemptObservationV1 {
  const started = Date.parse(input.startedAt);
  const completed = Date.parse(input.completedAt);
  if (!Number.isFinite(started) || !Number.isFinite(completed) || completed < started) throw new Error("AI_PROVIDER_ATTEMPT_TIME_INVALID");
  if (!Number.isInteger(input.httpStatus) || input.httpStatus < 100 || input.httpStatus > 599) throw new Error("AI_PROVIDER_ATTEMPT_HTTP_STATUS_INVALID");
  if (!Number.isInteger(input.attemptNumber) || input.attemptNumber < 1 || !Number.isInteger(input.retryNumber) || input.retryNumber < 0) throw new Error("AI_PROVIDER_ATTEMPT_NUMBER_INVALID");
  const requestId = extractRequestId(input.payload, input.headers);
  return Object.freeze({
    version: AI_PROVIDER_ATTEMPT_OBSERVATION_V1_VERSION,
    provider: "openai",
    ...requestId,
    providerStatus: providerStatus(input.payload),
    httpStatus: input.httpStatus,
    usage: extractUsage(input.payload),
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    latencyMs: completed - started,
    attemptNumber: input.attemptNumber,
    retryNumber: input.retryNumber,
    fallbackFromAttemptId: input.fallbackFromAttemptId,
    rawProviderPayloadStored: false,
  });
}

export function providerObservationToUsageEventAttemptV1(
  observation: AiProviderAttemptObservationV1,
): Readonly<Pick<CreateAiUsageEventInputV1, "usage"> & { readonly execution: CreateAiUsageEventInputV1["execution"] }> {
  let status: AiProviderAttemptStatusV1 = "failed";
  let errorCategory: AiProviderErrorCategoryV1 = "unknown";
  if (observation.providerStatus === "completed") {
    status = "succeeded";
    errorCategory = "none";
  } else if (observation.providerStatus === "cancelled") {
    status = "cancelled";
  } else if (observation.providerStatus === "incomplete") {
    errorCategory = "invalid_response";
  }
  return Object.freeze({
    usage: observation.usage,
    execution: Object.freeze({
      providerRequestId: observation.providerRequestId,
      providerRequestIdSource: observation.providerRequestIdSource,
      startedAt: observation.startedAt,
      completedAt: observation.completedAt,
      status,
      retryNumber: observation.retryNumber,
      fallbackFromAttemptId: observation.fallbackFromAttemptId,
      errorCategory,
    }),
  });
}
