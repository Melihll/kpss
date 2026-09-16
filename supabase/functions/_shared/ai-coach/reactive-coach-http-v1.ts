import {
  executeReactiveCoachRequestV1,
  type ReactiveCoachExecutionResultV1,
  type ReactiveCoachProviderExecutionInputV1,
} from "./reactive-coach-executor-v1.ts";

import {
  routeReactiveCoachRequestV1,
  type ReactiveCoachRouteDecisionV1,
} from "./reactive-coach-route-v1.ts";


export const REACTIVE_COACH_HTTP_V1_VERSION =
  "reactive-coach-http-v1" as const;

export const REACTIVE_COACH_HTTP_MESSAGE_MAX_LENGTH =
  2_000;


type Client = any;


export interface ReactiveCoachHttpDependenciesV1 {
  readonly execute:
    typeof executeReactiveCoachRequestV1;

  readonly prepareProviderExecution?:
    (input: {
      readonly requestId: string;
      readonly requestedAt: string;
    }) => Promise<
      ReactiveCoachProviderExecutionInputV1
      | null
    >;
}


export interface HandleReactiveCoachHttpInputV1 {
  readonly body:
    unknown;

  readonly contextClient:
    Client;

  readonly userId:
    string;

  readonly examProfileId:
    string;

  readonly requestId:
    string;

  readonly requestedAt:
    string;

  readonly dependencies?:
    Partial<ReactiveCoachHttpDependenciesV1>;
}


export interface ReactiveCoachHttpResultV1 {
  readonly status:
    number;

  readonly body:
    unknown;
}


const DEFAULT_DEPENDENCIES:
  ReactiveCoachHttpDependenciesV1 = {
    execute:
      executeReactiveCoachRequestV1,
  };


function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object"
    && value !== null
    && !Array.isArray(value)
  );
}


function errorResult(
  code: string,
  message: string,
  status: number,
): ReactiveCoachHttpResultV1 {
  return {
    status,

    body: {
      error: {
        code,
        message,
      },
    },
  };
}


function providerUnavailableResult(
  route: ReactiveCoachRouteDecisionV1,
): ReactiveCoachHttpResultV1 {
  return {
    status: 503,

    body: {
      version:
        REACTIVE_COACH_HTTP_V1_VERSION,

      status:
        "PROVIDER_UNAVAILABLE",

      route,

      response: {
        state:
          "UNKNOWN_OR_BLOCKED",

        executionTier:
          "PROVIDER_READ_ONLY",

        capability:
          route.capability,

        deterministicKind:
          null,

        answer:
          "Bu analiz icin model kullanimi su anda aktif degil. Eksik sonucu tahmin etmiyorum ve herhangi bir plan veya gorev degisikligi yapmiyorum.",

        sourceFactPaths: [],
        acknowledgedUnknowns: [
          "provider_runtime",
        ],
        staleOrBlockedWarnings: [],

        providerAttempted:
          false,

        providerUsed:
          false,

        noMutationPerformed:
          true,
      },

      provider:
        null,
    },
  };
}


function executionPreservesNoMutationAuthority(
  result: ReactiveCoachExecutionResultV1,
  expectedRoute: ReactiveCoachRouteDecisionV1,
): boolean {
  return (
    result.route.executionTier
      === expectedRoute.executionTier

    && result.route.capability
      === expectedRoute.capability

    && result.response.noMutationPerformed
      === true

    && result.route.authority
      .taskMutationAllowed
      === false

    && result.route.authority
      .plannerMutationAllowed
      === false

    && result.route.authority
      .capacityMutationAllowed
      === false

    && result.route.authority
      .confirmationAllowed
      === false

    && result.route.authority
      .applyAllowed
      === false
  );
}


function executionIsSafeForRoute(
  result: ReactiveCoachExecutionResultV1,
  expectedRoute: ReactiveCoachRouteDecisionV1,
): boolean {
  if (
    !executionPreservesNoMutationAuthority(
      result,
      expectedRoute,
    )
  ) {
    return false;
  }

  if (
    expectedRoute.executionTier
      === "T0_DETERMINISTIC"
  ) {
    return (
      result.response.executionTier
        === "T0_DETERMINISTIC"

      && result.response.providerAttempted
        === false

      && result.response.providerUsed
        === false

      && result.provider
        === null
    );
  }

  if (
    result.response.executionTier
      !== "PROVIDER_READ_ONLY"
  ) {
    return false;
  }

  if (
    result.response.capability
      !== expectedRoute.capability
  ) {
    return false;
  }

  if (
    result.response.providerUsed
      === true
  ) {
    return (
      result.response.providerAttempted
        === true

      && result.provider
        !== null
    );
  }

  return result.provider === null;
}

export async function handleReactiveCoachHttpV1(
  input: HandleReactiveCoachHttpInputV1,
): Promise<ReactiveCoachHttpResultV1> {
  if (
    !input.userId.trim()
    || !input.examProfileId.trim()
    || !input.requestId.trim()
  ) {
    return errorResult(
      "REACTIVE_COACH_SERVER_IDENTITY_INVALID",
      "Server-owned identity is required",
      500,
    );
  }

  if (
    !input.requestedAt.includes("T")
    || !Number.isFinite(
      Date.parse(
        input.requestedAt,
      ),
    )
  ) {
    return errorResult(
      "REACTIVE_COACH_SERVER_TIME_INVALID",
      "Server-owned request time is invalid",
      500,
    );
  }

  if (!isRecord(input.body)) {
    return errorResult(
      "INVALID_REQUEST",
      "JSON object required",
      400,
    );
  }

  const keys =
    Object.keys(
      input.body,
    );

  if (
    keys.some(
      (key) =>
        key !== "message",
    )
  ) {
    return errorResult(
      "REACTIVE_COACH_CLIENT_AUTHORITY_REFUSED",
      "Only message is accepted",
      400,
    );
  }

  if (
    typeof input.body.message
      !== "string"
  ) {
    return errorResult(
      "INVALID_MESSAGE",
      "Non-blank message required",
      400,
    );
  }

  const message =
    input.body.message.trim();

  if (!message) {
    return errorResult(
      "INVALID_MESSAGE",
      "Non-blank message required",
      400,
    );
  }

  if (
    message.length
      > REACTIVE_COACH_HTTP_MESSAGE_MAX_LENGTH
  ) {
    return errorResult(
      "MESSAGE_TOO_LONG",
      "Message exceeds 2000 characters",
      400,
    );
  }

  let route:
    ReactiveCoachRouteDecisionV1;

  try {
    route =
      routeReactiveCoachRequestV1(
        message,
      );
  }
  catch {
    return errorResult(
      "INVALID_MESSAGE",
      "Message could not be routed",
      400,
    );
  }

  const dependencies = {
    ...DEFAULT_DEPENDENCIES,
    ...input.dependencies,
  };

  let provider:
    ReactiveCoachProviderExecutionInputV1
    | undefined;

  if (
    route.executionTier
      === "PROVIDER_READ_ONLY"
  ) {
    if (
      !dependencies.prepareProviderExecution
    ) {
      return providerUnavailableResult(
        route,
      );
    }

    try {
      const preparedProvider =
        await dependencies
          .prepareProviderExecution({
            requestId:
              input.requestId,

            requestedAt:
              input.requestedAt,
          });

      if (!preparedProvider) {
        return providerUnavailableResult(
          route,
        );
      }

      provider =
        preparedProvider;
    }
    catch {
      return providerUnavailableResult(
        route,
      );
    }
  }

  let execution:
    ReactiveCoachExecutionResultV1;

  try {
    execution =
      await dependencies.execute({
        contextClient:
          input.contextClient,

        userId:
          input.userId,

        examProfileId:
          input.examProfileId,

        rawMessage:
          message,

        requestId:
          input.requestId,

        requestedAt:
          input.requestedAt,

        ...(provider
          ? { provider }
          : {}),
      });
  }
  catch {
    return errorResult(
      "REACTIVE_COACH_EXECUTION_FAILED",
      "Reactive Coach request could not be completed",
      500,
    );
  }

  if (
    !executionIsSafeForRoute(
      execution,
      route,
    )
  ) {
    return errorResult(
      "REACTIVE_COACH_BOUNDARY_CONTRACT_FAILED",
      "Reactive Coach safety contract failed",
      500,
    );
  }

  return {
    status: 200,

    body: {
      version:
        REACTIVE_COACH_HTTP_V1_VERSION,

      status:
        "OK",

      execution,
    },
  };
}
