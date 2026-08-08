export const DEFAULT_TIMEZONE = "Europe/Istanbul";

export interface UtcTimeRange {
  startUtc: string;
  endUtc: string;
}

function parseDate(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error("INVALID_DATE");
  const [, year, month, day] = match;
  const value = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12));
  if (value.toISOString().slice(0, 10) !== date) throw new Error("INVALID_DATE");
  return value;
}

function addDays(date: string, days: number) {
  const value = parseDate(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function mondayOf(date: string) {
  const value = parseDate(date);
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() - day + 1);
  return value.toISOString().slice(0, 10);
}

function timeZoneOffsetAt(utcMillis: number, timeZone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(utcMillis)).map((part) => [part.type, part.value]));
  const representedAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return representedAsUtc - Math.floor(utcMillis / 1000) * 1000;
}

export function zonedMidnightToUtc(date: string, timeZone = DEFAULT_TIMEZONE) {
  const value = parseDate(date);
  const wallClockUtc = Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  let instant = wallClockUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    instant = wallClockUtc - timeZoneOffsetAt(instant, timeZone);
  }
  return new Date(instant).toISOString();
}

export function getZonedDayRange(date: string, timeZone = DEFAULT_TIMEZONE): UtcTimeRange {
  return {
    startUtc: zonedMidnightToUtc(date, timeZone),
    endUtc: zonedMidnightToUtc(addDays(date, 1), timeZone),
  };
}

export function getZonedWeekRange(date: string, timeZone = DEFAULT_TIMEZONE): UtcTimeRange {
  const monday = mondayOf(date);
  return {
    startUtc: zonedMidnightToUtc(monday, timeZone),
    endUtc: zonedMidnightToUtc(addDays(monday, 7), timeZone),
  };
}

export function isInstantInRange(instant: string, range: UtcTimeRange) {
  const value = new Date(instant).getTime();
  return value >= new Date(range.startUtc).getTime() && value < new Date(range.endUtc).getTime();
}
