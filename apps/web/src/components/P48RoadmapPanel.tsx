import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
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

interface ResourceForecast {
  resourceId: string;
  resourceName: string;
  plannedMinutes: number;
  actualMinutes: number;
  progressPercent: number;
  remainingMinutes: number;
  forecastFinishDate: string | null;
  completed: boolean;
  publisher?: string | null;
  resourceType?: string | null;
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

interface Milestone { type: string; date: string; endDate: string | null; title: string; subjectName: string | null }

interface RoadmapResponse {
  configured: boolean;
  strategy?: { scoreType: string; targetExamDate: string; weeklyTargetMinutes: number; monthlyTargetMinutes: number; sourceNote: string; daysToExam: number };
  subjectForecasts?: SubjectForecast[];
  months?: MonthSummary[];
  periods?: Array<{ name: string; periodType: string; startDate: string; endDate: string; capacityMultiplier: number | null }>;
  milestones?: Milestone[];
  currentWeek?: { plan: { id: string; week_start_date: string; week_end_date: string; available_minutes: number; planned_minutes: number } | null; tasks: ApiTask[] };
  resourcesSummary?: { count: number; totalPlannedMinutes: number; totalActualMinutes: number; progressPercent: number };
}

const DAY_NAMES = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const WORK_MODES: Record<string, string> = { video: "Video", book: "Konu çalışması", notes: "Not çalışması", questions: "Soru çözümü", mock: "Deneme", review: "Tekrar", other: "Çalışma" };
const RESOURCE_TYPES: Record<string, string> = { question_bank: "Soru bankası", video_course: "Video kurs", book: "Konu anlatımı", notes: "Notlar", mock_book: "Deneme kitabı", other: "Kaynak" };

const minutesLabel = (minutes: number) => `${Math.floor(minutes / 60)}s ${minutes % 60}dk`;
const isoToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
const addDays = (value: string, days: number) => { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };
const dateLabel = (value: string, year = false) => new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
const errorText = (error: unknown) => error instanceof AppApiError ? (FRIENDLY_API_ERRORS[error.code] ?? error.message) : error instanceof Error ? error.message : "Yol haritası yüklenemedi.";
const taskName = (task: ApiTask) => task.title.split(" · ").at(-1) || task.title;

function milestoneLabel(type: string) {
  if (type === "academic_gap") return "Akademik ara";
  if (type === "new_resource") return "Yeni kaynak";
  if (type === "exam") return "Sınav";
  return "Takvim notu";
}

export function P48RoadmapPanel() {
  const [roadmap, setRoadmap] = useState<RoadmapResponse | null>(null);
  const [selectedDate, setSelectedDate] = useState(isoToday());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attemptedWeek, setAttemptedWeek] = useState(false);

  const load = useCallback(async () => {
    try {
      const value = await callAppApi<RoadmapResponse>("/p48/roadmap");
      setRoadmap(value);
      setError(null);
      if (value.currentWeek?.plan) {
        const today = isoToday();
        setSelectedDate(today >= value.currentWeek.plan.week_start_date && today <= value.currentWeek.plan.week_end_date ? today : value.currentWeek.plan.week_start_date);
      }
      return value;
    } catch (caught) {
      setError(errorText(caught));
      return null;
    } finally { setLoading(false); }
  }, []);

  const bootstrap = useCallback(async () => {
    setBusy(true);
    try {
      const response = await callAppApi<{ roadmap: RoadmapResponse }>("/p48/bootstrap", { method: "POST" });
      setRoadmap(response.roadmap);
      setError(null);
      window.dispatchEvent(new Event("kpss:profile-changed"));
      window.dispatchEvent(new Event("kpss:execution-changed"));
    } catch (caught) { setError(errorText(caught)); }
    finally { setBusy(false); }
  }, []);

  const ensureWeek = useCallback(async () => {
    setBusy(true);
    try {
      await callAppApi("/p48/week/generate", { method: "POST" });
      await load();
      window.dispatchEvent(new Event("kpss:execution-changed"));
    } catch (caught) { setError(errorText(caught)); }
    finally { setBusy(false); }
  }, [load]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!roadmap || loading || busy) return;
    if (!roadmap.configured) { void bootstrap(); return; }
    if (!roadmap.currentWeek?.plan && !attemptedWeek) { setAttemptedWeek(true); void ensureWeek(); }
  }, [roadmap, loading, busy, attemptedWeek, bootstrap, ensureWeek]);
  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener("kpss:execution-changed", refresh);
    return () => window.removeEventListener("kpss:execution-changed", refresh);
  }, [load]);

  const milestonesByMonth = useMemo(() => {
    const result = new Map<string, Milestone[]>();
    for (const item of roadmap?.milestones ?? []) result.set(item.date.slice(0, 7), [...(result.get(item.date.slice(0, 7)) ?? []), item]);
    return result;
  }, [roadmap]);

  if (loading) return <section className="roadmap-loading"><div className="loading-line wide-line" /><div className="loading-card" /></section>;
  if (!roadmap?.configured) return <section className="roadmap-setup"><span className="target-orbit"><Icon name="target" size={32} /></span><div><span className="section-kicker">KPSSP48 · 2027</span><h2>Yol haritan hazırlanıyor.</h2><p>Gerçek kaynaklar, haftalık kapasite ve okul sınavları tek takvimde buluşacak.</p></div><button className="primary-action" type="button" disabled={busy} onClick={() => void bootstrap()}>{busy ? "Hazırlanıyor…" : "Planı Hazırla"}</button>{error && <p className="state-message error">{error}</p>}</section>;

  const strategy = roadmap.strategy!;
  const summary = roadmap.resourcesSummary!;
  const plan = roadmap.currentWeek?.plan;
  const tasks = (roadmap.currentWeek?.tasks ?? []).filter((task) => task.status !== "cancelled");
  const weekStart = plan?.week_start_date ?? isoToday();
  const weekDates = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const selectedTasks = tasks.filter((task) => task.planned_date === selectedDate);
  const selectedMinutes = selectedTasks.reduce((sum, task) => sum + task.estimated_minutes, 0);

  return <>
    <section className="week-section page-enter" id="week" aria-labelledby="week-title">
      <div className="section-heading week-heading"><div><span className="section-kicker">BU HAFTA</span><h2 id="week-title">Yedi gün, tek ritim.</h2><p>Bir güne dokun; o günün gerçek çalışma bloklarını gör.</p></div><div className="editorial-stat"><strong>{minutesLabel(tasks.reduce((sum, task) => sum + task.estimated_minutes, 0))}</strong><span>/ {minutesLabel(strategy.weeklyTargetMinutes)} hedef</span></div></div>
      {error && <div className="state-message error" role="alert"><Icon name="warning" />{error}<button type="button" onClick={() => void load()}>Tekrar dene</button></div>}
      <div className="week-planner">
        <div className="week-tabs" role="tablist" aria-label="Haftanın günleri">
          {weekDates.map((date, index) => {
            const dayTasks = tasks.filter((task) => task.planned_date === date);
            const dayMinutes = dayTasks.reduce((sum, task) => sum + task.estimated_minutes, 0);
            return <button role="tab" aria-selected={selectedDate === date} className={`${selectedDate === date ? "active" : ""} ${date === isoToday() ? "today" : ""}`} type="button" key={date} onClick={() => setSelectedDate(date)}><span>{DAY_NAMES[index]}</span><strong>{new Date(`${date}T12:00:00Z`).getUTCDate()}</strong><small>{dayMinutes ? `${Math.round(dayMinutes / 60 * 10) / 10}s` : "—"}</small>{dayTasks.length > 0 && <i />}</button>;
          })}
        </div>
        <div className="selected-day" role="tabpanel">
          <header><div><span>{dateLabel(selectedDate)}</span><h3>{selectedTasks.length ? `${selectedTasks.length} çalışma bloğu` : "Sakin bir gün"}</h3></div><strong>{selectedMinutes ? minutesLabel(selectedMinutes) : "Plan yok"}</strong></header>
          <div className="day-task-list">
            {selectedTasks.map((task) => {
              const actual = task.task_progress?.[0]?.actual_study_minutes ?? 0;
              const complete = task.status === "completed";
              return <article className={complete ? "complete" : ""} key={task.id}><span className="subject-monogram">{(task.subjects?.name ?? "K").slice(0, 1)}</span><div><span>{task.subjects?.name ?? "Ders"}</span><h4>{task.resources?.name ?? taskName(task)}</h4><p>{task.work_mode ? WORK_MODES[task.work_mode] ?? "Çalışma" : task.description ?? "Çalışma"}</p></div><div className="day-task-time"><strong>{task.estimated_minutes}</strong><span>dk</span>{actual > 0 && <small>{actual} dk işlendi</small>}</div>{complete && <Icon name="check" className="complete-mark" />}</article>;
            })}
            {!selectedTasks.length && <div className="quiet-empty"><Icon name="calendar" /><div><strong>Bu gün için çalışma görevi yok.</strong><p>Plan boş bırakılmış veya haftalık program henüz tamamlanmamış olabilir.</p></div></div>}
          </div>
        </div>
      </div>
    </section>

    <section className="roadmap-section" id="roadmap" aria-labelledby="roadmap-title">
      <div className="roadmap-intro">
        <div><span className="section-kicker">SINAVA KADAR</span><h2 id="roadmap-title">Yol önünde.<br />Sistem arkanda.</h2><p>Kaynakların, okul takvimin ve çalışma hızın değiştikçe bu yol haritası da seninle birlikte güncellenir.</p></div>
        <div className="countdown"><strong>{strategy.daysToExam}</strong><span>gün kaldı</span><small>{dateLabel(strategy.targetExamDate, true)}</small></div>
      </div>
      <div className="roadmap-context"><span><b>{minutesLabel(strategy.weeklyTargetMinutes)}</b> normal hafta</span><span><b>{minutesLabel(strategy.monthlyTargetMinutes)}</b> normal ay</span><span><b>{summary.count}</b> gerçek kaynak</span></div>
      <div className="living-timeline">
        {(roadmap.months ?? []).map((month, index) => {
          const milestones = milestonesByMonth.get(month.month) ?? [];
          return <article className={`timeline-month ${month.blockedDays ? "has-gap" : ""}`} key={month.month} style={{ "--delay": `${Math.min(index, 8) * 35}ms` } as CSSProperties}>
            <div className="timeline-axis"><i /><span /></div>
            <div className="month-date"><strong>{month.label}</strong><span>{month.phase}</span></div>
            <div className="month-body"><div className="month-hours"><strong>{minutesLabel(month.plannedMinutes)}</strong><span>plan</span></div><p>{month.focus}</p>{month.blockedDays > 0 && <span className="gap-pill"><Icon name="calendar" />{month.blockedDays} gün okul sınavı</span>}{!!month.focusResources?.length && <div className="month-resources">{month.focusResources.map((resource) => <span key={resource}>{resource}</span>)}</div>}
              {milestones.map((milestone) => <div className={`timeline-event ${milestone.type}`} key={`${milestone.type}-${milestone.date}-${milestone.title}`}><span>{milestoneLabel(milestone.type)}</span><strong>{milestone.title}</strong><small>{milestone.endDate ? `${dateLabel(milestone.date)} – ${dateLabel(milestone.endDate)}` : dateLabel(milestone.date)}</small></div>)}
            </div>
          </article>;
        })}
      </div>
      <p className="roadmap-note"><Icon name="spark" />Vize ve final tarihleri tahmini akademik boşluklardır; kesin takvim geldiğinde güncellenmelidir. Hedef sınav tarihi pilot varsayımdır.</p>
    </section>

    <section className="resources-section" id="resources" aria-labelledby="resources-title">
      <div className="section-heading resource-heading"><div><span className="section-kicker">KAYNAKLAR</span><h2 id="resources-title">İlk havuzun nereye gidiyor?</h2><p>Her kaynak, gerçek çalışma sürene göre yeniden hesaplanan bir bitiş tahmini taşır.</p></div><div className="editorial-stat"><strong>%{summary.progressPercent}</strong><span>havuz ilerlemesi</span></div></div>
      <div className="subject-resource-list">
        {(roadmap.subjectForecasts ?? []).map((subject) => <article className="subject-resource" key={subject.subjectId}>
          <header><div><span className="subject-index">{String((roadmap.subjectForecasts ?? []).findIndex((item) => item.subjectId === subject.subjectId) + 1).padStart(2, "0")}</span><div><h3>{subject.subjectName}</h3><p>{minutesLabel(subject.weeklyMinutes)} / hafta</p></div></div>{subject.newSourceDate && <span className="new-source-date"><Icon name="spark" />{dateLabel(subject.newSourceDate)} · yeni kaynak</span>}</header>
          <div className="resource-rows">{subject.resources.map((resource) => <div className="resource-row" key={resource.resourceId}><div className="resource-name"><span>{RESOURCE_TYPES[resource.resourceType ?? ""] ?? "Kaynak"}</span><strong>{resource.resourceName}</strong><small>{resource.publisher || "Yayıncı bilgisi yok"}</small></div><div className="resource-progress"><div><i style={{ width: `${resource.progressPercent}%` }} /></div><span>%{resource.progressPercent}</span></div><div className="resource-finish"><span>Tahmini bitiş</span><strong>{resource.completed ? "Tamamlandı" : resource.forecastFinishDate ? dateLabel(resource.forecastFinishDate, true) : "Sınava kadar"}</strong></div></div>)}</div>
        </article>)}
      </div>
    </section>
  </>;
}
