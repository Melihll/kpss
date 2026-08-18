import type {
  PlanningTriggerV2,
  ReplanScopeV2,
} from "./triggers";

export type IsoDateV2 = string;
export type IsoDateTimeV2 = string;

export interface PlannerVersions {
  readonly plannerVersion: string;
  readonly scoringVersion: string;
  readonly learnerStateVersion: string;
  readonly snapshotSchemaVersion: string;
}

export interface PlanningSnapshotMeta {
  readonly snapshotId: string;
  readonly snapshotHash: string | null;
  readonly generatedAt: IsoDateTimeV2;
  readonly currentDate: IsoDateV2;
  readonly weekStart: IsoDateV2;
  readonly weekEnd: IsoDateV2;
  readonly trigger: PlanningTriggerV2;
  readonly requestedScope: ReplanScopeV2;
  readonly versions: PlannerVersions;
}

export interface PlanningDayCapacity {
  readonly date: IsoDateV2;
  readonly grossCapacityMinutes: number;
  readonly reserveMinutes: number;
  readonly planningCapacityMinutes: number;
  readonly alreadyStudiedMinutes: number;
  readonly remainingCapacityMinutes: number;
  readonly unavailable: boolean;
}

export interface TaskProgressSnapshot {
  readonly taskId: string;
  readonly estimatedMinutes: number;
  readonly completedMinutes: number;
  readonly remainingMinutes: number;
  readonly actualStudyMinutes: number;
}

export interface CurriculumPrerequisiteRefV2 {
  readonly curriculumUnitId: string;
  readonly prerequisiteUnitId: string;
  readonly relation: "HARD" | "SOFT_SEQUENCE";
}

export interface ExistingScheduledTaskV2 {
  readonly taskId: string;
  readonly userId: string;
  readonly examProfileId: string;
  readonly weeklyPlanId: string | null;

  readonly curriculumUnitId: string | null;
  readonly subjectId: string | null;
  readonly resourceId: string | null;
  readonly resourceUnitIds: readonly string[];

  readonly title: string;
  readonly taskType: string;
  readonly lifecycleStatus: string;

  readonly plannedDate: IsoDateV2 | null;
  readonly estimatedMinutes: number;
  readonly completedMinutes: number;
  readonly remainingMinutes: number;

  readonly priorityScore: number;
  readonly importance: string | null;

  readonly isCompleted: boolean;
  readonly isActive: boolean;
  readonly isPartiallyCompleted: boolean;

  readonly earliestAllowedDate: IsoDateV2 | null;
  readonly latestAllowedDate: IsoDateV2 | null;
}

export const LEARNING_EVIDENCE_TYPES = [
  "STUDY",
  "QUESTION_RESULT",
  "RETRIEVAL",
  "WRONG_ANSWER",
  "MOCK_EXAM",
  "SELF_REPORT",
] as const;

export type LearningEvidenceType =
  (typeof LEARNING_EVIDENCE_TYPES)[number];

export interface LearnerUnitStateV1 {
  readonly userId: string;
  readonly examProfileId: string;
  readonly curriculumUnitId: string;

  readonly masteryMean: number | null;
  readonly masteryConfidence: number;

  readonly questionAccuracy: number | null;
  readonly questionCount: number;
  readonly averageQuestionSeconds: number | null;

  readonly studyMinutes: number;
  readonly evidenceCount: number;

  readonly difficultyEstimate: number | null;

  readonly lastStudiedAt: IsoDateTimeV2 | null;
  readonly lastRetrievalAt: IsoDateTimeV2 | null;

  readonly memoryStability: number | null;
  readonly memoryDifficulty: number | null;
  readonly retrievability: number | null;

  readonly misconceptionTags: readonly string[];

  readonly updatedAt: IsoDateTimeV2 | null;
}

export const CANDIDATE_TYPES = [
  "NEW_LEARNING",
  "CONTINUATION",
  "QUESTION_PRACTICE",
  "WRONG_REVIEW",
  "RETRIEVAL",
  "SPACED_REVIEW",
  "PREREQUISITE_REPAIR",
  "WEAKNESS_REPAIR",
  "MOCK_EXAM",
] as const;

export type CandidateType = (typeof CANDIDATE_TYPES)[number];

export interface CandidateScoreBreakdown {
  readonly examImportance: number;
  readonly masteryGap: number;
  readonly prerequisiteUnlockValue: number;
  readonly forgettingRisk: number;
  readonly deadlineUrgency: number;
  readonly continuityValue: number;
  readonly learnerPreference: number;
  readonly total: number;
}

export interface PlanningCandidateV1 {
  readonly candidateId: string;
  readonly userId: string;
  readonly curriculumUnitId: string | null;
  readonly subjectId: string | null;

  readonly candidateType: CandidateType;
  readonly title: string;

  readonly estimatedMinutes: number;
  readonly earliestDate: IsoDateV2;
  readonly latestDate: IsoDateV2;

  readonly hardEligible: boolean;
  readonly ineligibilityCodes: readonly string[];

  readonly score: number;
  readonly scoreBreakdown: CandidateScoreBreakdown;

  readonly explanationCodes: readonly string[];

  readonly sourceTaskId: string | null;
  readonly sourceResourceId: string | null;
}

export interface PlanningSnapshotV2 {
  readonly meta: PlanningSnapshotMeta;

  readonly userId: string;
  readonly examProfileId: string;

  readonly examDate: IsoDateV2 | null;

  readonly availableMinutes: number;
  readonly planningBudgetMinutes: number;
  readonly reserveMinutes: number;

  readonly dailyCapacities: readonly PlanningDayCapacity[];

  readonly existingTasks: readonly ExistingScheduledTaskV2[];
  readonly learnerStates: readonly LearnerUnitStateV1[];
  readonly prerequisites: readonly CurriculumPrerequisiteRefV2[];

  readonly activeTaskIds: readonly string[];
  readonly completedTaskIds: readonly string[];
}
