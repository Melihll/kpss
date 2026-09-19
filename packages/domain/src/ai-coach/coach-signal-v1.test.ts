import { describe, expect, it } from "vitest";
import {
  buildCoachContextV1,
  buildCoachSignalSetV1,
  COACH_SIGNAL_FRESHNESS_POLICY_V1,
  COACH_SIGNAL_REGISTRY_V1,
  COACH_SIGNAL_TYPES_V1,
  COACH_SIGNAL_V1_LIMITS,
  knownCoachContextV1Fact,
  staleCoachContextV1Fact,
  type CoachContextV1SignalInput,
} from "./index";
import { coachContextV1Fixture, type CoachContextV1FixtureKind } from "./fixtures/coach-context-v1";

const AS_OF = "2026-09-10T09:00:00.000Z";
type MutableInput = any;

function context(kind: CoachContextV1FixtureKind = "healthy_normal_week", mutate?: (input: MutableInput) => void) {
  const input = structuredClone(coachContextV1Fixture(kind)) as MutableInput;
  mutate?.(input);
  return buildCoachContextV1(input);
}

function setSignalInputs(input: MutableInput, values: readonly CoachContextV1SignalInput[]): void {
  input.signalInputs = knownCoachContextV1Fact(values, {
    asOf: AS_OF,
    provenance: [{ source: "deterministic_signal_input_v1", recordIds: values.map((value) => value.key), asOf: AS_OF }],
  });
}

function candidateTypes(value: ReturnType<typeof buildCoachSignalSetV1>) {
  return value.candidates.map((candidate) => candidate.signalType);
}

describe("CoachSignalCandidateV1 deterministic foundation", () => {
  it("A. keeps a healthy normal day free of unnecessary warning signals", () => {
    const first = buildCoachSignalSetV1(context());
    const second = buildCoachSignalSetV1(context());
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(first.candidates.filter((candidate) => candidate.severity === "warning")).toEqual([]);
    expect(candidateTypes(first)).toContain("today_remaining_work");
    expect(first.silenceEligible).toBe(true);
  });

  it("B. emits factual partial-Today evidence without trajectory language", () => {
    const result = buildCoachSignalSetV1(context("today_partially_completed"));
    const candidate = result.candidates.find((item) => item.signalType === "today_partial_completion");
    expect(candidate).toMatchObject({
      reasonCode: "today_partial_task_count_present",
      evidence: { partiallyCompletedTaskCount: 1, remainingMinutes: 25 },
      eligibility: { reactiveExplanation: true, proactiveCandidate: true, silenceAllowed: true },
    });
  });

  it("C. emits repeated miss only from two distinct known recent events", () => {
    const result = buildCoachSignalSetV1(context("healthy_normal_week", (input) => {
      const taskId = input.today.value.tasks[0].taskId;
      input.recentProgress.value.taskEvents.push(
        { taskId, occurredAt: "2026-09-08T09:00:00.000Z", status: "missed", completedMinutes: 0 },
        { taskId, occurredAt: "2026-09-09T09:00:00.000Z", status: "missed", completedMinutes: 0 },
      );
    }));
    expect(result.candidates.find((candidate) => candidate.signalType === "repeated_task_miss")).toMatchObject({
      evidence: {
        distinctMissCount: 2,
        secondLatestMissedAt: "2026-09-08T09:00:00.000Z",
        latestMissedAt: "2026-09-09T09:00:00.000Z",
      },
      confidence: "high",
    });
  });

  it("D. suppresses the same apparent behavioral pattern when recent data is stale", () => {
    const result = buildCoachSignalSetV1(context("healthy_normal_week", (input) => {
      const recent = structuredClone(input.recentProgress.value);
      const taskId = input.today.value.tasks[0].taskId;
      recent.taskEvents.push(
        { taskId, occurredAt: "2026-09-08T09:00:00.000Z", status: "missed", completedMinutes: 0 },
        { taskId, occurredAt: "2026-09-09T09:00:00.000Z", status: "missed", completedMinutes: 0 },
      );
      input.recentProgress = staleCoachContextV1Fact(recent, "recent_progress_snapshot_stale", {
        asOf: "2026-09-08T09:00:00.000Z",
        expiresAt: "2026-09-09T09:00:00.000Z",
        provenance: input.recentProgress.provenance,
      });
    }));
    expect(candidateTypes(result)).not.toContain("repeated_task_miss");
    expect(result.candidates).toContainEqual(expect.objectContaining({
      signalType: "context_data_stale",
      evidence: expect.objectContaining({ sourceFactPath: "recentProgress" }),
    }));
  });

  it("E. turns missing workload into uncertainty, never an available-workload conclusion", () => {
    const result = buildCoachSignalSetV1(context("missing_material_workload"));
    expect(candidateTypes(result)).not.toContain("subject_workload_progress_available");
    expect(candidateTypes(result)).toContain("subject_workload_progress_unknown");
    expect(result.candidates.some((candidate) => candidate.signalType === "important_truth_unknown" && candidate.evidence.sourceFactPath === "workload")).toBe(true);
  });

  it("F. preserves PLN-002 blocking and defines no ahead/behind signal", () => {
    const result = buildCoachSignalSetV1(context("pln002_ambiguity"));
    expect(COACH_SIGNAL_TYPES_V1.some((type) => /ahead|behind/.test(type))).toBe(false);
    expect(result.candidates.some((candidate) => candidate.signalType === "important_truth_unknown" && candidate.evidence.unknownReason === "pln002_intent_coverage_insufficient")).toBe(true);
  });

  it("G. emits recovery only for a completed event after a miss for the same task", () => {
    const result = buildCoachSignalSetV1(context("healthy_normal_week", (input) => {
      const taskId = input.today.value.tasks[0].taskId;
      input.recentProgress.value.taskEvents.push(
        { taskId, occurredAt: "2026-09-08T09:00:00.000Z", status: "missed", completedMinutes: 0 },
        { taskId, occurredAt: "2026-09-09T09:00:00.000Z", status: "completed", completedMinutes: 45 },
      );
    }));
    expect(result.candidates.find((candidate) => candidate.signalType === "recent_recovery")).toMatchObject({
      reasonCode: "completed_after_recent_miss",
      evidence: { missedAt: "2026-09-08T09:00:00.000Z", completedAt: "2026-09-09T09:00:00.000Z" },
    });
  });

  it("H. emits capacity change only from an allowlisted canonical signal input", () => {
    const result = buildCoachSignalSetV1(context("healthy_normal_week", (input) => setSignalInputs(input, [{
      key: "schedule_capacity_change:2026-09-10",
      category: "capacity",
      value: -30,
      unit: "minutes",
      sourceFactPath: "capacity.value.days[date=2026-09-10].planningMinutes",
    }])));
    expect(result.candidates.find((candidate) => candidate.signalType === "schedule_capacity_change")).toMatchObject({
      date: "2026-09-10",
      evidence: { capacityDeltaMinutes: -30 },
      eligibility: { attentionCategory: "capacity", cooldownClass: "state_change", proactiveCandidate: true },
    });
  });

  it("I. deterministically deduplicates duplicate source inputs", () => {
    const value: CoachContextV1SignalInput = {
      key: "schedule_capacity_change:2026-09-10",
      category: "capacity",
      value: 30,
      unit: "minutes",
      sourceFactPath: "capacity.value.days[date=2026-09-10].planningMinutes",
    };
    const result = buildCoachSignalSetV1(context("healthy_normal_week", (input) => setSignalInputs(input, [value, value])));
    expect(result.candidates.filter((candidate) => candidate.signalType === "schedule_capacity_change")).toHaveLength(1);
  });

  it("emits only source-path-validated completion, consistency and stall inputs", () => {
    const result = buildCoachSignalSetV1(context("healthy_normal_week", (input) => setSignalInputs(input, [
      { key: "subject_recent_completion_drop:subject-law", category: "progress", value: 2, unit: "count", sourceFactPath: "subjects[subjectId=subject-law].tasks" },
      { key: "recent_study_consistency_days", category: "consistency", value: 3, unit: "count", sourceFactPath: "recentProgress.value.sessions" },
      { key: "material_progress_stalled:youtube:video-constitution-1", category: "material", value: true, unit: "boolean", sourceFactPath: "materials.value[materialViewId=youtube:video-constitution-1]" },
      { key: "schedule_capacity_change:2026-09-10", category: "capacity", value: 99, unit: "minutes", sourceFactPath: "arbitrary.value" },
    ])));
    expect(candidateTypes(result)).toEqual(expect.arrayContaining([
      "subject_recent_completion_drop",
      "recent_study_consistency",
      "material_progress_stalled",
    ]));
    expect(result.candidates.some((candidate) => candidate.signalType === "schedule_capacity_change" && candidate.evidence.capacityDeltaMinutes === 99)).toBe(false);
  });

  it("emits a persisted Planner warning count without copying warning prose", () => {
    const result = buildCoachSignalSetV1(context("healthy_normal_week", (input) => {
      input.planner = knownCoachContextV1Fact({
        lifecycleVersion: "planner-v2-proposal-lifecycle-v1",
        lifecycleState: "previewed",
        weeklyPlanId: "plan-week-37",
        proposalRecordId: "proposal-record",
        proposalId: "proposal-id",
        proposalFingerprint: "proposal-fingerprint",
        snapshotFingerprint: "snapshot-fingerprint",
        plannerVersion: "planner-v2",
        expiresAt: "2026-09-10T10:00:00.000Z",
        freshnessReasons: [],
        summary: { totalAvailableMinutes: 100, protectedMinutes: 40, newlyPlannedMinutes: 40, unusedMinutes: 20, unmetEligibleMinutes: 0, blockedDemandCount: 0 },
        differences: { createCanonicalWorkloadIdentities: [], retainedTaskIds: [], replaceableTaskIds: [], outsideScopeTaskIds: [] },
        warnings: ["stored-warning-text"],
        explanationFacts: [],
        explicitConfirmationRequired: true,
        applyAvailable: false,
      }, { asOf: AS_OF, expiresAt: "2026-09-10T10:00:00.000Z", provenance: [{ source: "planner_v2_lifecycle", recordIds: ["proposal-record"], asOf: AS_OF }] });
    }));
    const candidate = result.candidates.find((item) => item.signalType === "planner_warning_present");
    expect(candidate?.evidence).toEqual({ lifecycleState: "previewed", warningCount: 1 });
    expect(JSON.stringify(candidate)).not.toContain("stored-warning-text");
  });

  it("J. returns a bounded empty/silent result when no meaningful condition exists", () => {
    const result = buildCoachSignalSetV1(context("no_tasks_today", (input) => {
      input.week.value.summary = { totalTaskCount: 0, openTaskCount: 0, completedTaskCount: 0, partiallyCompletedTaskCount: 0, plannedMinutes: 0, completedMinutes: 0, remainingMinutes: 0 };
      input.week.value.tasks = [];
      input.subjects = [];
      input.materials = knownCoachContextV1Fact([], { asOf: AS_OF, provenance: [{ source: "canonical_material_truth_v1", recordIds: [], asOf: AS_OF }] });
      input.workload = knownCoachContextV1Fact({ totalMaterialViews: 0, exactWorkloadViews: 0, calibratedWorkloadViews: 0, unknownWorkloadViews: 0, plannerEligibleViews: 0, exactYoutubeRemainingMinutes: 0, physicalPagesWithCalibratedWorkload: 0, physicalPagesWithUnknownWorkload: 0, physicalEstimatedRemainingMinutes: 0, blockedByReason: {}, minutesBySubject: {}, minutesByResource: {} }, { asOf: AS_OF, provenance: [{ source: "canonical_workload_engine_v1", recordIds: [], asOf: AS_OF }] });
      input.recentProgress.value.taskEvents = [];
      input.recentProgress.value.sessions = [];
      setSignalInputs(input, []);
    }));
    expect(result.candidates).toEqual([]);
    expect(result.collection).toEqual({ availableCount: 0, returnedCount: 0, limit: 32, truncated: false });
    expect(Buffer.byteLength(JSON.stringify(result), "utf8")).toBeLessThanOrEqual(COACH_SIGNAL_V1_LIMITS.serializedBytes);
  });

  it("publishes one centralized registry and documented source-owned freshness policy", () => {
    expect(COACH_SIGNAL_REGISTRY_V1.map((entry) => entry.signalType).sort()).toEqual([...COACH_SIGNAL_TYPES_V1].sort());
    expect(new Set(COACH_SIGNAL_REGISTRY_V1.map((entry) => entry.signalType)).size).toBe(COACH_SIGNAL_TYPES_V1.length);
    expect(Object.values(COACH_SIGNAL_FRESHNESS_POLICY_V1).every((policy) => policy.independentMaxAgeMs === null)).toBe(true);
    expect(Object.values(COACH_SIGNAL_FRESHNESS_POLICY_V1).every((policy) => policy.limitation.length > 0)).toBe(true);
    const value = context();
    expect(() => buildCoachSignalSetV1(value, { subjectId: "outside-profile" })).toThrow("COACH_SIGNAL_SUBJECT_OUT_OF_PROFILE");
    expect(() => buildCoachSignalSetV1(value, { signalTypes: ["overall_behind" as any] })).toThrow("COACH_SIGNAL_TYPE_UNSUPPORTED");
  });

  it("contains no prose/model/mutation authority and enforces serialized bounds", () => {
    const result = buildCoachSignalSetV1(context());
    expect(Buffer.byteLength(JSON.stringify(result), "utf8")).toBeLessThanOrEqual(COACH_SIGNAL_V1_LIMITS.serializedBytes);
    for (const candidate of result.candidates) {
      expect(candidate).not.toHaveProperty("message");
      expect(candidate).not.toHaveProperty("title");
      expect(candidate).not.toHaveProperty("text");
      expect(candidate.authority).toEqual({
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
      });
      expect(candidate.provenance.length).toBeGreaterThan(0);
    }
  });
});
