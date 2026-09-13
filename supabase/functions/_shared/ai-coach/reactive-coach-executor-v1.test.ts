import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  buildCoachContextV1,
} from "../ai-coach.bundle.js";

import type {
  CoachContextV1,
} from "../../../../packages/domain/src/ai-coach/coach-context-v1.ts";

import {
  coachContextV1Fixture,
} from "../../../../packages/domain/src/ai-coach/fixtures/coach-context-v1.ts";

import {
  executeReactiveCoachRequestV1,
} from "./reactive-coach-executor-v1.ts";


function canonicalContext():
  CoachContextV1 {
  return buildCoachContextV1(
    coachContextV1Fixture(
      "healthy_normal_week",
    ),
  );
}


function baseInput() {
  return {
    contextClient: {},
    userId:
      "user-esra",
    examProfileId:
      "profile-kpss-2027",
    requestId:
      "request-reactive-6c2",
    requestedAt:
      "2026-09-10T09:00:00.000Z",
  } as const;
}


function providerEnvelope() {
  return {
    serviceClient: {},

    correlationId:
      "correlation-reactive-6c2",

    reservationId:
      "reservation-reactive-6c2",

    providerAttemptId:
      "attempt-reactive-6c2",

    reservationExpiresAt:
      "2026-09-10T09:10:00.000Z",

    runtimeEnvironment:
      "test",

    routingBudgetState:
      "normal",

    routeCatalog: {},
    pricingCatalog: {},
    fxSnapshot: {},

    dependencies: {
      inputCountTransport: {},
      generationTransport: {},
    },
  } as any;
}


function providerResult(
  capability:
    | "today_analysis"
    | "subject_analysis"
    | "week_analysis"
    | "planner_explanation"
    | "complex_status_analysis",
) {
  return {
    version:
      "read-only-coach-orchestrator-v1",

    response: {
      version:
        "grounded-coach-response-v1",

      capability,

      answer:
        "Grounded provider answer",

      sourceFactPaths: [
        "evidence.week",
      ],

      acknowledgedUnknowns: [],
      staleOrBlockedWarnings: [],

      evidenceVersion:
        "coach-evidence-view-v1",

      signalVersion:
        null,

      noMutationPerformed:
        true,
    },

    accounting: {
      reservationId:
        "reservation-reactive-6c2",

      reservationStatus:
        "settled",

      usageEventRecorded:
        true,
    },

    observability: {
      requestId:
        "request-reactive-6c2",

      correlationId:
        "correlation-reactive-6c2",

      capability,

      routeTier:
        "strong",

      modelId:
        "test-model",

      requestFingerprint:
        "sha256:test",

      countClientRequestId:
        "count:test",

      countProviderRequestId:
        null,

      reservationId:
        "reservation-reactive-6c2",

      providerAttemptId:
        "attempt-reactive-6c2",

      providerClientRequestId:
        "provider:test",

      providerRequestId:
        null,

      providerResponseId:
        null,

      routeCatalogVersion:
        "route-test",

      pricingVersion:
        "pricing-test",

      fxPolicyVersion:
        "fx-policy-test",

      fxSnapshotVersion:
        "fx-snapshot-test",
    },

    noMutationPerformed:
      true,
  } as any;
}


describe(
  "6C.2 Reactive Coach executor",
  () => {
    it(
      "answers exact Today progress from canonical facts with zero provider calls",
      async () => {
        const current =
          canonicalContext();

        expect(
          current.today.availability,
        ).toBe("known");

        const loadContext =
          vi.fn(
            async () => current,
          );

        const runProvider =
          vi.fn();

        const result =
          await executeReactiveCoachRequestV1({
            ...baseInput(),

            rawMessage:
              "Bug\u00fcn ka\u00e7 dakika \u00e7al\u0131\u015ft\u0131m, plandan ne kald\u0131?",

            dependencies: {
              loadContext,
              runProvider,
            },
          });

        expect(
          loadContext,
        ).toHaveBeenCalledTimes(1);

        expect(
          runProvider,
        ).not.toHaveBeenCalled();

        expect(result.response)
          .toMatchObject({
            state:
              "FACT",

            executionTier:
              "T0_DETERMINISTIC",

            capability:
              "today_analysis",

            deterministicKind:
              "today_progress",

            providerAttempted:
              false,

            providerUsed:
              false,

            noMutationPerformed:
              true,
          });

        const today =
          current.today.value!;

        expect(
          result.response.answer,
        ).toContain(
          String(
            today.study.actualMinutes,
          ),
        );

        expect(
          result.response.answer,
        ).toContain(
          String(
            today.summary.remainingMinutes,
          ),
        );

        expect(
          result.response.sourceFactPaths,
        ).toContain(
          "today.value.study.actualMinutes",
        );
      },
    );


    it(
      "keeps quiz requests deterministic without context or provider",
      async () => {
        const loadContext =
          vi.fn();

        const runProvider =
          vi.fn();

        const result =
          await executeReactiveCoachRequestV1({
            ...baseInput(),

            rawMessage:
              "Bug\u00fcnk\u00fc konulardan mini quiz haz\u0131rla.",

            dependencies: {
              loadContext,
              runProvider,
            },
          });

        expect(
          loadContext,
        ).not.toHaveBeenCalled();

        expect(
          runProvider,
        ).not.toHaveBeenCalled();

        expect(result.response)
          .toMatchObject({
            state:
              "OUT_OF_SCOPE",

            providerAttempted:
              false,

            providerUsed:
              false,

            noMutationPerformed:
              true,
          });
      },
    );


    it(
      "stops direct planning changes before context or provider",
      async () => {
        const loadContext =
          vi.fn();

        const runProvider =
          vi.fn();

        const result =
          await executeReactiveCoachRequestV1({
            ...baseInput(),

            rawMessage:
              "Yar\u0131n toplam 90 dakika \u00e7al\u0131\u015fabilirim, plan\u0131 d\u00fczelt.",

            dependencies: {
              loadContext,
              runProvider,
            },
          });

        expect(
          loadContext,
        ).not.toHaveBeenCalled();

        expect(
          runProvider,
        ).not.toHaveBeenCalled();

        expect(result.response)
          .toMatchObject({
            state:
              "PROPOSAL_UNAVAILABLE",

            providerAttempted:
              false,

            providerUsed:
              false,

            noMutationPerformed:
              true,
          });
      },
    );


    it(
      "never converts chat Apply prose into Apply authority",
      async () => {
        const runProvider =
          vi.fn();

        const result =
          await executeReactiveCoachRequestV1({
            ...baseInput(),

            rawMessage:
              "Tamam, uygula.",

            dependencies: {
              loadContext:
                vi.fn(),

              runProvider,
            },
          });

        expect(
          runProvider,
        ).not.toHaveBeenCalled();

        expect(
          result.route.authority
            .confirmationAllowed,
        ).toBe(false);

        expect(
          result.route.authority
            .applyAllowed,
        ).toBe(false);

        expect(
          result.response
            .noMutationPerformed,
        ).toBe(true);
      },
    );


    it(
      "delegates week analysis only through the injected read-only orchestrator boundary",
      async () => {
        const current =
          canonicalContext();

        const loadContext =
          vi.fn(
            async () => current,
          );

        const runProvider =
          vi.fn(
            async (input: any) => {
              expect(
                input.capability,
              ).toBe(
                "week_analysis",
              );

              const suppliedContext =
                await input.dependencies
                  .loadContext({
                    client: {},
                    userId:
                      "user-esra",
                    requestId:
                      "inner",
                    now:
                      new Date(),
                  });

              expect(
                suppliedContext,
              ).toBe(current);

              return providerResult(
                "week_analysis",
              );
            },
          );

        const result =
          await executeReactiveCoachRequestV1({
            ...baseInput(),

            rawMessage:
              "Bu hafta durumum nas\u0131l?",

            provider:
              providerEnvelope(),

            dependencies: {
              loadContext,
              runProvider,
            },
          });

        expect(
          loadContext,
        ).toHaveBeenCalledTimes(1);

        expect(
          runProvider,
        ).toHaveBeenCalledTimes(1);

        expect(result.response)
          .toMatchObject({
            state:
              "EXPLANATION",

            executionTier:
              "PROVIDER_READ_ONLY",

            capability:
              "week_analysis",

            providerAttempted:
              true,

            providerUsed:
              true,

            noMutationPerformed:
              true,
          });

        expect(
          result.provider,
        ).not.toBeNull();
      },
    );


    it(
      "resolves a canonical subject before subject analysis",
      async () => {
        const current =
          canonicalContext();

        const law =
          current.subjects.find(
            (subject) =>
              subject.subjectId
                === "subject-law",
          );

        expect(law)
          .toBeDefined();

        const runProvider =
          vi.fn(
            async (input: any) => {
              expect(
                input.capability,
              ).toBe(
                "subject_analysis",
              );

              expect(
                input.subjectId,
              ).toBe(
                "subject-law",
              );

              return providerResult(
                "subject_analysis",
              );
            },
          );

        const result =
          await executeReactiveCoachRequestV1({
            ...baseInput(),

            rawMessage:
              "Hukuk dersinde durumum nas\u0131l?",

            provider:
              providerEnvelope(),

            dependencies: {
              loadContext:
                async () => current,

              runProvider,
            },
          });

        expect(
          runProvider,
        ).toHaveBeenCalledTimes(1);

        expect(
          result.response.capability,
        ).toBe(
          "subject_analysis",
        );
      },
    );


    it(
      "asks for clarification when a routed subject cannot be resolved from canonical context",
      async () => {
        const current = {
          ...canonicalContext(),
          subjects: [],
        } as CoachContextV1;

        const runProvider =
          vi.fn();

        const result =
          await executeReactiveCoachRequestV1({
            ...baseInput(),

            rawMessage:
              "Matematikte durumum nas\u0131l?",

            provider:
              providerEnvelope(),

            dependencies: {
              loadContext:
                async () => current,

              runProvider,
            },
          });

        expect(
          runProvider,
        ).not.toHaveBeenCalled();

        expect(result.response)
          .toMatchObject({
            state:
              "NEEDS_CLARIFICATION",

            providerAttempted:
              false,

            providerUsed:
              false,

            noMutationPerformed:
              true,
          });
      },
    );


    it(
      "requires explicit provider execution input on provider routes",
      async () => {
        const current =
          canonicalContext();

        const runProvider =
          vi.fn();

        await expect(
          executeReactiveCoachRequestV1({
            ...baseInput(),

            rawMessage:
              "Bu hafta durumum nas\u0131l?",

            dependencies: {
              loadContext:
                async () => current,

              runProvider,
            },
          }),
        ).rejects.toThrow(
          "REACTIVE_COACH_PROVIDER_INPUT_REQUIRED",
        );

        expect(
          runProvider,
        ).not.toHaveBeenCalled();
      },
    );


    it(
      "rejects canonical context from another identity",
      async () => {
        const current =
          canonicalContext();

        await expect(
          executeReactiveCoachRequestV1({
            ...baseInput(),

            userId:
              "wrong-user",

            rawMessage:
              "Bug\u00fcn ka\u00e7 dakika \u00e7al\u0131\u015ft\u0131m, plandan ne kald\u0131?",

            dependencies: {
              loadContext:
                async () => current,

              runProvider:
                vi.fn(),
            },
          }),
        ).rejects.toThrow(
          "REACTIVE_COACH_CONTEXT_SCOPE_MISMATCH",
        );
      },
    );


    it(
      "rejects provider output that violates the no-mutation contract",
      async () => {
        const current =
          canonicalContext();

        const unsafe =
          providerResult(
            "week_analysis",
          );

        unsafe.noMutationPerformed =
          false;

        await expect(
          executeReactiveCoachRequestV1({
            ...baseInput(),

            rawMessage:
              "Bu hafta durumum nas\u0131l?",

            provider:
              providerEnvelope(),

            dependencies: {
              loadContext:
                async () => current,

              runProvider:
                async () => unsafe,
            },
          }),
        ).rejects.toThrow(
          "REACTIVE_COACH_PROVIDER_MUTATION_GUARD_FAILED",
        );
      },
    );


    it(
      "degrades budget denial to COST_LIMITED without leaking provider errors",
      async () => {
        const current =
          canonicalContext();

        const result =
          await executeReactiveCoachRequestV1({
            ...baseInput(),

            rawMessage:
              "Bu hafta durumum nas\u0131l?",

            provider:
              providerEnvelope(),

            dependencies: {
              loadContext:
                async () => current,

              runProvider:
                async () => {
                  throw new Error(
                    "READ_ONLY_COACH_BUDGET_DENIED:hard_limit",
                  );
                },
            },
          });

        expect(result.response)
          .toMatchObject({
            state:
              "COST_LIMITED",

            providerAttempted:
              true,

            providerUsed:
              false,

            noMutationPerformed:
              true,
          });

        expect(
          result.response.answer,
        ).not.toContain(
          "READ_ONLY_COACH_BUDGET_DENIED",
        );
      },
    );


    it(
      "degrades generic provider failure to UNKNOWN_OR_BLOCKED without mutation",
      async () => {
        const current =
          canonicalContext();

        const result =
          await executeReactiveCoachRequestV1({
            ...baseInput(),

            rawMessage:
              "Genel durumumu de\u011ferlendir.",

            provider:
              providerEnvelope(),

            dependencies: {
              loadContext:
                async () => current,

              runProvider:
                async () => {
                  throw new Error(
                    "provider transport unavailable",
                  );
                },
            },
          });

        expect(result.response)
          .toMatchObject({
            state:
              "UNKNOWN_OR_BLOCKED",

            providerAttempted:
              true,

            providerUsed:
              false,

            noMutationPerformed:
              true,
          });

        expect(
          result.provider,
        ).toBeNull();
      },
    );
  },
);