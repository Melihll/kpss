export const LEARNING_STAGE_POLICY_VERSION = "pln-004-v1" as const;

export type LearningStage = "learn" | "practice" | "review" | "reinforcement";

export type LearningStageState =
  | "not_started"
  | "in_progress"
  | "satisfied"
  | "remediation_required"
  | "unknown";

export interface LearningStageEvidenceInput {
  requiredUnits: number;
  completedRequiredUnits: number;
  unknown?: boolean;
  remediationRequired?: boolean;
  acceptedPriorEvidence?: boolean;
  explicitlySkipped?: boolean;
}

export interface LearningStageEvidenceSet {
  learn: LearningStageEvidenceInput;
  practice: LearningStageEvidenceInput;
  review: LearningStageEvidenceInput;
  reinforcement: LearningStageEvidenceInput;
  allowNonAdvancingReview?: boolean;
}

export interface LearningStageDecision {
  state: LearningStageState;
  allowed: boolean;
  blockedBy: LearningStage[];
  reason: string;
}

export interface LearningStageEvaluation {
  policyVersion: typeof LEARNING_STAGE_POLICY_VERSION;
  stages: Record<LearningStage, LearningStageDecision>;
}

function resolveState(input: LearningStageEvidenceInput): LearningStageState {
  if (input.remediationRequired) return "remediation_required";
  if (input.unknown) return "unknown";
  if (input.acceptedPriorEvidence) return "satisfied";

  if (
    input.requiredUnits > 0 &&
    input.completedRequiredUnits >= input.requiredUnits
  ) {
    return "satisfied";
  }

  if (input.completedRequiredUnits > 0) return "in_progress";

  return "not_started";
}

export function evaluateLearningStage(
  evidence: LearningStageEvidenceSet,
): LearningStageEvaluation {
  const states: Record<LearningStage, LearningStageState> = {
    learn: resolveState(evidence.learn),
    practice: resolveState(evidence.practice),
    review: resolveState(evidence.review),
    reinforcement: resolveState(evidence.reinforcement),
  };

  const learnSatisfied = states.learn === "satisfied";
  const practiceSatisfied = states.practice === "satisfied";

  const practiceBlockedBy: LearningStage[] = learnSatisfied ? [] : ["learn"];

  const advancedBlockedBy: LearningStage[] = [];
  if (!learnSatisfied) advancedBlockedBy.push("learn");
  if (!practiceSatisfied) advancedBlockedBy.push("practice");

  const nonAdvancingReviewAllowed =
    evidence.allowNonAdvancingReview === true &&
    learnSatisfied &&
    !practiceSatisfied;

  const reviewAllowed =
    nonAdvancingReviewAllowed || advancedBlockedBy.length === 0;

  const reviewBlockedBy = nonAdvancingReviewAllowed
    ? []
    : [...advancedBlockedBy];

  const reviewReason = nonAdvancingReviewAllowed
    ? "explicit_non_advancing_review"
    : advancedBlockedBy.length === 0
      ? "learning_path_prerequisites_satisfied"
      : "learning_path_prerequisites_unsatisfied";

  return {
    policyVersion: LEARNING_STAGE_POLICY_VERSION,
    stages: {
      learn: {
        state: states.learn,
        allowed: true,
        blockedBy: [],
        reason:
          states.learn === "remediation_required"
            ? "learn_remediation_required"
            : "learn_available",
      },
      practice: {
        state: states.practice,
        allowed: practiceBlockedBy.length === 0,
        blockedBy: practiceBlockedBy,
        reason:
          practiceBlockedBy.length === 0
            ? "learn_prerequisite_satisfied"
            : "learn_prerequisite_unsatisfied",
      },
      review: {
        state: states.review,
        allowed: reviewAllowed,
        blockedBy: reviewBlockedBy,
        reason: reviewReason,
      },
      reinforcement: {
        state: states.reinforcement,
        allowed: advancedBlockedBy.length === 0,
        blockedBy: [...advancedBlockedBy],
        reason:
          advancedBlockedBy.length === 0
            ? "learning_path_prerequisites_satisfied"
            : "learning_path_prerequisites_unsatisfied",
      },
    },
  };
}
