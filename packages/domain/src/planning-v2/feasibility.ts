import type {
  ExistingScheduledTaskV2,
  IsoDateV2,
  PlanningSnapshotV2,
} from "./types";

export const FEASIBILITY_VIOLATION_CODES_V2 = [
  "DAILY_OVERLOAD",
  "PAST_DUE_REMAINING_WORK",
  "MISSING_DAY_CAPACITY",
  "TASK_OUTSIDE_PLANNING_WEEK",
  "WEEKLY_REMAINING_CAPACITY_EXCEEDED",
] as const;

export type FeasibilityViolationCodeV2 =
  (typeof FEASIBILITY_VIOLATION_CODES_V2)[number];

export interface DailyFeasibilityV2 {
  readonly date: IsoDateV2;

  readonly remainingCapacityMinutes: number;
  readonly scheduledRemainingMinutes: number;

  readonly slackMinutes: number;
  readonly overloadMinutes: number;

  readonly taskIds: readonly string[];

  readonly feasible: boolean;
}

export interface FeasibilityViolationV2 {
  readonly code: FeasibilityViolationCodeV2;
  readonly message: string;

  readonly date: IsoDateV2 | null;
  readonly taskIds: readonly string[];

  readonly excessMinutes: number;
}

export interface CurrentPlanFeasibilityV2 {
  readonly feasible: boolean;

  readonly daily: readonly DailyFeasibilityV2[];
  readonly violations: readonly FeasibilityViolationV2[];

  readonly totalRemainingWorkMinutes: number;
  readonly totalRemainingCapacityMinutes: number;
  readonly totalSlackMinutes: number;
  readonly totalOverloadMinutes: number;

  readonly checkedTaskCount: number;
}

function remainingFutureTask(
  snapshot: PlanningSnapshotV2,
  task: ExistingScheduledTaskV2,
): boolean {
  if (task.isCompleted) {
    return false;
  }

  return task.remainingMinutes > 0;
}

function taskIds(
  tasks: readonly ExistingScheduledTaskV2[],
): readonly string[] {
  return Object.freeze(tasks.map((task) => task.taskId));
}

export function checkCurrentPlanFeasibilityV2(
  snapshot: PlanningSnapshotV2,
): CurrentPlanFeasibilityV2 {
  const violations: FeasibilityViolationV2[] = [];

  const capacityByDate = new Map(
    snapshot.dailyCapacities.map((day) => [day.date, day] as const),
  );

  const relevantTasks = snapshot.existingTasks.filter((task) =>
    remainingFutureTask(snapshot, task),
  );

  const pastDueTasks = relevantTasks.filter(
    (task) =>
      task.plannedDate !== null &&
      task.plannedDate < snapshot.meta.currentDate,
  );

  if (pastDueTasks.length > 0) {
    violations.push({
      code: "PAST_DUE_REMAINING_WORK",
      message:
        "Remaining work exists on dates before the current planning date.",
      date: null,
      taskIds: taskIds(pastDueTasks),
      excessMinutes: pastDueTasks.reduce(
        (sum, task) => sum + task.remainingMinutes,
        0,
      ),
    });
  }

  const outsideWeekTasks = relevantTasks.filter(
    (task) =>
      task.plannedDate !== null &&
      (task.plannedDate < snapshot.meta.weekStart ||
        task.plannedDate > snapshot.meta.weekEnd),
  );

  if (outsideWeekTasks.length > 0) {
    violations.push({
      code: "TASK_OUTSIDE_PLANNING_WEEK",
      message:
        "One or more remaining tasks are scheduled outside the planning week.",
      date: null,
      taskIds: taskIds(outsideWeekTasks),
      excessMinutes: outsideWeekTasks.reduce(
        (sum, task) => sum + task.remainingMinutes,
        0,
      ),
    });
  }

  const missingCapacityTasks = relevantTasks.filter(
    (task) =>
      task.plannedDate !== null &&
      task.plannedDate >= snapshot.meta.currentDate &&
      task.plannedDate >= snapshot.meta.weekStart &&
      task.plannedDate <= snapshot.meta.weekEnd &&
      !capacityByDate.has(task.plannedDate),
  );

  if (missingCapacityTasks.length > 0) {
    violations.push({
      code: "MISSING_DAY_CAPACITY",
      message:
        "One or more scheduled tasks do not have a matching daily capacity record.",
      date: null,
      taskIds: taskIds(missingCapacityTasks),
      excessMinutes: missingCapacityTasks.reduce(
        (sum, task) => sum + task.remainingMinutes,
        0,
      ),
    });
  }

  const futureDays = snapshot.dailyCapacities
    .filter(
      (day) =>
        day.date >= snapshot.meta.currentDate &&
        day.date >= snapshot.meta.weekStart &&
        day.date <= snapshot.meta.weekEnd,
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  const daily: DailyFeasibilityV2[] = futureDays.map((day) => {
    const tasks = relevantTasks.filter(
      (task) => task.plannedDate === day.date,
    );

    const scheduledRemainingMinutes = tasks.reduce(
      (sum, task) => sum + task.remainingMinutes,
      0,
    );

    const slackMinutes = Math.max(
      day.remainingCapacityMinutes - scheduledRemainingMinutes,
      0,
    );

    const overloadMinutes = Math.max(
      scheduledRemainingMinutes - day.remainingCapacityMinutes,
      0,
    );

    if (overloadMinutes > 0) {
      violations.push({
        code: "DAILY_OVERLOAD",
        message: `Scheduled remaining workload exceeds remaining capacity on ${day.date}.`,
        date: day.date,
        taskIds: taskIds(tasks),
        excessMinutes: overloadMinutes,
      });
    }

    return Object.freeze({
      date: day.date,
      remainingCapacityMinutes: day.remainingCapacityMinutes,
      scheduledRemainingMinutes,
      slackMinutes,
      overloadMinutes,
      taskIds: taskIds(tasks),
      feasible: overloadMinutes === 0,
    });
  });

  const scheduledFutureTaskIds = new Set(
    daily.flatMap((day) => day.taskIds),
  );

  const totalRemainingWorkMinutes = relevantTasks
    .filter((task) => scheduledFutureTaskIds.has(task.taskId))
    .reduce((sum, task) => sum + task.remainingMinutes, 0);

  const totalRemainingCapacityMinutes = daily.reduce(
    (sum, day) => sum + day.remainingCapacityMinutes,
    0,
  );

  if (totalRemainingWorkMinutes > totalRemainingCapacityMinutes) {
    violations.push({
      code: "WEEKLY_REMAINING_CAPACITY_EXCEEDED",
      message:
        "Remaining scheduled workload exceeds the remaining planning capacity.",
      date: null,
      taskIds: Object.freeze([...scheduledFutureTaskIds]),
      excessMinutes:
        totalRemainingWorkMinutes - totalRemainingCapacityMinutes,
    });
  }

  const totalSlackMinutes = daily.reduce(
    (sum, day) => sum + day.slackMinutes,
    0,
  );

  const totalOverloadMinutes = daily.reduce(
    (sum, day) => sum + day.overloadMinutes,
    0,
  );

  const result: CurrentPlanFeasibilityV2 = {
    feasible: violations.length === 0,

    daily: Object.freeze(daily),
    violations: Object.freeze(violations),

    totalRemainingWorkMinutes,
    totalRemainingCapacityMinutes,
    totalSlackMinutes,
    totalOverloadMinutes,

    checkedTaskCount: relevantTasks.length,
  };

  return Object.freeze(result);
}

export function isCurrentPlanFeasibleV2(
  snapshot: PlanningSnapshotV2,
): boolean {
  return checkCurrentPlanFeasibilityV2(snapshot).feasible;
}
