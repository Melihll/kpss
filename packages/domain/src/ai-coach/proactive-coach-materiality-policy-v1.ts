import type {
  CoachSignalAttentionCategoryV1,
  CoachSignalCandidateV1,
  CoachSignalConfidenceV1,
  CoachSignalReasonCodeV1,
  CoachSignalTypeV1,
} from "./coach-signal-v1.ts";

export const PROACTIVE_COACH_MATERIALITY_POLICY_V1_VERSION =
  "proactive-coach-materiality-policy-v1" as const;

export const PROACTIVE_COACH_MATERIALITY_THRESHOLD_V1_VERSION =
  "proactive-materiality-threshold-v1" as const;

export const PROACTIVE_COACH_MATERIALITY_SIGNAL_TYPES_V1 = [
  "today_completed_as_planned",
  "today_partial_completion",
  "repeated_task_miss",
  "subject_recent_completion_drop",
  "schedule_capacity_change",
  "recent_recovery",
  "planner_warning_present",
  "material_progress_stalled",
] as const satisfies readonly CoachSignalTypeV1[];

export type ProactiveCoachMaterialitySignalTypeV1 =
  (typeof PROACTIVE_COACH_MATERIALITY_SIGNAL_TYPES_V1)[number];

export type ProactiveCoachMaterialityStatusV1 =
  | "material"
  | "not_material"
  | "unresolved";

export type ProactiveCoachMaterialitySuppressionReasonV1 =
  | "signal_not_in_materiality_policy"
  | "materiality_threshold_unresolved"
  | "confidence_below_policy_minimum"
  | "candidate_contract_mismatch"
  | "required_evidence_missing_or_invalid"
  | "materiality_rule_not_satisfied";

export interface ProactiveCoachMaterialityPolicyEntryV1 {
  readonly signalType: ProactiveCoachMaterialitySignalTypeV1;
  readonly thresholdVersion: typeof PROACTIVE_COACH_MATERIALITY_THRESHOLD_V1_VERSION;
  readonly launchEnabled: boolean;
  readonly minimumAcceptedConfidence: "medium";
  readonly requiredReasonCode: CoachSignalReasonCodeV1;
  readonly requiredAttentionCategory: CoachSignalAttentionCategoryV1;
  readonly requiredEvidenceKeys: readonly string[];
  readonly materialityRuleCode: string;
  readonly actionabilityRuleCode: string | null;
  readonly recoveryHysteresisRuleCode: string;
}

export interface ProactiveCoachMaterialityDecisionV1 {
  readonly version: typeof PROACTIVE_COACH_MATERIALITY_POLICY_V1_VERSION;
  readonly signalType: CoachSignalTypeV1;
  readonly thresholdVersion: typeof PROACTIVE_COACH_MATERIALITY_THRESHOLD_V1_VERSION | null;
  readonly launchEnabled: boolean;
  readonly minimumAcceptedConfidence: "medium" | null;
  readonly materiality: ProactiveCoachMaterialityStatusV1;
  readonly actionable: boolean;
  readonly materialityRuleCode: string | null;
  readonly actionabilityRuleCode: string | null;
  readonly recoveryHysteresisRuleCode: string | null;
  readonly suppressionReason: ProactiveCoachMaterialitySuppressionReasonV1 | null;
  readonly authority: {
    readonly mode: "deterministic_materiality_actionability_only";
    readonly generatesProse: false;
    readonly llmCallsAllowed: false;
    readonly providerCallsAllowed: false;
    readonly dbReadsAllowed: false;
    readonly dbWritesAllowed: false;
    readonly plannerPreviewAllowed: false;
    readonly plannerProposalAllowed: false;
    readonly plannerConfirmationAllowed: false;
    readonly plannerApplyAllowed: false;
  };
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}

function entry(
  value: ProactiveCoachMaterialityPolicyEntryV1,
): ProactiveCoachMaterialityPolicyEntryV1 {
  return value;
}

export const PROACTIVE_COACH_MATERIALITY_POLICY_V1 = deepFreeze({
  version: PROACTIVE_COACH_MATERIALITY_POLICY_V1_VERSION,
  thresholdVersion: PROACTIVE_COACH_MATERIALITY_THRESHOLD_V1_VERSION,
  entries: [
    entry({
      signalType: "today_completed_as_planned",
      thresholdVersion: PROACTIVE_COACH_MATERIALITY_THRESHOLD_V1_VERSION,
      launchEnabled: true,
      minimumAcceptedConfidence: "medium",
      requiredReasonCode: "today_all_tasks_completed_with_planned_credit",
      requiredAttentionCategory: "progress",
      requiredEvidenceKeys: ["completedTaskCount", "plannedCreditMinutes", "plannedMinutes"],
      materialityRuleCode: "today_completed_count_positive_and_planned_credit_covers_planned_v1",
      actionabilityRuleCode: "acknowledge_completed_plan_or_review_today_v1",
      recoveryHysteresisRuleCode: "clear_on_user_local_date_scope_rollover_v1",
    }),
    entry({
      signalType: "today_partial_completion",
      thresholdVersion: PROACTIVE_COACH_MATERIALITY_THRESHOLD_V1_VERSION,
      launchEnabled: false,
      minimumAcceptedConfidence: "medium",
      requiredReasonCode: "today_partial_task_count_present",
      requiredAttentionCategory: "progress",
      requiredEvidenceKeys: ["partiallyCompletedTaskCount", "remainingMinutes"],
      materialityRuleCode: "unresolved_partial_completion_materiality_threshold_v1",
      actionabilityRuleCode: null,
      recoveryHysteresisRuleCode: "unresolved_partial_completion_clear_threshold_v1",
    }),
    entry({
      signalType: "repeated_task_miss",
      thresholdVersion: PROACTIVE_COACH_MATERIALITY_THRESHOLD_V1_VERSION,
      launchEnabled: true,
      minimumAcceptedConfidence: "medium",
      requiredReasonCode: "same_task_missed_multiple_times_in_recent_window",
      requiredAttentionCategory: "consistency",
      requiredEvidenceKeys: ["distinctMissCount", "taskId", "windowEnd", "windowStart"],
      materialityRuleCode: "same_task_distinct_miss_count_at_least_two_v1",
      actionabilityRuleCode: "review_same_task_miss_pattern_or_ask_conditions_changed_v1",
      recoveryHysteresisRuleCode: "clear_on_same_task_canonical_recovery_after_latest_miss_v1",
    }),
    entry({
      signalType: "subject_recent_completion_drop",
      thresholdVersion: PROACTIVE_COACH_MATERIALITY_THRESHOLD_V1_VERSION,
      launchEnabled: false,
      minimumAcceptedConfidence: "medium",
      requiredReasonCode: "canonical_completion_drop_input_present",
      requiredAttentionCategory: "progress",
      requiredEvidenceKeys: ["dropValue", "subjectId"],
      materialityRuleCode: "unresolved_completion_drop_unit_and_threshold_v1",
      actionabilityRuleCode: null,
      recoveryHysteresisRuleCode: "unresolved_completion_drop_recovery_threshold_v1",
    }),
    entry({
      signalType: "schedule_capacity_change",
      thresholdVersion: PROACTIVE_COACH_MATERIALITY_THRESHOLD_V1_VERSION,
      launchEnabled: false,
      minimumAcceptedConfidence: "medium",
      requiredReasonCode: "canonical_capacity_change_input_present",
      requiredAttentionCategory: "capacity",
      requiredEvidenceKeys: ["capacityDeltaMinutes", "date"],
      materialityRuleCode: "unresolved_capacity_delta_materiality_threshold_v1",
      actionabilityRuleCode: null,
      recoveryHysteresisRuleCode: "unresolved_capacity_delta_clear_threshold_v1",
    }),
    entry({
      signalType: "recent_recovery",
      thresholdVersion: PROACTIVE_COACH_MATERIALITY_THRESHOLD_V1_VERSION,
      launchEnabled: true,
      minimumAcceptedConfidence: "medium",
      requiredReasonCode: "completed_after_recent_miss",
      requiredAttentionCategory: "consistency",
      requiredEvidenceKeys: ["completedAt", "missedAt", "taskId"],
      materialityRuleCode: "same_task_completion_timestamp_after_miss_timestamp_v1",
      actionabilityRuleCode: "acknowledge_resumed_completion_without_trait_inference_v1",
      recoveryHysteresisRuleCode: "clear_on_new_same_task_miss_after_recovery_v1",
    }),
    entry({
      signalType: "planner_warning_present",
      thresholdVersion: PROACTIVE_COACH_MATERIALITY_THRESHOLD_V1_VERSION,
      launchEnabled: true,
      minimumAcceptedConfidence: "medium",
      requiredReasonCode: "persisted_planner_warning_count_present",
      requiredAttentionCategory: "planner",
      requiredEvidenceKeys: ["lifecycleState", "warningCount"],
      materialityRuleCode: "fresh_persisted_planner_warning_count_at_least_one_v1",
      actionabilityRuleCode: "explain_warning_or_offer_user_initiated_planner_review_v1",
      recoveryHysteresisRuleCode: "clear_on_fresh_persisted_planner_warning_count_zero_v1",
    }),
    entry({
      signalType: "material_progress_stalled",
      thresholdVersion: PROACTIVE_COACH_MATERIALITY_THRESHOLD_V1_VERSION,
      launchEnabled: false,
      minimumAcceptedConfidence: "medium",
      requiredReasonCode: "canonical_material_stall_input_present",
      requiredAttentionCategory: "material",
      requiredEvidenceKeys: ["materialViewId", "progressState"],
      materialityRuleCode: "unresolved_source_owned_material_stall_threshold_v1",
      actionabilityRuleCode: null,
      recoveryHysteresisRuleCode: "unresolved_material_stall_recovery_threshold_v1",
    }),
  ] as const,
});

const ENTRY_BY_SIGNAL = new Map(
  PROACTIVE_COACH_MATERIALITY_POLICY_V1.entries.map((item) => [item.signalType, item]),
);

const PLANNER_LIFECYCLE_STATES = new Set([
  "generated",
  "previewed",
  "confirmed",
  "applied",
  "stale",
  "rejected",
  "expired",
]);

function authority(): ProactiveCoachMaterialityDecisionV1["authority"] {
  return {
    mode: "deterministic_materiality_actionability_only",
    generatesProse: false,
    llmCallsAllowed: false,
    providerCallsAllowed: false,
    dbReadsAllowed: false,
    dbWritesAllowed: false,
    plannerPreviewAllowed: false,
    plannerProposalAllowed: false,
    plannerConfirmationAllowed: false,
    plannerApplyAllowed: false,
  };
}

function confidenceAccepted(
  confidence: CoachSignalConfidenceV1,
  minimum: "medium",
): boolean {
  const rank = { low: 0, medium: 1, high: 2 } as const;
  return rank[confidence] >= rank[minimum];
}

function finiteInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && Number.isFinite(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validTimestamp(value: unknown): value is string {
  return nonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function validEvidenceShape(
  candidate: CoachSignalCandidateV1,
  policy: ProactiveCoachMaterialityPolicyEntryV1,
): boolean {
  return policy.requiredEvidenceKeys.every((key) =>
    Object.prototype.hasOwnProperty.call(candidate.evidence, key),
  );
}

function evaluateLaunchRule(candidate: CoachSignalCandidateV1): {
  readonly evidenceValid: boolean;
  readonly material: boolean;
} {
  const evidence = candidate.evidence;

  switch (candidate.signalType) {
    case "today_completed_as_planned": {
      const completed = evidence.completedTaskCount;
      const planned = evidence.plannedMinutes;
      const credit = evidence.plannedCreditMinutes;
      const evidenceValid = finiteInteger(completed) && finiteInteger(planned) && finiteInteger(credit)
        && completed >= 0 && planned >= 0 && credit >= 0;
      return { evidenceValid, material: evidenceValid && completed > 0 && credit >= planned };
    }
    case "repeated_task_miss": {
      const count = evidence.distinctMissCount;
      const evidenceValid = finiteInteger(count) && count >= 0
        && nonEmptyString(evidence.taskId)
        && validTimestamp(evidence.windowStart)
        && validTimestamp(evidence.windowEnd);
      return { evidenceValid, material: evidenceValid && count >= 2 };
    }
    case "recent_recovery": {
      const missedAt = evidence.missedAt;
      const completedAt = evidence.completedAt;
      const evidenceValid = nonEmptyString(evidence.taskId)
        && validTimestamp(missedAt)
        && validTimestamp(completedAt);
      return {
        evidenceValid,
        material: evidenceValid && Date.parse(completedAt) > Date.parse(missedAt),
      };
    }
    case "planner_warning_present": {
      const count = evidence.warningCount;
      const evidenceValid = finiteInteger(count) && count >= 0
        && nonEmptyString(evidence.lifecycleState)
        && PLANNER_LIFECYCLE_STATES.has(evidence.lifecycleState);
      return { evidenceValid, material: evidenceValid && count >= 1 };
    }
    default:
      return { evidenceValid: false, material: false };
  }
}

function decision(
  candidate: CoachSignalCandidateV1,
  policy: ProactiveCoachMaterialityPolicyEntryV1 | null,
  values: Pick<
    ProactiveCoachMaterialityDecisionV1,
    "materiality" | "actionable" | "suppressionReason"
  >,
): ProactiveCoachMaterialityDecisionV1 {
  return deepFreeze({
    version: PROACTIVE_COACH_MATERIALITY_POLICY_V1_VERSION,
    signalType: candidate.signalType,
    thresholdVersion: policy?.thresholdVersion ?? null,
    launchEnabled: policy?.launchEnabled ?? false,
    minimumAcceptedConfidence: policy?.minimumAcceptedConfidence ?? null,
    materiality: values.materiality,
    actionable: values.actionable,
    materialityRuleCode: policy?.materialityRuleCode ?? null,
    actionabilityRuleCode: policy?.actionabilityRuleCode ?? null,
    recoveryHysteresisRuleCode: policy?.recoveryHysteresisRuleCode ?? null,
    suppressionReason: values.suppressionReason,
    authority: authority(),
  });
}

export function evaluateProactiveCoachMaterialityV1(
  candidate: CoachSignalCandidateV1,
): ProactiveCoachMaterialityDecisionV1 {
  const policy = ENTRY_BY_SIGNAL.get(candidate.signalType as ProactiveCoachMaterialitySignalTypeV1) ?? null;

  if (!policy) {
    return decision(candidate, null, {
      materiality: "unresolved",
      actionable: false,
      suppressionReason: "signal_not_in_materiality_policy",
    });
  }

  if (!policy.launchEnabled) {
    return decision(candidate, policy, {
      materiality: "unresolved",
      actionable: false,
      suppressionReason: "materiality_threshold_unresolved",
    });
  }

  if (!confidenceAccepted(candidate.confidence, policy.minimumAcceptedConfidence)) {
    return decision(candidate, policy, {
      materiality: "unresolved",
      actionable: false,
      suppressionReason: "confidence_below_policy_minimum",
    });
  }

  if (
    candidate.reasonCode !== policy.requiredReasonCode
    || candidate.eligibility.attentionCategory !== policy.requiredAttentionCategory
    || !candidate.eligibility.proactiveCandidate
  ) {
    return decision(candidate, policy, {
      materiality: "unresolved",
      actionable: false,
      suppressionReason: "candidate_contract_mismatch",
    });
  }

  if (!validEvidenceShape(candidate, policy)) {
    return decision(candidate, policy, {
      materiality: "unresolved",
      actionable: false,
      suppressionReason: "required_evidence_missing_or_invalid",
    });
  }

  const evaluated = evaluateLaunchRule(candidate);
  if (!evaluated.evidenceValid) {
    return decision(candidate, policy, {
      materiality: "unresolved",
      actionable: false,
      suppressionReason: "required_evidence_missing_or_invalid",
    });
  }

  if (!evaluated.material) {
    return decision(candidate, policy, {
      materiality: "not_material",
      actionable: false,
      suppressionReason: "materiality_rule_not_satisfied",
    });
  }

  return decision(candidate, policy, {
    materiality: "material",
    actionable: policy.actionabilityRuleCode !== null,
    suppressionReason: null,
  });
}
