import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "../components/Icon";
import { DAYS, TODAY, duration, proposalError, taskScope, type LabState, type Proposal, type Task } from "./model";
import { Badge, Button, Modal } from "./ui";

export function TaskEditor({ state, task, day, onClose, onReview, initialResourceId, compact = false }: { state: LabState; task: Task | null; day: number; onClose: () => void; onReview: (proposal: Proposal) => void; initialResourceId?: string; compact?: boolean }) {
  const [resourceId, setResourceId] = useState(task?.resourceId ?? initialResourceId ?? state.materials[0]!.id);
  const material = state.materials.find((m) => m.id === resourceId)!;
  const [title, setTitle] = useState(task?.title ?? "");
  const [selectedDay, setSelectedDay] = useState(task?.day ?? day);
  const [minutes, setMinutes] = useState(String(task?.minutes ?? 45));
  const [start, setStart] = useState(String(task?.start ?? material.progress + 1));
  const [end, setEnd] = useState(String(task?.end ?? Math.min(material.total, material.progress + (material.kind === "video" ? 1 : 12))));
  const [error, setError] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) { setError("Çalışmana kısa bir başlık ekle."); return; }
    const after: Task = { id: task?.id ?? `manual-${state.version}-${state.tasks.length}`, subject: material.subject, resourceId, title: title.trim(), day: selectedDay, minutes: Number(minutes), start: Number(start), end: Number(end), done: false, studiedSeconds: task?.studiedSeconds ?? 0 };
    const proposal: Proposal = { version: state.version, title: compact ? task ? "Çalışma güncellenecek" : "Çalışma eklenecek" : task ? "Çalışmanı güncelleyelim." : "Haftana bir çalışma ekleyelim.", reason: compact ? `${DAYS[selectedDay]} · ${duration(Number(minutes))}` : "Son bir kez kontrol et. Onayından sonra haftanda görünecek.", changes: [{ before: task, after }] };
    const issue = proposalError(state, proposal);
    if (issue) { setError(issue); return; }
    onReview(proposal);
  }
  return <Modal title={task?.done ? "Tamamladığın çalışma" : task ? "Çalışmayı düzenle" : "Çalışma ekle"} kind="drawer" onClose={onClose}>
    {task?.done ? <div className="lab-dialog-content"><Badge tone="success">Tamamlandı</Badge><h2>{task.title}</h2><p>{material.name} · {taskScope(task, material)}</p><p>{duration(task.studiedSeconds / 60)} çalışma kaydedildi.</p><Button tone="secondary" onClick={onClose}>Kapat</Button></div> : <form className="lab-dialog-content lab-form" onSubmit={submit}>
      {!compact && <p className="lab-muted">Yalnızca bu çalışmayı düzenliyorsun.</p>}
      <label>Kaynak<select value={resourceId} disabled={Boolean(task)} onChange={(e) => { const selected = state.materials.find((m) => m.id === e.target.value)!; setResourceId(selected.id); setStart(String(selected.progress + 1)); setEnd(String(Math.min(selected.total, selected.progress + (selected.kind === "video" ? 1 : 12)))); }}>{state.materials.map((m) => <option key={m.id} value={m.id}>{m.subject} · {m.name}</option>)}</select></label>
      <label>Çalışma başlığı<input required maxLength={90} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Örn. Bilanço soruları" /></label>
      <div className="lab-field-row"><label>Gün<select value={selectedDay} onChange={(e) => setSelectedDay(Number(e.target.value))}>{DAYS.map((d, i) => i >= TODAY && <option key={d} value={i}>{d}</option>)}</select></label><label>Süre (dk)<input required type="number" min={5} max={480} step={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} /></label></div>
      <div className="lab-field-row"><label>İlk {material.kind === "video" ? "video" : "sayfa"}<input required type="number" min={1} max={material.total} value={start} onChange={(e) => setStart(e.target.value)} /></label><label>Son {material.kind === "video" ? "video" : "sayfa"}<input required type="number" min={Number(start)} max={material.total} value={end} onChange={(e) => setEnd(e.target.value)} /></label></div>
      {error && <p className="lab-error" role="alert">{error}</p>}
      <div className="lab-dialog-actions"><Button type="submit" icon="arrow">Değişiklikleri incele</Button><Button tone="quiet" onClick={onClose}>Vazgeç</Button></div>
      {task && <Button tone="danger" onClick={() => onReview({ version: state.version, title: compact ? "Çalışma kaldırılacak" : "Bu çalışmayı kaldıralım mı?", reason: "Kaynak ilerlemen ve önceki çalışma kayıtların korunur.", changes: [{ before: task, after: null }] })}>Çalışmayı kaldır</Button>}
    </form>}
  </Modal>;
}
export function CapacityEditor({ state, day, onClose, onReview, compact = false }: { state: LabState; day: number; onClose: () => void; onReview: (proposal: Proposal) => void; compact?: boolean }) {
  const [minutes, setMinutes] = useState(String(state.capacities[day]));
  return <Modal title={`${DAYS[day]} · Ayırabileceğin süre`} onClose={onClose}><form className="lab-dialog-content lab-form" onSubmit={(event) => { event.preventDefault(); onReview({ version: state.version, title: compact ? "Günlük kapasite değişecek" : `${DAYS[day]} için ayırdığın süre değişecek.`, reason: compact ? DAYS[day]! : "Çalışmaların bu süreye sığıyorsa güncelleyebiliriz. Sığmıyorsa önce bir çalışmayı başka güne taşı.", changes: [], capacity: { day, before: state.capacities[day]!, after: Number(minutes) } }); }}>{!compact && <h2>Bugün ne kadar zamanın var?</h2>}<label>Çalışmaya ayıracağım dakika<input autoFocus type="number" min={0} max={720} required value={minutes} onChange={(e) => setMinutes(e.target.value)} /></label><p className="lab-muted">Molalar dışında, gerçekçi bir süre seç.</p><Button type="submit">Değişikliği incele</Button></form></Modal>;
}
export function PlannerDiff({ state, proposal, blocked, onClose, onApply, issueOverride, compact = false }: { state: LabState; proposal: Proposal; blocked: boolean; onClose: () => void; onApply: () => void; issueOverride?: string | null; compact?: boolean }) {
  const [saving, setSaving] = useState(false);
  const issue = blocked ? "Bu değişikliği şu anda otomatik uygulayamıyorum. Çalışmaların için gerekli kaynak bilgileri eksik. Kaynaklarını tamamladıktan sonra yeniden deneyebilirsin." : issueOverride ?? proposalError(state, proposal);
  useEffect(() => { if (issue) setSaving(false); }, [issue]);
  useEffect(() => { if (!saving) return; const timer = window.setTimeout(onApply, 550); return () => window.clearTimeout(timer); }, [saving, onApply]);
  return <Modal title="Değişiklikleri incele" onClose={onClose} dismissible={!saving}><div className="lab-dialog-content">{!compact && <span className="lab-eyebrow">SON KARAR SENİN</span>}<h2>{proposal.title}</h2><p className="lab-muted">{proposal.reason}</p><Badge>{proposal.changes.length} çalışma etkilenecek</Badge>
    <ul className="lab-plan-diff">{proposal.changes.map(({ before, after }) => <li key={before?.id ?? after?.id}><Icon name={after ? "arrow" : "close"} size={18} /><div><strong>{(after ?? before)!.subject} · {(after ?? before)!.title}</strong>{!before ? <p>Yeni çalışma · {DAYS[after!.day]} · {duration(after!.minutes)}</p> : !after ? <p>{DAYS[before.day]} · {duration(before.minutes)} → Kaldırılacak</p> : <><p>{DAYS[before.day]} · {duration(before.minutes)} <span aria-label="yerine">→</span> <strong>{DAYS[after.day]} · {duration(after.minutes)}</strong></p>{(before.start !== after.start || before.end !== after.end) && <p>Aralık: {before.start}–{before.end} → {after.start}–{after.end}</p>}</>}</div></li>)}{proposal.capacity && <li><Icon name="timer" size={18} /><div><strong>{DAYS[proposal.capacity.day]} · Ayırdığın süre</strong><p>{duration(proposal.capacity.before)} → {duration(proposal.capacity.after)}</p></div></li>}</ul>
    {issue && <p className="lab-error" role="alert">{issue}</p>}
    <div className="lab-dialog-actions"><Button disabled={Boolean(issue) || saving} onClick={() => setSaving(true)} icon="check">{saving ? "Kaydediliyor…" : "Planı güncelle"}</Button><Button tone="quiet" disabled={saving} onClick={onClose}>{issue ? "Geri dön" : "Vazgeç"}</Button></div><p className="lab-muted lab-small">Onaylayana kadar planında hiçbir şey değişmez.</p>
  </div></Modal>;
}
