import type { RoadmapTask, TaskMaterialScope } from "./roadmap";

export interface TaskMaterialPresentation {
  readonly resourceName: string;
  readonly scopeLabel: string;
  readonly progressLabel: string | null;
  readonly exact: boolean;
  readonly completed: boolean;
}

function videoMinutes(seconds: number): number {
  return Math.max(0, Math.round(seconds / 60));
}

export function taskMaterialScope(task: RoadmapTask): TaskMaterialScope | null {
  return task.material_scope ?? null;
}

export function taskMaterialPresentation(task: RoadmapTask): TaskMaterialPresentation | null {
  const resourceId = task.material_resource_id ?? task.resource_id ?? task.resources?.id ?? null;
  if (!resourceId) return null;

  const resourceName = task.resources?.name ?? "Bağlı kaynak";
  const scope = taskMaterialScope(task);
  if (!scope || scope.kind === "resource") {
    return {
      resourceName,
      scopeLabel: "Kaynak detayı",
      progressLabel: "Göreve özel kapsam belirtilmemiş",
      exact: false,
      completed: false,
    };
  }

  if (scope.kind === "page_range") {
    const completedThrough = scope.completedThroughPage;
    const progressedInRange = completedThrough === null
      ? 0
      : Math.max(0, Math.min(scope.pageEnd, completedThrough) - scope.pageStart + 1);
    const totalPages = scope.pageEnd - scope.pageStart + 1;
    const completed = scope.completed || progressedInRange >= totalPages;
    return {
      resourceName,
      scopeLabel: `Sayfa ${scope.pageStart}–${scope.pageEnd}`,
      progressLabel: completed
        ? "Bu sayfa aralığı tamamlandı"
        : progressedInRange > 0
          ? `${progressedInRange} / ${totalPages} sayfa tamamlandı`
          : `${totalPages} sayfa`,
      exact: true,
      completed,
    };
  }

  const durationMinutes = videoMinutes(scope.durationSeconds);
  const watchedMinutes = Math.min(durationMinutes, videoMinutes(scope.watchedSeconds));
  const videoLabel = `Video ${scope.position + 1}`;
  return {
    resourceName,
    scopeLabel: `${videoLabel} · ${scope.title}`,
    progressLabel: scope.completed
      ? `${durationMinutes} dk · tamamlandı`
      : `${watchedMinutes} / ${durationMinutes} dk izlendi`,
    exact: true,
    completed: scope.completed,
  };
}
