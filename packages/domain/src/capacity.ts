export interface AvailabilityWindow {
  weekday: number;
  start_time: string;
  end_time: string;
  is_active?: boolean;
}

export class DomainValidationError extends Error {
  override readonly name = "DomainValidationError";
}

function parseTime(value: string): number {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value);
  if (!match) throw new DomainValidationError(`Invalid time: ${value}`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new DomainValidationError(`Invalid time: ${value}`);
  return hours * 60 + minutes;
}

function validatedIntervals(windows: readonly AvailabilityWindow[], weekday: number) {
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
    throw new DomainValidationError(`Invalid weekday: ${weekday}`);
  }

  return windows
    .filter((window) => window.is_active !== false && window.weekday === weekday)
    .map((window) => {
      if (!Number.isInteger(window.weekday) || window.weekday < 1 || window.weekday > 7) {
        throw new DomainValidationError(`Invalid weekday: ${window.weekday}`);
      }
      const start = parseTime(window.start_time);
      const end = parseTime(window.end_time);
      if (end <= start) throw new DomainValidationError("Availability end time must be after start time");
      return { start, end };
    })
    .sort((left, right) => left.start - right.start || left.end - right.end);
}

export function calculateDayAvailableMinutes(
  windows: readonly AvailabilityWindow[],
  weekday: number,
): number {
  const intervals = validatedIntervals(windows, weekday);
  if (intervals.length === 0) return 0;

  let total = 0;
  let currentStart = intervals[0]!.start;
  let currentEnd = intervals[0]!.end;

  for (const interval of intervals.slice(1)) {
    if (interval.start <= currentEnd) {
      currentEnd = Math.max(currentEnd, interval.end);
    } else {
      total += currentEnd - currentStart;
      currentStart = interval.start;
      currentEnd = interval.end;
    }
  }

  return total + currentEnd - currentStart;
}

export function calculateWeeklyAvailableMinutes(windows: readonly AvailabilityWindow[]): number {
  for (const window of windows) {
    if (!Number.isInteger(window.weekday) || window.weekday < 1 || window.weekday > 7) {
      throw new DomainValidationError(`Invalid weekday: ${window.weekday}`);
    }
  }
  return Array.from({ length: 7 }, (_, index) => index + 1).reduce(
    (total, weekday) => total + calculateDayAvailableMinutes(windows, weekday),
    0,
  );
}
