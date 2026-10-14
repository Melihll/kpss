import type { RoadmapTask } from "./roadmap";
export type Minutes = number | null;
export interface WeekMetrics {
  declaredMinutes: Minutes; effectiveMinutes: Minutes; plannedMinutes: number; plannedCreditMinutes: Minutes;
  actualMinutes: Minutes; extraActualMinutes: Minutes; calendarPlannedCreditMinutes: number;
  remainingPlannedMinutes: Minutes; unallocatedMinutes: Minutes; activeSessionCount: number; completedTaskCount: number;
}
export interface WeekTask extends RoadmapTask {
  plannedCreditMinutes: Minutes; remainingPlannedMinutes: Minutes; protected: boolean; eligibleToday: boolean; progressMissing: boolean;
}
export interface WeekDay extends WeekMetrics {
  date: string; status: string; warnings: string[]; tasks: WeekTask[];
  exceptions: Array<{ exception_type: string; minutes_delta: number | null; start_time: string | null; end_time: string | null; note?: string }>;
  overrides: Array<{ capacity_minutes: number; reserve_minutes: number }>;
}
export interface WeeklyStudyView {
  contractVersion: "weekly-study-view-v1"; revision: string; profileId: string; today: string; timezone: string;
  weekStart: string; weekEnd: string; currentWeek: string; nextWeek: string; knownHistoricalWeeks: string[];
  mode: "daily_minutes" | "time_windows"; capacityStatus: string; hasAnyPlan: boolean; hasProtectedWork: boolean;
  upcomingStartDate: string | null; initialPlanStartDate: string | null;
  firstPlan: { eligible: boolean; reasons: string[]; nextWeekReasons: string[] | null; subjectsWithoutSources: Array<{ name: string }> };
  totals: WeekMetrics & { taskCount: number; weeklyCeilingMinutes: Minutes; planFulfillmentPercent: Minutes };
  days: WeekDay[]; plans: Array<{ id: string; week_start_date: string }>;
  periods: Array<{ name: string; start_date: string; end_date: string; capacity_multiplier: number }>;
  dataWarnings: string[];
  materialDetailsUnavailable?: boolean;
}
export const minutesLabel = (value: Minutes | undefined) => value == null ? "N/A" : `${value} dk`;
export const fulfillmentLabel = (value: Minutes) => value == null ? "N/A" : `%${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 }).format(value)}`;
export const canOpenFirstPlan = (data: WeeklyStudyView) => data.firstPlan.eligible && !data.hasAnyPlan && !data.hasProtectedWork;
export const WEEK_STATUS: Record<string, string> = {
  CAPACITY_TIMED_EXCEPTION_UNSUPPORTED: "Saatli istisna: günlük süreyle kapasite hesaplanamıyor. Görevler ve çalışma kayıtları aşağıda korunuyor.",
  HISTORICAL_CAPACITY_NOT_ARCHIVED: "Bu haftanın kapasite ayarları arşivlenmedi. Beyan N/A; geçmiş günlerde yeni çalışmaya ayrılabilir zaman 0. Kayıtlı görevler ve gerçekleşen çalışmalar gösteriliyor.",
  PAST_DAY: "Geçmiş gün · yeni çalışmaya ayrılabilir kapasite 0",
  PROTECTED_WORK_EXCEEDS_CAPACITY: "Kalan çalışma kullanılabilir kapasiteyi aşıyor. Mevcut görevler korunuyor.",
  INCOMPLETE_DATA: "Bazı ilerleme kayıtları eksik. Bilinmeyen değerler N/A olarak gösteriliyor.",
};
