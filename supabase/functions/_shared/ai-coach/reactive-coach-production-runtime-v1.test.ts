import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  createReactiveCoachProductionProviderPreparationV1,
  REACTIVE_COACH_PRODUCTION_RUNTIME_SERVER_KEYS_V1,
  resolveReactiveCoachProductionRuntimeActivationV1,
} from "./reactive-coach-production-runtime-v1.ts";


const USER_ID =
  "user-production-pilot";

const PROFILE_ID =
  "profile-production-pilot";

const REQUEST_ID =
  "request-production-pilot";

const AT =
  "2026-09-24T14:00:00.000Z";

const FAKE_KEY =
  "sk-production-pilot-fake-key-12345678901234567890";


const TCMB_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Tarih_Date Tarih="24.09.2026" Date="09/24/2026" Bulten_No="2026/190">
  <Currency CrossOrder="0" Kod="USD" CurrencyCode="USD">
    <Unit>1</Unit>
    <Isim>ABD DOLARI</Isim>
    <CurrencyName>US DOLLAR</CurrencyName>
    <ForexBuying>41.1000</ForexBuying>
    <ForexSelling>41.2500</ForexSelling>
  </Currency>
</Tarih_Date>`;


function readyConfig() {
  const keys =
    REACTIVE_COACH_PRODUCTION_RUNTIME_SERVER_KEYS_V1;

  return {
    [keys.enabled]:
      "true",

    [keys.approved]:
      "true",

    [keys.staticBoundReady]:
      "true",

    [keys.environment]:
      "production",

    [keys.allowedUserId]:
      USER_ID,

    [keys.allowedProfileId]:
      PROFILE_ID,
  };
}


describe(
  "6G exact-profile production runtime preparation",
  () => {
    it(
      "stays fail-closed before secret or network access when OFF",
      async () => {
        const openAiApiKey =
          vi.fn(
            () =>
              FAKE_KEY,
          );

        const fetchImpl =
          vi.fn();

        const prepare =
          createReactiveCoachProductionProviderPreparationV1({
            serverConfig:
              {},

            openAiApiKey,

            serviceClient:
              {},

            userId:
              USER_ID,

            examProfileId:
              PROFILE_ID,

            fetchImpl,
          });

        const result =
          await prepare({
            requestId:
              REQUEST_ID,

            requestedAt:
              AT,
          });

        expect(result)
          .toBeNull();

        expect(openAiApiKey)
          .not.toHaveBeenCalled();

        expect(fetchImpl)
          .not.toHaveBeenCalled();
      },
    );


    it(
      "stays fail-closed when static bound readiness is OFF",
      async () => {
        const keys =
          REACTIVE_COACH_PRODUCTION_RUNTIME_SERVER_KEYS_V1;

        const config = {
          ...readyConfig(),

          [keys.staticBoundReady]:
            "false",
        };

        const openAiApiKey =
          vi.fn(
            () =>
              FAKE_KEY,
          );

        const fetchImpl =
          vi.fn();

        const prepare =
          createReactiveCoachProductionProviderPreparationV1({
            serverConfig:
              config,

            openAiApiKey,

            serviceClient:
              {},

            userId:
              USER_ID,

            examProfileId:
              PROFILE_ID,

            fetchImpl,
          });

        const result =
          await prepare({
            requestId:
              REQUEST_ID,

            requestedAt:
              AT,
          });

        expect(result)
          .toBeNull();

        expect(openAiApiKey)
          .not.toHaveBeenCalled();

        expect(fetchImpl)
          .not.toHaveBeenCalled();
      },
    );


    it(
      "rejects a different profile before secret or network access",
      async () => {
        const openAiApiKey =
          vi.fn(
            () =>
              FAKE_KEY,
          );

        const fetchImpl =
          vi.fn();

        expect(
          resolveReactiveCoachProductionRuntimeActivationV1({
            serverConfig:
              readyConfig(),

            userId:
              USER_ID,

            examProfileId:
              "wrong-profile",
          }),
        ).toMatchObject({
          availability:
            "unavailable",

          reason:
            "identity_not_allowlisted",

          productionAllowed:
            false,
        });

        const prepare =
          createReactiveCoachProductionProviderPreparationV1({
            serverConfig:
              readyConfig(),

            openAiApiKey,

            serviceClient:
              {},

            userId:
              USER_ID,

            examProfileId:
              "wrong-profile",

            fetchImpl,
          });

        const result =
          await prepare({
            requestId:
              REQUEST_ID,

            requestedAt:
              AT,
          });

        expect(result)
          .toBeNull();

        expect(openAiApiKey)
          .not.toHaveBeenCalled();

        expect(fetchImpl)
          .not.toHaveBeenCalled();
      },
    );


    it(
      "prepares exact-profile production execution without calling OpenAI",
      async () => {
        const openAiApiKey =
          vi.fn(
            () =>
              FAKE_KEY,
          );

        const urls:
          string[] = [];

        const fetchImpl =
          vi.fn(
            async (
              url: string,
            ) => {
              urls.push(
                url,
              );

              if (
                url.includes(
                  "tcmb.gov.tr",
                )
              ) {
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
              }

              throw new Error(
                "OPENAI_MUST_NOT_BE_CALLED_DURING_PREPARATION",
              );
            },
          );

        const ids = [
          "reservation-production-1",
          "attempt-production-1",
        ];

        const prepare =
          createReactiveCoachProductionProviderPreparationV1({
            serverConfig:
              readyConfig(),

            openAiApiKey,

            serviceClient: {
              marker:
                "service-client",
            },

            userId:
              USER_ID,

            examProfileId:
              PROFILE_ID,

            fetchImpl,

            idFactory:
              () =>
                ids.shift()
                ?? "unexpected-id",
          });

        const result =
          await prepare({
            requestId:
              REQUEST_ID,

            requestedAt:
              AT,
          });

        expect(result)
          .not.toBeNull();

        expect(
          result?.runtimeEnvironment,
        ).toBe(
          "production",
        );

        expect(
          result?.providerRuntimeActivation,
        ).toMatchObject({
          availability:
            "available",

          deploymentEnvironment:
            "production",

          scope:
            "reactive_coach_production_pilot_v1",

          userId:
            USER_ID,

          examProfileId:
            PROFILE_ID,

          serverOwned:
            true,

          productionAllowed:
            true,

          inputCountBillingAuthority:
            "not_applicable_static_bound",
        });

        expect(
          result?.dependencies
            .generationTransport
            .authority,
        ).toBe(
          "openai_production_gateway",
        );

        expect(
          result?.dependencies
            .inputCountTransport,
        ).toBeUndefined();

        expect(
          result?.productionStaticBoundSource,
        ).toMatchObject({
          authority:
            "approved_server_config",

          loadedAt:
            AT,
        });

        expect(
          result?.routeCatalog
            .environment,
        ).toBe(
          "production",
        );

        expect(
          result?.pricingCatalog
            .environment,
        ).toBe(
          "production",
        );

        expect(
          result?.reservationId,
        ).toBe(
          "reservation-production-1",
        );

        expect(
          result?.providerAttemptId,
        ).toBe(
          "attempt-production-1",
        );

        expect(openAiApiKey)
          .toHaveBeenCalledTimes(1);

        /*
         * Preparation performs exactly the TCMB acquisition.
         * OpenAI is not called until orchestrator execution.
         */
        expect(urls)
          .toHaveLength(1);

        expect(
          urls[0],
        ).toContain(
          "tcmb.gov.tr",
        );

        expect(
          urls[0],
        ).not.toContain(
          "api.openai.com",
        );
      },
    );
  },
);