import { calculateWeeklyAvailableMinutes, type WeeklyAvailability } from "@kpss-coach/domain";

export interface AvailabilityState { revision: string; windows: WeeklyAvailability[] }
export function availabilityValidationMessage(windows: ReadonlyArray<{ weekday: number; start_time: string; end_time: string; is_active?: boolean }>): string | null {
  const validTime = /^([01]\d|2[0-3]):[0-5]\d(?::00)?$/;
  if (windows.length > 100 || windows.some(w => !Number.isInteger(w.weekday) || w.weekday < 1 || w.weekday > 7 || !validTime.test(w.start_time) || !validTime.test(w.end_time))) return "Zaman pencerelerini kontrol edin.";
  const ordered = [...windows].sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time));
  for (let i = 0; i < ordered.length; i++) {
    const current = ordered[i]!;
    if (current.end_time.slice(0, 5) <= current.start_time.slice(0, 5)) return "Bitiş saati başlangıçtan sonra olmalı.";
    const previous = ordered[i - 1];
    if (previous?.weekday === current.weekday && previous.end_time.slice(0, 5) > current.start_time.slice(0, 5)) return "Zaman aralıkları çakışamaz.";
  }
  try { calculateWeeklyAvailableMinutes(windows); } catch { return "Zaman pencerelerini kontrol edin."; }
  return null;
}

export function availabilitySaveMessage(message: string) {
  if (message.includes("AVAILABILITY_CONFLICT")) return "Zaman bilgilerin başka bir işlemde değişti. Sayfayı yenileyip kayıtlı saatleri gözden geçir.";
  if (message.includes("AVAILABILITY_OVERLAP")) return "Zaman aralıkları çakışamaz.";
  if (message.includes("INVALID_AVAILABILITY")) return "Zaman pencerelerini kontrol edin.";
  return "Kayıt sonucu alınamadı. Sayfayı yenileyip kayıtlı saatleri kontrol et.";
}
