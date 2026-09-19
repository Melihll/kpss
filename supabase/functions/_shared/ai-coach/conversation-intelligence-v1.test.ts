import fs from "node:fs";

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  COACH_CONVERSATION_CONTEXT_V1_VERSION,
  parseCoachConversationInputV1,
} from "../ai-coach.bundle.js";

import {
  routeReactiveCoachRequestV1,
} from "./reactive-coach-route-v1.ts";

function conversation(
  userMessage: string,
) {
  return parseCoachConversationInputV1({
    version:
      COACH_CONVERSATION_CONTEXT_V1_VERSION,

    recentTurns: [
      {
        role:
          "user",
        text:
          userMessage,
      },
      {
        role:
          "assistant",
        text:
          "?nceki cevap.",
      },
    ],
  });
}

describe(
  "Reactive Coach Conversation Intelligence V1",
  () => {
    it(
      "keeps natural-language apply blocked even with conversation context",
      () => {
        const route =
          routeReactiveCoachRequestV1(
            "tamam",
            conversation(
              "Planner ne g?r?yor?",
            ),
          );

        expect(
          route.deterministicKind,
        ).toBe(
          "apply_unavailable",
        );

        expect(
          route.authority
            .confirmationAllowed,
        ).toBe(false);

        expect(
          route.authority
            .applyAllowed,
        ).toBe(false);
      },
    );

    it(
      "routes a bounded Planner follow-up back through fresh canonical explanation",
      () => {
        const route =
          routeReactiveCoachRequestV1(
            "Peki neden?",
            conversation(
              "Planner ne g?r?yor?",
            ),
          );

        expect(
          route.executionTier,
        ).toBe(
          "T0_DETERMINISTIC",
        );

        expect(
          route.deterministicKind,
        ).toBe(
          "planner_state_explanation",
        );

        expect(
          route.requiresCanonicalContext,
        ).toBe(true);
      },
    );

    it(
      "routes a bounded subject follow-up to read-only subject analysis",
      () => {
        const route =
          routeReactiveCoachRequestV1(
            "Peki neden?",
            conversation(
              "Matematik durumum nas?l?",
            ),
          );

        expect(
          route.executionTier,
        ).toBe(
          "PROVIDER_READ_ONLY",
        );

        expect(
          route.capability,
        ).toBe(
          "subject_analysis",
        );

        expect(
          route.authority
            .taskMutationAllowed,
        ).toBe(false);
      },
    );

    it(
      "wires bounded context without conversation persistence or authority expansion",
      () => {
        const http =
          fs.readFileSync(
            "supabase/functions/_shared/ai-coach/reactive-coach-http-v1.ts",
            "utf8",
          );

        const executor =
          fs.readFileSync(
            "supabase/functions/_shared/ai-coach/reactive-coach-executor-v1.ts",
            "utf8",
          );

        const request =
          fs.readFileSync(
            "supabase/functions/_shared/ai-coach/openai-coach-request-v1.ts",
            "utf8",
          );

        expect(http)
          .toContain(
            'key !== "conversation"',
          );

        expect(http)
          .toContain(
            "parseCoachConversationInputV1",
          );

        expect(executor)
          .toContain(
            "resolveCoachConversationReferentV1",
          );

        expect(executor)
          .toContain(
            "buildCoachConversationLanguageContextV1",
          );

        expect(request)
          .toContain(
            "input.conversation",
          );

        expect(request)
          .toContain(
            "yaln?z dilsel takip ba?lam?d?r",
          );

        expect(http)
          .not.toContain(
            "conversation_history",
          );

        expect(executor)
          .not.toContain(
            "conversation_history",
          );
      },
    );
  },
);
