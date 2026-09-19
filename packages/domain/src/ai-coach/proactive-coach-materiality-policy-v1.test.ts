import { describe, expect, it } from "vitest";
import type { CoachSignalCandidateV1 } from "./coach-signal-v1";
import {
  evaluateProactiveCoachMaterialityV1,
  PROACTIVE_COACH_MATERIALITY_POLICY_V1,
  PROACTIVE_COACH_MATERIALITY_SIGNAL_TYPES_V1,
} from "./proactive-coach-materiality-policy-v1";

function candidate(
  signalType: CoachSignalCandidateV1["signalType"],
  overrides: Partial<CoachSignalCandidateV1> = {},
): CoachSignalCandidateV1 {
  const variants: Partial<Record<CoachSignalCandidateV1["signalType"], Partial<CoachSignalCandidateV1>>> = {
    today_completed_as_planned: {
      reasonCode: "today_all_tasks_completed_with_planned_credit",
      evidence: { completedTaskCount: 3, plannedCreditMinutes: 90, plannedMinutes: 90 },
      date: "2026-09-19",
      eligibility: { reactiveExplanation: true, proactiveCandidate: true, attentionCategory: "progress", cooldownClass: "daily", silenceAllowed: true },
    },
    today_partial_completion: {
      reasonCode: "today_partial_task_count_present",
      evidence: { partiallyCompletedTaskCount: 1, remainingMinutes: 20 },
      eligibility: { reactiveExplanation: true, proactiveCandidate: true, attentionCategory: "progress", cooldownClass: "state_change", silenceAllowed: true },
    },
    repeated_task_miss: {
      reasonCode: "same_task_missed_multiple_times_in_recent_window",
      evidence: { distinctMissCount: 2, taskId: "task-1", windowEnd: "2026-09-19T00:00:00.000Z", windowStart: "2026-09-12T00:00:00.000Z" },
      eligibility: { reactiveExplanation: true, proactiveCandidate: true, attentionCategory: "consistency", cooldownClass: "weekly", silenceAllowed: true },
    },
    subject_recent_completion_drop: {
      reasonCode: "canonical_completion_drop_input_present",
      evidence: { dropValue: 99, subjectId: "subject-1" },
      eligibility: { reactiveExplanation: true, proactiveCandidate: true, attentionCategory: "progress", cooldownClass: "weekly", silenceAllowed: true },
    },
    schedule_capacity_change: {
      reasonCode: "canonical_capacity_change_input_present",
      evidence: { capacityDeltaMinutes: 600, date: "2026-09-19" },
      eligibility: { reactiveExplanation: true, proactiveCandidate: true, attentionCategory: "capacity", cooldownClass: "state_change", silenceAllowed: true },
    },
    recent_recovery: {
      reasonCode: "completed_after_recent_miss",
      evidence: { completedAt: "2026-09-19T09:00:00.000Z", missedAt: "2026-09-18T09:00:00.000Z", taskId: "task-1" },
      eligibility: { reactiveExplanation: true, proactiveCandidate: true, attentionCategory: "consistency", cooldownClass: "state_change", silenceAllowed: true },
    },
    planner_warning_present: {
      reasonCode: "persisted_planner_warning_count_present",
      evidence: { lifecycleState: "previewed", warningCount: 1 },
      eligibility: { reactiveExplanation: true, proactiveCandidate: true, attentionCategory: "planner", cooldownClass: "state_change", silenceAllowed: true },
    },
    material_progress_stalled: {
      reasonCode: "canonical_material_stall_input_present",
      evidence: { materialViewId: "material-1", progressState: "in_progress" },
      eligibility: { reactiveExplanation: true, proactiveCandidate: true, attentionCategory: "material", cooldownClass: "weekly", silenceAllowed: true },
    },
  };

  return {
    version: "coach-signal-candidate-v1",
    signalType,
    severity: "warning",
    importance: "high",
    subjectId: null,
    date: null,
    reasonCode: "required_truth_unavailable",
    sourceFactPaths: ["fixture.fact"],
    asOf: "2026-09-19T09:00:00.000Z",
    freshness: { state: "fresh", asOf: "2026-09-19T09:00:00.000Z", expiresAt: null },
    confidence: "high",
    evidence: {},
    provenance: [],
    dedupeKey: `fixture:${signalType}`,
    eligibility: { reactiveExplanation: true, proactiveCandidate: true, attentionCategory: "progress", cooldownClass: "state_change", silenceAllowed: true },
    authority: {
      mode: "factual_signal_only_read_only",
      createsProductTruth: false,
      generatesProse: false,
      dbWritesAllowed: false,
      workloadCalculationAllowed: false,
      plannerPreviewAllowed: false,
      plannerProposalAllowed: false,
      plannerConfirmationAllowed: false,
      plannerApplyAllowed: false,
      llmCallsAllowed: false,
      providerCallsAllowed: false,
    },
    ...variants[signalType],
    ...overrides,
  };
}

describe("Proactive Coach Materiality / Actionability Policy V1", () => {
  it("defines one immutable auditable policy entry for all eight proactive signals", () => {
    expect(PROACTIVE_COACH_MATERIALITY_POLICY_V1.entries.map((item) => item.signalType)).toEqual(PROACTIVE_COACH_MATERIALITY_SIGNAL_TYPES_V1);
    expect(PROACTIVE_COACH_MATERIALITY_POLICY_V1.entries).toHaveLength(8);
    expect(Object.isFrozen(PROACTIVE_COACH_MATERIALITY_POLICY_V1)).toBe(true);
    expect(PROACTIVE_COACH_MATERIALITY_POLICY_V1.entries.every((item) => Object.isFrozen(item) && Object.isFrozen(item.requiredEvidenceKeys))).toBe(true);
  });

  it.each([
    "today_completed_as_planned",
    "repeated_task_miss",
    "recent_recovery",
    "planner_warning_present",
  ] as const)("launches %s only from independently valid evidence", (signalType) => {
    expect(evaluateProactiveCoachMaterialityV1(candidate(signalType))).toMatchObject({
      signalType,
      launchEnabled: true,
      materiality: "material",
      actionable: true,
      suppressionReason: null,
    });
  });

  it.each([
    "today_partial_completion",
    "subject_recent_completion_drop",
    "schedule_capacity_change",
    "material_progress_stalled",
  ] as const)("keeps unresolved %s silent regardless of large-looking evidence", (signalType) => {
    expect(evaluateProactiveCoachMaterialityV1(candidate(signalType))).toMatchObject({
      signalType,
      launchEnabled: false,
      materiality: "unresolved",
      actionable: false,
      suppressionReason: "materiality_threshold_unresolved",
    });
  });

  it("rejects a completion label whose credit does not cover planned minutes", () => {
    expect(evaluateProactiveCoachMaterialityV1(candidate("today_completed_as_planned", {
      evidence: { completedTaskCount: 3, plannedCreditMinutes: 89, plannedMinutes: 90 },
    }))).toMatchObject({ materiality: "not_material", actionable: false, suppressionReason: "materiality_rule_not_satisfied" });
  });

  it("rejects repeated-miss evidence below two distinct misses or without task identity", () => {
    expect(evaluateProactiveCoachMaterialityV1(candidate("repeated_task_miss", {
      evidence: { distinctMissCount: 1, taskId: "task-1", windowEnd: "2026-09-19T00:00:00.000Z", windowStart: "2026-09-12T00:00:00.000Z" },
    }))).toMatchObject({ materiality: "not_material", suppressionReason: "materiality_rule_not_satisfied" });
    expect(evaluateProactiveCoachMaterialityV1(candidate("repeated_task_miss", {
      evidence: { distinctMissCount: 2, taskId: "", windowEnd: "2026-09-19T00:00:00.000Z", windowStart: "2026-09-12T00:00:00.000Z" },
    }))).toMatchObject({ materiality: "unresolved", suppressionReason: "required_evidence_missing_or_invalid" });
  });

  it("requires recovery completion to occur after the same task miss", () => {
    expect(evaluateProactiveCoachMaterialityV1(candidate("recent_recovery", {
      evidence: { completedAt: "2026-09-18T09:00:00.000Z", missedAt: "2026-09-19T09:00:00.000Z", taskId: "task-1" },
    }))).toMatchObject({ materiality: "not_material", suppressionReason: "materiality_rule_not_satisfied" });
  });

  it("requires a recognized Planner lifecycle and at least one warning", () => {
    expect(evaluateProactiveCoachMaterialityV1(candidate("planner_warning_present", {
      evidence: { lifecycleState: "previewed", warningCount: 0 },
    }))).toMatchObject({ materiality: "not_material", suppressionReason: "materiality_rule_not_satisfied" });
    expect(evaluateProactiveCoachMaterialityV1(candidate("planner_warning_present", {
      evidence: { lifecycleState: "invented", warningCount: 1 },
    }))).toMatchObject({ materiality: "unresolved", suppressionReason: "required_evidence_missing_or_invalid" });
  });

  it("fails closed for low confidence, missing evidence, or a mismatched candidate contract", () => {
    expect(evaluateProactiveCoachMaterialityV1(candidate("repeated_task_miss", { confidence: "low" }))).toMatchObject({ materiality: "unresolved", suppressionReason: "confidence_below_policy_minimum" });
    expect(evaluateProactiveCoachMaterialityV1(candidate("repeated_task_miss", { evidence: { distinctMissCount: 2 } }))).toMatchObject({ materiality: "unresolved", suppressionReason: "required_evidence_missing_or_invalid" });
    expect(evaluateProactiveCoachMaterialityV1(candidate("repeated_task_miss", { reasonCode: "required_truth_unavailable" }))).toMatchObject({ materiality: "unresolved", suppressionReason: "candidate_contract_mismatch" });
  });

  it("returns unresolved rather than throwing for a known non-proactive registry signal", () => {
    expect(evaluateProactiveCoachMaterialityV1(candidate("today_remaining_work"))).toMatchObject({
      materiality: "unresolved",
      actionable: false,
      suppressionReason: "signal_not_in_materiality_policy",
    });
  });

  it("does not mutate or freeze caller input and deep-freezes its decision", () => {
    const input = candidate("repeated_task_miss");
    const before = structuredClone(input);
    const result = evaluateProactiveCoachMaterialityV1(input);
    expect(input).toEqual(before);
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(input.evidence)).toBe(false);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.authority)).toBe(true);
  });

  it("exposes zero prose, provider, DB, or Planner authority", () => {
    expect(evaluateProactiveCoachMaterialityV1(candidate("planner_warning_present")).authority).toEqual({
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
    });
  });
});
