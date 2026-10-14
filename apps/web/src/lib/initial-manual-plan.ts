export const INITIAL_PLAN_VERSION = "initial-manual-plan-v1";
export interface InitialBlock {
  plannedDate: string; subjectId: string; resourceId: string; workMode: string; estimatedMinutes: number; detail: string;
}
export interface InitialResource { id: string; subjectId: string; name: string; subjectName: string; resourceType: string; workModes: string[] }
export interface InitialReadiness {
  contractVersion: string; capabilityVersion: number; profileId: string; weekStartDate: string; currentWeek: string; nextWeek: string; today: string;
  configurationRevision: string; mode: string; ready: boolean; reasons: string[]; resources: InitialResource[];
  subjectsWithoutSources: Array<{ subjectId: string; name: string }>; days: Record<string, number>; weeklyBudgetMinutes: number;
  existingPlan: { id: string; week_start_date: string } | null;
}
export interface InitialPreview extends InitialReadiness {
  valid: boolean; blocks: InitialBlock[]; dayTotals: Record<string, number>; totalMinutes: number; reviewedPayloadHash: string;
  errors: Array<{ block?: number; field: string; code: string; date?: string }>;
}
export interface InitialResult { weeklyPlanId: string; taskIds: string[]; operationId: string; profileId: string; weekStartDate: string }
export const FIRST_PLAN_MESSAGES: Record<string, string> = {
  PROFILE_INCOMPLETE: "Hedef tarihini ve ders seçimini tamamla. Başka aktif profilin varsa önce onu aç.",
  MISSING_CAPACITY: "Plan için çalışabileceğin günlere süre ekle.",
  NO_REMAINING_CAPACITY: "Bu hafta kullanılabilir zaman kalmadı. Gelecek haftayı seçebilir veya zamanını düzenleyebilirsin.",
  MISSING_SUITABLE_RESOURCE: "Seçtiğin bir ders için aktif kitap, soru bankası, video kurs, not veya deneme kaynağı ekle.",
  UNSUPPORTED_EXAM: "Bu sınav ve ders seçimiyle ilk plan desteklenmiyor. Sınav seçimini kontrol et.",
  UNSUPPORTED_WEEK: "Bu hafta veya hemen sonraki haftayı seç.",
  CAPACITY_TIMED_EXCEPTION_UNSUPPORTED: "Bu haftada saatli bir zaman istisnası var. Günlük süreyle güvenli hesaplanamıyor. İstisnanı gözden geçir veya diğer haftayı seç.",
  PLAN_ALREADY_EXISTS: "Bu profilin planı zaten var. Mevcut planını açabilirsin.",
  PROTECTED_COMMITMENT_EXISTS: "Profilinde korunması gereken çalışma var. Mevcut çalışmalarını Bugün ekranından aç.",
  FIRST_PLAN_STALE: "Zamanın, kaynakların veya tercihlerinin kaydı değişmiş. Seçtiğin çalışmaları yeniden incele.",
  REVIEW_PAYLOAD_MISMATCH: "Çalışmalar incelemeden sonra değişti. Planı yeniden incele.",
  FIRST_PLAN_NOT_READY: "Plan şu an oluşturulamıyor. Zamanını ve kaynaklarını yenileyip tekrar incele.",
  INITIAL_PLAN_UNAVAILABLE: "Plan oluşturma şu anda kullanılamıyor. Kaydedilmiş tercihlerin korunuyor.",
  NOT_FOUND: "Plan oluşturma bu sunucuda henüz kullanılamıyor. Tercihlerin kayıtlı.",
  NO_ACTIVE_EXAM_PROFILE: "Bu sunucuda ilk plan capability’si kullanılamıyor. Kaydedilmiş tercihlerini koruyup daha sonra tekrar deneyebilirsin.",
  EXAM_PROFILE_NOT_FOUND: "Çalışma profiline erişilemedi. Oturumunu ve kendi profilini kontrol et.",
  IDEMPOTENCY_CONFLICT: "Bu işlemin bilgileri uyuşmuyor. Mevcut sonucu kontrol et.",
  INVALID_RESOURCE: "Dersinle eşleşen aktif bir kaynak seç.", INVALID_WORK_MODE: "Bu kaynakla uyumlu bir çalışma türü seç.",
  INVALID_MINUTES: "1–480 arasında tam dakika gir.", INVALID_DATE: "Çalışma gününü hafta ve sınav tarihine göre kontrol et.",
  OVER_DAY_CAPACITY: "Bu gün için seçtiğin süre kullanılabilir zamanı aşıyor.", OVER_WEEK_CAPACITY: "Toplam süre haftanın kullanılabilir zamanını aşıyor.",
  BLOCKS_REQUIRED: "En az bir çalışma ekle.", UNAUTHORIZED: "Oturumun sona erdi. Yeniden giriş yap; açık taslağın bu sekmede kalır.",
};
export const initialDateLabel = (date: string) => new Intl.DateTimeFormat("tr-TR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(date + "T12:00:00Z"));
export function currentIstanbulWeek() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
  const d = new Date(today + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 1 - (d.getUTCDay() || 7));
  return d.toISOString().slice(0, 10);
}
