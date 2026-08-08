import type { TaskResourceUnitStatus, TaskStatus, TopicProgressState } from "../types";
import { PlanningDomainError } from "./errors";

export function deriveTaskStatus(input: {
  currentStatus: TaskStatus;
  estimatedMinutes: number;
  completedMinutes: number;
  unitStatuses?: readonly TaskResourceUnitStatus[];
  explicitComplete?: boolean;
}): TaskStatus {
  if (!Number.isFinite(input.completedMinutes) || input.completedMinutes < 0) {
    throw new PlanningDomainError("INVALID_TASK_PROGRESS");
  }
  const units = input.unitStatuses ?? [];
  const pendingUnits = units.filter((status) => status === "pending").length;
  if (input.explicitComplete) {
    if (pendingUnits > 0) throw new PlanningDomainError("TASK_HAS_PENDING_UNITS");
    return "completed";
  }
  if (units.length) {
    const completedUnits = units.filter((status) => status === "completed").length;
    if (completedUnits === units.length) return "completed";
    if (completedUnits > 0 || input.completedMinutes > 0) return "partially_completed";
    return input.currentStatus;
  }
  if (input.completedMinutes >= input.estimatedMinutes && input.estimatedMinutes > 0) return "completed";
  if (input.completedMinutes > 0) return "partially_completed";
  return input.currentStatus;
}

export function transitionTopicForLearnTask(
  current: TopicProgressState,
  event: "start" | "complete",
): TopicProgressState {
  if (event === "start") return current === "not_started" ? "learning" : current;
  if (current === "not_started" || current === "learning") return "practicing";
  return current;
}
