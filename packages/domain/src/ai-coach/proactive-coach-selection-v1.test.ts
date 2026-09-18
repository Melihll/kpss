import { describe, expect, it } from "vitest";
import type { CoachSignalCandidateV1 } from "./coach-signal-v1";
import {
  buildProactiveCoachFingerprintV1,
  PROACTIVE_COACH_POLICY_V1,
  selectProactiveCoachInsightV1,
  type ProactiveCoachPolicyStateV1,
} from "./proactive-coach-selection-v1";

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

function state(
  overrides: Partial<ProactiveCoachPolicyStateV1> = {},
): ProactiveCoachPolicyStateV1 {
  return {
    now: NOW,
    currentDate: CURRENT_DATE,
    surfaceSessionId: "surface-1",
    activeStudySession: false,
    presentations: [],
    disabledCategories: [],
    snoozes: [],
    dismissedFingerprints: [],
    ...overrides,
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
});
