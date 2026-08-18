import type {
  PlanValidationResult,
  PlanValidationViolation,
  PlanningProposalV1,
} from "./proposal";

import type {
  ExistingScheduledTaskV2,
  IsoDateV2,
  PlanningSnapshotV2,
} from "./types";

export interface PlanValidationPolicyV1 {
  readonly maxAutomaticChangedTaskCount: number;
  readonly maxAutomaticChangedTaskFraction: number;
}

export const DEFAULT_PLAN_VALIDATION_POLICY_V1:
  Readonly<PlanValidationPolicyV1> =
  Object.freeze({
    maxAutomaticChangedTaskCount: 8,
    maxAutomaticChangedTaskFraction: 0.35,
  });

export interface ValidatePlanProposalV1Input {
  readonly snapshot: PlanningSnapshotV2;
  readonly proposal: PlanningProposalV1;

  readonly policy?: PlanValidationPolicyV1;
}

interface MutableScheduledTask {
  readonly taskId: string;
  readonly original: ExistingScheduledTaskV2;

  plannedDate: IsoDateV2 | null;
  scheduled: boolean;
}

function violation(
  code: PlanValidationViolation["code"],
  message: string,
  options: {
    readonly taskIds?: readonly string[];
    readonly date?: IsoDateV2 | null;
    readonly blocking?: boolean;
  } = {},
): PlanValidationViolation {
  return Object.freeze({
    code,
    message,

    taskIds: Object.freeze([
      ...(options.taskIds ?? []),
    ]),

    date:
      options.date ?? null,

    blocking:
      options.blocking ?? true,
  });
}

function automaticScope(
  proposal: PlanningProposalV1,
): boolean {
  return (
    proposal.scope !==
      "WEEKLY_REOPTIMIZATION" &&
    proposal.scope !==
      "MANUAL_REPLAN"
  );
}

function validatePolicy(
  policy: PlanValidationPolicyV1,
): void {
  if (
    !Number.isInteger(
      policy.maxAutomaticChangedTaskCount,
    ) ||
    policy.maxAutomaticChangedTaskCount < 0
  ) {
    throw new Error(
      "maxAutomaticChangedTaskCount must be a non-negative integer",
    );
  }

  if (
    !Number.isFinite(
      policy.maxAutomaticChangedTaskFraction,
    ) ||
    policy.maxAutomaticChangedTaskFraction < 0 ||
    policy.maxAutomaticChangedTaskFraction > 1
  ) {
    throw new Error(
      "maxAutomaticChangedTaskFraction must be between 0 and 1",
    );
  }
}

function taskMutationIds(
  proposal: PlanningProposalV1,
): readonly string[] {
  return [
    ...proposal.moves.map(
      (item) => item.taskId,
    ),

    ...proposal.cancels.map(
      (item) => item.taskId,
    ),

    ...proposal.backlog.map(
      (item) => item.taskId,
    ),
  ];
}

function withinPlanningWindow(
  snapshot: PlanningSnapshotV2,
  date: IsoDateV2,
): boolean {
  if (
    date < snapshot.meta.currentDate ||
    date < snapshot.meta.weekStart ||
    date > snapshot.meta.weekEnd
  ) {
    return false;
  }

  if (
    snapshot.examDate !== null &&
    date > snapshot.examDate
  ) {
    return false;
  }

  return true;
}

export function validatePlanProposalV1(
  input: ValidatePlanProposalV1Input,
): PlanValidationResult {
  const {
    snapshot,
    proposal,
  } = input;

  const policy =
    input.policy ??
    DEFAULT_PLAN_VALIDATION_POLICY_V1;

  validatePolicy(policy);

  const violations:
    PlanValidationViolation[] = [];

  /*
   * Snapshot / ownership boundary
   */
  if (
    proposal.snapshotId !==
    snapshot.meta.snapshotId
  ) {
    violations.push(
      violation(
        "SNAPSHOT_STALE",
        "Proposal was produced from a different planning snapshot.",
      ),
    );
  }

  if (
    proposal.userId !== snapshot.userId ||
    proposal.examProfileId !==
      snapshot.examProfileId
  ) {
    violations.push(
      violation(
        "OWNERSHIP_MISMATCH",
        "Proposal ownership does not match planning snapshot ownership.",
      ),
    );
  }

  /*
   * Mutation uniqueness
   */
  const mutationIds =
    taskMutationIds(proposal);

  const mutationCounts =
    new Map<string, number>();

  for (const taskId of mutationIds) {
    mutationCounts.set(
      taskId,
      (mutationCounts.get(taskId) ?? 0) + 1,
    );
  }

  const duplicateMutationIds =
    [...mutationCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([taskId]) => taskId)
      .sort();

  if (duplicateMutationIds.length > 0) {
    violations.push(
      violation(
        "DUPLICATE_ACTIVITY",
        "The same task is mutated more than once in the proposal.",
        {
          taskIds:
            duplicateMutationIds,
        },
      ),
    );
  }

  const createdCandidateIds =
    proposal.creates.map(
      (item) => item.candidateId,
    );

  if (
    new Set(createdCandidateIds).size !==
    createdCandidateIds.length
  ) {
    violations.push(
      violation(
        "DUPLICATE_ACTIVITY",
        "The proposal contains duplicate candidate creations.",
      ),
    );
  }

  /*
   * changedTaskCount integrity
   */
  const uniqueChangedTasks =
    new Set(mutationIds);

  const actualChangedTaskCount =
    uniqueChangedTasks.size +
    proposal.creates.length;

  if (
    actualChangedTaskCount !==
    proposal.changedTaskCount
  ) {
    violations.push(
      violation(
        "DUPLICATE_ACTIVITY",
        `changedTaskCount mismatch: proposal=${proposal.changedTaskCount}, actual=${actualChangedTaskCount}`,
        {
          taskIds: [
            ...uniqueChangedTasks,
          ],
        },
      ),
    );
  }

  const taskById =
    new Map(
      snapshot.existingTasks.map(
        (task) =>
          [task.taskId, task] as const,
      ),
    );

  /*
   * Immutability and date validity
   */
  for (const move of proposal.moves) {
    const task =
      taskById.get(move.taskId);

    if (!task) {
      violations.push(
        violation(
          "OWNERSHIP_MISMATCH",
          `Unknown task in move: ${move.taskId}`,
          {
            taskIds: [move.taskId],
          },
        ),
      );

      continue;
    }

    if (task.isCompleted) {
      violations.push(
        violation(
          "COMPLETED_TASK_MOVED",
          "Completed tasks are immutable.",
          {
            taskIds: [task.taskId],
          },
        ),
      );
    }

    if (task.isActive) {
      violations.push(
        violation(
          "ACTIVE_TASK_MOVED",
          "Active tasks are immutable.",
          {
            taskIds: [task.taskId],
          },
        ),
      );
    }

    if (
      task.plannedDate !==
      move.fromDate
    ) {
      violations.push(
        violation(
          "SNAPSHOT_STALE",
          `Move source date no longer matches snapshot for ${task.taskId}.`,
          {
            taskIds: [task.taskId],
            date: move.fromDate,
          },
        ),
      );
    }

    if (
      !withinPlanningWindow(
        snapshot,
        move.toDate,
      )
    ) {
      violations.push(
        violation(
          "INVALID_DATE",
          `Move target date is outside the valid planning window: ${move.toDate}`,
          {
            taskIds: [task.taskId],
            date: move.toDate,
          },
        ),
      );
    }

    if (
      task.earliestAllowedDate !== null &&
      move.toDate <
        task.earliestAllowedDate
    ) {
      violations.push(
        violation(
          "INVALID_DATE",
          "Move violates earliest allowed task date.",
          {
            taskIds: [task.taskId],
            date: move.toDate,
          },
        ),
      );
    }

    if (
      task.latestAllowedDate !== null &&
      move.toDate >
        task.latestAllowedDate
    ) {
      violations.push(
        violation(
          "INVALID_DATE",
          "Move violates latest allowed task date.",
          {
            taskIds: [task.taskId],
            date: move.toDate,
          },
        ),
      );
    }
  }

  /*
   * Cancel / backlog immutability
   *
   * Although these are not literally "moves", the same immutable
   * protection applies.
   */
  for (const item of [
    ...proposal.cancels,
    ...proposal.backlog,
  ]) {
    const task =
      taskById.get(item.taskId);

    if (!task) {
      violations.push(
        violation(
          "OWNERSHIP_MISMATCH",
          `Unknown task mutation: ${item.taskId}`,
          {
            taskIds: [item.taskId],
          },
        ),
      );

      continue;
    }

    if (task.isCompleted) {
      violations.push(
        violation(
          "COMPLETED_TASK_MOVED",
          "Completed tasks cannot be removed from their authoritative schedule state.",
          {
            taskIds: [task.taskId],
          },
        ),
      );
    }

    if (task.isActive) {
      violations.push(
        violation(
          "ACTIVE_TASK_MOVED",
          "Active tasks cannot be removed from their authoritative schedule state.",
          {
            taskIds: [task.taskId],
          },
        ),
      );
    }
  }

  for (const create of proposal.creates) {
    if (
      !withinPlanningWindow(
        snapshot,
        create.plannedDate,
      )
    ) {
      violations.push(
        violation(
          "INVALID_DATE",
          `Created activity date is outside the valid planning window: ${create.plannedDate}`,
          {
            date:
              create.plannedDate,
          },
        ),
      );
    }

    if (
      !Number.isFinite(
        create.estimatedMinutes,
      ) ||
      create.estimatedMinutes <= 0
    ) {
      violations.push(
        violation(
          "INVALID_DATE",
          "Created activity must have positive estimated minutes.",
          {
            date:
              create.plannedDate,
          },
        ),
      );
    }
  }

  /*
   * Simulate the proposed schedule.
   */
  const scheduledTasks =
    new Map<
      string,
      MutableScheduledTask
    >();

  for (const task of snapshot.existingTasks) {
    scheduledTasks.set(
      task.taskId,
      {
        taskId: task.taskId,
        original: task,

        plannedDate:
          task.plannedDate,

        scheduled:
          !task.isCompleted &&
          task.remainingMinutes > 0 &&
          task.plannedDate !== null,
      },
    );
  }

  for (const move of proposal.moves) {
    const state =
      scheduledTasks.get(
        move.taskId,
      );

    if (state) {
      state.plannedDate =
        move.toDate;

      state.scheduled = true;
    }
  }

  for (const item of [
    ...proposal.cancels,
    ...proposal.backlog,
  ]) {
    const state =
      scheduledTasks.get(
        item.taskId,
      );

    if (state) {
      state.scheduled = false;
      state.plannedDate = null;
    }
  }

  const scheduledMinutesByDate =
    new Map<IsoDateV2, number>();

  for (const state of scheduledTasks.values()) {
    if (
      !state.scheduled ||
      state.plannedDate === null
    ) {
      continue;
    }

    scheduledMinutesByDate.set(
      state.plannedDate,
      (
        scheduledMinutesByDate.get(
          state.plannedDate,
        ) ?? 0
      ) +
        state.original.remainingMinutes,
    );
  }

  for (const create of proposal.creates) {
    scheduledMinutesByDate.set(
      create.plannedDate,
      (
        scheduledMinutesByDate.get(
          create.plannedDate,
        ) ?? 0
      ) +
        create.estimatedMinutes,
    );
  }

  const capacityByDate =
    new Map(
      snapshot.dailyCapacities.map(
        (day) =>
          [day.date, day] as const,
      ),
    );

  for (
    const [
      date,
      scheduledMinutes,
    ] of scheduledMinutesByDate
  ) {
    const capacity =
      capacityByDate.get(date);

    if (!capacity) {
      violations.push(
        violation(
          "INVALID_DATE",
          `No capacity record exists for proposed date ${date}.`,
          {
            date,
          },
        ),
      );

      continue;
    }

    if (
      scheduledMinutes >
      capacity.remainingCapacityMinutes
    ) {
      violations.push(
        violation(
          "DAILY_CAPACITY_EXCEEDED",
          `Proposed workload exceeds remaining capacity on ${date}.`,
          {
            date,
          },
        ),
      );
    }
  }

  const totalScheduledRemaining =
    [...scheduledMinutesByDate.values()]
      .reduce(
        (sum, minutes) =>
          sum + minutes,
        0,
      );

  const totalRemainingCapacity =
    snapshot.dailyCapacities
      .filter(
        (day) =>
          day.date >=
          snapshot.meta.currentDate,
      )
      .reduce(
        (sum, day) =>
          sum +
          day.remainingCapacityMinutes,
        0,
      );

  if (
    totalScheduledRemaining >
    totalRemainingCapacity
  ) {
    violations.push(
      violation(
        "WEEKLY_BUDGET_EXCEEDED",
        "Proposed remaining workload exceeds remaining weekly capacity.",
      ),
    );
  }

  /*
   * Secondary mass-change safety guard.
   *
   * This is NOT the scheduling algorithm. It only protects against
   * unexpected large automatic proposals.
   */
  if (
    automaticScope(proposal) &&
    proposal.changedTaskCount > 0
  ) {
    const denominator =
      Math.max(
        snapshot.existingTasks.length,
        1,
      );

    const changedFraction =
      proposal.changedTaskCount /
      denominator;

    if (
      proposal.changedTaskCount >
        policy.maxAutomaticChangedTaskCount ||
      changedFraction >
        policy.maxAutomaticChangedTaskFraction
    ) {
      violations.push(
        violation(
          "MASS_CHANGE_GUARD",
          `Automatic proposal changes ${proposal.changedTaskCount} tasks (${(
            changedFraction * 100
          ).toFixed(1)}%).`,
          {
            taskIds: [
              ...uniqueChangedTasks,
            ],
          },
        ),
      );
    }
  }

  return Object.freeze({
    valid:
      violations.every(
        (item) => !item.blocking,
      ),

    violations:
      Object.freeze(violations),
  });
}
