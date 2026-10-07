import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { TopNavigation } from "../components/layout/TopNavigation";
import { useCoachWorkspace } from "./coach-workspace-context";
import { currentTask, elapsedSeconds, workspaceProposalError } from "./coach-workspace-state";
import { CoachProgress, CoachResources, CoachRoadmap, CoachWeek } from "./CoachPlanViews";
import { CoachToday, CoachWorkArea } from "./CoachWorkArea";
import { clockTime, coachProposal, CONCEPTS, duration, studiedMinutes, TODAY, type Concept, type Proposal, type Scenario, type Task } from "./model";
import { CapacityEditor, PlannerDiff, TaskEditor } from "./PlanDialogs";
import { Button, Modal, Skeleton } from "./ui";

const NAV = ["today", "week", "roadmap", "resources", "progress"].map((path, index) => ({ to: `/ux-lab/${path}?concept=coach`, label: ["Bugün", "Haftam", "Yol Haritası", "Kaynaklar", "İlerleme"][index]!, end: true }));
type Overlay = { kind: "task"; task: Task | null; day: number; resourceId?: string } | { kind: "capacity"; day: number } | { kind: "review"; proposal: Proposal } | { kind: "coach" } | { kind: "compare" } | null;

export function CoachLab() {
  const { state, send } = useCoachWorkspace();
  const [scenario, setScenario] = useState<Scenario>("ready");
  const [overlay, setOverlay] = useState<Overlay>(null);
  const location = useLocation();
  const routerNavigate = useNavigate();
  const [, setParams] = useSearchParams();
  const main = useRef<HTMLElement>(null);
  const screen = location.pathname.split("/")[2] ?? "today";
  const focus = screen === "session";
  const navigate = useCallback((path: string) => routerNavigate(`/ux-lab/${path}?concept=coach`), [routerNavigate]);
  useEffect(() => { main.current?.focus({ preventScroll: true }); window.scrollTo(0, 0); }, [screen]);
  useEffect(() => { if (!state.notice) return; const timer = window.setTimeout(() => send({ type: "clear-notice" }), 4500); return () => window.clearTimeout(timer); }, [state.notice, send]);
  function review(proposal: Proposal) { setOverlay({ kind: "review", proposal }); }
  function edit(task: Task | null, day: number, resourceId?: string) { setOverlay({ kind: "task", task, day, resourceId }); }
  const planIssue = overlay?.kind === "review" ? workspaceProposalError(state, overlay.proposal) : null;
  const apply = useCallback(() => {
    if (overlay?.kind !== "review" || scenario === "blocked" || planIssue) return;
    send({ type: "apply", proposal: overlay.proposal }); setOverlay(null);
  }, [overlay, scenario, planIssue, send]);
  function changeScenario(next: Scenario) {
    if (next === "empty") send({ type: "empty" });
    else if (scenario === "empty") send({ type: "reset" });
    if (next !== "ready") send({ type: "pause" });
    setScenario(next);
  }
  const help = () => setOverlay({ kind: "coach" });
  const active = state.session && state.session.phase !== "saved";
  return <div className={`ux-lab b-lab ${focus ? "b-focus" : ""}`} data-concept="coach"><a className="lab-skip" href="#b-main">İçeriğe geç</a>
    <aside className="lab-toolbar" aria-label="Prototip karşılaştırma araçları"><div className="lab-toolbar-brand"><span>UX LAB</span><small>B V2 · Örnek veriler · Video simülasyonu</small></div><div className="lab-concepts" aria-label="Tasarım yönü">{(Object.keys(CONCEPTS) as Concept[]).map((value) => <button key={value} aria-pressed={value === "coach"} onClick={() => setParams({ concept: value })}>{CONCEPTS[value].label}</button>)}</div><div className="lab-toolbar-tools"><button onClick={() => setOverlay({ kind: "compare" })}>Farklar</button><select aria-label="Örnek durum" value={scenario} onChange={(event) => changeScenario(event.target.value as Scenario)}><option value="ready">Normal durum</option><option value="loading">Yükleniyor</option><option value="empty">Boş plan</option><option value="error">Yükleme hatası</option><option value="blocked">İşlem yapılamıyor</option></select><button aria-label="Örnek verileri sıfırla" title="Örnek verileri sıfırla" onClick={() => { send({ type: "reset" }); setScenario("ready"); setOverlay(null); }}><Icon name="repeat" size={16} /></button></div></aside>
    <TopNavigation items={NAV} home="/ux-lab/today?concept=coach" displayName="Deniz" focus={focus} review onCoach={help} /><div className="b-shell">
      <div className="b-content">
        {active && screen !== "today" && !focus && <button className="b-active-session" onClick={() => navigate("session")}><Icon name="timer" size={18} /><span>{currentTask(state)?.title} · {clockTime(elapsedSeconds(state))} · {state.session?.phase === "running" ? "Çalışıyorsun" : "Moladasın"}</span><strong>Çalışmaya dön →</strong></button>}
        <main ref={main} id="b-main" tabIndex={-1} className="b-main">{scenario === "loading" ? <div className="b-empty"><Skeleton /></div> : scenario === "error" ? <div className="b-empty"><Icon name="warning" size={28} /><h1>Çalışmalar yüklenemedi</h1><Button onClick={() => setScenario("ready")}>Tekrar dene</Button></div> : focus ? <><header className="b-page-heading b-focus-heading"><div><span className="b-label">BUGÜN / ODAK</span><h1>Odak</h1></div><span>1 Ekim, Perşembe</span></header><CoachWorkArea focus navigate={navigate} help={help} /></> : screen === "week" ? <CoachWeek edit={edit} capacity={(day) => setOverlay({ kind: "capacity", day })} review={review} /> : screen === "resources" ? <CoachResources navigate={navigate} edit={edit} /> : screen === "roadmap" ? <CoachRoadmap navigate={navigate} /> : screen === "progress" ? <CoachProgress navigate={navigate} /> : screen === "coach" ? <><header className="b-page-heading"><div><h1>Koç</h1><span>Bu hafta · {duration(studiedMinutes(state.lab.tasks))} kayıtlı çalışma</span></div></header><CoachAssistant review={review} navigate={navigate} /></> : <CoachToday navigate={navigate} help={help} edit={edit} capacity={(day) => setOverlay({ kind: "capacity", day })} />}</main>
      </div></div>
    {state.notice && !state.notice.startsWith("Sayfa") && <div className="lab-toast" role="status"><Icon name="check" size={16} />{state.notice}</div>}
    {overlay?.kind === "coach" && <Modal title="Koç" kind="drawer" onClose={() => setOverlay(null)}><div className="lab-dialog-content"><CoachAssistant review={review} navigate={(path) => { setOverlay(null); navigate(path); }} /></div></Modal>}
    {overlay?.kind === "compare" && <Modal title="Tasarım yönleri" onClose={() => setOverlay(null)}><div className="lab-dialog-content lab-comparison">{(Object.keys(CONCEPTS) as Concept[]).map((value) => <section key={value}><span className="b-label">{CONCEPTS[value].label}</span><h2>{CONCEPTS[value].heading}</h2><p>{CONCEPTS[value].description}</p><Button tone="secondary" onClick={() => { setParams({ concept: value }); setOverlay(null); }}>Bu yönü incele</Button></section>)}<p className="b-muted">B V2 kitap ve videoyu birlikte kullanan ayrı örnek verilere sahiptir. Yenileme, örnek kayıtları sıfırlar. Koç yanıtları hazır senaryolardır.</p></div></Modal>}
    {overlay?.kind === "task" && <TaskEditor compact key={overlay.task?.id ?? `new-${overlay.resourceId}`} state={state.lab} task={overlay.task} day={overlay.day} initialResourceId={overlay.resourceId} onClose={() => setOverlay(null)} onReview={review} />}
    {overlay?.kind === "capacity" && <CapacityEditor compact state={state.lab} day={overlay.day} onClose={() => setOverlay(null)} onReview={review} />}
    {overlay?.kind === "review" && <PlannerDiff compact state={state.lab} proposal={overlay.proposal} issueOverride={workspaceProposalError(state, overlay.proposal)} blocked={scenario === "blocked"} onClose={() => setOverlay(null)} onApply={apply} />}
  </div>;
}

function CoachAssistant({ review, navigate }: { review: (proposal: Proposal) => void; navigate: (screen: string) => void }) {
  const { state } = useCoachWorkspace();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState("");
  const [history, setHistory] = useState<{ question: string; answer: string; plan: boolean }[]>([]);
  const task = currentTask(state);
  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => {
      const plan = /vakt|zaman|cuma|taşı|değiş|güncelle|onay|dakika/.test(pending.toLocaleLowerCase("tr-TR"));
      const answer = plan ? "Cuma: Matematik → Cumartesi. Hukuk: 60 → 45 dk. Cuma günü 60 dk açılır." : /neden|sıra|önce/.test(pending.toLocaleLowerCase("tr-TR")) ? `${task?.subject ?? "Bugünkü çalışman"} için kaldığın bölümden devam edebilirsin.${task ? ` Hedef: ${task.start}–${task.end}.` : " Haftam'dan çalışma ekleyebilirsin."}` : /hafta|ilerle|nasıl|durum/.test(pending.toLocaleLowerCase("tr-TR")) ? `Bu hafta ${duration(studiedMinutes(state.lab.tasks))} kaydedildi. ${state.lab.tasks.filter((t) => !t.done).length} çalışma kaldı.` : "Çalışma sıranı, haftalık ilerlemeni veya cuma günü için bir plan önerisini inceleyebilirim.";
      setHistory((previous) => [...previous, { question: pending, answer, plan }].slice(-3)); setPending("");
    }, 550);
    return () => window.clearTimeout(timer);
  }, [pending, state.lab.tasks, task]);
  function ask(value: string) { if (!pending && value.trim()) { setPending(value.trim()); setMessage(""); } }
  function submit(event: FormEvent) { event.preventDefault(); ask(message); }
  return <section className="b-assistant"><div className="b-coach-context"><span className="b-label">Şimdiki çalışma</span><strong>{task?.title ?? "Çalışma seçilmedi"}</strong><span className="b-muted">Bugün {state.lab.tasks.filter((t) => t.day === TODAY && !t.done).length} çalışma kaldı</span></div><div className="b-coach-prompts">{["Bu hafta nasıl gidiyorum?", "Cuma daha az vaktim var", "Neden bu çalışma?"].map((prompt) => <button key={prompt} disabled={Boolean(pending)} onClick={() => ask(prompt)}>{prompt}<Icon name="arrow" size={15} /></button>)}</div><div className="b-coach-history" aria-live="polite">{history.map((reply, index) => <article key={index}><p className="b-question">{reply.question}</p><p>{reply.answer}</p>{reply.plan ? <Button tone="secondary" onClick={() => { const proposal = coachProposal(state.lab); review({ ...proposal, title: "Cuma planı", reason: "Cuma günü 60 dk boşalır." }); }}>Plan önerisini incele</Button> : <Button tone="quiet" onClick={() => navigate("today")}>Çalışmaya dön</Button>}</article>)}{pending && <p role="status">Hazırlanıyor…</p>}</div><form className="b-coach-composer" onSubmit={submit}><label htmlFor="b-coach-message">Koç'a sor</label><textarea id="b-coach-message" rows={2} maxLength={500} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Örn. Cuma daha az vaktim var" /><Button type="submit" icon="arrow" disabled={!message.trim() || Boolean(pending)}>Gönder</Button></form></section>;
}
