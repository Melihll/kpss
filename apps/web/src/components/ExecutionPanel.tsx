import { useCallback, useEffect, useState, type FormEvent } from "react";
import { callAppApi, AppApiError, FRIENDLY_API_ERRORS } from "../lib/app-api";
import { supabase } from "../lib/supabase";

const EXECUTION_CHANGED_EVENT = "kpss:execution-changed";

interface ActiveSession { id: string; started_at: string; tasks: { title: string } | null }
interface RecentResult {
  id: string;
  correct_count: number;
  wrong_count: number;
  blank_count: number;
  duration_minutes: number | null;
  accuracy: number;
  review_status: string;
  subjects: { name: string } | null;
  resource_units: { name: string } | null;
}
interface Summary { todayStudyMinutes: number; weekStudyMinutes: number; recentResults: RecentResult[] }
interface PlanTask {
  id: string;
  title: string;
  subject_id: string;
  curriculum_node_id: string | null;
  resource_id: string | null;
  task_type: string;
  task_resource_units: Array<{
    resource_unit_id: string;
    status: string;
    resource_units: { name: string } | null;
  }>;
}
interface CorrectionDraft {
  id: string;
  correct: string;
  wrong: string;
  blank: string;
  duration: string;
}

const label = (minutes: number) => `${Math.floor(minutes / 60)}s ${minutes % 60}dk`;
const message = (error: unknown) => error instanceof AppApiError
  ? (FRIENDLY_API_ERRORS[error.code] ?? error.message)
  : error instanceof Error ? error.message : "İşlem başarısız.";

export function ExecutionPanel() {
  const [active, setActive] = useState<ActiveSession | null>(null);
  const [summary, setSummary] = useState<Summary>({ todayStudyMinutes: 0, weekStudyMinutes: 0, recentResults: [] });
  const [tasks, setTasks] = useState<PlanTask[]>([]);
  const [testTaskId, setTestTaskId] = useState("");
  const [profileId, setProfileId] = useState("");
  const [subjects, setSubjects] = useState<Array<{ id: string; name: string }>>([]);
  const [topics, setTopics] = useState<Array<{ id: string; name: string; subject_id: string }>>([]);
  const [correction, setCorrection] = useState<CorrectionDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [activeResult, summaryResult, planResult] = await Promise.all([
        callAppApi<{ session: ActiveSession | null }>("/study-sessions/active"),
        callAppApi<Summary>("/execution/summary"),
        callAppApi<{ tasks: PlanTask[] }>("/weekly-plan/current"),
      ]);
      const nextTasks = planResult.tasks ?? [];
      setActive(activeResult.session);
      setSummary(summaryResult);
      setTasks(nextTasks);
      setTestTaskId((current) => nextTasks.some((task) => task.id === current && task.task_type === "solve_resource_units")
        ? current
        : nextTasks.find((task) => task.task_type === "solve_resource_units")?.id ?? "");

      const profile = await supabase.from("exam_profiles").select("id").eq("status", "active").maybeSingle();
      if (profile.data) {
        setProfileId(profile.data.id);
        const [userSubjects, curriculum] = await Promise.all([
          supabase.from("user_subjects").select("subject_id,subjects(id,name)").eq("exam_profile_id", profile.data.id),
          supabase.from("curriculum_nodes").select("id,name,subject_id").eq("is_active", true),
        ]);
        setSubjects((userSubjects.data ?? []).map((item: any) => item.subjects).filter(Boolean));
        setTopics((curriculum.data ?? []) as Array<{ id: string; name: string; subject_id: string }>);
      }
    } catch (caught) {
      setError(message(caught));
    }
  }, []);

  useEffect(() => {
    const refresh = () => { void load(); };
    window.addEventListener(EXECUTION_CHANGED_EVENT, refresh);
    void load();
    return () => window.removeEventListener(EXECUTION_CHANGED_EVENT, refresh);
  }, [load]);

  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
      window.dispatchEvent(new Event(EXECUTION_CHANGED_EVENT));
      return true;
    } catch (caught) {
      setError(message(caught));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function recordRetroactive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const saved = await act(() => callAppApi("/study-sessions/retroactive", {
      method: "POST",
      body: {
        taskId: String(fields.get("taskId") || "") || null,
        subjectId: String(fields.get("subjectId") || "") || null,
        curriculumNodeId: String(fields.get("topicId") || "") || null,
        durationMinutes: Number(fields.get("duration")),
        note: String(fields.get("note") || "") || null,
      },
    }));
    if (saved) form.reset();
  }

  async function recordResult(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const task = tasks.find((candidate) => candidate.id === fields.get("taskId"));
    const unit = task?.task_resource_units.find((candidate) => candidate.resource_unit_id === fields.get("unitId"));
    if (!task || !unit) {
      setError("Seçilen test ünitesi bu göreve bağlı değil.");
      return;
    }
    const correct = Number(fields.get("correct"));
    const wrong = Number(fields.get("wrong"));
    const blank = Number(fields.get("blank"));
    const saved = await act(() => callAppApi("/test-results", {
      method: "POST",
      body: {
        taskId: task.id,
        subjectId: task.subject_id,
        curriculumNodeId: task.curriculum_node_id,
        resourceId: task.resource_id,
        resourceUnitId: unit.resource_unit_id,
        correct,
        wrong,
        blank,
        total: correct + wrong + blank,
        durationMinutes: fields.get("duration") ? Number(fields.get("duration")) : null,
        idempotencyKey: crypto.randomUUID(),
      },
    }));
    if (saved) form.reset();
  }

  async function correctResult(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!correction) return;
    const correct = Number(correction.correct);
    const wrong = Number(correction.wrong);
    const blank = Number(correction.blank);
    const saved = await act(() => callAppApi(`/test-results/${correction.id}`, {
      method: "PATCH",
      body: {
        correct,
        wrong,
        blank,
        total: correct + wrong + blank,
        durationMinutes: correction.duration ? Number(correction.duration) : null,
      },
    }));
    if (saved) setCorrection(null);
  }

  const solveTasks = tasks.filter((task) => task.task_type === "solve_resource_units");
  const selectedTestTask = solveTasks.find((task) => task.id === testTaskId);
  const pendingUnits = selectedTestTask?.task_resource_units.filter((unit) => unit.status !== "completed") ?? [];

  return <section className="execution-panel">
    <h2>ÇALIŞMA</h2>
    {error && <p className="error">{error}</p>}
    <dl className="stats">
      <div><dt>BUGÜN ÇALIŞILAN</dt><dd>{label(summary.todayStudyMinutes)}</dd></div>
      <div><dt>BU HAFTA</dt><dd>{label(summary.weekStudyMinutes)}</dd></div>
    </dl>

    {active && <article className="recommendation">
      <h3>AKTİF ÇALIŞMA</h3>
      <strong>{active.tasks?.title ?? "Çalışma"}</strong>
      <p>Başlangıç: {new Date(active.started_at).toLocaleTimeString("tr-TR")}</p>
      <div className="inline-actions">
        <button disabled={busy} onClick={() => void act(() => callAppApi(`/study-sessions/${active.id}/finish`, { method: "POST" }))}>Bitir</button>
        <button disabled={busy} onClick={() => void act(() => callAppApi(`/study-sessions/${active.id}/cancel`, { method: "POST" }))}>İptal</button>
      </div>
    </article>}

    <details>
      <summary>Çalışma Ekle</summary>
      <form className="form-grid" onSubmit={recordRetroactive}>
        <label>Task<select name="taskId"><option value="">Plansız</option>{tasks.map((task) => <option value={task.id} key={task.id}>{task.title}</option>)}</select></label>
        <label>Ders<select name="subjectId"><option value="">Seçin</option>{subjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.name}</option>)}</select></label>
        <label>Konu<select name="topicId"><option value="">Opsiyonel</option>{topics.map((topic) => <option value={topic.id} key={topic.id}>{topic.name}</option>)}</select></label>
        <label>Dakika<input name="duration" type="number" min="1" required /></label>
        <label>Not<input name="note" /></label>
        <button disabled={busy || !profileId}>Kaydet</button>
      </form>
    </details>

    <details>
      <summary>Test Sonucu Gir</summary>
      <form className="form-grid" onSubmit={recordResult}>
        <label>Task<select name="taskId" required value={testTaskId} onChange={(event) => setTestTaskId(event.target.value)}>{solveTasks.map((task) => <option value={task.id} key={task.id}>{task.title}</option>)}</select></label>
        <label>Unit<select name="unitId" required>{pendingUnits.map((unit) => <option value={unit.resource_unit_id} key={unit.resource_unit_id}>{unit.resource_units?.name}</option>)}</select></label>
        <label>Doğru<input name="correct" type="number" min="0" required /></label>
        <label>Yanlış<input name="wrong" type="number" min="0" required /></label>
        <label>Boş<input name="blank" type="number" min="0" required /></label>
        <label>Süre<input name="duration" type="number" min="1" /></label>
        <button disabled={busy || !pendingUnits.length}>Sonucu Kaydet</button>
      </form>
    </details>

    <h3>SON TESTLER</h3>
    {summary.recentResults.map((result) => <article className="task-card" key={result.id}>
      <strong>{result.subjects?.name} — {result.resource_units?.name}</strong>
      <p>{result.correct_count}D {result.wrong_count}Y {result.blank_count}B · Başarı %{(Number(result.accuracy) * 100).toFixed(1)}</p>
      <p>Süre: {result.duration_minutes ? `${result.duration_minutes} dk` : "—"} · Yanlış inceleme: {result.review_status}</p>
      <div className="inline-actions">
        <button disabled={busy} onClick={() => setCorrection({
          id: result.id,
          correct: String(result.correct_count),
          wrong: String(result.wrong_count),
          blank: String(result.blank_count),
          duration: result.duration_minutes ? String(result.duration_minutes) : "",
        })}>Düzelt</button>
        {result.review_status === "pending" && <button disabled={busy} onClick={() => void act(() => callAppApi(`/test-results/${result.id}/review`, { method: "POST" }))}>İnceledim</button>}
      </div>
      {correction?.id === result.id && <form className="form-grid correction-form" onSubmit={correctResult}>
        <label>Doğru<input type="number" min="0" required value={correction.correct} onChange={(event) => setCorrection({ ...correction, correct: event.target.value })} /></label>
        <label>Yanlış<input type="number" min="0" required value={correction.wrong} onChange={(event) => setCorrection({ ...correction, wrong: event.target.value })} /></label>
        <label>Boş<input type="number" min="0" required value={correction.blank} onChange={(event) => setCorrection({ ...correction, blank: event.target.value })} /></label>
        <label>Süre<input type="number" min="1" value={correction.duration} onChange={(event) => setCorrection({ ...correction, duration: event.target.value })} /></label>
        <div className="inline-actions"><button disabled={busy}>Kaydet</button><button type="button" disabled={busy} onClick={() => setCorrection(null)}>Vazgeç</button></div>
      </form>}
    </article>)}

    <div className="inline-actions">
      <button disabled={busy} onClick={() => void act(async () => {
        const token = await callAppApi<{ url: string }>("/messaging/telegram/link-token", { method: "POST" });
        setLink(token.url);
      })}>Telegram'ı Bağla</button>
      {link && <a href={link}>{link}</a>}
    </div>
  </section>;
}
