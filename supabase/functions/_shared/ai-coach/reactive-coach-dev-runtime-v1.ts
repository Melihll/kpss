import type {
  AiFxSnapshotV1,
  AiPricingCatalogV1,
  AiRouteCatalogV1,
} from "../../../../packages/domain/src/ai-coach/ai-economics-v1.ts";

import {
  acquireTcmbUsdTrySnapshotV1,
} from "./provider-fx-acquisition-v1.ts";

import {
  validateApprovedTcmbUsdTryFxSnapshotV1,
} from "./provider-fx-policy-v1.ts";

import {
  createOpenAiDevGatewayV1,
  openAiDevGatewayAsOrchestratorTransportsV1,
} from "./openai-dev-gateway-v1.ts";

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


export const REACTIVE_COACH_DEV_RUNTIME_V1_VERSION =
  "reactive-coach-dev-runtime-v1" as const;

export const REACTIVE_COACH_DEV_SCOPE_V1 =
  "reactive_coach_dev_v1" as const;


export const REACTIVE_COACH_DEV_RUNTIME_SERVER_KEYS_V1 =
  Object.freeze({
    enabled:
      "AI_REACTIVE_COACH_DEV_RUNTIME_ENABLED",

    acceptUnresolvedCountBillingRisk:
      "AI_REACTIVE_COACH_DEV_RUNTIME_ACCEPT_UNRESOLVED_COUNT_BILLING_RISK",

    environment:
      "AI_REACTIVE_COACH_DEV_RUNTIME_ENVIRONMENT",

    allowedUserId:
      "AI_REACTIVE_COACH_DEV_RUNTIME_ALLOWED_USER_ID",

    allowedProfileId:
      "AI_REACTIVE_COACH_DEV_RUNTIME_ALLOWED_PROFILE_ID",
  } as const);


export const AI_OPENAI_REACTIVE_COACH_DEV_ROUTE_CATALOG_V1:
  AiRouteCatalogV1 = Object.freeze({
    ...AI_OPENAI_ROUTE_CATALOG_V1,

    version:
      `${AI_OPENAI_ROUTE_CATALOG_V1.version}-reactive-coach-dev-v1`,

    environment:
      "local",

    routes:
      Object.freeze(
        AI_OPENAI_ROUTE_CATALOG_V1.routes.map(
          (route) =>
            Object.freeze({
              ...route,

              retryPolicy:
                Object.freeze({
                  maxAttempts:
                    1,

                  retryableCategories:
                    Object.freeze([]),
                }),

              fallbackTier:
                null,
            }),
        ),
      ),
  });


export const AI_OPENAI_REACTIVE_COACH_DEV_PRICING_CATALOG_V1:
  AiPricingCatalogV1 = Object.freeze({
    ...AI_OPENAI_PRICING_CATALOG_V1,

    environment:
      "local",

    entries:
      Object.freeze(
        AI_OPENAI_PRICING_CATALOG_V1.entries.map(
          (entry) =>
            Object.freeze({
              ...entry,

              sourceKind:
                "authoritative_config" as const,
            }),
        ),
      ),
  });


type AvailableActivation =
  Extract<
    AiProviderRuntimeActivationV1,
    { availability: "available" }
  >;


type UnavailableActivation =
  Extract<
    AiProviderRuntimeActivationV1,
    { availability: "unavailable" }
  >;


export type ReactiveCoachDevDeploymentEnvironmentV1 =
  | "local_dev"
  | "production";


export type ReactiveCoachDevRuntimePreparationV1 =
  | Readonly<{
      version:
        typeof REACTIVE_COACH_DEV_RUNTIME_V1_VERSION;

      availability:
        "unavailable";

      reason:
        UnavailableActivation["reason"];

      providerCallMade:
        false;

      productionAllowed:
        false;
    }>
  | Readonly<{
      version:
        typeof REACTIVE_COACH_DEV_RUNTIME_V1_VERSION;

      availability:
        "available";

      activation:
        AvailableActivation;

      providerExecution:
        ReactiveCoachProviderExecutionInputV1;

      providerCallMade:
        false;

      productionAllowed:
        false;
    }>;


type Client =
  any;


export function resolveReactiveCoachDeploymentEnvironmentV1(
  supabaseUrl:
    string | undefined,
): ReactiveCoachDevDeploymentEnvironmentV1 {
  if (!supabaseUrl) {
    return "production";
  }

  try {
    const parsed =
      new URL(
        supabaseUrl,
      );

    const hostname =
      parsed.hostname
        .toLocaleLowerCase(
          "en-US",
        );

    if (
      hostname === "127.0.0.1"
      || hostname === "localhost"
      || hostname === "::1"
      || hostname === "[::1]"
    ) {
      return "local_dev";
    }
  }
  catch {
    return "production";
  }

  return "production";
}


function mapDedicatedConfigToProviderActivationV1(
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
    REACTIVE_COACH_DEV_RUNTIME_SERVER_KEYS_V1;

  const generic =
    AI_PROVIDER_RUNTIME_SERVER_KEYS_V1;

  return Object.freeze({
    [generic.enabled]:
      serverConfig[
        dedicated.enabled
      ],

    [generic.acceptUnresolvedCountBillingRisk]:
      serverConfig[
        dedicated.acceptUnresolvedCountBillingRisk
      ],

    [generic.environment]:
      serverConfig[
        dedicated.environment
      ],

    [generic.scope]:
      REACTIVE_COACH_DEV_SCOPE_V1,

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


export function resolveReactiveCoachDevRuntimeActivationV1(
  input: {
    readonly deploymentEnvironment:
      ReactiveCoachDevDeploymentEnvironmentV1;

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
  return resolveAiProviderRuntimeActivationV1({
    deploymentEnvironment:
      input.deploymentEnvironment,

    serverConfig:
      mapDedicatedConfigToProviderActivationV1(
        input.serverConfig,
      ),

    userId:
      input.userId,

    examProfileId:
      input.examProfileId,

    localDevScope:
      REACTIVE_COACH_DEV_SCOPE_V1,
  });
}


async function acquireReactiveCoachDevFxSnapshotV1(
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
      `REACTIVE_COACH_DEV_FX_INVALID:${validation.reason}`,
    );
  }

  return acquired.snapshot;
}


export async function prepareReactiveCoachDevRuntimeV1(
  input: {
    readonly deploymentEnvironment:
      ReactiveCoachDevDeploymentEnvironmentV1;

    readonly serverConfig:
      Readonly<
        Record<
          string,
          string | undefined
        >
      >;

    readonly serverSecrets:
      Readonly<
        Record<
          string,
          string | undefined
        >
      >;

    readonly serviceClient:
      Client;

    readonly userId:
      string;

    readonly examProfileId:
      string;

    readonly requestId:
      string;

    readonly requestedAt:
      string;

    readonly fetchImpl:
      (
        url: string,
        init: RequestInit,
      ) => Promise<Response>;

    readonly idFactory?:
      () => string;
  },
): Promise<ReactiveCoachDevRuntimePreparationV1> {
  const requestedAtMs =
    Date.parse(
      input.requestedAt,
    );

  if (
    !input.userId.trim()
    || !input.examProfileId.trim()
    || !input.requestId.trim()
    || !input.requestedAt.includes("T")
    || !Number.isFinite(
      requestedAtMs,
    )
  ) {
    throw new Error(
      "REACTIVE_COACH_DEV_RUNTIME_INPUT_INVALID",
    );
  }

  const activation =
    resolveReactiveCoachDevRuntimeActivationV1({
      deploymentEnvironment:
        input.deploymentEnvironment,

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
    return Object.freeze({
      version:
        REACTIVE_COACH_DEV_RUNTIME_V1_VERSION,

      availability:
        "unavailable" as const,

      reason:
        activation.reason,

      providerCallMade:
        false as const,

      productionAllowed:
        false as const,
    });
  }

  if (
    activation.scope
      !== REACTIVE_COACH_DEV_SCOPE_V1

    || activation.deploymentEnvironment
      !== "local_dev"

    || activation.userId
      !== input.userId

    || activation.examProfileId
      !== input.examProfileId

    || activation.serverOwned
      !== true

    || activation.productionAllowed
      !== false
  ) {
    throw new Error(
      "REACTIVE_COACH_DEV_RUNTIME_AUTHORITY_INVALID",
    );
  }

  const fxSnapshot =
    await acquireReactiveCoachDevFxSnapshotV1({
      fetchImpl:
        input.fetchImpl,

      loadedAt:
        input.requestedAt,
    });

  const credential =
    loadOpenAiServerCredentialV1(
      input.serverSecrets,
    );

  const gateway =
    createOpenAiDevGatewayV1({
      activation,
      credential,

      fetchImpl:
        input.fetchImpl,
    });

  const transports =
    openAiDevGatewayAsOrchestratorTransportsV1(
      gateway,
    );

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
    || reservationId === providerAttemptId
  ) {
    throw new Error(
      "REACTIVE_COACH_DEV_RUNTIME_IDENTITY_INVALID",
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
          input.requestId,

        reservationId,

        providerAttemptId,

        reservationExpiresAt,

        retryNumber:
          0,

        fallbackFromAttemptId:
          null,

        runtimeEnvironment:
          "local",

        routingBudgetState:
          "normal",

        routeCatalog:
          AI_OPENAI_REACTIVE_COACH_DEV_ROUTE_CATALOG_V1,

        pricingCatalog:
          AI_OPENAI_REACTIVE_COACH_DEV_PRICING_CATALOG_V1,

        fxSnapshot,

        providerRuntimeActivation:
          activation,

        dependencies:
          Object.freeze({
            inputCountTransport:
              transports.inputCountTransport,

            generationTransport:
              transports.generationTransport,
          }),
      });

  return Object.freeze({
    version:
      REACTIVE_COACH_DEV_RUNTIME_V1_VERSION,

    availability:
      "available" as const,

    activation,

    providerExecution,

    providerCallMade:
      false as const,

    productionAllowed:
      false as const,
  });
}

export interface ReactiveCoachDevProviderPreparationRequestV1 {
  readonly requestId:
    string;

  readonly requestedAt:
    string;
}


export type ReactiveCoachDevProviderPreparationV1 =
  (
    input:
      ReactiveCoachDevProviderPreparationRequestV1,
  ) => Promise<
    ReactiveCoachProviderExecutionInputV1
    | null
  >;


export function createReactiveCoachDevProviderPreparationV1(
  input: {
    readonly deploymentEnvironment:
      ReactiveCoachDevDeploymentEnvironmentV1;

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
): ReactiveCoachDevProviderPreparationV1 {
  return async (
    request,
  ) => {
    const activation =
      resolveReactiveCoachDevRuntimeActivationV1({
        deploymentEnvironment:
          input.deploymentEnvironment,

        serverConfig:
          input.serverConfig,

        userId:
          input.userId,

        examProfileId:
          input.examProfileId,
      });

    // Critical lazy boundary:
    // production, OFF, malformed and non-allowlisted requests stop
    // before reading the OpenAI secret or making TCMB/OpenAI calls.
    if (
      activation.availability
        !== "available"
    ) {
      return null;
    }

    const prepared =
      await prepareReactiveCoachDevRuntimeV1({
        deploymentEnvironment:
          input.deploymentEnvironment,

        serverConfig:
          input.serverConfig,

        serverSecrets: {
          OPENAI_API_KEY:
            input.openAiApiKey(),
        },

        serviceClient:
          input.serviceClient,

        userId:
          input.userId,

        examProfileId:
          input.examProfileId,

        requestId:
          request.requestId,

        requestedAt:
          request.requestedAt,

        fetchImpl:
          input.fetchImpl,

        idFactory:
          input.idFactory,
      });

    if (
      prepared.availability
        !== "available"
    ) {
      return null;
    }

    return prepared.providerExecution;
  };
}
