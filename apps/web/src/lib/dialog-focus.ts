/** Keep keyboard navigation inside an open native dialog, including after resize. */
export function trapDialogTab(event: { key: string; shiftKey: boolean; preventDefault: () => void }, dialog: HTMLElement) {
  if (event.key !== "Tab") return;
  const elements = Array.from(dialog.querySelectorAll<HTMLElement>(
    'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => element.getClientRects().length > 0 && element.getAttribute("aria-hidden") !== "true");
  const first = elements[0];
  const last = elements.at(-1);
  if (!first || !last) { event.preventDefault(); dialog.focus(); return; }
  if (!dialog.contains(document.activeElement) || document.activeElement === dialog ||
    (event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  }
}
