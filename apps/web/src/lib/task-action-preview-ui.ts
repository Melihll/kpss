export const TASK_ACTIONS = [
  "DEFER",
  "REMOVE_TODAY",
  "DURATION_DETAILS",
] as const;

export type TaskActionPreviewAction = (typeof TASK_ACTIONS)[number];

export interface TaskActionPreviewResponse {
  readonly kind: "TASK_ACTION_PREVIEW";
  readonly previewOnly: true;
  readonly replacesWeeklyPlan: false;
  readonly applyRecommended: false;
  readonly action: TaskActionPreviewAction;
  readonly status: "READY" | "BLOCKED" | "INFO";
  readonly task: {
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
  };
  readonly duration: {
    readonly estimatedMinutes: number;
    readonly completedMinutes: number;
    readonly remainingMinutes: number;
  };
  readonly changes: readonly {
    readonly changeType: "MOVE" | "BACKLOG";
    readonly taskId: string;
    readonly fromDate: string;
    readonly toDate: string | null;
    readonly remainingMinutes: number;
    readonly reasonCodes: readonly string[];
  }[];
  readonly proposal: {
    readonly moves: readonly unknown[];
    readonly backlog: readonly unknown[];
    readonly changedTaskCount: number;
  };
  readonly capacity: {
    readonly targetRemainingMinutes: number | null;
    readonly afterMoveMinutes: number | null;
  };
  readonly reasonCodes: readonly string[];
  readonly mutations: readonly [];
  readonly explicitConfirmationRequired?: boolean;
  readonly confirmation?: { readonly proposalId: string };
}

export function taskActionLabel(action: TaskActionPreviewAction): string {
  if (action === "DEFER") return "Ertelemeyi önizle";
  if (action === "REMOVE_TODAY") return "Çıkarmayı önizle";
  return "Süre detayları";
}

export function taskActionStatusLabel(
  preview: TaskActionPreviewResponse,
): string {
  if (preview.status === "BLOCKED") return "Bu işlem şu an uygun değil";
  if (preview.status === "INFO") return "Süre bilgisi";
  if (preview.action === "DEFER") return "Taşıma önizlemesi hazır";
  return "Backlog önizlemesi hazır";
}

export function taskActionMessage(
  preview: TaskActionPreviewResponse,
): string {
  if (preview.status === "BLOCKED") {
    const reason = preview.reasonCodes[0];
    if (reason === "ACTIVE_TASK_CANNOT_MOVE") {
      return "Aktif çalışma oturumu olan görev taşınamaz.";
    }
    if (reason === "COMPLETED_TASK_CANNOT_MOVE") {
      return "Tamamlanmış görev taşınamaz.";
    }
    if (reason === "TASK_NOT_PLANNED_FOR_TODAY") {
      return "Bu görev artık bugünün planında değil.";
    }
    if (reason === "NO_FEASIBLE_FUTURE_DAY") {
      return "Bu haftada görevin kalan süresini karşılayan uygun bir gün bulunamadı.";
    }
    if (reason === "TARGET_DAY_CAPACITY_INSUFFICIENT") {
      return "Hedef günün kalan kapasitesi bu görev için yeterli değil.";
    }
    return "Bu değişiklik güvenli bir önizleme olarak üretilemedi.";
  }

  if (preview.action === "DURATION_DETAILS") {
    return `Planlanan ${preview.duration.estimatedMinutes} dk · tamamlanan ${preview.duration.completedMinutes} dk · kalan ${preview.duration.remainingMinutes} dk.`;
  }

  const change = preview.changes[0];
  if (change?.changeType === "MOVE" && change.toDate) {
    return `Görev ${change.fromDate} tarihinden ${change.toDate} tarihine taşınabilir.`;
  }

  if (change?.changeType === "BACKLOG") {
    return "Görev bugünün planından çıkarılıp backlog'a alınabilir.";
  }

  return "Önizleme hazır.";
}
