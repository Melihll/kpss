import type { LearningStage, LearningStageEvidenceInput } from "./learning-stage";

export type MaterialProgressState =
  | "not_started"
  | "in_progress"
  | "completed"
  | "skipped";

export type MaterialTopicMappingState =
  | "validated"
  | "ambiguous"
  | "missing";

export type MaterialEvidenceProvenance =
  | "observed"
  | "user_confirmed"
  | "trusted_import"
  | "corrected"
  | "ai_recommendation";

export interface MaterialStageEvidenceUnit {
  unitId: string;
  targetId: string;
  stage: LearningStage;
  required: boolean;
  progress: MaterialProgressState;
  topicMapping: MaterialTopicMappingState;
  provenance: MaterialEvidenceProvenance;
  forgotten?: boolean;
}

export interface MaterialStageEvidenceRequest {
  targetId: string;
  stage: LearningStage;
  units: MaterialStageEvidenceUnit[];
}

export interface MaterialStageEvidenceSummary extends LearningStageEvidenceInput {
  unknown: boolean;
  remediationRequired: boolean;
}

function isAuthoritativeProvenance(
  provenance: MaterialEvidenceProvenance,
): boolean {
  return provenance !== "ai_recommendation";
}

export function summarizeMaterialStageEvidence(
  request: MaterialStageEvidenceRequest,
): MaterialStageEvidenceSummary {
  const relevantUnits = request.units.filter(
    (unit) =>
      unit.targetId === request.targetId &&
      unit.stage === request.stage &&
      unit.required,
  );

  let completedRequiredUnits = 0;
  let unknown = false;
  let remediationRequired = false;

  for (const unit of relevantUnits) {
    const mappingAccepted = unit.topicMapping === "validated";
    const provenanceAccepted = isAuthoritativeProvenance(unit.provenance);

    if (!mappingAccepted || !provenanceAccepted) {
      unknown = true;
    }

    if (
      unit.progress === "completed" &&
      mappingAccepted &&
      provenanceAccepted
    ) {
      completedRequiredUnits += 1;
    }

    if (
      unit.forgotten === true &&
      unit.progress === "completed" &&
      mappingAccepted &&
      provenanceAccepted
    ) {
      remediationRequired = true;
    }
  }

  return {
    requiredUnits: relevantUnits.length,
    completedRequiredUnits,
    unknown,
    remediationRequired,
  };
}
