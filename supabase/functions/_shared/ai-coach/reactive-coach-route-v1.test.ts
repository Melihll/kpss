import {
  describe,
  expect,
  it,
} from "vitest";

import {
  REACTIVE_COACH_ROUTE_V1_VERSION,
  routeReactiveCoachRequestV1,
} from "./reactive-coach-route-v1.ts";

describe(
  "6C.1 Reactive Coach request routing",
  () => {
    it(
      "routes exact Today progress to T0 with zero provider authority",
      () => {
        const value =
          routeReactiveCoachRequestV1(
            "Bugün kaç dakika çalıştım, plandan ne kaldı?",
          );

        expect(value).toMatchObject({
          version:
            REACTIVE_COACH_ROUTE_V1_VERSION,
          state:
            "FACT",
          executionTier:
            "T0_DETERMINISTIC",
          capability:
            "today_analysis",
          deterministicKind:
            "today_progress",
          providerCallAllowed:
            false,
          requiresCanonicalContext:
            true,
        });
      },
    );

    it(
      "routes teaching requests out of scope without a provider",
      () => {
        const value =
          routeReactiveCoachRequestV1(
            "Bana idare hukukunda yetki konusunu anlat.",
          );

        expect(value).toMatchObject({
          state:
            "OUT_OF_SCOPE",
          executionTier:
            "T0_DETERMINISTIC",
          deterministicKind:
            "out_of_scope_teaching",
          providerCallAllowed:
            false,
        });
      },
    );

    it(
      "routes quiz requests out of scope without a provider",
      () => {
        const value =
          routeReactiveCoachRequestV1(
            "Bugünkü konulardan 10 soruluk mini quiz hazırla.",
          );

        expect(value).toMatchObject({
          state:
            "OUT_OF_SCOPE",
          deterministicKind:
            "out_of_scope_quiz",
          providerCallAllowed:
            false,
        });
      },
    );

    it(
      "never treats chat Apply prose as confirmation or Apply authority",
      () => {
        const value =
          routeReactiveCoachRequestV1(
            "Tamam, uygula.",
          );

        expect(value).toMatchObject({
          state:
            "PROPOSAL_UNAVAILABLE",
          executionTier:
            "T0_DETERMINISTIC",
          deterministicKind:
            "apply_unavailable",
          providerCallAllowed:
            false,
        });

        expect(
          value.authority.confirmationAllowed,
        ).toBe(false);

        expect(
          value.authority.applyAllowed,
        ).toBe(false);
      },
    );

    it(
      "stops direct task move requests before provider or mutation",
      () => {
        const value =
          routeReactiveCoachRequestV1(
            "Salıdaki maliye görevini cumaya taşı.",
          );

        expect(value).toMatchObject({
          state:
            "PROPOSAL_UNAVAILABLE",
          deterministicKind:
            "planning_change_unavailable",
          providerCallAllowed:
            false,
        });

        expect(
          value.authority.taskMutationAllowed,
        ).toBe(false);
      },
    );

    it(
      "stops capacity-change requests at the 6C boundary",
      () => {
        const value =
          routeReactiveCoachRequestV1(
            "Yarın toplam 90 dakika çalışabilirim, planı düzelt.",
          );

        expect(value).toMatchObject({
          state:
            "PROPOSAL_UNAVAILABLE",
          executionTier:
            "T0_DETERMINISTIC",
          providerCallAllowed:
            false,
        });

        expect(
          value.authority.capacityMutationAllowed,
        ).toBe(false);
      },
    );

    it(
      "routes Today density explanation to read-only today analysis",
      () => {
        const value =
          routeReactiveCoachRequestV1(
            "Bugünkü planım neden bu kadar yoğun?",
          );

        expect(value).toMatchObject({
          state:
            "EXPLANATION",
          executionTier:
            "PROVIDER_READ_ONLY",
          capability:
            "today_analysis",
          providerCallAllowed:
            true,
        });
      },
    );

    it(
      "routes weekly progress analysis to week_analysis",
      () => {
        const value =
          routeReactiveCoachRequestV1(
            "Bu hafta geride miyim?",
          );

        expect(value.capability)
          .toBe("week_analysis");
      },
    );

    it(
      "routes planner placement reasons before subject matching",
      () => {
        const value =
          routeReactiveCoachRequestV1(
            "Hukuk görevi neden yarına kondu?",
          );

        expect(value.capability)
          .toBe("planner_explanation");
      },
    );

    it(
      "routes subject status questions to subject_analysis",
      () => {
        const value =
          routeReactiveCoachRequestV1(
            "Matematikte durumum nasıl?",
          );

        expect(value.capability)
          .toBe("subject_analysis");
      },
    );

    it(
      "routes generic status questions to complex_status_analysis",
      () => {
        const value =
          routeReactiveCoachRequestV1(
            "Genel olarak durumum nasıl?",
          );

        expect(value.capability)
          .toBe("complex_status_analysis");
      },
    );

    it(
      "preserves zero mutation authority for every route class",
      () => {
        const samples = [
          "Bugün kaç dakika çalıştım, plandan ne kaldı?",
          "Bana tarih konusunu anlat.",
          "Tamam uygula.",
          "Salıdaki görevi cumaya taşı.",
          "Bugünkü planım neden yoğun?",
          "Bu hafta durumum nasıl?",
          "Matematikte durumum nasıl?",
          "Genel durumumu değerlendir.",
        ];

        for (const sample of samples) {
          const value =
            routeReactiveCoachRequestV1(
              sample,
            );

          expect(value.authority)
            .toEqual({
              serverOwnedSelection: true,
              rawUserTextStored: false,
              plannerMutationAllowed: false,
              taskMutationAllowed: false,
              capacityMutationAllowed: false,
              confirmationAllowed: false,
              applyAllowed: false,
            });
        }
      },
    );

    it(
      "does not surface raw user text in the route decision",
      () => {
        const secretText =
          "Genel durumumu değerlendir özel-ham-metin";

        const value =
          routeReactiveCoachRequestV1(
            secretText,
          );

        expect(
          JSON.stringify(value),
        ).not.toContain(
          "özel-ham-metin",
        );
      },
    );

    it(
      "returns an immutable decision",
      () => {
        const value =
          routeReactiveCoachRequestV1(
            "Bu hafta durumum nasıl?",
          );

        expect(
          Object.isFrozen(value),
        ).toBe(true);

        expect(
          Object.isFrozen(
            value.authority,
          ),
        ).toBe(true);
      },
    );

    it(
      "rejects blank and oversized input before routing",
      () => {
        expect(
          () =>
            routeReactiveCoachRequestV1(
              "   ",
            ),
        ).toThrow(
          "REACTIVE_COACH_MESSAGE_REQUIRED",
        );

        expect(
          () =>
            routeReactiveCoachRequestV1(
              "x".repeat(2_001),
            ),
        ).toThrow(
          "REACTIVE_COACH_MESSAGE_TOO_LONG",
        );
      },
    );
  },
);