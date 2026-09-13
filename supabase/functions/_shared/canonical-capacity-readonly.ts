import { addRevisionCalendarDays, calculateEffectiveDayCapacity } from "./planning.bundle.js";
import {
  grossCapacityForDate,
  loadP48DailyCapacityOverrides,
  planningCapacityForDate,
} from "./capacity-overrides.ts";

type Client = any;

export interface CanonicalCapacityReadOnlyDay {
  readonly date: string;
  readonly grossMinutes: number;
  readonly reserveMinutes: number;
  readonly planningMinutes: number;
}

export interface CanonicalCapacityReadOnlyProjection {
  readonly horizonStart: string;
  readonly horizonEnd: string;
  readonly days: readonly CanonicalCapacityReadOnlyDay[];
  /** Raw rows are returned only so the pre-existing adaptive caller can retain identical behavior. */
  readonly sourceRows: {
    readonly availability: readonly any[];
    readonly calendarPeriods: readonly any[];
    readonly scheduleExceptions: readonly any[];
  };
  readonly dailyOverrides: ReadonlyMap<string, any>;
}

export interface CanonicalCapacityReadOnlyInput {
  readonly client: Client;
  readonly userId: string;
  readonly examProfileId: string;
  readonly horizonStart: string;
  readonly horizonEnd: string;
  readonly hypotheticalCapacityEvent?: {
    readonly effectiveDate: string;
    readonly deltaMinutes: number;
  };
}

const windows = (rows: readonly any[]) => rows.map((row) => ({
  weekday: row.weekday,
  start_time: row.start_time,
  end_time: row.end_time,
  is_active: row.is_active,
}));

const periods = (rows: readonly any[]) => rows.map((row) => ({
  startDate: row.start_date,
  endDate: row.end_date,
  capacityMultiplier: row.capacity_multiplier == null
    ? null
    : Number(row.capacity_multiplier),
}));

const exceptions = (rows: readonly any[]) => rows.map((row) => ({
  date: row.exception_date,
  type: row.exception_type,
  startTime: row.start_time,
  endTime: row.end_time,
  minutesDelta: row.minutes_delta,
}));

function datesBetween(start: string, end: string): string[] {
  const dates: string[] = [];
  for (let date = start; date <= end; date = addRevisionCalendarDays(date, 1)) {
    dates.push(date);
  }
  return dates;
}

/**
 * Authoritative read-only capacity projection extracted from loadAdaptiveBase.
 * It owns no Coach semantics and performs no writes. Its day calculations are
 * byte-for-byte equivalent in inputs and ordering to the prior adaptive path.
 */
export async function loadCanonicalCapacityReadOnly(
  input: CanonicalCapacityReadOnlyInput,
): Promise<CanonicalCapacityReadOnlyProjection> {
  const [availability, calendar, exceptionRows, dailyOverrides] = await Promise.all([
    input.client.from("weekly_availability").select("*")
      .eq("user_id", input.userId)
      .eq("exam_profile_id", input.examProfileId)
      .eq("is_active", true),
    input.client.from("calendar_periods").select("*")
      .eq("user_id", input.userId)
      .eq("exam_profile_id", input.examProfileId),
    input.client.from("schedule_exceptions").select("*")
      .eq("user_id", input.userId)
      .eq("exam_profile_id", input.examProfileId)
      .gte("exception_date", input.horizonStart)
      .lte("exception_date", input.horizonEnd),
    loadP48DailyCapacityOverrides(
      input.client,
      input.userId,
      input.examProfileId,
      input.horizonStart,
      input.horizonEnd,
    ),
  ]);
  for (const result of [availability, calendar, exceptionRows]) {
    if (result.error) throw result.error;
  }

  const scheduleExceptions = [...(exceptionRows.data ?? [])];
  if (input.hypotheticalCapacityEvent) {
    scheduleExceptions.push({
      exception_date: input.hypotheticalCapacityEvent.effectiveDate,
      exception_type: input.hypotheticalCapacityEvent.deltaMinutes > 0
        ? "extra_available"
        : "custom",
      start_time: null,
      end_time: null,
      minutes_delta: input.hypotheticalCapacityEvent.deltaMinutes,
      note: "confirmed_action_preview",
    });
  }

  const availabilityWindows = windows(availability.data ?? []);
  const calendarPeriods = periods(calendar.data ?? []);
  const mappedExceptions = exceptions(scheduleExceptions);
  const days = datesBetween(input.horizonStart, input.horizonEnd).map((date) => {
    const capacityContext = {
      date,
      weeklyAvailability: availabilityWindows,
      calendarPeriods,
    };
    const calculatedBase = calculateEffectiveDayCapacity({
      ...capacityContext,
      scheduleExceptions: [],
    });
    const calculated = calculateEffectiveDayCapacity({
      ...capacityContext,
      scheduleExceptions: mappedExceptions,
    });
    const grossMinutes = grossCapacityForDate(
      date,
      calculated,
      dailyOverrides,
      calculatedBase,
    );
    const planningMinutes = planningCapacityForDate(
      date,
      calculated,
      dailyOverrides,
      calculatedBase,
    );
    return Object.freeze({
      date,
      grossMinutes,
      reserveMinutes: Math.max(0, grossMinutes - planningMinutes),
      planningMinutes,
    });
  });

  return Object.freeze({
    horizonStart: input.horizonStart,
    horizonEnd: input.horizonEnd,
    days: Object.freeze(days),
    sourceRows: Object.freeze({
      availability: Object.freeze([...(availability.data ?? [])]),
      calendarPeriods: Object.freeze([...(calendar.data ?? [])]),
      scheduleExceptions: Object.freeze(scheduleExceptions),
    }),
    dailyOverrides,
  });
}
