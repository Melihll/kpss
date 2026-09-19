import { describe, expect, it } from "vitest";
import type { CoachSignalCandidateV1 } from "./coach-signal-v1";
import type { ProactiveCoachSelectionV1 } from "./proactive-coach-selection-v1";
import { presentProactiveCoachCardV1 } from "./proactive-coach-card-v1";

const NOW = "2026-09-19T09:00:00.000Z";

function candidate(overrides: Partial<CoachSignalCandidateV1> = {}): CoachSignalCandidateV1 {
  return {
    version: "coach-signal-candidate-v1",
    signalType: "today_completed_as_planned",
    severity: "info",
    importance: "medium",
    subjectId: null,
    date: "2026-09-19",
    reasonCode: "today_all_tasks_completed_with_planned_credit",
    sourceFactPaths: ["today.value.summary"],
    asOf: NOW,
    freshness: { state: "fresh", asOf: NOW, expiresAt: null },
    confidence: "high",
    evidence: { completedTaskCount: 2, plannedMinutes: 60, plannedCreditMinutes: 60 },
    provenance: [{ source: "planning_task_state_v1", recordIds: ["task-1"], asOf: NOW }],
    dedupeKey: "today-completed",
    eligibility: { reactiveExplanation: true, proactiveCandidate: true, attentionCategory: "progress", cooldownClass: "daily", silenceAllowed: true },
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

function selection(value: CoachSignalCandidateV1 | null): ProactiveCoachSelectionV1 {
  return {
    version: "proactive-coach-selection-v1",
    evaluatedAt: NOW,
    currentDate: "2026-09-19",
    outcome: value ? "selected" : "silence",
    selectedCandidate: value,
    selectedFingerprint: value ? `fingerprint:${value.dedupeKey}` : null,
    selectedConditionKey: value ? `condition:${value.dedupeKey}` : null,
    suppressions: [],
    authority: {
      mode: "deterministic_in_app_selection_only",
      inAppOnly: true,
      generatesProse: false,
      llmCallsAllowed: false,
      providerCallsAllowed: false,
      dbWritesAllowed: false,
      plannerProposalAllowed: false,
      plannerConfirmationAllowed: false,
      plannerApplyAllowed: false,
    },
  };
}

describe("Proactive Coach deterministic card V1", () => {
  it("A/D. maps all four launch-enabled signals to byte-equivalent fixed cards", () => {
    const values = [
      candidate(),
      candidate({
        signalType: "repeated_task_miss",
        reasonCode: "same_task_missed_multiple_times_in_recent_window",
        evidence: { distinctMissCount: 2, taskId: "task-1", windowStart: "2026-09-15T00:00:00.000Z", windowEnd: NOW },
        dedupeKey: "repeated-miss",
        eligibility: { reactiveExplanation: true, proactiveCandidate: true, attentionCategory: "consistency", cooldownClass: "weekly", silenceAllowed: true },
      }),
      candidate({
        signalType: "recent_recovery",
        reasonCode: "completed_after_recent_miss",
        evidence: { taskId: "task-1", missedAt: "2026-09-18T08:00:00.000Z", completedAt: NOW },
        dedupeKey: "recent-recovery",
        eligibility: { reactiveExplanation: true, proactiveCandidate: true, attentionCategory: "consistency", cooldownClass: "state_change", silenceAllowed: true },
      }),
      candidate({
        signalType: "planner_warning_present",
        reasonCode: "persisted_planner_warning_count_present",
        evidence: { lifecycleState: "previewed", warningCount: 1 },
        dedupeKey: "planner-warning",
        eligibility: { reactiveExplanation: true, proactiveCandidate: true, attentionCategory: "planner", cooldownClass: "state_change", silenceAllowed: true },
      }),
    ];
    for (const value of values) {
      const first = presentProactiveCoachCardV1(selection(value));
      const second = presentProactiveCoachCardV1(selection(value));
      expect(first).not.toBeNull();
      expect(JSON.stringify(first)).toBe(JSON.stringify(second));
      expect(first?.actions.map((item) => item.action)).toEqual(["dismiss", "snooze_24h", "disable_category"]);
    }
  });

  it("B/C. returns no card for silence, unresolved signal classes or malformed launch evidence", () => {
    expect(presentProactiveCoachCardV1(selection(null))).toBeNull();
    expect(presentProactiveCoachCardV1(selection(candidate({
      signalType: "today_partial_completion",
      reasonCode: "today_partial_task_count_present",
      evidence: { partiallyCompletedTaskCount: 1, remainingMinutes: 20 },
      eligibility: { reactiveExplanation: true, proactiveCandidate: true, attentionCategory: "progress", cooldownClass: "state_change", silenceAllowed: true },
    })))).toBeNull();
    expect(presentProactiveCoachCardV1(selection(candidate({ evidence: { completedTaskCount: 0, plannedMinutes: 60, plannedCreditMinutes: 0 } })))).toBeNull();
  });

  it("E. exposes deterministic text only and no provider/LLM authority", () => {
    const card = presentProactiveCoachCardV1(selection(candidate()))!;
    expect(card).toMatchObject({
      version: "proactive-coach-card-v1",
      templateVersion: "proactive-coach-card-template-v1",
      title: "Bugünün planı tamamlandı",
      body: "Planlanan 60 dakikalık çalışma bugün tamamlandı.",
    });
    expect(JSON.stringify(card)).not.toMatch(/provider|llm|prompt|model/i);
  });
});
