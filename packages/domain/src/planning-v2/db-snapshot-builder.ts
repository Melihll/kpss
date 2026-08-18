import {
  buildPlanningSnapshotV2,
} from "./snapshot";

import {
  normalizePlanningSnapshotDbBundleV1,
  type PlanningSnapshotDbBundleV1,
} from "./db-snapshot-contract";

import type {
  CurriculumPrerequisiteRefV2,
  IsoDateV2,
  IsoDateTimeV2,
  PlannerVersions,
  PlanningSnapshotV2,
} from "./types";

import type {
  PlanningTriggerV2,
  ReplanScopeV2,
} from "./triggers";

export interface BuildPlanningSnapshotFromDbBundleV1Input {
  readonly bundle: PlanningSnapshotDbBundleV1;

  readonly snapshotId: string;
  readonly snapshotHash?: string | null;

  readonly generatedAt: IsoDateTimeV2;
  readonly currentDate: IsoDateV2;

  readonly trigger: PlanningTriggerV2;
  readonly requestedScope?: ReplanScopeV2;

  readonly versions: PlannerVersions;

  readonly examDate: IsoDateV2 | null;

  readonly prerequisites?:
    readonly CurriculumPrerequisiteRefV2[];
}

function assertNonBlank(
  name: string,
  value: string,
): void {
  if (!value.trim()) {
    throw new Error(
      `${name} must not be blank`,
    );
  }
}

export function buildPlanningSnapshotFromDbBundleV1(
  input: BuildPlanningSnapshotFromDbBundleV1Input,
): PlanningSnapshotV2 {
  assertNonBlank(
    "snapshotId",
    input.snapshotId,
  );

  const normalized =
    normalizePlanningSnapshotDbBundleV1(
      input.bundle,
    );

  const {
    weeklyPlan,
  } = normalized;

  if (
    input.currentDate <
      weeklyPlan.week_start_date ||
    input.currentDate >
      weeklyPlan.week_end_date
  ) {
    throw new Error(
      "currentDate must be inside the loaded weekly plan",
    );
  }

  /*
   * IMPORTANT:
   *
   * availableMinutes is derived from the EFFECTIVE
   * daily capacity state, not blindly copied from
   * weekly_plans.available_minutes.
   *
   * This lets the snapshot represent:
   *
   * +60 capacity:
   * available = 1860
   * budget    = 1785
   *
   * -90 capacity:
   * available = 1710
   * budget    = 1785
   *
   * The second state is intentionally infeasible.
   */
  const availableMinutes =
    normalized.dailyCapacities.reduce(
      (sum, day) =>
        sum +
        day.grossCapacityMinutes,
      0,
    );

  const reserveMinutes =
    normalized.dailyCapacities.reduce(
      (sum, day) =>
        sum +
        day.reserveMinutes,
      0,
    );

  const rawTaskById =
    new Map(
      input.bundle.tasks.map(
        (task) =>
          [task.id, task] as const,
      ),
    );

  const dailyCapacities =
    normalized.dailyCapacities.map(
      (day) => ({
        date:
          day.date,

        grossCapacityMinutes:
          day.grossCapacityMinutes,

        reserveMinutes:
          day.reserveMinutes,

        alreadyStudiedMinutes:
          day.alreadyStudiedMinutes,

        /*
         * Zero gross capacity represents a
         * completely unavailable day.
         */
        unavailable:
          day.grossCapacityMinutes === 0,
      }),
    );

  const existingTasks =
    normalized.tasks.map(
      (task) => {
        const raw =
          rawTaskById.get(
            task.taskId,
          );

        if (!raw) {
          throw new Error(
            `raw task missing after normalization: ${task.taskId}`,
          );
        }

        const priorityScore =
          raw.priority_score ?? 0;

        if (
          !Number.isFinite(
            priorityScore,
          ) ||
          priorityScore < 0 ||
          priorityScore > 100
        ) {
          throw new Error(
            `invalid priority score: ${task.taskId}`,
          );
        }

        return {
          taskId:
            task.taskId,

          userId:
            task.userId,

          examProfileId:
            task.examProfileId,

          weeklyPlanId:
            task.weeklyPlanId,

          curriculumUnitId:
            task.curriculumUnitId,

          subjectId:
            task.subjectId,

          resourceId:
            task.resourceId,

          /*
           * Loaded in the Supabase adapter phase.
           * Empty here is explicit, not inferred.
           */
          resourceUnitIds:
            Object.freeze([]),

          title:
            task.title,

          taskType:
            task.taskType,

          lifecycleStatus:
            task.status,

          plannedDate:
            task.plannedDate,

          estimatedMinutes:
            task.estimatedMinutes,

          completedMinutes:
            task.completedMinutes,

          priorityScore,

          importance:
            raw.importance ?? null,

          /*
           * These are authoritative DB lifecycle
           * flags from tasks.status.
           *
           * Never infer them from minute totals.
           */
          isCompleted:
            task.isCompleted,

          isActive:
            task.isActive,

          isPartiallyCompleted:
            task.isPartiallyCompleted,

          /*
           * No fake curriculum constraints.
           * Real DAG/eligibility constraints will
           * be supplied separately.
           */
          earliestAllowedDate:
            null,

          latestAllowedDate:
            null,
        };
      },
    );

  return buildPlanningSnapshotV2({
    snapshotId:
      input.snapshotId,

    snapshotHash:
      input.snapshotHash ?? null,

    generatedAt:
      input.generatedAt,

    currentDate:
      input.currentDate,

    weekStart:
      weeklyPlan.week_start_date,

    weekEnd:
      weeklyPlan.week_end_date,

    trigger:
      input.trigger,

    requestedScope:
      input.requestedScope,

    versions:
      input.versions,

    userId:
      weeklyPlan.user_id,

    examProfileId:
      weeklyPlan.exam_profile_id,

    examDate:
      input.examDate,

    availableMinutes,

    /*
     * Stable source-of-truth budget.
     *
     * Capacity increases must not automatically
     * inflate the learner workload target.
     */
    planningBudgetMinutes:
      weeklyPlan.planning_budget_minutes,

    reserveMinutes,

    dailyCapacities,

    existingTasks,

    learnerStates:
      normalized.learnerStates,

    prerequisites:
      input.prerequisites ?? [],
  });
}
