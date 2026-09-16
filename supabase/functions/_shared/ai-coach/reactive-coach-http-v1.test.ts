import fs from "node:fs";

import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  handleReactiveCoachHttpV1,
} from "./reactive-coach-http-v1.ts";


function baseInput() {
  return {
    body: {
      message:
        "Bugun kac dakika calistim, plandan ne kaldi?",
    },

    contextClient: {},

    userId:
      "user-server-owned",

    examProfileId:
      "profile-server-owned",

    requestId:
      "request-http-6c3a",

    requestedAt:
      "2026-09-16T08:00:00.000Z",
  } as const;
}


function safeExecution() {
  return {
    version:
      "reactive-coach-executor-v1",

    route: {
      version:
        "reactive-coach-route-v1",

      state:
        "FACT",

      executionTier:
        "T0_DETERMINISTIC",

      capability:
        "today_analysis",

      deterministicKind:
        "today_progress",

      reasonCode:
        "today_progress_exact",

      requiresCanonicalContext:
        true,

      providerCallAllowed:
        false,

      authority: {
        taskMutationAllowed:
          false,

        plannerMutationAllowed:
          false,

        capacityMutationAllowed:
          false,

        confirmationAllowed:
          false,

        applyAllowed:
          false,
      },

      rawUserTextStored:
        false,
    },

    response: {
      state:
        "FACT",

      executionTier:
        "T0_DETERMINISTIC",

      capability:
        "today_analysis",

      deterministicKind:
        "today_progress",

      answer:
        "Bugun 20 dakika calistin.",

      sourceFactPaths: [
        "today.value.study.actualMinutes",
      ],

      acknowledgedUnknowns: [],
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
  } as any;
}


describe(
  "6C.3A Reactive Coach HTTP boundary",
  () => {
    it(
      "passes only server-owned identity into deterministic execution",
      async () => {
        const execute =
          vi.fn(
            async (input: any) => {
              expect(
                input.userId,
              ).toBe(
                "user-server-owned",
              );

              expect(
                input.examProfileId,
              ).toBe(
                "profile-server-owned",
              );

              expect(
                input.requestId,
              ).toBe(
                "request-http-6c3a",
              );

              expect(
                input.requestedAt,
              ).toBe(
                "2026-09-16T08:00:00.000Z",
              );

              expect(
                input.provider,
              ).toBeUndefined();

              return safeExecution();
            },
          );

        const result =
          await handleReactiveCoachHttpV1({
            ...baseInput(),

            dependencies: {
              execute,
            },
          });

        expect(
          execute,
        ).toHaveBeenCalledTimes(1);

        expect(result)
          .toMatchObject({
            status: 200,

            body: {
              status:
                "OK",
            },
          });
      },
    );


    it(
      "rejects client supplied userId",
      async () => {
        const execute =
          vi.fn();

        const result =
          await handleReactiveCoachHttpV1({
            ...baseInput(),

            body: {
              message:
                "Bugun ne yaptim?",
              userId:
                "attacker",
            },

            dependencies: {
              execute,
            },
          });

        expect(result)
          .toMatchObject({
            status: 400,

            body: {
              error: {
                code:
                  "REACTIVE_COACH_CLIENT_AUTHORITY_REFUSED",
              },
            },
          });

        expect(
          execute,
        ).not.toHaveBeenCalled();
      },
    );


    it(
      "rejects client supplied examProfileId",
      async () => {
        const execute =
          vi.fn();

        const result =
          await handleReactiveCoachHttpV1({
            ...baseInput(),

            body: {
              message:
                "Bugun ne yaptim?",
              examProfileId:
                "client-profile",
            },

            dependencies: {
              execute,
            },
          });

        expect(result.status)
          .toBe(400);

        expect(
          execute,
        ).not.toHaveBeenCalled();
      },
    );


    it(
      "rejects provider or authority injection fields",
      async () => {
        const execute =
          vi.fn();

        for (
          const key
          of [
            "provider",
            "dependencies",
            "apply",
            "confirmation",
            "serviceRoleKey",
          ]
        ) {
          const result =
            await handleReactiveCoachHttpV1({
              ...baseInput(),

              body: {
                message:
                  "Merhaba",
                [key]:
                  true,
              },

              dependencies: {
                execute,
              },
            });

          expect(result)
            .toMatchObject({
              status: 400,

              body: {
                error: {
                  code:
                    "REACTIVE_COACH_CLIENT_AUTHORITY_REFUSED",
                },
              },
            });
        }

        expect(
          execute,
        ).not.toHaveBeenCalled();
      },
    );


    it(
      "fails provider routes closed without executing provider runtime",
      async () => {
        const execute =
          vi.fn();

        const result =
          await handleReactiveCoachHttpV1({
            ...baseInput(),

            body: {
              message:
                "Bu hafta durumum nasil?",
            },

            dependencies: {
              execute,
            },
          });

        expect(
          execute,
        ).not.toHaveBeenCalled();

        expect(result)
          .toMatchObject({
            status: 503,

            body: {
              status:
                "PROVIDER_UNAVAILABLE",

              response: {
                state:
                  "UNKNOWN_OR_BLOCKED",

                executionTier:
                  "PROVIDER_READ_ONLY",

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
          });
      },
    );


    it(
      "rejects non-object body",
      async () => {
        const execute =
          vi.fn();

        const result =
          await handleReactiveCoachHttpV1({
            ...baseInput(),

            body:
              null,

            dependencies: {
              execute,
            },
          });

        expect(result.status)
          .toBe(400);

        expect(
          execute,
        ).not.toHaveBeenCalled();
      },
    );


    it(
      "rejects blank message",
      async () => {
        const execute =
          vi.fn();

        const result =
          await handleReactiveCoachHttpV1({
            ...baseInput(),

            body: {
              message:
                "   ",
            },

            dependencies: {
              execute,
            },
          });

        expect(result.status)
          .toBe(400);

        expect(
          execute,
        ).not.toHaveBeenCalled();
      },
    );


    it(
      "rejects oversized message",
      async () => {
        const execute =
          vi.fn();

        const result =
          await handleReactiveCoachHttpV1({
            ...baseInput(),

            body: {
              message:
                "x".repeat(2001),
            },

            dependencies: {
              execute,
            },
          });

        expect(result)
          .toMatchObject({
            status: 400,

            body: {
              error: {
                code:
                  "MESSAGE_TOO_LONG",
              },
            },
          });

        expect(
          execute,
        ).not.toHaveBeenCalled();
      },
    );


    it(
      "does not leak internal executor errors",
      async () => {
        const result =
          await handleReactiveCoachHttpV1({
            ...baseInput(),

            dependencies: {
              execute:
                async () => {
                  throw new Error(
                    "DATABASE_SECRET_FAILURE",
                  );
                },
            },
          });

        expect(result)
          .toMatchObject({
            status: 500,

            body: {
              error: {
                code:
                  "REACTIVE_COACH_EXECUTION_FAILED",
              },
            },
          });

        expect(
          JSON.stringify(
            result.body,
          ),
        ).not.toContain(
          "DATABASE_SECRET_FAILURE",
        );
      },
    );


    it(
      "rejects an execution result that violates the no-mutation boundary",
      async () => {
        const unsafe =
          safeExecution();

        unsafe.response.noMutationPerformed =
          false;

        const result =
          await handleReactiveCoachHttpV1({
            ...baseInput(),

            dependencies: {
              execute:
                async () => unsafe,
            },
          });

        expect(result)
          .toMatchObject({
            status: 500,

            body: {
              error: {
                code:
                  "REACTIVE_COACH_BOUNDARY_CONTRACT_FAILED",
              },
            },
          });
      },
    );


    it(
      "is wired in app-api with JWT-derived user and active server profile only",
      () => {
        const source =
          fs.readFileSync(
            new URL(
              "../../app-api/index.ts",
              import.meta.url,
            ),
            "utf8",
          );

        expect(source)
          .toContain(
            'route === "/ai-coach/reactive"',
          );

        expect(source)
          .toContain(
            "handleReactiveCoachHttpV1",
          );

        const match =
          source.match(
            /if \(request\.method === "POST" && route === "\/ai-coach\/reactive"\) \{([\s\S]*?)\n    \}/,
          );

        expect(match)
          .not.toBeNull();

        const block =
          match![1];

        expect(block)
          .toContain(
            "contextClient: client",
          );

        expect(block)
          .toContain(
            "userId",
          );

        expect(block)
          .toContain(
            "examProfileId: profile.id",
          );

        expect(block)
          .toContain(
            "requestId: crypto.randomUUID()",
          );

        expect(block)
          .toContain(
            "requestedAt: new Date().toISOString()",
          );

        expect(block)
          .not.toContain(
            "serviceClient",
          );

        expect(block)
          .not.toContain(
            "SUPABASE_SERVICE_ROLE_KEY",
          );

        expect(block)
          .not.toContain(
            "OPENAI_API_KEY",
          );
      },
    );
  },
);

function safeProviderExecutionV1() {
  return {
    version:
      "reactive-coach-executor-v1",

    route: {
      version:
        "reactive-coach-route-v1",

      state:
        "EXPLANATION",

      executionTier:
        "PROVIDER_READ_ONLY",

      capability:
        "week_analysis",

      deterministicKind:
        null,

      reasonCode:
        "provider-week-test",

      requiresCanonicalContext:
        true,

      providerCallAllowed:
        true,

      authority: {
        taskMutationAllowed:
          false,

        plannerMutationAllowed:
          false,

        capacityMutationAllowed:
          false,

        confirmationAllowed:
          false,

        applyAllowed:
          false,
      },

      rawUserTextStored:
        false,
    },

    response: {
      state:
        "EXPLANATION",

      executionTier:
        "PROVIDER_READ_ONLY",

      capability:
        "week_analysis",

      deterministicKind:
        null,

      answer:
        "Haftalik durum analizi.",

      sourceFactPaths: [
        "week.value",
      ],

      acknowledgedUnknowns: [],
      staleOrBlockedWarnings: [],

      providerAttempted:
        true,

      providerUsed:
        true,

      noMutationPerformed:
        true,
    },

    provider: {
      accounting: {
        reservationId:
          "reservation-http-test",

        reservationStatus:
          "settled",

        usageEventRecorded:
          true,
      },

      observability: {
        requestId:
          "request-http-6c3a",
      },
    },
  } as any;
}


describe(
  "6C.3B Reactive Coach lazy provider HTTP binding",
  () => {
    it(
      "prepares provider only for a provider-tier request and passes it into executor",
      async () => {
        const providerExecution = {
          serviceClient: {
            authority:
              "server-only",
          },

          correlationId:
            "request-http-6c3a",

          reservationId:
            "reservation-http",

          providerAttemptId:
            "attempt-http",

          reservationExpiresAt:
            "2026-09-16T08:10:00.000Z",

          retryNumber:
            0,

          fallbackFromAttemptId:
            null,

          runtimeEnvironment:
            "local",

          routingBudgetState:
            "normal",

          routeCatalog:
            {},

          pricingCatalog:
            {},

          fxSnapshot:
            {},

          providerRuntimeActivation:
            {},

          dependencies:
            {},
        } as any;

        const prepareProviderExecution =
          vi.fn(
            async () =>
              providerExecution,
          );

        const execute =
          vi.fn(
            async (input: any) => {
              expect(
                input.provider,
              ).toBe(
                providerExecution,
              );

              expect(
                input.userId,
              ).toBe(
                "user-server-owned",
              );

              expect(
                input.examProfileId,
              ).toBe(
                "profile-server-owned",
              );

              return safeProviderExecutionV1();
            },
          );

        const result =
          await handleReactiveCoachHttpV1({
            ...baseInput(),

            body: {
              message:
                "Bu hafta durumum nasil?",
            },

            dependencies: {
              execute,
              prepareProviderExecution,
            },
          });

        expect(
          prepareProviderExecution,
        ).toHaveBeenCalledTimes(1);

        expect(
          prepareProviderExecution,
        ).toHaveBeenCalledWith({
          requestId:
            "request-http-6c3a",

          requestedAt:
            "2026-09-16T08:00:00.000Z",
        });

        expect(execute)
          .toHaveBeenCalledTimes(1);

        expect(result)
          .toMatchObject({
            status:
              200,

            body: {
              status:
                "OK",

              execution: {
                response: {
                  executionTier:
                    "PROVIDER_READ_ONLY",

                  providerUsed:
                    true,

                  noMutationPerformed:
                    true,
                },
              },
            },
          });
      },
    );


    it(
      "keeps provider route fail-closed when server preparation returns null",
      async () => {
        const execute =
          vi.fn();

        const prepareProviderExecution =
          vi.fn(
            async () =>
              null,
          );

        const result =
          await handleReactiveCoachHttpV1({
            ...baseInput(),

            body: {
              message:
                "Bu hafta durumum nasil?",
            },

            dependencies: {
              execute,
              prepareProviderExecution,
            },
          });

        expect(
          prepareProviderExecution,
        ).toHaveBeenCalledTimes(1);

        expect(execute)
          .not.toHaveBeenCalled();

        expect(result)
          .toMatchObject({
            status:
              503,

            body: {
              status:
                "PROVIDER_UNAVAILABLE",
            },
          });
      },
    );


    it(
      "sanitizes provider preparation failures",
      async () => {
        const execute =
          vi.fn();

        const result =
          await handleReactiveCoachHttpV1({
            ...baseInput(),

            body: {
              message:
                "Bu hafta durumum nasil?",
            },

            dependencies: {
              execute,

              prepareProviderExecution:
                async () => {
                  throw new Error(
                    "OPENAI_SECRET_SHOULD_NOT_LEAK",
                  );
                },
            },
          });

        expect(execute)
          .not.toHaveBeenCalled();

        expect(result.status)
          .toBe(503);

        expect(
          JSON.stringify(
            result.body,
          ),
        ).not.toContain(
          "OPENAI_SECRET_SHOULD_NOT_LEAK",
        );
      },
    );


    it(
      "never prepares provider runtime for deterministic T0 requests",
      async () => {
        const prepareProviderExecution =
          vi.fn();

        const execute =
          vi.fn(
            async () =>
              safeExecution(),
          );

        const result =
          await handleReactiveCoachHttpV1({
            ...baseInput(),

            dependencies: {
              execute,
              prepareProviderExecution,
            },
          });

        expect(
          prepareProviderExecution,
        ).not.toHaveBeenCalled();

        expect(execute)
          .toHaveBeenCalledTimes(1);

        expect(result.status)
          .toBe(200);
      },
    );
  },
);