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
  return <section className="weekly-report-panel">
    <div className="toolbar"><h2>BU HAFTA</h2>{report && <strong className={`report-status ${report.plan_status}`}>{labels[report.plan_status]}</strong>}</div>
    {error && <p className="error">{error}</p>}
    {!report && !error && <p>Haftalık özet hazırlanıyor…</p>}
    {report && <>
      <dl className="stats">
        <div><dt>Çalışma</dt><dd>{duration(report.actual_minutes)} / {duration(report.planned_minutes)}</dd></div>
        <div><dt>Görev</dt><dd>{report.completed_task_count} / {report.planned_task_count}</dd></div>
        <div><dt>Soru</dt><dd>{report.question_count}</dd></div>
        <div><dt>Konu</dt><dd>{report.completed_topic_count} tamamlandı</dd></div>
        <div><dt>Tekrar</dt><dd>{report.revision_completed_count} / {report.revision_due_count}</dd></div>
      </dl>
      <p>{report.explanation}</p>
    </>}
  </section>;
}
