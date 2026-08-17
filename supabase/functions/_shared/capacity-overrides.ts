type DailyCapacityOverrideRow = {
  capacity_date: string;
  capacity_minutes: number;
  reserve_minutes: number;
};

export async function loadP48DailyCapacityOverrides(
  client: any,
  userId: string,
  examProfileId: string,
  startDate: string,
  endDate: string,
) {
  const result = await client.from("p48_daily_capacity_overrides")
    .select("capacity_date,capacity_minutes,reserve_minutes")
    .eq("user_id", userId)
    .eq("exam_profile_id", examProfileId)
    .gte("capacity_date", startDate)
    .lte("capacity_date", endDate);
  if (result.error) throw result.error;
  return new Map<string, DailyCapacityOverrideRow>((result.data ?? []).map((row: DailyCapacityOverrideRow) => [row.capacity_date, row]));
}

export function planningCapacityForDate(
  date: string,
  calculatedCapacity: number,
  overrides: ReadonlyMap<string, DailyCapacityOverrideRow>,
  calculatedBaseCapacity = calculatedCapacity,
) {
  const override = overrides.get(date);
  return override
    ? Math.max(0, Number(override.capacity_minutes) - Number(override.reserve_minutes)
      + (calculatedCapacity - calculatedBaseCapacity))
    : calculatedCapacity;
}
