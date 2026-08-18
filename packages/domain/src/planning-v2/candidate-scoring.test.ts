import { describe, expect, it } from "vitest";
import {
  CANDIDATE_SCORING_WEIGHTS_V1,
  buildPlanningSnapshotV2,
  scorePlanningCandidateV1,
  scorePlanningCandidatesV1,
  type LearnerUnitStateV1,
  type PlanningCandidateV1,
} from "./index";

const versions = {
  plannerVersion: "planning-v2-dev",
  scoringVersion: "scoring-v1-dev",
  learnerStateVersion: "learner-state-v1-dev",
  snapshotSchemaVersion: "snapshot-v1",
} as const;

function learnerState(
  overrides: Partial<LearnerUnitStateV1> = {},
): LearnerUnitStateV1 {
  return {
    userId: "user-1",
    examProfileId: "profile-1",
    curriculumUnitId: "math-1",

    masteryMean: null,
    masteryConfidence: 0,

    questionAccuracy: null,
    questionCount: 0,
    averageQuestionSeconds: null,

    studyMinutes: 0,
    evidenceCount: 0,

    difficultyEstimate: null,

    lastStudiedAt: null,
    lastRetrievalAt: null,

    memoryStability: null,
    memoryDifficulty: null,
    retrievability: null,

    misconceptionTags: [],

    updatedAt: null,

    ...overrides,
  };
}

function snapshot(
  state?: LearnerUnitStateV1,
  prerequisites: readonly {
    curriculumUnitId: string;
    prerequisiteUnitId: string;
    relation: "HARD" | "SOFT_SEQUENCE";
  }[] = [],
) {
  return buildPlanningSnapshotV2({
    snapshotId: "score-test",
    generatedAt:
      "2026-08-18T18:00:00+03:00",

    currentDate: "2026-08-18",
    weekStart: "2026-08-17",
    weekEnd: "2026-08-23",

    trigger: "WEEKLY_REVIEW",
    versions,

    userId: "user-1",
    examProfileId: "profile-1",
    examDate: "2027-09-01",

    availableMinutes: 360,
    planningBudgetMinutes: 360,
    reserveMinutes: 0,

    dailyCapacities: [
      {
        date: "2026-08-18",
        grossCapacityMinutes: 60,
        reserveMinutes: 0,
        alreadyStudiedMinutes: 0,
      },
    ],

    existingTasks: [],
    learnerStates: state ? [state] : [],
    prerequisites,
  });
}

function candidate(
  overrides: Partial<PlanningCandidateV1> = {},
): PlanningCandidateV1 {
  return {
    candidateId:
      "candidate:QUESTION_PRACTICE:math-1",

    userId: "user-1",

    curriculumUnitId: "math-1",
    subjectId: "math",

    candidateType: "QUESTION_PRACTICE",

    title: "Temel Kavramlar — soru pratiği",

    estimatedMinutes: 30,

    earliestDate: "2026-08-18",
    latestDate: "2026-08-23",

    hardEligible: true,
    ineligibilityCodes: [],

    score: 0,

    scoreBreakdown: {
      examImportance: 0,
      masteryGap: 0,
      prerequisiteUnlockValue: 0,
      forgettingRisk: 0,
      deadlineUrgency: 0,
      continuityValue: 0,
      learnerPreference: 0,
      total: 0,
    },

    explanationCodes: [],

    sourceTaskId: null,
    sourceResourceId: "resource-math",

    ...overrides,
  };
}

describe("Candidate Scoring V1", () => {
  it("uses a 100-point versioned weight model", () => {
    const total = Object.values(
      CANDIDATE_SCORING_WEIGHTS_V1,
    ).reduce(
      (sum, value) => sum + value,
      0,
    );

    expect(total).toBe(100);
  });

  it("exposes an explainable breakdown whose parts equal total score", () => {
    const scored = scorePlanningCandidateV1(
      snapshot(),
      candidate(),
      {
        examImportanceByCurriculumUnit: {
          "math-1": 0.8,
        },
      },
    );

    const breakdown =
      scored.scoreBreakdown;

    const reconstructed =
      breakdown.examImportance +
      breakdown.masteryGap +
      breakdown.prerequisiteUnlockValue +
      breakdown.forgettingRisk +
      breakdown.deadlineUrgency +
      breakdown.continuityValue +
      breakdown.learnerPreference;

    expect(scored.score).toBe(
      breakdown.total,
    );

    expect(breakdown.total).toBeCloseTo(
      reconstructed,
      4,
    );
  });

  it("gives more mastery-gap value to confident low mastery", () => {
    const lowMastery =
      scorePlanningCandidateV1(
        snapshot(
          learnerState({
            masteryMean: 0.3,
            masteryConfidence: 0.9,
          }),
        ),
        candidate(),
      );

    const highMastery =
      scorePlanningCandidateV1(
        snapshot(
          learnerState({
            masteryMean: 0.9,
            masteryConfidence: 0.9,
          }),
        ),
        candidate(),
      );

    expect(
      lowMastery.scoreBreakdown.masteryGap,
    ).toBeGreaterThan(
      highMastery.scoreBreakdown.masteryGap,
    );
  });

  it("does not interpret unknown mastery as a weakness", () => {
    const scored =
      scorePlanningCandidateV1(
        snapshot(
          learnerState({
            masteryMean: null,
            masteryConfidence: 0.1,
          }),
        ),
        candidate(),
      );

    expect(
      scored.scoreBreakdown.masteryGap,
    ).toBe(0);
  });

  it("rewards curriculum units that unlock hard prerequisites", () => {
    const scored =
      scorePlanningCandidateV1(
        snapshot(
          undefined,
          [
            {
              curriculumUnitId: "math-2",
              prerequisiteUnitId: "math-1",
              relation: "HARD",
            },
          ],
        ),
        candidate({
          candidateType:
            "PREREQUISITE_REPAIR",
        }),
      );

    expect(
      scored.scoreBreakdown
        .prerequisiteUnlockValue,
    ).toBeGreaterThan(0);
  });

  it("turns low retrievability into forgetting-risk value", () => {
    const scored =
      scorePlanningCandidateV1(
        snapshot(
          learnerState({
            masteryMean: 0.7,
            masteryConfidence: 0.8,
            retrievability: 0.2,
          }),
        ),
        candidate({
          candidateType:
            "SPACED_REVIEW",
        }),
      );

    expect(
      scored.scoreBreakdown.forgettingRisk,
    ).toBeCloseTo(12, 4);
  });

  it("gives continuation candidates maximum continuity value", () => {
    const scored =
      scorePlanningCandidateV1(
        snapshot(),
        candidate({
          candidateId:
            "candidate:CONTINUATION:task-1",
          candidateType: "CONTINUATION",
          sourceTaskId: "task-1",
        }),
      );

    expect(
      scored.scoreBreakdown.continuityValue,
    ).toBe(10);
  });

  it("applies explicit learner subject preference without hiding it", () => {
    const neutral =
      scorePlanningCandidateV1(
        snapshot(),
        candidate(),
      );

    const preferred =
      scorePlanningCandidateV1(
        snapshot(),
        candidate(),
        {
          learnerPreferenceBySubject: {
            math: 1,
          },
        },
      );

    expect(
      neutral.scoreBreakdown
        .learnerPreference,
    ).toBe(0);

    expect(
      preferred.scoreBreakdown
        .learnerPreference,
    ).toBe(5);
  });

  it("ranks eligible candidates before blocked candidates", () => {
    const result =
      scorePlanningCandidatesV1({
        snapshot: snapshot(),

        candidates: [
          candidate({
            candidateId: "blocked",
            curriculumUnitId: "math-1",
            hardEligible: false,
            ineligibilityCodes: [
              "PREREQUISITE_INCOMPLETE:x",
            ],
          }),

          candidate({
            candidateId: "eligible",
            curriculumUnitId: "other-unit",
            subjectId: "other",
            hardEligible: true,
          }),
        ],

        signals: {
          examImportanceByCurriculumUnit: {
            "math-1": 1,
            "other-unit": 0,
          },
        },
      });

    expect(
      result.candidates[0]?.candidateId,
    ).toBe("eligible");

    expect(
      result.blockedCandidates[0]
        ?.candidateId,
    ).toBe("blocked");

    expect(
      result.topEligibleCandidateId,
    ).toBe("eligible");
  });

  it("is deterministic for the same snapshot and scoring signals", () => {
    const input = {
      snapshot: snapshot(
        learnerState({
          masteryMean: 0.4,
          masteryConfidence: 0.8,
          lastStudiedAt:
            "2026-08-17T12:00:00+03:00",
        }),
      ),

      candidates: [
        candidate({
          candidateId: "candidate-b",
        }),

        candidate({
          candidateId: "candidate-a",
          candidateType: "RETRIEVAL",
        }),
      ],

      signals: {
        examImportanceBySubject: {
          math: 0.9,
        },
      },
    } as const;

    const first =
      scorePlanningCandidatesV1(input);

    const second =
      scorePlanningCandidatesV1(input);

    expect(first).toEqual(second);
  });
});
