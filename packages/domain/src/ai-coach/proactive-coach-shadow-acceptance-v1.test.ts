import { describe, expect, it } from "vitest";
import type { CoachSignalCandidateV1 } from "./coach-signal-v1";
import { buildProactiveCoachConditionKeyV1 } from "./proactive-coach-hysteresis-v1";
import { presentProactiveCoachCardV1 } from "./proactive-coach-card-v1";
import {
  buildProactiveCoachRuntimeStateV1,
  type ProactiveCoachClearConditionObservationV1,
  type ProactiveCoachRuntimeCollectionV1,
  type ProactiveCoachRuntimeFactV1,
  type ProactiveCoachRuntimePresentationV1,
} from "./proactive-coach-runtime-state-v1";
import {
  buildProactiveCoachFingerprintV1,
  selectProactiveCoachInsightV1,
  type ProactiveCoachPolicyStateV1,
} from "./proactive-coach-selection-v1";

const NOW = "2026-09-19T09:00:00.000Z";
const CURRENT_DATE = "2026-09-19";
const SURFACE = "today-surface";

type LaunchSignal =
  | "today_completed_as_planned"
  | "repeated_task_miss"
  | "recent_recovery"
  | "planner_warning_present";

type UnresolvedSignal =
  | "today_partial_completion"
  | "subject_recent_completion_drop"
  | "schedule_capacity_change"
  | "material_progress_stalled";

const EXPECTED_CARDS: Record<LaunchSignal, {
  readonly title: string;
  readonly body: string;
  readonly evidenceSummary: readonly { readonly label: string; readonly value: string }[];
}> = {
  today_completed_as_planned: {
    title: "Bugünün planı tamamlandı",
    body: "Planlanan 60 dakikalık çalışma bugün tamamlandı.",
    evidenceSummary: [
      { label: "Tamamlanan görev", value: "2" },
      { label: "Plan kredisi", value: "60 dk" },
    ],
  },
  repeated_task_miss: {
    title: "Aynı görev birden fazla kez kaçırıldı",
    body: "Aynı görev son ilerleme penceresinde 2 kez kaçırıldı.",
    evidenceSummary: [{ label: "Kaçırılma", value: "2 kez" }],
  },
  recent_recovery: {
    title: "Kaçırılan görev tamamlandı",
    body: "Daha önce kaçırılan aynı görev daha sonra tamamlandı.",
    evidenceSummary: [{ label: "Durum", value: "Tamamlandı" }],
  },
  planner_warning_present: {
    title: "Planında dikkat gerektiren bir durum var",
    body: "Mevcut Planner V2 kaydında 1 uyarı bulunuyor.",
    evidenceSummary: [{ label: "Plan uyarısı", value: "1" }],
  },
};

function baseCandidate(): CoachSignalCandidateV1 {
  return {
    version: "coach-signal-candidate-v1",
    signalType: "repeated_task_miss",
    severity: "warning",
    importance: "high",
    subjectId: "subject-law",
    date: null,
    reasonCode: "same_task_missed_multiple_times_in_recent_window",
    sourceFactPaths: ["recentProgress.value.taskEvents[taskId=task-1]"],
    asOf: "2026-09-19T08:30:00.000Z",
    freshness: {
      state: "fresh",
      asOf: "2026-09-19T08:30:00.000Z",
      expiresAt: "2026-09-19T10:30:00.000Z",
    },
    confidence: "high",
    evidence: {
      distinctMissCount: 2,
      secondLatestMissedAt: "2026-09-17T08:00:00.000Z",
      latestMissedAt: "2026-09-18T08:00:00.000Z",
      taskId: "task-1",
      windowStart: "2026-09-12T00:00:00.000Z",
      windowEnd: "2026-09-19T00:00:00.000Z",
    },
    provenance: [{
      source: "study_intent_ledger",
      recordIds: ["miss-1", "miss-2"],
      asOf: "2026-09-19T08:30:00.000Z",
    }],
    dedupeKey: "repeated_task_miss:subject-law:any-date:task-1",
    eligibility: {
      reactiveExplanation: true,
      proactiveCandidate: true,
      attentionCategory: "consistency",
      cooldownClass: "weekly",
      silenceAllowed: true,
    },
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
  };
}

function launchCandidate(signalType: LaunchSignal): CoachSignalCandidateV1 {
  const base = baseCandidate();
  if (signalType === "today_completed_as_planned") {
    return {
      ...base,
      signalType,
      severity: "info",
      importance: "medium",
      subjectId: null,
      date: CURRENT_DATE,
      reasonCode: "today_all_tasks_completed_with_planned_credit",
      sourceFactPaths: ["today.value.summary", "today.value.study"],
      evidence: { completedTaskCount: 2, plannedMinutes: 60, plannedCreditMinutes: 60 },
      provenance: [{ source: "planning_task_state_v1", recordIds: ["task-1", "task-2"], asOf: base.asOf }],
      dedupeKey: `today_completed_as_planned:global:${CURRENT_DATE}`,
      eligibility: { ...base.eligibility, attentionCategory: "progress", cooldownClass: "daily" },
    };
  }
  if (signalType === "recent_recovery") {
    return {
      ...base,
      signalType,
      severity: "info",
      reasonCode: "completed_after_recent_miss",
      evidence: {
        taskId: "task-1",
        missedAt: "2026-09-17T08:00:00.000Z",
        completedAt: "2026-09-18T08:00:00.000Z",
      },
      provenance: [{ source: "study_intent_ledger", recordIds: ["miss-1", "completion-1"], asOf: base.asOf }],
      dedupeKey: "recent_recovery:subject-law:any-date:task-1:event-1",
      eligibility: { ...base.eligibility, cooldownClass: "state_change" },
    };
  }
  if (signalType === "planner_warning_present") {
    return {
      ...base,
      signalType,
      subjectId: null,
      reasonCode: "persisted_planner_warning_count_present",
      sourceFactPaths: ["planner.value.warnings", "planner.value.lifecycleState"],
      evidence: { lifecycleState: "previewed", warningCount: 1 },
      provenance: [{ source: "planner_v2_lifecycle", recordIds: ["proposal-1"], asOf: base.asOf }],
      dedupeKey: "planner_warning_present:global:any-date:proposal-1",
      eligibility: { ...base.eligibility, attentionCategory: "planner", cooldownClass: "state_change" },
    };
  }
  return base;
}

function unresolvedCandidate(signalType: UnresolvedSignal): CoachSignalCandidateV1 {
  const base = baseCandidate();
  const entries: Record<UnresolvedSignal, {
    readonly reasonCode: CoachSignalCandidateV1["reasonCode"];
    readonly category: CoachSignalCandidateV1["eligibility"]["attentionCategory"];
    readonly evidence: CoachSignalCandidateV1["evidence"];
  }> = {
    today_partial_completion: {
      reasonCode: "today_partial_task_count_present",
      category: "progress" as const,
      evidence: { partiallyCompletedTaskCount: 99, remainingMinutes: 9_999 },
    },
    subject_recent_completion_drop: {
      reasonCode: "canonical_completion_drop_input_present",
      category: "progress" as const,
      evidence: { dropValue: 9_999, subjectId: "subject-law" },
    },
    schedule_capacity_change: {
      reasonCode: "canonical_capacity_change_input_present",
      category: "capacity" as const,
      evidence: { capacityDeltaMinutes: 9_999, date: CURRENT_DATE },
    },
    material_progress_stalled: {
      reasonCode: "canonical_material_stall_input_present",
      category: "material" as const,
      evidence: { materialViewId: "material-1", progressState: "stalled" },
    },
  };
  const values = entries[signalType];
  return {
    ...base,
    signalType,
    reasonCode: values.reasonCode,
    evidence: values.evidence,
    dedupeKey: `unresolved:${signalType}`,
    eligibility: {
      ...base.eligibility,
      attentionCategory: values.category,
      cooldownClass: "state_change",
    },
  };
}

function collection<T>(
  values: readonly T[],
  source: "proactive_presentation_store" | "proactive_user_control_store" | "proactive_clear_condition_store",
  availability: "known" | "unavailable" | "ambiguous" = "known",
): ProactiveCoachRuntimeCollectionV1<T> {
  return availability === "known"
    ? { availability, values, source, asOf: NOW, unavailableReason: null }
    : { availability, values: [], source, asOf: NOW, unavailableReason: "shadow_authority_unavailable" };
}

interface StateOverrides {
  readonly active?: boolean;
  readonly activeFact?: ProactiveCoachRuntimeFactV1<{
    readonly active: boolean;
    readonly sessionId: string | null;
    readonly startedAt: string | null;
  }>;
  readonly presentations?: readonly ProactiveCoachRuntimePresentationV1[];
  readonly presentationAvailability?: "known" | "unavailable" | "ambiguous";
  readonly dismissed?: readonly string[];
  readonly snoozes?: readonly { readonly attentionCategory: CoachSignalCandidateV1["eligibility"]["attentionCategory"]; readonly until: string }[];
  readonly disabled?: readonly CoachSignalCandidateV1["eligibility"]["attentionCategory"][];
  readonly controlsAvailability?: "known" | "unavailable" | "ambiguous";
  readonly clearConditions?: readonly ProactiveCoachClearConditionObservationV1[];
  readonly clearAvailability?: "known" | "unavailable" | "ambiguous";
}

function state(overrides: StateOverrides = {}): ProactiveCoachPolicyStateV1 {
  return buildProactiveCoachRuntimeStateV1({
    now: NOW,
    currentDate: CURRENT_DATE,
    surfaceSessionId: SURFACE,
    activeStudySession: overrides.activeFact ?? {
      availability: "known",
      value: overrides.active
        ? { active: true, sessionId: "session-active", startedAt: "2026-09-19T08:00:00.000Z" }
        : { active: false, sessionId: null, startedAt: null },
      source: "study_sessions_active_readonly",
      asOf: NOW,
      unavailableReason: null,
    },
    presentations: collection(
      overrides.presentations ?? [],
      "proactive_presentation_store",
      overrides.presentationAvailability,
    ),
    dismissedFingerprints: collection(
      overrides.dismissed ?? [],
      "proactive_user_control_store",
      overrides.controlsAvailability,
    ),
    snoozes: collection(
      overrides.snoozes ?? [],
      "proactive_user_control_store",
      overrides.controlsAvailability,
    ),
    disabledCategories: collection(
      overrides.disabled ?? [],
      "proactive_user_control_store",
      overrides.controlsAvailability,
    ),
    clearConditions: collection(
      overrides.clearConditions ?? [],
      "proactive_clear_condition_store",
      overrides.clearAvailability,
    ),
  });
}

function presentation(
  candidate: CoachSignalCandidateV1,
  overrides: Partial<ProactiveCoachRuntimePresentationV1> = {},
): ProactiveCoachRuntimePresentationV1 {
  return {
    fingerprint: buildProactiveCoachFingerprintV1(candidate),
    signalType: candidate.signalType,
    conditionKey: buildProactiveCoachConditionKeyV1(candidate) ?? `unmatched:${candidate.dedupeKey}`,
    attentionCategory: candidate.eligibility.attentionCategory,
    presentedAt: "2026-09-10T09:00:00.000Z",
    calendarDate: "2026-09-10",
    surfaceSessionId: "old-surface",
    ...overrides,
  };
}

function expectSilence(
  candidate: CoachSignalCandidateV1 | null,
  policyState = state(),
  reason?: string,
): void {
  const result = selectProactiveCoachInsightV1(candidate ? [candidate] : [], policyState);
  expect(result.outcome).toBe("silence");
  expect(result.selectedCandidate).toBeNull();
  expect(presentProactiveCoachCardV1(result)).toBeNull();
  if (reason) expect(result.suppressions[0]?.reason).toBe(reason);
}

describe("Evre 6D final shadow acceptance — precision, actionability and silence", () => {
  describe("A. launch-enabled true positives", () => {
    it.each<LaunchSignal>([
      "today_completed_as_planned",
      "repeated_task_miss",
      "recent_recovery",
      "planner_warning_present",
    ])("selects and renders exactly one grounded %s card", (signalType) => {
      const candidate = launchCandidate(signalType);
      const result = selectProactiveCoachInsightV1([candidate], state());
      const card = presentProactiveCoachCardV1(result);

      expect(result.outcome).toBe("selected");
      expect(result.selectedCandidate).toEqual(candidate);
      expect(result.selectedCandidate?.signalType).toBe(signalType);
      expect(result.suppressions).toEqual([]);
      expect(card).not.toBeNull();
      expect(card?.signalType).toBe(signalType);
      expect(card).toMatchObject(EXPECTED_CARDS[signalType]);
      expect(card?.actions.map((action) => action.action)).toEqual([
        "dismiss",
        "snooze_24h",
        "disable_category",
      ]);
      expect(JSON.stringify(card)).not.toMatch(/otomatik|yeniden planlandı|görev taşındı|kapasite değiştirildi/i);
      expect(result.authority).toMatchObject({
        llmCallsAllowed: false,
        providerCallsAllowed: false,
        dbWritesAllowed: false,
        plannerProposalAllowed: false,
        plannerConfirmationAllowed: false,
        plannerApplyAllowed: false,
      });
    });
  });

  describe("B. healthy/no-intervention silence", () => {
    it("B1 keeps a healthy normal day silent", () => expectSilence(null));
    it("B2 keeps no meaningful proactive condition silent", () => {
      expectSilence({ ...baseCandidate(), eligibility: { ...baseCandidate().eligibility, proactiveCandidate: false } }, state(), "not_proactive_candidate");
    });
    it("B3 keeps no-tasks/no-actionable-candidate state silent", () => expectSilence(null));
    it("B4 keeps a consumed daily attention budget silent", () => {
      const candidate = launchCandidate("repeated_task_miss");
      expectSilence(candidate, state({ presentations: [presentation(launchCandidate("today_completed_as_planned"), {
        fingerprint: "other-fingerprint",
        conditionKey: "other-condition",
        presentedAt: "2026-09-19T08:00:00.000Z",
        calendarDate: CURRENT_DATE,
      })] }), "daily_attention_budget");
    });
  });

  describe("C. unresolved materiality silence", () => {
    it.each<UnresolvedSignal>([
      "today_partial_completion",
      "subject_recent_completion_drop",
      "schedule_capacity_change",
      "material_progress_stalled",
    ])("keeps %s silent without inventing a threshold", (signalType) => {
      expectSilence(unresolvedCandidate(signalType), state(), "materiality_threshold_unresolved");
    });
  });

  describe("D. freshness/confidence/authority silence", () => {
    it("D1 rejects stale canonical facts", () => {
      expectSilence({ ...baseCandidate(), freshness: { state: "stale", asOf: "2026-09-18T08:00:00.000Z", expiresAt: "2026-09-18T09:00:00.000Z" } }, state(), "fact_not_fresh");
    });
    it("D2 rejects insufficient confidence", () => {
      expectSilence({ ...baseCandidate(), confidence: "low" }, state(), "confidence_insufficient");
    });
    it("D3 rejects missing presentation authority", () => {
      expectSilence(baseCandidate(), state({ presentationAvailability: "unavailable" }), "presentation_history_authority_unavailable");
    });
    it("D4 rejects missing controls authority", () => {
      expectSilence(baseCandidate(), state({ controlsAvailability: "unavailable" }), "user_controls_authority_unavailable");
    });
    it("D5 rejects missing clear-observation authority", () => {
      const candidate = baseCandidate();
      expectSilence(candidate, state({ presentations: [presentation(candidate)], clearAvailability: "unavailable" }), "hysteresis_clear_condition_unavailable");
    });
    it("D6 rejects ambiguous active-session authority", () => {
      expectSilence(baseCandidate(), state({ activeFact: {
        availability: "ambiguous",
        value: null,
        source: "study_sessions_active_readonly",
        asOf: NOW,
        unavailableReason: "multiple_active_sessions",
      } }), "active_study_session_authority_unavailable");
    });
  });

  it("E1 suppresses a valid condition during an active study session", () => {
    expectSilence(baseCandidate(), state({ active: true }), "active_study_session");
  });

  describe("F. user-control suppression", () => {
    const candidate = baseCandidate();
    it("F1 honors dismissed fingerprint", () => {
      expectSilence(candidate, state({ dismissed: [buildProactiveCoachFingerprintV1(candidate)] }), "fingerprint_dismissed");
    });
    it("F2 honors category snooze", () => {
      expectSilence(candidate, state({ snoozes: [{ attentionCategory: "consistency", until: "2026-09-20T09:00:00.000Z" }] }), "category_snoozed");
    });
    it("F3 honors disabled category", () => {
      expectSilence(candidate, state({ disabled: ["consistency"] }), "category_disabled");
    });
  });

  describe("G. cooldown and attention suppression", () => {
    const candidate = baseCandidate();
    it("G1 suppresses the same fingerprint inside 72 hours", () => {
      expectSilence(candidate, state({ presentations: [presentation(candidate, {
        conditionKey: "legacy-unmatched-condition",
        presentedAt: "2026-09-19T08:00:00.000Z",
        calendarDate: "2026-09-18",
      })] }), "same_fingerprint_cooldown");
    });
    it("G2 enforces category cooldown", () => {
      expectSilence(candidate, state({ presentations: [presentation(candidate, {
        fingerprint: "other-fingerprint",
        conditionKey: "other-condition",
        presentedAt: "2026-09-19T08:00:00.000Z",
        calendarDate: "2026-09-18",
      })] }), "category_cooldown");
    });
    it("G3 enforces surface-session budget", () => {
      expectSilence(candidate, state({ presentations: [presentation(launchCandidate("today_completed_as_planned"), {
        fingerprint: "other-fingerprint",
        conditionKey: "other-condition",
        presentedAt: "2026-09-17T08:00:00.000Z",
        calendarDate: "2026-09-17",
        surfaceSessionId: SURFACE,
      })] }), "surface_session_attention_budget");
    });
    it("G4 enforces calendar-day budget", () => {
      expectSilence(candidate, state({ presentations: [presentation(launchCandidate("today_completed_as_planned"), {
        fingerprint: "other-fingerprint",
        conditionKey: "other-condition",
        presentedAt: "2026-09-19T08:00:00.000Z",
        calendarDate: CURRENT_DATE,
        surfaceSessionId: "other-surface",
      })] }), "daily_attention_budget");
    });
  });

  describe("H. canonical hysteresis", () => {
    it("H1 keeps a persistent repeated miss silent without clear evidence", () => {
      const candidate = baseCandidate();
      expectSilence(candidate, state({ presentations: [presentation(candidate)] }), "hysteresis_rearm_not_proven");
    });
    it("H2 re-arms repeated miss only after clear plus two later misses", () => {
      const candidate = baseCandidate();
      const conditionKey = buildProactiveCoachConditionKeyV1(candidate)!;
      const result = selectProactiveCoachInsightV1([candidate], state({
        presentations: [presentation(candidate)],
        clearConditions: [{
          signalType: "repeated_task_miss",
          conditionKey,
          state: "cleared",
          observedAt: "2026-09-16T09:00:00.000Z",
          reasonCode: "same_task_completion_observed",
          sourceFactPaths: ["recentProgress.value.taskEvents[taskId=task-1]"],
        }],
      }));
      expect(result.outcome).toBe("selected");
    });
    it("H3 keeps a persistent Planner warning silent without zero-warning clear", () => {
      const candidate = launchCandidate("planner_warning_present");
      expectSilence(candidate, state({ presentations: [presentation(candidate)] }), "hysteresis_rearm_not_proven");
    });
    it("H4 re-arms a later Planner warning after canonical zero-warning clear", () => {
      const candidate = launchCandidate("planner_warning_present");
      const conditionKey = buildProactiveCoachConditionKeyV1(candidate)!;
      const result = selectProactiveCoachInsightV1([candidate], state({
        presentations: [presentation(candidate)],
        clearConditions: [{
          signalType: "planner_warning_present",
          conditionKey,
          state: "cleared",
          observedAt: "2026-09-18T08:00:00.000Z",
          reasonCode: "canonical_warning_count_zero_observed",
          sourceFactPaths: ["planner.value.warnings"],
        }],
      }));
      expect(result.outcome).toBe("selected");
    });
    it("H5 consumes the exact same recent-recovery identity once", () => {
      const candidate = launchCandidate("recent_recovery");
      expectSilence(candidate, state({ presentations: [presentation(candidate)] }), "hysteresis_condition_already_presented");
    });
    it("H6 permits a distinct later recovery identity", () => {
      const first = launchCandidate("recent_recovery");
      const later = {
        ...first,
        asOf: "2026-09-19T08:45:00.000Z",
        evidence: {
          taskId: "task-1",
          missedAt: "2026-09-18T08:15:00.000Z",
          completedAt: "2026-09-19T08:15:00.000Z",
        },
        provenance: [{ source: "study_intent_ledger", recordIds: ["miss-2", "completion-2"], asOf: "2026-09-19T08:45:00.000Z" }],
      } satisfies CoachSignalCandidateV1;
      expect(selectProactiveCoachInsightV1([later], state({ presentations: [presentation(first)] })).outcome).toBe("selected");
    });
  });
});
