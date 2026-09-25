import type { CoachSignalCandidateV1 } from "./coach-signal-v1.ts";
import type {
  ProactiveCoachClearConditionObservationV1,
  ProactiveCoachClearConditionSignalTypeV1,
  ProactiveCoachRuntimeCollectionV1,
  ProactiveCoachRuntimePresentationV1,
} from "./proactive-coach-runtime-state-v1.ts";

export const PROACTIVE_COACH_HYSTERESIS_V1_VERSION =
  "proactive-coach-hysteresis-v1" as const;

export type ProactiveCoachHysteresisStatusV1 =
  | "initially_armed"
  | "rearmed"
  | "blocked";

export type ProactiveCoachHysteresisReasonV1 =
  | "no_prior_condition_presentation"
  | "date_scoped_condition_already_presented"
  | "event_instance_already_presented"
  | "clear_condition_authority_unavailable"
  | "persistent_condition_requires_clear_observation"
  | "rearm_not_proven_after_clear"
  | "canonical_clear_and_new_condition_proven";

export interface ProactiveCoachHysteresisDecisionV1 {
  readonly version: typeof PROACTIVE_COACH_HYSTERESIS_V1_VERSION;
  readonly signalType: CoachSignalCandidateV1["signalType"];
  readonly conditionKey: string | null;
  readonly status: ProactiveCoachHysteresisStatusV1;
  readonly allowed: boolean;
  readonly reason: ProactiveCoachHysteresisReasonV1;
  readonly clearConditionRuleCode: string | null;
  readonly latestPresentationAt: string | null;
  readonly clearObservedAt: string | null;
  readonly authority: {
    readonly mode: "deterministic_clear_condition_only";
    readonly cooldownIsHysteresis: false;
    readonly dbReadsAllowed: false;
    readonly dbWritesAllowed: false;
    readonly llmCallsAllowed: false;
    readonly providerCallsAllowed: false;
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

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validTimestamp(value: unknown): value is string {
  return nonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function plannerSourceIdentity(candidate: CoachSignalCandidateV1): string | null {
  const recordIds = candidate.provenance
    .flatMap((item) => item.recordIds)
    .filter(nonEmptyString)
    .sort();
  return recordIds.length > 0 ? [...new Set(recordIds)].join(",") : null;
}

export function buildProactiveCoachConditionKeyV1(
  candidate: CoachSignalCandidateV1,
): string | null {
  if (candidate.signalType === "today_completed_as_planned") {
    return /^\d{4}-\d{2}-\d{2}$/.test(candidate.date ?? "")
      ? `today_completed_as_planned:${candidate.date}`
      : null;
  }
  if (candidate.signalType === "repeated_task_miss") {
    return nonEmptyString(candidate.evidence.taskId)
      ? `repeated_task_miss:${candidate.evidence.taskId}`
      : null;
  }
  if (candidate.signalType === "recent_recovery") {
    const taskId = candidate.evidence.taskId;
    const missedAt = candidate.evidence.missedAt;
    const completedAt = candidate.evidence.completedAt;
    return nonEmptyString(taskId) && validTimestamp(missedAt) && validTimestamp(completedAt)
      ? `recent_recovery:${taskId}:${missedAt}:${completedAt}`
      : null;
  }
  if (candidate.signalType === "planner_warning_present") {
    const identity = plannerSourceIdentity(candidate);
    return identity ? `planner_warning_present:${identity}` : null;
  }
  return null;
}

function ruleCode(signalType: ProactiveCoachClearConditionSignalTypeV1): string {
  if (signalType === "today_completed_as_planned") return "rearm_on_new_user_local_calendar_date_v1";
  if (signalType === "repeated_task_miss") return "rearm_after_same_task_completion_then_two_new_misses_v1";
  if (signalType === "recent_recovery") return "single_presentation_per_exact_miss_completion_event_v1";
  return "rearm_after_canonical_warning_count_zero_then_new_warning_observation_v1";
}

function decision(
  candidate: CoachSignalCandidateV1,
  conditionKey: string | null,
  values: Omit<ProactiveCoachHysteresisDecisionV1, "version" | "signalType" | "conditionKey" | "clearConditionRuleCode" | "authority">,
): ProactiveCoachHysteresisDecisionV1 {
  const launchType = candidate.signalType as ProactiveCoachClearConditionSignalTypeV1;
  return deepFreeze({
    version: PROACTIVE_COACH_HYSTERESIS_V1_VERSION,
    signalType: candidate.signalType,
    conditionKey,
    clearConditionRuleCode: conditionKey ? ruleCode(launchType) : null,
    ...values,
    authority: {
      mode: "deterministic_clear_condition_only",
      cooldownIsHysteresis: false,
      dbReadsAllowed: false,
      dbWritesAllowed: false,
      llmCallsAllowed: false,
      providerCallsAllowed: false,
      plannerProposalAllowed: false,
      plannerConfirmationAllowed: false,
      plannerApplyAllowed: false,
    },
  });
}

function latestPresentation(
  values: readonly ProactiveCoachRuntimePresentationV1[],
  conditionKey: string,
): ProactiveCoachRuntimePresentationV1 | null {
  return [...values]
    .filter((item) => item.conditionKey === conditionKey)
    .sort((left, right) => right.presentedAt.localeCompare(left.presentedAt))[0] ?? null;
}

function latestClear(
  values: readonly ProactiveCoachClearConditionObservationV1[],
  signalType: ProactiveCoachClearConditionSignalTypeV1,
  conditionKey: string,
  after: string,
): ProactiveCoachClearConditionObservationV1 | null {
  return [...values]
    .filter((item) => item.signalType === signalType
      && item.conditionKey === conditionKey
      && item.state === "cleared"
      && Date.parse(item.observedAt) > Date.parse(after))
    .sort((left, right) => right.observedAt.localeCompare(left.observedAt))[0] ?? null;
}

export function evaluateProactiveCoachHysteresisV1(input: {
  readonly candidate: CoachSignalCandidateV1;
  readonly presentations: ProactiveCoachRuntimeCollectionV1<ProactiveCoachRuntimePresentationV1>;
  readonly clearConditions: ProactiveCoachRuntimeCollectionV1<ProactiveCoachClearConditionObservationV1>;
}): ProactiveCoachHysteresisDecisionV1 {
  const { candidate } = input;
  const conditionKey = buildProactiveCoachConditionKeyV1(candidate);
  if (!conditionKey) return decision(candidate, null, {
    status: "blocked",
    allowed: false,
    reason: "rearm_not_proven_after_clear",
    latestPresentationAt: null,
    clearObservedAt: null,
  });

  if (input.presentations.availability !== "known") return decision(candidate, conditionKey, {
    status: "blocked",
    allowed: false,
    reason: "clear_condition_authority_unavailable",
    latestPresentationAt: null,
    clearObservedAt: null,
  });

  const presentation = latestPresentation(input.presentations.values, conditionKey);
  if (!presentation) return decision(candidate, conditionKey, {
    status: "initially_armed",
    allowed: true,
    reason: "no_prior_condition_presentation",
    latestPresentationAt: null,
    clearObservedAt: null,
  });

  if (candidate.signalType === "today_completed_as_planned") return decision(candidate, conditionKey, {
    status: "blocked",
    allowed: false,
    reason: "date_scoped_condition_already_presented",
    latestPresentationAt: presentation.presentedAt,
    clearObservedAt: null,
  });

  if (candidate.signalType === "recent_recovery") return decision(candidate, conditionKey, {
    status: "blocked",
    allowed: false,
    reason: "event_instance_already_presented",
    latestPresentationAt: presentation.presentedAt,
    clearObservedAt: null,
  });

  if (input.clearConditions.availability !== "known") return decision(candidate, conditionKey, {
    status: "blocked",
    allowed: false,
    reason: "clear_condition_authority_unavailable",
    latestPresentationAt: presentation.presentedAt,
    clearObservedAt: null,
  });

  const signalType = candidate.signalType as "repeated_task_miss" | "planner_warning_present";
  const clear = latestClear(input.clearConditions.values, signalType, conditionKey, presentation.presentedAt);
  if (!clear) return decision(candidate, conditionKey, {
    status: "blocked",
    allowed: false,
    reason: "persistent_condition_requires_clear_observation",
    latestPresentationAt: presentation.presentedAt,
    clearObservedAt: null,
  });

  if (candidate.signalType === "repeated_task_miss") {
    const secondLatestMissedAt = candidate.evidence.secondLatestMissedAt;
    const latestMissedAt = candidate.evidence.latestMissedAt;
    const rearmed = validTimestamp(secondLatestMissedAt)
      && validTimestamp(latestMissedAt)
      && Date.parse(secondLatestMissedAt) > Date.parse(clear.observedAt)
      && Date.parse(latestMissedAt) >= Date.parse(secondLatestMissedAt);
    return decision(candidate, conditionKey, {
      status: rearmed ? "rearmed" : "blocked",
      allowed: rearmed,
      reason: rearmed ? "canonical_clear_and_new_condition_proven" : "rearm_not_proven_after_clear",
      latestPresentationAt: presentation.presentedAt,
      clearObservedAt: clear.observedAt,
    });
  }

  const rearmed = validTimestamp(candidate.asOf)
    && Date.parse(candidate.asOf) > Date.parse(clear.observedAt);
  return decision(candidate, conditionKey, {
    status: rearmed ? "rearmed" : "blocked",
    allowed: rearmed,
    reason: rearmed ? "canonical_clear_and_new_condition_proven" : "rearm_not_proven_after_clear",
    latestPresentationAt: presentation.presentedAt,
    clearObservedAt: clear.observedAt,
  });
}
