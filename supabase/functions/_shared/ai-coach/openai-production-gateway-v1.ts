import {
  fingerprintOpenAiCoachRequestV1,
  type OpenAiCoachRequestFingerprintV1,
  type OpenAiCoachRequestV1,
} from "./openai-coach-request-v1.ts";

import type {
  OpenAiServerCredentialV1,
} from "./openai-server-secret-v1.ts";

import type {
  AiProviderRuntimeActivationV1,
} from "./provider-runtime-activation-v1.ts";

import type {
  OpenAiGenerationTransportV1,
} from "./read-only-coach-orchestrator-v1.ts";


export const OPENAI_PRODUCTION_GATEWAY_V1_VERSION =
  "openai-production-gateway-v1" as const;

export const OPENAI_PRODUCTION_API_ORIGIN_V1 =
  "https://api.openai.com" as const;

export const OPENAI_PRODUCTION_RESPONSES_PATH_V1 =
  "/v1/responses" as const;


export type OpenAiProductionGatewayErrorCodeV1 =
  | "runtime_not_authorized"
  | "credential_unavailable"
  | "request_identity_invalid"
  | "request_changed";


export class OpenAiProductionGatewayErrorV1 extends Error {
  readonly code:
    OpenAiProductionGatewayErrorCodeV1;

  readonly providerOutcome:
    "not_started";

  constructor(
    code: OpenAiProductionGatewayErrorCodeV1,
  ) {
    super(
      `OPENAI_PRODUCTION_GATEWAY:${code}`,
    );

    this.name =
      "OpenAiProductionGatewayErrorV1";

    this.code =
      code;

    this.providerOutcome =
      "not_started";
  }
}


export type OpenAiProductionFetchV1 = (
  input: string,
  init: RequestInit,
) => Promise<Response>;


function assertProductionActivation(
  activation: AiProviderRuntimeActivationV1,
): asserts activation is Extract<
  AiProviderRuntimeActivationV1,
  { availability: "available" }
> {
  if (
    activation.availability !== "available"
    || activation.deploymentEnvironment !== "production"
    || activation.scope
      !== "reactive_coach_production_pilot_v1"
    || activation.serverOwned !== true
    || activation.productionAllowed !== true
    || activation.inputCountBillingAuthority
      !== "not_applicable_static_bound"
  ) {
    throw new OpenAiProductionGatewayErrorV1(
      "runtime_not_authorized",
    );
  }
}


function assertClientRequestId(
  value: string,
): void {
  if (
    !value
    || value.length > 512
    || !/^[\x20-\x7E]+$/.test(value)
  ) {
    throw new OpenAiProductionGatewayErrorV1(
      "request_identity_invalid",
    );
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
    || request.responseBody.background !== false
    || request.responseBody.truncation !== "disabled"
    || request.responseBody.service_tier !== "default"
    || request.responseBody.tools.length !== 0
    || request.responseBody.tool_choice !== "none"
    || request.responseBody.max_output_tokens <= 0
  ) {
    throw new OpenAiProductionGatewayErrorV1(
      "request_identity_invalid",
    );
  }

  const actual =
    await fingerprintOpenAiCoachRequestV1(
      request,
    );

  if (
    actual.value !== fingerprint.value
    || actual.modelId !== fingerprint.modelId
    || actual.canonicalRequest !== fingerprint.canonicalRequest
  ) {
    throw new OpenAiProductionGatewayErrorV1(
      "request_changed",
    );
  }
}


function providerRequestId(
  headers: Headers,
): string | null {
  const value =
    headers.get("x-request-id");

  return value?.trim()
    ? value.trim()
    : null;
}


function isAbort(
  error: unknown,
): boolean {
  return (
    error instanceof Error
    && error.name === "AbortError"
  );
}


export function createOpenAiProductionGenerationTransportV1(
  input: {
    readonly activation:
      AiProviderRuntimeActivationV1;

    readonly credential:
      OpenAiServerCredentialV1;

    readonly fetchImpl:
      OpenAiProductionFetchV1;

    readonly now?:
      () => Date;

    readonly generationTimeoutMs?:
      number;
  },
): OpenAiGenerationTransportV1 {
  assertProductionActivation(
    input.activation,
  );

  if (
    input.credential.authority
      !== "server_secret"
  ) {
    throw new OpenAiProductionGatewayErrorV1(
      "credential_unavailable",
    );
  }

  const generationTimeoutMs =
    input.generationTimeoutMs
    ?? 18_000;

  if (
    !Number.isInteger(
      generationTimeoutMs,
    )
    || generationTimeoutMs < 1_000
    || generationTimeoutMs > 30_000
  ) {
    throw new OpenAiProductionGatewayErrorV1(
      "request_identity_invalid",
    );
  }

  const now =
    input.now
    ?? (() => new Date());

  return Object.freeze({
    authority:
      "openai_production_gateway" as const,

    execute: async ({
      request,
      fingerprint,
      providerAttemptId,
      clientRequestId,
    }) => {
      if (
        !providerAttemptId.trim()
      ) {
        throw new OpenAiProductionGatewayErrorV1(
          "request_identity_invalid",
        );
      }

      assertClientRequestId(
        clientRequestId,
      );

      await assertRequestIdentity(
        request,
        fingerprint,
      );

      const startedAt =
        now().toISOString();

      const controller =
        new AbortController();

      const timeout =
        setTimeout(
          () => controller.abort(),
          generationTimeoutMs,
        );

      let response:
        Response;

      try {
        response =
          await input.fetchImpl(
            `${OPENAI_PRODUCTION_API_ORIGIN_V1}${OPENAI_PRODUCTION_RESPONSES_PATH_V1}`,
            {
              method:
                "POST",

              headers: {
                "Authorization":
                  input.credential
                    .authorizationHeader(),

                "Content-Type":
                  "application/json",

                "X-Client-Request-Id":
                  clientRequestId,
              },

              body:
                JSON.stringify(
                  request.responseBody,
                ),

              signal:
                controller.signal,

              redirect:
                "error",
            },
          );
      }
      catch (error) {
        return Object.freeze({
          outcome:
            "unknown" as const,

          startedAt,

          observedAt:
            now().toISOString(),

          clientRequestId,

          reason:
            isAbort(error)
              ? "timeout_billing_unknown" as const
              : "connection_outcome_unknown" as const,
        });
      }
      finally {
        clearTimeout(
          timeout,
        );
      }

      const completedAt =
        now().toISOString();

      const payload =
        await response.json();

      return Object.freeze({
        outcome:
          "known" as const,

        requestFingerprint:
          fingerprint.value,

        modelId:
          fingerprint.modelId,

        clientRequestId,

        providerRequestId:
          providerRequestId(
            response.headers,
          ),

        payload,

        headers:
          response.headers,

        httpStatus:
          response.status,

        startedAt,

        completedAt,
      });
    },
  });
}