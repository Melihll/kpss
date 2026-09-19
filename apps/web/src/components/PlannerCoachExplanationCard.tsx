import {
  PLANNER_COACH_PREVIEW_HREF,
  type PlannerCoachExplanationV1,
} from "@kpss-coach/domain";
import { Link } from "react-router-dom";
import { Icon } from "./Icon";

interface PlannerCoachExplanationCardProps {
  readonly explanation: PlannerCoachExplanationV1;
  readonly onOpenPreview: () => void;
}

export function PlannerCoachExplanationCard({
  explanation,
  onOpenPreview,
}: PlannerCoachExplanationCardProps) {
  const action = explanation.previewAction;
  const canOpenPreview = action.availability === "available"
    && action.action === "open_existing_planner_v2_preview"
    && action.href === PLANNER_COACH_PREVIEW_HREF
    && action.autoRunPreview === false
    && action.confirmsProposal === false
    && action.appliesProposal === false;

  return <article className="coach-result tone-neutral" aria-live="polite">
    <span className="coach-result-eyebrow">Planner V2 · salt okunur</span>
    <h3>{explanation.state === "CURRENT_PREVIEW"
      ? "Planner'ın gördüğü durum"
      : explanation.state === "STALE_OR_EXPIRED"
        ? "Planner kanıtı güncel değil"
        : "Planner durumu"}</h3>
    <p>{explanation.answer}</p>
    {explanation.canonicalWarningCodes.length > 0 && <p className="coach-preview-note">
      <Icon name="warning" />
      <span>{explanation.canonicalWarningCodes.length} canonical Planner uyarısı var.</span>
    </p>}
    {canOpenPreview && <Link
      className="secondary-action"
      to={PLANNER_COACH_PREVIEW_HREF}
      onClick={onOpenPreview}
    >
      <Icon name="arrow" weight="bold" />
      {action.label}
    </Link>}
  </article>;
}
