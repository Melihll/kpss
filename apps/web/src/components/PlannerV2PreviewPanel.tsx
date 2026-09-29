import { useEffect, useRef, useState } from "react";
import { AppApiError, callAppApi, FRIENDLY_API_ERRORS } from "../lib/app-api";
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
import {
  plannerBlockedReasonLabel,
  plannerBoundaryLabel,
  plannerFactLabel,
  plannerMaterialLabel,
} from "../lib/planner-v2-presentation";

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

function requestFailureMessage(caught: unknown, fallback: string): string {
  if (!(caught instanceof AppApiError)) return fallback;
  return FRIENDLY_API_ERRORS[caught.code] ?? fallback;
}

export function PlannerV2PreviewPanel() {
  const panelRef = useRef<HTMLElement | null>(null);
  const [capability, setCapability] = useState<Capability | null>(null);
  const [payload, setPayload] = useState<PreviewResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [proposalState, setProposalState] = useState<LocalProposalState | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmedPlannerV2Proposal | null>(null);
  const [application, setApplication] = useState<AppliedPlannerV2Proposal | null>(null);
  const [error, setError] = useState("");

  // Presentation-only handoff context. This must never trigger Preview itself.
  const coachHandoffTarget =
    typeof window !== "undefined"
    && window.location.hash === "#planner-v2-preview";

  useEffect(() => {
    let active = true;
    void callAppApi<Capability>("/planner-v2/capability")
      .then((value) => { if (active) setCapability(value); })
      .catch(() => { if (active) setCapability(null); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!capability?.enabled || window.location.hash !== "#planner-v2-preview") return;
    window.requestAnimationFrame(() => {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      panelRef.current?.focus({ preventScroll: true });
    });
  }, [capability?.enabled]);

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
      setError(requestFailureMessage(caught, "Plan önerisi oluşturulamadı. Lütfen tekrar deneyin."));
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
      setError(requestFailureMessage(caught, "Plan uygulama durumu denetlenemedi. Lütfen tekrar deneyin."));
    } finally {
      setBusy(false);
    }
  }

  return <section
    id="planner-v2-preview"
    ref={panelRef}
    tabIndex={-1}
    className="planner-v2-preview"
    aria-labelledby="planner-v2-preview-title"
  >
    <div className="planner-v2-preview-head">
      <div>
        <span>Önizleme · planını değiştirmez</span>
        <h2 id="planner-v2-preview-title">Haftalık plan önerisi</h2>
        {coachHandoffTarget && !payload && <p className="planner-v2-handoff-copy">
          Koçtan planlayıcıya geçtin. Koç yalnız mevcut durumu yorumladı; henüz yeni bir öneri oluşturulmadı. Öneri yalnız aşağıdaki düğmeye bastığında hazırlanır.
        </p>}
        {coachHandoffTarget && payload && <p className="planner-v2-handoff-copy">
          Planlayıcının güncel önerisi hazır. Aşağıdaki sonuç, mevcut program ve çalışma verilerine göre hesaplandı; planına henüz uygulanmadı.
        </p>}
        <p>{capability.confirmationEnabled
          ? "Öneriyi inceleyebilir ve onaylayabilirsin; plana uygulama şu anda kapalı."
          : "Pilot önizleme modu. Öneri yalnızca incelenebilir."}</p>
      </div>
      <button type="button" className="secondary-button" disabled={busy} onClick={() => void generate()}>
        {busy && !payload ? "Hazırlanıyor…" : payload ? "Yeniden oluştur" : "Öneriyi hesapla"}
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
          {day.items.map((item, index) => <p key={item.canonicalWorkloadIdentity}>
            <b>{plannerMaterialLabel(item.materialType)} {index + 1}</b>
            <span>{item.estimatedMinutes} dk · {plannerBoundaryLabel(item.boundary.kind)}</span>
          </p>)}
        </article>)}
      </div>
      {payload.preview.blocked.length > 0 && <div className="planner-v2-blocked">
        <strong>Şimdilik plana eklenemeyen çalışmalar</strong>
        {payload.preview.blocked.map((item, index) => <p key={`${item.canonicalWorkloadIdentity}:${item.blockedReason}`}>
          <b>Çalışma {index + 1}</b> · {plannerBlockedReasonLabel(item.blockedReason)}
        </p>)}
      </div>}
      <details className="planner-v2-facts"><summary>Nedenler ve değişim kapsamı</summary>
        <ul>{payload.preview.explanationFacts.map((fact, index) => <li key={`${fact.kind}:${index}`}>{plannerFactLabel(fact)}</li>)}</ul>
      </details>
      {capability.confirmationEnabled || confirmation || proposalState === "applied" ? <div className="planner-v2-confirm">
          <p>{proposalState === "confirmed"
            ? `Bu öneri onaylandı. ${capability.applyEnabled ? "Uygulanmaya hazır." : "Plana uygulama şu anda kapalı."}`
            : proposalState === "applied"
              ? `${application?.createdTaskIds.length ?? 0} görev güvenli işlemle uygulandı.`
            : `${payload.preview.differences.createCanonicalWorkloadIdentities.length} yeni iş · ${payload.preview.differences.replaceableTaskIds.length} değiştirilebilir gelecek görev`}</p>
          {capability.confirmationEnabled && proposalState !== "applied" && <button type="button"
            disabled={busy || proposalState !== "previewed"}
            onClick={() => void confirmExactProposal()}>
            {proposalState === "confirmed" ? "Öneri onaylandı" : "Bu öneriyi onayla"}
          </button>}
          {canApplyPlannerV2Proposal(capability, confirmation) && proposalState === "confirmed" &&
            <button type="button" disabled={busy} onClick={() => void applyExactProposal()}>
              Onaylanan planı uygula
            </button>}
          {confirmation && proposalState === "confirmed" && !capability.applyEnabled &&
            <button type="button" className="secondary-button" disabled={busy} onClick={() => void refreshCapability()}>
              Uygulama durumunu yenile
            </button>}
        </div> : <div className="planner-v2-preview-only">
          <p>{payload.preview.differences.createCanonicalWorkloadIdentities.length} yeni iş · {payload.preview.differences.replaceableTaskIds.length} değiştirilebilir gelecek görev</p>
          <strong>Pilot önizleme modu · onay kapalı</strong>
        </div>}
    </>}
  </section>;
}
