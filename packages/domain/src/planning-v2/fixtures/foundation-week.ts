import {
  buildPlanningSnapshotV2,
  type BuildPlanningSnapshotV2Input,
} from "../snapshot";
import type {
  ExistingScheduledTaskV2,
  PlanningSnapshotV2,
} from "../types";
import type { PlanningTriggerV2 } from "../triggers";

export const FOUNDATION_WEEK_V2 = {
  weekStart: "2026-08-17",
  weekEnd: "2026-08-23",

  grossAvailableMinutes: 1800,
  planningBudgetMinutes: 1785,
  reserveMinutes: 15,

  dayGrossCapacities: {
    "2026-08-17": 240,
    "2026-08-18": 240,
    "2026-08-19": 240,
    "2026-08-20": 240,
    "2026-08-21": 240,
    "2026-08-22": 300,
    "2026-08-23": 300,
  } as const,

  dayReserveMinutes: {
    "2026-08-17": 0,
    "2026-08-18": 0,
    "2026-08-19": 0,
    "2026-08-20": 0,
    "2026-08-21": 0,
    "2026-08-22": 0,
    "2026-08-23": 15,
  } as const,
} as const;

type TaskSpec = readonly [
  id: string,
  date: string,
  minutes: number,
  subjectId: string,
  curriculumUnitId: string,
];

const TASK_SPECS: readonly TaskSpec[] = [
  ["task-01", "2026-08-17", 90, "math", "math-foundations-01"],
  ["task-02", "2026-08-17", 50, "turkish", "turkish-grammar-01"],
  ["task-03", "2026-08-17", 70, "economics", "economics-intro"],
  ["task-04", "2026-08-17", 30, "history", "history-foundation"],

  ["task-05", "2026-08-18", 90, "math", "math-foundations-02"],
  ["task-06", "2026-08-18", 50, "turkish", "turkish-grammar-02"],
  ["task-07", "2026-08-18", 30, "geography", "geography-location-01"],
  ["task-08", "2026-08-18", 70, "law", "law-constitution-theory"],

  ["task-09", "2026-08-19", 75, "math", "math-foundations-03"],
  ["task-10", "2026-08-19", 75, "public-finance", "finance-01"],
  ["task-11", "2026-08-19", 30, "history", "history-turk-islam-01"],
  ["task-12", "2026-08-19", 60, "economics", "economics-consumer-01"],

  ["task-13", "2026-08-20", 75, "math", "math-foundations-04"],
  ["task-14", "2026-08-20", 75, "accounting", "accounting-01"],
  ["task-15", "2026-08-20", 50, "turkish", "turkish-grammar-03"],
  ["task-16", "2026-08-20", 40, "geography", "geography-location-02"],

  ["task-17", "2026-08-21", 75, "math", "math-foundations-05"],
  ["task-18", "2026-08-21", 60, "economics", "economics-consumer-02"],
  ["task-19", "2026-08-21", 60, "law", "law-constitutional-history"],
  ["task-20", "2026-08-21", 45, "turkish", "turkish-grammar-04"],

  ["task-21", "2026-08-22", 75, "math", "math-division"],
  ["task-22", "2026-08-22", 75, "public-finance", "finance-02"],
  ["task-23", "2026-08-22", 70, "accounting", "accounting-02"],
  ["task-24", "2026-08-22", 40, "history", "history-later-01"],
  ["task-25", "2026-08-22", 40, "geography", "geography-landforms"],

  ["task-26", "2026-08-23", 70, "math", "math-ebob-ekok"],
  ["task-27", "2026-08-23", 55, "turkish", "turkish-week-finish"],
  ["task-28", "2026-08-23", 65, "economics", "economics-week-review"],
  ["task-29", "2026-08-23", 45, "history", "history-week-review"],
  ["task-30", "2026-08-23", 50, "geography", "geography-week-review"],
];

export interface FoundationWeekGoldenOptions {
  readonly trigger?: PlanningTriggerV2;
  readonly currentDate?: string;

  readonly completedMinutesByTaskId?: Readonly<Record<string, number>>;
  readonly activeTaskIds?: readonly string[];
  readonly completedTaskIds?: readonly string[];
  readonly partiallyCompletedTaskIds?: readonly string[];

  readonly studiedMinutesByDate?: Readonly<Record<string, number>>;

  readonly capacityDeltaByDate?: Readonly<Record<string, number>>;
}

function includes(
  values: readonly string[] | undefined,
  id: string,
): boolean {
  return values?.includes(id) ?? false;
}

export function buildFoundationWeekGoldenInputV2(
  options: FoundationWeekGoldenOptions = {},
): BuildPlanningSnapshotV2Input {
  const currentDate = options.currentDate ?? "2026-08-17";

  const dailyCapacities = Object.entries(
    FOUNDATION_WEEK_V2.dayGrossCapacities,
  ).map(([date, baseGrossCapacity]) => ({
    date,
    grossCapacityMinutes:
      baseGrossCapacity + (options.capacityDeltaByDate?.[date] ?? 0),
    reserveMinutes:
      FOUNDATION_WEEK_V2.dayReserveMinutes[
        date as keyof typeof FOUNDATION_WEEK_V2.dayReserveMinutes
      ],
    alreadyStudiedMinutes: options.studiedMinutesByDate?.[date] ?? 0,
  }));

  const existingTasks = TASK_SPECS.map(
    ([taskId, plannedDate, estimatedMinutes, subjectId, curriculumUnitId]) => {
      const completedMinutes =
        options.completedMinutesByTaskId?.[taskId] ?? 0;

      const isCompleted = includes(options.completedTaskIds, taskId);
      const isActive = includes(options.activeTaskIds, taskId);
      const isPartiallyCompleted =
        includes(options.partiallyCompletedTaskIds, taskId) ||
        (!isCompleted && completedMinutes > 0);

      const lifecycleStatus = isCompleted
        ? "completed"
        : isActive
          ? "in_progress"
          : isPartiallyCompleted
            ? "partially_completed"
            : "ready";

      return {
        taskId,
        userId: "golden-user",
        examProfileId: "golden-profile",
        weeklyPlanId: "golden-week",

        curriculumUnitId,
        subjectId,
        resourceId: `resource-${subjectId}`,
        resourceUnitIds: [`resource-unit-${taskId}`],

        title: `Golden ${taskId}`,
        taskType: "study",

        lifecycleStatus,
        plannedDate,
        estimatedMinutes,
        completedMinutes,

        priorityScore: 60,
        importance: "important",

        isCompleted,
        isActive,
        isPartiallyCompleted,
      };
    },
  );

  const capacityDeltaTotal = Object.values(
    options.capacityDeltaByDate ?? {},
  ).reduce((sum, value) => sum + value, 0);

  return {
    snapshotId: "golden-foundation-week",
    generatedAt: "2026-08-18T12:00:00+03:00",

    currentDate,
    weekStart: FOUNDATION_WEEK_V2.weekStart,
    weekEnd: FOUNDATION_WEEK_V2.weekEnd,

    trigger: options.trigger ?? "WEEKLY_REVIEW",

    versions: {
      plannerVersion: "planning-v2-dev",
      scoringVersion: "scoring-v1-dev",
      learnerStateVersion: "learner-state-v1-dev",
      snapshotSchemaVersion: "snapshot-v1",
    },

    userId: "golden-user",
    examProfileId: "golden-profile",
    examDate: "2027-09-01",

    availableMinutes:
      FOUNDATION_WEEK_V2.grossAvailableMinutes + capacityDeltaTotal,

    planningBudgetMinutes:
      FOUNDATION_WEEK_V2.planningBudgetMinutes,

    reserveMinutes:
      FOUNDATION_WEEK_V2.reserveMinutes,

    dailyCapacities,
    existingTasks,
  };
}

export function buildFoundationWeekGoldenSnapshotV2(
  options: FoundationWeekGoldenOptions = {},
): PlanningSnapshotV2 {
  return buildPlanningSnapshotV2(
    buildFoundationWeekGoldenInputV2(options),
  );
}

export function goldenTasksForDateV2(
  snapshot: PlanningSnapshotV2,
  date: string,
): readonly ExistingScheduledTaskV2[] {
  return snapshot.existingTasks.filter(
    (task) => task.plannedDate === date,
  );
}
