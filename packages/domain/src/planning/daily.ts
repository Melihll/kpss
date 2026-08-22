export interface DailyPlanProjectionTask {
  id: string;
  plannedDate: string | null;
  status: string;
  remainingMinutes: number;
}

export interface DailyPlanProjectionItem {
  taskId: string;
  remainingMinutes: number;
  scheduledMinutes: number;
}

export interface DailyPlanProjection {
  date: string;
  capacityMinutes: number;
  completedStudyMinutes: number;
  plannedCreditMinutes: number;
  actualStudyMinutes: number;
  extraStudyMinutes: number;
  unknownStudyMinutes: number;
  totalActualMinutes: number;
  nominalActualOverageMinutes: number;
  remainingCapacityMinutes: number;
  scheduledOpenMinutes: number;
  totalCommittedMinutes: number;
  openItems: DailyPlanProjectionItem[];
  completedTaskIds: string[];
  deferredTaskIds: string[];
  deferredMinutes: number;
}

const OPEN_STATUSES = new Set(["planned", "ready", "in_progress", "partially_completed", "rescheduled"]);

/**
 * Builds the canonical Today projection. Input order is preserved so callers can
 * apply the existing priority rules before capacity is allocated.
 */
export function buildDailyPlanProjection(input: {
  date: string;
  capacityMinutes: number;
  completedStudyMinutes: number;
  plannedCreditMinutes?: number;
  actualStudyMinutes?: number;
  extraStudyMinutes?: number;
  unknownStudyMinutes?: number;
  tasks: readonly DailyPlanProjectionTask[];
}): DailyPlanProjection {
  const capacityMinutes = Math.max(0, Math.floor(input.capacityMinutes));
  const plannedCreditMinutes = Math.max(0, Math.floor(input.plannedCreditMinutes ?? input.completedStudyMinutes));
  const completedStudyMinutes = plannedCreditMinutes;
  const actualStudyMinutes = Math.max(0, Math.floor(input.actualStudyMinutes ?? input.completedStudyMinutes));
  const extraStudyMinutes = Math.max(0, Math.floor(input.extraStudyMinutes ?? 0));
  const unknownStudyMinutes = Math.max(0, Math.floor(input.unknownStudyMinutes ?? 0));
  const totalActualMinutes = actualStudyMinutes;
  const remainingCapacityMinutes = Math.max(0, capacityMinutes - plannedCreditMinutes);
  const todayTasks = input.tasks.filter((task) => task.plannedDate === input.date);
  const completedTaskIds = todayTasks.filter((task) => task.status === "completed").map((task) => task.id);
  const openTasks = todayTasks.filter((task) => OPEN_STATUSES.has(task.status) && task.remainingMinutes > 0);
  const openItems: DailyPlanProjectionItem[] = [];
  const deferredTaskIds: string[] = [];
  let capacityLeft = remainingCapacityMinutes;
  let deferredMinutes = 0;

  for (const task of openTasks) {
    const remainingMinutes = Math.max(0, Math.floor(task.remainingMinutes));
    const scheduledMinutes = Math.min(remainingMinutes, capacityLeft);
    if (scheduledMinutes > 0) {
      openItems.push({ taskId: task.id, remainingMinutes, scheduledMinutes });
      capacityLeft -= scheduledMinutes;
    } else {
      deferredTaskIds.push(task.id);
    }
    deferredMinutes += remainingMinutes - scheduledMinutes;
  }

  const scheduledOpenMinutes = openItems.reduce((sum, item) => sum + item.scheduledMinutes, 0);
  return {
    date: input.date,
    capacityMinutes,
    completedStudyMinutes,
    plannedCreditMinutes,
    actualStudyMinutes,
    extraStudyMinutes,
    unknownStudyMinutes,
    totalActualMinutes,
    nominalActualOverageMinutes: Math.max(0, totalActualMinutes - capacityMinutes),
    remainingCapacityMinutes,
    scheduledOpenMinutes,
    totalCommittedMinutes: completedStudyMinutes + scheduledOpenMinutes,
    openItems,
    completedTaskIds,
    deferredTaskIds,
    deferredMinutes,
  };
}

export function findDailyCapacityOverloads(
  blocks: readonly { plannedDate: string; estimatedMinutes: number }[],
  dayCapacities: Readonly<Record<string, number>>,
) {
  const plannedByDate = new Map<string, number>();
  for (const block of blocks) {
    plannedByDate.set(block.plannedDate, (plannedByDate.get(block.plannedDate) ?? 0) + Math.max(0, block.estimatedMinutes));
  }
  return [...plannedByDate.entries()]
    .map(([date, plannedMinutes]) => ({ date, plannedMinutes, capacityMinutes: Math.max(0, dayCapacities[date] ?? 0) }))
    .filter((day) => day.plannedMinutes > day.capacityMinutes)
    .sort((left, right) => left.date.localeCompare(right.date));
}
