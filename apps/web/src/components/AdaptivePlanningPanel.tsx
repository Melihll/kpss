import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { AppApiError, callAppApi, FRIENDLY_API_ERRORS } from "../lib/app-api";
import { Icon } from "./Icon";

interface Projection { completed: number; inProgress: number; remaining: number; status: string; projectedCompletionDate: string | null; message: string }
type Backlog = { open_task_count: number; estimated_remaining_minutes: number; severity: string } | null;
interface Minimum { availableMinutes: number; totalMinutes: number; reason: string; tasks: Array<{ id: string; title: string; minutes: number }> }

const errorText = (error: unknown) => error instanceof AppApiError
  ? (FRIENDLY_API_ERRORS[error.code] ?? "İlerleme verileri yüklenemedi.")
  : "İlerleme verileri yüklenemedi.";

const PROJECTION_COPY: Record<string, string> = {
  on_track: "Planın yolunda.",
  good: "Planın yolunda.",
  at_risk: "Mevcut tempoda bazı alanlar dikkat istiyor.",
  attention: "Mevcut tempoda bazı alanlar dikkat istiyor.",
  behind: "Planın biraz gerisindesin.",
  risk: "Planın biraz gerisindesin.",
};

const duration = (minutes: number) => minutes < 60 ? `${minutes} dk` : `${Math.floor(minutes / 60)}s ${minutes % 60 ? `${minutes % 60}dk` : ""}`.trim();

function projectionDate(value: string) {
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Istanbul" }).format(parsed);
}

export function AdaptivePlanningPanel() {
  const [projection, setProjection] = useState<Projection | null>(null);
  const [backlog, setBacklog] = useState<Backlog>(null);
  const [risks, setRisks] = useState<Array<{ id: string; message: string; severity: string }>>([]);
  const [minimum, setMinimum] = useState<Minimum | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


  const load = useCallback(async () => {
    try {
      const [projectionValue, backlogValue, risksValue, minimumValue] = await Promise.all([
        callAppApi<Projection>("/progress/projection"),
        callAppApi<Backlog>("/backlog/current"),
        callAppApi<Array<{ id: string; message: string; severity: string }>>("/plans/risks"),
        callAppApi<Minimum>("/plans/minimum-day"),
      ]);
      setProjection(projectionValue);
      setBacklog(backlogValue);
      setRisks(risksValue);
      setMinimum(minimumValue);
      setError(null);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);



  const totalTopics = projection ? projection.completed + projection.inProgress + projection.remaining : 0;
  const completionPercent = projection && totalTopics > 0 ? Math.round((projection.completed / totalTopics) * 100) : 0;
  const readableState = projection ? PROJECTION_COPY[projection.status] : undefined;
  const hasProjection = Boolean(projection && readableState && totalTopics > 0);
  const minimumPercent = minimum && minimum.availableMinutes > 0 ? Math.min(100, Math.round((minimum.totalMinutes / minimum.availableMinutes) * 100)) : 0;

  return <section className="progress-analysis-section projection-analysis-section" aria-labelledby="projection-analysis-title">
    <div className="analysis-section-heading"><div><span>Sınava yetişme durumu</span><h2 id="projection-analysis-title">Mevcut tempon</h2></div></div>
    {loading && <div className="projection-analysis-skeleton" aria-label="Sınava yetişme durumu yükleniyor"><span /><div /></div>}
    {error && <div className="inline-state error" role="alert"><span>İlerleme tahmini yüklenemedi.</span><button type="button" onClick={() => void load()}>Tekrar Dene</button></div>}
    {!loading && !error && <>
      {hasProjection && projection ? <div className="projection-readable-state">
        <div><span>Bu tempoyla</span><strong>{readableState}</strong>{projection.projectedCompletionDate && <p>Tahmini tamamlanma: <b>{projectionDate(projection.projectedCompletionDate)}</b></p>}</div>
        <div className="projection-completion"><strong>%{completionPercent}</strong><span>konu tamamlandı</span></div>
        <div className="projection-analysis-line" role="progressbar" aria-label="Konu tamamlanma oranı" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completionPercent}><i style={{ "--analysis-progress": `${completionPercent}%` } as CSSProperties} /></div>
        <dl><div><dt>Tamamlanan</dt><dd>{projection.completed}</dd></div><div><dt>Devam eden</dt><dd>{projection.inProgress}</dd></div><div><dt>Kalan</dt><dd>{projection.remaining}</dd></div></dl>
        {risks.length > 0 && <p className="projection-attention-note">Planında {risks.length} dikkat noktası bulunuyor.</p>}
      </div> : <div className="projection-insufficient"><strong>Henüz hesaplamak için yeterli çalışma verisi yok.</strong></div>}

      <details className="projection-details">
        <summary><span>Plan ayrıntıları</span><Icon name="arrow" /></summary>
        <div className="projection-detail-grid">
          <div><span>Kalan iş yükü</span><strong>{backlog ? `${backlog.open_task_count} görev` : "Henüz hesaplanmadı"}</strong>{backlog && <small>{duration(backlog.estimated_remaining_minutes)}</small>}</div>
          <div><span>Minimum çalışma hedefi</span><strong>{minimum ? `${minimum.totalMinutes} / ${minimum.availableMinutes} dk` : "Henüz hesaplanmadı"}</strong>{minimum && <div className="projection-mini-line" role="progressbar" aria-label="Minimum çalışma hedefi" aria-valuemin={0} aria-valuemax={100} aria-valuenow={minimumPercent}><i style={{ "--analysis-progress": `${minimumPercent}%` } as CSSProperties} /></div>}</div>
        </div>
        <p className="projection-attention-note">
          Vaktin değiştiyse Bugün ekranındaki “Vaktim Değişti” ile Koç üzerinden Planner önizlemesine geç.
        </p>
      </details>
    </>}
  </section>;
}
