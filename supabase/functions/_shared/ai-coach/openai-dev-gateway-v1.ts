import {
  fingerprintOpenAiCoachRequestV1,
  type OpenAiCoachRequestFingerprintV1,
  type OpenAiCoachRequestV1,
} from "./openai-coach-request-v1.ts";
import type { OpenAiServerCredentialV1 } from "./openai-server-secret-v1.ts";
import type { AiProviderRuntimeActivationV1 } from "./provider-runtime-activation-v1.ts";

export const OPENAI_DEV_GATEWAY_V1_VERSION = "openai-dev-gateway-v1" as const;
export const OPENAI_API_ORIGIN_V1 = "https://api.openai.com" as const;
export const OPENAI_RESPONSES_PATH_V1 = "/v1/responses" as const;
export const OPENAI_INPUT_TOKENS_PATH_V1 = "/v1/responses/input_tokens" as const;

export type OpenAiDevGatewayErrorCodeV1 =
  | "runtime_not_authorized"
  | "request_identity_invalid"
  | "request_changed"
  | "credential_unavailable"
  | "count_timeout_outcome_unknown"
  | "count_connection_outcome_unknown"
  | "count_http_error"
  | "count_response_invalid";

export class OpenAiDevGatewayErrorV1 extends Error {
  readonly code: OpenAiDevGatewayErrorCodeV1;
  readonly providerOutcome: "not_started" | "known" | "unknown";
  readonly httpStatus: number | null;
  readonly providerRequestId: string | null;
  readonly providerErrorType: string | null;
  readonly providerErrorCode: string | null;
  readonly providerErrorParam: string | null;

  constructor(input: {
    readonly code: OpenAiDevGatewayErrorCodeV1;
    readonly providerOutcome: "not_started" | "known" | "unknown";
    readonly httpStatus?: number | null;
    readonly providerRequestId?: string | null;
    readonly providerErrorType?: string | null;
    readonly providerErrorCode?: string | null;
    readonly providerErrorParam?: string | null;
  }) {
    super(`OPENAI_DEV_GATEWAY:${input.code}`);
    this.name = "OpenAiDevGatewayErrorV1";
    this.code = input.code;
    this.providerOutcome = input.providerOutcome;
    this.httpStatus = input.httpStatus ?? null;
    this.providerRequestId = input.providerRequestId ?? null;
    this.providerErrorType = input.providerErrorType ?? null;
    this.providerErrorCode = input.providerErrorCode ?? null;
    this.providerErrorParam = input.providerErrorParam ?? null;
  }
}

export type OpenAiFetchV1 = (
  input: string,
  init: RequestInit,
) => Promise<Response>;

function providerRequestId(headers: Headers): string | null {
  const value = headers.get("x-request-id");
  return value?.trim() ? value.trim() : null;
}

function assertClientRequestId(value: string): void {
  if (!value || value.length > 512 || !/^[\x20-\x7E]+$/.test(value)) {
    throw new OpenAiDevGatewayErrorV1({
      code: "request_identity_invalid",
      providerOutcome: "not_started",
    });
  }
}

async function assertRequestIdentity(
  request: OpenAiCoachRequestV1,
  fingerprint: OpenAiCoachRequestFingerprintV1,
): Promise<void> {
  if (
    request.provider !== "openai"
    || request.endpointClass !== "global_standard"
    || request.responseBody.model !== fingerprint.modelId
    || request.responseBody.store !== false
    || request.responseBody.tools.length !== 0
    || request.responseBody.tool_choice !== "none"
    || request.responseBody.max_output_tokens <= 0
  ) {
    throw new OpenAiDevGatewayErrorV1({
      code: "request_identity_invalid",
      providerOutcome: "not_started",
    });
  }
  const actual = await fingerprintOpenAiCoachRequestV1(request);
  if (actual.value !== fingerprint.value || actual.canonicalRequest !== fingerprint.canonicalRequest) {
    throw new OpenAiDevGatewayErrorV1({
      code: "request_changed",
      providerOutcome: "not_started",
    });
  }
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function safeProviderErrorField(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 256) return null;
  if (!/^[\x20-\x7E]+$/.test(trimmed)) return null;
  return trimmed;
}

function providerErrorMetadata(payload: unknown): {
  readonly type: string | null;
  readonly code: string | null;
  readonly param: string | null;
} {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return { type: null, code: null, param: null };
  }

  const error = (payload as Record<string, unknown>).error;

  if (typeof error !== "object" || error === null || Array.isArray(error)) {
    return { type: null, code: null, param: null };
  }

  const record = error as Record<string, unknown>;

  return {
    type: safeProviderErrorField(record.type),
    code: safeProviderErrorField(record.code),
    param: safeProviderErrorField(record.param),
  };
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export interface OpenAiDevGatewayV1 {
  readonly version: typeof OPENAI_DEV_GATEWAY_V1_VERSION;
  readonly automaticRetryCount: 0;
  readonly countInputTokens: (input: {
    readonly request: OpenAiCoachRequestV1;
    readonly fingerprint: OpenAiCoachRequestFingerprintV1;
    readonly clientRequestId: string;
  }) => Promise<{
    readonly object: "response.input_tokens";
    readonly inputTokens: number;
    readonly countedAt: string;
    readonly requestFingerprint: string;
    readonly modelId: string;
    readonly clientRequestId: string;
    readonly providerRequestId: string | null;
  }>;
  readonly createResponse: (input: {
    readonly request: OpenAiCoachRequestV1;
    readonly fingerprint: OpenAiCoachRequestFingerprintV1;
    readonly providerAttemptId: string;
    readonly clientRequestId: string;
  }) => Promise<
    | {
        readonly outcome: "known";
        readonly requestFingerprint: string;
        readonly modelId: string;
        readonly clientRequestId: string;
        readonly providerRequestId: string | null;
        readonly payload: unknown;
        readonly headers: Headers;
        readonly httpStatus: number;
        readonly startedAt: string;
        readonly completedAt: string;
      }
    | {
        readonly outcome: "unknown";
        readonly startedAt: string;
        readonly observedAt: string;
        readonly clientRequestId: string;
        readonly reason: "timeout_billing_unknown" | "connection_outcome_unknown";
      }
  >;
}

/**
 * Direct HTTP boundary for one future controlled DEV smoke. The caller must
 * inject the fetch implementation. This module never retries and exposes no
 * configurable URL, tools, or production activation path.
 */
export function createOpenAiDevGatewayV1(input: {
  readonly activation: AiProviderRuntimeActivationV1;
  readonly credential: OpenAiServerCredentialV1;
  readonly fetchImpl: OpenAiFetchV1;
  readonly now?: () => Date;
  readonly countTimeoutMs?: number;
  readonly generationTimeoutMs?: number;
}): OpenAiDevGatewayV1 {
  if (input.activation.availability !== "available") {
    throw new OpenAiDevGatewayErrorV1({ code: "runtime_not_authorized", providerOutcome: "not_started" });
  }
  if (input.credential.authority !== "server_secret") {
    throw new OpenAiDevGatewayErrorV1({ code: "credential_unavailable", providerOutcome: "not_started" });
  }
  const now = input.now ?? (() => new Date());
  const countTimeoutMs = input.countTimeoutMs ?? 8_000;
  const generationTimeoutMs = input.generationTimeoutMs ?? 18_000;
  if (
    !Number.isInteger(countTimeoutMs) || countTimeoutMs < 1_000 || countTimeoutMs > 30_000
    || !Number.isInteger(generationTimeoutMs) || generationTimeoutMs < 1_000 || generationTimeoutMs > 30_000
  ) {
    throw new OpenAiDevGatewayErrorV1({ code: "request_identity_invalid", providerOutcome: "not_started" });
  }

  async function post(path: typeof OPENAI_RESPONSES_PATH_V1 | typeof OPENAI_INPUT_TOKENS_PATH_V1, body: unknown, timeoutMs: number, clientRequestId: string): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await input.fetchImpl(`${OPENAI_API_ORIGIN_V1}${path}`, {
        method: "POST",
        headers: {
          "Authorization": input.credential.authorizationHeader(),
          "Content-Type": "application/json",
          "X-Client-Request-Id": clientRequestId,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
        redirect: "error",
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  return Object.freeze({
    version: OPENAI_DEV_GATEWAY_V1_VERSION,
    automaticRetryCount: 0 as const,
    countInputTokens: async ({ request, fingerprint, clientRequestId }) => {
      assertClientRequestId(clientRequestId);
      await assertRequestIdentity(request, fingerprint);
      let response: Response;
      try {
        response = await post(OPENAI_INPUT_TOKENS_PATH_V1, request.inputCountBody, countTimeoutMs, clientRequestId);
      } catch (error) {
        throw new OpenAiDevGatewayErrorV1({
          code: isAbort(error) ? "count_timeout_outcome_unknown" : "count_connection_outcome_unknown",
          providerOutcome: "unknown",
        });
      }
      const requestId = providerRequestId(response.headers);
      const payload = await parseJson(response);
      if (!response.ok) {
        const providerError = providerErrorMetadata(payload);
        throw new OpenAiDevGatewayErrorV1({
          code: "count_http_error",
          providerOutcome: "known",
          httpStatus: response.status,
          providerRequestId: requestId,
          providerErrorType: providerError.type,
          providerErrorCode: providerError.code,
          providerErrorParam: providerError.param,
        });
      }
      if (
        typeof payload !== "object" || payload === null || Array.isArray(payload)
        || (payload as Record<string, unknown>).object !== "response.input_tokens"
        || !Number.isInteger((payload as Record<string, unknown>).input_tokens)
        || Number((payload as Record<string, unknown>).input_tokens) < 0
      ) {
        throw new OpenAiDevGatewayErrorV1({ code: "count_response_invalid", providerOutcome: "known", httpStatus: response.status, providerRequestId: requestId });
      }
      return Object.freeze({
        object: "response.input_tokens" as const,
        inputTokens: Number((payload as Record<string, unknown>).input_tokens),
        countedAt: now().toISOString(),
        requestFingerprint: fingerprint.value,
        modelId: fingerprint.modelId,
        clientRequestId,
        providerRequestId: requestId,
      });
    },
    createResponse: async ({ request, fingerprint, providerAttemptId, clientRequestId }) => {
      if (!providerAttemptId.trim()) {
        throw new OpenAiDevGatewayErrorV1({ code: "request_identity_invalid", providerOutcome: "not_started" });
      }
      assertClientRequestId(clientRequestId);
      await assertRequestIdentity(request, fingerprint);
      const startedAt = now().toISOString();
      let response: Response;
      try {
        response = await post(OPENAI_RESPONSES_PATH_V1, request.responseBody, generationTimeoutMs, clientRequestId);
      } catch (error) {
        return Object.freeze({
          outcome: "unknown" as const,
          startedAt,
          observedAt: now().toISOString(),
          clientRequestId,
          reason: isAbort(error) ? "timeout_billing_unknown" as const : "connection_outcome_unknown" as const,
        });
      }
      const completedAt = now().toISOString();
      const requestId = providerRequestId(response.headers);
      const payload = await parseJson(response);
      return Object.freeze({
        outcome: "known" as const,
        requestFingerprint: fingerprint.value,
        modelId: fingerprint.modelId,
        clientRequestId,
        providerRequestId: requestId,
        payload,
        headers: response.headers,
        httpStatus: response.status,
        startedAt,
        completedAt,
      });
    },
  });
}

/** Adapter with the exact injected transport names used by the read-only orchestrator. */
export function openAiDevGatewayAsOrchestratorTransportsV1(gateway: OpenAiDevGatewayV1) {
  return Object.freeze({
    inputCountTransport: Object.freeze({
      authority: "openai_dev_gateway" as const,
      count: gateway.countInputTokens,
    }),
    generationTransport: Object.freeze({
      authority: "openai_dev_gateway" as const,
      execute: gateway.createResponse,
    }),
  });
}
