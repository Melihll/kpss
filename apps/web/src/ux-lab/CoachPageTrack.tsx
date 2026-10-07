import { useEffect, useId, useState, type FormEvent } from "react";
import { Icon } from "../components/Icon";
import { useCoachWorkspace } from "./coach-workspace-context";
import { pageBoundary } from "./coach-workspace-state";
import { type Task } from "./model";
import { Button, Progress } from "./ui";

export function CoachPageTrack({ task }: { task: Task }) {
  const { state, send } = useCoachWorkspace();
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (!saving) return; const timer = window.setTimeout(() => setSaving(false), 450); return () => window.clearTimeout(timer); }, [saving]);
  const material = state.lab.materials.find((m) => m.id === task.resourceId)!;
  const boundary = pageBoundary(state, task);
  const raw = state.drafts[task.id] ?? String(boundary);
  const id = useId();
  const locked = state.session?.phase === "finishing" || state.session?.phase === "saved" || task.done;
  function save(event: FormEvent) {
    event.preventDefault();
    send({ type: "save-page", taskId: task.id });
    setSaving(true);
  }
  return <section className="b-page-track" aria-label="Sayfa takibi"><header className="b-material-heading"><div><span className="b-label"><Icon name="book" size={14} /> {material.activity === "Soru çözümü" ? "SORU BANKASI" : "KİTAP"}</span><h3>{material.name}</h3></div><span className="b-muted">{material.progress} / {material.total} sayfa</span></header>
    <div className="b-page-numbers"><div><span>Başlangıç</span><strong>{task.start}</strong></div><span className="b-page-line" /><div><span>Son kaydedilen</span><strong className="b-current-page">{boundary}</strong></div><span className="b-page-line" /><div><span>Hedef</span><strong>{task.end}</strong></div></div>
    <Progress value={Math.max(0, boundary - task.start + 1)} max={task.end - task.start + 1} label="Bu çalışmanın sayfa ilerlemesi" />
    <form className="b-page-form" onSubmit={save}><label htmlFor={id}>Geldiğin sayfa</label><input id={id} type="number" inputMode="numeric" required min={boundary} max={task.end} step={1} value={raw} disabled={locked} onChange={(e) => send({ type: "draft", taskId: task.id, value: e.target.value })} /><Button type="submit" tone="secondary" icon="check" disabled={locked || saving}>{saving ? "Kaydediliyor…" : "Sayfayı kaydet"}</Button></form>
    {state.notice.startsWith("Sayfa") && <p className="b-inline-success" role="status"><Icon name="check" size={14} />{state.notice}</p>}{state.error && <p className="lab-error" role="alert">{state.error}</p>}
  </section>;
}
