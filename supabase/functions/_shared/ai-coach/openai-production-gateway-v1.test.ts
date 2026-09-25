import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  buildCoachContextV1,
  estimateAiEvidenceV1,
  projectCoachEvidenceViewV1,
  routeAiCapabilityV1,
} from "../ai-coach.bundle.js";

import {
  coachContextV1Fixture,
} from "../../../../packages/domain/src/ai-coach/fixtures/coach-context-v1.ts";

import {
  buildOpenAiCoachRequestV1,
  fingerprintOpenAiCoachRequestV1,
} from "./openai-coach-request-v1.ts";

import {
  loadOpenAiServerCredentialV1,
} from "./openai-server-secret-v1.ts";

import {
  AI_PROVIDER_RUNTIME_SERVER_KEYS_V1,
  resolveAiProviderRuntimeActivationV1,
} from "./provider-runtime-activation-v1.ts";

import {
  createOpenAiProductionGenerationTransportV1,
  OPENAI_PRODUCTION_RESPONSES_PATH_V1,
} from "./openai-production-gateway-v1.ts";

import {
  AI_OPENAI_ROUTE_CATALOG_V1,
} from "./provider-runtime-catalog-v1.ts";


function activation() {
  const keys =
    AI_PROVIDER_RUNTIME_SERVER_KEYS_V1;

  const value =
    resolveAiProviderRuntimeActivationV1({
      deploymentEnvironment:
        "production",

      productionPilotApproved:
        true,

      serverConfig: {
        [keys.enabled]:
          "true",

        [keys.environment]:
          "production",

        [keys.scope]:
          "reactive_coach_production_pilot_v1",

        [keys.allowedUserId]:
          "user-esra",

        [keys.allowedProfileId]:
          "profile-kpss-2027",
      },

      userId:
        "user-esra",

      examProfileId:
        "profile-kpss-2027",

      billingGate: {
        authority:
          "official_audit",

        auditVersion:
          "test_fixture",

        inputCountEndpointBilling:
          "unresolved",

        productionStaticBoundReady:
          true,
      },
    });

  if (
    value.availability !== "available"
  ) {
    throw new Error(
      `TEST_ACTIVATION_UNAVAILABLE:${value.reason}`,
    );
  }

  return value;
}


function credential() {
  return loadOpenAiServerCredentialV1({
    OPENAI_API_KEY:
      `sk-${"x".repeat(40)}`,
  });
}


async function requestFixture() {
  const context =
    buildCoachContextV1(
      coachContextV1Fixture(
        "healthy_normal_week",
      ),
    );

  const evidence =
    projectCoachEvidenceViewV1(
      context,
      {
        scope:
          "today_explain",

        capability:
          "explain",
      },
    );

  const evidenceBytes =
    new TextEncoder()
      .encode(
        JSON.stringify(
          evidence,
        ),
      )
      .byteLength;

  const route =
    routeAiCapabilityV1(
      {
        runtimeEnvironment:
          "production",

        capability:
          "today_analysis",

        evidence:
          estimateAiEvidenceV1(
            evidenceBytes,
          ),

        expectedResponse:
          "medium",

        budgetState:
          "normal",
      },

      AI_OPENAI_ROUTE_CATALOG_V1,
    );

  const request =
    buildOpenAiCoachRequestV1({
      route,

      capability:
        "today_analysis",

      evidence,

      locale:
        "tr-TR",
    });

  const fingerprint =
    await fingerprintOpenAiCoachRequestV1(
      request,
    );

  return {
    request,
    fingerprint,
  };
}

describe(
  "6G production generation-only gateway",
  () => {
    it(
      "exposes production generation authority without a count surface",
      () => {
        const transport =
          createOpenAiProductionGenerationTransportV1({
            activation:
              activation(),

            credential:
              credential(),

            fetchImpl:
              vi.fn(),
          });

        expect(
          transport.authority,
        ).toBe(
          "openai_production_gateway",
        );

        expect(
          "count" in transport,
        ).toBe(false);
      },
    );


    it(
      "uses only the fixed Responses generation endpoint for a canonical request",
      async () => {
        const calls:
          Array<{
            url: string;
            init: RequestInit;
          }> = [];

        const {
          request,
          fingerprint,
        } =
          await requestFixture();

        const transport =
          createOpenAiProductionGenerationTransportV1({
            activation:
              activation(),

            credential:
              credential(),

            fetchImpl:
              async (
                url,
                init,
              ) => {
                calls.push({
                  url,
                  init,
                });

                return new Response(
                  JSON.stringify({
                    id:
                      "resp_prod_1",

                    status:
                      "completed",
                  }),
                  {
                    status:
                      200,

                    headers: {
                      "x-request-id":
                        "req_prod_1",
                    },
                  },
                );
              },
          });

        const result =
          await transport.execute({
            request,
            fingerprint,

            providerAttemptId:
              "attempt-production",

            clientRequestId:
              "attempt:attempt-production",
          });

        expect(
          result,
        ).toMatchObject({
          outcome:
            "known",

          requestFingerprint:
            fingerprint.value,

          modelId:
            fingerprint.modelId,

          providerRequestId:
            "req_prod_1",

          clientRequestId:
            "attempt:attempt-production",

          httpStatus:
            200,
        });

        expect(
          calls,
        ).toHaveLength(1);

        expect(
          calls[0]?.url,
        ).toBe(
          `https://api.openai.com${OPENAI_PRODUCTION_RESPONSES_PATH_V1}`,
        );

        expect(
          calls[0]?.url,
        ).not.toContain(
          "input_tokens",
        );

        expect(
          calls[0]?.init.method,
        ).toBe("POST");

        const body =
          JSON.parse(
            String(
              calls[0]?.init.body,
            ),
          );

        expect(
          body.model,
        ).toBe(
          fingerprint.modelId,
        );

        expect(
          body.store,
        ).toBe(false);

        expect(
          body.background,
        ).toBe(false);

        expect(
          body.truncation,
        ).toBe("disabled");

        expect(
          body.service_tier,
        ).toBe("default");

        expect(
          body.tools,
        ).toEqual([]);

        expect(
          body.tool_choice,
        ).toBe("none");
      },
    );


    it(
      "contains no input-token endpoint in its production implementation",
      () => {
        expect(
          OPENAI_PRODUCTION_RESPONSES_PATH_V1,
        ).toBe(
          "/v1/responses",
        );

        expect(
          OPENAI_PRODUCTION_RESPONSES_PATH_V1,
        ).not.toContain(
          "input_tokens",
        );
      },
    );
  },
);