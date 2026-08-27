import { useEffect, useState } from "react";
import { AppApiError, callAppApi } from "../lib/app-api";

type Capability = {
  enabled: boolean;
  previewEnabled: boolean;
  confirmationEnabled: boolean;
  applyEnabled: false;
  productionMutationAuthority: false;
};

type PreviewItem = {
  canonicalWorkloadIdentity: string;
  materialType: string;
  estimatedMinutes: number;
  reasonCodes: string[];
  boundary: { kind: string };
};

type PlannerPreview = {
  proposalId: string;
  proposalFingerprint: string;
  snapshotFingerprint: string;
  plannerVersion: string;
  summary: {
    totalAvailableMinutes: number;
    protectedMinutes: number;
    newlyPlannedMinutes: number;
    unusedMinutes: number;
    unmetEligibleMinutes: number;
    blockedDemandCount: number;
  };
  days: Array<{
    date: string;
    availableMinutes: number;
    protectedMinutes: number;
    proposedMinutes: number;
    unusedMinutes: number;
    warnings: string[];
    items: PreviewItem[];
  }>;
  blocked: Array<{ canonicalWorkloadIdentity: string; blockedReason: string }>;
  differences: {
    createCanonicalWorkloadIdentities: string[];
    retainedTaskIds: string[];
    replaceableTaskIds: string[];
    outsideScopeTaskIds: string[];
  };
  explanationFacts: Array<{ kind: string; [key: string]: unknown }>;
};

type PreviewResponse = {
  preview: PlannerPreview;
  confirmation: {
    recordId: string;
    proposalId: string;
    proposalFingerprint: string;
    snapshotFingerprint: string;
    plannerVersion: string;
  };
  applyEnabled: false;
};

function factLabel(fact: PlannerPreview["explanationFacts"][number]): string {
  if (fact.kind === "day_capacity") return `${fact.date}: ${fact.availableMinutes} dk kullanılabilir.`;
  if (fact.kind === "continuation_selected") return `${fact.canonicalWorkloadIdentity} devam işi olduğu için öne alındı.`;
  if (fact.kind === "blocked_workload") return `${fact.canonicalWorkloadIdentity} engelli: ${fact.reason}.`;
  if (fact.kind === "current_day_protected") return `${fact.date}: bugünkü görevler korunuyor.`;
  if (fact.kind === "unused_capacity") return `${fact.date}: bölünemeyen sonraki iş sığmadığı için ${fact.unusedMinutes} dk boş.`;
  if (fact.kind === "replacement_scope") return "Yalnızca açıkça listelenen gelecek Planner V2 görevleri değiştirilebilir.";
  return fact.kind;
}

export function PlannerV2PreviewPanel() {
  const [capability, setCapability] = useState<Capability | null>(null);
  const [payload, setPayload] = useState<PreviewResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void callAppApi<Capability>("/planner-v2/capability")
      .then((value) => { if (active) setCapability(value); })
      .catch(() => { if (active) setCapability(null); });
    return () => { active = false; };
  }, []);

  if (!capability?.enabled) return null;

  async function generate() {
    setBusy(true);
    setError("");
    setConfirmed(false);
    try {
      setPayload(await callAppApi<PreviewResponse>("/planner-v2/preview", { method: "POST" }));
    } catch (caught) {
      setError(caught instanceof AppApiError ? caught.message : "Planner V2 önizlemesi oluşturulamadı.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmExactProposal() {
    if (!payload) return;
    setBusy(true);
    setError("");
    try {
      await callAppApi("/planner-v2/confirm", {
        method: "POST",
        body: payload.confirmation,
      });
      setConfirmed(true);
    } catch (caught) {
      setError(caught instanceof AppApiError ? caught.message : "Öneri onaylanamadı.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="planner-v2-preview" aria-labelledby="planner-v2-preview-title">
    <div className="planner-v2-preview-head">
      <div>
        <span>Deneysel · işlem yapmaz</span>
        <h2 id="planner-v2-preview-title">Planner V2 haftalık öneri</h2>
        <p>Önizleme ve açık onay yereldir. Uygulama yetkisi kapalıdır.</p>
      </div>
      <button type="button" className="secondary-button" disabled={busy} onClick={() => void generate()}>
        {busy && !payload ? "Hazırlanıyor…" : payload ? "Yeniden oluştur" : "Planner V2 önizlemesi oluştur"}
      </button>
    </div>
    {error && <p className="inline-state error" role="alert">{error}</p>}
    {payload && <>
      <div className="planner-v2-summary">
        <span><b>{payload.preview.summary.totalAvailableMinutes}</b> dk kapasite</span>
        <span><b>{payload.preview.summary.protectedMinutes}</b> dk korunan</span>
        <span><b>{payload.preview.summary.newlyPlannedMinutes}</b> dk yeni</span>
        <span><b>{payload.preview.summary.unusedMinutes}</b> dk boş</span>
      </div>
      <div className="planner-v2-days">
        {payload.preview.days.map((day) => <article key={day.date}>
          <strong>{day.date}</strong>
          <small>{day.proposedMinutes} dk öneri · {day.protectedMinutes} dk korunan · {day.unusedMinutes} dk boş</small>
          {day.items.map((item) => <p key={item.canonicalWorkloadIdentity}>
            <b>{item.canonicalWorkloadIdentity}</b><span>{item.materialType} · {item.estimatedMinutes} dk · {item.boundary.kind}</span>
          </p>)}
        </article>)}
      </div>
      {payload.preview.blocked.length > 0 && <div className="planner-v2-blocked">
        <strong>Planlanamayan kanonik işler</strong>
        {payload.preview.blocked.map((item) => <p key={`${item.canonicalWorkloadIdentity}:${item.blockedReason}`}>
          {item.canonicalWorkloadIdentity} · {item.blockedReason}
        </p>)}
      </div>}
      <details className="planner-v2-facts"><summary>Nedenler ve değişim kapsamı</summary>
        <ul>{payload.preview.explanationFacts.map((fact, index) => <li key={`${fact.kind}:${index}`}>{factLabel(fact)}</li>)}</ul>
      </details>
      <div className="planner-v2-confirm">
        <p>{confirmed
          ? "Bu tam öneri kimliği onaylandı. Apply üretimde ve bu ekranda kapalıdır."
          : `${payload.preview.differences.createCanonicalWorkloadIdentities.length} yeni iş · ${payload.preview.differences.replaceableTaskIds.length} değiştirilebilir gelecek görev`}</p>
        <button type="button" disabled={busy || confirmed} onClick={() => void confirmExactProposal()}>
          {confirmed ? "Tam öneri onaylandı" : "Bu tam öneriyi onayla"}
        </button>
      </div>
    </>}
  </section>;
}
