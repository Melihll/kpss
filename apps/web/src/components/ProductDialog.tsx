import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./Icon";
import { trapDialogTab } from "../lib/dialog-focus";

export function ProductDialog({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!open || !element) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    element.showModal(); document.body.style.overflow = "hidden";
    return () => { element.close(); document.body.style.overflow = overflow; trigger?.focus(); };
  }, [open]);
  if (!open) return null;
  return <dialog ref={ref} className="product-dialog" aria-labelledby="product-dialog-title" onKeyDown={(event) => trapDialogTab(event, event.currentTarget)} onCancel={(event) => { event.preventDefault(); onClose(); }}><header><h2 id="product-dialog-title">{title}</h2><button type="button" aria-label="Pencereyi kapat" onClick={onClose}><Icon name="close" /></button></header>{children}</dialog>;
}
