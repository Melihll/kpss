import type {
  CoachSignalAttentionCategoryV1,
  CoachSignalCandidateV1,
} from "./coach-signal-v1.ts";
// @ts-expect-error Supabase Deno requires the explicit local TypeScript extension.
import { evaluateProactiveCoachMaterialityV1 } from "./proactive-coach-materiality-policy-v1.ts";
import {
  buildProactiveCoachConditionKeyV1,
  evaluateProactiveCoachHysteresisV1,
// @ts-expect-error Supabase Deno requires the explicit local TypeScript extension.
} from "./proactive-coach-hysteresis-v1.ts";
import type {
  ProactiveCoachRuntimeCategorySnoozeV1,
  ProactiveCoachRuntimePresentationV1,
  ProactiveCoachRuntimeStateV1,
} from "./proactive-coach-runtime-state-v1.ts";

export const PROACTIVE_COACH_SELECTION_V1_VERSION =
  "proactive-coach-selection-v1" as const;

export const PROACTIVE_COACH_POLICY_V1 = Object.freeze({
  sameFingerprintCooldownMs: 72 * 60 * 60 * 1000,
  categoryCooldownMs: 24 * 60 * 60 * 1000,
  dailyAttentionLimit: 1,
  surfaceSessionAttentionLimit: 1,
  acceptedConfidence: ["high", "medium"] as const,
});

export type ProactiveCoachSuppressionReasonV1 =
  | "not_proactive_candidate"
  | "fact_not_fresh"
  | "confidence_insufficient"
  | "materiality_threshold_unresolved"
  | "materiality_evidence_invalid"
  | "materiality_not_satisfied"
  | "materiality_not_actionable"
  | "active_study_session_authority_unavailable"
  | "active_study_session"
  | "user_controls_authority_unavailable"
  | "presentation_history_authority_unavailable"
  | "hysteresis_condition_already_presented"
  | "hysteresis_clear_condition_unavailable"
  | "hysteresis_rearm_not_proven"
  | "category_disabled"
  | "category_snoozed"
  | "fingerprint_dismissed"
  | "same_fingerprint_cooldown"
  | "category_cooldown"
  | "daily_attention_budget"
  | "surface_session_attention_budget";

export type ProactiveCoachPresentationV1 = ProactiveCoachRuntimePresentationV1;
export type ProactiveCoachCategorySnoozeV1 = ProactiveCoachRuntimeCategorySnoozeV1;
export type ProactiveCoachPolicyStateV1 = ProactiveCoachRuntimeStateV1;

export interface ProactiveCoachSuppressionV1 {
  readonly dedupeKey: string;
  readonly fingerprint: string;
  readonly attentionCategory: CoachSignalAttentionCategoryV1;
  readonly reason: ProactiveCoachSuppressionReasonV1;
}

export interface ProactiveCoachSelectionV1 {
  readonly version: typeof PROACTIVE_COACH_SELECTION_V1_VERSION;
  readonly evaluatedAt: string;
  readonly currentDate: string;
  readonly outcome: "selected" | "silence";
  readonly selectedCandidate: CoachSignalCandidateV1 | null;
  readonly selectedFingerprint: string | null;
  readonly selectedConditionKey: string | null;
  readonly suppressions: readonly ProactiveCoachSuppressionV1[];
  readonly authority: {
    readonly mode: "deterministic_in_app_selection_only";
    readonly inAppOnly: true;
    readonly generatesProse: false;
    readonly llmCallsAllowed: false;
    readonly providerCallsAllowed: false;
    readonly dbWritesAllowed: false;
    readonly plannerProposalAllowed: false;
    readonly plannerConfirmationAllowed: false;
    readonly plannerApplyAllowed: false;
  };
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);

  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }

  return value;
}

function parseTimestamp(value: string, errorCode: string): number {
  const parsed = Date.parse(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(errorCode);
  }

  return parsed;
}

function stableEvidence(candidate: CoachSignalCandidateV1): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(candidate.evidence)
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
  );
}

function stableProvenance(candidate: CoachSignalCandidateV1): string {
  return JSON.stringify(
    candidate.provenance
      .map((item) => ({
        source: item.source,
        recordIds: [...item.recordIds].sort(),
      }))
      .sort(
        (left, right) =>
          left.source.localeCompare(right.source) ||
          left.recordIds.join("|").localeCompare(right.recordIds.join("|")),
      ),
  );
}

/**
 * Deterministic factual fingerprint for one proactive candidate.
 *
 * Refresh-only timestamps are deliberately excluded. Rebuilding the same
 * authoritative factual state must preserve the same fingerprint so the
 * 72-hour suppression cannot be bypassed by a newer context read.
 *
 * Freshness is evaluated separately before selection. Material evidence,
 * signal identity and source-record identity remain part of the fingerprint,
 * so a meaningful authoritative state change can produce a new fingerprint.
 */
export function buildProactiveCoachFingerprintV1(
  candidate: CoachSignalCandidateV1,
): string {
  return [
    "proactive-fingerprint-v1",
    candidate.dedupeKey,
    candidate.signalType,
    candidate.reasonCode,
    candidate.subjectId ?? "global",
    candidate.date ?? "any-date",
    stableEvidence(candidate),
    stableProvenance(candidate),
  ].join("|");
}

function authority(): ProactiveCoachSelectionV1["authority"] {
  return {
    mode: "deterministic_in_app_selection_only",
    inAppOnly: true,
    generatesProse: false,
    llmCallsAllowed: false,
    providerCallsAllowed: false,
    dbWritesAllowed: false,
    plannerProposalAllowed: false,
    plannerConfirmationAllowed: false,
    plannerApplyAllowed: false,
  };
}

function candidatePriority(
  candidate: CoachSignalCandidateV1,
): readonly [number, number, string, string] {
  const importance = {
    high: 0,
    medium: 1,
    low: 2,
  } as const;

  const severity = {
    warning: 0,
    notice: 1,
    info: 2,
  } as const;

  return [
    importance[candidate.importance],
    severity[candidate.severity],
    candidate.signalType,
    candidate.dedupeKey,
  ];
}

function compareCandidates(
  left: CoachSignalCandidateV1,
  right: CoachSignalCandidateV1,
): number {
  const a = candidatePriority(left);
  const b = candidatePriority(right);

  return (
    a[0] - b[0] ||
    a[1] - b[1] ||
    a[2].localeCompare(b[2]) ||
    a[3].localeCompare(b[3])
  );
}

function mostRecentPresentation(
  presentations: readonly ProactiveCoachRuntimePresentationV1[],
  predicate: (value: ProactiveCoachRuntimePresentationV1) => boolean,
): ProactiveCoachRuntimePresentationV1 | undefined {
  let mostRecent: ProactiveCoachRuntimePresentationV1 | undefined;
  let mostRecentAt = Number.NEGATIVE_INFINITY;

  for (const presentation of presentations) {
    if (!predicate(presentation)) {
      continue;
    }

    const presentedAt = parseTimestamp(
      presentation.presentedAt,
      "PROACTIVE_PRESENTATION_TIME_INVALID",
    );

    if (presentedAt > mostRecentAt) {
      mostRecent = presentation;
      mostRecentAt = presentedAt;
    }
  }

  return mostRecent;
}

function suppressionReason(
  candidate: CoachSignalCandidateV1,
  fingerprint: string,
  state: ProactiveCoachPolicyStateV1,
  nowMs: number,
): ProactiveCoachSuppressionReasonV1 | null {
  if (!candidate.eligibility.proactiveCandidate) {
    return "not_proactive_candidate";
  }

  if (
    candidate.freshness.state !== "fresh" ||
    (candidate.freshness.expiresAt !== null &&
      nowMs >=
        parseTimestamp(
          candidate.freshness.expiresAt,
          "PROACTIVE_FRESHNESS_EXPIRY_INVALID",
        ))
  ) {
    return "fact_not_fresh";
  }

  if (
    !PROACTIVE_COACH_POLICY_V1.acceptedConfidence.includes(
      candidate.confidence as "high" | "medium",
    )
  ) {
    return "confidence_insufficient";
  }

  const materiality = evaluateProactiveCoachMaterialityV1(candidate);

  if (materiality.materiality === "unresolved") {
    return materiality.suppressionReason === "required_evidence_missing_or_invalid"
      || materiality.suppressionReason === "candidate_contract_mismatch"
      || materiality.suppressionReason === "confidence_below_policy_minimum"
      ? "materiality_evidence_invalid"
      : "materiality_threshold_unresolved";
  }

  if (materiality.materiality === "not_material") {
    return "materiality_not_satisfied";
  }

  if (!materiality.actionable) {
    return "materiality_not_actionable";
  }

  if (state.activeStudySession.availability !== "known" || state.activeStudySession.value === null) {
    return "active_study_session_authority_unavailable";
  }

  if (state.activeStudySession.value.active) {
    return "active_study_session";
  }

  if (
    state.disabledCategories.availability !== "known"
    || state.snoozes.availability !== "known"
    || state.dismissedFingerprints.availability !== "known"
  ) {
    return "user_controls_authority_unavailable";
  }

  if (
    state.disabledCategories.values.includes(
      candidate.eligibility.attentionCategory,
    )
  ) {
    return "category_disabled";
  }

  const snooze = state.snoozes.values.find(
    (item) =>
      item.attentionCategory === candidate.eligibility.attentionCategory &&
      nowMs < parseTimestamp(item.until, "PROACTIVE_SNOOZE_TIME_INVALID"),
  );

  if (snooze) {
    return "category_snoozed";
  }

  if (state.dismissedFingerprints.values.includes(fingerprint)) {
    return "fingerprint_dismissed";
  }

  if (state.presentations.availability !== "known") {
    return "presentation_history_authority_unavailable";
  }

  const hysteresis = evaluateProactiveCoachHysteresisV1({
    candidate,
    presentations: state.presentations,
    clearConditions: state.clearConditions,
  });
  if (!hysteresis.allowed) {
    if (hysteresis.reason === "clear_condition_authority_unavailable") {
      return "hysteresis_clear_condition_unavailable";
    }
    if (hysteresis.reason === "rearm_not_proven_after_clear"
      || hysteresis.reason === "persistent_condition_requires_clear_observation") {
      return "hysteresis_rearm_not_proven";
    }
    return "hysteresis_condition_already_presented";
  }

  const sameFingerprint = mostRecentPresentation(
    state.presentations.values,
    (item) => item.fingerprint === fingerprint,
  );

  if (
    sameFingerprint &&
    nowMs -
      parseTimestamp(
        sameFingerprint.presentedAt,
        "PROACTIVE_PRESENTATION_TIME_INVALID",
      ) <
      PROACTIVE_COACH_POLICY_V1.sameFingerprintCooldownMs
  ) {
    return "same_fingerprint_cooldown";
  }

  const sameCategory = mostRecentPresentation(
    state.presentations.values,
    (item) =>
      item.attentionCategory === candidate.eligibility.attentionCategory,
  );

  if (
    sameCategory &&
    nowMs -
      parseTimestamp(
        sameCategory.presentedAt,
        "PROACTIVE_PRESENTATION_TIME_INVALID",
      ) <
      PROACTIVE_COACH_POLICY_V1.categoryCooldownMs
  ) {
    return "category_cooldown";
  }

  const dailyCount = state.presentations.values.filter(
    (item) => item.calendarDate === state.currentDate,
  ).length;

  if (dailyCount >= PROACTIVE_COACH_POLICY_V1.dailyAttentionLimit) {
    return "daily_attention_budget";
  }

  const surfaceCount = state.presentations.values.filter(
    (item) => item.surfaceSessionId === state.surfaceSessionId,
  ).length;

  if (
    surfaceCount >=
    PROACTIVE_COACH_POLICY_V1.surfaceSessionAttentionLimit
  ) {
    return "surface_session_attention_budget";
  }

  return null;
}

export function selectProactiveCoachInsightV1(
  candidates: readonly CoachSignalCandidateV1[],
  state: ProactiveCoachPolicyStateV1,
): ProactiveCoachSelectionV1 {
  const nowMs = parseTimestamp(state.now, "PROACTIVE_NOW_INVALID");

  const ordered = [...candidates].sort(compareCandidates);
  const suppressions: ProactiveCoachSuppressionV1[] = [];

  for (const candidate of ordered) {
    const fingerprint = buildProactiveCoachFingerprintV1(candidate);
    const conditionKey = buildProactiveCoachConditionKeyV1(candidate);
    const reason = suppressionReason(
      candidate,
      fingerprint,
      state,
      nowMs,
    );

    if (reason) {
      suppressions.push({
        dedupeKey: candidate.dedupeKey,
        fingerprint,
        attentionCategory: candidate.eligibility.attentionCategory,
        reason,
      });
      continue;
    }

    return deepFreeze({
      version: PROACTIVE_COACH_SELECTION_V1_VERSION,
      evaluatedAt: state.now,
      currentDate: state.currentDate,
      outcome: "selected",
      selectedCandidate: structuredClone(candidate),
      selectedFingerprint: fingerprint,
      selectedConditionKey: conditionKey,
      suppressions,
      authority: authority(),
    });
  }

  return deepFreeze({
    version: PROACTIVE_COACH_SELECTION_V1_VERSION,
    evaluatedAt: state.now,
    currentDate: state.currentDate,
    outcome: "silence",
    selectedCandidate: null,
    selectedFingerprint: null,
    selectedConditionKey: null,
    suppressions,
    authority: authority(),
  });
}
