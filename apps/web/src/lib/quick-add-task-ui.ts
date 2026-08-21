export interface QuickAddOptions {
  readonly weekStartDate: string;
  readonly weekEndDate: string;
  readonly minDate: string;
  readonly subjects: readonly {
    readonly id: string;
    readonly name: string;
    readonly sortOrder: number;
  }[];
}

export interface QuickAddFormValue {
  readonly subjectId: string;
  readonly title: string;
  readonly estimatedMinutes: string;
  readonly plannedDate: string;
}

export interface QuickAddPreviewResponse {
  readonly kind: "QUICK_ADD_TASK_PREVIEW";
  readonly previewOnly: true;
  readonly replacesWeeklyPlan: false;
  readonly weeklyPlanId: string;
  readonly status: "READY" | "BLOCKED_CAPACITY";
  readonly candidate: {
    readonly taskType: "custom";
    readonly subjectId: string;
    readonly subjectName: string;
    readonly title: string;
    readonly plannedDate: string;
    readonly estimatedMinutes: number;
    readonly sourceReason: "manual";
  };
  readonly capacity: {
    readonly remainingMinutes: number;
    readonly afterCandidateMinutes: number;
    readonly fits: boolean;
  };
  readonly mutations: readonly [];
  readonly confirmation?: {
    readonly proposalId: string;
    readonly actionKind: "quick_task";
    readonly expiresAt: string;
    readonly planGenerationVersion: number;
  };
}

export interface QuickAddApplyResponse {
  readonly proposalId: string;
  readonly actionKind: "quick_task";
  readonly created: boolean;
  readonly idempotent: boolean;
  readonly weeklyPlanId: string;
  readonly task: {
    readonly id: string;
    readonly title: string;
    readonly planned_date: string;
    readonly estimated_minutes: number;
  };
  readonly refresh: readonly ("today" | "week")[];
}

export function quickAddDateBounds(options: QuickAddOptions) {
  const min = options.minDate > options.weekStartDate
    ? options.minDate
    : options.weekStartDate;
  return { min, max: options.weekEndDate };
}

export function initialQuickAddForm(
  options: QuickAddOptions,
): QuickAddFormValue {
  const bounds = quickAddDateBounds(options);
  return {
    subjectId: options.subjects[0]?.id ?? "",
    title: "",
    estimatedMinutes: "30",
    plannedDate: bounds.min,
  };
}

export function canPreviewQuickAdd(
  form: QuickAddFormValue,
  options: QuickAddOptions,
): boolean {
  const minutes = Number(form.estimatedMinutes);
  const bounds = quickAddDateBounds(options);

  return (
    form.subjectId.trim().length > 0 &&
    form.title.trim().length > 0 &&
    Number.isInteger(minutes) &&
    minutes > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(form.plannedDate) &&
    form.plannedDate >= bounds.min &&
    form.plannedDate <= bounds.max
  );
}
