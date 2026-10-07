import { Icon } from "../components/Icon";
import { useCoachWorkspace } from "./coach-workspace-context";
import { currentTask, elapsedSeconds, pageBoundary, taskVideoId } from "./coach-workspace-state";
import { CoachPageTrack } from "./CoachPageTrack";
import { CoachVideo } from "./CoachVideo";
import { clockTime, duration, TODAY, type Task } from "./model";
import { Button, Modal, Progress } from "./ui";

export function CoachWorkArea({ focus, navigate, help }: { focus: boolean; navigate: (screen: string) => void; help: () => void }) {
  const { state, send } = useCoachWorkspace();
  const task = currentTask(state);
  if (!task) return <section className="b-empty"><Icon name="check" size={28} /><h2>Bugün için çalışma yok</h2><Button onClick={() => navigate("week")}>Haftama çalışma ekle</Button></section>;
  const material = state.lab.materials.find((m) => m.id === task.resourceId)!;
  const videoId = taskVideoId(state, task);
  const phase = state.session?.phase;
  const next = state.lab.tasks.find((t) => t.day === TODAY && !t.done && t.id !== task.id);
  return <section className={`b-workspace ${focus ? "b-focus-workspace" : ""}`} data-session={phase ?? "idle"} aria-label="Şimdiki çalışma">
    <header className="b-work-header"><div><span className="b-label b-now-label">ŞİMDİ</span><span className="b-subject">{task.subject} <span>· {duration(task.minutes)}</span></span><h2>{task.title}</h2><span className="b-muted">{material.name}{videoId && material.kind === "book" ? " + video ders" : ""}</span></div><Button tone="quiet" icon={focus ? "arrow" : "target"} onClick={() => navigate(focus ? "today" : "session")}>{focus ? "Bugüne dön" : "Odak görünümü"}</Button></header>
    {phase === "saved" ? <div className="b-saved" role="status"><span className="b-saved-check"><Icon name="check" size={25} /></span><div><h3>Çalışma kaydedildi</h3><p>{clockTime(elapsedSeconds(state))} çalışma · {material.kind === "book" ? `Sayfa ${state.session!.startBoundary} → ${pageBoundary(state, task)}` : `Video ${state.playlists[material.id]?.current} · ${clockTime(state.playlists[material.id]?.positions[state.playlists[material.id]!.current] ?? 0)}`}</p></div><div>{!task.done && <Button tone="secondary" onClick={() => { send({ type: "select", taskId: task.id }); send({ type: "start" }); }}>Çalışmaya devam et</Button>}{next && <Button icon="arrow" onClick={() => send({ type: "select", taskId: next.id })}>Sıradaki çalışma</Button>}</div></div> : <>
      <div className="b-session-controls"><div className="b-session-clock"><span className={phase === "running" ? "b-live-dot" : "b-idle-dot"} /><div><span>{phase === "running" ? "Çalışıyorsun" : phase === "paused" ? "Moladasın" : "Çalışma süresi"}</span><strong aria-label={`Çalışma süresi ${clockTime(elapsedSeconds(state))}`}>{clockTime(elapsedSeconds(state))}</strong></div></div><div className="b-session-buttons">{!phase ? <Button icon="play" onClick={() => send({ type: "start" })}>Çalışmaya Başla</Button> : <><Button tone="secondary" icon={phase === "paused" ? "play" : "stop"} onClick={() => send({ type: phase === "paused" ? "resume" : "pause" })}>{phase === "paused" ? "Devam et" : "Mola ver"}</Button><Button icon="check" onClick={() => send({ type: "finish" })}>Bitir</Button></>}</div></div>
      <div className={`b-materials ${videoId && material.kind === "book" ? "b-mixed" : ""}`}>
        {videoId && <CoachVideo resourceId={videoId} />}
        {material.kind === "book" && <CoachPageTrack key={task.id} task={task} />}
      </div>
    </>}
    {focus && <div className="b-focus-help"><Button tone="quiet" onClick={help}>Koç'a sor</Button><span className="b-muted">{next ? `Sonra · ${next.subject} · ${duration(next.minutes)}` : "Günün son çalışması"}</span></div>}
    {phase === "finishing" && <FinishWork task={task} />}
  </section>;
}

function FinishWork({ task }: { task: Task }) {
  const { state, send } = useCoachWorkspace();
  const material = state.lab.materials.find((m) => m.id === task.resourceId)!;
  const videoId = taskVideoId(state, task);
  const player = videoId ? state.playlists[videoId] : undefined;
  const raw = state.drafts[task.id] ?? String(pageBoundary(state, task));
  return <Modal title="Çalışmayı bitir" onClose={() => send({ type: "resume-edit" })}><form className="lab-dialog-content b-finish lab-form" onSubmit={(e) => { e.preventDefault(); send({ type: "save-finish" }); }}><span className="b-label">{task.subject}</span><h2>{task.title}</h2><div className="b-finish-time"><Icon name="timer" /><strong>{clockTime(elapsedSeconds(state))}</strong><span>çalışma</span></div>
    {player && <div className="b-finish-video"><Icon name="play" size={19} /><div><strong>Video {player.current} · {clockTime(player.positions[player.current] ?? 0)} / {clockTime(player.lessons[player.current - 1]!.seconds)}</strong><span>{player.completed.includes(player.current) ? "Tamamlandı" : "Kaldığın yer kaydedildi"} · {player.completed.length} / {player.lessons.length} video</span></div></div>}
    {material.kind === "book" && <label>Nereye kadar geldin?<input type="number" inputMode="numeric" required min={pageBoundary(state, task)} max={task.end} step={1} value={raw} onChange={(e) => send({ type: "draft", taskId: task.id, value: e.target.value })} /><span className="b-muted">{material.name} · Başlangıç {task.start}, hedef {task.end}</span></label>}
    {state.error && <p className="lab-error" role="alert">{state.error}</p>}<div className="lab-dialog-actions"><Button type="submit" icon="check">Kaydet</Button><Button tone="quiet" onClick={() => send({ type: "resume-edit" })}>Çalışmaya dön</Button></div>
  </form></Modal>;
}

export function CoachToday({ navigate, help, edit, capacity }: { navigate: (screen: string) => void; help: () => void; edit: (task: Task | null, day: number) => void; capacity: (day: number) => void }) {
  const { state, send } = useCoachWorkspace();
  const current = currentTask(state);
  const today = state.lab.tasks.filter((t) => t.day === TODAY);
  const upcoming = today.filter((t) => !t.done && t.id !== current?.id);
  const done = today.filter((t) => t.done);
  const studied = today.reduce((sum, t) => sum + t.studiedSeconds, 0) + (state.session?.phase !== "saved" ? elapsedSeconds(state) : 0);
  const planned = today.reduce((sum, t) => sum + t.minutes, 0);
  return <><header className="b-page-heading b-today-heading"><div className="b-today-date"><span className="b-label">BUGÜN</span><h1>1 Ekim Perşembe</h1></div><div className="b-today-head-side"><div className="b-today-stats"><div><strong>340</strong><span>gün kaldı</span></div><div><strong>{duration(planned)}</strong><span>bugün</span></div></div><div className="b-today-actions"><Button tone="secondary" onClick={() => edit(null, TODAY)}>Görev Ekle</Button><Button tone="secondary" onClick={() => capacity(TODAY)}>Vaktim Değişti</Button><Button tone="quiet" onClick={help}>Koça Sor</Button></div></div></header>
    <div className="b-today-grid"><CoachWorkArea focus={false} navigate={navigate} help={help} /><div className="b-day-rail">
      <section className="b-daily"><div><span className="b-label">BUGÜNÜN DURUMU</span><h2>Günlük ilerleme</h2></div><div><strong>{duration(studied / 60)}</strong><span> / {duration(planned)}</span></div><Progress value={studied / 60} max={planned} label="Bugünkü çalışma süresi" /><p className="b-muted">{done.length} / {today.length} çalışma tamamlandı</p></section>
      <section className="b-upcoming"><div className="b-section-heading"><h2>Bugünün devamı</h2><button className="b-text-button" onClick={() => navigate("week")}>Haftam <Icon name="arrow" size={15} /></button><span>{upcoming.length} çalışma</span></div>{upcoming.length ? <ol>{upcoming.map((task, index) => <li key={task.id}><span className="b-order">{String(index + 2).padStart(2, "0")}</span><div><span className="b-label">{task.subject}</span><h3>{task.title}</h3><span className="b-muted">{duration(task.minutes)} · {state.lab.materials.find((m) => m.id === task.resourceId)?.kind === "video" ? `Video ${task.start}` : `s. ${task.start}–${task.end}`}</span></div><button aria-label={`${task.subject} çalışmasına geç`} title="Bu çalışmaya geç" className="b-round-button" onClick={() => send({ type: "select", taskId: task.id })}><Icon name="arrow" size={18} /></button></li>)}</ol> : <p className="b-muted">Başka çalışma yok.</p>}{done.length > 0 && <details className="b-done"><summary><Icon name="check" size={15} /> {done.length} tamamlandı</summary>{done.map((task) => <p key={task.id}>{task.subject} · {task.title}</p>)}</details>}</section>
    </div></div>
  </>;
}
