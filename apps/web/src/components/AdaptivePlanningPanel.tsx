import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { AppApiError, callAppApi, FRIENDLY_API_ERRORS } from "../lib/app-api";
import { Icon } from "./Icon";

interface Projection { completed: number; inProgress: number; remaining: number; status: string; projectedCompletionDate: string | null; message: string }
type Backlog = { open_task_count: number; estimated_remaining_minutes: number; severity: string } | null;
type Revision = { explanation: string } | null;
interface Minimum { availableMinutes: number; totalMinutes: number; reason: string; tasks: Array<{ id: string; title: string; minutes: number }> }

const errorText = (error: unknown) => error instanceof AppApiError
  ? (FRIENDLY_API_ERRORS[error.code] ?? error.message)
  : error instanceof Error ? error.message : "İşlem başarısız.";

const STATUS_LABELS: Record<string, string> = {
  on_track: "Yolunda",
  at_risk: "Riskli",
  behind: "Geride",
  unknown: "Veri toplanıyor",
  good: "Yolunda",
  attention: "Dikkat",
  risk: "Riskli",
};

export function AdaptivePlanningPanel() {
  const [projection, setProjection] = useState<Projection | null>(null);
  const [backlog, setBacklog] = useState<Backlog>(null);
  const [revision, setRevision] = useState<Revision>(null);
  const [risks, setRisks] = useState<Array<{ id: string; message: string; severity: string }>>([]);
  const [minimum, setMinimum] = useState<Minimum | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [projectionValue, backlogValue, risksValue, revisionValue, minimumValue] = await Promise.all([
        callAppApi<Projection>("/progress/projection"),
        callAppApi<Backlog>("/backlog/current"),
        callAppApi<Array<{ id: string; message: string; severity: string }>>("/plans/risks"),
        callAppApi<Revision>("/plan-revisions/latest"),
        callAppApi<Minimum>("/plans/minimum-day"),
      ]);
      setProjection(projectionValue);
      setBacklog(backlogValue);
      setRisks(risksValue);
      setRevision(revisionValue);
      setMinimum(minimumValue);
      setError(null);
    } catch (caught) {
      setError(errorText(caught));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function replan(trigger = "manual_request") {
    setBusy(true);
    try {
      await callAppApi("/plans/current/recalculate", { method: "POST", body: { trigger } });
      await load();
      window.dispatchEvent(new Event("kpss:execution-changed"));
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  }

  async function special(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const mode = String(fields.get("mode"));
    const value = Number(fields.get("minutes"));
    const normal = minimum?.availableMinutes ?? 0;
    setBusy(true);
    try {
      await callAppApi("/schedule-exceptions", {
        method: "POST",
        body: {
          date: new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date()),
          type: mode === "extra_available" ? "extra_available" : "custom",
          minutesDelta: mode === "extra_available" ? value : value - normal,
          note: "Web özel durum",
        },
      });
      await replan("capacity_change");
      form.reset();
    } catch (caught) {
      setError(errorText(caught));
      setBusy(false);
    }
  }

  const totalTopics = projection ? projection.completed + projection.inProgress + projection.remaining : 0;
  const completionPercent = projection && totalTopics > 0 ? Math.round((projection.completed / totalTopics) * 100) : 0;
  const minimumPercent = minimum && minimum.availableMinutes > 0 ? Math.min(100, Math.round((minimum.totalMinutes / minimum.availableMinutes) * 100)) : 0;

  return <section className="adaptive-panel panel-card compact-panel">
    <div className="panel-heading">
      <div><span className="panel-kicker">İLERLEME & PROJEKSİYON</span><h2>Yetişiyor muyum?</h2></div>
      {projection && <span className={`status-pill ${projection.status}`}>{STATUS_LABELS[projection.status] ?? projection.status}</span>}
    </div>
    {error && <p className="error">{error}</p>}

    {projection && <>
      <div className="projection-visual">
        <div className="ring-progress" style={{ "--progress": `${completionPercent * 3.6}deg` } as CSSProperties}><span><strong>%{completionPercent}</strong><small>tamamlandı</small></span></div>
        <div className="projection-copy"><strong>{projection.projectedCompletionDate ?? "Veri toplanıyor"}</strong><p>{projection.message}</p><div className="projection-counts"><span><b>{projection.completed}</b>Tamamlanan</span><span><b>{projection.inProgress}</b>Devam</span><span><b>{projection.remaining}</b>Eksik</span></div></div>
      </div>
    </>}

    <div className="adaptive-grid premium-adaptive-grid">
      <article className="mini-card backlog-card"><div className="mini-card-icon"><Icon name="calendar" /></div><div><small>BACKLOG</small><strong>{backlog ? `${backlog.open_task_count} görev` : "Hesaplanıyor"}</strong><p>{backlog ? `${Math.floor(backlog.estimated_remaining_minutes / 60)}s ${backlog.estimated_remaining_minutes % 60}dk kalan yük` : "Plan verisi bekleniyor"}</p></div></article>
      <article className="mini-card minimum-card"><div className="mini-card-icon"><Icon name="target" /></div><div><small>MİNİMUM PLAN</small><strong>{minimum?.totalMinutes ?? 0} / {minimum?.availableMinutes ?? 0} dk</strong><div className="mini-progress"><i style={{ width: `${minimumPercent}%` }} /></div></div></article>
    </div>

    {risks.length > 0 && <div className="risk-stack">{risks.map((risk) => <p className="risk-note" key={risk.id}>{risk.message}</p>)}</div>}

    <details className="soft-details">
      <summary>Bugünkü zamanı değiştir</summary>
      <form className="special-form" onSubmit={special}>
        <label>Durum<select name="mode"><option value="less">Bugün daha az vaktim var</option><option value="extra_available">Ekstra vaktim var</option></select></label>
        <label>Dakika<input name="minutes" min="0" type="number" required /></label>
        <button className="secondary-action" disabled={busy}>Kaydet ve Güncelle</button>
      </form>
    </details>
    <button className="ghost-action full-width" disabled={busy} onClick={() => void replan()}><Icon name="repeat" />Planı yeniden hesapla</button>
    {revision && <p className="revision-explanation"><strong>Son değişiklik:</strong> {revision.explanation}</p>}
  </section>;
}
