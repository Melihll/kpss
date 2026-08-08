import { useCallback, useEffect, useMemo, useState } from "react";
import type { TaskStatus } from "@kpss-coach/domain";
import { AppApiError, callAppApi, FRIENDLY_API_ERRORS } from "../lib/app-api";

const EXECUTION_CHANGED_EVENT = "kpss:execution-changed";

interface UnitLink {
  id: string;
  resource_unit_id: string;
  status: "pending" | "completed" | "skipped";
  resource_units: { name: string; unit_type: string; estimated_minutes: number | null } | null;
}

interface ApiTask {
  id: string;
  title: string;
  description: string | null;
  task_type: string;
  planned_date: string | null;
  estimated_minutes: number;
  importance: "core" | "important" | "optional";
  priority_score: number;
  status: TaskStatus;
  task_progress: Array<{ completed_minutes: number }>;
  task_resource_units: UnitLink[];
}

interface ApiPlan {
  id: string;
  available_minutes: number;
  planning_budget_minutes: number;
  planned_minutes: number;
  week_start_date: string;
  week_end_date: string;
  status: string;
}

interface PlanResponse {
  plan: ApiPlan | null;
  tasks: ApiTask[];
  created?: boolean;
}

interface RecommendationResponse {
  task: ApiTask;
  reason: string;
  remainingMinutes: number;
}

function minutesLabel(minutes: number) {
  return `${Math.floor(minutes / 60)}s ${minutes % 60}dk`;
}

function errorMessage(error: unknown) {
  if (error instanceof AppApiError) return FRIENDLY_API_ERRORS[error.code] ?? error.message;
  return error instanceof Error ? error.message : "İşlem tamamlanamadı.";
}

export function PlanningPanel() {
  const [plan, setPlan] = useState<ApiPlan | null>(null);
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [recommendation, setRecommendation] = useState<RecommendationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minutes, setMinutes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const response = await callAppApi<PlanResponse>("/weekly-plan/current");
      setPlan(response.plan);
      setTasks(response.tasks);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const refresh = () => { void load(); };
    window.addEventListener(EXECUTION_CHANGED_EVENT, refresh);
    void load();
    return () => window.removeEventListener(EXECUTION_CHANGED_EVENT, refresh);
  }, [load]);

  async function mutate(action: () => Promise<unknown>, refreshRecommendation = false) {
    setWorking(true);
    setError(null);
    try {
      await action();
      await load();
      window.dispatchEvent(new Event(EXECUTION_CHANGED_EVENT));
      if (refreshRecommendation && recommendation) {
        const next = await callAppApi<RecommendationResponse>("/tasks/next");
        setRecommendation(next);
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setWorking(false);
    }
  }

  async function buildPlan() {
    await mutate(async () => {
      const response = await callAppApi<PlanResponse>("/weekly-plan/build", { method: "POST" });
      setPlan(response.plan);
      setTasks(response.tasks);
    });
  }

  async function recommend() {
    setWorking(true);
    setError(null);
    try {
      setRecommendation(await callAppApi<RecommendationResponse>("/tasks/next"));
    } catch (caught) {
      setRecommendation(null);
      setError(errorMessage(caught));
    } finally {
      setWorking(false);
    }
  }

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
  const todayTasks = useMemo(() => tasks.filter((task) => task.planned_date === today), [tasks, today]);
  const otherTasks = useMemo(() => tasks.filter((task) => task.planned_date !== today), [tasks, today]);

  if (loading) return <section><h2>Bu Hafta</h2><p>Plan yükleniyor…</p></section>;

  function TaskCard({ task }: { task: ApiTask }) {
    const completedMinutes = task.task_progress?.[0]?.completed_minutes ?? 0;
    const units = task.task_resource_units ?? [];
    return <article className="task-card">
      <div className="toolbar"><div><strong>{task.title}</strong><p>{task.description}</p></div><span className={`badge ${task.importance}`}>{task.importance.toUpperCase()}</span></div>
      <p>Tahmini: {task.estimated_minutes} dk · Priority: {task.priority_score} · Durum: {task.status}</p>
      {units.length > 0 && <ul className="unit-list">{units.map((unit) => <li key={unit.id}>
        <span>{unit.resource_units?.name ?? "Unit"} {unit.status === "completed" ? "✓" : "○"}</span>
        {unit.status === "pending" && <button disabled={working} onClick={() => void mutate(() => callAppApi(`/tasks/${task.id}/complete-unit`, { method: "POST", body: { resourceUnitId: unit.resource_unit_id } }), true)}>Tamamla</button>}
      </li>)}</ul>}
      {units.length === 0 && <div className="inline-actions"><label>Tamamlanan dakika<input type="number" min="0" max={task.estimated_minutes} value={minutes[task.id] ?? String(completedMinutes)} onChange={(event) => setMinutes((current) => ({ ...current, [task.id]: event.target.value }))} /></label>
        <button disabled={working} onClick={() => void mutate(() => callAppApi(`/tasks/${task.id}/progress`, { method: "POST", body: { completedMinutes: Number(minutes[task.id] ?? completedMinutes) } }), true)}>İlerlemeyi Kaydet</button></div>}
      <div className="inline-actions">
        {["planned", "ready", "partially_completed", "rescheduled"].includes(task.status) && <button disabled={working} onClick={() => void mutate(() => callAppApi(`/study-sessions/start`, { method: "POST", body: { taskId: task.id } }), true)}>Çalışmaya Başla</button>}
        <button disabled={working || task.status === "completed"} onClick={() => void mutate(() => callAppApi(`/tasks/${task.id}/complete`, { method: "POST" }), true)}>Görevi Tamamla</button>
      </div>
    </article>;
  }

  return <section className="planning-panel">
    <div className="toolbar"><h2>BU HAFTA</h2><button className="primary-action" disabled={working} onClick={() => void recommend()}>ŞİMDİ NE YAPMALIYIM?</button></div>
    {error && <p className="error" role="alert">{error}</p>}
    {recommendation && <article className="recommendation"><h3>Şimdi en mantıklı görev:</h3><strong>{recommendation.task.title}</strong><p>{recommendation.task.description}</p><p>Tahmini kalan: {recommendation.remainingMinutes} dk</p><p>Neden: {recommendation.reason}</p>
      <button disabled={working} onClick={() => void mutate(() => callAppApi(`/study-sessions/start`, { method: "POST", body: { taskId: recommendation.task.id } }), true)}>Çalışmaya Başla</button></article>}
    {!plan && <div><p>Bu hafta için plan henüz oluşturulmadı.</p><button disabled={working} onClick={() => void buildPlan()}>Bu Haftanın Planını Oluştur</button></div>}
    {plan && <>
      <dl className="stats"><div><dt>Haftalık kapasite</dt><dd>{minutesLabel(plan.available_minutes)}</dd></div><div><dt>Planlama bütçesi</dt><dd>{minutesLabel(plan.planning_budget_minutes)}</dd></div><div><dt>Planlanan</dt><dd>{minutesLabel(plan.planned_minutes)}</dd></div><div><dt>Görev</dt><dd>{tasks.length}</dd></div></dl>
      {todayTasks.length > 0 && <><h3>Bugün</h3><div className="task-grid">{todayTasks.map((task) => <TaskCard key={task.id} task={task} />)}</div></>}
      <h3>Bu Hafta</h3><div className="task-grid">{otherTasks.map((task) => <TaskCard key={task.id} task={task} />)}{!otherTasks.length && !todayTasks.length && <p>Plan içinde görev yok.</p>}</div>
    </>}
  </section>;
}
