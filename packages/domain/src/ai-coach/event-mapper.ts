import type { PlanningTriggerV2 } from "../planning-v2/triggers";
import type {
  AiEvidenceV1,
  AiInterpretationV1,
  CapacityChangeRequestEvidenceV1,
} from "./types";

export type AiDomainActionV1 =
  | "NO_REPLAN"
  | "EVIDENCE_ONLY"
  | "PLANNING_TRIGGER_CANDIDATE";

export interface AiDomainEventCandidateV1 {
  readonly action: AiDomainActionV1;
  readonly planningTriggerCandidate: PlanningTriggerV2 | null;
  readonly effectiveDate: string | null;
  readonly evidence: readonly AiEvidenceV1[];
  readonly reasonCodes: readonly string[];
  readonly requiresDeterministicReview: boolean;
  readonly planMutationAllowed: false;
}

function sortedUnique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort((a, b) => a.localeCompare(b)));
}

export function mapAiInterpretationToDomainEventV1(
  interpretation: AiInterpretationV1,
): AiDomainEventCandidateV1 {
  const capacity = interpretation.evidence.find(
    (item): item is CapacityChangeRequestEvidenceV1 =>
      item.type === "CAPACITY_CHANGE_REQUEST",
  );
  const reasonCodes = sortedUnique([
    ...(interpretation.reasonCode ? [interpretation.reasonCode] : []),
    ...interpretation.evidence.flatMap((item) => item.reasonCode ? [item.reasonCode] : []),
  ]);

  if (interpretation.needsClarification) {
    return Object.freeze({
      action: "NO_REPLAN",
      planningTriggerCandidate: null,
      effectiveDate: interpretation.effectiveDate,
      evidence: interpretation.evidence,
      reasonCodes: sortedUnique([...reasonCodes, "AI_CLARIFICATION_REQUIRED"]),
      requiresDeterministicReview: true,
      planMutationAllowed: false,
    });
  }

  if (capacity?.direction) {
    return Object.freeze({
      action: "PLANNING_TRIGGER_CANDIDATE",
      planningTriggerCandidate:
        capacity.direction === "INCREASE"
          ? "CAPACITY_INCREASE"
          : "CAPACITY_DECREASE",
      effectiveDate: capacity.effectiveDate ?? interpretation.effectiveDate,
      evidence: interpretation.evidence,
      reasonCodes: sortedUnique([...reasonCodes, "AI_CAPACITY_EVIDENCE_VALIDATED"]),
      requiresDeterministicReview: true,
      planMutationAllowed: false,
    });
  }

  const evidenceOnly = interpretation.evidence.some((item) =>
    item.type !== "GENERAL_COACH_MESSAGE",
  );
  return Object.freeze({
    action: evidenceOnly ? "EVIDENCE_ONLY" : "NO_REPLAN",
    planningTriggerCandidate: null,
    effectiveDate: interpretation.effectiveDate,
    evidence: interpretation.evidence,
    reasonCodes: sortedUnique([
      ...reasonCodes,
      evidenceOnly ? "AI_LEARNER_EVIDENCE_ONLY" : "AI_GENERAL_COACHING_ONLY",
    ]),
    requiresDeterministicReview: evidenceOnly,
    planMutationAllowed: false,
  });
}
