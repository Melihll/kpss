import {
  buildCoachContextV1,
} from "../supabase/functions/_shared/ai-coach.bundle.js";

import {
  coachContextV1Fixture,
} from "../packages/domain/src/ai-coach/fixtures/coach-context-v1.ts";

import {
  AI_PROVIDER_RUNTIME_SERVER_KEYS_V1,
} from "../supabase/functions/_shared/ai-coach/provider-runtime-activation-v1.ts";

import {
  AI_TCMB_DAILY_RATES_XML_URL_V1,
} from "../supabase/functions/_shared/ai-coach/provider-fx-acquisition-v1.ts";

import {
  acquireControlledDevFxSnapshotForOperatorV1,
  prepareControlledDevSmokeRuntimeV1,
} from "../supabase/functions/_shared/ai-coach/controlled-dev-smoke-runtime-v1.ts";

import {
  OPENAI_API_ORIGIN_V1,
  OPENAI_INPUT_TOKENS_PATH_V1,
  OPENAI_RESPONSES_PATH_V1,
  createOpenAiDevGatewayV1,
  openAiDevGatewayAsOrchestratorTransportsV1,
} from "../supabase/functions/_shared/ai-coach/openai-dev-gateway-v1.ts";

import {
  runReadOnlyCoachCapabilityV1,
} from "../supabase/functions/_shared/ai-coach/read-only-coach-orchestrator-v1.ts";

const args = process.argv.slice(2);

if (args.length !== 0) {
  throw new Error(
    "DRY_RUN_ONLY: no live/provider arguments accepted",
  );
}

const NOW = "2026-09-12T10:00:00.000Z";
const EXPIRES_AT = "2026-09-12T10:10:00.000Z";

const FAKE_OPENAI_KEY =
  "sk-controlled-dev-a-z-dry-run-only-1234567890";

const TCMB_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<Tarih_Date Tarih="11.09.2026" Date="09/11/2026" Bulten_No="2026/177">
  <Currency CrossOrder="0" Kod="USD" CurrencyCode="USD">
    <Unit>1</Unit>
    <Isim>ABD DOLARI</Isim>
    <CurrencyName>US DOLLAR</CurrencyName>
    <ForexBuying>41.1000</ForexBuying>
    <ForexSelling>41.2500</ForexSelling>
  </Currency>
</Tarih_Date>`;

const context =
  buildCoachContextV1(
    coachContextV1Fixture("healthy_normal_week"),
  );

const USER_ID = context.userId;
const PROFILE_ID = context.examProfileId;

if (!USER_ID || !PROFILE_ID) {
  throw new Error("DRY_RUN_CONTEXT_IDENTITY_INVALID");
}


/* ============================================================
 * MOCK TCMB
 * ============================================================ */

let tcmbMockCalls = 0;

const mockedTcmbFetch = async (
  url: string,
): Promise<Response> => {
  tcmbMockCalls += 1;

  if (url !== AI_TCMB_DAILY_RATES_XML_URL_V1) {
    throw new Error(`DRY_RUN_UNEXPECTED_TCMB_URL:${url}`);
  }

  return new Response(TCMB_FIXTURE, {
    status: 200,
    headers: {
      "Content-Type": "application/xml",
    },
  });
};

const acquiredFx =
  await acquireControlledDevFxSnapshotForOperatorV1({
    fetchImpl: mockedTcmbFetch,
    loadedAt: NOW,
  });


/* ============================================================
 * PREPARE CONTROLLED LOCAL DEV AUTHORITY
 * ============================================================ */

const keys = AI_PROVIDER_RUNTIME_SERVER_KEYS_V1;

const prepared =
  prepareControlledDevSmokeRuntimeV1({
    serverConfig: {
      [keys.enabled]: "true",
      [keys.environment]: "local_dev",
      [keys.scope]: "one_controlled_dev_smoke_v1",
      [keys.allowedUserId]: USER_ID,
      [keys.allowedProfileId]: PROFILE_ID,
      [keys.acceptUnresolvedCountBillingRisk]: "true",
    },

    serverSecrets: {
      OPENAI_API_KEY: FAKE_OPENAI_KEY,
    },

    userId: USER_ID,
    examProfileId: PROFILE_ID,

    fxSnapshot: acquiredFx.snapshot,
    evaluatedAt: NOW,
  });


/* ============================================================
 * MOCK OPENAI HTTP
 *
 * Real gateway code is used. Only its injected fetch boundary is
 * mocked. Exactly two HTTP operations are permitted:
 *
 * 1. /responses/input_tokens
 * 2. /responses
 * ============================================================ */

const openAiHttpOrder: string[] = [];
let countHttpCalls = 0;
let generationHttpCalls = 0;

const EXACT_INPUT_TOKENS = 1_000;
const REPORTED_OUTPUT_TOKENS = 100;

const providerValue = {
  answer:
    "Sağlanan canonical kanıta göre bugünkü çalışma durumu okunabilir.",

  sourceFactPaths: [
    "evidence.today",
  ],

  acknowledgedUnknowns: [],
  staleOrBlockedWarnings: [],
};

const mockedOpenAiFetch = async (
  url: string,
  init: RequestInit,
): Promise<Response> => {
  if (init.method !== "POST") {
    throw new Error("DRY_RUN_OPENAI_METHOD_INVALID");
  }

  const headers = new Headers(init.headers);

  if (
    headers.get("Authorization")
    !== `Bearer ${FAKE_OPENAI_KEY}`
  ) {
    throw new Error("DRY_RUN_OPENAI_CREDENTIAL_INVALID");
  }

  if (
    headers.get("Content-Type") !== "application/json"
  ) {
    throw new Error("DRY_RUN_OPENAI_CONTENT_TYPE_INVALID");
  }

  if (!headers.get("X-Client-Request-Id")) {
    throw new Error("DRY_RUN_OPENAI_CLIENT_REQUEST_ID_MISSING");
  }

  const body =
    JSON.parse(String(init.body ?? "{}")) as
      Record<string, unknown>;

  if (
    url
    === `${OPENAI_API_ORIGIN_V1}${OPENAI_INPUT_TOKENS_PATH_V1}`
  ) {
    countHttpCalls += 1;
    openAiHttpOrder.push("count");

    if (countHttpCalls !== 1) {
      throw new Error("DRY_RUN_DUPLICATE_COUNT_CALL");
    }

    if (
      body.model !== "gpt-5.4-mini-2026-03-17"
    ) {
      throw new Error(
        `DRY_RUN_COUNT_MODEL_INVALID:${String(body.model)}`,
      );
    }

    return new Response(
      JSON.stringify({
        object: "response.input_tokens",
        input_tokens: EXACT_INPUT_TOKENS,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "x-request-id": "req_count_dry_run_1",
        },
      },
    );
  }

  if (
    url
    === `${OPENAI_API_ORIGIN_V1}${OPENAI_RESPONSES_PATH_V1}`
  ) {
    generationHttpCalls += 1;
    openAiHttpOrder.push("generation");

    if (generationHttpCalls !== 1) {
      throw new Error(
        "DRY_RUN_DUPLICATE_GENERATION_CALL",
      );
    }

    if (
      body.model !== "gpt-5.4-mini-2026-03-17"
      || body.store !== false
      || body.tool_choice !== "none"
      || !Array.isArray(body.tools)
      || body.tools.length !== 0
      || body.max_output_tokens !== 900
    ) {
      throw new Error(
        "DRY_RUN_GENERATION_REQUEST_CONTRACT_INVALID",
      );
    }

    return new Response(
      JSON.stringify({
        id: "resp_controlled_dev_dry_run_1",
        status: "completed",

        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify(providerValue),
              },
            ],
          },
        ],

        usage: {
          input_tokens: EXACT_INPUT_TOKENS,

          input_tokens_details: {
            cached_tokens: 0,
            cache_write_tokens: 0,
          },

          output_tokens: REPORTED_OUTPUT_TOKENS,

          output_tokens_details: {
            reasoning_tokens: 20,
          },

          total_tokens:
            EXACT_INPUT_TOKENS
            + REPORTED_OUTPUT_TOKENS,
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "x-request-id":
            "req_generation_dry_run_1",
        },
      },
    );
  }

  throw new Error(
    `DRY_RUN_UNEXPECTED_OPENAI_URL:${url}`,
  );
};


const gateway =
  createOpenAiDevGatewayV1({
    activation: prepared.activation,
    credential: prepared.credential,

    fetchImpl: mockedOpenAiFetch,

    now: () => new Date(NOW),

    countTimeoutMs: 1_000,
    generationTimeoutMs: 1_000,
  });

const transports =
  openAiDevGatewayAsOrchestratorTransportsV1(
    gateway,
  );


/* ============================================================
 * MOCK ACCOUNTING
 *
 * No Supabase client or RPC is used.
 * ============================================================ */

const accountingOrder: string[] = [];

const counters = {
  reserve: 0,
  markStarted: 0,
  settle: 0,
  release: 0,
  reconcile: 0,
};

const reservations: any[] = [];
const usageEvents: any[] = [];

const accounting = {
  reserve: async (input: any) => {
    counters.reserve += 1;
    accountingOrder.push("reserve");

    if (
      input.userId !== USER_ID
      || input.examProfileId !== PROFILE_ID
    ) {
      throw new Error(
        "DRY_RUN_ACCOUNTING_IDENTITY_INVALID",
      );
    }

    if (
      input.route.runtimeEnvironment !== "local"
      || input.costAuthorization.authority
        !== "controlled_dev_runtime"
      || input.costAuthorization.runtimeEnvironment
        !== "local"
      || input.costAuthorization.inputTokenUpperBound
        !== EXACT_INPUT_TOKENS
      || input.costAuthorization.outputTokenUpperBound
        !== 900
      || !Number.isFinite(
        input.costAuthorization.tryMaximum,
      )
      || input.costAuthorization.tryMaximum <= 0
    ) {
      throw new Error(
        "DRY_RUN_COST_AUTHORIZATION_INVALID",
      );
    }

    reservations.push(input);

    return {
      allowed: true,
      reason: "reserved",
      reservationId: input.reservationId,
      status: "active",
      accountingMonth: "2026-09",
      committedTry:
        input.costAuthorization.tryMaximum,
      idempotent: false,
    };
  },

  markStarted: async (input: any) => {
    counters.markStarted += 1;
    accountingOrder.push("markStarted");

    if (
      input.reservationId !== "reservation-dry-run-1"
      || input.providerAttemptId
        !== "attempt-dry-run-1"
    ) {
      throw new Error(
        "DRY_RUN_ATTEMPT_IDENTITY_INVALID",
      );
    }

    return {};
  },

  settle: async (input: any) => {
    counters.settle += 1;
    accountingOrder.push("settle");

    usageEvents.push(input.event);

    return {
      status: "settled",
    };
  },

  release: async () => {
    counters.release += 1;
    accountingOrder.push("release");

    return {};
  },

  reconcile: async () => {
    counters.reconcile += 1;
    accountingOrder.push("reconcile");

    return {};
  },
};


/* ============================================================
 * RUN REAL ORCHESTRATOR CODE
 * ============================================================ */

const result =
  await runReadOnlyCoachCapabilityV1({
    contextClient: {},
    serviceClient: {},

    userId: USER_ID,
    examProfileId: PROFILE_ID,

    capability: "today_analysis",

    requestId: "request-dry-run-1",
    correlationId: "correlation-dry-run-1",

    reservationId: "reservation-dry-run-1",
    providerAttemptId: "attempt-dry-run-1",

    requestedAt: NOW,
    reservationExpiresAt: EXPIRES_AT,

    retryNumber: 0,
    fallbackFromAttemptId: null,

    runtimeEnvironment: "local",
    routingBudgetState: "normal",

    routeCatalog: prepared.routeCatalog,
    pricingCatalog: prepared.pricingCatalog,
    fxSnapshot: prepared.fxSnapshot,

    providerRuntimeActivation:
      prepared.activation,

    dependencies: {
      loadContext: async () => context,

      inputCountTransport:
        transports.inputCountTransport,

      generationTransport:
        transports.generationTransport,

      accounting,
    },
  } as any);


/* ============================================================
 * FINAL ASSERTIONS
 * ============================================================ */

if (result.noMutationPerformed !== true) {
  throw new Error(
    "DRY_RUN_MUTATION_CONTRACT_INVALID",
  );
}

if (
  countHttpCalls !== 1
  || generationHttpCalls !== 1
  || JSON.stringify(openAiHttpOrder)
    !== JSON.stringify(["count", "generation"])
) {
  throw new Error(
    "DRY_RUN_PROVIDER_CALL_SEQUENCE_INVALID",
  );
}

if (
  counters.reserve !== 1
  || counters.markStarted !== 1
  || counters.settle !== 1
  || counters.release !== 0
  || counters.reconcile !== 0
) {
  throw new Error(
    "DRY_RUN_ACCOUNTING_SEQUENCE_INVALID",
  );
}

if (
  JSON.stringify(accountingOrder)
  !== JSON.stringify([
    "reserve",
    "markStarted",
    "settle",
  ])
) {
  throw new Error(
    "DRY_RUN_ACCOUNTING_ORDER_INVALID",
  );
}

if (reservations.length !== 1) {
  throw new Error(
    "DRY_RUN_RESERVATION_COUNT_INVALID",
  );
}

if (usageEvents.length !== 1) {
  throw new Error(
    "DRY_RUN_USAGE_EVENT_COUNT_INVALID",
  );
}

const reservation = reservations[0];
const usageEvent = usageEvents[0];

if (
  reservation.costAuthorization.authority
    !== "controlled_dev_runtime"
  || reservation.costAuthorization.runtimeEnvironment
    !== "local"
) {
  throw new Error(
    "DRY_RUN_RESERVATION_AUTHORITY_INVALID",
  );
}

if (
  usageEvent.usage.availability !== "reported"
  || usageEvent.usage.inputTokens
    !== EXACT_INPUT_TOKENS
  || usageEvent.usage.outputTokens
    !== REPORTED_OUTPUT_TOKENS
) {
  throw new Error(
    "DRY_RUN_USAGE_INVALID",
  );
}

if (
  usageEvent.nativeCost.state !== "known"
  || usageEvent.tryCost.state !== "known"
) {
  throw new Error(
    "DRY_RUN_COST_SETTLEMENT_INVALID",
  );
}

if (
  result.observability.modelId
    !== "gpt-5.4-mini-2026-03-17"
  || result.observability.routeTier
    !== "standard"
  || result.observability.countProviderRequestId
    !== "req_count_dry_run_1"
  || result.observability.providerRequestId
    !== "req_generation_dry_run_1"
) {
  throw new Error(
    "DRY_RUN_OBSERVABILITY_INVALID",
  );
}

const serialized = JSON.stringify({
  prepared,
  result,
});

if (
  serialized.includes(FAKE_OPENAI_KEY)
  || serialized.includes(
    `Bearer ${FAKE_OPENAI_KEY}`,
  )
) {
  throw new Error("DRY_RUN_SECRET_LEAK");
}


/* ============================================================
 * SAFE SUMMARY
 * ============================================================ */

console.log(JSON.stringify({
  status: "GREEN",

  mode:
    "controlled_dev_full_a_to_z_mocked_smoke",

  network: {
    realTcmbCalls: 0,
    realOpenAiCalls: 0,

    mockedTcmbCalls:
      tcmbMockCalls,

    mockedOpenAiCountCalls:
      countHttpCalls,

    mockedOpenAiGenerationCalls:
      generationHttpCalls,

    openAiHttpOrder,
  },

  authority: {
    activationEnvironment:
      prepared.activation.deploymentEnvironment,

    activationScope:
      prepared.activation.scope,

    inputCountBillingAuthority:
      prepared.activation.inputCountBillingAuthority,

    transportAuthority:
      transports.inputCountTransport.authority,

    costAuthorizationAuthority:
      reservation.costAuthorization.authority,

    runtimeEnvironment:
      reservation.costAuthorization.runtimeEnvironment,

    productionAllowed:
      prepared.activation.productionAllowed,
  },

  route: {
    tier:
      result.observability.routeTier,

    modelId:
      result.observability.modelId,

    maxOutputTokens:
      reservation.costAuthorization.outputTokenUpperBound,

    inputTokenBound:
      reservation.costAuthorization.inputTokenUpperBound,

    retryNumber: 0,
    fallbackFromAttemptId: null,
  },

  accounting: {
    order: accountingOrder,

    reserve:
      counters.reserve,

    markStarted:
      counters.markStarted,

    settle:
      counters.settle,

    release:
      counters.release,

    reconcile:
      counters.reconcile,

    tryMaximum:
      reservation.costAuthorization.tryMaximum,

    actualTryCost:
      usageEvent.tryCost.amount,
  },

  response: {
    capability:
      result.response.capability,

    noMutationPerformed:
      result.noMutationPerformed,

    groundedSourceFactPaths:
      result.response.sourceFactPaths,
  },

  observability: {
    countProviderRequestId:
      result.observability.countProviderRequestId,

    providerRequestId:
      result.observability.providerRequestId,

    reservationId:
      result.observability.reservationId,

    providerAttemptId:
      result.observability.providerAttemptId,
  },

  credential:
    prepared.credential.toJSON(),

  productionAccess: 0,
  databaseCalls: 0,
  plannerCalls: 0,
  taskMutations: 0,
  deploys: 0,
  migrations: 0,
}, null, 2));
