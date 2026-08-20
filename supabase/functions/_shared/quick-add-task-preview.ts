export interface QuickAddTaskPreviewInput {
  readonly weeklyPlanId: string;
  readonly subjectId: string;
  readonly subjectName: string;
  readonly title: string;
  readonly plannedDate: string;
  readonly estimatedMinutes: number;
  readonly remainingCapacityMinutes: number;
}

export interface QuickAddTaskCandidate {
  readonly taskType: "custom";
  readonly subjectId: string;
  readonly subjectName: string;
  readonly title: string;
  readonly plannedDate: string;
  readonly estimatedMinutes: number;
  readonly sourceReason: "manual";
}

export interface QuickAddTaskPreview {
  readonly kind: "QUICK_ADD_TASK_PREVIEW";
  readonly previewOnly: true;
  readonly replacesWeeklyPlan: false;
  readonly weeklyPlanId: string;
  readonly status: "READY" | "BLOCKED_CAPACITY";
  readonly candidate: QuickAddTaskCandidate;
  readonly capacity: {
    readonly remainingMinutes: number;
    readonly afterCandidateMinutes: number;
    readonly fits: boolean;
  };
  readonly mutations: readonly [];
}

export function buildQuickAddTaskPreview(
  input: QuickAddTaskPreviewInput,
): QuickAddTaskPreview {
  const title = input.title.trim();
  if (!title) throw new Error("QUICK_ADD_INVALID_TITLE");

  if (
    !Number.isFinite(input.estimatedMinutes) ||
    !Number.isInteger(input.estimatedMinutes) ||
    input.estimatedMinutes <= 0
  ) {
    throw new Error("QUICK_ADD_INVALID_MINUTES");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.plannedDate)) {
    throw new Error("QUICK_ADD_INVALID_DATE");
  }

  if (!input.subjectId.trim()) {
    throw new Error("QUICK_ADD_INVALID_SUBJECT");
  }

  const remainingMinutes = Number.isFinite(input.remainingCapacityMinutes)
    ? Math.max(0, Math.floor(input.remainingCapacityMinutes))
    : 0;
  const fits = input.estimatedMinutes <= remainingMinutes;

  return {
    kind: "QUICK_ADD_TASK_PREVIEW",
    previewOnly: true,
    replacesWeeklyPlan: false,
    weeklyPlanId: input.weeklyPlanId,
    status: fits ? "READY" : "BLOCKED_CAPACITY",
    candidate: {
      taskType: "custom",
      subjectId: input.subjectId,
      subjectName: input.subjectName,
      title,
      plannedDate: input.plannedDate,
      estimatedMinutes: input.estimatedMinutes,
      sourceReason: "manual",
    },
    capacity: {
      remainingMinutes,
      afterCandidateMinutes: Math.max(0, remainingMinutes - input.estimatedMinutes),
      fits,
    },
    mutations: [],
  };
}