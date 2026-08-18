import { describe, expect, it } from "vitest";
import {
  buildPlanningSnapshotV2,
  generatePlanningCandidatesV1,
  type BuildPlanningSnapshotV2Input,
  type LearnerUnitStateV1,
} from "./index";

const versions = {
  plannerVersion: "planning-v2-dev",
  scoringVersion: "scoring-v1-dev",
  learnerStateVersion: "learner-state-v1-dev",
  snapshotSchemaVersion: "snapshot-v1",
} as const;

function baseSnapshotInput(): BuildPlanningSnapshotV2Input {
  return {
    snapshotId: "candidate-test",
    generatedAt: "2026-08-18T18:00:00+03:00",

    currentDate: "2026-08-18",
    weekStart: "2026-08-17",
    weekEnd: "2026-08-23",

    trigger: "STUDY_DEVIATION",
    versions,

    userId: "user-1",
    examProfileId: "profile-1",
    examDate: "2027-09-01",

    availableMinutes: 420,
    planningBudgetMinutes: 420,
    reserveMinutes: 0,

    dailyCapacities: [
      {
        date: "2026-08-18",
        grossCapacityMinutes: 60,
        reserveMinutes: 0,
        alreadyStudiedMinutes: 0,
      },
      {
        date: "2026-08-19",
        grossCapacityMinutes: 60,
        reserveMinutes: 0,
        alreadyStudiedMinutes: 0,
      },
      {
        date: "2026-08-20",
        grossCapacityMinutes: 60,
        reserveMinutes: 0,
        alreadyStudiedMinutes: 0,
      },
      {
        date: "2026-08-21",
        grossCapacityMinutes: 60,
        reserveMinutes: 0,
        alreadyStudiedMinutes: 0,
      },
      {
        date: "2026-08-22",
        grossCapacityMinutes: 60,
        reserveMinutes: 0,
        alreadyStudiedMinutes: 0,
      },
      {
        date: "2026-08-23",
        grossCapacityMinutes: 120,
        reserveMinutes: 0,
        alreadyStudiedMinutes: 0,
      },
    ],

    existingTasks: [],
    learnerStates: [],
    prerequisites: [],
  };
}

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

const mathSource = {
  curriculumUnitId: "math-1",
  subjectId: "math",
  title: "Temel Kavramlar",
  resourceId: "math-resource",

  estimatedMinutes: 90,

  supportsQuestionPractice: true,
  questionPracticeMinutes: 30,
  reviewMinutes: 20,
  retrievalMinutes: 15,
};

describe("Planning Candidate Generator V1", () => {
  it("creates a continuation candidate using remaining task minutes", () => {
    const snapshot = buildPlanningSnapshotV2({
      ...baseSnapshotInput(),

      existingTasks: [
        {
          taskId: "math-task",
          userId: "user-1",
          examProfileId: "profile-1",
          weeklyPlanId: "week-1",

          curriculumUnitId: "math-1",
          subjectId: "math",
          resourceId: "math-resource",

          title: "Temel Kavramlar",
          taskType: "study",
          lifecycleStatus: "partially_completed",

          plannedDate: "2026-08-19",

          estimatedMinutes: 90,
          completedMinutes: 51,

          isCompleted: false,
          isActive: false,
          isPartiallyCompleted: true,
        },
      ],
    });

    const result = generatePlanningCandidatesV1({
      snapshot,
      curriculumUnits: [mathSource],
    });

    const continuation = result.candidates.find(
      (candidate) =>
        candidate.candidateType === "CONTINUATION",
    );

    expect(continuation?.estimatedMinutes).toBe(39);
    expect(continuation?.sourceTaskId).toBe("math-task");

    // Preserve existing future placement boundary.
    expect(continuation?.earliestDate).toBe("2026-08-19");
  });

  it("does not create a continuation candidate for active work", () => {
    const snapshot = buildPlanningSnapshotV2({
      ...baseSnapshotInput(),

      existingTasks: [
        {
          taskId: "active-task",
          userId: "user-1",
          examProfileId: "profile-1",
          weeklyPlanId: "week-1",

          curriculumUnitId: "math-1",
          subjectId: "math",
          resourceId: "math-resource",

          title: "Active Math",
          taskType: "study",
          lifecycleStatus: "in_progress",

          plannedDate: "2026-08-18",

          estimatedMinutes: 90,
          completedMinutes: 10,

          isCompleted: false,
          isActive: true,
          isPartiallyCompleted: true,
        },
      ],
    });

    const result = generatePlanningCandidatesV1({
      snapshot,
      curriculumUnits: [mathSource],
    });

    expect(
      result.candidates.some(
        (candidate) =>
          candidate.candidateType === "CONTINUATION",
      ),
    ).toBe(false);
  });

  it("does not infer continuation from a 75/75 partial lifecycle", () => {
    const snapshot = buildPlanningSnapshotV2({
      ...baseSnapshotInput(),

      existingTasks: [
        {
          taskId: "partial-zero",
          userId: "user-1",
          examProfileId: "profile-1",
          weeklyPlanId: "week-1",

          curriculumUnitId: "math-1",
          subjectId: "math",
          resourceId: "math-resource",

          title: "Partial Zero",
          taskType: "study",
          lifecycleStatus: "partially_completed",

          plannedDate: "2026-08-18",

          estimatedMinutes: 75,
          completedMinutes: 75,

          isCompleted: false,
          isActive: false,
          isPartiallyCompleted: true,
        },
      ],
    });

    const result = generatePlanningCandidatesV1({
      snapshot,
      curriculumUnits: [mathSource],
    });

    expect(
      result.candidates.some(
        (candidate) =>
          candidate.candidateType === "CONTINUATION",
      ),
    ).toBe(false);
  });

  it("creates new learning only when the curriculum unit has no existing task", () => {
    const snapshot = buildPlanningSnapshotV2(
      baseSnapshotInput(),
    );

    const result = generatePlanningCandidatesV1({
      snapshot,
      curriculumUnits: [mathSource],
    });

    const candidate = result.candidates.find(
      (item) => item.candidateType === "NEW_LEARNING",
    );

    expect(candidate?.hardEligible).toBe(true);
    expect(candidate?.curriculumUnitId).toBe("math-1");
  });

  it("blocks new learning when a hard prerequisite is incomplete", () => {
    const snapshot = buildPlanningSnapshotV2({
      ...baseSnapshotInput(),

      prerequisites: [
        {
          curriculumUnitId: "math-2",
          prerequisiteUnitId: "math-1",
          relation: "HARD",
        },
      ],
    });

    const result = generatePlanningCandidatesV1({
      snapshot,

      curriculumUnits: [
        mathSource,
        {
          curriculumUnitId: "math-2",
          subjectId: "math",
          title: "Temel Kavramlar II",
          resourceId: "math-resource",
          estimatedMinutes: 90,
        },
      ],
    });

    const math2 = result.candidates.find(
      (candidate) =>
        candidate.candidateType === "NEW_LEARNING" &&
        candidate.curriculumUnitId === "math-2",
    );

    expect(math2?.hardEligible).toBe(false);
    expect(math2?.ineligibilityCodes).toContain(
      "PREREQUISITE_INCOMPLETE:math-1",
    );

    expect(
      result.candidates.some(
        (candidate) =>
          candidate.candidateType ===
            "PREREQUISITE_REPAIR" &&
          candidate.curriculumUnitId === "math-1",
      ),
    ).toBe(true);
  });

  it("creates question, retrieval and wrong-review candidates from evidence", () => {
    const snapshot = buildPlanningSnapshotV2({
      ...baseSnapshotInput(),

      learnerStates: [
        learnerState({
          masteryMean: 0.7,
          masteryConfidence: 0.6,

          studyMinutes: 90,
          evidenceCount: 3,

          lastStudiedAt:
            "2026-08-18T12:00:00+03:00",

          lastRetrievalAt: null,

          misconceptionTags: ["sign-error"],

          updatedAt:
            "2026-08-18T12:00:00+03:00",
        }),
      ],
    });

    const result = generatePlanningCandidatesV1({
      snapshot,
      curriculumUnits: [mathSource],
    });

    const types = result.candidates.map(
      (candidate) => candidate.candidateType,
    );

    expect(types).toContain("QUESTION_PRACTICE");
    expect(types).toContain("RETRIEVAL");
    expect(types).toContain("WRONG_REVIEW");
  });

  it("creates weakness repair only from sufficiently confident low mastery", () => {
    const snapshot = buildPlanningSnapshotV2({
      ...baseSnapshotInput(),

      learnerStates: [
        learnerState({
          masteryMean: 0.4,
          masteryConfidence: 0.7,
          studyMinutes: 90,
          evidenceCount: 10,
        }),
      ],
    });

    const result = generatePlanningCandidatesV1({
      snapshot,
      curriculumUnits: [mathSource],
    });

    expect(
      result.candidates.some(
        (candidate) =>
          candidate.candidateType === "WEAKNESS_REPAIR",
      ),
    ).toBe(true);
  });

  it("does not misclassify unknown mastery as weakness", () => {
    const snapshot = buildPlanningSnapshotV2({
      ...baseSnapshotInput(),

      learnerStates: [
        learnerState({
          masteryMean: null,
          masteryConfidence: 0.1,
          studyMinutes: 90,
          evidenceCount: 1,
        }),
      ],
    });

    const result = generatePlanningCandidatesV1({
      snapshot,
      curriculumUnits: [mathSource],
    });

    expect(
      result.candidates.some(
        (candidate) =>
          candidate.candidateType === "WEAKNESS_REPAIR",
      ),
    ).toBe(false);
  });

  it("produces deterministic candidate ids and ordering", () => {
    const snapshot = buildPlanningSnapshotV2({
      ...baseSnapshotInput(),

      learnerStates: [
        learnerState({
          masteryMean: 0.4,
          masteryConfidence: 0.8,
          studyMinutes: 60,
          evidenceCount: 8,
          lastStudiedAt:
            "2026-08-18T10:00:00+03:00",
        }),
      ],
    });

    const first = generatePlanningCandidatesV1({
      snapshot,
      curriculumUnits: [mathSource],
    });

    const second = generatePlanningCandidatesV1({
      snapshot,
      curriculumUnits: [mathSource],
    });

    expect(first).toEqual(second);

    expect(first.candidates.map((item) => item.candidateId))
      .toEqual(
        second.candidates.map((item) => item.candidateId),
      );

    expect(
      new Set(
        first.candidates.map(
          (candidate) => candidate.candidateId,
        ),
      ).size,
    ).toBe(first.candidates.length);
  });
});
