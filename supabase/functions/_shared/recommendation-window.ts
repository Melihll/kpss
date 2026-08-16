export function recommendationWindow(taskRemainingMinutes: number, availableMinutes: number) {
  const taskRemaining = Math.max(0, Number(taskRemainingMinutes) || 0);
  const available = Math.max(0, Number(availableMinutes) || 0);
  return {
    taskRemainingMinutes: taskRemaining,
    recommendedSessionMinutes: Math.min(taskRemaining, available),
  };
}
