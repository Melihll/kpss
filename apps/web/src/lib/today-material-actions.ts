import type { ResourceForecast, RoadmapTask } from "./roadmap";

export type TaskMaterialTab = "page" | "video";

export function taskMaterialResourceId(task: RoadmapTask): string | null {
  return task.material_resource_id
    ?? task.resource_id
    ?? task.resources?.id
    ?? null;
}

export function taskMaterialResource(task: RoadmapTask): ResourceForecast | null {
  const resourceId = taskMaterialResourceId(task);
  if (!resourceId) return null;

  return {
    resourceId,
    resourceName: task.resources?.name ?? "Bağlı kaynak",
    plannedMinutes: 0,
    actualMinutes: 0,
    progressPercent: 0,
    remainingMinutes: 0,
    forecastStartDate: null,
    forecastFinishDate: null,
    completed: false,
    publisher: null,
    resourceType: task.resources?.resource_type ?? null,
  };
}

export function defaultTaskMaterialTab(task: RoadmapTask): TaskMaterialTab {
  return task.work_mode === "video" ? "video" : "page";
}