import { describe, expect, it } from "vitest";
import {
  buildCoachContextV1,
  COACH_CONTEXT_V1_LIMITS,
  COACH_CONTEXT_V1_SOURCE_MAP,
  COACH_CONTEXT_V1_TRUTH_SOURCES,
  COACH_CONTEXT_V1_VERSION,
  COACH_CONTEXT_V1_LEGACY_EXCLUSIONS,
  knownCoachContextV1Fact,
} from "./index";
import {
  coachContextV1Fixture,
  COACH_CONTEXT_V1_FIXTURE_KINDS,
} from "./fixtures/coach-context-v1";

describe("CoachContextV1 6B.1 contract", () => {
  it("A. builds a healthy normal week as a versioned immutable read-only context", () => {
    const context = buildCoachContextV1(coachContextV1Fixture("healthy_normal_week"));

    expect(context.version).toBe(COACH_CONTEXT_V1_VERSION);
    expect(context.week.value?.progressPosition).toMatchObject({
      availability: "known",
      value: "on_track",
    });
    expect(context.authority).toEqual({
      mode: "read_only",
      llmCallsAllowed: false,
      dbWritesAllowed: false,
      planningCalculationsAllowed: false,
      workloadRecalculationAllowed: false,
      taskMutationAllowed: false,
      capacityMutationAllowed: false,
      plannerConfirmationAllowed: false,
      plannerApplyAllowed: false,
    });
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context.week.value?.tasks)).toBe(true);
  });

  it("B. preserves partially completed Today task lifecycle and exact remaining fact", () => {
    const context = buildCoachContextV1(coachContextV1Fixture("today_partially_completed"));

    expect(context.today.value?.summary.partiallyCompletedTaskCount).toBe(1);
    expect(context.today.value?.tasks[0]).toMatchObject({
      status: "partially_completed",
      completedMinutes: 20,
      remainingMinutes: 25,
    });
  });

  it("C. carries canonical next work only with an explicit canonical basis and identity", () => {
    const context = buildCoachContextV1(coachContextV1Fixture("canonical_next_work_available"));

    expect(context.nextWork).toMatchObject({
      availability: "known",
      value: {
        basis: "canonical_material_continuation",
        canonicalWorkloadIdentity: "youtube:video-constitution-1",
        materialViewId: "youtube:video-constitution-1",
        workloadMinutes: 30,
      },
    });
  });

  it("D. propagates missing material/workload facts without fabricating a fallback", () => {
    const context = buildCoachContextV1(coachContextV1Fixture("missing_material_workload"));
    const physical = context.materials.value?.find((item) => item.sourceKind === "physical");

    expect(physical?.workload).toMatchObject({
      availability: "unknown",
      value: null,
      unknownReason: "pace_evidence_unavailable",
    });
    expect(context.workload).toMatchObject({
      availability: "unknown",
      value: null,
    });
    expect(context.nextWork.availability).toBe("unknown");
    expect(context.unknowns.map((item) => item.reason)).toEqual(expect.arrayContaining([
      "pace_evidence_unavailable",
      "canonical_workload_summary_partial",
      "canonical_next_work_requires_known_workload",
    ]));
    expect(JSON.stringify(context)).not.toContain('"fallback"');
  });

  it("E. keeps stale and partial facts visible but unusable as current truth", () => {
    const context = buildCoachContextV1(coachContextV1Fixture("stale_partial_fact"));

    expect(context.capacity).toMatchObject({
      availability: "stale",
      unknownReason: "capacity_snapshot_expired",
      freshness: { state: "stale", asOf: "2026-09-09T09:00:00.000Z" },
    });
    expect(context.signalInputs.availability).toBe("unknown");
    expect(context.unknowns).toContainEqual(expect.objectContaining({
      path: "capacity",
      availability: "stale",
      reason: "capacity_snapshot_expired",
    }));
  });

  it("F. fails closed for ahead/behind when PLN-002 coverage is ambiguous", () => {
    const context = buildCoachContextV1(coachContextV1Fixture("pln002_ambiguity"));

    expect(context.week.value?.studyIntentCoverage).toBe("partial");
    expect(context.week.value?.progressPosition).toMatchObject({
      availability: "unknown",
      value: null,
      unknownReason: "pln002_intent_coverage_insufficient",
    });
    expect(context.today.availability).toBe("known");
    expect(context.materials.availability).toBe("known");
  });

  it("rejects a caller that upgrades PLN-002-ambiguous progress to a known claim", () => {
    const input = structuredClone(coachContextV1Fixture("pln002_ambiguity"));
    const week = input.week.value!;
    (input as any).week = knownCoachContextV1Fact({
      ...week,
      progressPosition: knownCoachContextV1Fact("behind", {
        provenance: [{ source: "study_intent_ledger", recordIds: [], asOf: input.generatedAt }],
        asOf: input.generatedAt,
      }),
    }, {
      provenance: input.week.provenance,
      asOf: input.generatedAt,
    });

    expect(() => buildCoachContextV1(input)).toThrowError(
      "COACH_CONTEXT_V1_PLN002_PROGRESS_POSITION_UNSUPPORTED",
    );
  });

  it("G. represents no tasks Today as known empty state, not missing data", () => {
    const context = buildCoachContextV1(coachContextV1Fixture("no_tasks_today"));

    expect(context.today).toMatchObject({
      availability: "known",
      value: { summary: { totalTaskCount: 0 }, tasks: [] },
    });
    expect(context.nextWork.availability).toBe("not_applicable");
    expect(context.unknowns.some((item) => item.path === "today")).toBe(false);
  });

  it("H. keeps completed and ready future tasks distinct and deterministically ordered", () => {
    const context = buildCoachContextV1(coachContextV1Fixture("mixed_completed_ready_future_tasks"));
    const tasks = context.week.value?.tasks ?? [];

    expect(tasks.map((task) => [task.taskId, task.status, task.plannedDate])).toEqual([
      ["task-monday-history", "completed", "2026-09-07"],
      ["task-today-video", "ready", "2026-09-10"],
      ["task-friday-finance", "ready", "2026-09-11"],
    ]);
  });

  it.each(COACH_CONTEXT_V1_FIXTURE_KINDS)("builds fixture %s deterministically", (kind) => {
    const input = coachContextV1Fixture(kind);
    const reordered = structuredClone(input);
    if (reordered.week.value) (reordered.week.value.tasks as any[]).reverse();
    if (reordered.materials.value) (reordered.materials.value as any[]).reverse();
    (reordered.subjects as any[]).reverse();

    expect(buildCoachContextV1(reordered)).toEqual(buildCoachContextV1(input));
  });

  it("does not mutate its input and does not expose mutable output", () => {
    const input = coachContextV1Fixture("healthy_normal_week");
    const before = structuredClone(input);
    const context = buildCoachContextV1(input);

    expect(input).toEqual(before);
    expect(() => ((context.week.value!.tasks as any[]).push({ taskId: "fabricated" }))).toThrow();
    expect(context.week.value?.tasks).toHaveLength(3);
  });

  it("enforces a compact allowlisted projection instead of raw DB dumps", () => {
    const context = buildCoachContextV1(coachContextV1Fixture("healthy_normal_week"));
    const serialized = JSON.stringify(context);

    expect(new TextEncoder().encode(serialized).byteLength).toBeLessThan(COACH_CONTEXT_V1_LIMITS.serializedBytes);
    expect(serialized).not.toContain('"created_at"');
    expect(serialized).not.toContain('"updated_at"');
    expect(serialized).not.toContain('"note"');
    expect(serialized).not.toContain('"description"');
  });

  it("rejects an oversized task projection", () => {
    const input = structuredClone(coachContextV1Fixture("healthy_normal_week"));
    const task = input.week.value!.tasks[0]!;
    (input.week.value!.tasks as any[]) = Array.from(
      { length: COACH_CONTEXT_V1_LIMITS.weekTasks + 1 },
      (_, index) => ({ ...task, taskId: `task-${index}` }),
    );

    expect(() => buildCoachContextV1(input)).toThrowError("COACH_CONTEXT_V1_TOO_MANY_WEEK_TASKS");
  });

  it("has a canonical/read-only source-map entry for every contract section", () => {
    const requiredPatterns = [
      "version",
      "generatedAt",
      "userId",
      "currentDate",
      "identity",
      "today.value.tasks[*]",
      "today.value.summary",
      "today.value.study",
      "week.value.tasks[*], week.value.summary",
      "week.value.progressPosition",
      "subjects[*].tasks",
      "subjects[*].study",
      "subjects[*].material",
      "nextWork",
      "materials.value[*] except workload",
      "materials.value[*].workload",
      "workload",
      "capacity",
      "recentProgress.value.taskEvents",
      "recentProgress.value.sessions",
      "recentProgress.value.transitions",
      "planner.value identity/lifecycle/freshness",
      "planner.value.explanationFacts",
      "signalInputs",
      "unknowns",
      "provenance",
      "authority",
    ];
    const patterns = COACH_CONTEXT_V1_SOURCE_MAP.map((entry) => entry.fieldPattern);
    const allowedSources = new Set(COACH_CONTEXT_V1_TRUTH_SOURCES);

    expect(new Set(patterns).size).toBe(patterns.length);
    expect(patterns).toEqual(expect.arrayContaining(requiredPatterns));
    for (const entry of COACH_CONTEXT_V1_SOURCE_MAP) {
      expect(entry.truthSources.length).toBeGreaterThan(0);
      expect(entry.truthSources.every((source) => allowedSources.has(source))).toBe(true);
      expect(entry.existingReaderOrContract.length).toBeGreaterThan(0);
    }
  });

  it("keeps legacy-only readers in an explicit exclusion registry", () => {
    const excluded = COACH_CONTEXT_V1_LEGACY_EXCLUSIONS.map((entry) => entry.legacySource);

    expect(excluded).toEqual(expect.arrayContaining([
      expect.stringContaining("loadAiCoachMaterialContext"),
      expect.stringContaining("loadMaterialWorkloads"),
      expect.stringContaining("target-capacity"),
      expect.stringContaining("loadDailyCoachContext"),
      expect.stringContaining("ai-coach-plan-preview"),
      expect.stringContaining("apply_confirmed_action_proposal"),
    ]));
  });
});
