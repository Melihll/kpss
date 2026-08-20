export type DailyOrderTask = {
  readonly id: string;
  readonly planned_date: string | null;
};

export type DailyOrderPreference = {
  readonly task_id: string;
  readonly planned_date: string;
  readonly manual_order: number;
};

export function applyDailyTaskOrder<T extends DailyOrderTask>(
  plannerOrderedTasks: readonly T[],
  preferences: readonly DailyOrderPreference[],
): T[] {
  if (plannerOrderedTasks.length <= 1 || preferences.length === 0) {
    return [...plannerOrderedTasks];
  }

  const preferenceKey = (taskId: string, plannedDate: string) => `${taskId}:${plannedDate}`;
  const preferencesByTaskAndDate = new Map(
    preferences.map((preference) => [preferenceKey(preference.task_id, preference.planned_date), preference] as const),
  );

  const taskIdsByDate = new Map<string, string[]>();
  for (const task of plannerOrderedTasks) {
    if (!task.planned_date) continue;
    const ids = taskIdsByDate.get(task.planned_date) ?? [];
    ids.push(task.id);
    taskIdsByDate.set(task.planned_date, ids);
  }

  const validOrderByTaskId = new Map<string, number>();

  for (const [date, taskIds] of taskIdsByDate) {
    const dayPreferences = taskIds.map((taskId) => preferencesByTaskAndDate.get(preferenceKey(taskId, date)));
    const hasCompleteCurrentPreferences = dayPreferences.every(
      (preference) =>
        preference !== undefined &&
        preference.planned_date === date &&
        Number.isInteger(preference.manual_order) &&
        preference.manual_order >= 0,
    );

    if (!hasCompleteCurrentPreferences) continue;

    const manualOrders = dayPreferences.map((preference) => preference!.manual_order);
    if (new Set(manualOrders).size !== taskIds.length) continue;

    for (const preference of dayPreferences) {
      validOrderByTaskId.set(preference!.task_id, preference!.manual_order);
    }
  }

  return plannerOrderedTasks
    .map((task, plannerIndex) => ({ task, plannerIndex }))
    .sort((left, right) => {
      const leftDate = left.task.planned_date ?? "";
      const rightDate = right.task.planned_date ?? "";

      if (leftDate !== rightDate) {
        return left.plannerIndex - right.plannerIndex;
      }

      const leftManual = validOrderByTaskId.get(left.task.id);
      const rightManual = validOrderByTaskId.get(right.task.id);

      if (leftManual === undefined || rightManual === undefined) {
        return left.plannerIndex - right.plannerIndex;
      }

      return leftManual - rightManual || left.plannerIndex - right.plannerIndex;
    })
    .map(({ task }) => task);
}