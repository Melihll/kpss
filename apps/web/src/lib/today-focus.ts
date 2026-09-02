export interface TodayFocusTask {
  readonly id: string;
  readonly status: string;
}

export interface TodayFocusRecommendation<T extends TodayFocusTask> {
  readonly task: T;
  readonly reason: string;
  readonly remainingMinutes: number;
}

export interface ResolvedTodayFocus<T extends TodayFocusTask> {
  readonly task: T;
  readonly reason: string;
  readonly remainingMinutes: number;
  readonly source: "recommendation" | "daily_plan_fallback";
}

/**
 * The server recommendation remains authoritative when available.
 *
 * If recommendation generation cannot produce a "now" task, Today must not
 * claim that there is no work while the canonical daily projection still has
 * open tasks. In that case the first task in the already-ordered daily plan is
 * used as a presentation-only fallback.
 */
export function resolveTodayFocus<T extends TodayFocusTask>(input: {
  readonly recommendation: TodayFocusRecommendation<T> | null;
  readonly todayTasks: readonly T[];
  readonly dailyMinutes: ReadonlyMap<string, number>;
  readonly hasActiveSession: boolean;
}): ResolvedTodayFocus<T> | null {
  if (input.hasActiveSession) return null;

  if (input.recommendation) {
    return {
      task: input.recommendation.task,
      reason: input.recommendation.reason,
      remainingMinutes: Math.max(
        0,
        Math.floor(Number(input.recommendation.remainingMinutes) || 0),
      ),
      source: "recommendation",
    };
  }

  for (const task of input.todayTasks) {
    if (task.status === "completed") continue;

    const minutes = Math.max(
      0,
      Math.floor(Number(input.dailyMinutes.get(task.id) ?? 0)),
    );

    if (minutes <= 0) continue;

    return {
      task,
      reason: "daily_plan_fallback",
      remainingMinutes: minutes,
      source: "daily_plan_fallback",
    };
  }

  return null;
}