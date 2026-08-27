import { calendarToday, loadAdaptiveBase } from "./adaptive.ts";
import { loadCanonicalMaterialUnits } from "./canonical-material-loader.ts";
import { loadCanonicalWorkloadReadiness } from "./canonical-material-shadow.ts";
import {
  CANONICAL_PLANNER_V2_VERSION,
  buildCanonicalPlannerV2Proposal,
  compareCanonicalPlannerV2Shadow,
  stableCanonicalPlannerJson,
} from "./planning-v2.bundle.js";

type Client = any;

const ACTIVE_TASK_STATUSES = new Set(["in_progress", "partially_completed"]);

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function datesBetween(start: string, end: string): string[] {
  const days: string[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) days.push(date);
  return days;
}

function firstRelation(value: any): any {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function taskCompletedMinutes(task: any): number {
  const progress = firstRelation(task.task_progress);
  return Math.max(0, Math.floor(Number(progress?.completed_minutes ?? 0)));
}

function remainingTaskMinutes(task: any): number {
  if (task.status === "completed") return 0;
  return Math.max(
    0,
    Math.floor(Number(task.estimated_minutes ?? 0)) - taskCompletedMinutes(task),
  );
}

function stageForWorkMode(workMode: string | null | undefined) {
  if (["video", "book", "notes"].includes(String(workMode))) return "learn";
  if (["questions", "mock"].includes(String(workMode))) return "practice";
  if (workMode === "review") return "review";
  return null;
}

function stageDecision(stage: string | null, topicState: string | null) {
  if (stage === null) {
    return { allowed: true, reason: "no_authoritative_stage_binding" };
  }
  if (stage === "learn") return { allowed: true, reason: "learn_available" };
  if (stage === "practice") {
    const allowed = ["practicing", "learned", "maintenance"].includes(String(topicState));
    return {
      allowed,
      reason: allowed ? "learn_prerequisite_satisfied" : "learn_prerequisite_unsatisfied",
    };
  }
  const allowed = ["learned", "maintenance"].includes(String(topicState));
  return {
    allowed,
    reason: allowed
      ? "learning_path_prerequisites_satisfied"
      : "learning_path_prerequisites_unsatisfied",
  };
}

function workloadIdentity(material: any): string {
  return material.sourceKind === "youtube"
    ? `youtube:${String(material.sourceId)}`
    : String(material.id);
}

function materialBoundary(material: any): any | null {
  if (material.sourceKind === "youtube") {
    if (
      material.segmentStartSeconds !== null ||
      material.segmentEndSeconds !== null ||
      !Number.isInteger(material.durationSeconds) ||
      Number(material.durationSeconds) <= 0
    ) return null;
    return Object.freeze({
      kind: "full_video",
      videoId: String(material.sourceId),
      durationSeconds: Number(material.durationSeconds),
      watchedSeconds: Math.min(
        Number(material.durationSeconds),
        Math.max(0, Math.floor(Number(material.watchedSeconds ?? 0))),
      ),
    });
  }

  if (
    !Number.isInteger(material.pageStart) ||
    !Number.isInteger(material.pageEnd) ||
    Number(material.pageStart) < 0 ||
    Number(material.pageEnd) < Number(material.pageStart)
  ) return null;
  const remainingPageStart = Math.max(
    Number(material.pageStart),
    Number.isInteger(material.completedThroughPage)
      ? Number(material.completedThroughPage) + 1
      : Number(material.pageStart),
  );
  return Object.freeze({
    kind: "physical_pages",
    pageStart: Number(material.pageStart),
    pageEnd: Number(material.pageEnd),
    remainingPageStart,
    remainingPageEnd: Number(material.pageEnd),
  });
}

function exactTaskWorkloadIdentity(taskId: string, links: readonly any[]): string | null {
  const unitIds = [...new Set(
    links
      .filter((link) => String(link.task_id) === taskId)
      .map((link) => link.resource_unit_id)
      .filter(Boolean)
      .map(String),
  )];
  return unitIds.length === 1 ? `physical:${unitIds[0]}` : null;
}

function commitmentClassification(task: any, pinned: boolean, currentDate: string) {
  if (task.status === "completed") return "completed";
  if (ACTIVE_TASK_STATUSES.has(String(task.status))) return "in_progress";
  if (String(task.planned_date ?? "") === currentDate) return "protected_current_day";
  if (pinned) return "locked";
  if (task.source_reason === "manual") return "manual";
  if (["baseline_import", "carryover"].includes(String(task.source_reason))) return "legacy";
  return "future_replaceable_generated";
}

function occupiesCapacity(classification: string): boolean {
  return ["in_progress", "protected_current_day", "locked", "manual"].includes(classification);
}

export interface CanonicalPlannerV2ReadModel {
  readonly userId: string;
  readonly examProfileId: string;
  readonly currentDate: string;
  readonly weeklyPlan: any;
  readonly adaptive: any;
  readonly resourceTargets: readonly any[];
  readonly materialUnits: readonly any[];
  readonly plannerHandoffs: readonly any[];
  readonly topicProgress: readonly any[];
  readonly taskResourceLinks: readonly any[];
  readonly taskPreferences: readonly any[];
}

export function assembleCanonicalPlannerV2ReadOnlyInput(model: CanonicalPlannerV2ReadModel) {
  const horizonStart = String(model.weeklyPlan.week_start_date);
  const horizonEnd = String(model.weeklyPlan.week_end_date);
  const targetByResource = new Map(
    model.resourceTargets.map((row) => [
      String(row.resource_id ?? row.resources?.id),
      row,
    ]),
  );
  const topicState = new Map(
    model.topicProgress.map((row) => [String(row.curriculum_node_id), String(row.state)]),
  );
  const materialById = new Map(model.materialUnits.map((item) => [String(item.id), item]));
  const pinnedTasks = new Set(
    model.taskPreferences.filter((row) => row.pinned === true).map((row) => String(row.task_id)),
  );

  const commitments = model.adaptive.tasks
    .filter((task: any) => task.status !== "cancelled" && task.status !== "missed")
    .map((task: any) => {
      const taskId = String(task.id);
      const classification = commitmentClassification(task, pinnedTasks.has(taskId), model.currentDate);
      const identity = exactTaskWorkloadIdentity(taskId, model.taskResourceLinks);
      return Object.freeze({
        commitmentId: taskId,
        date: task.planned_date ? String(task.planned_date) : null,
        minutes: remainingTaskMinutes(task),
        classification,
        occupiesCapacity: occupiesCapacity(classification),
        canonicalWorkloadIdentity: identity,
        materialViewId: identity,
        source: String(task.source_reason ?? "legacy_task"),
      });
    });

  const completedWorkloadIdentities = new Set<string>();
  for (const material of model.materialUnits) {
    if (material.progressState === "completed") completedWorkloadIdentities.add(workloadIdentity(material));
  }
  for (const commitment of commitments) {
    if (commitment.classification === "completed" && commitment.canonicalWorkloadIdentity) {
      completedWorkloadIdentities.add(commitment.canonicalWorkloadIdentity);
    }
  }

  const demands = model.plannerHandoffs.map((handoff) => {
    const material = materialById.get(String(handoff.materialViewId));
    if (!material) {
      throw new Error(`canonical material missing for handoff: ${handoff.materialViewId}`);
    }
    const target = targetByResource.get(String(handoff.resourceId));
    const stage = stageForWorkMode(target?.work_mode ?? null);
    const stageState = material.curriculumNodeId
      ? topicState.get(String(material.curriculumNodeId)) ?? null
      : null;
    const decision = stageDecision(stage, stageState);
    return Object.freeze({
      demandId: String(material.id),
      canonicalWorkloadIdentity: workloadIdentity(material),
      workload: handoff,
      curriculumNodeId: material.curriculumNodeId ? String(material.curriculumNodeId) : null,
      title: String(material.title),
      boundary: materialBoundary(material),
      learningStage: stage,
      learningStageAllowed: decision.allowed,
      learningStageReason: decision.reason,
      userPriority: 0,
      curriculumOrder:
        Math.max(0, Math.floor(Number(target?.sequence_order ?? 0))) * 1_000_000 +
        Math.max(0, Math.floor(Number(material.sortOrder ?? 0))),
      alreadyStarted: material.progressState === "in_progress",
      earliestDate: horizonStart,
      latestDate: horizonEnd,
      prerequisiteWorkloadIdentities: Object.freeze([]),
      sourceProvenance: Object.freeze([
        "canonical_material_unit_view",
        `mapping:${String(material.mappingProvenance ?? "unknown")}`,
        ...((handoff.evidence?.provenance ?? []).map(String)),
        ...(target ? ["p48_resource_target"] : []),
      ].sort()),
    });
  });

  const dailyCapacities = datesBetween(horizonStart, horizonEnd).map((date) => Object.freeze({
    date,
    configuredCapacityMinutes: Math.max(0, Math.floor(Number(model.adaptive.dayCapacities?.[date] ?? 0))),
    alreadyStudiedMinutes: Math.max(0, Math.floor(Number(model.adaptive.actualMinutesByDate?.[date] ?? 0))),
  }));

  const progressVersion = stableCanonicalPlannerJson({
    material: model.materialUnits.map((item) => ({
      id: item.id,
      progressState: item.progressState,
      completedThroughPage: item.completedThroughPage ?? null,
      watchedSeconds: item.watchedSeconds ?? null,
      completedAt: item.completedAt ?? null,
    })).sort((left, right) => String(left.id).localeCompare(String(right.id))),
    topics: model.topicProgress.map((row) => ({
      curriculumNodeId: row.curriculum_node_id,
      state: row.state,
      masteryLevel: row.mastery_level ?? null,
    })).sort((left, right) => String(left.curriculumNodeId).localeCompare(String(right.curriculumNodeId))),
    tasks: model.adaptive.tasks.map((task: any) => ({
      id: task.id,
      status: task.status,
      plannedDate: task.planned_date ?? null,
      completedMinutes: taskCompletedMinutes(task),
    })).sort((left: any, right: any) => String(left.id).localeCompare(String(right.id))),
  });

  return Object.freeze({
    userId: model.userId,
    examProfileId: model.examProfileId,
    currentDate: model.currentDate,
    horizonStart,
    horizonEnd,
    dailyCapacities: Object.freeze(dailyCapacities),
    commitments: Object.freeze(commitments),
    demands: Object.freeze(demands),
    completedWorkloadIdentities: Object.freeze([...completedWorkloadIdentities].sort()),
    progressVersion,
    policy: Object.freeze({
      plannerVersion: CANONICAL_PLANNER_V2_VERSION,
      protectCurrentDay: true,
      materialSplitting: "whole_canonical_workload_only",
      orderingPolicy: "user_priority_continuation_stage_curriculum_stable_id",
    }),
  });
}

function legacyItems(model: CanonicalPlannerV2ReadModel) {
  return model.adaptive.tasks
    .filter((task: any) =>
      task.planned_date &&
      String(task.planned_date) >= String(model.weeklyPlan.week_start_date) &&
      String(task.planned_date) <= String(model.weeklyPlan.week_end_date) &&
      !["cancelled", "missed"].includes(String(task.status)))
    .map((task: any) => Object.freeze({
      taskId: String(task.id),
      plannedDate: String(task.planned_date),
      estimatedMinutes: remainingTaskMinutes(task),
      canonicalWorkloadIdentity: exactTaskWorkloadIdentity(String(task.id), model.taskResourceLinks),
      completed: task.status === "completed",
    }));
}

function assertResult(result: any, label: string): any[] {
  if (result.error) throw new Error(`${label}: ${result.error.message ?? result.error}`);
  return result.data ?? [];
}

export async function runCanonicalPlannerV2ReadOnlyShadow(input: {
  readonly client: Client;
  readonly userId: string;
  readonly examProfileId: string;
  readonly currentDate?: string;
  readonly includeLifecycleContracts?: boolean;
}) {
  const currentDate = input.currentDate ?? calendarToday();
  const profileResult = await input.client
    .from("exam_profiles")
    .select("id,user_id,status")
    .eq("id", input.examProfileId)
    .eq("user_id", input.userId)
    .eq("status", "active")
    .single();
  if (profileResult.error || !profileResult.data) {
    throw new Error(`active exam profile: ${profileResult.error?.message ?? "not found"}`);
  }

  const planResult = await input.client
    .from("weekly_plans")
    .select("*")
    .eq("user_id", input.userId)
    .eq("exam_profile_id", input.examProfileId)
    .eq("status", "active")
    .lte("week_start_date", currentDate)
    .gte("week_end_date", currentDate)
    .order("generation_version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (planResult.error || !planResult.data) {
    throw new Error(`active weekly plan: ${planResult.error?.message ?? "not found"}`);
  }
  const profile = profileResult.data;
  const weeklyPlan = planResult.data;

  const [adaptive, targetsResult, topicResult, resourcesResult] = await Promise.all([
    loadAdaptiveBase(input.client, input.userId, profile, weeklyPlan),
    input.client.from("p48_resource_targets")
      .select("resource_id,planned_minutes,sequence_order,work_mode,resources(id,status)")
      .eq("user_id", input.userId)
      .eq("exam_profile_id", input.examProfileId),
    input.client.from("topic_progress")
      .select("curriculum_node_id,state,mastery_level")
      .eq("user_id", input.userId)
      .eq("exam_profile_id", input.examProfileId),
    input.client.from("resources")
      .select("id")
      .eq("user_id", input.userId)
      .eq("exam_profile_id", input.examProfileId)
      .eq("status", "active")
      .order("id"),
  ]);
  const resourceTargets = assertResult(targetsResult, "P48 resource targets")
    .filter((row) => firstRelation(row.resources)?.status === "active");
  const topicProgress = assertResult(topicResult, "topic progress");
  const resourceIds = [...new Set(
    assertResult(resourcesResult, "active resources").map((row) => String(row.id)).filter(Boolean),
  )];

  const taskIds = adaptive.tasks.map((task: any) => String(task.id));
  const [materialUnits, readiness, linksResult, preferencesResult] = await Promise.all([
    loadCanonicalMaterialUnits(input.client, input.userId, input.examProfileId, resourceIds),
    loadCanonicalWorkloadReadiness(
      input.client,
      input.userId,
      input.examProfileId,
      resourceIds,
      { physicalPaceEvidenceAvailable: true },
    ),
    taskIds.length
      ? input.client.from("task_resource_units")
          .select("task_id,resource_unit_id,status")
          .eq("user_id", input.userId)
          .in("task_id", taskIds)
      : Promise.resolve({ data: [], error: null }),
    taskIds.length
      ? input.client.from("task_daily_preferences")
          .select("task_id,planned_date,manual_order,pinned")
          .eq("user_id", input.userId)
          .in("task_id", taskIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const model: CanonicalPlannerV2ReadModel = {
    userId: input.userId,
    examProfileId: input.examProfileId,
    currentDate,
    weeklyPlan,
    adaptive,
    resourceTargets,
    materialUnits,
    plannerHandoffs: readiness.plannerHandoff,
    topicProgress,
    taskResourceLinks: assertResult(linksResult, "task resource links"),
    taskPreferences: assertResult(preferencesResult, "task preferences"),
  };
  const plannerInput = assembleCanonicalPlannerV2ReadOnlyInput(model);
  const proposal = await buildCanonicalPlannerV2Proposal(plannerInput);
  const comparison = compareCanonicalPlannerV2Shadow(plannerInput, proposal, legacyItems(model));
  const existingTaskScopes = Object.freeze(model.adaptive.tasks.map((task: any) => {
    const taskId = String(task.id);
    return Object.freeze({
      taskId,
      plannedDate: task.planned_date ? String(task.planned_date) : null,
      classification: commitmentClassification(task, pinnedTasksForModel(model).has(taskId), model.currentDate),
      canonicalWorkloadIdentity: exactTaskWorkloadIdentity(taskId, model.taskResourceLinks),
      source: String(task.source_reason ?? "legacy_task"),
    });
  }));

  return Object.freeze({
    mode: "PRODUCTION_READ_ONLY_CANONICAL_PLANNER_V2_SHADOW",
    mutationAuthority: false,
    diagnosticPersistence: false,
    currentDate,
    userId: input.userId,
    examProfileId: input.examProfileId,
    weeklyPlanId: String(weeklyPlan.id),
    workload: readiness.summary,
    acceptedPaceSamples: readiness.acceptedPaceSamples,
    evidenceClassificationCounts: readiness.evidenceClassificationCounts,
    calibration: readiness.calibration,
    proposal,
    comparison,
    ...(input.includeLifecycleContracts ? {
      plannerInput,
      existingTaskScopes,
      planGenerationVersion: Number(weeklyPlan.generation_version),
    } : {}),
  });
}

function pinnedTasksForModel(model: CanonicalPlannerV2ReadModel): Set<string> {
  return new Set(
    model.taskPreferences.filter((row) => row.pinned === true).map((row) => String(row.task_id)),
  );
}
