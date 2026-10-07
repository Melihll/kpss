import { useEffect, useRef, useState, type FormEvent } from "react";
import { Icon } from "../components/Icon";
import { clockTime, taskScope, type Concept, type Material, type Task } from "./model";
import { Badge, Button, Modal, Progress } from "./ui";

export function StudySession({ task, material, concept, onClose, onSave }: { task: Task; material: Material; concept: Concept; onClose: () => void; onSave: (boundary: number, seconds: number) => void }) {
  const [phase, setPhase] = useState<"running" | "paused" | "finish" | "saving" | "saved">("running");
  const [elapsed, setElapsed] = useState(0);
  const accrued = useRef(0);
  const started = useRef(Date.now());
  const [boundary, setBoundary] = useState("");
  const [error, setError] = useState("");
  // Keep the starting boundary fixed when saving updates the shared material.
  const [minimum] = useState(() => Math.max(task.start - 1, Math.min(material.progress, task.end)));
  useEffect(() => {
    if (phase !== "running") return;
    started.current = Date.now();
    const timer = window.setInterval(() => setElapsed(accrued.current + (Date.now() - started.current) / 1000), 250);
    return () => window.clearInterval(timer);
  }, [phase]);
  useEffect(() => {
    if (phase !== "saving") return;
    const timer = window.setTimeout(() => { onSave(Number(boundary), elapsed); setPhase("saved"); }, 550);
    return () => window.clearTimeout(timer);
  }, [phase, boundary, elapsed, onSave]);
  function stopClock(next: "paused" | "finish") {
    if (phase === "running") { accrued.current += (Date.now() - started.current) / 1000; setElapsed(accrued.current); }
    setPhase(next);
  }
  function save(event: FormEvent) {
    event.preventDefault();
    const value = Number(boundary);
    if (!boundary.trim() || !Number.isInteger(value) || value < minimum || value > task.end) { setError(`${minimum}–${task.end} arasında tamamladığın son ${material.kind === "video" ? "videoyu" : "sayfayı"} yaz.`); return; }
    setError(""); setPhase("saving");
  }
  return <Modal title="Odak zamanı" kind="session" onClose={() => { if (phase === "saved") onClose(); else if (phase !== "saving") stopClock("finish"); }} dismissible={phase !== "saving"}>
    <div className="lab-session-top"><span className="lab-brand-small"><Icon name="target" /> KPSS Koçu</span><Badge tone={phase === "running" ? "success" : "neutral"}>{phase === "running" ? "Çalışıyorsun" : phase === "paused" ? "Mola zamanı" : phase === "saved" ? "Kaydedildi" : "Çalışmayı bitir"}</Badge></div>
    {phase === "saved" ? <div className="lab-session-center lab-session-success"><span className="lab-success-symbol"><Icon name="check" size={32} /></span><span className="lab-eyebrow">EMEĞİN KAYDEDİLDİ</span><h1>{Number(boundary) === task.end ? "Bir adım daha tamam." : "Kaldığın yer belli."}</h1><p>{material.name} · {Number(boundary) === minimum ? "Yeni ilerleme yok" : `${material.kind === "video" ? "Video" : "Sayfa"} ${boundary}`}</p><strong className="lab-saved-time">{clockTime(elapsed)}</strong><p className="lab-muted">{Number(boundary) === task.end ? "Bugünkü ilerlemen güncellendi." : "Bu çalışmaya kaldığın yerden devam edebilirsin."}</p><Button onClick={onClose}>Bugüne dön <Icon name="arrow" size={18} /></Button></div> : phase === "finish" || phase === "saving" ? <form className="lab-session-center lab-finish-form lab-form" onSubmit={save}><span className="lab-eyebrow">BUGÜN KENDİNE ZAMAN AYIRDIN</span><h1>Çalışmanı kaydedelim.</h1><p><strong>{clockTime(elapsed)}</strong> çalıştın · {task.subject}</p><label>{material.kind === "video" ? "Kaçıncı videoyu tamamladın?" : "Nereye kadar geldin?"}<span className="lab-boundary-input"><span>{material.kind === "video" ? "Video" : "Sayfa"}</span><input autoFocus type="number" required min={minimum} max={task.end} value={boundary} placeholder={String(task.end)} onChange={(e) => setBoundary(e.target.value)} disabled={phase === "saving"} /></span></label><p className="lab-muted">{material.name} · {taskScope(task, material)}</p><button className="lab-text-link" type="button" disabled={phase === "saving"} onClick={() => setBoundary(String(minimum))}>Yeni {material.kind === "video" ? "video" : "sayfa"} tamamlamadım</button>{error && <p className="lab-error" role="alert">{error}</p>}<div className="lab-dialog-actions"><Button type="submit" disabled={phase === "saving"}>{phase === "saving" ? "Kaydediliyor…" : "Kaydet"}</Button><Button tone="quiet" disabled={phase === "saving"} onClick={() => setPhase("paused")}>Çalışmaya dön</Button></div></form> : <div className="lab-session-center"><span className="lab-eyebrow">{task.subject} · {material.activity.toLocaleUpperCase("tr-TR")}</span><h1>{phase === "paused" ? "Kısa bir nefes." : task.title}</h1><p>{material.name} · {taskScope(task, material)}</p><div className="lab-session-clock" role="timer" aria-label="Geçen çalışma süresi">{clockTime(elapsed)}</div><span className="lab-muted">{phase === "paused" ? "Mola süren çalışmana eklenmez." : `${task.minutes} dakikalık çalışma · Kendi hızında ilerle.`}</span><Progress value={elapsed} max={task.minutes * 60} label="Çalışma süresi" /><div className="lab-session-actions"><Button icon={phase === "paused" ? "play" : undefined} onClick={() => phase === "running" ? stopClock("paused") : setPhase("running")}>{phase === "running" ? "Mola ver" : "Devam et"}</Button><Button tone="secondary" onClick={() => stopClock("finish")}>Çalışmayı bitir</Button></div>{concept === "coach" && <p className="lab-session-whisper">Hepsini bugün bitirmen gerekmiyor. Bu bölüme odaklanman yeterli.</p>}{concept === "product" && <div className="lab-session-context"><Icon name="book" size={18} /><span>Kaynak ilerlemen</span><strong>{material.progress} / {material.total}</strong></div>}</div>}
    <footer className="lab-session-footer"><Icon name="target" size={16} /><span>Şu an yalnızca bu çalışma var.</span></footer>
  </Modal>;
}
