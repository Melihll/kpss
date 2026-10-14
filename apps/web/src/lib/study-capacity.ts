import type { WeeklyAvailability } from "@kpss-coach/domain";
import { calculateWeeklyAvailableMinutes } from "@kpss-coach/domain";

export type CapacityMode = "time_windows" | "daily_minutes";
export interface DailyCapacity { weekday: number; minutes: number }
export interface StudyCapacityState {
  mode: CapacityMode;
  days: DailyCapacity[];
  revision: string;
  windows: WeeklyAvailability[];
  windowsRevision: string;
}
export interface CapacityReadiness {
  status: string;
  weeklyState: string;
  weeklyGrossMinutes: number;
  remainingMinutes: number | null;
  protectedWorkExceedsCapacity: boolean | null;
  legacyPlannerSupported: boolean;
}
export function weeklyCapacityMinutes(state: StudyCapacityState) {
  return state.mode === "daily_minutes"
    ? state.days.reduce((total, day) => total + day.minutes, 0)
    : calculateWeeklyAvailableMinutes(state.windows);
}
export function capacityMinutesLabel(minutes: number) {
  return `${Math.floor(minutes / 60)} sa ${minutes % 60} dk`;
}
export function capacitySaveMessage(message: string) {
  if (message.includes("CAPACITY_CONFLICT") || message.includes("AVAILABILITY_CONFLICT")) return "Bu bilgiler başka bir yerde değişti. Son kaydı yükleyip seçimini yeniden yap.";
  if (message.includes("CAPACITY_PROTECTED_WORK_EXCEEDED")) return "Bu süreler mevcut çalışmalarına yetmiyor. Planındaki çalışmaları korumak için önce sürelerini artır.";
  if (message.includes("CAPACITY_TIMED_EXCEPTION_UNSUPPORTED")) return "Saat aralığı içeren bir takvim istisnası var. Bu hafta gün bazlı sürelerle henüz hesaplanamıyor.";
  if (message.includes("INVALID_DAILY_CAPACITY")) return "Her gün için 0 ile 24 saat arasında tam dakika seç.";
  return "Kayıt doğrulanamadı. Seçimlerin ekranda duruyor; son kaydı kontrol et veya aynı seçimi tekrar kaydet.";
}
export function capacityWeekStarts() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() || 7) - 1));
  const current = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 7);
  return [current, date.toISOString().slice(0, 10)];
}
