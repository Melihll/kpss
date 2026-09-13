import {
  blockedCoachContextV1Fact,
  buildCoachContextV1,
  knownCoachContextV1Fact,
  notApplicableCoachContextV1Fact,
  staleCoachContextV1Fact,
  unknownCoachContextV1Fact,
} from "./ai-coach.bundle.js";
import type {
  CoachContextV1,
  CoachContextV1Fact,
  CoachContextV1MaterialProgress,
  CoachContextV1MaterialWorkload,
  CoachContextV1PlannerExplanationFact,
  CoachContextV1PlannerState,
  CoachContextV1StudyAccounting,
  CoachContextV1SubjectSummary,
  CoachContextV1Task,
  CoachContextV1TaskSummary,
} from "../../../packages/domain/src/ai-coach/coach-context-v1.ts";
import { mergePlanningTaskProgressV1 } from "./planning-v2.bundle.js";
import { addRevisionCalendarDays, zonedMidnightToUtc } from "./planning.bundle.js";
import { loadCanonicalMaterialUnits } from "./canonical-material-loader.ts";
import { loadCanonicalWorkloadReadiness } from "./canonical-material-shadow.ts";
import {
  loadCanonicalCapacityReadOnly,
  type CanonicalCapacityReadOnlyProjection,
} from "./canonical-capacity-readonly.ts";
import { loadCurrentPlannerV2PersistedStateReadOnly } from "./planner-v2-persisted-readonly.ts";

type Client = any;
type DbResult<T = any> = { data: T; error: any };

export interface CoachContextV1ReadOnlyDependencies {
  readonly loadCanonicalMaterials: (client: Client, userId: string, examProfileId: string, resourceIds: readonly string[]) => Promise<any>;
  readonly loadCanonicalWorkload: (client: Client, userId: string, examProfileId: string, resourceIds: readonly string[]) => Promise<any>;
  readonly loadCapacity: (input: Parameters<typeof loadCanonicalCapacityReadOnly>[0]) => Promise<CanonicalCapacityReadOnlyProjection>;
  readonly loadPlannerState: (client: Client, userId: string, examProfileId: string, weeklyPlanId: string) => Promise<any>;
}

export interface CoachContextV1ReadOnlyInput {
  readonly client: Client;
  /** Must come from the authenticated server boundary. */
  readonly userId: string;
  readonly requestId: string;
  readonly now?: Date;
  readonly locale?: string;
  readonly dependencies?: Partial<CoachContextV1ReadOnlyDependencies>;
}

const DEFAULT_DEPENDENCIES: CoachContextV1ReadOnlyDependencies = {
  loadCanonicalMaterials: loadCanonicalMaterialUnits,
  loadCanonicalWorkload: loadCanonicalWorkloadReadiness,
  loadCapacity: loadCanonicalCapacityReadOnly,
  loadPlannerState: loadCurrentPlannerV2PersistedStateReadOnly,
};

function provenance(source: any, recordIds: readonly string[], asOf: string) {
  return [{ source, recordIds: [...new Set(recordIds.filter(Boolean))].sort(), asOf }] as const;
}

function known<T>(value: T, source: any, recordIds: readonly string[], asOf: string) {
  return knownCoachContextV1Fact(value, { provenance: provenance(source, recordIds, asOf), asOf });
}

function knownFrom<T>(value: T, sources: readonly { source: any; recordIds: readonly string[] }[], asOf: string) {
  return knownCoachContextV1Fact(value, {
    provenance: sources.flatMap((item) => provenance(item.source, item.recordIds, asOf)),
    asOf,
  });
}

function currentDateAt(now: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);
}

function mondayOf(date: string): string {
  const value = new Date(`${date}T12:00:00Z`);
  const weekday = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() - weekday + 1);
  return value.toISOString().slice(0, 10);
}

async function requireResult(result: PromiseLike<DbResult> | DbResult): Promise<any> {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return resolved.data;
}

function finiteMinutes(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

function summarizeTasks(tasks: readonly CoachContextV1Task[]): CoachContextV1TaskSummary {
  const open = tasks.filter((task) => !["completed", "cancelled"].includes(task.status));
  return {
    totalTaskCount: tasks.length,
    openTaskCount: open.length,
    completedTaskCount: tasks.filter((task) => task.status === "completed").length,
    partiallyCompletedTaskCount: tasks.filter((task) => task.status === "partially_completed").length,
    plannedMinutes: tasks.reduce((sum, task) => sum + task.estimatedMinutes, 0),
    completedMinutes: tasks.reduce((sum, task) => sum + task.completedMinutes, 0),
    remainingMinutes: open.reduce((sum, task) => sum + task.remainingMinutes, 0),
  };
}

function emptyStudy(): CoachContextV1StudyAccounting {
  return { actualMinutes: 0, plannedActualMinutes: 0, plannedCreditMinutes: 0, extraActualMinutes: 0, unknownIntentMinutes: 0 };
}

function studyAccounting(sessions: readonly any[], allocations: readonly any[]): CoachContextV1StudyAccounting {
  const accounting = { ...emptyStudy() };
  const allocatedSessionIds = new Set(allocations.map((row) => String(row.session_id)));
  for (const session of sessions) {
    accounting.actualMinutes += finiteMinutes(session.duration_minutes);
    if (!allocatedSessionIds.has(String(session.id))) accounting.unknownIntentMinutes += finiteMinutes(session.duration_minutes);
  }
  for (const allocation of allocations) {
    const actual = finiteMinutes(allocation.actual_minutes);
    if (allocation.accounting_intent === "planned") {
      accounting.plannedActualMinutes += actual;
      accounting.plannedCreditMinutes += finiteMinutes(allocation.planned_credit_minutes);
    } else if (allocation.accounting_intent === "extra") {
      accounting.extraActualMinutes += actual;
    } else {
      accounting.unknownIntentMinutes += actual;
    }
  }
  return accounting;
}

function taskProjection(rows: readonly any[], progressRows: readonly any[]): CoachContextV1Task[] {
  const progress = new Map(progressRows.map((row) => [String(row.task_id), row]));
  return rows.map((row) => {
    const state = mergePlanningTaskProgressV1(row, progress.get(String(row.id)) ?? null);
    return {
      taskId: state.taskId,
      title: state.title,
      subjectId: state.subjectId,
      curriculumNodeId: state.curriculumUnitId,
      resourceId: state.resourceId,
      canonicalWorkloadIdentity: row.canonical_workload_identity == null ? null : String(row.canonical_workload_identity),
      plannedDate: state.plannedDate,
      status: state.status,
      estimatedMinutes: state.estimatedMinutes,
      completedMinutes: state.completedMinutes,
      remainingMinutes: state.remainingMinutes,
    };
  });
}

function parsePlannerState(row: any): CoachContextV1PlannerState | null {
  const preview = row?.display_payload;
  const summary = preview?.summary;
  const differences = preview?.differences;
  if (!row || !preview || typeof preview !== "object" || !summary || !differences) return null;
  const state = String(row.status);
  if (!["generated", "previewed", "confirmed", "applied", "stale", "rejected", "expired"].includes(state)) return null;
  const requiredSummary = ["totalAvailableMinutes", "protectedMinutes", "newlyPlannedMinutes", "unusedMinutes", "unmetEligibleMinutes", "blockedDemandCount"];
  if (preview.lifecycleVersion !== "planner-v2-lifecycle-v1" || requiredSummary.some((key) => !Number.isFinite(summary[key]) || Number(summary[key]) < 0)) return null;
  const requiredDifferences = ["createCanonicalWorkloadIdentities", "retainedTaskIds", "replaceableTaskIds", "outsideScopeTaskIds"];
  if (
    requiredDifferences.some((key) => !Array.isArray(differences[key])) ||
    !Array.isArray(preview.days) ||
    !Array.isArray(preview.explanationFacts) ||
    preview.explicitConfirmationRequired !== true ||
    preview.applyAvailable !== false ||
    ![row.planner_proposal_id, row.proposal_fingerprint, row.planner_snapshot_fingerprint, row.planner_version, row.expires_at].every((value) => typeof value === "string" && value.length > 0) ||
    preview.proposalId !== row.planner_proposal_id ||
    preview.proposalFingerprint !== row.proposal_fingerprint ||
    preview.snapshotFingerprint !== row.planner_snapshot_fingerprint ||
    preview.plannerVersion !== row.planner_version ||
    Number.isNaN(new Date(row.expires_at).getTime())
  ) return null;
  const explanationFacts = preview.explanationFacts.filter(validPlannerExplanationFact) as CoachContextV1PlannerExplanationFact[];
  if (explanationFacts.length !== preview.explanationFacts.length) return null;
  return {
    lifecycleVersion: preview.lifecycleVersion,
    lifecycleState: state as CoachContextV1PlannerState["lifecycleState"],
    weeklyPlanId: String(row.weekly_plan_id),
    proposalRecordId: String(row.id),
    proposalId: String(row.planner_proposal_id),
    proposalFingerprint: String(row.proposal_fingerprint),
    snapshotFingerprint: String(row.planner_snapshot_fingerprint),
    plannerVersion: String(row.planner_version),
    expiresAt: String(row.expires_at),
    freshnessReasons: state === "stale" ? ["persisted_lifecycle_stale"] : [],
    summary: {
      totalAvailableMinutes: finiteMinutes(summary.totalAvailableMinutes),
      protectedMinutes: finiteMinutes(summary.protectedMinutes),
      newlyPlannedMinutes: finiteMinutes(summary.newlyPlannedMinutes),
      unusedMinutes: finiteMinutes(summary.unusedMinutes),
      unmetEligibleMinutes: finiteMinutes(summary.unmetEligibleMinutes),
      blockedDemandCount: finiteMinutes(summary.blockedDemandCount),
    },
    differences: {
      createCanonicalWorkloadIdentities: differences.createCanonicalWorkloadIdentities.map(String),
      retainedTaskIds: differences.retainedTaskIds.map(String),
      replaceableTaskIds: differences.replaceableTaskIds.map(String),
      outsideScopeTaskIds: differences.outsideScopeTaskIds.map(String),
    },
    warnings: Array.isArray(preview.days) ? preview.days.flatMap((day: any) => Array.isArray(day.warnings) ? day.warnings.map(String) : []) : [],
    explanationFacts,
    explicitConfirmationRequired: true,
    applyAvailable: false,
  };
}

function validPlannerExplanationFact(fact: any): fact is CoachContextV1PlannerExplanationFact {
  if (!fact || typeof fact !== "object" || typeof fact.kind !== "string") return false;
  if (fact.kind === "day_capacity") return typeof fact.date === "string" && Number.isFinite(fact.availableMinutes);
  if (fact.kind === "continuation_selected") return typeof fact.canonicalWorkloadIdentity === "string";
  if (fact.kind === "blocked_workload") return typeof fact.canonicalWorkloadIdentity === "string" && typeof fact.reason === "string";
  if (fact.kind === "current_day_protected") return typeof fact.date === "string" && Array.isArray(fact.commitmentIds);
  if (fact.kind === "unused_capacity") return typeof fact.date === "string" && Number.isFinite(fact.unusedMinutes) && fact.reason === "next_indivisible_workload_does_not_fit";
  if (fact.kind === "replacement_scope") return Array.isArray(fact.replaceableTaskIds) && Array.isArray(fact.retainedTaskIds);
  return false;
}

function workloadSummary(value: any) {
  const numericFields = ["totalMaterialViews", "exactWorkloadViews", "calibratedWorkloadViews", "unknownWorkloadViews", "plannerEligibleViews", "exactYoutubeRemainingMinutes", "physicalPagesWithCalibratedWorkload", "physicalPagesWithUnknownWorkload", "physicalEstimatedRemainingMinutes"];
  if (!value || numericFields.some((key) => !Number.isFinite(value[key]) || Number(value[key]) < 0) || typeof value.blockedByReason !== "object" || typeof value.workloadMinutesBySubject !== "object" || typeof value.workloadMinutesByResource !== "object") return null;
  return {
    totalMaterialViews: Number(value.totalMaterialViews),
    exactWorkloadViews: Number(value.exactWorkloadViews),
    calibratedWorkloadViews: Number(value.calibratedWorkloadViews),
    unknownWorkloadViews: Number(value.unknownWorkloadViews),
    plannerEligibleViews: Number(value.plannerEligibleViews),
    exactYoutubeRemainingMinutes: Number(value.exactYoutubeRemainingMinutes),
    physicalPagesWithCalibratedWorkload: Number(value.physicalPagesWithCalibratedWorkload),
    physicalPagesWithUnknownWorkload: Number(value.physicalPagesWithUnknownWorkload),
    physicalEstimatedRemainingMinutes: Number(value.physicalEstimatedRemainingMinutes),
    blockedByReason: value.blockedByReason ?? {},
    minutesBySubject: value.workloadMinutesBySubject ?? {},
    minutesByResource: value.workloadMinutesByResource ?? {},
  };
}

function materialProjection(units: readonly any[], workload: any, subjectByResource: ReadonlyMap<string, string>, asOf: string): CoachContextV1MaterialProgress[] {
  const estimates = new Map((workload?.estimates ?? []).map((row: any) => [String(row.materialViewId), row]));
  return units.filter((unit) => unit.isActive === true).map((unit) => {
    const estimate: any = estimates.get(String(unit.id));
    const estimateValid = estimate && ["exact", "calibrated", "unknown"].includes(estimate.authority) && ["none", "low", "medium", "high"].includes(estimate.confidence) && ["page", "video_second"].includes(estimate.remainingUnit) && (estimate.estimatedMinutes === null || Number.isFinite(estimate.estimatedMinutes));
    const workloadFact: CoachContextV1Fact<CoachContextV1MaterialWorkload> = estimateValid
      ? known<CoachContextV1MaterialWorkload>({
          remainingAmount: estimate.remainingAmount ?? null,
          remainingUnit: estimate.remainingUnit,
          estimatedMinutes: estimate.estimatedMinutes ?? null,
          authority: estimate.authority,
          confidence: estimate.confidence,
          plannerEligible: estimate.plannerEligible === true,
          unresolvedReason: estimate.authority === "unknown" ? String(estimate.reason) : null,
        }, "canonical_workload_engine_v1", [String(unit.id)], asOf)
      : unknownCoachContextV1Fact("canonical_workload_fact_missing", ["canonical_workload_engine_v1"]);
    return {
      materialViewId: String(unit.id),
      sourceKind: unit.sourceKind,
      resourceId: String(unit.resourceId),
      subjectId: subjectByResource.get(String(unit.resourceId)) ?? null,
      curriculumNodeId: unit.curriculumNodeId == null ? null : String(unit.curriculumNodeId),
      title: String(unit.title),
      unitType: unit.unitType,
      progressState: unit.progressState,
      completedThroughPage: unit.completedThroughPage ?? null,
      durationSeconds: unit.durationSeconds ?? null,
      watchedSeconds: unit.watchedSeconds ?? null,
      mappingStatus: unit.mappingStatus,
      mappingProvenance: unit.mappingProvenance,
      workload: workloadFact,
    };
  });
}

function capacityProjection(
  value: CanonicalCapacityReadOnlyProjection,
  sessions: readonly any[],
  timezone: string,
  _asOf: string,
) {
  const actualByDate = new Map<string, number>();
  for (const session of sessions) {
    const date = currentDateAt(new Date(session.started_at), timezone);
    actualByDate.set(date, (actualByDate.get(date) ?? 0) + finiteMinutes(session.duration_minutes));
  }
  return {
    horizonStart: value.horizonStart,
    horizonEnd: value.horizonEnd,
    days: value.days.map((day) => ({
      ...day,
      alreadyStudiedMinutes: actualByDate.get(day.date) ?? 0,
      protectedMinutes: unknownCoachContextV1Fact<number>("current_canonical_protected_commitments_unavailable", ["planner_v2_snapshot"]),
      availableMinutes: unknownCoachContextV1Fact<number>("current_canonical_post_commitment_capacity_unavailable", ["planner_v2_snapshot"]),
    })),
  };
}

/** Build CoachContextV1 from user-scoped reads. No method in this adapter can write. */
export async function loadCoachContextV1ReadOnly(input: CoachContextV1ReadOnlyInput): Promise<CoachContextV1> {
  const now = input.now ?? new Date();
  const asOf = now.toISOString();
  const deps = { ...DEFAULT_DEPENDENCIES, ...input.dependencies };

  const profileRow = await requireResult(input.client.from("exam_profiles")
    .select("id,exam_edition_id,target_exam_date,status")
    .eq("user_id", input.userId)
    .eq("status", "active")
    .maybeSingle());
  if (!profileRow) throw new Error("NO_ACTIVE_EXAM_PROFILE");
  const examProfileId = String(profileRow.id);

  const userProfile = await requireResult(input.client.from("user_profiles")
    .select("id,display_name,timezone")
    .eq("id", input.userId)
    .maybeSingle());
  if (!userProfile || typeof userProfile.timezone !== "string" || !userProfile.timezone.trim()) {
    throw new Error("USER_PROFILE_OR_TIMEZONE_UNAVAILABLE");
  }
  const timezone = String(userProfile.timezone);
  const currentDate = currentDateAt(now, timezone);
  const calendarWeekStart = mondayOf(currentDate);
  const calendarWeekEnd = addRevisionCalendarDays(calendarWeekStart, 6);

  const plan = await requireResult(input.client.from("weekly_plans")
    .select("id,user_id,exam_profile_id,week_start_date,week_end_date,available_minutes,planning_budget_minutes,planned_minutes,status,generation_version")
    .eq("user_id", input.userId)
    .eq("exam_profile_id", examProfileId)
    .eq("status", "active")
    .lte("week_start_date", currentDate)
    .gte("week_end_date", currentDate)
    .order("generation_version", { ascending: false })
    .limit(1)
    .maybeSingle());
  const horizonStart = plan?.week_start_date ?? calendarWeekStart;
  const horizonEnd = plan?.week_end_date ?? calendarWeekEnd;
  const endExclusive = zonedMidnightToUtc(addRevisionCalendarDays(horizonEnd, 1), timezone);
  const startUtc = zonedMidnightToUtc(horizonStart, timezone);

  const [subjectsResult, resourcesSettled, sessionsResult, capacitySettled] = await Promise.all([
    requireResult(input.client.from("user_subjects")
      .select("subject_id,status,subjects(id,name)")
      .eq("user_id", input.userId)
      .eq("exam_profile_id", examProfileId)
      .in("status", ["active", "paused", "completed"])),
    Promise.resolve(requireResult(input.client.from("resources")
      .select("id,subject_id")
      .eq("user_id", input.userId)
      .eq("exam_profile_id", examProfileId)
      .eq("status", "active"))).then((value) => ({ status: "fulfilled" as const, value }), (reason) => ({ status: "rejected" as const, reason })),
    requireResult(input.client.from("study_sessions")
      .select("id,task_id,subject_id,resource_id,started_at,ended_at,duration_minutes,status,entry_source")
      .eq("user_id", input.userId)
      .eq("exam_profile_id", examProfileId)
      .eq("status", "completed")
      .gte("started_at", startUtc)
      .lt("started_at", endExclusive)
      .order("started_at", { ascending: true })),
    Promise.resolve(deps.loadCapacity({ client: input.client, userId: input.userId, examProfileId, horizonStart, horizonEnd })).then(
      (value) => ({ status: "fulfilled" as const, value }),
      (reason) => ({ status: "rejected" as const, reason }),
    ),
  ]);
  const subjectRows = subjectsResult ?? [];
  const resourceRows = resourcesSettled.status === "fulfilled" ? resourcesSettled.value ?? [] : [];
  const sessions = sessionsResult ?? [];
  const resourceIds = resourceRows.map((row: any) => String(row.id));
  const subjectByResource = new Map<string, string>(resourceRows.map((row: any) => [String(row.id), String(row.subject_id)]));
  const sessionIds = sessions.map((row: any) => String(row.id));

  const [tasksSettled, allocationsSettled, substitutionsSettled, carryoversSettled, materialsSettled, workloadSettled, plannerSettled] = await Promise.all([
    plan ? Promise.resolve(requireResult(input.client.from("tasks").select("id,user_id,exam_profile_id,weekly_plan_id,subject_id,curriculum_node_id,resource_id,resource_section_id,task_type,title,planned_date,estimated_minutes,status,completed_at,updated_at,canonical_workload_identity").eq("user_id", input.userId).eq("weekly_plan_id", plan.id).order("id", { ascending: true }))).then((value) => ({ status: "fulfilled" as const, value }), (reason) => ({ status: "rejected" as const, reason })) : Promise.resolve({ status: "fulfilled" as const, value: [] as any[] }),
    sessionIds.length ? Promise.resolve(requireResult(input.client.from("study_session_allocations").select("id,session_id,accounting_intent,target_task_id,subject_id,resource_id,actual_minutes,planned_credit_minutes,recorded_at").eq("user_id", input.userId).eq("exam_profile_id", examProfileId).is("superseded_at", null).in("session_id", sessionIds).order("recorded_at", { ascending: true }))).then((value) => ({ status: "fulfilled" as const, value }), (reason) => ({ status: "rejected" as const, reason })) : Promise.resolve({ status: "fulfilled" as const, value: [] }),
    Promise.resolve(requireResult(input.client.from("study_substitutions").select("id,status,source_task_id,replacement_task_id,replacement_session_id,source_minutes_replaced,proposed_at,applied_at").eq("user_id", input.userId).eq("exam_profile_id", examProfileId).gte("proposed_at", startUtc).lt("proposed_at", endExclusive).order("proposed_at", { ascending: false }).limit(16))).then((value) => ({ status: "fulfilled" as const, value }), (reason) => ({ status: "rejected" as const, reason })),
    Promise.resolve(requireResult(input.client.from("task_carryovers").select("id,status,source_task_id,successor_task_id,from_date,to_date,remaining_minutes,proposed_at,applied_at").eq("user_id", input.userId).eq("exam_profile_id", examProfileId).gte("proposed_at", startUtc).lt("proposed_at", endExclusive).order("proposed_at", { ascending: false }).limit(16))).then((value) => ({ status: "fulfilled" as const, value }), (reason) => ({ status: "rejected" as const, reason })),
    resourcesSettled.status === "fulfilled" ? Promise.resolve(deps.loadCanonicalMaterials(input.client, input.userId, examProfileId, resourceIds)).then((value) => ({ status: "fulfilled" as const, value }), (reason) => ({ status: "rejected" as const, reason })) : Promise.resolve({ status: "rejected" as const, reason: resourcesSettled.reason }),
    resourcesSettled.status === "fulfilled" ? Promise.resolve(deps.loadCanonicalWorkload(input.client, input.userId, examProfileId, resourceIds)).then((value) => ({ status: "fulfilled" as const, value }), (reason) => ({ status: "rejected" as const, reason })) : Promise.resolve({ status: "rejected" as const, reason: resourcesSettled.reason }),
    plan ? Promise.resolve(deps.loadPlannerState(input.client, input.userId, examProfileId, String(plan.id))).then((value) => ({ status: "fulfilled" as const, value }), (reason) => ({ status: "rejected" as const, reason })) : Promise.resolve({ status: "fulfilled" as const, value: null }),
  ]);

  // task_progress must be fetched only after task ids are known; replace the empty bounded query above.
  let rawTasks: any[] = [];
  let progressRows: any[] = [];
  if (tasksSettled.status === "fulfilled") {
    rawTasks = tasksSettled.value ?? [];
    const taskIds = rawTasks.map((row: any) => String(row.id));
    progressRows = taskIds.length ? await requireResult(input.client.from("task_progress")
      .select("task_id,user_id,completed_minutes,updated_at")
      .eq("user_id", input.userId)
      .in("task_id", taskIds)) : [];
  }
  const tasks = taskProjection(rawTasks, progressRows);
  const allocations = allocationsSettled.status === "fulfilled" ? allocationsSettled.value ?? [] : [];
  const sessionById = new Map(sessions.map((row: any) => [String(row.id), row]));
  const sessionsToday = sessions.filter((row: any) => currentDateAt(new Date(row.started_at), timezone) === currentDate);
  const allocationsToday = allocations.filter((row: any) => {
    const session: any = sessionById.get(String(row.session_id));
    return session && currentDateAt(new Date(session.started_at), timezone) === currentDate;
  });

  const taskIds = rawTasks.map((row: any) => String(row.id));
  const taskProv = [...taskIds, ...progressRows.map((row: any) => String(row.task_id))];
  const taskReadFailed = tasksSettled.status === "rejected";
  const allocationReadFailed = allocationsSettled.status === "rejected";
  const planFactSources = ["weekly_plans", "planning_task_state_v1"] as const;

  const today = !plan
    ? unknownCoachContextV1Fact<any>("current_weekly_plan_unavailable", planFactSources)
    : taskReadFailed || allocationReadFailed
      ? unknownCoachContextV1Fact<any>(taskReadFailed ? "planning_task_state_read_failed" : "study_intent_ledger_read_failed", taskReadFailed ? ["planning_task_state_v1"] : ["study_intent_ledger"])
      : knownFrom({
          date: currentDate,
          weeklyPlanId: String(plan.id),
          planGenerationVersion: Number(plan.generation_version),
          summary: summarizeTasks(tasks.filter((task) => task.plannedDate === currentDate)),
          study: studyAccounting(sessionsToday, allocationsToday),
          tasks: tasks.filter((task) => task.plannedDate === currentDate),
        }, [
          { source: "weekly_plans", recordIds: [String(plan.id)] },
          { source: "planning_task_state_v1", recordIds: tasks.filter((task) => task.plannedDate === currentDate).map((task) => task.taskId) },
          { source: "study_intent_ledger", recordIds: [...sessionsToday.map((row: any) => String(row.id)), ...allocationsToday.map((row: any) => String(row.id))] },
        ], asOf);

  const progressPosition = blockedCoachContextV1Fact<any>("pln002_completeness_unresolved", ["study_intent_ledger", "planning_task_state_v1"], asOf);
  const week = !plan
    ? unknownCoachContextV1Fact<any>("current_weekly_plan_unavailable", planFactSources)
    : taskReadFailed || allocationReadFailed
      ? unknownCoachContextV1Fact<any>(taskReadFailed ? "planning_task_state_read_failed" : "study_intent_ledger_read_failed", taskReadFailed ? ["planning_task_state_v1"] : ["study_intent_ledger"])
      : knownFrom({
          weeklyPlanId: String(plan.id), generationVersion: Number(plan.generation_version),
          startDate: String(plan.week_start_date), endDate: String(plan.week_end_date), status: plan.status,
          summary: summarizeTasks(tasks), study: studyAccounting(sessions, allocations), tasks,
          studyIntentCoverage: "partial" as const, progressPosition,
        }, [
          { source: "weekly_plans", recordIds: [String(plan.id)] },
          { source: "planning_task_state_v1", recordIds: taskProv },
          { source: "study_intent_ledger", recordIds: [...sessionIds, ...allocations.map((row: any) => String(row.id))] },
        ], asOf);

  const materials = materialsSettled.status === "fulfilled" && workloadSettled.status === "fulfilled"
    ? known(materialProjection(materialsSettled.value ?? [], workloadSettled.value, subjectByResource, asOf), "canonical_material_truth_v1", (materialsSettled.value ?? []).map((row: any) => String(row.id)), asOf)
    : materialsSettled.status === "rejected"
      ? unknownCoachContextV1Fact<readonly CoachContextV1MaterialProgress[]>("canonical_material_read_failed", ["canonical_material_truth_v1"])
      : known(materialProjection(materialsSettled.value ?? [], null, subjectByResource, asOf), "canonical_material_truth_v1", (materialsSettled.value ?? []).map((row: any) => String(row.id)), asOf);
  const parsedWorkloadSummary = workloadSettled.status === "fulfilled" ? workloadSummary(workloadSettled.value.summary) : null;
  const workload = workloadSettled.status === "fulfilled" && parsedWorkloadSummary
    ? known(parsedWorkloadSummary, "canonical_workload_engine_v1", (workloadSettled.value.estimates ?? []).map((row: any) => String(row.materialViewId)), asOf)
    : unknownCoachContextV1Fact<any>(workloadSettled.status === "fulfilled" ? "canonical_workload_payload_invalid" : "canonical_workload_read_failed", ["canonical_workload_engine_v1"]);

  const subjects: CoachContextV1SubjectSummary[] = subjectRows.map((row: any) => {
    const subjectId = String(row.subject_id);
    const subjectTasks = tasks.filter((task) => task.subjectId === subjectId);
    const subjectAllocations = allocations.filter((allocation: any) => String(allocation.subject_id ?? "") === subjectId);
    const subjectSessionIds = new Set<string>(subjectAllocations.map((allocation: any) => String(allocation.session_id)));
    const subjectSessions = sessions.filter((session: any) => subjectSessionIds.has(String(session.id)) || (!subjectSessionIds.size && String(session.subject_id ?? "") === subjectId));
    const subjectMaterials = materials.value?.filter((material) => material.subjectId === subjectId) ?? [];
    return {
      subjectId,
      subjectName: String(row.subjects?.name ?? row.subjects?.[0]?.name ?? subjectId),
      status: row.status,
      tasks: taskReadFailed ? unknownCoachContextV1Fact("planning_task_state_read_failed", ["planning_task_state_v1"]) : known(summarizeTasks(subjectTasks), "planning_task_state_v1", subjectTasks.map((task) => task.taskId), asOf),
      study: allocationReadFailed ? unknownCoachContextV1Fact("study_intent_ledger_read_failed", ["study_intent_ledger"]) : known(studyAccounting(subjectSessions, subjectAllocations), "study_intent_ledger", [...subjectSessionIds], asOf),
      material: materials.availability === "known" ? known({
        totalMaterialViews: subjectMaterials.length,
        completedMaterialViews: subjectMaterials.filter((item) => item.progressState === "completed").length,
        inProgressMaterialViews: subjectMaterials.filter((item) => item.progressState === "in_progress").length,
        unknownWorkloadViews: subjectMaterials.filter((item) => item.workload.availability !== "known" || item.workload.value?.authority === "unknown").length,
      }, "canonical_material_truth_v1", subjectMaterials.map((item) => item.materialViewId), asOf) : unknownCoachContextV1Fact("canonical_material_read_failed", ["canonical_material_truth_v1"]),
    };
  });

  const recentTaskEvents = rawTasks
    .filter((row: any) => {
      const occurredAt = row.completed_at ?? row.updated_at;
      return occurredAt && occurredAt >= startUtc && occurredAt < endExclusive;
    })
    .map((row: any) => ({ taskId: String(row.id), occurredAt: String(row.completed_at ?? row.updated_at), status: row.status, completedMinutes: finiteMinutes(progressRows.find((progress: any) => progress.task_id === row.id)?.completed_minutes) }))
    .sort((left: any, right: any) => right.occurredAt.localeCompare(left.occurredAt) || left.taskId.localeCompare(right.taskId))
    .slice(0, 32);
  const recentSessions = [
    ...allocations.map((allocation: any) => {
      const session: any = sessionById.get(String(allocation.session_id));
      return { sessionId: String(allocation.session_id), allocationId: String(allocation.id), startedAt: String(session.started_at), endedAt: String(session.ended_at), actualMinutes: finiteMinutes(allocation.actual_minutes), accountingIntent: allocation.accounting_intent, plannedCreditMinutes: finiteMinutes(allocation.planned_credit_minutes), taskId: allocation.target_task_id == null ? null : String(allocation.target_task_id), subjectId: allocation.subject_id == null ? null : String(allocation.subject_id), resourceId: allocation.resource_id == null ? null : String(allocation.resource_id), entrySource: session.entry_source };
    }),
    ...sessions.filter((session: any) => !allocations.some((allocation: any) => String(allocation.session_id) === String(session.id))).map((session: any) => ({ sessionId: String(session.id), allocationId: null, startedAt: String(session.started_at), endedAt: String(session.ended_at), actualMinutes: finiteMinutes(session.duration_minutes), accountingIntent: "unknown" as const, plannedCreditMinutes: 0, taskId: session.task_id == null ? null : String(session.task_id), subjectId: session.subject_id == null ? null : String(session.subject_id), resourceId: session.resource_id == null ? null : String(session.resource_id), entrySource: session.entry_source })),
  ].sort((left, right) => right.startedAt.localeCompare(left.startedAt) || left.sessionId.localeCompare(right.sessionId)).slice(0, 24);
  const recentTransitions = substitutionsSettled.status === "fulfilled" && carryoversSettled.status === "fulfilled" ? [
    ...(substitutionsSettled.value ?? []).map((row: any) => ({ kind: "substitution" as const, transitionId: String(row.id), status: row.status, sourceTaskId: String(row.source_task_id), replacementTaskId: row.replacement_task_id == null ? null : String(row.replacement_task_id), replacementSessionId: row.replacement_session_id == null ? null : String(row.replacement_session_id), sourceMinutesRelieved: finiteMinutes(row.source_minutes_replaced), occurredAt: String(row.applied_at ?? row.proposed_at) })),
    ...(carryoversSettled.value ?? []).map((row: any) => ({ kind: "carryover" as const, transitionId: String(row.id), status: row.status, sourceTaskId: String(row.source_task_id), successorTaskId: row.successor_task_id == null ? null : String(row.successor_task_id), fromDate: String(row.from_date), toDate: String(row.to_date), remainingMinutes: finiteMinutes(row.remaining_minutes), occurredAt: String(row.applied_at ?? row.proposed_at) })),
  ].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || left.transitionId.localeCompare(right.transitionId)).slice(0, 16) : [];

  const recentProgress = taskReadFailed || allocationReadFailed || substitutionsSettled.status === "rejected" || carryoversSettled.status === "rejected"
    ? unknownCoachContextV1Fact<any>("recent_progress_partial_read_failed", ["planning_task_state_v1", "study_intent_ledger"])
    : knownFrom({
        windowStart: startUtc, windowEnd: endExclusive,
        taskEvents: recentTaskEvents,
        sessions: recentSessions,
        transitions: recentTransitions,
      }, [
        { source: "planning_task_state_v1", recordIds: recentTaskEvents.map((row) => row.taskId) },
        { source: "study_intent_ledger", recordIds: [...sessionIds, ...allocations.map((row: any) => String(row.id)), ...recentTransitions.map((row) => row.transitionId)] },
      ], asOf);

  let planner: CoachContextV1Fact<CoachContextV1PlannerState>;
  if (!plan || (plannerSettled.status === "fulfilled" && !plannerSettled.value)) {
    planner = notApplicableCoachContextV1Fact("no_current_planner_v2_proposal", ["planner_v2_lifecycle"]);
  } else if (plannerSettled.status === "rejected") {
    planner = unknownCoachContextV1Fact("persisted_planner_v2_read_failed", ["planner_v2_lifecycle"]);
  } else {
    const parsed = parsePlannerState(plannerSettled.value);
    if (!parsed) planner = unknownCoachContextV1Fact("persisted_planner_v2_payload_invalid", ["planner_v2_lifecycle"]);
    else if (["stale", "expired"].includes(parsed.lifecycleState) || new Date(parsed.expiresAt).getTime() <= now.getTime()) {
      planner = staleCoachContextV1Fact(parsed, "persisted_planner_v2_not_current", { provenance: provenance("planner_v2_lifecycle", [parsed.proposalRecordId], asOf), asOf, expiresAt: parsed.expiresAt, confidence: "high" });
    } else planner = known(parsed, "planner_v2_lifecycle", [parsed.proposalRecordId], asOf);
  }

  return buildCoachContextV1({
    generatedAt: asOf, requestId: input.requestId, userId: input.userId, examProfileId,
    locale: input.locale ?? "tr-TR", timezone, currentDate,
    identity: userProfile ? knownCoachContextV1Fact({ displayName: userProfile.display_name == null ? null : String(userProfile.display_name), examEditionId: String(profileRow.exam_edition_id), targetExamDate: profileRow.target_exam_date == null ? null : String(profileRow.target_exam_date), profileStatus: "active" as const }, { provenance: [...provenance("exam_profiles", [examProfileId], asOf), ...provenance("user_profiles", [String(userProfile.id)], asOf)], asOf }) : unknownCoachContextV1Fact("user_profile_unavailable", ["user_profiles", "exam_profiles"]),
    today, week, subjects,
    nextWork: unknownCoachContextV1Fact("canonical_selector_unavailable", ["planning_task_state_v1", "canonical_material_truth_v1", "canonical_workload_engine_v1", "planner_v2_lifecycle"]),
    materials, workload,
    capacity: capacitySettled.status === "fulfilled" ? known(capacityProjection(capacitySettled.value, sessions, timezone, asOf), "capacity_projection_v1", capacitySettled.value.days.map((day) => day.date), asOf) : unknownCoachContextV1Fact("canonical_capacity_read_failed", ["capacity_projection_v1"]),
    recentProgress, planner,
    signalInputs: unknownCoachContextV1Fact("deterministic_signal_registry_unavailable", ["deterministic_signal_input_v1"]),
  });
}
