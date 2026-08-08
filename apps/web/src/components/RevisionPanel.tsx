import { useCallback, useEffect, useState } from "react";
import { AppApiError, callAppApi, FRIENDLY_API_ERRORS } from "../lib/app-api";

interface Revision {
  id: string;
  scheduled_for: string;
  revision_type: string;
  estimated_minutes: number;
  urgency: "upcoming" | "due" | "overdue" | "critical_overdue";
  curriculum_nodes: { name: string; subjects: { name: string } | null } | null;
}
const TYPE_NAMES: Record<string, string> = { short_review: "Kısa tekrar", wrong_review: "Yanlış inceleme", topic_test: "Konu testi", intensive_review: "Yoğun tekrar" };
const DATE_NAMES: Record<string, string> = { upcoming: "Yaklaşan", due: "Bugün", overdue: "Gecikmiş", critical_overdue: "Kritik gecikmiş" };

export function RevisionPanel() {
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setRevisions(await callAppApi<Revision[]>("/revisions")); setError(null); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Tekrarlar yüklenemedi."); }
  }, []);
  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener("kpss:execution-changed", refresh);
    void load();
    return () => window.removeEventListener("kpss:execution-changed", refresh);
  }, [load]);
  async function complete(id: string) {
    setBusy(id); setError(null);
    try {
      await callAppApi(`/revisions/${id}/complete`, { method: "POST" });
      await load();
      window.dispatchEvent(new Event("kpss:execution-changed"));
    } catch (caught) {
      setError(caught instanceof AppApiError ? (FRIENDLY_API_ERRORS[caught.code] ?? caught.message) : caught instanceof Error ? caught.message : "İşlem başarısız.");
    } finally { setBusy(null); }
  }
  const today = revisions.filter((row) => row.urgency === "due").length;
  const overdue = revisions.filter((row) => row.urgency === "overdue" || row.urgency === "critical_overdue").length;
  const upcoming = revisions.filter((row) => row.urgency === "upcoming").length;
  return <section className="revision-panel">
    <h2>TEKRARLAR</h2>
    {error && <p className="error">{error}</p>}
    <dl className="stats"><div><dt>Bugün</dt><dd>{today}</dd></div><div><dt>Gecikmiş</dt><dd>{overdue}</dd></div><div><dt>Yaklaşan</dt><dd>{upcoming}</dd></div></dl>
    <div className="revision-list">{revisions.map((row) => <article className="revision-card" key={row.id}>
      <div><small>{row.curriculum_nodes?.subjects?.name ?? "Ders"}</small><h3>{row.curriculum_nodes?.name ?? "Konu"}</h3><p>{TYPE_NAMES[row.revision_type]} — {row.estimated_minutes} dk · {DATE_NAMES[row.urgency]}</p></div>
      <button disabled={busy === row.id} onClick={() => void complete(row.id)}>Tamamla</button>
    </article>)}</div>
  </section>;
}
