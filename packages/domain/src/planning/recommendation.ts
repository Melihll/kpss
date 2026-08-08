import { PlanningDomainError } from "./errors";
import type { NextTaskRecommendation, RecommendationReason, RecommendationTask } from "./types";

export function remainingTaskMinutes(task: RecommendationTask): number {
  if (task.pendingUnitMinutes != null) return Math.max(0, task.pendingUnitMinutes);
  return Math.max(0, task.estimatedMinutes - task.completedMinutes);
}

function tier(task: RecommendationTask, today: string): number {
  if (task.status === "in_progress") return 1;
  if (task.status === "partially_completed") return 2;
  const overdue = Boolean(task.plannedDate && task.plannedDate < today);
  const dueToday = task.plannedDate === today;
  if (overdue && task.importance === "core") return 3;
  if (dueToday && task.importance === "core") return 4;
  if (overdue && task.importance === "important") return 5;
  if (dueToday && task.importance === "important") return 6;
  if (task.importance !== "optional") return 7;
  return 8;
}

function reasonFor(task: RecommendationTask, today: string, fits: boolean): RecommendationReason {
  if (task.status === "in_progress") return "continue_in_progress";
  if (task.status === "partially_completed") return "continue_partial";
  if (task.plannedDate && task.plannedDate < today && task.importance === "core") return "overdue_core";
  if (task.plannedDate === today && task.importance === "core") return "today_core";
  if (task.plannedDate && task.plannedDate < today && task.importance === "important") return "overdue_important";
  if (task.plannedDate === today && task.importance === "important") return "today_important";
  if (fits) return "fits_available_window";
  return task.importance === "optional" ? "optional" : "highest_priority";
}

export function getNextBestTask(
  tasks: readonly RecommendationTask[],
  options: { today: string; availableMinutes?: number | null },
): NextTaskRecommendation {
  const eligible = tasks.filter((task) => !["completed", "cancelled", "missed"].includes(task.status));
  if (!eligible.length) throw new PlanningDomainError("NO_RECOMMENDABLE_TASK");
  const available = options.availableMinutes ?? null;
  const sorted = [...eligible].sort((left, right) => {
    const tierDifference = tier(left, options.today) - tier(right, options.today);
    if (tierDifference) return tierDifference;
    if (available != null) {
      const leftFits = remainingTaskMinutes(left) <= available;
      const rightFits = remainingTaskMinutes(right) <= available;
      if (leftFits !== rightFits) return leftFits ? -1 : 1;
    }
    return right.priorityScore - left.priorityScore
      || remainingTaskMinutes(left) - remainingTaskMinutes(right)
      || left.createdAt.localeCompare(right.createdAt)
      || left.id.localeCompare(right.id);
  });
  const recommendedTask = sorted[0]!;
  const remainingMinutes = remainingTaskMinutes(recommendedTask);
  return {
    recommendedTask,
    reason: reasonFor(recommendedTask, options.today, available != null && remainingMinutes <= available),
    remainingMinutes,
  };
}
