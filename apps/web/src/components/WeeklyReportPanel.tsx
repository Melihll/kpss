import { Link } from "react-router-dom";
import { useWeeklyStudyView } from "../hooks/useWeeklyStudyView";
import { fulfillmentLabel, minutesLabel, WEEK_STATUS } from "../lib/weekly-study-view";
import { WeeklyMetrics } from "../pages/WeekPage";

// Same factual GET snapshot as Week; rendering Progress never persists a weekly report.
export function WeeklyReportPanel() {
  const { data, loading, error, retry } = useWeeklyStudyView();
  if (loading) return <p role="status">Haftanın çalışma kayıtları yükleniyor…</p>;
  if (error || !data) return <div className="inline-state error" role="alert"><span>Haftalık çalışma özeti yüklenemedi. Kayıtların korunuyor.</span><button type="button" onClick={() => void retry()}>Tekrar Dene</button><Link to="/week">Haftanı aç</Link></div>;
  return <section className="progress-analysis-section wv-progress-summary" aria-labelledby="weekly-insight-title" data-week-start={data.weekStart}>
    <div className="analysis-section-heading"><div><span>Bu hafta · İstanbul takvimi</span><h2 id="weekly-insight-title">Haftanın özeti</h2></div><Link to={`/week?weekStart=${data.weekStart}`}>Haftanı aç</Link></div>
    <WeeklyMetrics metrics={data.totals} />
    <p className="wv-explainer">Plan karşılığı {fulfillmentLabel(data.totals.planFulfillmentPercent)} · {data.totals.completedTaskCount} / {data.totals.taskCount} görev tamamlandı. Ek çalışma {minutesLabel(data.totals.extraActualMinutes)}; plan kredisiyle aynı değildir. Açık oturumlar bitirilene kadar gerçek süreye eklenmez.</p>
    {data.capacityStatus !== "SUPPORTED" && <p role="status" className="wv-notice">{WEEK_STATUS[data.capacityStatus]}</p>}
    {!!data.dataWarnings.length && <p role="status">Eksik kayıtlar N/A olarak gösteriliyor.</p>}
  </section>;
}
