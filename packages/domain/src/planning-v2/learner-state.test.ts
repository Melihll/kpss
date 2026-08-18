import { describe, expect, it } from "vitest";
import { deriveLearnerUnitStateV1 } from "./learner-state";

const base = {
  userId: "user-1",
  examProfileId: "profile-1",
  curriculumUnitId: "math-unit-1",
} as const;

describe("Learner State V1", () => {
  it("keeps mastery unknown when there is study evidence but no performance evidence", () => {
    const state = deriveLearnerUnitStateV1({
      ...base,
      evidence: [
        {
          evidenceId: "study-1",
          ...base,
          type: "STUDY",
          occurredAt: "2026-08-18T10:00:00+03:00",
          studyMinutes: 60,
        },
      ],
    });

    expect(state.masteryMean).toBeNull();
    expect(state.masteryConfidence).toBeGreaterThan(0);
    expect(state.masteryConfidence).toBeLessThan(1);
    expect(state.studyMinutes).toBe(60);
    expect(state.evidenceCount).toBe(1);
  });

  it("derives mastery and question accuracy from objective question results", () => {
    const state = deriveLearnerUnitStateV1({
      ...base,
      evidence: [
        {
          evidenceId: "questions-1",
          ...base,
          type: "QUESTION_RESULT",
          occurredAt: "2026-08-18T11:00:00+03:00",
          questionsCorrect: 8,
          questionsTotal: 10,
          questionSecondsTotal: 600,
        },
      ],
    });

    expect(state.masteryMean).toBeCloseTo(0.8);
    expect(state.questionAccuracy).toBeCloseTo(0.8);
    expect(state.questionCount).toBe(10);
    expect(state.averageQuestionSeconds).toBeCloseTo(60);
    expect(state.difficultyEstimate).toBeCloseTo(0.2);
  });

  it("treats an explicit wrong answer as negative performance evidence", () => {
    const state = deriveLearnerUnitStateV1({
      ...base,
      evidence: [
        {
          evidenceId: "wrong-1",
          ...base,
          type: "WRONG_ANSWER",
          occurredAt: "2026-08-18T11:30:00+03:00",
          misconceptionTags: [
            "sign-error",
            "sign-error",
            "operation-order",
          ],
        },
      ],
    });

    expect(state.masteryMean).toBe(0);
    expect(state.questionAccuracy).toBe(0);
    expect(state.questionCount).toBe(1);
    expect(state.misconceptionTags).toEqual([
      "operation-order",
      "sign-error",
    ]);
  });

  it("combines retrieval evidence with question performance", () => {
    const state = deriveLearnerUnitStateV1({
      ...base,
      evidence: [
        {
          evidenceId: "questions-1",
          ...base,
          type: "QUESTION_RESULT",
          occurredAt: "2026-08-18T10:00:00+03:00",
          questionsCorrect: 6,
          questionsTotal: 10,
        },
        {
          evidenceId: "retrieval-1",
          ...base,
          type: "RETRIEVAL",
          occurredAt: "2026-08-19T10:00:00+03:00",
          retrievalScore: 1,
        },
      ],
    });

    expect(state.masteryMean).toBeGreaterThan(0.6);
    expect(state.masteryMean).toBeLessThan(1);
    expect(state.lastRetrievalAt).toBe(
      "2026-08-19T10:00:00+03:00",
    );
  });

  it("is deterministic regardless of evidence input order", () => {
    const first = {
      evidenceId: "a",
      ...base,
      type: "QUESTION_RESULT" as const,
      occurredAt: "2026-08-18T10:00:00+03:00",
      questionsCorrect: 7,
      questionsTotal: 10,
    };

    const second = {
      evidenceId: "b",
      ...base,
      type: "RETRIEVAL" as const,
      occurredAt: "2026-08-19T10:00:00+03:00",
      retrievalScore: 0.8,
    };

    const a = deriveLearnerUnitStateV1({
      ...base,
      evidence: [first, second],
    });

    const b = deriveLearnerUnitStateV1({
      ...base,
      evidence: [second, first],
    });

    expect(a).toEqual(b);
  });

  it("rejects duplicate evidence ids", () => {
    const evidence = {
      evidenceId: "duplicate",
      ...base,
      type: "STUDY" as const,
      occurredAt: "2026-08-18T10:00:00+03:00",
      studyMinutes: 30,
    };

    expect(() =>
      deriveLearnerUnitStateV1({
        ...base,
        evidence: [evidence, evidence],
      }),
    ).toThrow(/duplicate learner evidence id/);
  });

  it("rejects cross-user evidence contamination", () => {
    expect(() =>
      deriveLearnerUnitStateV1({
        ...base,
        evidence: [
          {
            evidenceId: "foreign",
            userId: "another-user",
            examProfileId: "profile-1",
            curriculumUnitId: "math-unit-1",
            type: "STUDY",
            occurredAt: "2026-08-18T10:00:00+03:00",
            studyMinutes: 30,
          },
        ],
      }),
    ).toThrow(/ownership mismatch/);
  });

  it("requires retrieval quality instead of inventing it", () => {
    expect(() =>
      deriveLearnerUnitStateV1({
        ...base,
        evidence: [
          {
            evidenceId: "retrieval-without-result",
            ...base,
            type: "RETRIEVAL",
            occurredAt: "2026-08-18T10:00:00+03:00",
          },
        ],
      }),
    ).toThrow(/requires retrievalScore/);
  });
});
