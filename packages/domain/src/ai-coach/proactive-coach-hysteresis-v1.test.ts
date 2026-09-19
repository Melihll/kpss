import { describe, expect, it } from "vitest";
import type { CoachSignalCandidateV1 } from "./coach-signal-v1";
import {
  buildProactiveCoachConditionKeyV1,
  evaluateProactiveCoachHysteresisV1,
} from "./proactive-coach-hysteresis-v1";
import type {
  ProactiveCoachClearConditionObservationV1,
  ProactiveCoachRuntimeCollectionV1,
  ProactiveCoachRuntimePresentationV1,
} from "./proactive-coach-runtime-state-v1";

const NOW = "2026-09-19T09:00:00.000Z";

function candidate(
  signalType: CoachSignalCandidateV1["signalType"] = "repeated_task_miss",
  overrides: Partial<CoachSignalCandidateV1> = {},
): CoachSignalCandidateV1 {
  const evidence: CoachSignalCandidateV1["evidence"] = signalType === "today_completed_as_planned"
    ? { completedTaskCount: 2, plannedCreditMinutes: 60, plannedMinutes: 60 }
    : signalType === "recent_recovery"
      ? { taskId: "task-1", missedAt: "2026-09-17T09:00:00.000Z", completedAt: "2026-09-18T09:00:00.000Z" }
      : signalType === "planner_warning_present"
        ? { lifecycleState: "previewed", warningCount: 1 }
        : {
            taskId: "task-1",
            distinctMissCount: 2,
            windowStart: "2026-09-10T00:00:00.000Z",
            windowEnd: "2026-09-19T00:00:00.000Z",
            secondLatestMissedAt: "2026-09-18T08:00:00.000Z",
            latestMissedAt: "2026-09-19T08:00:00.000Z",
          };
  return {
    version: "coach-signal-candidate-v1",
    signalType,
    severity: "warning",
    importance: "high",
    subjectId: null,
    date: signalType === "today_completed_as_planned" ? "2026-09-19" : null,
    reasonCode: signalType === "today_completed_as_planned"
      ? "today_all_tasks_completed_with_planned_credit"
      : signalType === "recent_recovery"
        ? "completed_after_recent_miss"
        : signalType === "planner_warning_present"
          ? "persisted_planner_warning_count_present"
          : "same_task_missed_multiple_times_in_recent_window",
    sourceFactPaths: ["fixture.fact"],
    asOf: NOW,
    freshness: { state: "fresh", asOf: NOW, expiresAt: null },
    confidence: "high",
    evidence,
    provenance: [{ source: "study_intent_ledger", recordIds: [signalType === "planner_warning_present" ? "proposal-1" : "event-1"], asOf: NOW }],
    dedupeKey: `fixture:${signalType}`,
    eligibility: { reactiveExplanation: true, proactiveCandidate: true, attentionCategory: signalType === "planner_warning_present" ? "planner" : "consistency", cooldownClass: "state_change", silenceAllowed: true },
    authority: { mode: "factual_signal_only_read_only", createsProductTruth: false, generatesProse: false, dbWritesAllowed: false, workloadCalculationAllowed: false, plannerPreviewAllowed: false, plannerProposalAllowed: false, plannerConfirmationAllowed: false, plannerApplyAllowed: false, llmCallsAllowed: false, providerCallsAllowed: false },
    ...overrides,
  };
}

function known<T>(values: readonly T[], source: "proactive_presentation_store" | "proactive_clear_condition_store"): ProactiveCoachRuntimeCollectionV1<T> {
  return { availability: "known", values, source, asOf: NOW, unavailableReason: null };
}

function presentation(value: CoachSignalCandidateV1, presentedAt = "2026-09-16T09:00:00.000Z"): ProactiveCoachRuntimePresentationV1 {
  return {
    fingerprint: "fingerprint-1",
    signalType: value.signalType,
    conditionKey: buildProactiveCoachConditionKeyV1(value)!,
    attentionCategory: value.eligibility.attentionCategory,
    presentedAt,
    calendarDate: presentedAt.slice(0, 10),
    surfaceSessionId: "surface-old",
  };
}

function clear(value: CoachSignalCandidateV1, observedAt: string): ProactiveCoachClearConditionObservationV1 {
  return {
    signalType: value.signalType as ProactiveCoachClearConditionObservationV1["signalType"],
    conditionKey: buildProactiveCoachConditionKeyV1(value)!,
    state: "cleared",
    observedAt,
    reasonCode: "canonical_clear_observed",
    sourceFactPaths: ["canonical.fact"],
  };
}

describe("Proactive Coach Hysteresis V1", () => {
  it("allows the first canonical condition instance", () => {
    expect(evaluateProactiveCoachHysteresisV1({
      candidate: candidate(), presentations: known([], "proactive_presentation_store"), clearConditions: known([], "proactive_clear_condition_store"),
    })).toMatchObject({ status: "initially_armed", allowed: true });
  });

  it("never re-fires completed-as-planned for the same date", () => {
    const value = candidate("today_completed_as_planned");
    expect(evaluateProactiveCoachHysteresisV1({
      candidate: value, presentations: known([presentation(value)], "proactive_presentation_store"), clearConditions: known([], "proactive_clear_condition_store"),
    })).toMatchObject({ allowed: false, reason: "date_scoped_condition_already_presented" });
    expect(buildProactiveCoachConditionKeyV1(candidate("today_completed_as_planned", { date: "2026-09-20" })))
      .not.toBe(buildProactiveCoachConditionKeyV1(value));
  });

  it("does not re-arm repeated miss because cooldown elapsed or without canonical clear", () => {
    const value = candidate();
    expect(evaluateProactiveCoachHysteresisV1({
      candidate: value, presentations: known([presentation(value, "2026-09-10T09:00:00.000Z")], "proactive_presentation_store"), clearConditions: known([], "proactive_clear_condition_store"),
    })).toMatchObject({ allowed: false, reason: "persistent_condition_requires_clear_observation" });
  });

  it("re-arms repeated miss only after clear and two canonically ordered new misses", () => {
    const value = candidate();
    const cleared = clear(value, "2026-09-17T09:00:00.000Z");
    expect(evaluateProactiveCoachHysteresisV1({
      candidate: value, presentations: known([presentation(value)], "proactive_presentation_store"), clearConditions: known([cleared], "proactive_clear_condition_store"),
    })).toMatchObject({ status: "rearmed", allowed: true, clearObservedAt: cleared.observedAt });

    expect(evaluateProactiveCoachHysteresisV1({
      candidate: candidate("repeated_task_miss", { evidence: { ...value.evidence, secondLatestMissedAt: "2026-09-17T08:00:00.000Z" } }),
      presentations: known([presentation(value)], "proactive_presentation_store"), clearConditions: known([cleared], "proactive_clear_condition_store"),
    })).toMatchObject({ allowed: false, reason: "rearm_not_proven_after_clear" });
  });

  it("treats recovery as one factual event instance", () => {
    const value = candidate("recent_recovery");
    expect(evaluateProactiveCoachHysteresisV1({
      candidate: value, presentations: known([presentation(value)], "proactive_presentation_store"), clearConditions: known([], "proactive_clear_condition_store"),
    })).toMatchObject({ allowed: false, reason: "event_instance_already_presented" });
  });

  it("requires canonical Planner warning clear before a later warning can re-arm", () => {
    const value = candidate("planner_warning_present");
    const prior = presentation(value, "2026-09-16T09:00:00.000Z");
    expect(evaluateProactiveCoachHysteresisV1({
      candidate: value, presentations: known([prior], "proactive_presentation_store"), clearConditions: known([], "proactive_clear_condition_store"),
    })).toMatchObject({ allowed: false, reason: "persistent_condition_requires_clear_observation" });
    expect(evaluateProactiveCoachHysteresisV1({
      candidate: value, presentations: known([prior], "proactive_presentation_store"), clearConditions: known([clear(value, "2026-09-18T09:00:00.000Z")], "proactive_clear_condition_store"),
    })).toMatchObject({ status: "rearmed", allowed: true });
  });

  it("fails closed when presentation or clear-condition authority is unavailable", () => {
    const value = candidate();
    const unavailable = { availability: "unavailable", values: [], source: "proactive_clear_condition_store", asOf: NOW, unavailableReason: "persistence_missing" } as const;
    expect(evaluateProactiveCoachHysteresisV1({ candidate: value, presentations: unavailable, clearConditions: unavailable }))
      .toMatchObject({ allowed: false, reason: "clear_condition_authority_unavailable" });
    expect(evaluateProactiveCoachHysteresisV1({ candidate: value, presentations: known([presentation(value)], "proactive_presentation_store"), clearConditions: unavailable }))
      .toMatchObject({ allowed: false, reason: "clear_condition_authority_unavailable" });
  });

  it("is deterministic, input-pure, frozen, and grants zero external authority", () => {
    const value = candidate();
    const input = { candidate: value, presentations: known([], "proactive_presentation_store"), clearConditions: known([], "proactive_clear_condition_store") };
    const before = structuredClone(input);
    const first = evaluateProactiveCoachHysteresisV1(input);
    const second = evaluateProactiveCoachHysteresisV1(input);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(input).toEqual(before);
    expect(Object.isFrozen(first)).toBe(true);
    expect(first.authority).toMatchObject({ cooldownIsHysteresis: false, dbWritesAllowed: false, llmCallsAllowed: false, providerCallsAllowed: false, plannerProposalAllowed: false, plannerConfirmationAllowed: false, plannerApplyAllowed: false });
  });
});
