import {
  checkCurrentPlanFeasibilityV2,
  type CurrentPlanFeasibilityV2,
} from "./feasibility";
import type {
  ExistingScheduledTaskV2,
  IsoDateV2,
  PlanningSnapshotV2,
} from "./types";

export interface LocalRepairMoveV1 {
  readonly taskId: string;
  readonly fromDate: IsoDateV2;
  readonly toDate: IsoDateV2;
  readonly remainingMinutes: number;
  readonly distanceDays: number;
  readonly reasonCodes: readonly string[];
}

export interface LocalRepairBacklogV1 {
  readonly taskId: string;
  readonly fromDate: IsoDateV2;
  readonly remainingMinutes: number;
  readonly reasonCodes: readonly string[];
}

export interface LocalRepairResultV1 {
  readonly repairRequired: boolean;
  readonly successful: boolean;

  readonly feasibilityBefore: CurrentPlanFeasibilityV2;

  readonly moves: readonly LocalRepairMoveV1[];
  readonly backlog: readonly LocalRepairBacklogV1[];

  readonly changedTaskCount: number;
  readonly movedMinutes: number;
  readonly backlogMinutes: number;

  readonly unresolvedOverloadMinutes: number;

  readonly reasonCodes: readonly string[];
}

interface MutableDayState {
  readonly date: IsoDateV2;
  readonly capacityMinutes: number;
  scheduledMinutes: number;
}

interface RepairChoice {
  readonly selectedTasks: readonly ExistingScheduledTaskV2[];
  readonly totalMinutes: number;
  readonly overshootMinutes: number;
  readonly partialTaskCount: number;
}

function parseIsoDateUtc(date: IsoDateV2): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);

  if (!match) {
    throw new Error(`invalid ISO date: ${date}`);
  }

  return Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
}

function daysBetween(
  earlier: IsoDateV2,
  later: IsoDateV2,
): number {
  return Math.floor(
    (parseIsoDateUtc(later) - parseIsoDateUtc(earlier)) /
      86_400_000,
  );
}

function movableTask(
  task: ExistingScheduledTaskV2,
): boolean {
  return (
    !task.isCompleted &&
    !task.isActive &&
    task.remainingMinutes > 0 &&
    task.plannedDate !== null
  );
}

function chooseTasksForOverload(
  tasks: readonly ExistingScheduledTaskV2[],
  overloadMinutes: number,
): RepairChoice | null {
  const candidates = tasks
    .filter(movableTask)
    .sort((a, b) => {
      // Preserve partial work whenever an untouched task can solve
      // the same overload.
      if (a.isPartiallyCompleted !== b.isPartiallyCompleted) {
        return a.isPartiallyCompleted ? 1 : -1;
      }

      // Larger tasks make it more likely that a repair can be
      // accomplished with fewer mutations.
      if (a.remainingMinutes !== b.remainingMinutes) {
        return b.remainingMinutes - a.remainingMinutes;
      }

      return a.taskId.localeCompare(b.taskId);
    });

  let best: RepairChoice | null = null;

  function better(
    candidate: RepairChoice,
    current: RepairChoice | null,
  ): boolean {
    if (current === null) {
      return true;
    }

    if (
      candidate.selectedTasks.length !==
      current.selectedTasks.length
    ) {
      return (
        candidate.selectedTasks.length <
        current.selectedTasks.length
      );
    }

    if (
      candidate.partialTaskCount !==
      current.partialTaskCount
    ) {
      return (
        candidate.partialTaskCount <
        current.partialTaskCount
      );
    }

    if (
      candidate.overshootMinutes !==
      current.overshootMinutes
    ) {
      return (
        candidate.overshootMinutes <
        current.overshootMinutes
      );
    }

    const candidateIds = candidate.selectedTasks
      .map((task) => task.taskId)
      .sort()
      .join("|");

    const currentIds = current.selectedTasks
      .map((task) => task.taskId)
      .sort()
      .join("|");

    return candidateIds < currentIds;
  }

  function search(
    index: number,
    selected: ExistingScheduledTaskV2[],
    selectedMinutes: number,
  ): void {
    if (selectedMinutes >= overloadMinutes) {
      const candidate: RepairChoice = {
        selectedTasks: [...selected],
        totalMinutes: selectedMinutes,
        overshootMinutes:
          selectedMinutes - overloadMinutes,
        partialTaskCount: selected.filter(
          (task) => task.isPartiallyCompleted,
        ).length,
      };

      if (better(candidate, best)) {
        best = candidate;
      }

      return;
    }

    if (index >= candidates.length) {
      return;
    }

    if (
      best !== null &&
      selected.length >= best.selectedTasks.length
    ) {
      return;
    }

    const remainingPossible = candidates
      .slice(index)
      .reduce(
        (sum, task) => sum + task.remainingMinutes,
        0,
      );

    if (
      selectedMinutes + remainingPossible <
      overloadMinutes
    ) {
      return;
    }

    selected.push(candidates[index]!);

    search(
      index + 1,
      selected,
      selectedMinutes +
        candidates[index]!.remainingMinutes,
    );

    selected.pop();

    search(
      index + 1,
      selected,
      selectedMinutes,
    );
  }

  search(0, [], 0);

  return best;
}

function availableDestinationDates(
  snapshot: PlanningSnapshotV2,
  task: ExistingScheduledTaskV2,
  fromDate: IsoDateV2,
  days: ReadonlyMap<IsoDateV2, MutableDayState>,
): readonly MutableDayState[] {
  return [...days.values()]
    .filter((day) => {
      if (day.date <= fromDate) {
        return false;
      }

      if (day.date < snapshot.meta.currentDate) {
        return false;
      }

      if (
        task.earliestAllowedDate !== null &&
        day.date < task.earliestAllowedDate
      ) {
        return false;
      }

      if (
        task.latestAllowedDate !== null &&
        day.date > task.latestAllowedDate
      ) {
        return false;
      }

      if (
        snapshot.examDate !== null &&
        day.date > snapshot.examDate
      ) {
        return false;
      }

      return (
        day.capacityMinutes -
          day.scheduledMinutes >=
        task.remainingMinutes
      );
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function repairCurrentPlanLocallyV1(
  snapshot: PlanningSnapshotV2,
): LocalRepairResultV1 {
  const feasibilityBefore =
    checkCurrentPlanFeasibilityV2(snapshot);

  if (feasibilityBefore.feasible) {
    return Object.freeze({
      repairRequired: false,
      successful: true,

      feasibilityBefore,

      moves: Object.freeze([]),
      backlog: Object.freeze([]),

      changedTaskCount: 0,
      movedMinutes: 0,
      backlogMinutes: 0,

      unresolvedOverloadMinutes: 0,

      reasonCodes: Object.freeze([
        "CURRENT_PLAN_ALREADY_FEASIBLE",
        "KEEP_EXISTING_PLAN",
      ]),
    });
  }

  const unsupportedViolations =
    feasibilityBefore.violations.filter(
      (violation) =>
        violation.code !== "DAILY_OVERLOAD" &&
        violation.code !==
          "WEEKLY_REMAINING_CAPACITY_EXCEEDED" &&
        violation.code !==
          "PAST_DUE_REMAINING_WORK",
    );

  if (unsupportedViolations.length > 0) {
    return Object.freeze({
      repairRequired: true,
      successful: false,

      feasibilityBefore,

      moves: Object.freeze([]),
      backlog: Object.freeze([]),

      changedTaskCount: 0,
      movedMinutes: 0,
      backlogMinutes: 0,

      unresolvedOverloadMinutes:
        feasibilityBefore.totalOverloadMinutes,

      reasonCodes: Object.freeze([
        "LOCAL_REPAIR_SCOPE_UNSUPPORTED",
        ...unsupportedViolations.map(
          (violation) =>
            `UNSUPPORTED:${violation.code}`,
        ),
      ]),
    });
  }

  const dayState = new Map<
    IsoDateV2,
    MutableDayState
  >();

  for (const day of feasibilityBefore.daily) {
    dayState.set(day.date, {
      date: day.date,
      capacityMinutes:
        day.remainingCapacityMinutes,
      scheduledMinutes:
        day.scheduledRemainingMinutes,
    });
  }

  const tasksByDate = new Map<
    IsoDateV2,
    ExistingScheduledTaskV2[]
  >();

  for (const task of snapshot.existingTasks) {
    if (
      task.plannedDate === null ||
      task.plannedDate <
        snapshot.meta.currentDate ||
      task.remainingMinutes <= 0 ||
      task.isCompleted
    ) {
      continue;
    }

    const bucket =
      tasksByDate.get(task.plannedDate) ?? [];

    bucket.push(task);
    tasksByDate.set(task.plannedDate, bucket);
  }

  const moves: LocalRepairMoveV1[] = [];
  const backlog: LocalRepairBacklogV1[] = [];

  /*
   * Past-due work is repaired before future overloads.
   * It is not included in feasibilityBefore.daily, so destinations
   * consume only the already-computed future residual capacity.
   */
  const pastDueTasks = snapshot.existingTasks
    .filter(
      (task) =>
        task.plannedDate !== null &&
        task.plannedDate < snapshot.meta.currentDate &&
        task.remainingMinutes > 0 &&
        !task.isCompleted,
    )
    .sort((a, b) => {
      const dateOrder = a.plannedDate!.localeCompare(b.plannedDate!);
      if (dateOrder !== 0) return dateOrder;

      // Preserve partial work until after untouched carryover work.
      if (a.isPartiallyCompleted !== b.isPartiallyCompleted) {
        return a.isPartiallyCompleted ? 1 : -1;
      }

      if (a.remainingMinutes !== b.remainingMinutes) {
        return b.remainingMinutes - a.remainingMinutes;
      }

      return a.taskId.localeCompare(b.taskId);
    });

  let unresolvedPastDueMinutes = 0;

  for (const task of pastDueTasks) {
    if (!movableTask(task)) {
      unresolvedPastDueMinutes += task.remainingMinutes;
      continue;
    }

    const fromDate = task.plannedDate!;
    const destination =
      availableDestinationDates(
        snapshot,
        task,
        fromDate,
        dayState,
      )[0] ?? null;

    if (destination === null) {
      backlog.push(
        Object.freeze({
          taskId: task.taskId,
          fromDate,
          remainingMinutes: task.remainingMinutes,
          reasonCodes: Object.freeze([
            "LOCAL_PAST_DUE_REPAIR",
            "NO_FEASIBLE_REMAINING_WEEK_CAPACITY",
            "BACKLOG_ONLY_AFTER_MOVE_SEARCH",
          ]),
        }),
      );
      continue;
    }

    destination.scheduledMinutes += task.remainingMinutes;

    moves.push(
      Object.freeze({
        taskId: task.taskId,
        fromDate,
        toDate: destination.date,
        remainingMinutes: task.remainingMinutes,
        distanceDays: daysBetween(fromDate, destination.date),
        reasonCodes: Object.freeze([
          "LOCAL_PAST_DUE_REPAIR",
          "MOVE_TO_NEAREST_FEASIBLE_FUTURE_DAY",
        ]),
      }),
    );

    const destinationBucket =
      tasksByDate.get(destination.date) ?? [];

    destinationBucket.push({
      ...task,
      plannedDate: destination.date,
    });

    tasksByDate.set(destination.date, destinationBucket);
  }

  const orderedDays = [...dayState.values()]
    .sort((a, b) =>
      a.date.localeCompare(b.date),
    );

  for (const sourceDay of orderedDays) {
    const overload = Math.max(
      sourceDay.scheduledMinutes -
        sourceDay.capacityMinutes,
      0,
    );

    if (overload === 0) {
      continue;
    }

    const sourceTasks =
      tasksByDate.get(sourceDay.date) ?? [];

    const choice = chooseTasksForOverload(
      sourceTasks,
      overload,
    );

    if (choice === null) {
      continue;
    }

    const selected = [...choice.selectedTasks]
      .sort((a, b) => {
        // Keep partial work where possible.
        if (
          a.isPartiallyCompleted !==
          b.isPartiallyCompleted
        ) {
          return a.isPartiallyCompleted
            ? 1
            : -1;
        }

        if (
          a.remainingMinutes !==
          b.remainingMinutes
        ) {
          return (
            b.remainingMinutes -
            a.remainingMinutes
          );
        }

        return a.taskId.localeCompare(
          b.taskId,
        );
      });

    for (const task of selected) {
      const fromDate = task.plannedDate!;

      const destinations =
        availableDestinationDates(
          snapshot,
          task,
          fromDate,
          dayState,
        );

      const destination =
        destinations[0] ?? null;

      sourceDay.scheduledMinutes -=
        task.remainingMinutes;

      if (destination !== null) {
        destination.scheduledMinutes +=
          task.remainingMinutes;

        moves.push(
          Object.freeze({
            taskId: task.taskId,
            fromDate,
            toDate: destination.date,

            remainingMinutes:
              task.remainingMinutes,

            distanceDays: daysBetween(
              fromDate,
              destination.date,
            ),

            reasonCodes: Object.freeze([
              "LOCAL_DAILY_OVERLOAD_REPAIR",
              "MOVE_TO_NEAREST_FEASIBLE_FUTURE_DAY",
            ]),
          }),
        );

        const sourceBucket =
          tasksByDate.get(fromDate) ?? [];

        tasksByDate.set(
          fromDate,
          sourceBucket.filter(
            (item) =>
              item.taskId !== task.taskId,
          ),
        );

        const destinationBucket =
          tasksByDate.get(destination.date) ??
          [];

        destinationBucket.push({
          ...task,
          plannedDate: destination.date,
        });

        tasksByDate.set(
          destination.date,
          destinationBucket,
        );
      } else {
        backlog.push(
          Object.freeze({
            taskId: task.taskId,
            fromDate,

            remainingMinutes:
              task.remainingMinutes,

            reasonCodes: Object.freeze([
              "LOCAL_DAILY_OVERLOAD_REPAIR",
              "NO_FEASIBLE_FUTURE_CAPACITY",
              "BACKLOG_ONLY_AFTER_MOVE_SEARCH",
            ]),
          }),
        );

        const sourceBucket =
          tasksByDate.get(fromDate) ?? [];

        tasksByDate.set(
          fromDate,
          sourceBucket.filter(
            (item) =>
              item.taskId !== task.taskId,
          ),
        );
      }

      if (
        sourceDay.scheduledMinutes <=
        sourceDay.capacityMinutes
      ) {
        break;
      }
    }
  }

  const unresolvedOverloadMinutes =
    unresolvedPastDueMinutes +
    [...dayState.values()].reduce(
      (sum, day) =>
        sum +
        Math.max(
          day.scheduledMinutes -
            day.capacityMinutes,
          0,
        ),
      0,
    );

  const changedTaskIds = new Set([
    ...moves.map((move) => move.taskId),
    ...backlog.map((item) => item.taskId),
  ]);

  return Object.freeze({
    repairRequired: true,
    successful:
      unresolvedOverloadMinutes === 0,

    feasibilityBefore,

    moves: Object.freeze(moves),
    backlog: Object.freeze(backlog),

    changedTaskCount:
      changedTaskIds.size,

    movedMinutes: moves.reduce(
      (sum, move) =>
        sum + move.remainingMinutes,
      0,
    ),

    backlogMinutes: backlog.reduce(
      (sum, item) =>
        sum + item.remainingMinutes,
      0,
    ),

    unresolvedOverloadMinutes,

    reasonCodes: Object.freeze(
      unresolvedOverloadMinutes === 0
        ? [
            "MINIMUM_LOCAL_REPAIR_APPLIED",
          ]
        : [
            "LOCAL_REPAIR_INCOMPLETE",
          ],
    ),
  });
}
