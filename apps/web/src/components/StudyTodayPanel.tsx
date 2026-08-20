import { useCallback, useEffect, useMemo, useState, type CSSProperties, type PointerEvent } from "react";
import { useRoadmap } from "../hooks/useRoadmap";
import { callAppApi } from "../lib/app-api";
import { mergeMovableTaskOrder, moveTaskId } from "../lib/today-task-order";
import { activeStudyElapsedMinutes } from "../lib/study-session-timer";
import { compactMinutesLabel, taskName, WORK_MODE_LABELS, type RoadmapTask } from "../lib/roadmap";
import { CoachDrawer, type CoachDrawerMode } from "./CoachDrawer";
import { QuickAddTaskDrawer } from "./QuickAddTaskDrawer";
import { TaskActionPreviewDrawer } from "./TaskActionPreviewDrawer";
import type { TaskActionPreviewAction } from "../lib/task-action-preview-ui";
import { Icon } from "./Icon";
import { ResourceDetailDrawer, type ResourceDetailTab } from "./ResourceDetailDrawer";
import type { ResourcePageProgress, ResourceProgressResponse } from "../lib/resource-progress-ui";
import {
  defaultTaskMaterialTab,
  taskMaterialResource,
} from "../lib/today-material-actions";

interface ActiveSession { id: string; task_id: string | null; started_at: string; tasks: { title: string } | null }
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

interface TaskMaterialActionsProps {
  readonly task: RoadmapTask;
  readonly onOpen: (task: RoadmapTask, tab?: ResourceDetailTab) => void;
  readonly compact?: boolean;
}

function TaskMaterialActions({
  task,
  onOpen,
  compact = false,
}: TaskMaterialActionsProps) {
  const available = Boolean(taskMaterialResource(task));
  const unavailableTitle = available ? undefined : "Bu göreve bağlı kaynak yok.";

  return <div className={`today-material-actions ${compact ? "is-compact" : ""}`}>
    <button
      type="button"
      disabled={!available}
      title={unavailableTitle}
      onClick={() => onOpen(task)}
    >
      <strong>Kaynakla çalış</strong>
      {!compact && <span>Bağlı materyali aç</span>}
    </button>
    <button
      type="button"
      disabled={!available}
      title={unavailableTitle}
      onClick={() => onOpen(task, "video")}
    >
      <strong>Video izle</strong>
      {!compact && <span>Video sekmesine geç</span>}
    </button>
    <button
      type="button"
      disabled={!available}
      title={unavailableTitle}
      onClick={() => onOpen(task, "page")}
    >
      <strong>Sayfa gir</strong>
      {!compact && <span>Sayfa ilerlemesini güncelle</span>}
    </button>
  </div>;
}
export function StudyTodayPanel() {
  const { data: roadmap } = useRoadmap({ ensureWeek: true });
  const [tasks, setTasks] = useState<RoadmapTask[]>([]);
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
  const [coachOpen, setCoachOpen] = useState(false);
  const [coachMode, setCoachMode] = useState<CoachDrawerMode>("default");
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
  const [materialRequest, setMaterialRequest] = useState<{
    resource: NonNullable<ReturnType<typeof taskMaterialResource>>;
    tab: ResourceDetailTab;
  } | null>(null);
  const [materialPageProgress, setMaterialPageProgress] = useState<ResourcePageProgress | null>(null);

  const load = useCallback(async () => {
    try {
      let [planResult, activeResult, summaryResult] = await Promise.all([
        callAppApi<{ tasks: RoadmapTask[] }>("/weekly-plan/current"),
        callAppApi<ActiveSessionResponse>("/study-sessions/active"),
        callAppApi<Summary>("/execution/summary"),
      ]);
      if (summaryResult.dailyPlan?.deferredTaskCount > 0) {
        try {
          await callAppApi("/plans/current/recalculate", { method: "POST", body: { trigger: "capacity_change" } });
          [planResult, summaryResult] = await Promise.all([
            callAppApi<{ tasks: RoadmapTask[] }>("/weekly-plan/current"),
            callAppApi<Summary>("/execution/summary"),
          ]);
        } catch (caught) {
          console.error("TODAY_CAPACITY_REPAIR_FAILED", caught);
        }
      }
      setTasks((planResult.tasks ?? []).filter((task) => task.status !== "cancelled"));
      setActive(activeResult.session);
      setActiveBreak(activeResult.break ?? null);
      setPaused(Boolean(activeResult.paused));
      setClosedBreakSeconds(Math.max(0, Number(activeResult.closedBreakSeconds ?? 0)));
      setSummary({ ...summaryResult, dailyPlan: summaryResult.dailyPlan ?? EMPTY_DAILY_PLAN });
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
  const dailyMinutes = useMemo(() => new Map(summary.dailyPlan.tasks.map((task) => [task.id, task.minutes])), [summary.dailyPlan.tasks]);
  const dailyTaskIds = useMemo(() => new Set([...dailyMinutes.keys(), ...summary.dailyPlan.completedTaskIds]), [dailyMinutes, summary.dailyPlan.completedTaskIds]);
  const todayTasks = useMemo(() => tasks.filter((task) => dailyTaskIds.has(task.id)), [dailyTaskIds, tasks]);
  const focusTask = recommendation?.task;
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
  const openTaskMaterial = (task: RoadmapTask, requestedTab?: ResourceDetailTab) => {
    const resource = taskMaterialResource(task);
    if (!resource) return;

    setOpenTaskMenuId(null);
    setMaterialPageProgress(null);
    setMaterialRequest({
      resource,
      tab: requestedTab ?? defaultTaskMaterialTab(task),
    });

    void callAppApi<ResourceProgressResponse>(
      `/resources/${resource.resourceId}/progress`,
    )
      .then((payload) => setMaterialPageProgress(payload.progress))
      .catch(() => setMaterialPageProgress(null));
  };
  const todayPlanned = summary.dailyPlan.totalCommittedMinutes;
  const activePlanned = active?.task_id ? dailyMinutes.get(active.task_id) ?? 0 : 0;
  const formattedDate = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const animatedDays = useAnimatedNumber(roadmap?.strategy?.daysToExam ?? 0);
  const animatedPlannedMinutes = useAnimatedNumber(todayPlanned);

  return <section className="today-page page-frame">
    <header className="page-header today-page-header">
      <div><span className="page-eyebrow">Bugün</span><h1>{formattedDate}</h1></div>
      <div className="today-header-side"><div className="today-editorial-stats"><div><strong className="settling-number">{roadmap?.strategy ? animatedDays : "—"}</strong><span>gün kaldı</span></div><div><strong className="settling-number">{compactMinutesLabel(animatedPlannedMinutes)}</strong><span>bugün</span></div></div><button className="today-quick-add-trigger" type="button" onClick={() => setQuickAddOpen(true)}><span aria-hidden="true">＋</span><strong>Görev Ekle</strong></button><button className="today-capacity-trigger" type="button" onClick={() => { setCoachMode("capacity"); setCoachOpen(true); }}><span>Vaktim Değişti</span></button><button className="today-coach-trigger" type="button" onClick={() => { setCoachMode("default"); setCoachOpen(true); }}><Icon name="spark" weight="fill" /><span>Koça Yaz</span></button></div>
    </header>

    {error && <div className="inline-state error" role="alert"><span>Veriler yüklenemedi.</span><button type="button" onClick={() => void load()}>Tekrar Dene</button></div>}

    <article className={`focus-now-card ${active ? "is-running" : ""} ${paused ? "is-paused" : ""}`} onPointerMove={moveSpotlight}>
      <div className="focus-spotlight" aria-hidden="true" />
      {loading ? <div className="page-skeleton focus-skeleton"><span /><span /><span /></div> : active ? <div className="focus-state" key="active">
        <div className="focus-status"><i />{paused ? "Moladasın" : "Çalışıyorsun"}</div>
        <div className="focus-main"><span>{active.tasks?.title?.split(" · ")[0] ?? "Çalışma"}</span><h2>{active.tasks?.title ? taskName({ title: active.tasks.title }) : "Aktif çalışma"}</h2></div>
        <div className="active-counters"><div><strong>{elapsed}</strong><span>dk çalışıldı</span></div>{activePlanned > 0 && <div><strong>{Math.max(0, activePlanned - elapsed)}</strong><span>dk kaldı</span></div>}</div>
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
          <button className="focus-action finish" type="button" disabled={busy} onClick={() => void act(() => callAppApi(`/study-sessions/${active.id}/finish`, { method: "POST" }))}><Icon name="stop" weight="fill" />Çalışmayı Bitir</button>
        </div>        {activeTask && <TaskMaterialActions task={activeTask} onOpen={openTaskMaterial} />}
        {paused && <p className="focus-break-note" role="status">Mola süresi çalışma sürene eklenmez.</p>}
      </div> : focusTask ? <div className="focus-state" key="ready">
        <span className="focus-label">Şimdi</span>
        <div className="focus-main"><span>{focusTask.subjects?.name ?? focusTask.title.split(" · ")[0] ?? "Ders"}</span><h2>{taskName(focusTask)}</h2><div className="focus-resource"><p>{focusTask.resources?.name ?? focusTask.description ?? "Kaynak belirtilmedi"}</p></div></div>
        <div className="focus-facts"><span>{focusTask.work_mode ? WORK_MODE_LABELS[focusTask.work_mode] ?? "Çalışma" : "Çalışma"}</span><strong>{recommendation.remainingMinutes} dk</strong></div>
        <p className="focus-reason">{REASON_LABELS[recommendation.reason] ?? REASON_LABELS.default}</p>
        <button className="focus-action" type="button" disabled={busy} onClick={() => void act(() => callAppApi("/study-sessions/start", { method: "POST", body: { taskId: focusTask.id, entrySource: "web" } }))}><Icon name="play" weight="fill" />Çalışmaya Başla</button>        <TaskMaterialActions task={focusTask} onOpen={openTaskMaterial} />
      </div> : <div className="focus-state focus-empty"><span className="focus-label">Şimdi</span><Icon name="check" size={32} /><h2>Sıradaki görev yok.</h2><p>Haftalık plan oluşturulduğunda burada görünecek.</p></div>}
    </article>

    <section className="today-remaining" aria-labelledby="remaining-title">
      <div className="section-bar"><h2 id="remaining-title">Bugünün devamı</h2><span>{pendingTasks.length} görev · {compactMinutesLabel(pendingTasks.reduce((sum, task) => sum + (dailyMinutes.get(task.id) ?? 0), 0))}</span></div>
        {orderSaving && <div className="task-order-status" aria-live="polite">Sıra kaydediliyor…</div>}
        {orderError && <div className="task-order-error" role="alert">{orderError}</div>}
      {loading ? <div className="page-skeleton list-skeleton"><span /><span /><span /></div> : continuationTasks.length ? <div className="editorial-task-list">{continuationTasks.map((task, index) => {
        const completed = task.status === "completed";
        const next = !completed && pendingTasks[0]?.id === task.id;
        return <article
            className={`${completed ? "is-complete" : ""} ${next ? "is-next" : ""} ${draggedTaskId === task.id ? "is-dragging" : ""}`}
            style={{ animationDelay: `${210 + index * 50}ms` } as CSSProperties}
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
        <div className="task-subject"><span>{task.subjects?.name ?? "Ders"}</span><strong>{task.resources?.name ?? taskName(task)}</strong></div>
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
              <strong>Ertele</strong><span>İlk uygun güne taşıma önizlemesi</span>
            </button>
            <button type="button" role="menuitem" onClick={() => previewTaskAction(task, "REMOVE_TODAY")}>
              <strong>Bugünden çıkar</strong><span>Backlog değişikliğini önizle</span>
            </button>
            <button type="button" role="menuitem" onClick={() => previewTaskAction(task, "DURATION_DETAILS")}>
              <strong>Süre detayları</strong><span>Planlanan, tamamlanan ve kalan süre</span>
            </button>            <div className="task-material-menu-divider" aria-hidden="true" />
            <TaskMaterialActions task={task} onOpen={openTaskMaterial} compact />
          </div>}
        </div>
      </article>})}</div> : <div className="plain-empty">Bugün için başka görev yok.</div>}
    </section>

    <div className="today-summary-line"><span>Bugün çalışılan</span><strong>{compactMinutesLabel(summary.todayStudyMinutes)}</strong></div>
          <TaskActionPreviewDrawer
        request={taskActionRequest}
        onClose={() => setTaskActionRequest(null)}
      />
      <ResourceDetailDrawer
        resource={materialRequest?.resource ?? null}
        pageProgress={materialPageProgress}
        initialTab={materialRequest?.tab ?? "page"}
        onClose={() => {
          setMaterialRequest(null);
          setMaterialPageProgress(null);
        }}
        onPageSaved={(progress) => setMaterialPageProgress(progress)}
      />
<QuickAddTaskDrawer open={quickAddOpen} onClose={() => setQuickAddOpen(false)} />
    <CoachDrawer open={coachOpen} mode={coachMode} onClose={() => setCoachOpen(false)} />
  </section>;
}
