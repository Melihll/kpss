import { Link } from "react-router-dom";
import type { RoadmapResponse } from "../lib/roadmap";

export function PlanSetupNotice({ roadmap, onGenerate, busy = false }: {
  roadmap: RoadmapResponse | null;
  onGenerate?: () => void;
  busy?: boolean;
}) {
  if (!roadmap || roadmap.currentWeek?.plan) return null;
  return <div className="plain-empty" role="status">
    <strong>{roadmap.configured ? "Bu hafta için plan gerekli." : "Plan kurulumu gerekli."}</strong>
    <p>{roadmap.configured
      ? "Haftalık plan yalnızca sen istediğinde oluşturulur. Zamanını ve aktif kaynaklarını kontrol et."
      : "Seçimlerin kaydedildi. İlk P48 planı henüz kurulmadı; bu sayfa açıldığında seçimlerin değiştirilmez."}</p>
    <Link to="/onboarding">Kurulumu gözden geçir</Link>
    {roadmap.configured && !roadmap.weekGenerationReadiness?.ready && <p>Plan için uygun ders, aktif kaynak ve pozitif haftalık kapasite gerekli.</p>}
    {roadmap.configured && roadmap.weekGenerationReadiness?.ready && (onGenerate
      ? <button type="button" disabled={busy} onClick={onGenerate}>{busy ? "Oluşturuluyor…" : "Haftalık Planı Oluştur"}</button>
      : <Link to="/week">Haftalık planı oluştur</Link>)}
  </div>;
}
