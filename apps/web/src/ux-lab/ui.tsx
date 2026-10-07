import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Icon, type IconName } from "../components/Icon";
import { duration, SUBJECT_COLORS, taskScope, type Material, type Task } from "./model";

export function Button({ children, tone = "primary", icon, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "primary" | "secondary" | "quiet" | "danger"; icon?: IconName }) {
  return <button type="button" className={`lab-button ${tone} ${className}`} {...props}>{icon && <Icon name={icon} size={18} />}{children}</button>;
}
export function IconButton({ label, icon, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; icon: IconName }) {
  return <button type="button" className="lab-icon-button" aria-label={label} title={label} {...props}><Icon name={icon} /></button>;
}
export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "warning" }) {
  return <span className={`lab-badge ${tone}`}>{children}</span>;
}
export function Progress({ value, max = 100, label }: { value: number; max?: number; label: string }) {
  const percent = max > 0 ? Math.min(100, Math.max(0, value / max * 100)) : 0;
  return <div className="lab-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max || 100} aria-valuenow={Math.min(max, Math.max(0, value))}><span style={{ width: `${percent}%` }} /></div>;
}
export function SectionHeading({ title, aside }: { title: string; aside?: ReactNode }) {
  return <div className="lab-section-heading"><h2>{title}</h2>{aside}</div>;
}
export function PageHeading({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: ReactNode }) {
  return <header className="lab-page-heading"><div><span className="lab-eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{children}</header>;
}
export function EmptyState({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <div className="lab-empty"><span className="lab-empty-icon"><Icon name="check" size={28} /></span><h2>{title}</h2><p>{description}</p>{children}</div>;
}
export function Skeleton({ label = "İçerik hazırlanıyor" }: { label?: string }) {
  return <div className="lab-skeleton" role="status" aria-label={label}><span /><span /><div /><span /><span /><span className="lab-sr-only">{label}</span></div>;
}
export function Modal({ title, children, onClose, kind = "modal", dismissible = true }: { title: string; children: ReactNode; onClose: () => void; kind?: "modal" | "drawer" | "session"; dismissible?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const dialog = ref.current;
    dialog?.showModal();
    dialog?.focus({ preventScroll: true });
    document.body.style.overflow = "hidden";
    return () => { dialog?.close(); document.body.style.overflow = previousOverflow; if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={ref} tabIndex={-1} className={`lab-dialog lab-${kind}`} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); if (dismissible) onClose(); }} onKeyDown={(event) => {
    if (event.key !== "Tab") return;
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary, [tabindex="0"]')).filter((node) => node.getClientRects().length > 0);
    const first = items[0];
    const last = items.at(-1);
    if (!first || !last) { event.preventDefault(); return; }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === event.currentTarget)) { event.preventDefault(); first.focus(); }
  }}>
    <header className="lab-dialog-header"><span id={titleId}>{title}</span>{kind !== "session" && <IconButton icon="close" label="Kapat" onClick={onClose} disabled={!dismissible} />}</header>
    {children}
  </dialog>;
}
export function TaskCard({ task, material, onStart, onEdit, onResource }: { task: Task; material: Material; onStart?: () => void; onEdit?: () => void; onResource?: () => void }) {
  return <article className={`lab-task ${task.done ? "is-complete" : ""}`}>
    <span className="lab-task-dot" style={{ background: SUBJECT_COLORS[task.subject] }}>{task.done && <Icon name="check" size={13} />}</span>
    <div className="lab-task-copy"><span className="lab-meta">{task.subject} · {material.activity}</span><h3>{task.title}</h3><span className="lab-muted">{taskScope(task, material)} · {duration(task.minutes)}</span>{onResource && <button className="lab-text-link resource-link" onClick={onResource}>{material.name}<Icon name="arrow" size={13} /></button>}</div>
    {task.done ? <Badge tone="success">Tamamlandı</Badge> : onStart ? <IconButton label={`${task.subject} çalışmasını başlat`} icon="play" onClick={onStart} /> : onEdit ? <Button tone="quiet" onClick={onEdit}>Düzenle</Button> : null}
  </article>;
}
