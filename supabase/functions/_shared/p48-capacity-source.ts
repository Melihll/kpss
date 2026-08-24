export type P48CapacitySourceState =
  | "configured"
  | "missing_capacity_source";

export interface P48CapacitySourceInput {
  weeklyTargetMinutes: number;
  activeAvailabilityCount: number;
  dailyOverrideCount: number;
}

export function classifyP48CapacitySource(
  input: P48CapacitySourceInput,
): P48CapacitySourceState {
  const hasRecurringAvailability = input.activeAvailabilityCount > 0;
  const hasWeekSpecificCapacity = input.dailyOverrideCount > 0;

  if (
    input.weeklyTargetMinutes > 0 &&
    !hasRecurringAvailability &&
    !hasWeekSpecificCapacity
  ) {
    return "missing_capacity_source";
  }

  return "configured";
}
