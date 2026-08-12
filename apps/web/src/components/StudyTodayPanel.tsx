import { useCallback, useEffect, useMemo, useState, type CSSProperties, type PointerEvent } from "react";
import { useRoadmap } from "../hooks/useRoadmap";
import { callAppApi } from "../lib/app-api";
import { compactMinutesLabel, isoToday, taskName, WORK_MODE_LABELS, type RoadmapTask } from "../lib/roadmap";
import { Icon } from "./Icon";

interface ActiveSession { id: string; started_at: string; tasks: { title: string } | null }
interface Recommendation { task: RoadmapTask; reason: string; remainingMinutes: number }
interface Summary { todayStudyMinutes: number; weekStudyMinutes: number }

const REASON_LABELS: Record<string, string> = {
  overdue_important: "Önceliği yükselen bu görevle devam et.",
  continue_partial: "Yarım kalan çalışmaya devam etmek şu an en mantıklı adım.",
  continue_in_progress: "Başladığın çalışmaya devam et.",
  due_revision: "Bu konunun tekrar zamanı geldi.",
  critical_revision: "Geciken tekrarı bugün tamamla.",
  weak_topic: "Bu konu biraz daha çalışma istiyor.",
  important_topic: "Bu görev haftanın öncelikleri arasında.",
  fits_available_window: "Bugünkü zamanına en iyi uyan görev bu.",
  default: "Sıradaki çalışma görevin.",
};

function useAnimatedNumber(target: number, duration = 360) {
  const [value, setValue] = useState(target);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    const startedAt = performance.now();
    const startValue = value;
    const difference = target - startValue;
    let frame = 0;
    const update = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(startValue + difference * eased));
      if (progress < 1) frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [duration, target]);

  return value;
}

export function StudyTodayPanel() {
  const { data: roadmap } = useRoadmap({ ensureWeek: true });
  const [tasks, setTasks] = useState<RoadmapTask[]>([]);
  const [active, setActive] = useState<ActiveSession | null>(null);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [summary, setSummary] = useState<Summary>({ todayStudyMinutes: 0, weekStudyMinutes: 0 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const load = useCallback(async () => {
    try {
      const [planResult, activeResult, summaryResult] = await Promise.all([
        callAppApi<{ tasks: RoadmapTask[] }>("/weekly-plan/current"),
        callAppApi<{ session: ActiveSession | null }>("/study-sessions/active"),
        callAppApi<Summary>("/execution/summary"),
      ]);
      setTasks((planResult.tasks ?? []).filter((task) => task.status !== "cancelled"));
      setActive(activeResult.session);
      setSummary(summaryResult);
      if (!activeResult.session) {
        try { setRecommendation(await callAppApi<Recommendation>("/tasks/next")); }
        catch { setRecommendation(null); }
      } else setRecommendation(null);
      setError(false);
    } catch (caught) {
      console.error("TODAY_LOAD_FAILED", caught);
      setError(true);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!active) { setElapsed(0); return; }
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - new Date(active.started_at).getTime()) / 60_000)));
    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, [active]);

  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      await load();
      window.dispatchEvent(new Event("kpss:execution-changed"));
    } catch (caught) {
      console.error("STUDY_ACTION_FAILED", caught);
      setError(true);
    } finally { setBusy(false); }
  }

  function moveSpotlight(event: PointerEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--spot-x", `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty("--spot-y", `${event.clientY - rect.top}px`);
  }

  const todayTasks = useMemo(() => tasks.filter((task) => task.planned_date === isoToday()), [tasks]);
  const focusTask = recommendation?.task;
  const continuationTasks = todayTasks.filter((task) => task.id !== focusTask?.id && task.title !== active?.tasks?.title);
  const pendingTasks = continuationTasks.filter((task) => task.status !== "completed");
  const todayPlanned = todayTasks.reduce((sum, task) => sum + task.estimated_minutes, 0);
  const activePlanned = tasks.find((task) => task.title === active?.tasks?.title)?.estimated_minutes ?? 0;
  const formattedDate = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const animatedDays = useAnimatedNumber(roadmap?.strategy?.daysToExam ?? 0);
  const animatedPlannedMinutes = useAnimatedNumber(todayPlanned);

  return <section className="today-page page-frame">
    <header className="page-header today-page-header">
      <div><span className="page-eyebrow">Bugün</span><h1>{formattedDate}</h1></div>
      <div className="today-editorial-stats"><div><strong className="settling-number">{roadmap?.strategy ? animatedDays : "—"}</strong><span>gün kaldı</span></div><div><strong className="settling-number">{compactMinutesLabel(animatedPlannedMinutes)}</strong><span>bugün</span></div></div>
    </header>

    {error && <div className="inline-state error" role="alert"><span>Veriler yüklenemedi.</span><button type="button" onClick={() => void load()}>Tekrar Dene</button></div>}

    <article className={`focus-now-card ${active ? "is-running" : ""}`} onPointerMove={moveSpotlight}>
      <div className="focus-spotlight" aria-hidden="true" />
      {loading ? <div className="page-skeleton focus-skeleton"><span /><span /><span /></div> : active ? <div className="focus-state" key="active">
        <div className="focus-status"><i />Çalışıyorsun</div>
        <div className="focus-main"><span>{active.tasks?.title?.split(" · ")[0] ?? "Çalışma"}</span><h2>{active.tasks?.title ? taskName({ title: active.tasks.title }) : "Aktif çalışma"}</h2></div>
        <div className="active-counters"><div><strong>{elapsed}</strong><span>dk çalışıldı</span></div>{activePlanned > 0 && <div><strong>{Math.max(0, activePlanned - elapsed)}</strong><span>dk kaldı</span></div>}</div>
        <button className="focus-action finish" type="button" disabled={busy} onClick={() => void act(() => callAppApi(`/study-sessions/${active.id}/finish`, { method: "POST" }))}><Icon name="stop" weight="fill" />Çalışmayı Bitir</button>
      </div> : focusTask ? <div className="focus-state" key="ready">
        <span className="focus-label">Şimdi</span>
        <div className="focus-main"><span>{focusTask.subjects?.name ?? focusTask.title.split(" · ")[0] ?? "Ders"}</span><h2>{taskName(focusTask)}</h2><div className="focus-resource"><p>{focusTask.resources?.name ?? focusTask.description ?? "Kaynak belirtilmedi"}</p></div></div>
        <div className="focus-facts"><span>{focusTask.work_mode ? WORK_MODE_LABELS[focusTask.work_mode] ?? "Çalışma" : "Çalışma"}</span><strong>{recommendation.remainingMinutes} dk</strong></div>
        <p className="focus-reason">{REASON_LABELS[recommendation.reason] ?? REASON_LABELS.default}</p>
        <button className="focus-action" type="button" disabled={busy} onClick={() => void act(() => callAppApi("/study-sessions/start", { method: "POST", body: { taskId: focusTask.id, entrySource: "web" } }))}><Icon name="play" weight="fill" />Çalışmaya Başla</button>
      </div> : <div className="focus-state focus-empty"><span className="focus-label">Şimdi</span><Icon name="check" size={32} /><h2>Sıradaki görev yok.</h2><p>Haftalık plan oluşturulduğunda burada görünecek.</p></div>}
    </article>

    <section className="today-remaining" aria-labelledby="remaining-title">
      <div className="section-bar"><h2 id="remaining-title">Bugünün devamı</h2><span>{pendingTasks.length} görev · {compactMinutesLabel(pendingTasks.reduce((sum, task) => sum + task.estimated_minutes, 0))}</span></div>
      {loading ? <div className="page-skeleton list-skeleton"><span /><span /><span /></div> : continuationTasks.length ? <div className="editorial-task-list">{continuationTasks.map((task, index) => {
        const completed = task.status === "completed";
        const next = !completed && pendingTasks[0]?.id === task.id;
        return <article className={`${completed ? "is-complete" : ""} ${next ? "is-next" : ""}`} style={{ animationDelay: `${210 + index * 50}ms` } as CSSProperties} key={task.id}>
        <span className="task-number">{String(index + 1).padStart(2, "0")}</span>
        <div className="task-subject"><span>{task.subjects?.name ?? "Ders"}</span><strong>{task.resources?.name ?? taskName(task)}</strong></div>
        <span className="task-mode">{task.work_mode ? WORK_MODE_LABELS[task.work_mode] ?? "Çalışma" : "Çalışma"}</span>
        <strong className="task-minutes">{completed ? <Icon name="check" weight="bold" /> : <>{task.estimated_minutes}<small>dk</small></>}</strong>
      </article>})}</div> : <div className="plain-empty">Bugün için başka görev yok.</div>}
    </section>

    <div className="today-summary-line"><span>Bugün çalışılan</span><strong>{compactMinutesLabel(summary.todayStudyMinutes)}</strong></div>
  </section>;
}
