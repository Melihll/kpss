import { PlanningDomainError } from "./errors";
import type { NextTaskRecommendation, RecommendationReason, RecommendationTask } from "./types";

export function remainingTaskMinutes(task: RecommendationTask): number {
  const timeRemaining = Math.max(0, task.estimatedMinutes - task.completedMinutes);
  if (task.pendingUnitMinutes == null) return timeRemaining;

  // A resource task can progress in two independent ways:
  // - live/manual study time updates completedMinutes,
  // - completing resource units reduces pendingUnitMinutes.
  // Use the strongest progress signal so neither path makes the user repeat work.
  return Math.max(0, Math.min(timeRemaining, task.pendingUnitMinutes));
}

function tier(task: RecommendationTask, today: string): number {
  if (task.status === "in_progress") return 1;
  if (task.status === "partially_completed") return 2;
  if (task.isRevision && task.revisionUrgency === "critical_overdue") return 3;
  const overdue = Boolean(task.plannedDate && task.plannedDate < today);
  const dueToday = task.plannedDate === today;
  if (overdue && task.importance === "core") return 4;
  if (task.topicState === "remediation" || task.masteryLevel === "critical" || task.masteryLevel === "weak") return 5;
  if (task.isRevision && (task.revisionUrgency === "due" || task.revisionUrgency === "overdue")) return 6;
  if (dueToday && task.importance === "core") return 7;
  if (overdue && task.importance === "important") return 8;
  if (dueToday && task.importance === "important") return 9;
  if (task.importance !== "optional") return 10;
  return 11;
}

function reasonFor(task: RecommendationTask, today: string, fits: boolean): RecommendationReason {
  if (task.status === "in_progress") return "continue_in_progress";
  if (task.status === "partially_completed") return "continue_partial";
  if (task.isRevision && task.revisionUrgency === "critical_overdue") return "critical_revision";
  if (task.plannedDate && task.plannedDate < today && task.importance === "core") return "overdue_core";
  if (task.topicState === "remediation" || task.masteryLevel === "critical" || task.masteryLevel === "weak") return "weak_topic";
  if (task.isRevision && (task.revisionUrgency === "due" || task.revisionUrgency === "overdue")) return "due_revision";
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
      || (left.executionOrder != null && right.executionOrder != null
        ? left.executionOrder - right.executionOrder
        : 0)
      || remainingTaskMinutes(left) - remainingTaskMinutes(right)
      || 0;
  });
  const recommendedTask = sorted[0]!;
  const remainingMinutes = remainingTaskMinutes(recommendedTask);
  return {
    recommendedTask,
    reason: reasonFor(recommendedTask, options.today, available != null && remainingMinutes <= available),
    remainingMinutes,
  };
}
