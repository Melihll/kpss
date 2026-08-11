import { useCallback, useEffect, useMemo, useState } from "react";
import { AppApiError, callAppApi, FRIENDLY_API_ERRORS } from "../lib/app-api";
import { Icon } from "./Icon";

interface ApiTask {
  id: string;
  title: string;
  description: string | null;
  planned_date: string | null;
  estimated_minutes: number;
  status: string;
  work_mode: string | null;
  subjects?: { name: string } | null;
  resources?: { name: string; resource_type: string } | null;
  task_progress?: Array<{ completed_minutes: number; actual_study_minutes: number }>;
}

interface CurrentWeek {
  plan: { id: string; week_start_date: string; week_end_date: string; available_minutes: number; planned_minutes: number } | null;
  tasks: ApiTask[];
}

interface ResourceForecast {
  resourceId: string;
  resourceName: string;
  plannedMinutes: number;
  actualMinutes: number;
  progressPercent: number;
  remainingMinutes: number;
  forecastFinishDate: string | null;
  completed: boolean;
}

interface SubjectForecast {
  subjectId: string;
  subjectName: string;
  weeklyMinutes: number;
  totalPlannedMinutes: number;
  totalActualMinutes: number;
  newSourceDate: string | null;
  resources: ResourceForecast[];
}

interface MonthSummary {
  month: string;
  label: string;
  plannedMinutes: number;
  blockedDays: number;
  phase: string;
  focus: string;
  focusResources?: string[];
}

interface RoadmapResponse {
  configured: boolean;
  strategy?: {
    scoreType: string;
    targetExamDate: string;
    weeklyTargetMinutes: number;
    monthlyTargetMinutes: number;
    sourceNote: string;
    daysToExam: number;
  };
  subjectForecasts?: SubjectForecast[];
  months?: MonthSummary[];
  periods?: Array<{ name: string; periodType: string; startDate: string; endDate: string; capacityMultiplier: number | null }>;
  milestones?: Array<{ type: string; date: string; endDate: string | null; title: string; subjectName: string | null }>;
  currentWeek?: CurrentWeek;
  resourcesSummary?: { count: number; totalPlannedMinutes: number; totalActualMinutes: number; progressPercent: number };
}

const EXECUTION_CHANGED_EVENT = "kpss:execution-changed";
const PROFILE_CHANGED_EVENT = "kpss:profile-changed";

function minutesLabel(minutes: number) {
  return `${Math.floor(minutes / 60)}s ${minutes % 60}dk`;
}

function dateLabel(date: string) {
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

function shortDate(date: string) {
  return new Intl.DateTimeFormat("tr-TR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

function errorMessage(error: unknown) {
  if (error instanceof AppApiError) return FRIENDLY_API_ERRORS[error.code] ?? error.message;
  return error instanceof Error ? error.message : "P48 planı yüklenemedi.";
}

function groupTasks(tasks: ApiTask[]) {
  const grouped = new Map<string, ApiTask[]>();
  for (const task of tasks.filter((item) => item.planned_date && item.status !== "cancelled")) {
    const list = grouped.get(task.planned_date!) ?? [];
    list.push(task);
    grouped.set(task.planned_date!, list);
  }
  return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function P48RoadmapPanel() {
  const [roadmap, setRoadmap] = useState<RoadmapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attemptedWeek, setAttemptedWeek] = useState(false);

  const load = useCallback(async () => {
    try {
      const value = await callAppApi<RoadmapResponse>("/p48/roadmap");
      setRoadmap(value);
      setError(null);
      return value;
    } catch (caught) {
      setError(errorMessage(caught));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const bootstrap = useCallback(async () => {
    setBusy(true);
    try {
      const response = await callAppApi<{ roadmap: RoadmapResponse }>("/p48/bootstrap", { method: "POST" });
      setRoadmap(response.roadmap);
      setError(null);
      window.dispatchEvent(new Event(PROFILE_CHANGED_EVENT));
      window.dispatchEvent(new Event(EXECUTION_CHANGED_EVENT));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }, []);

  const ensureWeek = useCallback(async () => {
    setBusy(true);
    try {
      await callAppApi("/p48/week/generate", { method: "POST" });
      await load();
      window.dispatchEvent(new Event(EXECUTION_CHANGED_EVENT));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }, [load]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!roadmap || loading || busy) return;
    if (!roadmap.configured) {
      void bootstrap();
      return;
    }
    if (!roadmap.currentWeek?.plan && !attemptedWeek) {
      setAttemptedWeek(true);
      void ensureWeek();
    }
  }, [roadmap, loading, busy, attemptedWeek, bootstrap, ensureWeek]);
  useEffect(() => {
    const refresh = () => { void load(); };
    window.addEventListener(EXECUTION_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(EXECUTION_CHANGED_EVENT, refresh);
  }, [load]);

  const groupedWeek = useMemo(() => groupTasks(roadmap?.currentWeek?.tasks ?? []), [roadmap]);
  const upcomingMilestones = useMemo(() => (roadmap?.milestones ?? []).filter((item) => item.date >= new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date())).slice(0, 8), [roadmap]);

  if (loading || (!roadmap && !error)) {
    return <section className="panel-card p48-roadmap-card"><div className="loading-line wide-line"/><div className="loading-line"/><div className="loading-card"/></section>;
  }

  if (!roadmap?.configured) {
    return <section className="panel-card p48-roadmap-card">
      <div className="p48-setup-state">
        <span className="target-orbit"><Icon name="target" /></span>
        <div><span className="panel-kicker">KPSSP48 · 2027</span><h2>P48 çalışma planı hazırlanıyor.</h2><p>26 gerçek kaynak, haftalık 30 saat ve üniversite sınav boşlukları çalışma takvimine yerleştiriliyor.</p></div>
        <button className="primary-action" disabled={busy} onClick={() => void bootstrap()}>{busy ? "Hazırlanıyor…" : "Planı Hazırla"}</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </section>;
  }

  const strategy = roadmap.strategy!;
  const summary = roadmap.resourcesSummary!;
  const weekTasks = roadmap.currentWeek?.tasks.filter((task) => task.status !== "cancelled") ?? [];
  const weekPlanned = weekTasks.reduce((sum, task) => sum + task.estimated_minutes, 0);

  return <section className="panel-card p48-roadmap-card">
    <div className="p48-hero">
      <div>
        <span className="panel-kicker">KPSSP48 · 2027 YOL HARİTASI</span>
        <h2>6 Eylül 2027'ye kadar çalışma düzeni hazır.</h2>
        <p>Haftalık 30 saatlik tempo; gerçek kaynakların, vize/final boşlukların ve Telegram'dan gelen gerçek çalışma sürelerinin etrafında güncellenir.</p>
      </div>
      <div className="p48-countdown"><strong>{strategy.daysToExam}</strong><span>gün kaldı</span><small>{dateLabel(strategy.targetExamDate)}</small></div>
    </div>

    {error && <p className="error" role="alert">{error}</p>}

    <div className="p48-stat-grid">
      <article><Icon name="timer"/><div><small>Haftalık hedef</small><strong>{minutesLabel(strategy.weeklyTargetMinutes)}</strong><span>Normal hafta</span></div></article>
      <article><Icon name="calendar"/><div><small>Aylık nominal hedef</small><strong>{minutesLabel(strategy.monthlyTargetMinutes)}</strong><span>Vize/final aylarında düşer</span></div></article>
      <article><Icon name="book"/><div><small>Gerçek kaynaklar</small><strong>{summary.count}</strong><span>Yaklaşık {Math.round(summary.totalPlannedMinutes / 60)} saatlik ilk havuz</span></div></article>
      <article><Icon name="chart"/><div><small>Kaynak ilerlemesi</small><strong>%{summary.progressPercent}</strong><span>{minutesLabel(summary.totalActualMinutes)} işlendi</span></div></article>
    </div>

    <div className="p48-section-heading">
      <div><span className="panel-kicker">BU HAFTA</span><h3>Telegram'ın takip edeceği program</h3></div>
      <div className="p48-week-actions"><span>{weekTasks.length} blok · {minutesLabel(weekPlanned)} planlandı{roadmap.currentWeek?.plan ? ` · ${minutesLabel(roadmap.currentWeek.plan.available_minutes)} kullanılabilir` : ""}</span>{!roadmap.currentWeek?.plan && <button className="secondary-action" disabled={busy} onClick={() => void ensureWeek()}>Haftayı Oluştur</button>}</div>
    </div>

    {roadmap.currentWeek?.plan ? <div className="p48-week-grid">
      {groupedWeek.map(([date, tasks]) => <article className="p48-day" key={date}>
        <header><strong>{shortDate(date)}</strong><span>{minutesLabel(tasks.reduce((sum, task) => sum + task.estimated_minutes, 0))}</span></header>
        <div>{tasks.map((task) => {
          const actual = task.task_progress?.[0]?.actual_study_minutes ?? 0;
          return <div className={`p48-week-task ${task.status === "completed" ? "done" : ""}`} key={task.id}>
            <span className="p48-task-dot" />
            <div><strong>{task.title}</strong><small>{task.resources?.name ?? task.description ?? "Plan bloğu"}</small></div>
            <em>{actual ? `${actual}/${task.estimated_minutes} dk` : `${task.estimated_minutes} dk`}</em>
          </div>;
        })}</div>
      </article>)}
    </div> : <div className="p48-gap-state"><Icon name="calendar"/><div><strong>Bu hafta KPSS çalışma bloğu yok.</strong><p>Takvimdeki vize/final boşluğu veya kalan hafta kapasitesi nedeniyle plan boş bırakıldı.</p></div></div>}

    <div className="p48-section-heading month-heading"><div><span className="panel-kicker">AYLIK YOL HARİTASI</span><h3>Sınava kadar hangi ay ne kadar çalışacağız?</h3></div></div>
    <div className="p48-month-strip">
      {(roadmap.months ?? []).map((month) => <article className={`p48-month ${month.blockedDays ? "has-gap" : ""}`} key={month.month}>
        <div className="p48-month-top"><strong>{month.label}</strong>{month.blockedDays > 0 && <span>{month.blockedDays} gün okul sınavı</span>}</div>
        <b>{minutesLabel(month.plannedMinutes)}</b>
        <small>{month.phase}</small>
        <p>{month.focus}</p>
        {!!month.focusResources?.length && <div className="p48-month-resources">{month.focusResources.map((resource) => <span key={resource}>{resource}</span>)}</div>}
      </article>)}
    </div>

    <div className="p48-resource-layout">
      <div>
        <div className="p48-section-heading"><div><span className="panel-kicker">KAYNAK TAKVİMİ</span><h3>Mevcut kitaplar ne zaman bitecek?</h3></div></div>
        <div className="p48-subject-grid">
          {(roadmap.subjectForecasts ?? []).map((subject) => {
            const active = subject.resources.find((resource) => !resource.completed) ?? subject.resources.at(-1);
            const subjectProgress = subject.totalPlannedMinutes > 0 ? Math.min(100, Math.round((subject.totalActualMinutes / subject.totalPlannedMinutes) * 100)) : 0;
            return <article className="p48-subject-card" key={subject.subjectId}>
              <div className="p48-subject-head"><div><strong>{subject.subjectName}</strong><small>{minutesLabel(subject.weeklyMinutes)} / hafta</small></div><span>%{subjectProgress}</span></div>
              <div className="p48-resource-progress"><i style={{ width: `${subjectProgress}%` }} /></div>
              {active && <div className="p48-active-resource"><small>Şu anki kaynak sırası</small><strong>{active.resourceName}</strong><span>{active.forecastFinishDate ? `Tahmini bitiş ${dateLabel(active.forecastFinishDate)}` : "Sınava kadar devam ediyor"}</span></div>}
              {subject.newSourceDate && <div className="p48-new-source"><Icon name="spark"/><span><b>{dateLabel(subject.newSourceDate)}</b> itibarıyla yeni kaynak / deneme zamanı</span></div>}
            </article>;
          })}
        </div>
      </div>

      <aside className="p48-milestone-panel">
        <div className="p48-section-heading"><div><span className="panel-kicker">TAKVİM NOKTALARI</span><h3>Boşluklar & kaynak değişimleri</h3></div></div>
        <div className="p48-timeline">
          {upcomingMilestones.map((milestone, index) => <div className={`p48-milestone ${milestone.type}`} key={`${milestone.type}-${milestone.date}-${index}`}>
            <i /><div><small>{milestone.endDate ? `${dateLabel(milestone.date)} – ${dateLabel(milestone.endDate)}` : dateLabel(milestone.date)}</small><strong>{milestone.title}</strong></div>
          </div>)}
        </div>
        <p className="p48-calendar-note">Vize/final tarihleri tahmini boşluklardır. Üniversitenin kesin akademik takvimi geldiğinde tarihleri güncellemek gerekir. 6 Eylül 2027 de pilot hedef tarihidir.</p>
      </aside>
    </div>
  </section>;
}
