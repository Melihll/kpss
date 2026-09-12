export const AI_OPENAI_INPUT_TOKEN_COUNT_V1_VERSION =
  "ai-openai-input-token-count-v1" as const;

export const AI_OPENAI_INPUT_TOKEN_COUNT_ENDPOINT_V1 =
  "/responses/input_tokens" as const;

export interface AiOpenAiCompleteRequestIdentityV1 {
  readonly requestFingerprint: string;
  readonly modelId: string;

  /**
   * Fingerprint must cover the complete immutable provider-counted payload:
   * model, instructions, input/messages, tools/schema and every other
   * field that can affect provider input tokenization.
   */
  readonly coverage: "complete_generation_request";
}

export interface AiOpenAiInputTokenCountResultV1 {
  readonly version: typeof AI_OPENAI_INPUT_TOKEN_COUNT_V1_VERSION;
  readonly authority: "openai_responses_input_token_count" | "test_fixture";
  readonly endpoint: typeof AI_OPENAI_INPUT_TOKEN_COUNT_ENDPOINT_V1;

  readonly requestFingerprint: string;
  readonly modelId: string;

  readonly inputTokens: number;

  readonly countedAt: string;

  readonly providerRequestId: string | null;

  /**
   * We have authoritative documentation for the counting endpoint itself,
   * but production activation must separately establish its billing
   * treatment before treating it as cost-free infrastructure.
   */
  readonly billingTreatment:
    | "production_billing_status_unverified"
    | "test_fixture_no_charge";
}

function isInstant(value: string): boolean {
  return value.includes("T") && Number.isFinite(Date.parse(value));
}

export function createOpenAiInputTokenCountResultV1(input: {
  readonly request: AiOpenAiCompleteRequestIdentityV1;
  readonly inputTokens: number;
  readonly countedAt: string;
  readonly providerRequestId: string | null;
  readonly authority?: AiOpenAiInputTokenCountResultV1["authority"];
  readonly billingTreatment?: AiOpenAiInputTokenCountResultV1["billingTreatment"];
}): AiOpenAiInputTokenCountResultV1 {
  const authority = input.authority ?? "openai_responses_input_token_count";
  const billingTreatment = input.billingTreatment ?? "production_billing_status_unverified";
  if (
    (authority === "test_fixture" && billingTreatment !== "test_fixture_no_charge")
    || (authority === "openai_responses_input_token_count" && billingTreatment !== "production_billing_status_unverified")
  ) {
    throw new Error("AI_OPENAI_INPUT_COUNT_AUTHORITY_BILLING_MISMATCH");
  }

  if (
    input.request.coverage !== "complete_generation_request"
    || !input.request.requestFingerprint.trim()
    || !input.request.modelId.trim()
  ) {
    throw new Error("AI_OPENAI_INPUT_COUNT_REQUEST_IDENTITY_INVALID");
  }

  if (!Number.isInteger(input.inputTokens) || input.inputTokens < 0) {
    throw new Error("AI_OPENAI_INPUT_COUNT_INVALID");
  }

  if (!isInstant(input.countedAt)) {
    throw new Error("AI_OPENAI_INPUT_COUNT_TIMESTAMP_INVALID");
  }

  if (
    input.providerRequestId !== null
    && !input.providerRequestId.trim()
  ) {
    throw new Error("AI_OPENAI_INPUT_COUNT_PROVIDER_REQUEST_ID_INVALID");
  }

  return Object.freeze({
    version: AI_OPENAI_INPUT_TOKEN_COUNT_V1_VERSION,
    authority,
    endpoint: AI_OPENAI_INPUT_TOKEN_COUNT_ENDPOINT_V1,

    requestFingerprint: input.request.requestFingerprint,
    modelId: input.request.modelId,

    inputTokens: input.inputTokens,

    countedAt: input.countedAt,

    providerRequestId: input.providerRequestId,

    billingTreatment,
  });
}

export function assertOpenAiInputCountMatchesProviderRequestV1(
  count: AiOpenAiInputTokenCountResultV1,
  request: AiOpenAiCompleteRequestIdentityV1,
): number {
  if (
    request.coverage !== "complete_generation_request"
    || count.requestFingerprint !== request.requestFingerprint
    || count.modelId !== request.modelId
  ) {
    throw new Error("AI_OPENAI_INPUT_COUNT_REQUEST_MISMATCH");
  }

  return count.inputTokens;
}

/**
 * Deliberately false.
 *
 * The official complete-input count endpoint is known, but runtime activation
 * still requires:
 * - actual gateway wiring,
 * - cryptographically/deterministically stable complete-request fingerprinting,
 * - identical counted/sent payload enforcement,
 * - confirmed production billing treatment of the count endpoint,
 * - authoritative live FX snapshot,
 * - full reservation/orchestrator acceptance.
 */
export const AI_OPENAI_INPUT_COUNT_RUNTIME_ELIGIBLE_V1 = false as const;
