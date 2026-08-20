export const TASK_ACTION_PREVIEW_ACTIONS = [
  "DEFER",
  "REMOVE_TODAY",
  "DURATION_DETAILS",
] as const;

export type TaskActionPreviewAction =
  (typeof TASK_ACTION_PREVIEW_ACTIONS)[number];

export interface TaskActionPreviewTask {
  readonly id: string;
  readonly title: string;
  readonly subjectName: string | null;
  readonly resourceName: string | null;
  readonly plannedDate: string | null;
  readonly status: string;
  readonly estimatedMinutes: number;
  readonly completedMinutes: number;
  readonly remainingMinutes: number;
  readonly active: boolean;
}

export interface TaskActionPreviewInput {
  readonly action: TaskActionPreviewAction;
  readonly task: TaskActionPreviewTask;
  readonly currentDate: string;
  readonly targetDate?: string | null;
  readonly targetRemainingCapacityMinutes?: number | null;
}

export interface TaskActionPreviewChange {
  readonly changeType: "MOVE" | "BACKLOG";
  readonly taskId: string;
  readonly fromDate: string;
  readonly toDate: string | null;
  readonly remainingMinutes: number;
  readonly reasonCodes: readonly string[];
}

export interface TaskActionPreview {
  readonly kind: "TASK_ACTION_PREVIEW";
  readonly previewOnly: true;
  readonly replacesWeeklyPlan: false;
  readonly applyRecommended: false;
  readonly action: TaskActionPreviewAction;
  readonly status: "READY" | "BLOCKED" | "INFO";
  readonly task: TaskActionPreviewTask;
  readonly duration: {
    readonly estimatedMinutes: number;
    readonly completedMinutes: number;
    readonly remainingMinutes: number;
  };
  readonly changes: readonly TaskActionPreviewChange[];
  readonly proposal: {
    readonly moves: readonly TaskActionPreviewChange[];
    readonly backlog: readonly TaskActionPreviewChange[];
    readonly changedTaskCount: number;
  };
  readonly capacity: {
    readonly targetRemainingMinutes: number | null;
    readonly afterMoveMinutes: number | null;
  };
  readonly reasonCodes: readonly string[];
  readonly mutations: readonly [];
}

function immutableChange(
  change: TaskActionPreviewChange,
): TaskActionPreviewChange {
  return Object.freeze({
    ...change,
    reasonCodes: Object.freeze([...change.reasonCodes]),
  });
}

export function buildTaskActionPreview(
  input: TaskActionPreviewInput,
): TaskActionPreview {
  const task = Object.freeze({ ...input.task });
  const duration = Object.freeze({
    estimatedMinutes: Math.max(0, task.estimatedMinutes),
    completedMinutes: Math.max(0, task.completedMinutes),
    remainingMinutes: Math.max(0, task.remainingMinutes),
  });

  const base = {
    kind: "TASK_ACTION_PREVIEW" as const,
    previewOnly: true as const,
    replacesWeeklyPlan: false as const,
    applyRecommended: false as const,
    action: input.action,
    task,
    duration,
    mutations: Object.freeze([]) as readonly [],
  };

  if (input.action === "DURATION_DETAILS") {
    return Object.freeze({
      ...base,
      status: "INFO" as const,
      changes: Object.freeze([]),
      proposal: Object.freeze({
        moves: Object.freeze([]),
        backlog: Object.freeze([]),
        changedTaskCount: 0,
      }),
      capacity: Object.freeze({
        targetRemainingMinutes: null,
        afterMoveMinutes: null,
      }),
      reasonCodes: Object.freeze([
        "DURATION_DETAILS_ONLY",
        "NO_PLAN_CHANGE",
      ]),
    });
  }

  if (task.active) {
    return blocked(base, "ACTIVE_TASK_CANNOT_MOVE");
  }

  if (
    task.status === "completed" ||
    duration.remainingMinutes <= 0
  ) {
    return blocked(base, "COMPLETED_TASK_CANNOT_MOVE");
  }

  if (
    task.plannedDate === null ||
    task.plannedDate !== input.currentDate
  ) {
    return blocked(base, "TASK_NOT_PLANNED_FOR_TODAY");
  }

  if (input.action === "REMOVE_TODAY") {
    const change = immutableChange({
      changeType: "BACKLOG",
      taskId: task.id,
      fromDate: task.plannedDate,
      toDate: null,
      remainingMinutes: duration.remainingMinutes,
      reasonCodes: [
        "USER_REQUEST_REMOVE_FROM_TODAY",
        "BACKLOG_PREVIEW_ONLY",
      ],
    });

    return Object.freeze({
      ...base,
      status: "READY" as const,
      changes: Object.freeze([change]),
      proposal: Object.freeze({
        moves: Object.freeze([]),
        backlog: Object.freeze([change]),
        changedTaskCount: 1,
      }),
      capacity: Object.freeze({
        targetRemainingMinutes: null,
        afterMoveMinutes: null,
      }),
      reasonCodes: Object.freeze([
        "USER_TASK_ACTION",
        "BACKLOG_PROPOSAL_READY",
        "NO_AUTOMATIC_MUTATION",
      ]),
    });
  }

  if (!input.targetDate) {
    return blocked(base, "NO_FEASIBLE_FUTURE_DAY");
  }

  const targetRemaining = Number.isFinite(
    input.targetRemainingCapacityMinutes,
  )
    ? Math.max(0, Number(input.targetRemainingCapacityMinutes))
    : 0;

  if (targetRemaining < duration.remainingMinutes) {
    return blocked(base, "TARGET_DAY_CAPACITY_INSUFFICIENT");
  }

  const change = immutableChange({
    changeType: "MOVE",
    taskId: task.id,
    fromDate: task.plannedDate,
    toDate: input.targetDate,
    remainingMinutes: duration.remainingMinutes,
    reasonCodes: [
      "USER_REQUEST_DEFER",
      "MOVE_TO_NEAREST_FEASIBLE_FUTURE_DAY",
    ],
  });

  return Object.freeze({
    ...base,
    status: "READY" as const,
    changes: Object.freeze([change]),
    proposal: Object.freeze({
      moves: Object.freeze([change]),
      backlog: Object.freeze([]),
      changedTaskCount: 1,
    }),
    capacity: Object.freeze({
      targetRemainingMinutes: targetRemaining,
      afterMoveMinutes:
        targetRemaining - duration.remainingMinutes,
    }),
    reasonCodes: Object.freeze([
      "USER_TASK_ACTION",
      "MOVE_PROPOSAL_READY",
      "NO_AUTOMATIC_MUTATION",
    ]),
  });
}

function blocked(
  base: {
    readonly kind: "TASK_ACTION_PREVIEW";
    readonly previewOnly: true;
    readonly replacesWeeklyPlan: false;
    readonly applyRecommended: false;
    readonly action: TaskActionPreviewAction;
    readonly task: TaskActionPreviewTask;
    readonly duration: {
      readonly estimatedMinutes: number;
      readonly completedMinutes: number;
      readonly remainingMinutes: number;
    };
    readonly mutations: readonly [];
  },
  reasonCode: string,
): TaskActionPreview {
  return Object.freeze({
    ...base,
    status: "BLOCKED" as const,
    changes: Object.freeze([]),
    proposal: Object.freeze({
      moves: Object.freeze([]),
      backlog: Object.freeze([]),
      changedTaskCount: 0,
    }),
    capacity: Object.freeze({
      targetRemainingMinutes: null,
      afterMoveMinutes: null,
    }),
    reasonCodes: Object.freeze([
      reasonCode,
      "NO_AUTOMATIC_MUTATION",
    ]),
  });
}