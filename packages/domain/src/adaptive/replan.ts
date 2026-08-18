import { calculateWeeklyRevisionBudget } from "../mastery";
import { REPLAN_LEVEL_1_CHANGE_LIMIT, REPLAN_LEVEL_2_CHANGE_LIMIT } from "./config";
import type { AdaptiveTask, ReplanContext, ReplanResult } from "./types";

const urgencyRank = { critical_overdue: 0, overdue: 1, due: 2, upcoming: 3 };
const masteryRank = { critical: 0, weak: 1, fragile: 2, sufficient: 3, strong: 4 };

function taskRank(task: AdaptiveTask) {
  if (task.status === "in_progress") return 0;
  if (task.status === "partially_completed") return 1;
  if (task.plannedDate && task.importance === "core") return 2;
  if (task.topicState === "remediation" || task.masteryLevel === "critical" || task.masteryLevel === "weak") return 3;
  if (task.importance === "core") return 4;
  if (task.importance === "important") return 5;
  return 6;
}

const remainingTaskMinutes = (task: AdaptiveTask) => Math.max(0, task.estimatedMinutes - task.completedMinutes);

function minimumRepairTasks(tasks: readonly AdaptiveTask[], overloadMinutes: number) {
  if (overloadMinutes <= 0) return new Set<string>();
  const candidates = [...tasks].sort((left, right) =>
    remainingTaskMinutes(right) - remainingTaskMinutes(left)
    || taskRank(right) - taskRank(left)
    || left.priorityScore - right.priorityScore
    || left.createdAt.localeCompare(right.createdAt)
    || left.id.localeCompare(right.id));
  const selected = new Set<string>();
  let repairedMinutes = 0;
  for (const task of candidates) {
    selected.add(task.id);
    repairedMinutes += remainingTaskMinutes(task);
    if (repairedMinutes >= overloadMinutes) break;
  }
  return selected;
}

function calendarDistance(left: string, right: string) {
  return Math.abs(Date.parse(`${left}T12:00:00Z`) - Date.parse(`${right}T12:00:00Z`)) / 86_400_000;
}

export function calculatePriorityV1(input: { scheduleUrgency: number; weakness: number; revisionUrgency: number; planDeviation: number; postponement: number; dependency: number }) {
  return Math.max(0, Math.min(100, Math.round(Object.values(input).reduce((sum, value) => sum + value, 0))));
}

export function replanWeeklyPlanV1(context: ReplanContext): ReplanResult {
  const availableMinutes = Object.values(context.dailyCapacities).reduce((sum, minutes) => sum + Math.max(0, minutes), 0);
  const planBudget = Math.min(context.planningBudgetMinutes, availableMinutes);
  const revisionBudget = calculateWeeklyRevisionBudget(planBudget);
  const dayRemaining: Record<string, number> = Object.fromEntries(Object.entries(context.dailyCapacities).map(([date, minutes]) => [
    date,
    date < context.currentDate ? 0 : minutes - (context.actualMinutesByDate?.[date] ?? 0),
  ]));
  const dates = Object.keys(dayRemaining).sort();
  const activeTasks = context.tasks
    .filter((task) => !["completed", "cancelled", "missed"].includes(task.status))
    .sort((left, right) => taskRank(left) - taskRank(right) || right.priorityScore - left.priorityScore || left.id.localeCompare(right.id));
  const currentDeviation = (context.actualMinutesByDate?.[context.currentDate] ?? 0) - (context.plannedConsumedMinutesByDate?.[context.currentDate] ?? 0);
  const allowPullForward = currentDeviation <= 0;
  const keep: string[] = [];
  const moves: ReplanResult["tasksToMove"] = [];
  const tasksToBacklog: string[] = [];
  const cancel: string[] = [];
  let used = 0;

  // Preserve an active task and its progress, while reserving its remaining
  // capacity so new work cannot be stacked on the same day.
  for (const task of activeTasks.filter((item) => ["in_progress", "partially_completed"].includes(item.status))) {
    keep.push(task.id);
    const remaining = remainingTaskMinutes(task);
    used += remaining;
    if (task.plannedDate && task.plannedDate >= context.currentDate && task.plannedDate in dayRemaining) {
      dayRemaining[task.plannedDate] = dayRemaining[task.plannedDate]! - remaining;
    }
  }

  const selectedRevisions = context.trigger === "study_deviation" ? [] : [...context.revisions]
    .sort((left, right) => urgencyRank[left.urgency] - urgencyRank[right.urgency]
      || masteryRank[left.masteryLevel] - masteryRank[right.masteryLevel]
      || left.id.localeCompare(right.id));
  let revisionMinutes = 0;
  const creates: ReplanResult["tasksToCreate"] = [];

  const placementTasks = activeTasks.filter((task) => !["in_progress", "partially_completed"].includes(task.status));
  let pendingPlacementTasks = placementTasks;

  // A capacity edit must be a stable repair, not a fresh bin-packing pass. Keep
  // every still-valid assignment on its current day first; only overflow or
  // previously unscheduled work is eligible for relocation. This also makes a
  // pure capacity increase a no-op when the existing plan already fits.
  if (context.trigger === "capacity_change") {
    const pending: AdaptiveTask[] = [];
    for (const task of [...placementTasks].sort((left, right) =>
      (left.plannedDate ?? context.weekEnd).localeCompare(right.plannedDate ?? context.weekEnd)
      || taskRank(left) - taskRank(right)
      || right.priorityScore - left.priorityScore
      || left.createdAt.localeCompare(right.createdAt)
      || left.id.localeCompare(right.id))) {
      const remaining = remainingTaskMinutes(task);
      if (remaining === 0) {
        keep.push(task.id);
        continue;
      }
      const current = task.plannedDate;
      if (current && current >= context.currentDate && current in dayRemaining
        && used + remaining <= planBudget && (dayRemaining[current] ?? 0) >= remaining) {
        keep.push(task.id);
        used += remaining;
        dayRemaining[current] = (dayRemaining[current] ?? 0) - remaining;
      } else {
        pending.push(task);
      }
    }
    pendingPlacementTasks = pending;
  } else if (context.trigger === "study_deviation") {
    const pending: AdaptiveTask[] = [];
    const tasksByDate = new Map<string, AdaptiveTask[]>();

    // A study event changes evidence/progress, not the student's plan intent.
    // Keep every still-feasible assignment in place and expose only tasks on an
    // actually overloaded/invalid day to the local repair pass below. Existing
    // backlog is deliberately left unscheduled even when the event freed time.
    for (const task of placementTasks) {
      const remaining = remainingTaskMinutes(task);
      if (remaining === 0) {
        keep.push(task.id);
        continue;
      }
      const current = task.plannedDate;
      if (current && current >= context.currentDate && current in dayRemaining) {
        const scheduled = tasksByDate.get(current) ?? [];
        scheduled.push(task);
        tasksByDate.set(current, scheduled);
      } else if (current !== null) {
        pending.push(task);
      }
    }

    const scheduledTasks = [...tasksByDate.values()].flat().concat(pending);
    const scheduledMinutes = scheduledTasks.reduce((sum, task) => sum + remainingTaskMinutes(task), 0);
    const budgetBacklog = minimumRepairTasks(scheduledTasks, used + scheduledMinutes - planBudget);
    tasksToBacklog.push(...budgetBacklog);

    for (const date of dates) {
      const scheduled = (tasksByDate.get(date) ?? []).filter((task) => !budgetBacklog.has(task.id));
      const scheduledMinutes = scheduled.reduce((sum, task) => sum + remainingTaskMinutes(task), 0);
      const displaced = minimumRepairTasks(scheduled, scheduledMinutes - Math.max(0, dayRemaining[date] ?? 0));
      for (const task of scheduled) {
        if (displaced.has(task.id)) {
          pending.push(task);
          continue;
        }
        const remaining = remainingTaskMinutes(task);
        keep.push(task.id);
        used += remaining;
        dayRemaining[date] = (dayRemaining[date] ?? 0) - remaining;
      }
    }
    pendingPlacementTasks = pending.filter((task) => !budgetBacklog.has(task.id));
  }

  for (const revision of selectedRevisions) {
    if (revisionMinutes + revision.estimatedMinutes > revisionBudget || used + revision.estimatedMinutes > planBudget) continue;
    const earliest = revision.scheduledFor < context.currentDate ? context.currentDate : revision.scheduledFor;
    const chosen = dates.find((date) => date >= earliest && (dayRemaining[date] ?? 0) >= revision.estimatedMinutes);
    if (!chosen) continue;
    dayRemaining[chosen] = (dayRemaining[chosen] ?? 0) - revision.estimatedMinutes;
    revisionMinutes += revision.estimatedMinutes;
    used += revision.estimatedMinutes;
    creates.push({
      revisionScheduleId: revision.id,
      subjectId: revision.subjectId,
      curriculumNodeId: revision.curriculumNodeId,
      title: revision.title,
      plannedDate: chosen,
      estimatedMinutes: revision.estimatedMinutes,
      importance: revision.masteryLevel === "critical" || revision.masteryLevel === "weak" ? "core" : "important",
      priorityScore: calculatePriorityV1({
        scheduleUrgency: revision.urgency.includes("overdue") ? 25 : 18,
        weakness: 25 - masteryRank[revision.masteryLevel] * 5,
        revisionUrgency: 20 - urgencyRank[revision.urgency] * 5,
        planDeviation: 0,
        postponement: 0,
        dependency: 0,
      }),
      dedupeKey: `revision|${revision.id}`,
    });
  }

  if (!allowPullForward) {
    pendingPlacementTasks.sort((left, right) => (left.plannedDate ?? context.currentDate).localeCompare(right.plannedDate ?? context.currentDate)
      || taskRank(left) - taskRank(right)
      || right.priorityScore - left.priorityScore
      || left.id.localeCompare(right.id));
  }
  for (const task of pendingPlacementTasks) {
    const remaining = remainingTaskMinutes(task);
    if (remaining === 0) {
      keep.push(task.id);
      continue;
    }
    const current = task.plannedDate;
    let chosen: string | undefined;
    if (used + remaining <= planBudget) {
      if (context.trigger === "study_deviation") {
        const origin = current && current >= context.currentDate ? current : context.currentDate;
        chosen = dates
          .filter((date) => date >= context.currentDate
            && date !== current
            && !(current && current > context.currentDate && date === context.currentDate)
            && (dayRemaining[date] ?? 0) >= remaining)
          .sort((left, right) => calendarDistance(left, origin) - calendarDistance(right, origin)
            || left.localeCompare(right))[0];
      } else {
        const earliest = allowPullForward ? context.currentDate : current && current > context.currentDate ? current : context.currentDate;
        chosen = dates.find((date) => date >= earliest && (dayRemaining[date] ?? 0) >= remaining);
      }
    }
    if (!chosen) {
      if (current !== null) tasksToBacklog.push(task.id);
      continue;
    }
    keep.push(task.id);
    used += remaining;
    dayRemaining[chosen] = (dayRemaining[chosen] ?? 0) - remaining;
    if (current !== chosen) moves.push({ taskId: task.id, fromDate: current, toDate: chosen, reason: "replanning" });
  }

  const changed = moves.length + tasksToBacklog.length + cancel.length + creates.length;
  const revisionType = context.trigger === "capacity_change" || context.trigger === "study_deviation"
    ? "automatic_informed"
    : changed <= REPLAN_LEVEL_1_CHANGE_LIMIT
      ? "automatic_minor"
      : changed <= REPLAN_LEVEL_2_CHANGE_LIMIT
        ? "automatic_informed"
        : "strategic_proposal";
  const reasonCode = context.trigger.toUpperCase();
  const explanation = context.trigger === "capacity_change"
    ? `Kapasiten değiştiği için ${changed} plan öğesi yeniden düzenlendi.`
    : context.trigger === "study_deviation"
      ? changed ? `Gerçek çalışma sürene göre haftanın kalanında ${changed} görev yeniden yerleştirildi.` : "Gerçek çalışma süren plana uygun; görevlerin yerini değiştirmeye gerek kalmadı."
      : context.trigger === "revision_due"
        ? `${creates.length} öncelikli tekrar haftalık plana eklendi.`
        : `Planındaki ${changed} öğe güncel ilerlemene göre düzenlendi.`;
  return {
    tasksToKeep: keep,
    tasksToMove: moves,
    tasksToBacklog,
    tasksToCancel: cancel,
    tasksToCreate: creates,
    availableMinutes,
    afterPlannedMinutes: used,
    revisionMinutes,
    revisionBudgetMinutes: revisionBudget,
    changedTaskCount: changed,
    revisionType,
    reasonCode,
    explanation,
    dedupeKey: [
      context.planId,
      context.trigger,
      availableMinutes,
      keep.join(","),
      moves.map((move) => `${move.taskId}:${move.toDate}`).join(","),
      tasksToBacklog.join(","),
      creates.map((create) => create.revisionScheduleId).join(","),
    ].join("|"),
  };
}
