import { describe, expect, it } from "vitest";
import type { CoachSignalCandidateV1 } from "./coach-signal-v1";
import {
  buildProactiveCoachFingerprintV1,
  PROACTIVE_COACH_POLICY_V1,
  selectProactiveCoachInsightV1,
  type ProactiveCoachPolicyStateV1,
} from "./proactive-coach-selection-v1";
import {
  buildProactiveCoachRuntimeStateV1,
  type ProactiveCoachClearConditionObservationV1,
  type ProactiveCoachRuntimeCollectionV1,
  type ProactiveCoachRuntimeFactV1,
  type ProactiveCoachRuntimePresentationV1,
} from "./proactive-coach-runtime-state-v1";
import { buildProactiveCoachConditionKeyV1 } from "./proactive-coach-hysteresis-v1";

const NOW = "2026-09-17T09:00:00.000Z";
const CURRENT_DATE = "2026-09-17";

function candidate(
  overrides: Partial<CoachSignalCandidateV1> = {},
): CoachSignalCandidateV1 {
  return {
    version: "coach-signal-candidate-v1",
    signalType: "repeated_task_miss",
    severity: "warning",
    importance: "high",
    subjectId: "subject-law",
    date: null,
    reasonCode: "same_task_missed_multiple_times_in_recent_window",
    sourceFactPaths: [
      "recentProgress.value.taskEvents[taskId=task-1]",
    ],
    asOf: "2026-09-17T08:30:00.000Z",
    freshness: {
      state: "fresh",
      asOf: "2026-09-17T08:30:00.000Z",
      expiresAt: null,
    },
    confidence: "high",
    evidence: {
      distinctMissCount: 2,
      secondLatestMissedAt: "2026-09-15T08:00:00.000Z",
      latestMissedAt: "2026-09-16T08:00:00.000Z",
      taskId: "task-1",
      windowStart: "2026-09-10T00:00:00.000Z",
      windowEnd: "2026-09-17T00:00:00.000Z",
    },
    provenance: [
      {
        source: "study_intent_ledger",
        recordIds: ["session-1", "session-2"],
        asOf: "2026-09-17T08:30:00.000Z",
      },
    ],
    dedupeKey:
      "repeated_task_miss:subject-law:any-date:task-1:same_task_missed_multiple_times_in_recent_window:recentProgress",
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
    ...overrides,
  };
}

type TestPresentation = Omit<ProactiveCoachRuntimePresentationV1, "signalType" | "conditionKey"> &
  Partial<Pick<ProactiveCoachRuntimePresentationV1, "signalType" | "conditionKey">>;

interface StateOverrides {
  readonly now?: string;
  readonly currentDate?: string;
  readonly surfaceSessionId?: string;
  readonly activeStudySession?: boolean;
  readonly activeStudySessionFact?: ProactiveCoachRuntimeFactV1<{
    readonly active: boolean;
    readonly sessionId: string | null;
    readonly startedAt: string | null;
  }>;
  readonly presentations?: readonly TestPresentation[];
  readonly presentationsFact?: ProactiveCoachRuntimeCollectionV1<ProactiveCoachRuntimePresentationV1>;
  readonly disabledCategories?: readonly CoachSignalCandidateV1["eligibility"]["attentionCategory"][];
  readonly snoozes?: readonly { readonly attentionCategory: CoachSignalCandidateV1["eligibility"]["attentionCategory"]; readonly until: string }[];
  readonly dismissedFingerprints?: readonly string[];
  readonly clearConditions?: readonly ProactiveCoachClearConditionObservationV1[];
  readonly clearConditionsFact?: ProactiveCoachRuntimeCollectionV1<ProactiveCoachClearConditionObservationV1>;
}

function collection<T>(
  values: readonly T[],
  source: "proactive_presentation_store" | "proactive_user_control_store" | "proactive_clear_condition_store",
  asOf = NOW,
): ProactiveCoachRuntimeCollectionV1<T> {
  return { availability: "known", values, source, asOf, unavailableReason: null };
}

function state(overrides: StateOverrides = {}): ProactiveCoachPolicyStateV1 {
  const now = overrides.now ?? NOW;
  const presentations = (overrides.presentations ?? []).map((item) => ({
    ...item,
    signalType: item.signalType ?? "repeated_task_miss",
    conditionKey: item.conditionKey ?? `legacy:${item.fingerprint}`,
  }));
  return buildProactiveCoachRuntimeStateV1({
    now,
    currentDate: overrides.currentDate ?? CURRENT_DATE,
    surfaceSessionId: overrides.surfaceSessionId ?? "surface-1",
    activeStudySession: overrides.activeStudySessionFact ?? {
      availability: "known",
      value: overrides.activeStudySession
        ? { active: true, sessionId: "active-session-1", startedAt: "2026-09-17T08:00:00.000Z" }
        : { active: false, sessionId: null, startedAt: null },
      source: "study_sessions_active_readonly",
      asOf: now,
      unavailableReason: null,
    },
    presentations: overrides.presentationsFact ?? collection(presentations, "proactive_presentation_store", now),
    disabledCategories: collection(overrides.disabledCategories ?? [], "proactive_user_control_store", now),
    snoozes: collection(overrides.snoozes ?? [], "proactive_user_control_store", now),
    dismissedFingerprints: collection(overrides.dismissedFingerprints ?? [], "proactive_user_control_store", now),
    clearConditions: overrides.clearConditionsFact ?? collection(overrides.clearConditions ?? [], "proactive_clear_condition_store", now),
  });
}

function presentationFor(
  value: CoachSignalCandidateV1,
  presentedAt = "2026-09-10T09:00:00.000Z",
): ProactiveCoachRuntimePresentationV1 {
  return {
    fingerprint: buildProactiveCoachFingerprintV1(value),
    signalType: value.signalType,
    conditionKey: buildProactiveCoachConditionKeyV1(value)!,
    attentionCategory: value.eligibility.attentionCategory,
    presentedAt,
    calendarDate: presentedAt.slice(0, 10),
    surfaceSessionId: "old-surface",
  };
}

describe("Proactive Coach deterministic selection V1", () => {
  it("A. deterministically selects the highest-priority eligible candidate", () => {
    const medium = candidate({
      signalType: "today_partial_completion",
      severity: "notice",
      importance: "medium",
      subjectId: null,
      date: CURRENT_DATE,
      reasonCode: "today_partial_task_count_present",
      evidence: {
        partiallyCompletedTaskCount: 1,
        remainingMinutes: 30,
      },
      dedupeKey: "today-partial",
      eligibility: {
        reactiveExplanation: true,
        proactiveCandidate: true,
        attentionCategory: "progress",
        cooldownClass: "state_change",
        silenceAllowed: true,
      },
    });

    const high = candidate();

    const result = selectProactiveCoachInsightV1(
      [medium, high],
      state(),
    );

    expect(result.outcome).toBe("selected");
    expect(result.selectedCandidate?.signalType).toBe(
      "repeated_task_miss",
    );
  });

  it("B. active study session suppresses every proactive interruption", () => {
    const result = selectProactiveCoachInsightV1(
      [candidate()],
      state({ activeStudySession: true }),
    );

    expect(result.outcome).toBe("silence");
    expect(result.suppressions).toEqual([
      expect.objectContaining({
        reason: "active_study_session",
      }),
    ]);
  });

  it("C. suppresses the same fingerprint for 72 hours", () => {
    const value = candidate();
    const fingerprint =
      buildProactiveCoachFingerprintV1(value);

    const result = selectProactiveCoachInsightV1(
      [value],
      state({
        presentations: [
          {
            fingerprint,
            attentionCategory: "consistency",
            presentedAt: "2026-09-15T09:00:01.000Z",
            calendarDate: "2026-09-15",
            surfaceSessionId: "old-surface",
          },
        ],
      }),
    );

    expect(result.outcome).toBe("silence");
    expect(result.suppressions[0]?.reason).toBe(
      "same_fingerprint_cooldown",
    );
  });

  it("D. permits the same fingerprint once 72 hours have elapsed", () => {
    const value = candidate();
    const fingerprint =
      buildProactiveCoachFingerprintV1(value);

    const result = selectProactiveCoachInsightV1(
      [value],
      state({
        now: "2026-09-18T09:00:00.000Z",
        currentDate: "2026-09-18",
        presentations: [
          {
            fingerprint,
            attentionCategory: "consistency",
            presentedAt: "2026-09-15T09:00:00.000Z",
            calendarDate: "2026-09-15",
            surfaceSessionId: "old-surface",
          },
        ],
      }),
    );

    expect(result.outcome).toBe("selected");
  });

  it("E. enforces category cooldown before routing", () => {
    const value = candidate();

    const result = selectProactiveCoachInsightV1(
      [value],
      state({
        presentations: [
          {
            fingerprint: "different-fingerprint",
            attentionCategory: "consistency",
            presentedAt: "2026-09-16T20:00:00.000Z",
            calendarDate: "2026-09-16",
            surfaceSessionId: "old-surface",
          },
        ],
      }),
    );

    expect(result.outcome).toBe("silence");
    expect(result.suppressions[0]?.reason).toBe(
      "category_cooldown",
    );
  });

  it("F. enforces one proactive insight per calendar day", () => {
    const result = selectProactiveCoachInsightV1(
      [candidate()],
      state({
        presentations: [
          {
            fingerprint: "other",
            attentionCategory: "progress",
            presentedAt: "2026-09-17T07:00:00.000Z",
            calendarDate: CURRENT_DATE,
            surfaceSessionId: "old-surface",
          },
        ],
      }),
    );

    expect(result.outcome).toBe("silence");
    expect(result.suppressions[0]?.reason).toBe(
      "daily_attention_budget",
    );
  });

  it("G. honors disable, snooze and exact-fingerprint dismissal controls", () => {
    const value = candidate();
    const fingerprint =
      buildProactiveCoachFingerprintV1(value);

    expect(
      selectProactiveCoachInsightV1(
        [value],
        state({
          disabledCategories: ["consistency"],
        }),
      ).suppressions[0]?.reason,
    ).toBe("category_disabled");

    expect(
      selectProactiveCoachInsightV1(
        [value],
        state({
          snoozes: [
            {
              attentionCategory: "consistency",
              until: "2026-09-17T10:00:00.000Z",
            },
          ],
        }),
      ).suppressions[0]?.reason,
    ).toBe("category_snoozed");

    expect(
      selectProactiveCoachInsightV1(
        [value],
        state({
          dismissedFingerprints: [fingerprint],
        }),
      ).suppressions[0]?.reason,
    ).toBe("fingerprint_dismissed");
  });

  it("H. fails closed for stale facts and low confidence", () => {
    const stale = candidate({
      freshness: {
        state: "stale",
        asOf: "2026-09-15T09:00:00.000Z",
        expiresAt: "2026-09-16T09:00:00.000Z",
      },
    });

    const low = candidate({
      dedupeKey: "low-confidence",
      confidence: "low",
    });

    const result = selectProactiveCoachInsightV1(
      [stale, low],
      state(),
    );

    expect(result.outcome).toBe("silence");
    expect(result.suppressions.map((item) => item.reason)).toEqual(
      expect.arrayContaining([
        "fact_not_fresh",
        "confidence_insufficient",
      ]),
    );
  });

  it("I. returns valid silence when there is no candidate", () => {
    const result = selectProactiveCoachInsightV1([], state());

    expect(result).toMatchObject({
      outcome: "silence",
      selectedCandidate: null,
      selectedFingerprint: null,
      suppressions: [],
    });
  });

  it("J. changes fingerprint when authoritative evidence changes", () => {
    const first = candidate();
    const second = candidate({
      evidence: {
        ...first.evidence,
        distinctMissCount: 3,
      },
    });

    expect(
      buildProactiveCoachFingerprintV1(second),
    ).not.toBe(buildProactiveCoachFingerprintV1(first));
  });

  it("K. keeps the same fingerprint across refresh-only timestamp changes", () => {
    const first = candidate();

    const refreshed = candidate({
      asOf: "2026-09-17T08:59:00.000Z",
      freshness: {
        state: "fresh",
        asOf: "2026-09-17T08:59:00.000Z",
        expiresAt: "2026-09-17T10:59:00.000Z",
      },
      provenance: [
        {
          source: "study_intent_ledger",
          recordIds: ["session-2", "session-1"],
          asOf: "2026-09-17T08:59:00.000Z",
        },
      ],
    });

    expect(
      buildProactiveCoachFingerprintV1(refreshed),
    ).toBe(buildProactiveCoachFingerprintV1(first));
  });

  it("L. exposes zero model, persistence or Planner authority", () => {
    const result = selectProactiveCoachInsightV1(
      [candidate()],
      state(),
    );

    expect(result.authority).toEqual({
      mode: "deterministic_in_app_selection_only",
      inAppOnly: true,
      generatesProse: false,
      llmCallsAllowed: false,
      providerCallsAllowed: false,
      dbWritesAllowed: false,
      plannerProposalAllowed: false,
      plannerConfirmationAllowed: false,
      plannerApplyAllowed: false,
    });

    expect(PROACTIVE_COACH_POLICY_V1).toMatchObject({
      sameFingerprintCooldownMs: 72 * 60 * 60 * 1000,
      categoryCooldownMs: 24 * 60 * 60 * 1000,
      dailyAttentionLimit: 1,
      surfaceSessionAttentionLimit: 1,
    });
  });

  it("M. suppresses fresh-labeled facts at the runtime expiry boundary", () => {
    const expired = candidate({
      freshness: {
        state: "fresh",
        asOf: "2026-09-17T08:30:00.000Z",
        expiresAt: NOW,
      },
    });

    const stillFresh = candidate({
      dedupeKey: "still-fresh-after-runtime-check",
      freshness: {
        state: "fresh",
        asOf: "2026-09-17T08:30:00.000Z",
        expiresAt: "2026-09-17T09:00:00.001Z",
      },
    });

    const expiredResult = selectProactiveCoachInsightV1(
      [expired],
      state(),
    );

    expect(expiredResult.outcome).toBe("silence");
    expect(expiredResult.suppressions[0]?.reason).toBe(
      "fact_not_fresh",
    );

    expect(
      selectProactiveCoachInsightV1(
        [stillFresh],
        state(),
      ).outcome,
    ).toBe("selected");

    expect(() =>
      selectProactiveCoachInsightV1(
        [
          candidate({
            freshness: {
              state: "fresh",
              asOf: "2026-09-17T08:30:00.000Z",
              expiresAt: "not-a-timestamp",
            },
          }),
        ],
        state(),
      ),
    ).toThrow("PROACTIVE_FRESHNESS_EXPIRY_INVALID");
  });

  it("N. rejects invalid matching presentation timestamps deterministically", () => {
    const value = candidate();
    const fingerprint =
      buildProactiveCoachFingerprintV1(value);

    expect(() =>
      selectProactiveCoachInsightV1(
        [value],
        state({
          presentations: [
            {
              fingerprint,
              attentionCategory:
                value.eligibility.attentionCategory,
              presentedAt: "not-a-timestamp",
              calendarDate: "2026-09-16",
              surfaceSessionId: "old-surface",
            },
          ],
        }),
      ),
    ).toThrow("PROACTIVE_PRESENTATION_TIME_INVALID");
  });

  it("O. does not freeze or mutate caller-owned candidate input", () => {
    const value = candidate();
    const originalEvidence = value.evidence;
    const originalProvenance = value.provenance;

    expect(Object.isFrozen(value)).toBe(false);
    expect(Object.isFrozen(originalEvidence)).toBe(false);
    expect(Object.isFrozen(originalProvenance)).toBe(false);

    const result = selectProactiveCoachInsightV1(
      [value],
      state(),
    );

    expect(result.outcome).toBe("selected");
    expect(result.selectedCandidate).toEqual(value);
    expect(result.selectedCandidate).not.toBe(value);

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.selectedCandidate)).toBe(true);
    expect(
      Object.isFrozen(result.selectedCandidate?.evidence),
    ).toBe(true);

    expect(Object.isFrozen(value)).toBe(false);
    expect(Object.isFrozen(value.evidence)).toBe(false);
    expect(Object.isFrozen(value.provenance)).toBe(false);
    expect(value.evidence).toBe(originalEvidence);
    expect(value.provenance).toBe(originalProvenance);
  });

  it.each([
    {
      signalType: "today_partial_completion" as const,
      reasonCode: "today_partial_task_count_present" as const,
      evidence: { partiallyCompletedTaskCount: 99, remainingMinutes: 9_999 } as CoachSignalCandidateV1["evidence"],
      category: "progress" as const,
    },
    {
      signalType: "subject_recent_completion_drop" as const,
      reasonCode: "canonical_completion_drop_input_present" as const,
      evidence: { dropValue: 9_999, subjectId: "subject-law" } as CoachSignalCandidateV1["evidence"],
      category: "progress" as const,
    },
    {
      signalType: "schedule_capacity_change" as const,
      reasonCode: "canonical_capacity_change_input_present" as const,
      evidence: { capacityDeltaMinutes: 9_999, date: CURRENT_DATE } as CoachSignalCandidateV1["evidence"],
      category: "capacity" as const,
    },
    {
      signalType: "material_progress_stalled" as const,
      reasonCode: "canonical_material_stall_input_present" as const,
      evidence: { materialViewId: "material-1", progressState: "stalled" } as CoachSignalCandidateV1["evidence"],
      category: "material" as const,
    },
  ])("P. keeps unresolved $signalType silent regardless of apparent magnitude", ({
    signalType,
    reasonCode,
    evidence,
    category,
  }) => {
    const result = selectProactiveCoachInsightV1([
      candidate({
        signalType,
        reasonCode,
        evidence,
        eligibility: {
          reactiveExplanation: true,
          proactiveCandidate: true,
          attentionCategory: category,
          cooldownClass: "state_change",
          silenceAllowed: true,
        },
      }),
    ], state());

    expect(result.outcome).toBe("silence");
    expect(result.suppressions[0]?.reason).toBe("materiality_threshold_unresolved");
  });

  it("Q. rejects malformed or independently non-material launch evidence", () => {
    const malformed = candidate({ evidence: { distinctMissCount: 2 } });
    const belowThreshold = candidate({
      dedupeKey: "one-miss",
      evidence: {
        distinctMissCount: 1,
        taskId: "task-1",
        windowStart: "2026-09-10T00:00:00.000Z",
        windowEnd: "2026-09-17T00:00:00.000Z",
      },
    });

    const result = selectProactiveCoachInsightV1([malformed, belowThreshold], state());

    expect(result.outcome).toBe("silence");
    expect(result.suppressions.map((item) => item.reason)).toEqual(
      expect.arrayContaining(["materiality_evidence_invalid", "materiality_not_satisfied"]),
    );
  });

  it("R. keeps active-work and user-control protections after materiality passes", () => {
    expect(selectProactiveCoachInsightV1(
      [candidate()],
      state({ activeStudySession: true }),
    ).suppressions[0]?.reason).toBe("active_study_session");

    expect(selectProactiveCoachInsightV1(
      [candidate()],
      state({ disabledCategories: ["consistency"] }),
    ).suppressions[0]?.reason).toBe("category_disabled");

    expect(selectProactiveCoachInsightV1(
      [candidate({
        signalType: "today_partial_completion",
        reasonCode: "today_partial_task_count_present",
        evidence: { partiallyCompletedTaskCount: 1, remainingMinutes: 20 },
        eligibility: {
          reactiveExplanation: true,
          proactiveCandidate: true,
          attentionCategory: "progress",
          cooldownClass: "state_change",
          silenceAllowed: true,
        },
      })],
      state({ activeStudySession: true }),
    ).suppressions[0]?.reason).toBe("materiality_threshold_unresolved");
  });

  it("S. is byte-deterministic without mutating state or candidate collections", () => {
    const values = [candidate()];
    const policyState = state();
    const valuesBefore = structuredClone(values);
    const stateBefore = structuredClone(policyState);

    const first = selectProactiveCoachInsightV1(values, policyState);
    const second = selectProactiveCoachInsightV1(values, policyState);

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(values).toEqual(valuesBefore);
    expect(policyState).toEqual(stateBefore);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.selectedCandidate)).toBe(true);
  });

  it("T. enforces the surface/session attention budget independently", () => {
    const result = selectProactiveCoachInsightV1([candidate()], state({
      presentations: [{
        fingerprint: "other-surface-fingerprint",
        attentionCategory: "progress",
        presentedAt: "2026-09-16T07:00:00.000Z",
        calendarDate: "2026-09-16",
        surfaceSessionId: "surface-1",
      }],
    }));

    expect(result.outcome).toBe("silence");
    expect(result.suppressions[0]?.reason).toBe("surface_session_attention_budget");
  });

  it("U. fails closed when authoritative active-session state is unavailable", () => {
    const result = selectProactiveCoachInsightV1([candidate()], state({
      activeStudySessionFact: {
        availability: "unavailable",
        value: null,
        source: "study_sessions_active_readonly",
        asOf: NOW,
        unavailableReason: "active_session_read_failed",
      },
    }));

    expect(result.outcome).toBe("silence");
    expect(result.suppressions[0]?.reason).toBe("active_study_session_authority_unavailable");
  });

  it("V. never re-fires completed-as-planned for the same local date", () => {
    const value = candidate({
      signalType: "today_completed_as_planned",
      date: CURRENT_DATE,
      reasonCode: "today_all_tasks_completed_with_planned_credit",
      evidence: { completedTaskCount: 3, plannedCreditMinutes: 90, plannedMinutes: 90 },
      eligibility: { reactiveExplanation: true, proactiveCandidate: true, attentionCategory: "progress", cooldownClass: "daily", silenceAllowed: true },
    });
    const result = selectProactiveCoachInsightV1([value], state({
      presentations: [presentationFor(value)],
    }));

    expect(result.outcome).toBe("silence");
    expect(result.suppressions[0]?.reason).toBe("hysteresis_condition_already_presented");
  });

  it("W. does not re-arm repeated miss merely because 72 hours elapsed", () => {
    const value = candidate();
    const result = selectProactiveCoachInsightV1([value], state({
      presentations: [presentationFor(value)],
    }));

    expect(result.outcome).toBe("silence");
    expect(result.suppressions[0]?.reason).toBe("hysteresis_rearm_not_proven");
  });

  it("X. re-arms repeated miss only after canonical clear plus two new misses", () => {
    const value = candidate();
    const conditionKey = buildProactiveCoachConditionKeyV1(value)!;
    const result = selectProactiveCoachInsightV1([value], state({
      presentations: [presentationFor(value)],
      clearConditions: [{
        signalType: "repeated_task_miss",
        conditionKey,
        state: "cleared",
        observedAt: "2026-09-14T09:00:00.000Z",
        reasonCode: "same_task_completion_observed",
        sourceFactPaths: ["recentProgress.value.taskEvents[taskId=task-1]"],
      }],
    }));

    expect(result.outcome).toBe("selected");
    expect(result.selectedConditionKey).toBe(conditionKey);
  });

  it("Y. requires a canonical warning-clear observation before Planner warning re-arm", () => {
    const value = candidate({
      signalType: "planner_warning_present",
      reasonCode: "persisted_planner_warning_count_present",
      evidence: { lifecycleState: "previewed", warningCount: 1 },
      provenance: [{ source: "planner_v2_lifecycle", recordIds: ["proposal-1"], asOf: NOW }],
      eligibility: { reactiveExplanation: true, proactiveCandidate: true, attentionCategory: "planner", cooldownClass: "state_change", silenceAllowed: true },
    });
    const prior = presentationFor(value);
    expect(selectProactiveCoachInsightV1([value], state({ presentations: [prior] })).suppressions[0]?.reason)
      .toBe("hysteresis_rearm_not_proven");

    const conditionKey = buildProactiveCoachConditionKeyV1(value)!;
    expect(selectProactiveCoachInsightV1([value], state({
      presentations: [prior],
      clearConditions: [{
        signalType: "planner_warning_present",
        conditionKey,
        state: "cleared",
        observedAt: "2026-09-16T09:00:00.000Z",
        reasonCode: "canonical_warning_count_zero_observed",
        sourceFactPaths: ["planner.value.warnings"],
      }],
    })).outcome).toBe("selected");
  });

  it("Z. treats recent recovery as an exact factual event instance", () => {
    const value = candidate({
      signalType: "recent_recovery",
      reasonCode: "completed_after_recent_miss",
      evidence: { taskId: "task-1", missedAt: "2026-09-08T09:00:00.000Z", completedAt: "2026-09-09T09:00:00.000Z" },
      eligibility: { reactiveExplanation: true, proactiveCandidate: true, attentionCategory: "consistency", cooldownClass: "state_change", silenceAllowed: true },
    });
    expect(selectProactiveCoachInsightV1([value], state({ presentations: [presentationFor(value)] })).suppressions[0]?.reason)
      .toBe("hysteresis_condition_already_presented");

    const later = candidate({
      ...value,
      evidence: { taskId: "task-1", missedAt: "2026-09-15T09:00:00.000Z", completedAt: "2026-09-16T09:00:00.000Z" },
    });
    expect(selectProactiveCoachInsightV1([later], state({ presentations: [presentationFor(value)] })).outcome)
      .toBe("selected");
  });
});
