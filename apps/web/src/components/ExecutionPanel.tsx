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

  return <section className="execution-panel panel-card">
    <div className="panel-heading">
      <div><span className="panel-kicker">ÇALIŞMA MERKEZİ</span><h2>Çalışma & test kayıtları</h2><p>Aktif oturumunu yönet, dışarıda yaptığın çalışmayı ekle ve test sonuçlarını kaydet.</p></div>
      {active && <span className="live-pill"><i /> Çalışma aktif</span>}
    </div>
    {error && <p className="error">{error}</p>}

    <div className="execution-summary-grid">
      <article className="execution-stat"><span className="stat-icon purple-dot">◷</span><div><small>BUGÜN ÇALIŞILAN</small><strong>{label(summary.todayStudyMinutes)}</strong><span>Bugünkü toplam odak süresi</span></div></article>
      <article className="execution-stat"><span className="stat-icon blue-dot">↗</span><div><small>BU HAFTA</small><strong>{label(summary.weekStudyMinutes)}</strong><span>Haftalık biriken çalışma</span></div></article>
    </div>

    {active && <article className="active-session-card">
      <div className="active-session-orb"><span /></div>
      <div><span className="eyebrow">AKTİF ÇALIŞMA</span><h3>{active.tasks?.title ?? "Çalışma"}</h3><p>{new Date(active.started_at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })} itibarıyla odaktasın.</p></div>
      <div className="inline-actions active-session-actions">
        <button className="primary-action" disabled={busy} onClick={() => void act(() => callAppApi(`/study-sessions/${active.id}/finish`, { method: "POST" }))}>Çalışmayı Bitir</button>
        <button className="ghost-action" disabled={busy} onClick={() => void act(() => callAppApi(`/study-sessions/${active.id}/cancel`, { method: "POST" }))}>İptal</button>
      </div>
    </article>}

    <div className="quick-entry-grid">
      <details className="soft-details action-details">
        <summary><span><b>＋</b><span><strong>Çalışma Ekle</strong><small>Sonradan çalışma kaydet</small></span></span></summary>
        <form className="form-grid" onSubmit={recordRetroactive}>
          <label>Görev<select name="taskId"><option value="">Plansız</option>{tasks.map((task) => <option value={task.id} key={task.id}>{task.title}</option>)}</select></label>
          <label>Ders<select name="subjectId"><option value="">Seçin</option>{subjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.name}</option>)}</select></label>
          <label>Konu<select name="topicId"><option value="">Opsiyonel</option>{topics.map((topic) => <option value={topic.id} key={topic.id}>{topic.name}</option>)}</select></label>
          <label>Dakika<input name="duration" type="number" min="1" required /></label>
          <label>Not<input name="note" placeholder="Kısa not (opsiyonel)" /></label>
          <button className="primary-action" disabled={busy || !profileId}>Çalışmayı Kaydet</button>
        </form>
      </details>

      <details className="soft-details action-details">
        <summary><span><b>✓</b><span><strong>Test Sonucu Gir</strong><small>Net ve doğruluğu kaydet</small></span></span></summary>
        <form className="form-grid" onSubmit={recordResult}>
          <label>Görev<select name="taskId" required value={testTaskId} onChange={(event) => setTestTaskId(event.target.value)}>{solveTasks.map((task) => <option value={task.id} key={task.id}>{task.title}</option>)}</select></label>
          <label>Test<select name="unitId" required>{pendingUnits.map((unit) => <option value={unit.resource_unit_id} key={unit.resource_unit_id}>{unit.resource_units?.name}</option>)}</select></label>
          <label>Doğru<input name="correct" type="number" min="0" required /></label>
          <label>Yanlış<input name="wrong" type="number" min="0" required /></label>
          <label>Boş<input name="blank" type="number" min="0" required /></label>
          <label>Süre<input name="duration" type="number" min="1" placeholder="dk" /></label>
          <button className="primary-action" disabled={busy || !pendingUnits.length}>Sonucu Kaydet</button>
        </form>
      </details>
    </div>

    <div className="subsection-heading results-heading"><div><span className="panel-kicker">SON TESTLER</span><h3>Yakın dönem sonuçları</h3></div><span>{summary.recentResults.length} kayıt</span></div>
    <div className="recent-results-list">
      {summary.recentResults.map((result) => <article className="result-row" key={result.id}>
        <div className="result-subject-icon">{(result.subjects?.name ?? "K").slice(0, 1)}</div>
        <div className="result-main"><strong>{result.subjects?.name ?? "Ders"} — {result.resource_units?.name ?? "Test"}</strong><span>{result.duration_minutes ? `${result.duration_minutes} dk` : "Süre yok"} · Yanlış inceleme: {result.review_status === "reviewed" ? "tamamlandı" : "bekliyor"}</span></div>
        <div className="result-numbers"><span><b>{result.correct_count}</b>D</span><span><b>{result.wrong_count}</b>Y</span><span><b>{result.blank_count}</b>B</span></div>
        <span className={`accuracy-pill ${Number(result.accuracy) >= .75 ? "good" : Number(result.accuracy) >= .6 ? "attention" : "risk"}`}>%{(Number(result.accuracy) * 100).toFixed(0)}</span>
        <div className="result-actions"><button className="text-button" disabled={busy} onClick={() => setCorrection({ id: result.id, correct: String(result.correct_count), wrong: String(result.wrong_count), blank: String(result.blank_count), duration: result.duration_minutes ? String(result.duration_minutes) : "" })}>Düzelt</button>{result.review_status === "pending" && <button className="text-button" disabled={busy} onClick={() => void act(() => callAppApi(`/test-results/${result.id}/review`, { method: "POST" }))}>İnceledim</button>}</div>
        {correction?.id === result.id && <form className="form-grid correction-form" onSubmit={correctResult}>
          <label>Doğru<input type="number" min="0" required value={correction.correct} onChange={(event) => setCorrection({ ...correction, correct: event.target.value })} /></label>
          <label>Yanlış<input type="number" min="0" required value={correction.wrong} onChange={(event) => setCorrection({ ...correction, wrong: event.target.value })} /></label>
          <label>Boş<input type="number" min="0" required value={correction.blank} onChange={(event) => setCorrection({ ...correction, blank: event.target.value })} /></label>
          <label>Süre<input type="number" min="1" value={correction.duration} onChange={(event) => setCorrection({ ...correction, duration: event.target.value })} /></label>
          <div className="inline-actions"><button className="primary-action" disabled={busy}>Kaydet</button><button className="ghost-action" type="button" disabled={busy} onClick={() => setCorrection(null)}>Vazgeç</button></div>
        </form>}
      </article>)}
      {!summary.recentResults.length && <div className="empty-inline">Henüz test sonucu yok. İlk sonucu girdiğinde burada görünecek.</div>}
    </div>

    <div className="telegram-connect-row"><div><strong>Telegram ile birlikte kullan</strong><span>Web ve Telegram çalışma kayıtların aynı profilde senkron kalır.</span></div><button className="secondary-action" disabled={busy} onClick={() => void act(async () => { const token = await callAppApi<{ url: string }>("/messaging/telegram/link-token", { method: "POST" }); setLink(token.url); })}>Telegram'ı Bağla</button>{link && <a className="telegram-link" href={link}>Bağlantıyı aç →</a>}</div>
  </section>;
}
