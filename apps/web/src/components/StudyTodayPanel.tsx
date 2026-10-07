import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useLocation } from "react-router-dom";
import { useRoadmap } from "../hooks/useRoadmap";
import { AppApiError, FRIENDLY_API_ERRORS, callAppApi } from "../lib/app-api";
import { mergeMovableTaskOrder, moveTaskId } from "../lib/today-task-order";
import { resolveTodayFocus } from "../lib/today-focus";
import { activeStudyElapsedMinutes } from "../lib/study-session-timer";
import { compactMinutesLabel, taskName, WORK_MODE_LABELS, type RoadmapTask } from "../lib/roadmap";
import type { CoachDrawerEntryContext } from "./CoachDrawer";
import { QuickAddTaskDrawer } from "./QuickAddTaskDrawer";
import { TaskActionPreviewDrawer } from "./TaskActionPreviewDrawer";
import type { TaskActionPreviewAction } from "../lib/task-action-preview-ui";
import { Icon } from "./Icon";
import type { PhysicalFinishCapture } from "../lib/physical-study-finish";
import { PhysicalStudyFinishDialog } from "./PhysicalStudyFinishDialog";
import { ProactiveCoachSurface } from "./ProactiveCoachSurface";
import { TaskMaterialActions, TaskMaterialSummary } from "./TaskMaterialSummary";
import { useTaskMaterialDrawer } from "../hooks/useTaskMaterialDrawer";
import { StudyMaterialWorkspace } from "./StudyMaterialWorkspace";
import type { VideoProgress } from "./VideoPlayerDrawer";
import { taskWithVideoProgress } from "../lib/task-video";

interface ActiveSession {
  id: string;
  task_id: string | null;
  started_at: string;
  tasks: { title: string } | null;
  lifecycle?: "legacy" | "physical_v1";
  physicalCapture?: PhysicalFinishCapture | null;
}
interface ActiveBreak { id: string; session_id: string; started_at: string; ended_at: string | null }
interface ActiveSessionResponse {
  session: ActiveSession | null;
  break?: ActiveBreak | null;
  paused?: boolean;
  closedBreakSeconds?: number;
}
interface Recommendation { task: RoadmapTask; reason: string; remainingMinutes: number }
interface DailyPlanSummary {
  date?: string;
  tasks: Array<{ id: string; minutes: number }>;
  completedTaskIds: string[];
  deferredTaskCount: number;
  deferredMinutes: number;
  capacityMinutes: number;
  remainingCapacityMinutes: number;
  totalMinutes: number;
  totalCommittedMinutes: number;
}
interface Summary { todayStudyMinutes: number; weekStudyMinutes: number; dailyPlan: DailyPlanSummary }

const EMPTY_DAILY_PLAN: DailyPlanSummary = {
  tasks: [], completedTaskIds: [], deferredTaskCount: 0, deferredMinutes: 0,
  capacityMinutes: 0, remainingCapacityMinutes: 0, totalMinutes: 0, totalCommittedMinutes: 0,
};

const REASON_LABELS: Record<string, string> = {
  overdue_important: "Önceliği yükselen bu görevle devam et.",
  continue_partial: "Yarım kalan çalışmaya devam etmek şu an en mantıklı adım.",
  continue_in_progress: "Başladığın çalışmaya devam et.",
  due_revision: "Bu konunun tekrar zamanı geldi.",
  critical_revision: "Geciken tekrarı bugün tamamla.",
  weak_topic: "Bu konu biraz daha çalışma istiyor.",
  important_topic: "Bu görev haftanın öncelikleri arasında.",
  fits_available_window: "Bugünkü zamanına en iyi uyan görev bu.",
  daily_plan_fallback: "Bugünün planındaki sıradaki görev. Çalışmaya devam edebilirsin.",
  default: "Sıradaki çalışma görevin.",
};

function useAnimatedNumber(target: number, duration = 180) {
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

export function StudyTodayPanel({ focus = false, visible = true, onCoach }: { focus?: boolean; visible?: boolean; onCoach: (context: CoachDrawerEntryContext) => void }) {
  const location = useLocation();
  const [visited, setVisited] = useState(visible);
  const [preferredTaskId, setPreferredTaskId] = useState<string | null>(null);
  const requestedId = new URLSearchParams(location.search).get("task");
  useEffect(() => { if (visible) setVisited(true); if (requestedId) setPreferredTaskId(requestedId); }, [visible, requestedId]);
  const { data: roadmap } = useRoadmap({ ensureWeek: true, enabled: visible });
  const [tasks, setTasks] = useState<RoadmapTask[]>([]);
  const onVideoProgress = useCallback((progress: VideoProgress) => {
    setTasks((current) => current.map((task) => taskWithVideoProgress(task, progress)));
  }, []);
  const [active, setActive] = useState<ActiveSession | null>(null);
  const [activeBreak, setActiveBreak] = useState<ActiveBreak | null>(null);
  const [paused, setPaused] = useState(false);
  const [closedBreakSeconds, setClosedBreakSeconds] = useState(0);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [summary, setSummary] = useState<Summary>({ todayStudyMinutes: 0, weekStudyMinutes: 0, dailyPlan: EMPTY_DAILY_PLAN });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [manualContinuationOrder, setManualContinuationOrder] = useState<string[]>([]);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [orderSaving, setOrderSaving] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [openTaskMenuId, setOpenTaskMenuId] = useState<string | null>(null);
  const [taskActionRequest, setTaskActionRequest] = useState<{
    task: RoadmapTask;
    action: TaskActionPreviewAction;
  } | null>(null);
  const [physicalFinishOpen, setPhysicalFinishOpen] = useState(false);
  const [completionNotice, setCompletionNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pageDraft, setPageDraft] = useState("");
  const loadRevision = useRef(0);

  const load = useCallback(async () => {
    const revision = ++loadRevision.current;
    try {
      const [planResult, activeResult, summaryResult] = await Promise.all([
        callAppApi<{ tasks: RoadmapTask[] }>("/weekly-plan/current"),
        callAppApi<ActiveSessionResponse>("/study-sessions/active"),
        callAppApi<Summary>("/execution/summary"),
      ]);
      if (revision !== loadRevision.current) return;
      setTasks((planResult.tasks ?? []).filter((task) => task.status !== "cancelled"));
      setActive(activeResult.session);
      setActiveBreak(activeResult.break ?? null);
      setPaused(Boolean(activeResult.paused));
      setClosedBreakSeconds(Math.max(0, Number(activeResult.closedBreakSeconds ?? 0)));
      setSummary({ ...summaryResult, dailyPlan: summaryResult.dailyPlan ?? EMPTY_DAILY_PLAN });
      if (!activeResult.session) {
        try {
          const next = await callAppApi<Recommendation>("/tasks/next");
          if (revision === loadRevision.current) setRecommendation(next);
        } catch { if (revision === loadRevision.current) setRecommendation(null); }
      } else setRecommendation(null);
      if (revision === loadRevision.current) setError(false);
    } catch (caught) {
      console.error("TODAY_LOAD_FAILED", caught);
      if (revision === loadRevision.current) setError(true);
    } finally { if (revision === loadRevision.current) setLoading(false); }
  }, []);
  const { openTaskMaterial, materialDrawer } = useTaskMaterialDrawer(() => void load());

  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener("kpss:execution-changed", refresh);
    return () => { loadRevision.current++; window.removeEventListener("kpss:execution-changed", refresh); };
  }, [load]);
  useEffect(() => { setPageDraft(active?.physicalCapture ? String(active.physicalCapture.startPageBoundary) : ""); }, [active?.id]);
  useEffect(() => {
    if (visible) return;
    setQuickAddOpen(false); setPhysicalFinishOpen(false); setTaskActionRequest(null); setOpenTaskMenuId(null);
  }, [visible]);
  useEffect(() => {
    if (!active) { setElapsed(0); return; }
    const tick = () => setElapsed(activeStudyElapsedMinutes({
      startedAt: active.started_at,
      nowMs: Date.now(),
      closedBreakSeconds,
      openBreakStartedAt: activeBreak?.started_at ?? null,
    }));
    tick();
    if (paused) return;
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, [active, activeBreak?.started_at, closedBreakSeconds, paused]);

  async function act<T>(action: () => Promise<T>): Promise<T | null> {
    setBusy(true);
    setActionError(null);
    try {
      const result = await action();
      await load();
      window.dispatchEvent(new Event("kpss:execution-changed"));
      return result;
    } catch (caught) {
      console.error("STUDY_ACTION_FAILED", caught);
      setActionError(caught instanceof AppApiError ? FRIENDLY_API_ERRORS[caught.code] ?? "Çalışma kaydedilemedi. Verileri yenileyip tekrar dene." : "İşlem tamamlanamadı. Tekrar dene.");
      return null;
    } finally { setBusy(false); }
  }

  async function finishActive(completedThroughPage?: number) {
    if (!active) return false;
    const result = await act(() => callAppApi<{ outcome?: string }>(`/study-sessions/${active.id}/finish`, {
      method: "POST",
      ...(completedThroughPage === undefined ? {} : { body: { completedThroughPage } }),
    }));
    if (!result) return false;
    setCompletionNotice(result.outcome === "completed_with_evidence"
      ? "Çalışma ve sayfa ilerlemesi kaydedildi."
      : result.outcome === "completed_without_evidence"
        ? "Çalışma süresi kaydedildi; yeni sayfa ilerlemesi olmadığı için hız kanıtı oluşmadı."
        : "Çalışma kaydedildi.");
    setPhysicalFinishOpen(false);
    return true;
  }

  const dailyMinutes = useMemo(() => new Map(summary.dailyPlan.tasks.map((task) => [task.id, task.minutes])), [summary.dailyPlan.tasks]);
  const dailyTaskIds = useMemo(() => new Set([...dailyMinutes.keys(), ...summary.dailyPlan.completedTaskIds]), [dailyMinutes, summary.dailyPlan.completedTaskIds]);
  const todayTasks = useMemo(() => tasks.filter((task) => dailyTaskIds.has(task.id)), [dailyTaskIds, tasks]);
  const resolvedFocus = resolveTodayFocus({
    recommendation,
    todayTasks,
    materialTasks: tasks,
    dailyMinutes,
    hasActiveSession: Boolean(active),
  });
  const requestedTask = !active ? todayTasks.find((task) => task.id === (requestedId ?? preferredTaskId) && task.status !== "completed" && (dailyMinutes.get(task.id) ?? 0) > 0) : null;
  const focusTask = requestedTask ?? resolvedFocus?.task;
  const activeTask = active?.task_id
    ? tasks.find((task) => task.id === active.task_id) ?? null
    : null;
  const baseContinuationTasks = useMemo(
    () => todayTasks.filter((task) => task.id !== focusTask?.id && task.title !== active?.tasks?.title),
    [active?.tasks?.title, focusTask?.id, todayTasks],
  );
  const continuationTasks = useMemo(() => {
    const baseIds = baseContinuationTasks.map((task) => task.id);
    if (manualContinuationOrder.length !== baseIds.length) return baseContinuationTasks;
    const baseSet = new Set(baseIds);
    if (!manualContinuationOrder.every((id) => baseSet.has(id))) return baseContinuationTasks;
    const taskById = new Map(baseContinuationTasks.map((task) => [task.id, task] as const));
    return manualContinuationOrder.map((id) => taskById.get(id)!).filter(Boolean);
  }, [baseContinuationTasks, manualContinuationOrder]);
  const pendingTasks = continuationTasks.filter((task) => task.status !== "completed" && (dailyMinutes.get(task.id) ?? 0) > 0);
  const allDayTasks = useMemo(
    () => tasks.filter((task) => task.planned_date === summary.dailyPlan.date),
    [summary.dailyPlan.date, tasks],
  );

  useEffect(() => {
    setManualContinuationOrder((current) => {
      if (current.length === 0) return current;
      const baseIds = baseContinuationTasks.map((task) => task.id);
      const baseSet = new Set(baseIds);
      const stillValid = current.length === baseIds.length && current.every((id) => baseSet.has(id));
      return stillValid ? current : [];
    });
  }, [baseContinuationTasks]);

  const persistContinuationOrder = async (nextIds: string[], previousIds: string[]) => {
    if (!summary.dailyPlan.date || allDayTasks.length === 0) {
      setOrderError("Bugünün görev sırası henüz hazır değil.");
      return;
    }

    const movableIds = baseContinuationTasks.map((task) => task.id);
    const fullTaskIds = mergeMovableTaskOrder(
      allDayTasks.map((task) => task.id),
      movableIds,
      nextIds,
    );

    setManualContinuationOrder(nextIds);
    setOrderSaving(true);
    setOrderError(null);
    try {
      await callAppApi("/tasks/daily-order", {
        method: "PUT",
        body: { date: summary.dailyPlan.date, taskIds: fullTaskIds },
      });
    } catch {
      setManualContinuationOrder(previousIds);
      setOrderError("Görev sırası kaydedilemedi. Tekrar deneyin.");
    } finally {
      setOrderSaving(false);
      setDraggedTaskId(null);
    }
  };

  const moveContinuationTask = (taskId: string, targetIndex: number) => {
    if (orderSaving) return;
    const previousIds = continuationTasks.map((task) => task.id);
    const nextIds = moveTaskId(previousIds, taskId, targetIndex);
    if (nextIds.every((id, index) => id === previousIds[index])) return;
    void persistContinuationOrder(nextIds, previousIds);
  };

  const previewTaskAction = (task: RoadmapTask, action: TaskActionPreviewAction) => {
    setOpenTaskMenuId(null);
    setTaskActionRequest({ task, action });
  };
  const openTaskMaterialFromToday = (task: RoadmapTask, requestedTab?: "page" | "video") => {
    setOpenTaskMenuId(null);
    openTaskMaterial(task, requestedTab);
  };
  const todayPlanned = summary.dailyPlan.totalCommittedMinutes;
  const todayCompletedTaskCount = summary.dailyPlan.completedTaskIds.length;
  const todayTaskCount = dailyTaskIds.size;
  const activePlanned = active?.task_id ? dailyMinutes.get(active.task_id) ?? 0 : 0;
  const formattedDate = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const animatedDays = useAnimatedNumber(roadmap?.strategy?.daysToExam ?? 0);
  const animatedPlannedMinutes = useAnimatedNumber(todayPlanned);
  const workTask = active ? activeTask : focusTask;

  return <>{!visible && active && <Link className="product-session-return" to="/session"><Icon name="timer" /><span>{active.tasks?.title ? taskName({ title: active.tasks.title }) : "Aktif çalışma"} · {elapsed} dk · {paused ? "Moladasın" : "Çalışıyorsun"}</span><strong>Çalışmaya dön →</strong></Link>}<section hidden={!visible} className={`today-page page-frame ${focus ? "study-focus-page" : ""}`}>
    <header className="page-header today-page-header">
      <div><span className="page-eyebrow">{focus ? "Bugün / Odak" : "Bugün"}</span><h1>{focus ? "Odak" : formattedDate}</h1>{focus && <p>{formattedDate}</p>}</div>
      {!focus && <div className="today-header-side"><div className="today-editorial-stats"><div><strong className="settling-number">{roadmap?.strategy ? animatedDays : "—"}</strong><span>gün kaldı</span></div><div><strong className="settling-number">{compactMinutesLabel(animatedPlannedMinutes)}</strong><span>bugün</span></div></div><button className="today-quick-add-trigger" type="button" aria-label="Görev Ekle" onClick={() => setQuickAddOpen(true)}><span aria-hidden="true">＋</span><strong>Görev Ekle</strong></button><button className="today-capacity-trigger" type="button" onClick={() => onCoach("capacity")}><span>Vaktim Değişti</span></button><button className="today-coach-trigger" type="button" aria-label="Koça Sor" onClick={() => onCoach("general")}><Icon name="user" /><span>Koça Sor</span></button></div>}
    </header>

    {error && <div className="inline-state error" role="alert"><span>Veriler yüklenemedi.</span><button type="button" onClick={() => void load()}>Tekrar Dene</button></div>}
    {completionNotice && <div className="inline-state" role="status"><span>{completionNotice}</span><button type="button" onClick={() => setCompletionNotice(null)}>Kapat</button></div>}
    {actionError && <div className="inline-state error" role="alert">{actionError}<button type="button" onClick={() => { setActionError(null); void load(); }}>Yenile</button></div>}
    {requestedId && active && active.task_id !== requestedId && <div className="inline-state" role="status">Önce açık çalışmanı bitir. Seçtiğin görev daha sonra başlatılabilir.</div>}
    {requestedId && !active && !loading && !error && !requestedTask && <div className="inline-state" role="status">Seçtiğin görev bugünün çalışmaya uygun planında değil. <Link to="/week">Haftam’da incele</Link></div>}

    <article className={`focus-now-card production-workspace ${active ? "is-running" : ""} ${paused ? "is-paused" : ""}`}>
      {loading ? <div className="page-skeleton focus-skeleton"><span /><span /><span /></div> : active ? <div className="focus-state" key="active">
        <div className="workspace-card-top"><span className="focus-label">Şimdi</span>{!focus && <Link to="/session" className="workspace-focus-link"><Icon name="target" size={17} />Odak görünümü</Link>}</div>
        <div className="focus-status"><i />{paused ? "Moladasın" : "Çalışıyorsun"}</div>
        <div className="focus-main"><span>{active.tasks?.title?.split(" · ")[0] ?? "Çalışma"}</span><h2>{active.tasks?.title ? taskName({ title: active.tasks.title }) : "Aktif çalışma"}</h2></div>
        <div className="active-counters"><div><strong>{elapsed}</strong><span>dk çalışıldı</span></div>{activePlanned > 0 && <div><strong>{Math.max(0, activePlanned - elapsed)}</strong><span>dk kaldı</span></div>}</div>
        {activeTask && <TaskMaterialSummary task={activeTask} />}
        <div className="focus-session-actions">
          <button
            className={`focus-action break ${paused ? "resume" : ""}`}
            type="button"
            disabled={busy}
            aria-label={paused ? "Çalışmaya devam et" : "Mola ver"}
            onClick={() => void act(() => callAppApi(`/study-sessions/${active.id}/${paused ? "resume" : "pause"}`, { method: "POST" }))}
          >
            {paused ? <Icon name="play" weight="fill" /> : <span className="pause-glyph" aria-hidden="true">Ⅱ</span>}
            {paused ? "Devam Et" : "Mola Ver"}
          </button>
          <button className="focus-action finish" type="button" disabled={busy} onClick={async () => { if (active.lifecycle === "physical_v1" && active.physicalCapture) { if (!paused) { const result = await act(() => callAppApi(`/study-sessions/${active.id}/pause`, { method: "POST" })); if (!result) return; } setPhysicalFinishOpen(true); } else void finishActive(); }}><Icon name="stop" weight="fill" />Çalışmayı Bitir</button>
        </div>
        {paused && <p className="focus-break-note" role="status">Mola süresi çalışma sürene eklenmez.</p>}
      </div> : focusTask ? <div className="focus-state" key="ready">
        <div className="workspace-card-top"><span className="focus-label">Şimdi</span>{!focus && <Link to="/session" className="workspace-focus-link"><Icon name="target" size={17} />Odak görünümü</Link>}</div>
        <div className="focus-main"><span>{focusTask.subjects?.name ?? focusTask.title.split(" · ")[0] ?? "Ders"}</span><h2>{taskName(focusTask)}</h2><div className="focus-resource"><p>{focusTask.resources?.name ?? focusTask.description ?? "Kaynak belirtilmedi"}</p></div></div>
        <TaskMaterialSummary task={focusTask} />
        <div className="focus-facts"><span>{focusTask.work_mode ? WORK_MODE_LABELS[focusTask.work_mode] ?? "Çalışma" : "Çalışma"}</span><strong>{requestedTask ? dailyMinutes.get(requestedTask.id) ?? 0 : resolvedFocus?.remainingMinutes ?? 0} dk</strong></div>
        <p className="focus-reason">{requestedTask ? "Seçtiğin çalışmadan devam et." : REASON_LABELS[resolvedFocus?.reason ?? "default"] ?? REASON_LABELS.default}</p>
        <button className="focus-action" type="button" disabled={busy} onClick={() => void act(() => callAppApi("/study-sessions/start", { method: "POST", body: { taskId: focusTask.id, entrySource: "web" } }))}><Icon name="play" weight="fill" />{busy ? "Başlatılıyor…" : "Çalışmaya Başla"}</button>
      </div> : <div className="focus-state focus-empty"><span className="focus-label">Şimdi</span><Icon name="check" size={32} /><h2>Sıradaki görev yok.</h2><p>Haftalık plan oluşturulduğunda burada görünecek.</p></div>}
      {workTask && (visited || visible) && <StudyMaterialWorkspace checkpointContext={focus ? "focus" : "today"} key={workTask.id} task={workTask} capture={active?.lifecycle === "physical_v1" ? active.physicalCapture ?? null : null} pageDraft={pageDraft} onPageDraft={setPageDraft} playback={active ? paused ? "paused" : "running" : "ready"} visible={visible} onVideoProgress={onVideoProgress} />}
    </article>

    {!focus && <section className="today-progress-summary" aria-labelledby="today-progress-title">
      <div className="today-progress-copy">
        <span className="page-eyebrow">Bugünün durumu</span>
        <h2 id="today-progress-title">Bugün nasıl gidiyor?</h2>
      </div>

      <dl className="today-progress-metrics">
        <div>
          <dt>Çalışılan</dt>
          <dd>{compactMinutesLabel(summary.todayStudyMinutes)}</dd>
        </div>
        <div>
          <dt>Bugünkü plan</dt>
          <dd>{compactMinutesLabel(todayPlanned)}</dd>
        </div>
        <div>
          <dt>Tamamlanan</dt>
          <dd>{todayCompletedTaskCount}/{todayTaskCount} görev</dd>
        </div>
      </dl>
    </section>}

    {!focus && visible && <ProactiveCoachSurface />}

    <PhysicalStudyFinishDialog
      capture={physicalFinishOpen ? active?.physicalCapture ?? null : null}
      busy={busy}
      onCancel={() => setPhysicalFinishOpen(false)}
      onFinish={finishActive}
      initialBoundary={pageDraft}
    />

    {!focus && <section className="today-remaining" aria-labelledby="remaining-title">
      <div className="section-bar"><h2 id="remaining-title">Bugünün devamı</h2><span>{pendingTasks.length} görev · {compactMinutesLabel(pendingTasks.reduce((sum, task) => sum + (dailyMinutes.get(task.id) ?? 0), 0))}</span></div>
        {orderSaving && <div className="task-order-status" aria-live="polite">Sıra kaydediliyor…</div>}
        {orderError && <div className="task-order-error" role="alert">{orderError}</div>}
      {loading ? <div className="page-skeleton list-skeleton"><span /><span /><span /></div> : continuationTasks.length ? <div className="editorial-task-list">{continuationTasks.map((task, index) => {
        const completed = task.status === "completed";
        const next = !completed && pendingTasks[0]?.id === task.id;
        return <article
            className={`${completed ? "is-complete" : ""} ${next ? "is-next" : ""} ${draggedTaskId === task.id ? "is-dragging" : ""}`}
            style={{ animationDelay: `${Math.min(index, 3) * 35}ms` } as CSSProperties}
            key={task.id}
            draggable={!orderSaving}
            onDragStart={(event) => {
              setDraggedTaskId(task.id);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", task.id);
            }}
            onDragOver={(event) => {
              if (orderSaving) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }}
            onDrop={(event) => {
              event.preventDefault();
              const sourceId = draggedTaskId ?? event.dataTransfer.getData("text/plain");
              const targetIndex = continuationTasks.findIndex((item) => item.id === task.id);
              if (sourceId && targetIndex >= 0) moveContinuationTask(sourceId, targetIndex);
            }}
            onDragEnd={() => setDraggedTaskId(null)}
          >
        <div className="task-order-cell">
            <span className="task-drag-handle" aria-hidden="true">⋮⋮</span>
            <span className="task-number">{String(index + 1).padStart(2, "0")}</span>
            <div className="task-order-buttons" aria-label={`${taskName(task)} sırasını değiştir`}>
              <button type="button" disabled={orderSaving || index === 0} aria-label={`${taskName(task)} görevini yukarı taşı`} onClick={() => moveContinuationTask(task.id, index - 1)}>↑</button>
              <button type="button" disabled={orderSaving || index === continuationTasks.length - 1} aria-label={`${taskName(task)} görevini aşağı taşı`} onClick={() => moveContinuationTask(task.id, index + 1)}>↓</button>
            </div>
          </div>
        <div className="task-subject"><span>{task.subjects?.name ?? "Ders"}</span>{completed ? <strong>{task.resources?.name ?? taskName(task)}</strong> : <Link className="task-study-link" to={`/?task=${task.id}`}><strong>{task.resources?.name ?? taskName(task)}</strong></Link>}</div>
        <span className="task-mode">{task.work_mode ? WORK_MODE_LABELS[task.work_mode] ?? "Çalışma" : "Çalışma"}</span>
        <strong className="task-minutes">{completed ? <Icon name="check" weight="bold" /> : <>{dailyMinutes.get(task.id) ?? 0}<small>dk</small></>}</strong>
        <div className="task-action-menu" onPointerDown={(event) => event.stopPropagation()}>
          <button
            className="task-action-menu-trigger"
            type="button"
            draggable={false}
            aria-label={`${taskName(task)} görev işlemleri`}
            aria-expanded={openTaskMenuId === task.id}
            onClick={() => setOpenTaskMenuId((current) => current === task.id ? null : task.id)}
          >
            ⋯
          </button>
          {openTaskMenuId === task.id && <div className="task-action-menu-popover" role="menu">
            <button type="button" role="menuitem" onClick={() => previewTaskAction(task, "DEFER")}>
              <strong>Ertelemeyi önizle</strong><span>İlk uygun güne taşıma önizlemesi</span>
            </button>
            <button type="button" role="menuitem" onClick={() => previewTaskAction(task, "REMOVE_TODAY")}>
              <strong>Çıkarmayı önizle</strong><span>Backlog değişikliğini önizle</span>
            </button>
            <button type="button" role="menuitem" onClick={() => previewTaskAction(task, "DURATION_DETAILS")}>
              <strong>Süre detayları</strong><span>Planlanan, tamamlanan ve kalan süre</span>
            </button>            <div className="task-material-menu-divider" aria-hidden="true" />
            <TaskMaterialSummary task={task} compact />
            <TaskMaterialActions task={task} onOpen={openTaskMaterialFromToday} compact />
          </div>}
        </div>
      </article>})}</div> : <div className="plain-empty">Bugün için başka görev yok.</div>}
    </section>}


          <TaskActionPreviewDrawer
        request={taskActionRequest}
        onClose={() => setTaskActionRequest(null)}
      />
      {materialDrawer}
      <QuickAddTaskDrawer open={quickAddOpen} onClose={() => setQuickAddOpen(false)} onApplied={() => void load()} />
  </section></>;
}
