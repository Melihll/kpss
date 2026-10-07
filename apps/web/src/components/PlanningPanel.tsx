import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppApiError, callAppApi, FRIENDLY_API_ERRORS } from "../lib/app-api";
import { Icon } from "./Icon";

const EXECUTION_CHANGED_EVENT = "kpss:execution-changed";

interface ApiTask {
  id: string;
  subject_id: string;
  resource_id: string | null;
  title: string;
  description: string | null;
  planned_date: string | null;
  estimated_minutes: number;
  work_mode: WorkMode | null;
  status: string;
  source_reason: string;
  subjects?: { name: string } | null;
  resources?: { name: string; resource_type: string } | null;
  task_progress: Array<{ completed_minutes: number; actual_study_minutes: number }>;
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

interface PlanResponse { plan: ApiPlan | null; tasks: ApiTask[] }
interface RecommendationResponse { task: ApiTask; reason: string; remainingMinutes: number }
interface PlanOptions {
  weekStartDate: string;
  weekEndDate: string;
  availableMinutes: number;
  subjects: Array<{ id: string; name: string; sortOrder: number }>;
  resources: Array<{ id: string; subject_id: string; name: string; resource_type: string }>;
}

type WorkMode = "video" | "book" | "notes" | "questions" | "mock" | "review" | "other";
interface DraftBlock {
  key: string;
  plannedDate: string;
  subjectId: string;
  workMode: WorkMode;
  resourceId: string;
  detail: string;
  estimatedMinutes: string;
}

const WORK_MODES: Array<{ value: WorkMode; label: string }> = [
  { value: "video", label: "Video" },
  { value: "book", label: "Kaynak kitap" },
  { value: "notes", label: "Not" },
  { value: "questions", label: "Soru çözümü" },
  { value: "mock", label: "Deneme" },
  { value: "review", label: "Tekrar" },
  { value: "other", label: "Diğer" },
];

const REASON_LABELS: Record<string, string> = {
  overdue_important: "Önemli görev gecikmeye açık olduğu için öne çıktı.",
  continue_partial: "Yarım kalan çalışmayı bitirmek en verimli seçenek.",
  continue_in_progress: "Başladığın çalışmaya devam etmek en verimli seçenek.",
  due_revision: "Tekrar zamanı geldi.",
  critical_revision: "Gecikmiş tekrar unutma riskini artırıyor.",
  weak_topic: "Zayıf görünen konuya odaklanmak daha yüksek getiri sağlıyor.",
  important_topic: "Haftalık plandaki yüksek etkili görevlerden biri.",
  fits_available_window: "Şu anki zamanına en iyi uyan görev.",
  default: "Kalan süre ve önceliklere göre şu an en değerli seçenek bu.",
};

const DAY_LABELS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

function minutesLabel(minutes: number) {
  return `${Math.floor(minutes / 60)}s ${minutes % 60}dk`;
}

function errorMessage(error: unknown) {
  if (error instanceof AppApiError) return FRIENDLY_API_ERRORS[error.code] ?? error.message;
  return error instanceof Error ? error.message : "İşlem tamamlanamadı.";
}

function addDays(dateString: string, days: number) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dayLabel(date: string, weekStart: string) {
  const diff = Math.round((new Date(`${date}T12:00:00Z`).getTime() - new Date(`${weekStart}T12:00:00Z`).getTime()) / 86_400_000);
  const short = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00Z`));
  return `${DAY_LABELS[Math.max(0, Math.min(6, diff))]} · ${short}`;
}

function varianceText(task: ApiTask) {
  const actual = task.task_progress?.[0]?.actual_study_minutes ?? 0;
  if (!actual) return null;
  const diff = actual - task.estimated_minutes;
  if (task.status !== "completed") return `${actual} dk çalışıldı`;
  if (diff > 5) return `${diff} dk planın üstünde`;
  if (diff < -5) return `${Math.abs(diff)} dk daha hızlı`;
  return "Planla uyumlu";
}

// Mirrors the existing whole-week replacement's protected-history rule.
function isReplaceable(task: ApiTask) {
  return ["planned", "ready", "rescheduled"].includes(task.status) &&
    !(task.task_progress?.[0]?.completed_minutes || task.task_progress?.[0]?.actual_study_minutes);
}

export function PlanningPanel({ initialDate, initialResourceId, compact = false }: { initialDate?: string; initialResourceId?: string; compact?: boolean } = {}) {
  const initialized = useRef(false);
  const [editingDate, setEditingDate] = useState(initialDate ?? "");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [plan, setPlan] = useState<ApiPlan | null>(null);
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [options, setOptions] = useState<PlanOptions | null>(null);
  const [draft, setDraft] = useState<DraftBlock[]>([]);
  const [recommendation, setRecommendation] = useState<RecommendationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  useEffect(() => { setReviewOpen(false); }, [draft]);

  const load = useCallback(async () => {
    try {
      const [planResponse, optionResponse] = await Promise.all([
        callAppApi<PlanResponse>("/weekly-plan/current"),
        callAppApi<PlanOptions>("/weekly-plan/options"),
      ]);
      setPlan(planResponse.plan);
      setTasks(planResponse.tasks.filter((task) => task.status !== "cancelled"));
      setOptions(optionResponse);
      setError(null);
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

  useEffect(() => {
    if (!options || initialized.current) return;
    initialized.current = true;
    const manualTasks = tasks.filter((task) => task.source_reason === "manual" && task.planned_date && isReplaceable(task));
    const resource = options.resources.find((item) => item.id === initialResourceId);
    if (manualTasks.length) {
      const blocks = manualTasks.map((task) => ({
        key: crypto.randomUUID(),
        plannedDate: task.planned_date!,
        subjectId: task.subject_id,
        workMode: task.work_mode ?? "other",
        resourceId: task.resource_id ?? "",
        detail: task.description?.replace(/^Kaynak:\s*[^·]+(?:·\s*)?/, "") ?? "",
        estimatedMinutes: String(task.estimated_minutes),
      }));
      if (resource) blocks.push({ key: crypto.randomUUID(), plannedDate: initialDate ?? options.weekStartDate, subjectId: resource.subject_id, workMode: resource.resource_type === "video_course" ? "video" : "book", resourceId: resource.id, detail: "", estimatedMinutes: "30" });
      setDraft(blocks);
      return;
    }
    const subjectId = resource?.subject_id ?? options.subjects[0]?.id ?? "";
    setDraft([{ key: crypto.randomUUID(), plannedDate: initialDate ?? options.weekStartDate, subjectId, workMode: resource && resource.resource_type !== "video_course" ? "book" : "video", resourceId: resource?.id ?? "", detail: "", estimatedMinutes: "60" }]);
  }, [options, tasks, initialResourceId, initialDate]);

  async function savePlan() {
    if (!options) return;
    const validBlocks = draft.filter((block) => block.subjectId && Number(block.estimatedMinutes) > 0);
    if (!validBlocks.length) {
      setError("Haftaya en az bir çalışma ekle.");
      return;
    }
    setWorking(true);
    setError(null);
    setSavedNotice(null);
    try {
      const response = await callAppApi<PlanResponse>("/weekly-plan/manual", {
        method: "POST",
        body: {
          blocks: validBlocks.map((block) => ({
            plannedDate: block.plannedDate,
            subjectId: block.subjectId,
            workMode: block.workMode,
            resourceId: block.resourceId || null,
            detail: block.detail,
            estimatedMinutes: Number(block.estimatedMinutes),
          })),
        },
      });
      setPlan(response.plan);
      setTasks(response.tasks.filter((task) => task.status !== "cancelled"));
      setSavedNotice("Haftalık plan kaydedildi.");
      setReviewOpen(false);
      window.dispatchEvent(new Event(EXECUTION_CHANGED_EVENT));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setWorking(false);
    }
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

  function addBlock(date?: string) {
    if (!options) return;
    setDraft((current) => [...current, {
      key: crypto.randomUUID(),
      plannedDate: date ?? options.weekStartDate,
      subjectId: options.subjects[0]?.id ?? "",
      workMode: "video",
      resourceId: "",
      detail: "",
      estimatedMinutes: "60",
    }]);
  }

  function updateBlock(key: string, patch: Partial<DraftBlock>) {
    setDraft((current) => current.map((block) => block.key === key ? { ...block, ...patch } : block));
  }

  const totalDraftMinutes = useMemo(() => draft.reduce((sum, block) => sum + (Number(block.estimatedMinutes) || 0), 0), [draft]);
  const replacedTasks = tasks.filter(isReplaceable);
  const preservedTasks = tasks.filter((task) => !isReplaceable(task) && !["cancelled", "missed"].includes(task.status));
  const preservedMinutes = preservedTasks.reduce((sum, task) => sum + task.estimated_minutes, 0);
  const plannedMinutes = totalDraftMinutes + preservedMinutes;
  const groupedTasks = useMemo(() => {
    const byDate = new Map<string, ApiTask[]>();
    for (const task of tasks.filter((item) => item.planned_date && item.status !== "cancelled")) {
      const list = byDate.get(task.planned_date!) ?? [];
      list.push(task);
      byDate.set(task.planned_date!, list);
    }
    return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [tasks]);

  if (loading) return <section className="planning-panel panel-card loading-panel"><div className="loading-line wide-line"/><div className="loading-line"/><div className="loading-card"/></section>;

  return <section className={`planning-panel panel-card pilot-plan-panel ${compact ? "is-compact-editor" : ""}`}>
    <div className="panel-heading">
      <div><span className="panel-kicker">HAFTALIK PLAN</span><h2>Çalışmaları düzenle</h2><p>Gün, kaynak ve süreyi değiştir; kaydetmeden önce haftanın tamamını incele.</p></div>
      {options && <span className="status-pill good">Kapasite {minutesLabel(options.availableMinutes)}</span>}
    </div>

    {error && <p className="error" role="alert">{error}</p>}
    {savedNotice && <p className="success-note">{savedNotice}</p>}

    {options && <div className="weekly-builder">
      <div className="week-day-shortcuts">
        {DAY_LABELS.map((label, index) => {
          const date = addDays(options.weekStartDate, index);
          const minutes = draft.filter((block) => block.plannedDate === date).reduce((sum, block) => sum + (Number(block.estimatedMinutes) || 0), 0);
          return <button type="button" key={date} className={`day-shortcut ${editingDate === date ? "active" : ""}`} onClick={() => compact ? setEditingDate(date) : addBlock(date)}><strong>{label.slice(0, 3)}</strong><span>{minutes ? minutesLabel(minutes) : "—"}</span></button>;
        })}
      </div>

      <div className="plan-block-list">
        {draft.filter((block) => !compact || !editingDate || block.plannedDate === editingDate).map((block, index) => {
          const resources = options.resources.filter((resource) => resource.subject_id === block.subjectId);
          return <article className="plan-block-row" key={block.key}>
            <span className="block-index">{index + 1}</span>
            <label>Gün<select value={block.plannedDate} onChange={(event) => updateBlock(block.key, { plannedDate: event.target.value })}>{DAY_LABELS.map((label, dayIndex) => { const date = addDays(options.weekStartDate, dayIndex); return <option value={date} key={date}>{label}</option>; })}</select></label>
            <label>Ders<select value={block.subjectId} onChange={(event) => updateBlock(block.key, { subjectId: event.target.value, resourceId: "" })}>{options.subjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.name}</option>)}</select></label>
            <label>Çalışma<select value={block.workMode} onChange={(event) => updateBlock(block.key, { workMode: event.target.value as WorkMode })}>{WORK_MODES.map((mode) => <option value={mode.value} key={mode.value}>{mode.label}</option>)}</select></label>
            <label>Kaynak<select value={block.resourceId} onChange={(event) => updateBlock(block.key, { resourceId: event.target.value })}><option value="">Kaynak seçme</option>{resources.map((resource) => <option value={resource.id} key={resource.id}>{resource.name}</option>)}</select></label>
            <label className="detail-field">Ne çalışacaksın?<input value={block.detail} onChange={(event) => updateBlock(block.key, { detail: event.target.value })} placeholder="Örn. Temel Kavramlar / Test 1" /></label>
            <label className="minute-field">Süre<input type="number" min="10" max="480" step="5" value={block.estimatedMinutes} onChange={(event) => updateBlock(block.key, { estimatedMinutes: event.target.value })} /></label>
            <button type="button" className="remove-block" aria-label="Çalışmayı kaldır" onClick={() => setDraft((current) => current.filter((item) => item.key !== block.key))}>×</button>
          </article>;
        })}
      </div>

      <div className="builder-footer">
        <button type="button" className="ghost-action" onClick={() => addBlock(editingDate || undefined)}><span>＋</span> Çalışma ekle</button>
        <div className="builder-total"><span>Planlanan</span><strong>{minutesLabel(plannedMinutes)}</strong><small>/ {minutesLabel(options.availableMinutes)} kapasite</small></div>
        <button type="button" className="primary-action" disabled={working || totalDraftMinutes <= 0 || plannedMinutes > options.availableMinutes} onClick={() => setReviewOpen(true)}><Icon name="calendar" />Değişiklikleri incele</button>
      </div>
      {plannedMinutes > options.availableMinutes && <p className="capacity-warning">Plan kapasiteni {minutesLabel(plannedMinutes - options.availableMinutes)} aşıyor. Birkaç süreyi azalt.</p>}
      {reviewOpen && <section className="manual-plan-review" aria-label="Haftalık plan değişiklikleri"><h3>Haftanın yeni dağılımı</h3><p>Bu işlem haftanın bekleyen tüm çalışmalarını aşağıdaki taslakla değiştirir. Başlamış ve tamamlanmış çalışmalar korunur.</p>
        {replacedTasks.length > 0 && <details open><summary>Yerine taslağın kaydedileceği {replacedTasks.length} çalışma</summary><ul>{replacedTasks.map((task) => <li key={task.id}>{task.title} · {task.planned_date} · {task.estimated_minutes} dk</li>)}</ul></details>}
        <div>{DAY_LABELS.map((label, index) => { const date = addDays(options.weekStartDate, index); const before = tasks.filter((task) => task.planned_date === date && !["cancelled", "missed"].includes(task.status)).reduce((sum, task) => sum + task.estimated_minutes, 0); const after = draft.filter((block) => block.plannedDate === date).reduce((sum, block) => sum + Number(block.estimatedMinutes), 0) + preservedTasks.filter((task) => task.planned_date === date).reduce((sum, task) => sum + task.estimated_minutes, 0); return <p key={date}><span>{label}</span><strong>{before} → {after} dk</strong></p>; })}</div><button className="secondary-action" type="button" disabled={working} onClick={() => setReviewOpen(false)}>Düzenlemeye dön</button><button className="primary-action" type="button" disabled={working} onClick={() => void savePlan()}>{working ? "Kaydediliyor…" : "Haftayı onayla ve kaydet"}</button></section>}
    </div>}

    {!compact && plan && <div className="saved-week-plan">
      <div className="subsection-heading"><div><span className="panel-kicker">AKTİF PLAN</span><h3>Telegram'ın kullanacağı hafta</h3></div><span>{tasks.filter((task) => task.status !== "cancelled").length} görev · {minutesLabel(tasks.filter((task) => task.status !== "cancelled").reduce((sum, task) => sum + task.estimated_minutes, 0))}</span></div>
      <div className="week-day-plan-grid">
        {groupedTasks.map(([date, dayTasks]) => <article className="day-plan-card" key={date}>
          <div className="day-plan-head"><strong>{dayLabel(date, plan.week_start_date)}</strong><span>{minutesLabel(dayTasks.reduce((sum, task) => sum + task.estimated_minutes, 0))}</span></div>
          <div className="day-plan-tasks">{dayTasks.map((task) => {
            const actual = task.task_progress?.[0]?.actual_study_minutes ?? 0;
            const variance = varianceText(task);
            return <div className={`day-plan-task ${task.status === "completed" ? "done" : ""}`} key={task.id}>
              <div><strong>{task.title}</strong><span>Plan {task.estimated_minutes} dk{actual ? ` · Gerçek ${actual} dk` : ""}</span></div>
              {variance && <em>{variance}</em>}
            </div>;
          })}</div>
        </article>)}
      </div>
    </div>}

    {!compact && <article className={`recommendation hero-recommendation compact-coach-card ${recommendation ? "has-task" : "empty"}`}>
      <div className="recommendation-visual"><span className="target-orbit"><Icon name="target" /></span></div>
      {recommendation ? <>
        <div className="recommendation-copy"><span className="eyebrow">TELEGRAM İLE AYNI SIRADAKİ GÖREV</span><h3>{recommendation.task.title}</h3><p>{REASON_LABELS[recommendation.reason] || REASON_LABELS.default}</p><div className="recommendation-chips"><span><Icon name="timer" />Kalan <strong>{recommendation.remainingMinutes} dk</strong></span></div></div>
        <div className="recommendation-actions"><button className="secondary-action" disabled={working} onClick={() => void recommend()}>Yenile</button></div>
      </> : <>
        <div className="recommendation-copy"><span className="eyebrow">KONTROL NOKTASI</span><h3>Planı kaydet, sonra Telegram'dan test et.</h3><p>/bugun ve /simdi bu aktif haftalık planı okuyacak. Çalışma süren plana göre kısa veya uzun çıkarsa kalan günler yeniden düzenlenecek.</p></div>
        <div className="recommendation-actions"><button className="secondary-action" disabled={working || !plan} onClick={() => void recommend()}><Icon name="spark" />Sıradaki Görevi Kontrol Et</button></div>
      </>}
    </article>}
  </section>;
}
