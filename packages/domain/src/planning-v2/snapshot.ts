import { defaultReplanScopeV2 } from "./triggers";
import type { PlanningTriggerV2, ReplanScopeV2 } from "./triggers";
import type {
  CurriculumPrerequisiteRefV2,
  ExistingScheduledTaskV2,
  IsoDateTimeV2,
  IsoDateV2,
  LearnerUnitStateV1,
  PlannerVersions,
  PlanningDayCapacity,
  PlanningSnapshotV2,
} from "./types";

export interface PlanningDayCapacityInputV2 {
  readonly date: IsoDateV2;
  readonly grossCapacityMinutes: number;
  readonly reserveMinutes: number;
  readonly alreadyStudiedMinutes: number;
  readonly unavailable?: boolean;
}

export interface ExistingScheduledTaskInputV2 {
  readonly taskId: string;
  readonly userId: string;
  readonly examProfileId: string;
  readonly weeklyPlanId: string | null;

  readonly curriculumUnitId: string | null;
  readonly subjectId: string | null;
  readonly resourceId: string | null;
  readonly resourceUnitIds?: readonly string[];

  readonly title: string;
  readonly taskType: string;
  readonly lifecycleStatus: string;

  readonly plannedDate: IsoDateV2 | null;
  readonly estimatedMinutes: number;
  readonly completedMinutes: number;

  readonly priorityScore?: number;
  readonly importance?: string | null;

  // Lifecycle flags are explicit.
  // They must NOT be inferred from minute totals.
  readonly isCompleted: boolean;
  readonly isActive: boolean;
  readonly isPartiallyCompleted: boolean;

  readonly earliestAllowedDate?: IsoDateV2 | null;
  readonly latestAllowedDate?: IsoDateV2 | null;
}

export interface BuildPlanningSnapshotV2Input {
  readonly snapshotId: string;
  readonly snapshotHash?: string | null;

  readonly generatedAt: IsoDateTimeV2;
  readonly currentDate: IsoDateV2;
  readonly weekStart: IsoDateV2;
  readonly weekEnd: IsoDateV2;

  readonly trigger: PlanningTriggerV2;
  readonly requestedScope?: ReplanScopeV2;

  readonly versions: PlannerVersions;

  readonly userId: string;
  readonly examProfileId: string;
  readonly examDate: IsoDateV2 | null;

  readonly availableMinutes: number;
  readonly planningBudgetMinutes: number;
  readonly reserveMinutes: number;

  readonly dailyCapacities: readonly PlanningDayCapacityInputV2[];
  readonly existingTasks: readonly ExistingScheduledTaskInputV2[];

  readonly learnerStates?: readonly LearnerUnitStateV1[];
  readonly prerequisites?: readonly CurriculumPrerequisiteRefV2[];
}

function assertNonNegativeNumber(
  name: string,
  value: number,
): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a finite non-negative number`);
  }
}

function assertIsoDate(name: string, value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${name} must use YYYY-MM-DD format`);
  }
}

function deepFreezeV2<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreezeV2(nested);
  }

  return Object.freeze(value);
}

export function remainingTaskMinutesV2(
  estimatedMinutes: number,
  completedMinutes: number,
): number {
  assertNonNegativeNumber("estimatedMinutes", estimatedMinutes);
  assertNonNegativeNumber("completedMinutes", completedMinutes);

  return Math.max(estimatedMinutes - completedMinutes, 0);
}

export function buildPlanningDayCapacityV2(
  input: PlanningDayCapacityInputV2,
): PlanningDayCapacity {
  assertIsoDate("capacity.date", input.date);
  assertNonNegativeNumber(
    "capacity.grossCapacityMinutes",
    input.grossCapacityMinutes,
  );
  assertNonNegativeNumber(
    "capacity.reserveMinutes",
    input.reserveMinutes,
  );
  assertNonNegativeNumber(
    "capacity.alreadyStudiedMinutes",
    input.alreadyStudiedMinutes,
  );

  const planningCapacityMinutes = Math.max(
    input.grossCapacityMinutes - input.reserveMinutes,
    0,
  );

  const remainingCapacityMinutes = Math.max(
    planningCapacityMinutes - input.alreadyStudiedMinutes,
    0,
  );

  return {
    date: input.date,
    grossCapacityMinutes: input.grossCapacityMinutes,
    reserveMinutes: input.reserveMinutes,
    planningCapacityMinutes,
    alreadyStudiedMinutes: input.alreadyStudiedMinutes,
    remainingCapacityMinutes,
    unavailable: input.unavailable ?? input.grossCapacityMinutes === 0,
  };
}

export function buildExistingScheduledTaskV2(
  input: ExistingScheduledTaskInputV2,
): ExistingScheduledTaskV2 {
  assertNonNegativeNumber(
    `${input.taskId}.estimatedMinutes`,
    input.estimatedMinutes,
  );
  assertNonNegativeNumber(
    `${input.taskId}.completedMinutes`,
    input.completedMinutes,
  );

  if (input.plannedDate !== null) {
    assertIsoDate(`${input.taskId}.plannedDate`, input.plannedDate);
  }

  return {
    taskId: input.taskId,
    userId: input.userId,
    examProfileId: input.examProfileId,
    weeklyPlanId: input.weeklyPlanId,

    curriculumUnitId: input.curriculumUnitId,
    subjectId: input.subjectId,
    resourceId: input.resourceId,
    resourceUnitIds: [...(input.resourceUnitIds ?? [])],

    title: input.title,
    taskType: input.taskType,
    lifecycleStatus: input.lifecycleStatus,

    plannedDate: input.plannedDate,
    estimatedMinutes: input.estimatedMinutes,
    completedMinutes: input.completedMinutes,
    remainingMinutes: remainingTaskMinutesV2(
      input.estimatedMinutes,
      input.completedMinutes,
    ),

    priorityScore: input.priorityScore ?? 0,
    importance: input.importance ?? null,

    isCompleted: input.isCompleted,
    isActive: input.isActive,
    isPartiallyCompleted: input.isPartiallyCompleted,

    earliestAllowedDate: input.earliestAllowedDate ?? null,
    latestAllowedDate: input.latestAllowedDate ?? null,
  };
}

export function buildPlanningSnapshotV2(
  input: BuildPlanningSnapshotV2Input,
): PlanningSnapshotV2 {
  assertIsoDate("currentDate", input.currentDate);
  assertIsoDate("weekStart", input.weekStart);
  assertIsoDate("weekEnd", input.weekEnd);

  if (input.examDate !== null) {
    assertIsoDate("examDate", input.examDate);
  }

  if (input.weekStart > input.weekEnd) {
    throw new Error("weekStart must not be after weekEnd");
  }

  if (input.currentDate < input.weekStart || input.currentDate > input.weekEnd) {
    throw new Error("currentDate must be inside the planning week");
  }

  assertNonNegativeNumber("availableMinutes", input.availableMinutes);
  assertNonNegativeNumber(
    "planningBudgetMinutes",
    input.planningBudgetMinutes,
  );
  assertNonNegativeNumber("reserveMinutes", input.reserveMinutes);

  const seenDates = new Set<string>();

  const dailyCapacities = input.dailyCapacities.map((day) => {
    if (seenDates.has(day.date)) {
      throw new Error(`duplicate daily capacity date: ${day.date}`);
    }

    seenDates.add(day.date);

    if (day.date < input.weekStart || day.date > input.weekEnd) {
      throw new Error(`capacity date outside planning week: ${day.date}`);
    }

    return buildPlanningDayCapacityV2(day);
  });

  const seenTaskIds = new Set<string>();

  const existingTasks = input.existingTasks.map((task) => {
    if (seenTaskIds.has(task.taskId)) {
      throw new Error(`duplicate task id: ${task.taskId}`);
    }

    seenTaskIds.add(task.taskId);

    if (task.userId !== input.userId) {
      throw new Error(`task ownership mismatch: ${task.taskId}`);
    }

    if (task.examProfileId !== input.examProfileId) {
      throw new Error(`task exam profile mismatch: ${task.taskId}`);
    }

    return buildExistingScheduledTaskV2(task);
  });

  const snapshot: PlanningSnapshotV2 = {
    meta: {
      snapshotId: input.snapshotId,
      snapshotHash: input.snapshotHash ?? null,
      generatedAt: input.generatedAt,
      currentDate: input.currentDate,
      weekStart: input.weekStart,
      weekEnd: input.weekEnd,
      trigger: input.trigger,
      requestedScope:
        input.requestedScope ?? defaultReplanScopeV2(input.trigger),
      versions: { ...input.versions },
    },

    userId: input.userId,
    examProfileId: input.examProfileId,
    examDate: input.examDate,

    availableMinutes: input.availableMinutes,
    planningBudgetMinutes: input.planningBudgetMinutes,
    reserveMinutes: input.reserveMinutes,

    dailyCapacities,

    existingTasks,
    learnerStates: [...(input.learnerStates ?? [])],
    prerequisites: [...(input.prerequisites ?? [])],

    activeTaskIds: existingTasks
      .filter((task) => task.isActive)
      .map((task) => task.taskId),

    completedTaskIds: existingTasks
      .filter((task) => task.isCompleted)
      .map((task) => task.taskId),
  };

  return deepFreezeV2(snapshot);
}
