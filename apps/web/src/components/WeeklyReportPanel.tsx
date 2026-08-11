import { useEffect, useState } from "react";
import { callAppApi } from "../lib/app-api";

interface WeeklyReport {
  actual_minutes: number;
  planned_minutes: number;
  completed_task_count: number;
  planned_task_count: number;
  question_count: number;
  completed_topic_count: number;
  revision_completed_count: number;
  revision_due_count: number;
  plan_status: "good" | "attention" | "risk";
  explanation: string;
}

const duration = (minutes: number) => `${Math.floor(minutes / 60)}s ${minutes % 60}dk`;
const labels = { good: "İYİ", attention: "DİKKAT", risk: "RİSK" } as const;

export function WeeklyReportPanel() {
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void callAppApi<WeeklyReport>("/reports/weekly/generate", { method: "POST" })
      .then((value) => { if (active) setReport(value); })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Haftalık rapor yüklenemedi."); });
    return () => { active = false; };
  }, []);

  const percent = report && report.planned_minutes > 0 ? Math.min(100, Math.round((report.actual_minutes / report.planned_minutes) * 100)) : 0;

  return <section className="weekly-report-panel panel-card compact-panel">
    <div className="panel-heading"><div><span className="panel-kicker">BU HAFTA</span><h2>Haftalık durum</h2></div>{report && <strong className={`report-status ${report.plan_status}`}>{labels[report.plan_status]}</strong>}</div>
    {error && <p className="error">{error}</p>}
    {!report && !error && <div className="loading-line" />}
    {report && <>
      <div className="weekly-main-stat"><span>Çalışma</span><strong>{duration(report.actual_minutes)}</strong><small>{duration(report.planned_minutes)} planlandı</small></div>
      <div className="weekly-progress"><i style={{ width: `${percent}%` }} /></div>
      <small className="progress-caption">Haftalık planın %{percent}'i</small>
      <div className="weekly-metric-grid">
        <div><span>Görev</span><strong>{report.completed_task_count}/{report.planned_task_count}</strong></div>
        <div><span>Soru</span><strong>{report.question_count}</strong></div>
        <div><span>Konu</span><strong>{report.completed_topic_count}</strong></div>
        <div><span>Tekrar</span><strong>{report.revision_completed_count}/{report.revision_due_count}</strong></div>
      </div>
      <p className="panel-note">{report.explanation}</p>
    </>}
  </section>;
}
