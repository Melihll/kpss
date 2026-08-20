export interface WeeklyCapacitySummaryInput {
  readonly normalWeeklyMinutes: number;
  readonly planningTargetMinutes: number;
  readonly effectiveDayCapacities: Readonly<Record<string, number>>;
  readonly planningBudgetMinutes: number | null | undefined;
}

export interface WeeklyCapacitySummary {
  readonly normalWeeklyMinutes: number;
  readonly planningTargetMinutes: number;
  readonly effectiveWeeklyMinutes: number;
  readonly planningBudgetMinutes: number | null;
}

function normalizeMinutes(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`INVALID_CAPACITY_METRIC:${label}`);
  }
  return Math.round(value);
}

export function buildWeeklyCapacitySummary(
  input: WeeklyCapacitySummaryInput,
): WeeklyCapacitySummary {
  const effectiveWeeklyMinutes = Object.values(input.effectiveDayCapacities)
    .reduce(
      (sum, value) => sum + normalizeMinutes(value, "effectiveDay"),
      0,
    );

  return Object.freeze({
    normalWeeklyMinutes: normalizeMinutes(
      input.normalWeeklyMinutes,
      "normalWeekly",
    ),
    planningTargetMinutes: normalizeMinutes(
      input.planningTargetMinutes,
      "planningTarget",
    ),
    effectiveWeeklyMinutes,
    planningBudgetMinutes:
      input.planningBudgetMinutes == null
        ? null
        : normalizeMinutes(
            input.planningBudgetMinutes,
            "planningBudget",
          ),
  });
}