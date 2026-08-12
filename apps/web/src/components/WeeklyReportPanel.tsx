import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRoadmap } from "../hooks/useRoadmap";
import { callAppApi } from "../lib/app-api";
import { compactMinutesLabel, WORK_MODE_LABELS } from "../lib/roadmap";

interface WeeklyReport {
  actual_minutes: number;
  planned_minutes: number;
  completed_task_count: number;
  planned_task_count: number;
  question_count: number;
  completed_topic_count: number;
  revision_completed_count: number;
  revision_due_count: number;
}

interface ComparisonRow {
  key: string;
  label: string;
  planned: number;
  actual: number;
}

export function WeeklyReportPanel() {
  const { data: roadmap, loading: roadmapLoading, error: roadmapError, retry: retryRoadmap } = useRoadmap();
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [reportError, setReportError] = useState(false);
  const [showAllSubjects, setShowAllSubjects] = useState(false);

  const loadReport = useCallback(async () => {
    try {
      setReport(await callAppApi<WeeklyReport>("/reports/weekly/generate", { method: "POST" }));
      setReportError(false);
    } catch {
      setReportError(true);
    }
  }, []);

  useEffect(() => {
    const refresh = () => void loadReport();
    window.addEventListener("kpss:execution-changed", refresh);
    void loadReport();
    return () => window.removeEventListener("kpss:execution-changed", refresh);
  }, [loadReport]);

  const tasks = useMemo(() => (roadmap?.currentWeek?.tasks ?? []).filter((task) => task.status !== "cancelled"), [roadmap]);
  const actualFor = (task: (typeof tasks)[number]) => task.task_progress?.[0]?.actual_study_minutes ?? 0;

  const comparisons = useMemo(() => {
    const groups = new Map<string, ComparisonRow>();
    for (const task of tasks) {
      const actual = actualFor(task);
      if (actual <= 0) continue;
      const key = task.work_mode ?? "other";
      const row = groups.get(key) ?? { key, label: WORK_MODE_LABELS[key] ?? "Çalışma", planned: 0, actual: 0 };
      row.planned += task.estimated_minutes;
      row.actual += actual;
      groups.set(key, row);
    }
    return [...groups.values()].sort((left, right) => right.actual - left.actual);
  }, [tasks]);

  const subjects = useMemo(() => {
    const groups = new Map<string, { name: string; planned: number; actual: number }>();
    for (const task of tasks) {
      const name = task.subjects?.name ?? "Ders";
      const row = groups.get(name) ?? { name, planned: 0, actual: 0 };
      row.planned += task.estimated_minutes;
      row.actual += actualFor(task);
      groups.set(name, row);
    }
    return [...groups.values()].sort((left, right) => right.actual - left.actual || right.planned - left.planned);
  }, [tasks]);

  const weeklyPercent = report && report.planned_minutes > 0
    ? Math.min(100, Math.round((report.actual_minutes / report.planned_minutes) * 100))
    : 0;
  const comparisonMax = Math.max(1, ...comparisons.flatMap((row) => [row.planned, row.actual]));
  const strongestDifference = comparisons
    .map((row) => ({ ...row, difference: row.actual - row.planned }))
    .filter((row) => Math.abs(row.difference) >= 5)
    .sort((left, right) => Math.abs(right.difference) - Math.abs(left.difference))[0];
  const loading = !report && !reportError || roadmapLoading;
  const error = reportError || roadmapError;
  const subjectsWithData = subjects.filter((subject) => subject.actual > 0);
  const subjectsWithoutData = subjects.length - subjectsWithData.length;
  const visibleSubjects = showAllSubjects ? subjects : subjectsWithData;

  if (loading) return <div className="progress-analysis-skeleton" aria-label="İlerleme verileri yükleniyor"><span /><div /><div /><div /></div>;

  if (error) return <div className="inline-state error progress-load-error" role="alert"><span>İlerleme verileri yüklenemedi.</span><button type="button" onClick={() => { void loadReport(); void retryRoadmap(); }}>Tekrar Dene</button></div>;

  return <div className="weekly-analysis-flow">
    <section className="progress-analysis-section weekly-insight-section" aria-labelledby="weekly-insight-title">
      <div className="analysis-section-heading"><div><span>Bu hafta</span><h2 id="weekly-insight-title">Haftanın özeti</h2></div>{report && report.question_count > 0 && <small>{report.question_count} soru kaydedildi</small>}</div>
      {report ? <>
        <div className="weekly-editorial-summary">
          <div className="weekly-primary-number"><strong className="progress-number-settle">{compactMinutesLabel(report.actual_minutes)}</strong><span>çalışıldı</span></div>
          <dl>
            <div><dt>Planlandı</dt><dd>{compactMinutesLabel(report.planned_minutes)}</dd></div>
            <div><dt>Görev</dt><dd>{report.completed_task_count}<small> / {report.planned_task_count} tamamlandı</small></dd></div>
            <div><dt>Tekrar</dt><dd>{report.revision_due_count}<small> bekliyor</small></dd></div>
          </dl>
        </div>
        <div className="weekly-analysis-progress" role="progressbar" aria-label="Haftalık plan ilerlemesi" aria-valuemin={0} aria-valuemax={100} aria-valuenow={weeklyPercent}><i style={{ "--analysis-progress": `${weeklyPercent}%` } as CSSProperties} /></div>
        <p className="weekly-progress-copy"><span>{compactMinutesLabel(report.actual_minutes)} / {compactMinutesLabel(report.planned_minutes)} plan</span><small>%{weeklyPercent}</small></p>
      </> : <p className="analysis-empty">Henüz çalışma kaydı yok.</p>}
    </section>

    <section className="progress-analysis-section plan-actual-section" aria-labelledby="plan-actual-title">
      <div className="analysis-section-heading"><div><span>Plan — gerçek</span><h2 id="plan-actual-title">Çalışma sürelerin</h2></div></div>
      {comparisons.length ? <>
        <div className="plan-actual-list">{comparisons.map((row) => {
          const difference = row.actual - row.planned;
          return <article key={row.key}>
            <header><strong>{row.label}</strong><span className={difference > 0 ? "is-over" : difference < 0 ? "is-under" : ""}>{difference > 0 ? "+" : ""}{difference} dk</span></header>
            <div className="paired-analysis-bar"><span>Plan</span><div><i style={{ "--bar-size": `${(row.planned / comparisonMax) * 100}%` } as CSSProperties} /></div><b>{row.planned}</b></div>
            <div className="paired-analysis-bar actual"><span>Gerçek</span><div><i style={{ "--bar-size": `${(row.actual / comparisonMax) * 100}%` } as CSSProperties} /></div><b>{row.actual}</b></div>
          </article>;
        })}</div>
        {strongestDifference && <p className="deterministic-insight"><span aria-hidden="true" />{strongestDifference.label} kayıtları planlanandan <strong>{Math.abs(strongestDifference.difference)} dk {strongestDifference.difference > 0 ? "uzun" : "kısa"}</strong>.</p>}
      </> : <p className="analysis-empty">Henüz karşılaştırmak için yeterli çalışma kaydı yok.</p>}
    </section>

    <section className="progress-analysis-section subject-analysis-section" aria-labelledby="subject-analysis-title">
      <div className="analysis-section-heading"><div><span>Dersler</span><h2 id="subject-analysis-title">Bu haftaki dağılım</h2></div></div>
      {subjects.length ? <><div className="subject-analysis-list">{visibleSubjects.map((subject, index) => {
        const percent = subject.planned > 0 ? Math.min(100, Math.round((subject.actual / subject.planned) * 100)) : 0;
        return <article style={{ "--subject-delay": `${index * 35}ms` } as CSSProperties} key={subject.name}>
          <div><strong>{subject.name}</strong><span>{subject.actual > 0 ? `${compactMinutesLabel(subject.actual)} çalışıldı` : "Henüz çalışma kaydı yok"}</span></div>
          <div className="subject-analysis-bar" role="progressbar" aria-label={`${subject.name} plan ilerlemesi`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><i style={{ "--bar-size": `${percent}%` } as CSSProperties} /></div>
          <small>{compactMinutesLabel(subject.planned)} plan</small>
        </article>;
      })}</div>{subjectsWithoutData > 0 && <button className="subject-empty-summary" type="button" aria-expanded={showAllSubjects} onClick={() => setShowAllSubjects((value) => !value)}>{showAllSubjects ? "Kayıtsız dersleri gizle" : `${subjectsWithoutData} derste henüz çalışma kaydı yok`}<span aria-hidden="true">⌄</span></button>}</> : <p className="analysis-empty">Bu hafta için ders dağılımı oluşmadı.</p>}
    </section>
  </div>;
}
