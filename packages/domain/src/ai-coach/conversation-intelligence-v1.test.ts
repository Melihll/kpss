import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  CoachContextV1,
} from "./coach-context-v1";

import {
  COACH_CONVERSATION_CONTEXT_V1_VERSION,
  parseCoachConversationInputV1,
  resolveCoachConversationReferentV1,
  buildCoachConversationLanguageContextV1,
} from "./conversation-intelligence-v1";

function context(
  userId = "user-a",
): CoachContextV1 {
  return {
    userId,
    examProfileId:
      "profile-a",

    subjects: [
      {
        subjectId:
          "subject-math",
        subjectName:
          "Matematik",
      },
      {
        subjectId:
          "subject-history",
        subjectName:
          "Tarih",
      },
    ],

    planner: {
      availability:
        "known",
      value: {
        state:
          "READY",
        proposalId:
          "proposal-a",
      },
    },
  } as unknown as CoachContextV1;
}

function conversation(
  userText: string,
  assistantText =
    "?nceki cevab?m.",
) {
  return parseCoachConversationInputV1({
    version:
      COACH_CONVERSATION_CONTEXT_V1_VERSION,

    recentTurns: [
      {
        role:
          "user",
        text:
          userText,
      },
      {
        role:
          "assistant",
        text:
          assistantText,
      },
    ],
  })!;
}

describe(
  "Coach Conversation Intelligence V1",
  () => {
    it(
      "accepts only three complete bounded exchanges",
      () => {
        const parsed =
          parseCoachConversationInputV1({
            version:
              COACH_CONVERSATION_CONTEXT_V1_VERSION,

            recentTurns: [
              { role: "user", text: "Bir" },
              { role: "assistant", text: "Bir yan?t" },
              { role: "user", text: "?ki" },
              { role: "assistant", text: "?ki yan?t" },
              { role: "user", text: "??" },
              { role: "assistant", text: "?? yan?t" },
            ],
          });

        expect(
          parsed?.recentTurns,
        ).toHaveLength(6);

        expect(
          Object.isFrozen(parsed),
        ).toBe(true);

        expect(() =>
          parseCoachConversationInputV1({
            version:
              COACH_CONVERSATION_CONTEXT_V1_VERSION,

            recentTurns: [
              { role: "user", text: "Eksik ?ift" },
            ],
          }),
        ).toThrow(
          "COACH_CONVERSATION_TURN_COUNT_INVALID",
        );
      },
    );

    it(
      "resolves a follow-up subject against current canonical subjects",
      async () => {
        const result =
          await resolveCoachConversationReferentV1({
            context:
              context(),

            currentMessage:
              "Peki neden?",

            conversation:
              conversation(
                "Matematik durumum nas?l?",
              ),
          });

        expect(
          result.status,
        ).toBe("resolved");

        expect(
          result.status === "resolved"
            ? result.referent
            : null,
        ).toMatchObject({
          kind:
            "subject",
          subjectId:
            "subject-math",
        });
      },
    );

    it(
      "lets an explicit correction supersede the conversational referent",
      async () => {
        const result =
          await resolveCoachConversationReferentV1({
            context:
              context(),

            currentMessage:
              "Matematik de?il Tarih i?in de?erlendir.",

            conversation:
              conversation(
                "Matematik durumum nas?l?",
              ),
          });

        expect(
          result.status === "resolved"
            && result.referent.kind
              === "subject"
            ? result.referent.subjectId
            : null,
        ).toBe(
          "subject-history",
        );
      },
    );

    it(
      "fails an ambiguous current subject reference closed",
      async () => {
        const result =
          await resolveCoachConversationReferentV1({
            context:
              context(),

            currentMessage:
              "Matematik ve Tarih i?in neden b?yle?",

            conversation:
              null,
          });

        expect(result.status)
          .toBe("ambiguous");
      },
    );

    it(
      "binds fingerprints to the current authenticated user/profile context",
      async () => {
        const first =
          await resolveCoachConversationReferentV1({
            context:
              context("user-a"),

            currentMessage:
              "Matematik nas?l?",

            conversation:
              null,
          });

        const second =
          await resolveCoachConversationReferentV1({
            context:
              context("user-b"),

            currentMessage:
              "Matematik nas?l?",

            conversation:
              null,
          });

        const firstFingerprint =
          first.status === "resolved"
            ? first.referent.fingerprint
            : null;

        const secondFingerprint =
          second.status === "resolved"
            ? second.referent.fingerprint
            : null;

        expect(firstFingerprint)
          .toMatch(
            /^sha256:[0-9a-f]{64}$/,
          );

        expect(secondFingerprint)
          .not.toBe(
            firstFingerprint,
          );
      },
    );

    it(
      "marks provider conversation text as non-authoritative",
      async () => {
        const resolution =
          await resolveCoachConversationReferentV1({
            context:
              context(),

            currentMessage:
              "Peki neden?",

            conversation:
              conversation(
                "Planner ne g?r?yor?",
              ),
          });

        const language =
          buildCoachConversationLanguageContextV1({
            currentMessage:
              "Peki neden?",

            conversation:
              conversation(
                "Planner ne g?r?yor?",
              ),

            resolution,
          });

        expect(language.authority)
          .toBe(
            "non_authoritative_language_context",
          );

        expect(language.recentTurns)
          .toHaveLength(2);
      },
    );
  },
);
