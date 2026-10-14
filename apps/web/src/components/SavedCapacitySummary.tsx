import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "../lib/supabase";
import { capacityMinutesLabel, capacityWeekStarts, type CapacityReadiness } from "../lib/study-capacity";

/** Keep the accepted legacy metrics; daily users read their persisted source. */
export function SavedCapacitySummary({ userId, children }: { userId: string; children: ReactNode }) {
  const [result, setResult] = useState<"loading" | "legacy" | "error" | CapacityReadiness[]>("loading");
  useEffect(() => {
    let active = true;
    void (async () => {
      const profile = await supabase.from("exam_profiles").select("id").eq("user_id", userId).eq("status", "active").maybeSingle();
      if (profile.error) throw profile.error;
      if (!profile.data) { if (active) setResult("legacy"); return; }
      const source = await supabase.from("study_capacity_preferences").select("mode").eq("exam_profile_id", profile.data.id).maybeSingle();
      if (source.error) throw source.error;
      if (source.data?.mode !== "daily_minutes") { if (active) setResult("legacy"); return; }
      const results = await Promise.all(capacityWeekStarts().map(p_week_start => supabase.rpc("study_capacity_readiness", { p_exam_profile_id: profile.data!.id, p_week_start })));
      if (results.some(r => r.error)) throw new Error("CAPACITY_READ_FAILED");
      if (active) setResult(results.map(r => r.data as CapacityReadiness));
    })().catch(() => { if (active) setResult("error"); });
    return () => { active = false; };
  }, [userId]);
  if (result === "loading") return <p role="status">Çalışma sürelerin yükleniyor…</p>;
  if (result === "error") return <p role="alert">Çalışma sürelerin okunamadı. Düzenle bağlantısından son kaydını kontrol et.</p>;
  if (result === "legacy") return children;
  if (!result[0]) return <p role="alert">Çalışma sürelerin okunamadı. Düzenle bağlantısından son kaydını kontrol et.</p>;
  return <div className="settings-capacity-metrics">
    <div><span>Haftalık gün sürelerin</span><strong>{capacityMinutesLabel(result[0].weeklyGrossMinutes)}</strong><small>Kaydettiğin haftalık toplam</small></div>
    {result.map((ready, i) => <div key={i}><span>{i === 0 ? "Bu hafta kalan" : "Gelecek hafta kullanılabilir"}</span><strong>{ready.remainingMinutes === null ? "Hesaplanamıyor" : capacityMinutesLabel(ready.remainingMinutes)}</strong><small>{ready.protectedWorkExceedsCapacity ? "Mevcut çalışmalar seçilen süreleri aşıyor." : "Takvim, ayrılan süreler ve mevcut çalışmalar dahil"}</small></div>)}
    <div><span>İlk plan</span><strong>Otomatik oluşturulmaz</strong><small>Gün bazlı ilk plan adımı henüz hazır değil.</small></div>
  </div>;
}
