import { useEffect, useState } from "react";
import { AppApiError, callAppApi } from "../lib/app-api";
import {
  canApplyPlannerV2Proposal,
  confirmationFailureMessage,
  deriveAppliedPlannerV2State,
  deriveConfirmedPlannerV2State,
  exactPlannerV2ProposalIdentity,
  type AppliedPlannerV2Proposal,
  type ConfirmedPlannerV2Proposal,
  type PlannerV2ProposalIdentity,
} from "../lib/planner-v2-lifecycle-ui";

type Capability = {
  enabled: boolean;
  previewEnabled: boolean;
  confirmationEnabled: boolean;
  applyEnabled: boolean;
  productionMutationAuthority: boolean;
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
  confirmation: PlannerV2ProposalIdentity;
  applyEnabled: boolean;
};

type LocalProposalState = "previewed" | "confirmed" | "applied" | "expired" | "stale" | "invalid";

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
  const [proposalState, setProposalState] = useState<LocalProposalState | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmedPlannerV2Proposal | null>(null);
  const [application, setApplication] = useState<AppliedPlannerV2Proposal | null>(null);
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
    setProposalState(null);
    setConfirmation(null);
    setApplication(null);
    setPayload(null);
    try {
      const next = await callAppApi<PreviewResponse>("/planner-v2/preview", { method: "POST" });
      setPayload({ ...next, confirmation: exactPlannerV2ProposalIdentity(next.confirmation) });
      setProposalState("previewed");
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
      const response = await callAppApi<unknown>("/planner-v2/confirm", {
        method: "POST",
        body: payload.confirmation,
      });
      const authoritative = deriveConfirmedPlannerV2State(response, payload.confirmation);
      setConfirmation(authoritative);
      setProposalState("confirmed");
    } catch (caught) {
      const code = caught instanceof AppApiError ? caught.code : caught instanceof Error ? caught.message : "UNKNOWN";
      if (code === "ACTION_PROPOSAL_EXPIRED") setProposalState("expired");
      else if (code === "ACTION_PROPOSAL_STALE") setProposalState("stale");
      else if (code.includes("IDENTITY") || code.includes("NOT_PENDING") || code.includes("NOT_APPLYABLE")) {
        setProposalState("invalid");
      }
      setConfirmation(null);
      setError(confirmationFailureMessage(code));
    } finally {
      setBusy(false);
    }
  }

  async function applyExactProposal() {
    if (!payload || !confirmation || !canApplyPlannerV2Proposal(capability, confirmation)) return;
    setBusy(true);
    setError("");
    try {
      const response = await callAppApi<unknown>("/planner-v2/apply", {
        method: "POST",
        body: payload.confirmation,
      });
      const authoritative = deriveAppliedPlannerV2State(response, payload.confirmation);
      setApplication(authoritative);
      setProposalState("applied");
    } catch (caught) {
      const code = caught instanceof AppApiError ? caught.code : caught instanceof Error ? caught.message : "UNKNOWN";
      if (code === "ACTION_PROPOSAL_EXPIRED") setProposalState("expired");
      else if (code === "ACTION_PROPOSAL_STALE") setProposalState("stale");
      setError(confirmationFailureMessage(code));
    } finally {
      setBusy(false);
    }
  }

  async function refreshCapability() {
    setBusy(true);
    setError("");
    try {
      setCapability(await callAppApi<Capability>("/planner-v2/capability"));
    } catch (caught) {
      setError(caught instanceof AppApiError ? caught.message : "Planner V2 yetkisi denetlenemedi.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="planner-v2-preview" aria-labelledby="planner-v2-preview-title">
    <div className="planner-v2-preview-head">
      <div>
        <span>Deneysel · işlem yapmaz</span>
        <h2 id="planner-v2-preview-title">Planner V2 haftalık öneri</h2>
        <p>{capability.confirmationEnabled
          ? "Önizleme ve açık onay yereldir. Uygulama yetkisi kapalıdır."
          : "Pilot önizleme modu. Öneri yalnızca incelenebilir."}</p>
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
      {capability.confirmationEnabled || confirmation || proposalState === "applied" ? <div className="planner-v2-confirm">
          <p>{proposalState === "confirmed"
            ? `Bu tam öneri kimliği kalıcı olarak onaylandı. ${capability.applyEnabled ? "Uygulanmaya hazır." : "Apply yetkisi kapalıdır."}`
            : proposalState === "applied"
              ? `${application?.createdTaskIds.length ?? 0} görev güvenli işlemle uygulandı.`
            : `${payload.preview.differences.createCanonicalWorkloadIdentities.length} yeni iş · ${payload.preview.differences.replaceableTaskIds.length} değiştirilebilir gelecek görev`}</p>
          {capability.confirmationEnabled && proposalState !== "applied" && <button type="button"
            disabled={busy || proposalState !== "previewed"}
            onClick={() => void confirmExactProposal()}>
            {proposalState === "confirmed" ? "Tam öneri onaylandı" : "Bu tam öneriyi onayla"}
          </button>}
          {canApplyPlannerV2Proposal(capability, confirmation) && proposalState === "confirmed" &&
            <button type="button" disabled={busy} onClick={() => void applyExactProposal()}>
              Onaylanan planı uygula
            </button>}
          {confirmation && proposalState === "confirmed" && !capability.applyEnabled &&
            <button type="button" className="secondary-button" disabled={busy} onClick={() => void refreshCapability()}>
              Apply yetkisini denetle
            </button>}
        </div> : <div className="planner-v2-preview-only">
          <p>{payload.preview.differences.createCanonicalWorkloadIdentities.length} yeni iş · {payload.preview.differences.replaceableTaskIds.length} değiştirilebilir gelecek görev</p>
          <strong>Pilot önizleme modu · onay kapalı</strong>
        </div>}
    </>}
  </section>;
}
