import { useCallback, useEffect, useMemo, useState } from "react";
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
const DATE_NAMES: Record<string, string> = { upcoming: "Yaklaşan", due: "Bugün", overdue: "Gecikmiş", critical_overdue: "Gecikmiş" };
const URGENCY_ORDER: Record<Revision["urgency"], number> = { critical_overdue: 0, overdue: 1, due: 2, upcoming: 3 };

export function RevisionPanel() {
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [completed, setCompleted] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setRevisions(await callAppApi<Revision[]>("/revisions")); setError(false); }
    catch { setError(true); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener("kpss:execution-changed", refresh);
    void load();
    return () => window.removeEventListener("kpss:execution-changed", refresh);
  }, [load]);

  async function complete(id: string) {
    setBusy(id); setError(false);
    try {
      await callAppApi(`/revisions/${id}/complete`, { method: "POST" });
      setCompleted(id);
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) await new Promise((resolve) => window.setTimeout(resolve, 180));
      await load();
      setCompleted(null);
      window.dispatchEvent(new Event("kpss:execution-changed"));
    } catch (caught) {
      const message = caught instanceof AppApiError ? (FRIENDLY_API_ERRORS[caught.code] ?? "Tekrar tamamlanamadı.") : "Tekrar tamamlanamadı.";
      console.error("REVISION_COMPLETE_FAILED", message);
      setError(true);
    } finally { setBusy(null); }
  }

  const summary = useMemo(() => ({
    today: revisions.filter((row) => row.urgency === "due").length,
    overdue: revisions.filter((row) => row.urgency === "overdue" || row.urgency === "critical_overdue").length,
    upcoming: revisions.filter((row) => row.urgency === "upcoming").length,
  }), [revisions]);
  const visible = [...revisions].sort((left, right) => URGENCY_ORDER[left.urgency] - URGENCY_ORDER[right.urgency]).slice(0, 5);

  return <section className="progress-analysis-section revision-analysis-section" aria-labelledby="revision-analysis-title">
    <div className="analysis-section-heading"><div><span>Tekrarlar</span><h2 id="revision-analysis-title">Tekrar durumun</h2></div></div>
    {loading && <div className="analysis-row-skeleton" aria-label="Tekrarlar yükleniyor"><span /><span /></div>}
    {error && <div className="inline-state error" role="alert"><span>Tekrarlar yüklenemedi.</span><button type="button" onClick={() => void load()}>Tekrar Dene</button></div>}
    {!loading && <>
      <div className="revision-editorial-summary"><div><strong>{summary.today}</strong><span>Bugün</span></div><div><strong>{summary.overdue}</strong><span>Gecikmiş</span></div><div><strong>{summary.upcoming}</strong><span>Yaklaşan</span></div></div>
      {visible.length ? <div className="revision-analysis-list">{visible.map((row) => <article className={`${completed === row.id ? "is-completed" : ""} ${row.urgency}`} key={row.id}>
        <span className="revision-state-mark" aria-hidden="true">{completed === row.id ? "✓" : ""}</span>
        <div><small>{row.curriculum_nodes?.subjects?.name ?? "Ders"}</small><strong>{row.curriculum_nodes?.name ?? "Konu"}</strong><p>{TYPE_NAMES[row.revision_type] ?? "Tekrar"} · {row.estimated_minutes} dk · {DATE_NAMES[row.urgency]}</p></div>
        <button className="text-button revision-complete-action" type="button" disabled={busy === row.id} onClick={() => void complete(row.id)}>{busy === row.id ? "Tamamlanıyor" : "Tamamla"}</button>
      </article>)}</div> : <p className="analysis-empty compact">Bugün tekrar yok.</p>}
    </>}
  </section>;
}
