import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { supabase } from "../lib/supabase";
import { AppApiError, callAppApi } from "../lib/app-api";
import { FIRST_PLAN_MESSAGES, INITIAL_PLAN_VERSION, currentIstanbulWeek, initialDateLabel, type InitialBlock, type InitialPreview, type InitialReadiness, type InitialResult } from "../lib/initial-manual-plan";
import { WORK_MODE_LABELS, type RoadmapTask } from "../lib/roadmap";
import "./first-plan.css";

type Operation = { operationId: string; [key: string]: unknown };
const friendly = (error: unknown) => error instanceof AppApiError ? FIRST_PLAN_MESSAGES[error.code] ?? "Plan kaydedilemedi. Aynı taslağı tekrar inceleyebilirsin." : "Sunucuya ulaşılamadı. Taslağın bu sekmede korunuyor.";
async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try { return await Promise.race([promise, new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error("TRANSPORT_TIMEOUT")), 25_000); })]); }
  finally { clearTimeout(timer!); }
}

export function FirstPlanPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [profileId, setProfileId] = useState(params.get("profileId") ?? "");
  const [week, setWeek] = useState(currentIstanbulWeek);
  const [ready, setReady] = useState<InitialReadiness | null>(null);
  const [blocks, setBlocks] = useState<InitialBlock[]>([]);
  const [review, setReview] = useState<InitialPreview | null>(null);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [mode, setMode] = useState("");
  const [minutes, setMinutes] = useState("");
  const [detail, setDetail] = useState("");
  const [existingTasks, setExistingTasks] = useState<RoadmapTask[]>([]);
  const revision = useRef(0);
  const source = ready?.resources.find(r => r.id === resourceId);
  const api = useCallback(<T,>(path: string, options: { method?: "GET" | "POST"; body?: unknown } = {}) => callAppApi<T>(path, { ...options, expectedUserId: user?.id }), [user?.id]);
  useEffect(() => {
    if (profileId || !user) return;
    let active = true;
    void supabase.from("exam_profiles").select("id").eq("user_id", user.id).in("status", ["draft", "active"]).order("updated_at", { ascending: false }).limit(1).maybeSingle().then(r => {
      if (!active) return;
      if (r.error || !r.data) { setMessage("Önce sınavını ve derslerini kaydet."); setLoading(false); }
      else setProfileId(r.data.id);
    });
    return () => { active = false; };
  }, [profileId, user]);
  const load = useCallback(async () => {
    if (!profileId) return;
    const requestRevision = ++revision.current;
    setLoading(true);
    try {
      const r = await api<InitialReadiness>(`/initial-plan/readiness?profileId=${profileId}&weekStartDate=${week}`);
      if (r.contractVersion !== INITIAL_PLAN_VERSION || r.capabilityVersion !== 1) throw new AppApiError("INITIAL_PLAN_UNAVAILABLE", "");
      if (requestRevision !== revision.current) return;
      setReady(r);
      if (r.existingPlan) {
        const view = await api<{ supported: boolean; tasks: RoadmapTask[] }>("/initial-plan/today");
        if (requestRevision === revision.current) setExistingTasks(view.supported ? view.tasks : []);
      }
    } catch (e) { if (requestRevision === revision.current) { setReady(null); setMessage(friendly(e)); } }
    finally { if (requestRevision === revision.current) setLoading(false); }
  }, [api, profileId, week]);
  useEffect(() => { void load(); }, [load]);

  function invalidate() { setReview(null); setMessage(null); }
  function addBlock(event: FormEvent) {
    event.preventDefault();
    if (!source || !date || !mode || !/^\d+$/.test(minutes) || Number(minutes) < 1 || Number(minutes) > 480) { setMessage("Günü, kaynağı, çalışma türünü ve tam dakika süresini seç."); return; }
    invalidate();
    setBlocks(current => [...current, { plannedDate: date, subjectId: source.subjectId, resourceId, workMode: mode, estimatedMinutes: Number(minutes), detail }]);
    setDate(""); setResourceId(""); setMode(""); setMinutes(""); setDetail("");
  }
  async function inspect() {
    setBusy(true); setMessage(null); setReview(null);
    try {
      const p = await api<InitialPreview>("/initial-plan/preview", { method: "POST", body: { profileId, weekStartDate: week, blocks } });
      if (p.contractVersion !== INITIAL_PLAN_VERSION || p.capabilityVersion !== 1) throw new AppApiError("INITIAL_PLAN_UNAVAILABLE", "");
      setReady(p); setReview(p);
    } catch (e) { setMessage(friendly(e)); }
    finally { setBusy(false); }
  }
  function success(result: InitialResult) {
    if (!result.weeklyPlanId || !result.taskIds?.length || result.profileId !== profileId) throw new Error("INVALID_ACKNOWLEDGEMENT");
    window.dispatchEvent(new Event("kpss:execution-changed"));
    navigate(`/?initialPlan=${result.weeklyPlanId}`, { replace: true });
  }
  async function createOrRecover() {
    if (!review?.valid && !operation) return;
    const payload: Operation = operation ?? {
      intent: "create_initial_manual_plan", contractVersion: INITIAL_PLAN_VERSION, capabilityVersion: 1,
      profileId, operationId: crypto.randomUUID(), weekStartDate: week,
      expectedConfigurationRevision: review!.configurationRevision, reviewedPayloadHash: review!.reviewedPayloadHash, blocks: review!.blocks,
    };
    setOperation(payload); setBusy(true); setMessage("Planın sonucu doğrulanıyor…");
    try {
      if (operation) {
        const outcome = await bounded(api<{ outcome: string; result: InitialResult | null }>(`/initial-plan/operation?profileId=${profileId}&operationId=${payload.operationId}`));
        if (outcome.outcome === "committed" && outcome.result) { success(outcome.result); return; }
      }
      success(await bounded(api<InitialResult>("/initial-plan/create", { method: "POST", body: payload })));
    } catch (e) {
      if (e instanceof AppApiError && ["FIRST_PLAN_STALE", "REVIEW_PAYLOAD_MISMATCH", "FIRST_PLAN_NOT_READY", "PLAN_ALREADY_EXISTS", "PROTECTED_COMMITMENT_EXISTS", "INITIAL_PLAN_UNAVAILABLE", "INVALID_INITIAL_PLAN_PAYLOAD"].includes(e.code)) {
        setOperation(null); setReview(null); setMessage(friendly(e)); await load();
      } else setMessage(e instanceof AppApiError && e.code === "UNAUTHORIZED" ? FIRST_PLAN_MESSAGES.UNAUTHORIZED! : "İşlemin sonucu henüz kesinleşmedi. Sonucu kontrol et; aynı işlem güvenli biçimde tekrar sorgulanır. Taslağını koruyoruz.");
    } finally { setBusy(false); }
  }

  const totals = blocks.reduce<Record<string, number>>((all, b) => ({ ...all, [b.plannedDate]: (all[b.plannedDate] ?? 0) + b.estimatedMinutes }), {});
  const blockList = (rows: InitialBlock[]) => <ol className="first-plan-blocks">{rows.map((b, i) => {
    const r = ready?.resources.find(s => s.id === b.resourceId);
    return <li key={i}><div><strong>{initialDateLabel(b.plannedDate)} · {b.estimatedMinutes} dk</strong><span>{r?.subjectName ?? "Seçtiğin ders"} · {r?.name ?? "Kaynak artık uygun değil"}</span><span>{WORK_MODE_LABELS[b.workMode]}{b.detail && ` · ${b.detail}`}</span></div>{!review && !operation && <button type="button" aria-label={`${i + 1}. çalışmayı kaldır`} disabled={busy} onClick={() => { invalidate(); setBlocks(current => current.filter((_, n) => n !== i)); }}>Kaldır</button>}</li>;
  })}</ol>;

  return <main className="card wide first-plan-page">
    <header><div><span className="eyebrow">İLK ÇALIŞMA PLANI</span><h1>{ready?.existingPlan ? "Çalışma planın." : "İlk haftanı planlayalım."}</h1><p>Gününü, kaynağını ve süreni sen seç. Kaydettikten sonra Bugün’den devam et.</p></div><Link to="/">Bugün</Link></header>
    {message && <p className="first-plan-message" role="status">{message}{message === FIRST_PLAN_MESSAGES.UNAUTHORIZED && <a href="/login" target="_blank" rel="noopener"> Oturumu yenile</a>}</p>}
    {loading ? <p role="status">Kayıtlı tercihler ve kullanılabilir zaman yükleniyor…</p> : !ready ? <><button type="button" onClick={() => void load()}>Tekrar yükle</button><Link to="/onboarding">Tercihlerini gözden geçir</Link></> : ready.existingPlan ? <section><h2>Planın kayıtlı.</h2><p>{initialDateLabel(ready.existingPlan.week_start_date)} başlayan hafta. Mevcut çalışmaların korunuyor.</p><ul className="first-plan-blocks">{existingTasks.map(t => <li key={t.id}><div><strong>{t.planned_date && initialDateLabel(t.planned_date)} · {t.estimated_minutes} dk</strong><span>{t.subjects?.name} · {t.resources?.name}</span><span>{WORK_MODE_LABELS[t.work_mode ?? "other"]}</span></div></li>)}</ul><Link className="primary-action" to="/">Bugünü aç</Link><Link className="secondary-action" to={`/week?weekStart=${ready.existingPlan.week_start_date}`}>Haftanı aç</Link></section> : <>
      <label>Hangi hafta?<select value={week} disabled={busy || Boolean(operation)} onChange={e => { invalidate(); setWeek(e.target.value); setDate(""); setMessage("Haftayı değiştirdin. Çalışmaların bu sekmede korunuyor; seçtiğin günleri kontrol et."); }}><option value={ready.currentWeek}>Bu hafta · {initialDateLabel(ready.currentWeek)}</option><option value={ready.nextWeek}>Gelecek hafta · {initialDateLabel(ready.nextWeek)}</option></select></label>
      {ready.reasons.map((r, i) => <p className="first-plan-warning" role="status" key={`${r}${i}`}>{FIRST_PLAN_MESSAGES[r] ?? "Bu koşulda ilk plan henüz desteklenmiyor."}</p>)}
      {ready.subjectsWithoutSources.length > 0 && <p>Henüz uygun kaynağı olmayan dersler: {ready.subjectsWithoutSources.map(s => s.name).join(", ")}. Kaynaklı derslerinle devam edebilirsin.</p>}
      <div className="first-plan-links"><Link to="/onboarding">Hedefini ve derslerini düzenle</Link><Link to="/onboarding?step=capacity">Zamanını düzenle</Link><Link to="/onboarding?step=resources">Kaynak ekle</Link><button type="button" disabled={busy || Boolean(operation)} onClick={() => { invalidate(); void load(); }}>Kayıtları yenile</button></div>
      <section aria-label="Günlük kullanılabilir zaman" className="first-plan-days">{Object.entries(ready.days).sort().map(([d, cap]) => <article key={d}><strong>{initialDateLabel(d)}</strong><span>{cap} dk kullanılabilir</span><small>{totals[d] ?? 0} dk seçtin · {Math.max(0, cap - (totals[d] ?? 0))} dk boş</small>{(totals[d] ?? 0) > cap && <span className="first-plan-warning">Kapasite aşıldı</span>}</article>)}</section>
      <p>Haftanın kullanılabilir bütçesi: <strong>{ready.weeklyBudgetMinutes} dk</strong> · Seçtiğin toplam: <strong>{blocks.reduce((s, b) => s + b.estimatedMinutes, 0)} dk</strong></p>
      {!review && !operation && <form onSubmit={addBlock} className="first-plan-editor"><h2>Bir çalışma ekle</h2><div className="first-plan-fields">
        <label>Hangi gün?<select value={date} required onChange={e => setDate(e.target.value)}><option value="">Gün seç</option>{Object.entries(ready.days).sort().filter(([d, n]) => n > 0 && d >= ready.today).map(([d]) => <option value={d} key={d}>{initialDateLabel(d)}</option>)}</select></label>
        <label>Hangi kaynakla?<select value={resourceId} required onChange={e => { setResourceId(e.target.value); setMode(""); }}><option value="">Kaynak seç</option>{ready.resources.map(r => <option value={r.id} key={r.id}>{r.subjectName} · {r.name}</option>)}</select></label>
        <label>Ne çalışacaksın?<select value={mode} required onChange={e => setMode(e.target.value)}><option value="">Çalışma türünü seç</option>{source?.workModes.map(m => <option key={m} value={m}>{WORK_MODE_LABELS[m]}</option>)}</select></label>
        <label>Kaç dakika?<input type="number" inputMode="numeric" min="1" max="480" step="1" value={minutes} required onChange={e => setMinutes(e.target.value)} /></label>
        <label className="first-plan-detail">Çalışma notun (isteğe bağlı)<input maxLength={500} value={detail} onChange={e => setDetail(e.target.value)} /></label>
      </div><button disabled={busy || !ready.ready || blocks.length >= 100} type="submit">Çalışmayı ekle</button></form>}
      {blocks.length > 0 && !review && blockList(blocks)}
      {review && <section className="first-plan-review" aria-label="Sunucuda doğrulanan plan"><h2>Planını incele</h2><p>{review.valid ? "Seçtiğin çalışmalar sunucuda doğrulandı." : "Planı kaydetmeden önce şu alanları düzelt."}</p>{blockList(review.blocks)}{review.errors.map((e, i) => <p role="alert" key={i}>{e.block !== undefined && `${e.block + 1}. çalışma: `}{e.date && `${initialDateLabel(e.date)}: `}{FIRST_PLAN_MESSAGES[e.code] ?? "Çalışma bilgilerini kontrol et."}</p>)}<ul>{Object.entries(review.dayTotals).sort().map(([d, n]) => <li key={d}>{initialDateLabel(d)}: {n} / {review.days[d] ?? 0} dk</li>)}</ul><strong>Toplam {review.totalMinutes} dk</strong><p>Kaynak seviyesinde çalışma. Sayfa aralığı veya video kimliği seçilmedi.</p></section>}
      <div className="first-plan-actions">{operation ? <button type="button" disabled={busy} onClick={() => void createOrRecover()}>{busy ? "Sonuç doğrulanıyor…" : "Sonucu kontrol et"}</button> : review ? <><button type="button" disabled={busy} onClick={() => { setReview(null); setMessage("İncelemeden çıktın. Plan oluşturulmadı; çalışmaların bu sekmede duruyor."); }}>Düzenlemeye dön</button><button className="primary-action" type="button" disabled={busy || !review.valid} onClick={() => void createOrRecover()}>Planı oluştur</button></> : <button className="primary-action" type="button" disabled={busy || !ready.ready || !blocks.length} onClick={() => void inspect()}>{busy ? "Plan kontrol ediliyor…" : "Planı incele"}</button>}</div>
    </>}
  </main>;
}
