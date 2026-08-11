import { supabase } from "./supabase";

export class AppApiError extends Error {
  override readonly name = "AppApiError";
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

export async function callAppApi<T>(
  path: string,
  options: { method?: "GET" | "POST" | "PATCH"; body?: unknown } = {},
): Promise<T> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session) throw new AppApiError("UNAUTHORIZED", "Oturum bulunamadı.");
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/app-api${path}`,
    {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    },
  );
  const payload = await response.json() as T & { error?: { code?: string; message?: string } };
  if (!response.ok) {
    throw new AppApiError(payload.error?.code ?? "API_ERROR", payload.error?.message ?? "İşlem tamamlanamadı.");
  }
  return payload;
}

export const FRIENDLY_API_ERRORS: Readonly<Record<string, string>> = {
  NO_ACTIVE_EXAM_PROFILE: "Önce aktif bir çalışma profili oluşturun.",
  NO_WEEKLY_AVAILABILITY: "Plan oluşturmak için haftalık müsaitlik ekleyin.",
  ACTIVE_PLAN_ALREADY_EXISTS: "Bu hafta için aktif plan zaten var.",
  TASK_NOT_FOUND: "Görev bulunamadı veya bu göreve erişiminiz yok.",
  TASK_HAS_PENDING_UNITS: "Önce göreve bağlı bekleyen unit’leri tamamlayın.",
  INVALID_TASK_PROGRESS: "Tamamlanan dakika geçersiz.",
  NO_RECOMMENDABLE_TASK: "Şu anda aktif haftalık görev bulunamadı.",
  ACTIVE_SESSION_EXISTS: "Zaten aktif bir çalışma oturumunuz var.",
  SESSION_NOT_FOUND: "Çalışma oturumu bulunamadı.",
  INVALID_TEST_RESULT: "Doğru, yanlış ve boş toplamını kontrol edin.",
  RESOURCE_UNIT_NOT_LINKED_TO_TASK: "Seçilen test ünitesi bu göreve bağlı değil.",
  RESOURCE_UNIT_NOT_FOUND: "Test ünitesi bulunamadı.",
  TEST_RESULT_NOT_FOUND: "Test sonucu bulunamadı.",
  REVISION_NOT_FOUND: "Tekrar bulunamadı veya bu tekrara erişiminiz yok.",
  REVISION_NOT_ACTIVE: "Bu tekrar artık aktif değil.",
  WEEKLY_PLAN_NOT_FOUND: "Bu hafta için aktif plan bulunamadı.",
  TASK_NOT_REPLANNABLE: "Görev mevcut durumunda yeniden planlanamaz.",
  INVALID_MANUAL_PLAN_DATE: "Plan içindeki günlerden biri bu haftanın dışında.",
  INVALID_MANUAL_PLAN_MINUTES: "Çalışma süresini kontrol et.",
  INVALID_MANUAL_PLAN_SUBJECT: "Seçilen ders aktif derslerin arasında değil.",
  INVALID_MANUAL_PLAN_RESOURCE: "Seçilen kaynak bu dersle eşleşmiyor.",
  INVALID_WORK_MODE: "Çalışma türünü kontrol et.",
  MANUAL_PLAN_OVER_CAPACITY: "Bu plan haftalık kapasiteni aşıyor. Birkaç süreyi azalt.",
  P48_STRATEGY_NOT_CONFIGURED: "P48 yol haritası henüz kurulmadı.",
  UNAUTHORIZED: "Oturumunuz geçersiz. Yeniden giriş yapın.",
};
