import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadCoachContextV1ReadOnly } from "./coach-context-v1-readonly.ts";
import { loadCanonicalCapacityReadOnly } from "./canonical-capacity-readonly.ts";
import { loadCurrentPlannerV2PersistedStateReadOnly } from "./planner-v2-persisted-readonly.ts";
import {
  COACH_EVIDENCE_DETAIL_KINDS_V1,
  COACH_EVIDENCE_DETAIL_REQUEST_V1_VERSION,
  COACH_EVIDENCE_DETAIL_V1_LIMITS,
  COACH_EVIDENCE_SCOPE_CAPABILITY_V1,
  COACH_EVIDENCE_SCOPES_V1,
  COACH_EVIDENCE_SCOPE_RULES_V1,
  COACH_EVIDENCE_VIEW_V1_LIMITS,
  COACH_CONTEXT_V1_LIMITS,
  COACH_SIGNAL_V1_LIMITS,
  buildCoachSignalSetV1,
  projectCoachEvidenceViewV1,
  resolveCoachEvidenceDetailV1,
} from "../../../packages/domain/src/ai-coach/index.ts";

const NOW = new Date("2026-09-10T09:00:00.000Z");
const USER = "00000000-0000-0000-0000-000000000901";
const PROFILE = "00000000-0000-0000-0000-000000000902";
const PLAN = "00000000-0000-0000-0000-000000000903";
const SUBJECTS = [
  { id: "20000000-0000-0000-0000-000000000001", name: "Türkçe" },
  { id: "20000000-0000-0000-0000-000000000002", name: "Matematik" },
  { id: "20000000-0000-0000-0000-000000000003", name: "Tarih" },
];

type Row = Record<string, any>;

class Query implements PromiseLike<{ data: any; error: null }> {
  private filters: Array<(row: Row) => boolean> = [];
  private ordering: { column: string; ascending: boolean } | null = null;
  private maximum: number | null = null;
  private single = false;
  constructor(private rows: readonly Row[]) {}
  select() { return this; }
  eq(column: string, value: any) { this.filters.push((row) => row[column] === value); return this; }
  is(column: string, value: any) { this.filters.push((row) => row[column] === value); return this; }
  in(column: string, values: readonly any[]) { this.filters.push((row) => values.includes(row[column])); return this; }
  gte(column: string, value: any) { this.filters.push((row) => row[column] >= value); return this; }
  lte(column: string, value: any) { this.filters.push((row) => row[column] <= value); return this; }
  lt(column: string, value: any) { this.filters.push((row) => row[column] < value); return this; }
  order(column: string, options: { ascending: boolean }) { this.ordering = { column, ascending: options.ascending }; return this; }
  limit(value: number) { this.maximum = value; return this; }
  maybeSingle() { this.single = true; return this; }
  then<TResult1 = { data: any; error: null }, TResult2 = never>(resolve?: ((value: { data: any; error: null }) => TResult1 | PromiseLike<TResult1>) | null, reject?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null): Promise<TResult1 | TResult2> {
    let rows = this.rows.filter((row) => this.filters.every((filter) => filter(row)));
    if (this.ordering) {
      const { column, ascending } = this.ordering;
      rows = [...rows].sort((left, right) => String(left[column]).localeCompare(String(right[column])) * (ascending ? 1 : -1));
    }
    if (this.maximum !== null) rows = rows.slice(0, this.maximum);
    return Promise.resolve({ data: this.single ? rows[0] ?? null : rows, error: null }).then(resolve, reject);
  }
}

class ReadOnlyFakeClient {
  readonly calls: string[] = [];
  constructor(readonly tables: Record<string, Row[]>) {}
  from(table: string) { this.calls.push(`select:${table}`); return new Query(this.tables[table] ?? []); }
  insert() { throw new Error("MUTATION_FORBIDDEN"); }
  update() { throw new Error("MUTATION_FORBIDDEN"); }
  upsert() { throw new Error("MUTATION_FORBIDDEN"); }
  delete() { throw new Error("MUTATION_FORBIDDEN"); }
  rpc() { throw new Error("RPC_FORBIDDEN"); }
}

function productionShapedTables() {
  const tasks = Array.from({ length: 42 }, (_, index) => {
    const day = 7 + (index % 7);
    const subject = SUBJECTS[index % SUBJECTS.length];
    const completed = index % 5 === 0;
    return {
      id: `task-${String(index).padStart(2, "0")}`, user_id: USER, exam_profile_id: PROFILE,
      weekly_plan_id: PLAN, subject_id: subject.id, curriculum_node_id: `topic-${index % 9}`,
      resource_id: `resource-${index % 6}`, resource_section_id: null, task_type: "learn_topic",
      title: `Görev ${index}`, planned_date: `2026-09-${String(day).padStart(2, "0")}`,
      estimated_minutes: 30 + (index % 3) * 15, status: completed ? "completed" : index % 4 === 0 ? "partially_completed" : "ready",
      completed_at: completed ? `2026-09-${String(day).padStart(2, "0")}T09:00:00.000Z` : null,
      updated_at: `2026-09-${String(day).padStart(2, "0")}T09:00:00.000Z`,
      canonical_workload_identity: `physical:unit-${index}`,
    };
  });
  const progress = tasks.map((task, index) => ({
    task_id: task.id, user_id: USER,
    completed_minutes: task.status === "completed" ? task.estimated_minutes : task.status === "partially_completed" ? 15 : 0,
    updated_at: task.updated_at,
  }));
  const sessions = Array.from({ length: 9 }, (_, index) => ({
    id: `session-${index}`, user_id: USER, exam_profile_id: PROFILE,
    task_id: tasks[index].id, subject_id: SUBJECTS[index % SUBJECTS.length].id,
    resource_id: `resource-${index % 6}`, started_at: `2026-09-${String(7 + (index % 4)).padStart(2, "0")}T10:00:00.000Z`,
    ended_at: `2026-09-${String(7 + (index % 4)).padStart(2, "0")}T10:30:00.000Z`,
    duration_minutes: 30, status: "completed", entry_source: "web",
  }));
  return {
    exam_profiles: [{ id: PROFILE, user_id: USER, exam_edition_id: "edition-2027", target_exam_date: "2027-08-01", status: "active" }],
    user_profiles: [{ id: USER, display_name: "Esra", timezone: "Europe/Istanbul" }],
    weekly_plans: [{ id: PLAN, user_id: USER, exam_profile_id: PROFILE, week_start_date: "2026-09-07", week_end_date: "2026-09-13", available_minutes: 840, planning_budget_minutes: 720, planned_minutes: 700, status: "active", generation_version: 4 }],
    user_subjects: SUBJECTS.map((subject) => ({ user_id: USER, exam_profile_id: PROFILE, subject_id: subject.id, status: "active", subjects: subject })),
    resources: Array.from({ length: 6 }, (_, index) => ({ id: `resource-${index}`, user_id: USER, exam_profile_id: PROFILE, subject_id: SUBJECTS[index % 3].id, status: "active" })),
    study_sessions: sessions,
    study_session_allocations: sessions.slice(0, 8).map((session, index) => ({ id: `allocation-${index}`, user_id: USER, exam_profile_id: PROFILE, session_id: session.id, accounting_intent: index % 3 === 0 ? "extra" : "planned", target_task_id: index % 3 === 0 ? null : session.task_id, subject_id: session.subject_id, resource_id: session.resource_id, actual_minutes: 30, planned_credit_minutes: index % 3 === 0 ? 0 : 30, recorded_at: session.ended_at, superseded_at: null })),
    tasks,
    task_progress: progress,
    study_substitutions: [],
    task_carryovers: [],
    confirmed_action_proposals: [],
  };
}

function materialDependencies(overrides: Record<string, any> = {}) {
  const units = Array.from({ length: 8 }, (_, index) => ({
    id: `material-${index}`, sourceKind: index % 2 ? "youtube" : "physical", resourceId: `resource-${index % 6}`,
    curriculumNodeId: `topic-${index}`, title: `Materyal ${index}`, unitType: index % 2 ? "video" : "page_range",
    progressState: index % 3 === 0 ? "in_progress" : "not_started", completedThroughPage: index % 2 ? null : 4,
    durationSeconds: index % 2 ? 1800 : null, watchedSeconds: index % 2 ? 300 : null,
    mappingStatus: "validated", mappingProvenance: "reviewed_catalog", isActive: true,
  }));
  const estimates = units.map((unit, index) => ({ materialViewId: unit.id, subjectId: SUBJECTS[index % 3].id, remainingAmount: index % 2 ? 1500 : 10, remainingUnit: index % 2 ? "video_second" : "page", estimatedMinutes: 25, authority: index % 2 ? "exact" : "calibrated", confidence: "high", plannerEligible: true, reason: "canonical" }));
  return {
    loadCanonicalMaterials: async () => units,
    loadCanonicalWorkload: async () => ({ estimates, summary: { totalMaterialViews: 8, exactWorkloadViews: 4, calibratedWorkloadViews: 4, unknownWorkloadViews: 0, plannerEligibleViews: 8, exactYoutubeRemainingMinutes: 100, physicalPagesWithCalibratedWorkload: 40, physicalPagesWithUnknownWorkload: 0, physicalEstimatedRemainingMinutes: 100, blockedByReason: {}, workloadMinutesBySubject: Object.fromEntries(SUBJECTS.map((subject) => [subject.id, 65])), workloadMinutesByResource: {} } }),
    loadCapacity: async () => ({ horizonStart: "2026-09-07", horizonEnd: "2026-09-13", days: Array.from({ length: 7 }, (_, index) => ({ date: `2026-09-${String(7 + index).padStart(2, "0")}`, grossMinutes: 120, reserveMinutes: 15, planningMinutes: 105 })), sourceRows: { availability: [], calendarPeriods: [], scheduleExceptions: [] }, dailyOverrides: new Map() }),
    loadPlannerState: async () => null,
    ...overrides,
  };
}

describe("CoachContextV1 read-only adapter", () => {
  it("constructs a deterministic compact production-shaped context without mutations", async () => {
    const tables = productionShapedTables();
    const before = JSON.stringify(tables);
    const client = new ReadOnlyFakeClient(tables);
    const dependencies = materialDependencies();
    const first = await loadCoachContextV1ReadOnly({ client, userId: USER, requestId: "request-1", now: NOW, dependencies });
    const second = await loadCoachContextV1ReadOnly({ client, userId: USER, requestId: "request-1", now: NOW, dependencies });
    expect(second).toEqual(first);
    expect(JSON.stringify(tables)).toBe(before);
    expect(first.week.value?.tasks).toHaveLength(COACH_EVIDENCE_DETAIL_V1_LIMITS.week_tasks);
    expect(first.week.value?.summary.totalTaskCount).toBe(42);
    expect(first.today.value?.tasks).toHaveLength(6);
    expect(first.subjects).toHaveLength(3);
    expect(first.recentProgress.value?.sessions).toHaveLength(9);
    expect(first.authority).toMatchObject({ mode: "read_only", dbWritesAllowed: false, planningCalculationsAllowed: false, plannerConfirmationAllowed: false, plannerApplyAllowed: false });
    expect(client.calls.every((call) => call.startsWith("select:"))).toBe(true);
    const serializedBytes = Buffer.byteLength(JSON.stringify(first), "utf8");
    expect(serializedBytes).toBeLessThan(65_536);
    console.info(`COACH_CONTEXT_V1_HIGH_VOLUME_BYTES=${serializedBytes}`);

    const signalSet = buildCoachSignalSetV1(first);
    const signalBytes = Buffer.byteLength(JSON.stringify(signalSet), "utf8");
    expect(signalSet.candidates.length).toBeLessThanOrEqual(COACH_SIGNAL_V1_LIMITS.candidates);
    expect(signalBytes).toBeLessThanOrEqual(COACH_SIGNAL_V1_LIMITS.serializedBytes);
    console.info(`COACH_SIGNAL_V1_HIGH_VOLUME count=${signalSet.candidates.length} bytes=${signalBytes} max_count=${COACH_SIGNAL_V1_LIMITS.candidates}`);

    for (const scope of COACH_EVIDENCE_SCOPES_V1) {
      const view = projectCoachEvidenceViewV1(first, {
        scope,
        capability: COACH_EVIDENCE_SCOPE_CAPABILITY_V1[scope],
        ...(scope === "subject_progress" ? { subjectId: SUBJECTS[0].id } : {}),
      });
      const bytes = Buffer.byteLength(JSON.stringify(view), "utf8");
      const reductionPercent = Number(((1 - bytes / serializedBytes) * 100).toFixed(1));
      expect(bytes).toBeLessThanOrEqual(COACH_EVIDENCE_VIEW_V1_LIMITS.serializedBytes);
      expect(bytes).toBeLessThan(serializedBytes);
      console.info(`COACH_EVIDENCE_VIEW_V1_SIZE scope=${scope} bytes=${bytes} reduction_percent=${reductionPercent}`);
      if (scope === "proactive_candidate") {
        const acceptedBeforeSignalsBytes = 21_289;
        console.info(`COACH_PROACTIVE_SIGNAL_SIZE_IMPACT before=${acceptedBeforeSignalsBytes} after=${bytes} delta=${bytes - acceptedBeforeSignalsBytes}`);
        expect(bytes - acceptedBeforeSignalsBytes).toBeLessThanOrEqual(8_192);
      }
    }
    expect(projectCoachEvidenceViewV1(first, {
      scope: "today_explain",
      capability: "explain",
    }).evidence.canonicalWork?.next).toMatchObject({
      availability: "unknown",
      unknownReason: "canonical_selector_unavailable",
    });
    expect(projectCoachEvidenceViewV1(first, {
      scope: "week_progress",
      capability: "progress_analysis",
    }).evidence.week?.value?.progressPosition).toMatchObject({
      availability: "blocked",
      unknownReason: "pln002_completeness_unresolved",
    });

    let largestDetail = { kind: "", bytes: 0 };
    for (const kind of COACH_EVIDENCE_DETAIL_KINDS_V1) {
      const detail = resolveCoachEvidenceDetailV1(first, {
        version: COACH_EVIDENCE_DETAIL_REQUEST_V1_VERSION,
        kind,
        userId: first.userId,
        examProfileId: first.examProfileId,
        ...(["subject_tasks", "subject_material_progress"].includes(kind)
          ? { subjectId: SUBJECTS[0].id }
          : {}),
      });
      const bytes = Buffer.byteLength(JSON.stringify(detail), "utf8");
      expect(bytes).toBeLessThanOrEqual(COACH_EVIDENCE_DETAIL_V1_LIMITS.serializedBytes);
      if (bytes > largestDetail.bytes) largestDetail = { kind, bytes };
      console.info(`COACH_EVIDENCE_DETAIL_V1_SIZE kind=${kind} bytes=${bytes}`);
    }
    console.info(`COACH_EVIDENCE_DETAIL_V1_LARGEST kind=${largestDetail.kind} bytes=${largestDetail.bytes}`);
  });

  it("keeps canonical next work and PLN-002 trajectory unavailable", async () => {
    const context = await loadCoachContextV1ReadOnly({ client: new ReadOnlyFakeClient(productionShapedTables()), userId: USER, requestId: "request-2", now: NOW, dependencies: materialDependencies() });
    expect(context.nextWork).toMatchObject({ availability: "unknown", value: null, unknownReason: "canonical_selector_unavailable" });
    expect(context.week.value?.studyIntentCoverage).toBe("partial");
    expect(context.week.value?.progressPosition).toMatchObject({ availability: "blocked", value: null, unknownReason: "pln002_completeness_unresolved" });
    expect(context.capacity.value?.days.every((day) => day.availableMinutes.availability === "unknown" && day.protectedMinutes.availability === "unknown")).toBe(true);
  });

  it("degrades workload failure at field level while preserving canonical material facts", async () => {
    const dependencies = materialDependencies({ loadCanonicalWorkload: async () => { throw new Error("workload unavailable"); } });
    const context = await loadCoachContextV1ReadOnly({ client: new ReadOnlyFakeClient(productionShapedTables()), userId: USER, requestId: "request-3", now: NOW, dependencies });
    expect(context.materials.availability).toBe("known");
    expect(context.materials.value).toHaveLength(8);
    expect(context.materials.value?.every((item) => item.workload.availability === "unknown")).toBe(true);
    expect(context.workload).toMatchObject({ availability: "unknown", unknownReason: "canonical_workload_read_failed" });
    expect(context.today.availability).toBe("known");
  });

  it("degrades material failure without discarding an independently available workload summary", async () => {
    const dependencies = materialDependencies({ loadCanonicalMaterials: async () => { throw new Error("material unavailable"); } });
    const context = await loadCoachContextV1ReadOnly({ client: new ReadOnlyFakeClient(productionShapedTables()), userId: USER, requestId: "request-4", now: NOW, dependencies });
    expect(context.materials).toMatchObject({ availability: "unknown", unknownReason: "canonical_material_read_failed" });
    expect(context.workload.availability).toBe("known");
    expect(context.today.availability).toBe("known");
  });

  it("copies a persisted Planner lifecycle payload without running a preview", async () => {
    let plannerReads = 0;
    const dependencies = materialDependencies({
      loadPlannerState: async () => {
        plannerReads += 1;
        return {
          id: "proposal-record", weekly_plan_id: PLAN, status: "previewed", expires_at: "2026-09-10T10:00:00.000Z",
          planner_proposal_id: "proposal-id", proposal_fingerprint: "proposal-fingerprint",
          planner_snapshot_fingerprint: "snapshot-fingerprint", planner_version: "planner-v2",
          display_payload: {
            lifecycleVersion: "planner-v2-lifecycle-v1", proposalId: "proposal-id",
            proposalFingerprint: "proposal-fingerprint", snapshotFingerprint: "snapshot-fingerprint",
            plannerVersion: "planner-v2", explicitConfirmationRequired: true, applyAvailable: false,
            summary: { totalAvailableMinutes: 100, protectedMinutes: 30, newlyPlannedMinutes: 50, unusedMinutes: 20, unmetEligibleMinutes: 0, blockedDemandCount: 0 },
            differences: { createCanonicalWorkloadIdentities: ["physical:unit-1"], retainedTaskIds: [], replaceableTaskIds: [], outsideScopeTaskIds: [] },
            days: [{ warnings: ["persisted-warning"] }], explanationFacts: [{ kind: "day_capacity", date: "2026-09-11", availableMinutes: 70 }],
          },
        };
      },
    });
    const context = await loadCoachContextV1ReadOnly({ client: new ReadOnlyFakeClient(productionShapedTables()), userId: USER, requestId: "request-5", now: NOW, dependencies });
    expect(plannerReads).toBe(1);
    expect(context.planner).toMatchObject({ availability: "known", value: { lifecycleState: "previewed", proposalRecordId: "proposal-record", applyAvailable: false } });
    const view = projectCoachEvidenceViewV1(context, {
      scope: "planner_explanation",
      capability: "planner_proposal_interpretation",
    });
    expect(Object.keys(view.evidence)).toEqual(["planner"]);
    expect(view.evidence.planner).toMatchObject({
      availability: "known",
      value: {
        lifecycleState: "previewed",
        warnings: ["persisted-warning"],
        explanationFacts: [{ kind: "day_capacity", date: "2026-09-11", availableMinutes: 70 }],
        applyAvailable: false,
      },
    });
    const detail = resolveCoachEvidenceDetailV1(context, {
      version: COACH_EVIDENCE_DETAIL_REQUEST_V1_VERSION,
      kind: "planner_explanation_detail",
      userId: USER,
      examProfileId: PROFILE,
    });
    expect(detail.payload).toMatchObject({
      availability: "known",
      value: {
        proposalRecordId: "proposal-record",
        differences: { createCanonicalWorkloadIdentities: ["physical:unit-1"] },
        warnings: ["persisted-warning"],
        applyAvailable: false,
      },
    });
    expect(detail.collection).toMatchObject({ availableCount: 3, returnedCount: 3, truncated: false });
  });

  it("deterministically bounds material detail while preserving full canonical summaries", async () => {
    const units = Array.from({ length: COACH_CONTEXT_V1_LIMITS.provenanceRecordIdsPerFact + 8 }, (_, index) => ({
      id: `material-${String(index).padStart(2, "0")}`,
      sourceKind: "physical",
      resourceId: "resource-0",
      curriculumNodeId: `topic-${index}`,
      title: `Materyal ${index}`,
      unitType: "page_range",
      progressState: "not_started",
      completedThroughPage: 0,
      durationSeconds: null,
      watchedSeconds: null,
      mappingStatus: "validated",
      mappingProvenance: "reviewed_catalog",
      isActive: true,
    }));
    const estimates = units.map((unit) => ({
      materialViewId: unit.id,
      remainingAmount: 10,
      remainingUnit: "page",
      estimatedMinutes: 25,
      authority: "calibrated",
      confidence: "high",
      plannerEligible: true,
      reason: "canonical",
    }));
    const dependencies = materialDependencies({
      loadCanonicalMaterials: async () => units,
      loadCanonicalWorkload: async () => ({
        estimates,
        summary: {
          totalMaterialViews: units.length,
          exactWorkloadViews: 0,
          calibratedWorkloadViews: units.length,
          unknownWorkloadViews: 0,
          plannerEligibleViews: units.length,
          exactYoutubeRemainingMinutes: 0,
          physicalPagesWithCalibratedWorkload: units.length * 10,
          physicalPagesWithUnknownWorkload: 0,
          physicalEstimatedRemainingMinutes: units.length * 25,
          blockedByReason: {},
          workloadMinutesBySubject: {},
          workloadMinutesByResource: {},
        },
      }),
    });

    const context = await loadCoachContextV1ReadOnly({
      client: new ReadOnlyFakeClient(productionShapedTables()),
      userId: USER,
      requestId: "request-material-bound",
      now: NOW,
      dependencies,
    });

    const materialDetailLimit = COACH_EVIDENCE_SCOPE_RULES_V1.canonical_work
      .collectionLimits["canonicalWork.materials"]!;
    expect(context.materials.value).toHaveLength(materialDetailLimit);
    expect(context.materials.value?.map((material) => material.materialViewId))
      .toEqual(units
        .slice(0, materialDetailLimit)
        .sort((left, right) => left.resourceId.localeCompare(right.resourceId) || left.id.localeCompare(right.id))
        .map((unit) => unit.id));
    expect(context.materials.provenance[0]?.recordIds).toHaveLength(materialDetailLimit);
    expect(context.workload.value?.totalMaterialViews).toBe(units.length);
    expect(context.subjects.reduce((sum, subject) => sum + (subject.material.value?.totalMaterialViews ?? 0), 0))
      .toBe(units.length);
    expect(context.subjects.find((subject) => subject.subjectId === SUBJECTS[0].id)?.material.provenance[0]?.recordIds)
      .toEqual([]);
  });

  it("preserves the extracted canonical capacity calculation and P48 reserve semantics", async () => {
    const tables = productionShapedTables();
    tables.weekly_availability = [{ id: "availability-1", user_id: USER, exam_profile_id: PROFILE, weekday: 1, start_time: "09:00", end_time: "11:00", is_active: true }];
    tables.calendar_periods = [];
    tables.schedule_exceptions = [];
    tables.p48_daily_capacity_overrides = [{ user_id: USER, exam_profile_id: PROFILE, capacity_date: "2026-09-07", capacity_minutes: 100, reserve_minutes: 15 }];
    const projection = await loadCanonicalCapacityReadOnly({ client: new ReadOnlyFakeClient(tables), userId: USER, examProfileId: PROFILE, horizonStart: "2026-09-07", horizonEnd: "2026-09-07", hypotheticalCapacityEvent: { effectiveDate: "2026-09-07", deltaMinutes: 30 } });
    expect(projection.days).toEqual([{ date: "2026-09-07", grossMinutes: 130, reserveMinutes: 15, planningMinutes: 115 }]);
  });

  it("reads only the newest persisted Planner V2 lifecycle row", async () => {
    const tables = productionShapedTables();
    tables.confirmed_action_proposals = [
      { id: "old", user_id: USER, exam_profile_id: PROFILE, weekly_plan_id: PLAN, action_kind: "planner_v2_week", created_at: "2026-09-10T08:00:00.000Z" },
      { id: "new", user_id: USER, exam_profile_id: PROFILE, weekly_plan_id: PLAN, action_kind: "planner_v2_week", created_at: "2026-09-10T09:00:00.000Z" },
    ];
    const row = await loadCurrentPlannerV2PersistedStateReadOnly(new ReadOnlyFakeClient(tables), USER, PROFILE, PLAN);
    expect(row?.id).toBe("new");
  });

  it("does not import preview builders or legacy Coach truth loaders", () => {
    const source = readFileSync(new URL("./coach-context-v1-readonly.ts", import.meta.url), "utf8");
    expect(source).not.toContain("buildPlannerV2Preview");
    expect(source).not.toContain("runCanonicalPlannerV2ReadOnlyShadow");
    expect(source).not.toContain("loadDailyCoachContext");
    expect(source).not.toContain("loadAiCoachMaterialContext");
    expect(source).not.toContain("loadMaterialWorkloads");
    expect(source).not.toContain("loadCurrentGrossCapacityForDate");
    expect(source).not.toMatch(/\.(insert|update|upsert|delete)\s*\(/);
    expect(source).not.toMatch(/\.rpc\s*\(/);
  });
});
