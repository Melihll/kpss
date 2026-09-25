import type {
  AiFxSnapshotV1,
} from "../../../../packages/domain/src/ai-coach/ai-economics-v1.ts";

import {
  acquireTcmbUsdTrySnapshotV1,
} from "./provider-fx-acquisition-v1.ts";

import {
  validateApprovedTcmbUsdTryFxSnapshotV1,
} from "./provider-fx-policy-v1.ts";

import {
  AI_OPENAI_BILLING_AUDIT_V1,
  AI_OPENAI_BILLING_AUDIT_V1_VERSION,
} from "./provider-openai-billing-audit-v1.ts";

import {
  createOpenAiProductionGenerationTransportV1,
} from "./openai-production-gateway-v1.ts";

import {
  loadOpenAiServerCredentialV1,
} from "./openai-server-secret-v1.ts";

import {
  AI_PROVIDER_RUNTIME_SERVER_KEYS_V1,
  resolveAiProviderRuntimeActivationV1,
  type AiProviderRuntimeActivationV1,
} from "./provider-runtime-activation-v1.ts";

import {
  AI_OPENAI_PRICING_CATALOG_V1,
  AI_OPENAI_ROUTE_CATALOG_V1,
} from "./provider-runtime-catalog-v1.ts";

import type {
  ReactiveCoachProviderExecutionInputV1,
} from "./reactive-coach-executor-v1.ts";


type Client = any;


export const REACTIVE_COACH_PRODUCTION_RUNTIME_V1_VERSION =
  "reactive-coach-production-runtime-v1" as const;

export const REACTIVE_COACH_PRODUCTION_SCOPE_V1 =
  "reactive_coach_production_pilot_v1" as const;

const REACTIVE_COACH_PRODUCTION_STATIC_BOUND_VERIFIED_AT_V1 =
  "2026-09-24T00:00:00.000Z" as const;


export const REACTIVE_COACH_PRODUCTION_RUNTIME_SERVER_KEYS_V1 =
  Object.freeze({
    enabled:
      "AI_REACTIVE_COACH_PRODUCTION_PILOT_ENABLED",

    approved:
      "AI_REACTIVE_COACH_PRODUCTION_PILOT_APPROVED",

    staticBoundReady:
      "AI_REACTIVE_COACH_PRODUCTION_STATIC_BOUND_READY",

    environment:
      "AI_REACTIVE_COACH_PRODUCTION_ENVIRONMENT",

    allowedUserId:
      "AI_REACTIVE_COACH_PRODUCTION_ALLOWED_USER_ID",

    allowedProfileId:
      "AI_REACTIVE_COACH_PRODUCTION_ALLOWED_PROFILE_ID",
  } as const);


function productionStaticBoundSourceV1(
  loadedAt: string,
) {
  return Object.freeze({
    authority:
      "approved_server_config" as const,

    sourceId:
      "reactive-coach-production-static-bound-v1",

    verificationId:
      "ai-coach-6g-b2-static-production-bound-v1",

    verifiedAt:
      REACTIVE_COACH_PRODUCTION_STATIC_BOUND_VERIFIED_AT_V1,

    loadedAt,
  });
}


function mapProductionConfigToProviderActivationV1(
  serverConfig:
    Readonly<
      Record<
        string,
        string | undefined
      >
    >,
): Readonly<
  Record<
    string,
    string | undefined
  >
> {
  const dedicated =
    REACTIVE_COACH_PRODUCTION_RUNTIME_SERVER_KEYS_V1;

  const generic =
    AI_PROVIDER_RUNTIME_SERVER_KEYS_V1;

  return Object.freeze({
    [generic.enabled]:
      serverConfig[
        dedicated.enabled
      ],

    [generic.environment]:
      serverConfig[
        dedicated.environment
      ],

    [generic.scope]:
      REACTIVE_COACH_PRODUCTION_SCOPE_V1,

    [generic.allowedUserId]:
      serverConfig[
        dedicated.allowedUserId
      ],

    [generic.allowedProfileId]:
      serverConfig[
        dedicated.allowedProfileId
      ],
  });
}


export function resolveReactiveCoachProductionRuntimeActivationV1(
  input: {
    readonly serverConfig:
      Readonly<
        Record<
          string,
          string | undefined
        >
      >;

    readonly userId:
      string;

    readonly examProfileId:
      string;
  },
): AiProviderRuntimeActivationV1 {
  const keys =
    REACTIVE_COACH_PRODUCTION_RUNTIME_SERVER_KEYS_V1;

  return resolveAiProviderRuntimeActivationV1({
    deploymentEnvironment:
      "production",

    productionPilotApproved:
      input.serverConfig[
        keys.approved
      ] === "true",

    serverConfig:
      mapProductionConfigToProviderActivationV1(
        input.serverConfig,
      ),

    userId:
      input.userId,

    examProfileId:
      input.examProfileId,

    billingGate: {
      authority:
        "official_audit",

      auditVersion:
        AI_OPENAI_BILLING_AUDIT_V1_VERSION,

      inputCountEndpointBilling:
        AI_OPENAI_BILLING_AUDIT_V1
          .inputCountEndpointBilling,

      productionStaticBoundReady:
        input.serverConfig[
          keys.staticBoundReady
        ] === "true",
    },
  });
}


async function acquireReactiveCoachProductionFxSnapshotV1(
  input: {
    readonly fetchImpl:
      (
        url: string,
        init: RequestInit,
      ) => Promise<Response>;

    readonly loadedAt:
      string;
  },
): Promise<AiFxSnapshotV1> {
  const acquired =
    await acquireTcmbUsdTrySnapshotV1({
      fetchImpl:
        input.fetchImpl,

      loadedAt:
        input.loadedAt,
    });

  const validation =
    validateApprovedTcmbUsdTryFxSnapshotV1(
      acquired.snapshot,
      input.loadedAt,
    );

  if (!validation.valid) {
    throw new Error(
      `REACTIVE_COACH_PRODUCTION_FX_INVALID:${validation.reason}`,
    );
  }

  return acquired.snapshot;
}


export interface ReactiveCoachProductionProviderPreparationRequestV1 {
  readonly requestId:
    string;

  readonly requestedAt:
    string;
}


export type ReactiveCoachProductionProviderPreparationV1 =
  (
    request:
      ReactiveCoachProductionProviderPreparationRequestV1,
  ) => Promise<
    ReactiveCoachProviderExecutionInputV1
    | null
  >;


export function createReactiveCoachProductionProviderPreparationV1(
  input: {
    readonly serverConfig:
      Readonly<
        Record<
          string,
          string | undefined
        >
      >;

    readonly openAiApiKey:
      () => string | undefined;

    readonly serviceClient:
      Client;

    readonly userId:
      string;

    readonly examProfileId:
      string;

    readonly fetchImpl:
      (
        url: string,
        init: RequestInit,
      ) => Promise<Response>;

    readonly idFactory?:
      () => string;
  },
): ReactiveCoachProductionProviderPreparationV1 {
  return async (
    request,
  ) => {
    /*
     * Activation happens before secret/network access.
     */
    const activation =
      resolveReactiveCoachProductionRuntimeActivationV1({
        serverConfig:
          input.serverConfig,

        userId:
          input.userId,

        examProfileId:
          input.examProfileId,
      });

    if (
      activation.availability
        !== "available"
    ) {
      return null;
    }

    if (
      activation.scope
        !== REACTIVE_COACH_PRODUCTION_SCOPE_V1
      || activation.deploymentEnvironment
        !== "production"
      || activation.userId
        !== input.userId
      || activation.examProfileId
        !== input.examProfileId
      || activation.serverOwned
        !== true
      || activation.productionAllowed
        !== true
      || activation.inputCountBillingAuthority
        !== "not_applicable_static_bound"
    ) {
      throw new Error(
        "REACTIVE_COACH_PRODUCTION_RUNTIME_AUTHORITY_INVALID",
      );
    }

    const requestedAtMs =
      Date.parse(
        request.requestedAt,
      );

    if (
      !request.requestId.trim()
      || !request.requestedAt.includes("T")
      || !Number.isFinite(
        requestedAtMs,
      )
    ) {
      throw new Error(
        "REACTIVE_COACH_PRODUCTION_RUNTIME_INPUT_INVALID",
      );
    }

    /*
     * Network begins only after exact production authority is established.
     * This fetch is TCMB only. OpenAI generation is later in the orchestrator.
     */
    const fxSnapshot =
      await acquireReactiveCoachProductionFxSnapshotV1({
        fetchImpl:
          input.fetchImpl,

        loadedAt:
          request.requestedAt,
      });

    /*
     * Secret read is lazy and occurs only for the approved exact profile.
     */
    const credential =
      loadOpenAiServerCredentialV1({
        OPENAI_API_KEY:
          input.openAiApiKey(),
      });

    const generationTransport =
      createOpenAiProductionGenerationTransportV1({
        activation,

        credential,

        fetchImpl:
          input.fetchImpl,
      });

    const idFactory =
      input.idFactory
      ?? (() =>
        crypto.randomUUID());

    const reservationId =
      idFactory();

    const providerAttemptId =
      idFactory();

    if (
      !reservationId.trim()
      || !providerAttemptId.trim()
      || reservationId
        === providerAttemptId
    ) {
      throw new Error(
        "REACTIVE_COACH_PRODUCTION_RUNTIME_IDENTITY_INVALID",
      );
    }

    const reservationExpiresAt =
      new Date(
        requestedAtMs
        + 10 * 60 * 1_000,
      ).toISOString();

    const providerExecution:
      ReactiveCoachProviderExecutionInputV1 =
        Object.freeze({
          serviceClient:
            input.serviceClient,

          correlationId:
            request.requestId,

          reservationId,

          providerAttemptId,

          reservationExpiresAt,

          retryNumber:
            0,

          fallbackFromAttemptId:
            null,

          runtimeEnvironment:
            "production",

          routingBudgetState:
            "normal",

          routeCatalog:
            AI_OPENAI_ROUTE_CATALOG_V1,

          pricingCatalog:
            AI_OPENAI_PRICING_CATALOG_V1,

          fxSnapshot,

          providerRuntimeActivation:
            activation,

          productionStaticBoundSource:
            productionStaticBoundSourceV1(
              request.requestedAt,
            ),

          dependencies:
            Object.freeze({
              generationTransport,
            }),
        });

    return providerExecution;
  };
}