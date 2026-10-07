import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Icon, type IconName } from "../components/Icon";
import { Coach } from "./Coach";
import { CoachLab } from "./CoachLab";
import { CoachWorkspaceContext, useCoachWorkspaceController } from "./coach-workspace-context";
import { LabContext, type LabContextValue } from "./context";
import { Insights, Roadmap } from "./Insights";
import { CONCEPTS, TODAY, applyProposal, createDemoState, finishStudy, proposalError, type Concept, type Material, type Proposal, type Scenario, type Screen, type Task } from "./model";
import { CapacityEditor, PlannerDiff, TaskEditor } from "./PlanDialogs";
import { ResourceDetail, Resources } from "./Resources";
import { StudySession } from "./StudySession";
import { Today } from "./Today";
import { Button, Modal, Skeleton } from "./ui";
import { Week } from "./Week";

const NAV: { screen: Screen; label: string; icon: IconName }[] = [
  { screen: "today", label: "Bugün", icon: "home" }, { screen: "week", label: "Haftam", icon: "calendar" },
  { screen: "roadmap", label: "Yol Haritası", icon: "target" }, { screen: "resources", label: "Kaynaklar", icon: "book" },
  { screen: "progress", label: "İlerleme", icon: "chart" },
];
type Overlay = { kind: "task"; task: Task | null; day: number } | { kind: "capacity"; day: number } | { kind: "review"; proposal: Proposal } | { kind: "resource"; id: string } | { kind: "session"; task: Task } | { kind: "compare" } | null;

export function UxLab() {
  const [state, setState] = useState(createDemoState);
  const [scenario, setScenario] = useState<Scenario>("ready");
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [notice, setNotice] = useState("");
  const [videoPosition, setVideoPosition] = useState(1395);
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const routerNavigate = useNavigate();
  const main = useRef<HTMLElement>(null);
  const conceptParam = params.get("concept");
  const concept: Concept = conceptParam === "coach" || conceptParam === "product" ? conceptParam : "focus";
  const coachWorkspace = useCoachWorkspaceController(concept === "coach");
  const path = location.pathname.split("/")[2];
  const screen: Screen = path === "week" || path === "coach" || path === "roadmap" || path === "resources" || path === "progress" ? path : "today";
  const navigate = useCallback((next: Screen) => routerNavigate(`/ux-lab/${next}?concept=${concept}`), [routerNavigate, concept]);
  useEffect(() => { main.current?.focus({ preventScroll: true }); window.scrollTo(0, 0); }, [screen]);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(""), 5000); return () => window.clearTimeout(timer); }, [notice]);
  const saveStudy = useCallback((boundary: number, seconds: number) => {
    if (overlay?.kind !== "session") return;
    setState((previous) => finishStudy(previous, overlay.task.id, boundary, seconds));
  }, [overlay]);
  const apply = useCallback(() => {
    if (overlay?.kind !== "review" || scenario === "blocked") return;
    const issue = proposalError(state, overlay.proposal);
    if (issue) { setNotice(issue); return; }
    setState((previous) => applyProposal(previous, overlay.proposal));
    setOverlay(null); setNotice("Planın güncellendi. Haftan hazır.");
  }, [overlay, scenario, state]);
  function review(proposal: Proposal) { setOverlay({ kind: "review", proposal }); }
  function resource(material: Material) { setOverlay({ kind: "resource", id: material.id }); }
  function start(task: Task) { setOverlay({ kind: "session", task }); }
  function changeScenario(next: Scenario) {
    if (next === "empty") setState((previous) => ({ ...previous, tasks: [], version: previous.version + 1 }));
    else if (scenario === "empty") setState(createDemoState());
    setScenario(next);
  }
  const context: LabContextValue = { state, concept, scenario, navigate, start, resource, edit: (task, day) => setOverlay({ kind: "task", task, day }), capacity: (day) => setOverlay({ kind: "capacity", day }), review };
  const selectedMaterial = overlay?.kind === "resource" ? state.materials.find((m) => m.id === overlay.id) : undefined;
  if (concept === "coach") return <CoachWorkspaceContext.Provider value={coachWorkspace}><CoachLab /></CoachWorkspaceContext.Provider>;
  return <LabContext.Provider value={context}><div className="ux-lab" data-concept={concept}>
    <a className="lab-skip" href="#lab-main">İçeriğe geç</a>
    <aside className="lab-toolbar" aria-label="Prototip karşılaştırma araçları"><div className="lab-toolbar-brand"><span>UX LAB</span><small>Yerel demo · Örnek veriler</small></div><div className="lab-concepts" aria-label="Tasarım yönü">{(Object.keys(CONCEPTS) as Concept[]).map((value) => <button key={value} aria-pressed={concept === value} onClick={() => setParams({ concept: value })}>{CONCEPTS[value].label}</button>)}</div><div className="lab-toolbar-tools"><button onClick={() => setOverlay({ kind: "compare" })}>Farklar</button><label><span className="lab-sr-only">Örnek durum</span><select aria-label="Örnek durum" value={scenario} onChange={(e) => changeScenario(e.target.value as Scenario)}><option value="ready">Normal durum</option><option value="loading">Yükleniyor</option><option value="empty">Boş plan</option><option value="error">Yükleme hatası</option><option value="blocked">İşlem yapılamıyor</option></select></label><button title="Örnek verileri sıfırla" aria-label="Örnek verileri sıfırla" onClick={() => { setState(createDemoState()); setVideoPosition(1395); setScenario("ready"); setNotice("Örnek veriler başlangıç durumuna döndü."); }}><Icon name="repeat" size={16} /></button></div></aside>
    <div className="lab-shell"><aside className="lab-sidebar"><NavLink className="lab-brand" to={`/ux-lab/today?concept=${concept}`}><span className="lab-brand-icon"><Icon name="target" size={24} /></span><span>KPSS Koçu<small>Her gün biraz daha ileri.</small></span></NavLink><span className="lab-nav-label">ÇALIŞMA ALANIN</span><nav aria-label="Ana gezinme">{NAV.map((item) => <NavLink key={item.screen} className={screen === item.screen ? "active" : ""} to={`/ux-lab/${item.screen}?concept=${concept}`}><Icon name={item.icon} size={20} /><span>{item.label}</span>{screen === item.screen && <i />}</NavLink>)}</nav><NavLink className={`lab-coach-nav ${screen === "coach" ? "active" : ""}`} to={`/ux-lab/coach?concept=${concept}`}><Icon name="spark" /><span>AI Koç</span><Icon name="arrow" size={15} /></NavLink><div className="lab-sidebar-bottom"><span className="lab-eyebrow">KÜÇÜK ADIMLAR, BÜYÜK YOL.</span><p>Kendi hızında.<br />Kendi hedeflerine.</p><div className="lab-profile"><span>D</span><div><strong>Deniz</strong><small>KPSS P48 · 2027</small></div></div></div></aside>
    <div className="lab-main-wrap"><header className="lab-topline"><span>Çalışma alanım <span>/</span> {NAV.find((n) => n.screen === screen)?.label ?? "AI Koç"}</span><span>KPSS P48 <i /> 2027 hazırlığı</span></header><main id="lab-main" ref={main} tabIndex={-1} className={`lab-main lab-screen-${screen}`}>
      {scenario === "loading" ? <div className="lab-state-screen"><Skeleton /></div> : scenario === "error" ? <div className="lab-error-screen"><Icon name="warning" size={34} /><h1>Çalışma alanın yüklenemedi.</h1><p>Bir kez daha deneyelim. Planın ve kayıtların korunuyor.</p><Button onClick={() => setScenario("ready")}>Tekrar dene</Button></div> : screen === "today" ? <Today /> : screen === "week" ? <Week /> : screen === "coach" ? <Coach /> : screen === "resources" ? <Resources /> : screen === "roadmap" ? <Roadmap /> : <Insights />}
    </main><footer className="lab-page-footer"><span>Bir gün daha. Bir adım daha.</span><span>KPSS Koçu</span></footer></div></div>
    <nav className="lab-mobile-nav" aria-label="Mobil gezinme">{[...NAV, { screen: "coach" as const, label: "Koç", icon: "spark" as const }].map((item) => <NavLink key={item.screen} className={screen === item.screen ? "active" : ""} to={`/ux-lab/${item.screen}?concept=${concept}`}><Icon name={item.icon} size={21} /><span>{item.screen === "roadmap" ? "Yolum" : item.label}</span></NavLink>)}</nav>
    {notice && <div className="lab-toast" role="status"><Icon name="check" size={18} />{notice}</div>}
    {overlay?.kind === "compare" && <Modal title="Üç farklı çalışma deneyimi" onClose={() => setOverlay(null)}><div className="lab-dialog-content lab-comparison">{(Object.keys(CONCEPTS) as Concept[]).map((value) => <section key={value}><span className="lab-eyebrow">{CONCEPTS[value].label}</span><h2>{CONCEPTS[value].heading}</h2><p>{CONCEPTS[value].description}</p><Button tone="secondary" onClick={() => { setParams({ concept: value }); setOverlay(null); }}>Bu yönü incele</Button></section>)}<p className="lab-muted lab-small">Tüm yönler aynı örnek veriyi paylaşır. İşlemler yalnızca bu sekmedeki demo verisini değiştirir; sayfa yenilenince sıfırlanır. Koç yanıtları hazır senaryolardır. Yol haritası ve bitiş tahminleri örnektir.</p></div></Modal>}
    {overlay?.kind === "task" && <TaskEditor key={`task-${overlay.task?.id ?? "new"}`} state={state} task={overlay.task} day={overlay.day} onClose={() => setOverlay(null)} onReview={review} />}
    {overlay?.kind === "capacity" && <CapacityEditor state={state} day={overlay.day} onClose={() => setOverlay(null)} onReview={review} />}
    {overlay?.kind === "review" && <PlannerDiff state={state} proposal={overlay.proposal} blocked={scenario === "blocked"} onClose={() => setOverlay(null)} onApply={apply} />}
    {overlay?.kind === "session" && <StudySession task={overlay.task} material={state.materials.find((m) => m.id === overlay.task.resourceId)!} concept={concept} onClose={() => { setOverlay(null); navigate("today"); }} onSave={saveStudy} />}
    {selectedMaterial && <ResourceDetail material={selectedMaterial} position={videoPosition} onPosition={setVideoPosition} onClose={() => setOverlay(null)} onStudy={() => { const task = state.tasks.find((t) => t.day === TODAY && t.resourceId === selectedMaterial.id && !t.done); if (task) start(task); else { setOverlay(null); navigate("week"); setNotice("Bu kaynaktan yeni bir çalışma ekleyebilirsin."); } }} />}
  </div></LabContext.Provider>;
}
