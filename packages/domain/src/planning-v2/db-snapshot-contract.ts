import type {
  IsoDateV2,
  LearnerUnitStateV1,
} from "./types";

export const PLANNING_TASK_DB_STATUSES_V1 = [
  "planned",
  "ready",
  "in_progress",
  "partially_completed",
  "completed",
  "rescheduled",
  "missed",
  "cancelled",
] as const;

export type PlanningTaskDbStatusV1 =
  (typeof PLANNING_TASK_DB_STATUSES_V1)[number];

export interface WeeklyPlanDbRowV1 {
  readonly id: string;
  readonly user_id: string;
  readonly exam_profile_id: string;

  readonly week_start_date: IsoDateV2;
  readonly week_end_date: IsoDateV2;

  readonly available_minutes: number;
  readonly planning_budget_minutes: number;
  readonly planned_minutes: number;

  readonly status:
    | "draft"
    | "active"
    | "completed"
    | "superseded"
    | "cancelled";

  readonly generation_version: number;
}

export interface PlanningTaskDbRowV1 {
  readonly id: string;

  readonly user_id: string;
  readonly exam_profile_id: string;

  readonly weekly_plan_id: string | null;

  readonly subject_id: string;
  readonly curriculum_node_id: string | null;

  readonly resource_id: string | null;
  readonly resource_section_id?: string | null;

  readonly task_type: string;

  readonly title: string;

  readonly planned_date: IsoDateV2 | null;

  readonly estimated_minutes: number;

  readonly priority_score?: number;
  readonly importance?: string | null;

  readonly status: PlanningTaskDbStatusV1;

  readonly completed_at: string | null;
}

export interface TaskProgressDbRowV1 {
  readonly task_id: string;
  readonly user_id: string;
  readonly completed_minutes: number;
}

export interface PlanningTaskRuntimeStateV1 {
  readonly taskId: string;

  readonly userId: string;
  readonly examProfileId: string;
  readonly weeklyPlanId: string | null;

  readonly subjectId: string;
  readonly curriculumUnitId: string | null;

  readonly resourceId: string | null;
  readonly resourceSectionId: string | null;

  readonly taskType: string;
  readonly title: string;

  readonly plannedDate: IsoDateV2 | null;

  readonly estimatedMinutes: number;
  readonly completedMinutes: number;
  readonly remainingMinutes: number;

  /*
   * Lifecycle is authoritative from tasks.status.
   * It is NEVER inferred from completedMinutes.
   */
  readonly isCompleted: boolean;
  readonly isActive: boolean;
  readonly isPartiallyCompleted: boolean;

  readonly status: PlanningTaskDbStatusV1;
}

export interface LearnerUnitStateV2DbRowV1 {
  readonly user_id: string;
  readonly exam_profile_id: string;
  readonly curriculum_node_id: string;

  readonly mastery_mean: number | null;
  readonly mastery_confidence: number;

  readonly question_accuracy: number | null;
  readonly question_count: number;
  readonly average_question_seconds: number | null;

  readonly study_minutes: number;
  readonly evidence_count: number;

  readonly difficulty_estimate: number | null;

  readonly last_studied_at: string | null;
  readonly last_retrieval_at: string | null;

  readonly memory_stability: number | null;
  readonly memory_difficulty: number | null;
  readonly retrievability: number | null;

  readonly misconception_tags:
    readonly string[];

  readonly state_version: string;
}

export interface PlanningDayCapacitySourceV1 {
  readonly date: IsoDateV2;

  readonly grossCapacityMinutes: number;
  readonly reserveMinutes: number;

  /*
   * Real study already recorded for this date.
   */
  readonly alreadyStudiedMinutes: number;
}

export interface PlanningSnapshotDbBundleV1 {
  readonly weeklyPlan: WeeklyPlanDbRowV1;

  readonly tasks:
    readonly PlanningTaskDbRowV1[];

  readonly taskProgress:
    readonly TaskProgressDbRowV1[];

  readonly learnerStates:
    readonly LearnerUnitStateV2DbRowV1[];

  readonly dailyCapacities:
    readonly PlanningDayCapacitySourceV1[];
}

export interface NormalizedPlanningSnapshotDbBundleV1 {
  readonly weeklyPlan: WeeklyPlanDbRowV1;

  readonly tasks:
    readonly PlanningTaskRuntimeStateV1[];

  readonly learnerStates:
    readonly LearnerUnitStateV1[];

  readonly dailyCapacities:
    readonly PlanningDayCapacitySourceV1[];

  readonly totalEstimatedMinutes: number;
  readonly totalCompletedMinutes: number;
  readonly totalRemainingMinutes: number;
}

function assertNonNegativeInteger(
  name: string,
  value: number,
): void {
  if (
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new Error(
      `${name} must be a non-negative integer`,
    );
  }
}

function assertOwnership(
  name: string,
  expectedUserId: string,
  expectedProfileId: string,
  actualUserId: string,
  actualProfileId: string,
): void {
  if (
    expectedUserId !== actualUserId ||
    expectedProfileId !==
      actualProfileId
  ) {
    throw new Error(
      `${name} ownership mismatch`,
    );
  }
}

export function mergePlanningTaskProgressV1(
  task: PlanningTaskDbRowV1,
  progress:
    TaskProgressDbRowV1 | null,
): PlanningTaskRuntimeStateV1 {
  assertNonNegativeInteger(
    "estimated_minutes",
    task.estimated_minutes,
  );

  if (task.estimated_minutes === 0) {
    throw new Error(
      "estimated_minutes must be positive",
    );
  }

  if (
    progress !== null &&
    progress.user_id !== task.user_id
  ) {
    throw new Error(
      "task progress ownership mismatch",
    );
  }

  const completedMinutes =
    progress?.completed_minutes ?? 0;

  assertNonNegativeInteger(
    "completed_minutes",
    completedMinutes,
  );

  const remainingMinutes =
    Math.max(
      task.estimated_minutes -
        completedMinutes,
      0,
    );

  return Object.freeze({
    taskId: task.id,

    userId: task.user_id,
    examProfileId:
      task.exam_profile_id,

    weeklyPlanId:
      task.weekly_plan_id,

    subjectId: task.subject_id,

    curriculumUnitId:
      task.curriculum_node_id,

    resourceId:
      task.resource_id,

    resourceSectionId:
      task.resource_section_id ??
      null,

    taskType:
      task.task_type,

    title:
      task.title,

    plannedDate:
      task.planned_date,

    estimatedMinutes:
      task.estimated_minutes,

    completedMinutes,
    remainingMinutes,

    isCompleted:
      task.status === "completed",

    isActive:
      task.status === "in_progress",

    isPartiallyCompleted:
      task.status ===
      "partially_completed",

    status:
      task.status,
  });
}

export function learnerStateFromDbProjectionV1(
  row: LearnerUnitStateV2DbRowV1,
): LearnerUnitStateV1 {
  return Object.freeze({
    userId:
      row.user_id,

    examProfileId:
      row.exam_profile_id,

    curriculumUnitId:
      row.curriculum_node_id,

    masteryMean:
      row.mastery_mean,

    masteryConfidence:
      row.mastery_confidence,

    questionAccuracy:
      row.question_accuracy,

    questionCount:
      row.question_count,

    averageQuestionSeconds:
      row.average_question_seconds,

    studyMinutes:
      row.study_minutes,

    evidenceCount:
      row.evidence_count,

    difficultyEstimate:
      row.difficulty_estimate,

    lastStudiedAt:
      row.last_studied_at,

    lastRetrievalAt:
      row.last_retrieval_at,

    memoryStability:
      row.memory_stability,

    memoryDifficulty:
      row.memory_difficulty,

    retrievability:
      row.retrievability,

    misconceptionTags:
      Object.freeze([
        ...row.misconception_tags,
      ]),

    /*
     * The persisted projection represents
     * the current calculated state.
     */
    updatedAt: null,
  });
}

export function normalizePlanningSnapshotDbBundleV1(
  input: PlanningSnapshotDbBundleV1,
): NormalizedPlanningSnapshotDbBundleV1 {
  const {
    weeklyPlan,
  } = input;

  const progressByTaskId =
    new Map<
      string,
      TaskProgressDbRowV1
    >();

  for (
    const progress
    of input.taskProgress
  ) {
    if (
      progressByTaskId.has(
        progress.task_id,
      )
    ) {
      throw new Error(
        `duplicate task progress: ${progress.task_id}`,
      );
    }

    progressByTaskId.set(
      progress.task_id,
      progress,
    );
  }

  const seenTaskIds =
    new Set<string>();

  const tasks =
    input.tasks.map((task) => {
      assertOwnership(
        `task:${task.id}`,
        weeklyPlan.user_id,
        weeklyPlan.exam_profile_id,
        task.user_id,
        task.exam_profile_id,
      );

      if (
        task.weekly_plan_id !==
        weeklyPlan.id
      ) {
        throw new Error(
          `task weekly plan mismatch: ${task.id}`,
        );
      }

      if (
        seenTaskIds.has(task.id)
      ) {
        throw new Error(
          `duplicate task: ${task.id}`,
        );
      }

      seenTaskIds.add(task.id);

      const progress =
        progressByTaskId.get(
          task.id,
        ) ?? null;

      return mergePlanningTaskProgressV1(
        task,
        progress,
      );
    });

  /*
   * Progress for a task outside the loaded
   * weekly task set means the query bundle
   * is inconsistent.
   */
  for (
    const progress
    of input.taskProgress
  ) {
    if (
      !seenTaskIds.has(
        progress.task_id,
      )
    ) {
      throw new Error(
        `orphan task progress in snapshot bundle: ${progress.task_id}`,
      );
    }
  }

  const seenLearnerUnits =
    new Set<string>();

  const learnerStates =
    input.learnerStates.map(
      (row) => {
        assertOwnership(
          `learner-state:${row.curriculum_node_id}`,
          weeklyPlan.user_id,
          weeklyPlan.exam_profile_id,
          row.user_id,
          row.exam_profile_id,
        );

        if (
          seenLearnerUnits.has(
            row.curriculum_node_id,
          )
        ) {
          throw new Error(
            `duplicate learner state: ${row.curriculum_node_id}`,
          );
        }

        seenLearnerUnits.add(
          row.curriculum_node_id,
        );

        return learnerStateFromDbProjectionV1(
          row,
        );
      },
    );

  const seenDates =
    new Set<IsoDateV2>();

  const dailyCapacities =
    input.dailyCapacities
      .map((day) => {
        assertNonNegativeInteger(
          `gross capacity ${day.date}`,
          day.grossCapacityMinutes,
        );

        assertNonNegativeInteger(
          `reserve ${day.date}`,
          day.reserveMinutes,
        );

        assertNonNegativeInteger(
          `already studied ${day.date}`,
          day.alreadyStudiedMinutes,
        );

        if (
          day.reserveMinutes >
          day.grossCapacityMinutes
        ) {
          throw new Error(
            `reserve exceeds gross capacity: ${day.date}`,
          );
        }

        if (
          seenDates.has(day.date)
        ) {
          throw new Error(
            `duplicate daily capacity: ${day.date}`,
          );
        }

        if (
          day.date <
            weeklyPlan.week_start_date ||
          day.date >
            weeklyPlan.week_end_date
        ) {
          throw new Error(
            `daily capacity outside weekly plan: ${day.date}`,
          );
        }

        seenDates.add(day.date);

        return Object.freeze({
          ...day,
        });
      })
      .sort(
        (a, b) =>
          a.date.localeCompare(
            b.date,
          ),
      );

  const totalEstimatedMinutes =
    tasks.reduce(
      (sum, task) =>
        sum +
        task.estimatedMinutes,
      0,
    );

  const totalCompletedMinutes =
    tasks.reduce(
      (sum, task) =>
        sum +
        task.completedMinutes,
      0,
    );

  const totalRemainingMinutes =
    tasks
      .filter(
        (task) =>
          !task.isCompleted,
      )
      .reduce(
        (sum, task) =>
          sum +
          task.remainingMinutes,
        0,
      );

  return Object.freeze({
    weeklyPlan,

    tasks:
      Object.freeze(tasks),

    learnerStates:
      Object.freeze(
        learnerStates,
      ),

    dailyCapacities:
      Object.freeze(
        dailyCapacities,
      ),

    totalEstimatedMinutes,
    totalCompletedMinutes,
    totalRemainingMinutes,
  });
}

