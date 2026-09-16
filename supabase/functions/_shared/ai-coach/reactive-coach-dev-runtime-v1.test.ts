import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  AI_PROVIDER_RUNTIME_SERVER_KEYS_V1,
  resolveAiProviderRuntimeActivationV1,
} from "./provider-runtime-activation-v1.ts";

import {
  AI_OPENAI_REACTIVE_COACH_DEV_ROUTE_CATALOG_V1,
  REACTIVE_COACH_DEV_RUNTIME_SERVER_KEYS_V1,
  createReactiveCoachDevProviderPreparationV1,
  prepareReactiveCoachDevRuntimeV1,
  resolveReactiveCoachDeploymentEnvironmentV1,
} from "./reactive-coach-dev-runtime-v1.ts";


const USER_ID =
  "user-reactive-dev";

const PROFILE_ID =
  "profile-reactive-dev";

const REQUEST_ID =
  "request-reactive-dev";

const AT =
  "2026-09-16T10:00:00.000Z";

const FAKE_KEY =
  "sk-reactive-coach-dev-fake-key-1234567890";


const TCMB_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Tarih_Date Tarih="15.09.2026" Date="09/15/2026" Bulten_No="2026/180">
  <Currency CrossOrder="0" Kod="USD" CurrencyCode="USD">
    <Unit>1</Unit>
    <Isim>ABD DOLARI</Isim>
    <CurrencyName>US DOLLAR</CurrencyName>
    <ForexBuying>41.1000</ForexBuying>
    <ForexSelling>41.2000</ForexSelling>
  </Currency>
</Tarih_Date>`;


function dedicatedConfig() {
  const keys =
    REACTIVE_COACH_DEV_RUNTIME_SERVER_KEYS_V1;

  return {
    [keys.enabled]:
      "true",

    [keys.environment]:
      "local_dev",

    [keys.allowedUserId]:
      USER_ID,

    [keys.allowedProfileId]:
      PROFILE_ID,

    [keys.acceptUnresolvedCountBillingRisk]:
      "true",
  };
}


function ids() {
  const values = [
    "00000000-0000-4000-8000-000000000001",
    "00000000-0000-4000-8000-000000000002",
  ];

  let index =
    0;

  return () =>
    values[index++]!;
}


function tcmbFetch() {
  return vi.fn(
    async (
      url: string,
    ) => {
      expect(
        url.toLocaleLowerCase(
          "en-US",
        ),
      ).toContain(
        "tcmb",
      );

      return new Response(
        TCMB_XML,
        {
          status:
            200,

          headers: {
            "content-type":
              "application/xml",
          },
        },
      );
    },
  );
}


describe(
  "6C.3B dedicated Reactive Coach DEV runtime foundation",
  () => {
    it(
      "derives LOCAL DEV only from loopback Supabase URLs",
      () => {
        expect(
          resolveReactiveCoachDeploymentEnvironmentV1(
            "http://127.0.0.1:54321",
          ),
        ).toBe(
          "local_dev",
        );

        expect(
          resolveReactiveCoachDeploymentEnvironmentV1(
            "http://localhost:54321",
          ),
        ).toBe(
          "local_dev",
        );

        expect(
          resolveReactiveCoachDeploymentEnvironmentV1(
            "https://project.supabase.co",
          ),
        ).toBe(
          "production",
        );

        expect(
          resolveReactiveCoachDeploymentEnvironmentV1(
            undefined,
          ),
        ).toBe(
          "production",
        );
      },
    );


    it(
      "is default OFF and performs no network work",
      async () => {
        const fetchImpl =
          tcmbFetch();

        const result =
          await prepareReactiveCoachDevRuntimeV1({
            deploymentEnvironment:
              "local_dev",

            serverConfig:
              {},

            serverSecrets:
              {},

            serviceClient:
              {},

            userId:
              USER_ID,

            examProfileId:
              PROFILE_ID,

            requestId:
              REQUEST_ID,

            requestedAt:
              AT,

            fetchImpl,
          });

        expect(result)
          .toMatchObject({
            availability:
              "unavailable",

            reason:
              "runtime_switch_off",

            productionAllowed:
              false,

            providerCallMade:
              false,
          });

        expect(fetchImpl)
          .not.toHaveBeenCalled();
      },
    );


    it(
      "rejects production before FX, credential, or provider access",
      async () => {
        const fetchImpl =
          tcmbFetch();

        const result =
          await prepareReactiveCoachDevRuntimeV1({
            deploymentEnvironment:
              "production",

            serverConfig:
              dedicatedConfig(),

            serverSecrets:
              {},

            serviceClient:
              {},

            userId:
              USER_ID,

            examProfileId:
              PROFILE_ID,

            requestId:
              REQUEST_ID,

            requestedAt:
              AT,

            fetchImpl,
          });

        expect(result)
          .toMatchObject({
            availability:
              "unavailable",

            reason:
              "production_prohibited",

            productionAllowed:
              false,
          });

        expect(fetchImpl)
          .not.toHaveBeenCalled();
      },
    );


    it(
      "requires exact user/profile allowlist",
      async () => {
        const fetchImpl =
          tcmbFetch();

        const result =
          await prepareReactiveCoachDevRuntimeV1({
            deploymentEnvironment:
              "local_dev",

            serverConfig:
              dedicatedConfig(),

            serverSecrets: {
              OPENAI_API_KEY:
                FAKE_KEY,
            },

            serviceClient:
              {},

            userId:
              "wrong-user",

            examProfileId:
              PROFILE_ID,

            requestId:
              REQUEST_ID,

            requestedAt:
              AT,

            fetchImpl,
          });

        expect(result)
          .toMatchObject({
            availability:
              "unavailable",

            reason:
              "identity_not_allowlisted",
          });

        expect(fetchImpl)
          .not.toHaveBeenCalled();
      },
    );


    it(
      "cannot be enabled by historical smoke keys",
      async () => {
        const generic =
          AI_PROVIDER_RUNTIME_SERVER_KEYS_V1;

        const fetchImpl =
          tcmbFetch();

        const result =
          await prepareReactiveCoachDevRuntimeV1({
            deploymentEnvironment:
              "local_dev",

            serverConfig: {
              [generic.enabled]:
                "true",

              [generic.environment]:
                "local_dev",

              [generic.scope]:
                "one_controlled_dev_smoke_v1",

              [generic.allowedUserId]:
                USER_ID,

              [generic.allowedProfileId]:
                PROFILE_ID,

              [generic.acceptUnresolvedCountBillingRisk]:
                "true",
            },

            serverSecrets: {
              OPENAI_API_KEY:
                FAKE_KEY,
            },

            serviceClient:
              {},

            userId:
              USER_ID,

            examProfileId:
              PROFILE_ID,

            requestId:
              REQUEST_ID,

            requestedAt:
              AT,

            fetchImpl,
          });

        expect(result)
          .toMatchObject({
            availability:
              "unavailable",

            reason:
              "runtime_switch_off",
          });

        expect(fetchImpl)
          .not.toHaveBeenCalled();
      },
    );


    it(
      "prepares local provider execution without an OpenAI request",
      async () => {
        const fetchImpl =
          tcmbFetch();

        const result =
          await prepareReactiveCoachDevRuntimeV1({
            deploymentEnvironment:
              "local_dev",

            serverConfig:
              dedicatedConfig(),

            serverSecrets: {
              OPENAI_API_KEY:
                FAKE_KEY,
            },

            serviceClient: {
              authority:
                "server-ledger-only",
            },

            userId:
              USER_ID,

            examProfileId:
              PROFILE_ID,

            requestId:
              REQUEST_ID,

            requestedAt:
              AT,

            fetchImpl,

            idFactory:
              ids(),
          });

        expect(result.availability)
          .toBe(
            "available",
          );

        if (
          result.availability
            !== "available"
        ) {
          throw new Error(
            "EXPECTED_AVAILABLE_RUNTIME",
          );
        }

        expect(result.activation)
          .toMatchObject({
            scope:
              "reactive_coach_dev_v1",

            deploymentEnvironment:
              "local_dev",

            userId:
              USER_ID,

            examProfileId:
              PROFILE_ID,

            serverOwned:
              true,

            productionAllowed:
              false,
          });

        expect(
          result.providerExecution,
        ).toMatchObject({
          correlationId:
            REQUEST_ID,

          reservationId:
            "00000000-0000-4000-8000-000000000001",

          providerAttemptId:
            "00000000-0000-4000-8000-000000000002",

          runtimeEnvironment:
            "local",

          routingBudgetState:
            "normal",

          retryNumber:
            0,

          fallbackFromAttemptId:
            null,
        });

        expect(
          result.providerExecution
            .dependencies
            .inputCountTransport
            .authority,
        ).toBe(
          "openai_dev_gateway",
        );

        expect(
          result.providerExecution
            .dependencies
            .generationTransport
            .authority,
        ).toBe(
          "openai_dev_gateway",
        );

        expect(fetchImpl)
          .toHaveBeenCalledTimes(1);

        expect(
          JSON.stringify(
            result,
          ),
        ).not.toContain(
          FAKE_KEY,
        );
      },
    );


    it(
      "keeps retry and provider fallback disabled",
      () => {
        expect(
          AI_OPENAI_REACTIVE_COACH_DEV_ROUTE_CATALOG_V1
            .environment,
        ).toBe(
          "local",
        );

        for (
          const route
          of AI_OPENAI_REACTIVE_COACH_DEV_ROUTE_CATALOG_V1.routes
        ) {
          expect(
            route.retryPolicy.maxAttempts,
          ).toBe(1);

          expect(
            route.retryPolicy
              .retryableCategories,
          ).toEqual([]);

          expect(
            route.fallbackTier,
          ).toBeNull();
        }
      },
    );


    it(
      "preserves historical one-smoke resolver default",
      () => {
        const keys =
          AI_PROVIDER_RUNTIME_SERVER_KEYS_V1;

        const result =
          resolveAiProviderRuntimeActivationV1({
            deploymentEnvironment:
              "local_dev",

            serverConfig: {
              [keys.enabled]:
                "true",

              [keys.environment]:
                "local_dev",

              [keys.scope]:
                "one_controlled_dev_smoke_v1",

              [keys.allowedUserId]:
                USER_ID,

              [keys.allowedProfileId]:
                PROFILE_ID,

              [keys.acceptUnresolvedCountBillingRisk]:
                "true",
            },

            userId:
              USER_ID,

            examProfileId:
              PROFILE_ID,
          });

        expect(result)
          .toMatchObject({
            availability:
              "available",

            scope:
              "one_controlled_dev_smoke_v1",

            productionAllowed:
              false,
          });
      },
    );
  },
);
describe(
  "6C.3B lazy Reactive Coach DEV provider preparation",
  () => {
    it(
      "production preparation reads neither secret nor network",
      async () => {
        const fetchImpl =
          tcmbFetch();

        let secretReads =
          0;

        const prepare =
          createReactiveCoachDevProviderPreparationV1({
            deploymentEnvironment:
              "production",

            serverConfig:
              dedicatedConfig(),

            openAiApiKey:
              () => {
                secretReads += 1;
                return FAKE_KEY;
              },

            serviceClient:
              {},

            userId:
              USER_ID,

            examProfileId:
              PROFILE_ID,

            fetchImpl,
          });

        const provider =
          await prepare({
            requestId:
              REQUEST_ID,

            requestedAt:
              AT,
          });

        expect(provider)
          .toBeNull();

        expect(secretReads)
          .toBe(0);

        expect(fetchImpl)
          .not.toHaveBeenCalled();
      },
    );


    it(
      "default-OFF local preparation reads neither secret nor network",
      async () => {
        const fetchImpl =
          tcmbFetch();

        let secretReads =
          0;

        const prepare =
          createReactiveCoachDevProviderPreparationV1({
            deploymentEnvironment:
              "local_dev",

            serverConfig:
              {},

            openAiApiKey:
              () => {
                secretReads += 1;
                return FAKE_KEY;
              },

            serviceClient:
              {},

            userId:
              USER_ID,

            examProfileId:
              PROFILE_ID,

            fetchImpl,
          });

        const provider =
          await prepare({
            requestId:
              REQUEST_ID,

            requestedAt:
              AT,
          });

        expect(provider)
          .toBeNull();

        expect(secretReads)
          .toBe(0);

        expect(fetchImpl)
          .not.toHaveBeenCalled();
      },
    );


    it(
      "enabled exact LOCAL DEV preparation reads secret lazily and returns bounded provider input",
      async () => {
        const fetchImpl =
          tcmbFetch();

        let secretReads =
          0;

        const prepare =
          createReactiveCoachDevProviderPreparationV1({
            deploymentEnvironment:
              "local_dev",

            serverConfig:
              dedicatedConfig(),

            openAiApiKey:
              () => {
                secretReads += 1;
                return FAKE_KEY;
              },

            serviceClient: {
              authority:
                "ledger",
            },

            userId:
              USER_ID,

            examProfileId:
              PROFILE_ID,

            fetchImpl,

            idFactory:
              ids(),
          });

        const provider =
          await prepare({
            requestId:
              REQUEST_ID,

            requestedAt:
              AT,
          });

        expect(provider)
          .not.toBeNull();

        expect(provider)
          .toMatchObject({
            correlationId:
              REQUEST_ID,

            runtimeEnvironment:
              "local",

            retryNumber:
              0,

            fallbackFromAttemptId:
              null,
          });

        expect(secretReads)
          .toBe(1);

        // TCMB only. OpenAI transport is constructed but not executed.
        expect(fetchImpl)
          .toHaveBeenCalledTimes(1);

        expect(
          JSON.stringify(
            provider,
          ),
        ).not.toContain(
          FAKE_KEY,
        );
      },
    );
  },
);