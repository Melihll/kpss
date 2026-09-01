import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  buildP48Months,
  buildP48WeekBlocks,
  buildWeeklyPlanV0,
  calculateEffectiveDayCapacity,
  calculateWeeklyAvailableMinutes,
  findDailyCapacityOverloads,
  forecastP48Resources,
  getZonedWeekRange,
  PlanningDomainError,
} from "../_shared/planning.bundle.js";
import { recalculateTopicMastery, revisionWithUrgency } from "../_shared/mastery.ts";
import { minimumDayPlan, previewCurrentPlan, recalculateCurrentPlan, syllabusProjection } from "../_shared/adaptive.ts";
import { generateWeeklyReport, loadDailyCoachContext, pilotMetrics, recordRecommendationEvent } from "../_shared/pilot.ts";
import { aggregateCompletedStudySessions, aggregatePlannedCreditByDate } from "../_shared/completed-study.ts";
import { grossCapacityForDate, loadP48DailyCapacityOverrides, planningCapacityForDate } from "../_shared/capacity-overrides.ts";
import { applyDailyTaskOrder } from "../_shared/daily-task-order.ts";
import { buildQuickAddTaskPreview } from "../_shared/quick-add-task-preview.ts";
import { buildTaskActionPreview, type TaskActionPreviewAction } from "../_shared/task-action-preview.ts";
import { normalizeResourceProgress, presentResourceProgress } from "../_shared/resource-progress.ts";
import { buildWeeklyCapacitySummary } from "../_shared/capacity-summary.ts";
import { classifyP48CapacitySource } from "../_shared/p48-capacity-source.ts";
import { loadMaterialWorkloads } from "../_shared/material-workload.ts";
import { normalizeTopicResourceLinkInput } from "../_shared/topic-resource-link.ts";
import { fetchYouTubePlaylistCatalog } from "../_shared/youtube-playlist.ts";
import { normalizeYouTubeVideoProgressInput, presentYouTubeVideoProgress } from "../_shared/youtube-video-progress.ts";
import {
  isPhysicalPaceCaptureEnabled,
  PhysicalStudyLifecycleService,
} from "../_shared/physical-study-lifecycle.ts";
import { runCanonicalPlannerV2ReadOnlyShadow } from "../_shared/canonical-planner-v2-readonly.ts";
import { plannerV2ProposalCapabilities } from "../_shared/planner-v2-proposal-capability.ts";
import {
  assertAuthoritativePlannerV2Apply,
  assertAuthoritativePlannerV2Confirmation,
  assertExactPlannerV2ProposalPersistence,
  parseExactPlannerV2ProposalIdentity,
  plannerV2LifecycleErrorCode,
  type PlannerV2ProposalIdentity,
} from "../_shared/planner-v2-proposal-http.ts";
import {
  buildPlannerV2ApplyPlanCandidate,
  buildPlannerV2Preview,
  fingerprintPlannerV2SnapshotComponents,
  validatePlannerV2Freshness,
} from "../_shared/planning-v2.bundle.js";

type WeeklyPlanningContext = {
  examProfileId: string;
  weekStartDate: string;
  subjects: Array<{ id: string; name: string; status: "active" | "paused" | "completed"; sortOrder: number }>;
  curriculum: Array<{ id: string; subjectId: string; parentId: string | null; nodeType: "topic" | "subtopic"; name: string; sortOrder: number; isActive: boolean }>;
  topicProgress: Array<{ curriculumNodeId: string; state: "not_started" | "learning" | "practicing" | "remediation" | "learned" | "maintenance" }>;
  weeklyAvailability: Array<{ weekday: number; start_time: string; end_time: string; is_active?: boolean }>;
  resources: Array<{ id: string; subjectId: string; name: string; role: "primary" | "reinforcement" | "revision" | "advanced" | "mock"; difficulty: "unknown" | "easy" | "normal" | "hard"; status: "active" | "paused" | "completed" | "abandoned" }>;
  resourceSections: Array<{ id: string; resourceId: string; curriculumNodeId: string | null; name: string; sortOrder: number; planningRole: "curriculum" | "mixed_review" | "review_only" | "reference_only"; isActive: boolean }>;
  resourceUnits: Array<{ id: string; resourceId: string; sectionId: string | null; name: string; unitType: "test" | "video" | "chapter" | "reading" | "mock" | "other"; sortOrder: number; estimatedMinutes: number | null; isActive: boolean }>;
  resourceUnitProgress: Array<{ resourceUnitId: string; status: "not_started" | "in_progress" | "completed" | "skipped" }>;
  existingCarryoverTasks: Array<{
    id: string; subjectId: string; curriculumNodeId: string | null; resourceId: string | null;
    taskType: "learn_topic" | "solve_resource_units" | "review_topic" | "custom";
    title: string; description: string | null; estimatedMinutes: number;
    importance: "core" | "important" | "optional"; priorityScore: number; resourceUnitIds: string[];
  }>;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const domainErrorStatuses: Readonly<Record<string, number>> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  PLANNER_V2_PREVIEW_DISABLED: 403,
  PLANNER_V2_CONFIRM_DISABLED: 403,
  PLANNER_V2_APPLY_DISABLED: 403,
  PLANNER_V2_CLIENT_AUTHORITY_REFUSED: 400,
  PLANNER_V2_CONFIRMATION_IDENTITY_MISMATCH: 409,
  PLANNER_V2_CONFIRMATION_NOT_PERSISTED: 409,
  PLANNER_V2_EXPLICIT_CONFIRMATION_REQUIRED: 409,
  PLANNER_V2_APPLY_IDENTITY_MISMATCH: 409,
  PLANNER_V2_APPLY_RESULT_INVALID: 502,
  PLANNER_V2_PROPOSAL_NOT_FOUND: 404,
  NO_ACTIVE_EXAM_PROFILE: 400,
  NO_WEEKLY_AVAILABILITY: 400,
  INVALID_TEST_RESULT: 400,
  INVALID_TEST_RESULT_TOTAL: 400,
  INVALID_TEST_RESULT_COUNTS: 400,
  INVALID_SESSION_DURATION: 400,
  STUDY_INTENT_REQUIRED: 400,
  STUDY_INTENT_TARGET_REQUIRED: 400,
  STUDY_INTENT_IDEMPOTENCY_REQUIRED: 400,
  STUDY_INTENT_IDEMPOTENCY_CONFLICT: 409,
  SUBSTITUTION_SOURCE_INVALID: 400,
  SUBSTITUTION_REPLACEMENT_INVALID: 400,
  CARRYOVER_SOURCE_STALE: 409,
  SESSION_TIME_OVERLAP: 409,
  RESOURCE_UNIT_NOT_LINKED_TO_TASK: 400,
  RESOURCE_UNIT_NOT_TEST: 400,
  TASK_NOT_FOUND: 404,
  TASK_NOT_STARTABLE: 409,
  RESOURCE_UNIT_NOT_FOUND: 404,
  TEST_RESULT_NOT_FOUND: 404,
  SESSION_NOT_FOUND: 404,
  NO_RECOMMENDABLE_TASK: 404,
  ACTIVE_SESSION_EXISTS: 409,
  NO_ACTIVE_SESSION: 409,
  SESSION_NOT_ACTIVE: 409,
  SESSION_ALREADY_FINISHED: 409,
  SESSION_ALREADY_CANCELLED: 409,
  ACTIVE_PLAN_ALREADY_EXISTS: 409,
  TASK_HAS_PENDING_UNITS: 409,
  INVALID_TASK_PROGRESS: 400,
  TOPIC_PROGRESS_NOT_FOUND: 404,
  REVISION_NOT_FOUND: 404,
  REVISION_NOT_ACTIVE: 409,
  WEEKLY_PLAN_NOT_FOUND: 404,
  TASK_NOT_REPLANNABLE: 409,
  DATA_GAP_NOT_FOUND: 404,
  INVALID_DATA_GAP_RESULT: 400,
  INVALID_WEEK_START: 400,
  INVALID_MANUAL_PLAN_DATE: 400,
  INVALID_MANUAL_PLAN_MINUTES: 400,
  INVALID_MANUAL_PLAN_TITLE: 400,
  INVALID_MANUAL_PLAN_SUBJECT: 400,
  INVALID_MANUAL_PLAN_RESOURCE: 400,
  INVALID_WORK_MODE: 400,
  MANUAL_PLAN_OVER_CAPACITY: 409,
  QUICK_ADD_INVALID_TITLE: 400,
  QUICK_ADD_INVALID_MINUTES: 400,
  QUICK_ADD_INVALID_DATE: 400,
  QUICK_ADD_INVALID_SUBJECT: 400,
  TASK_ACTION_INVALID_ACTION: 400,
  RESOURCE_PROGRESS_INVALID_TOTAL_PAGES: 400,
  RESOURCE_PROGRESS_INVALID_CURRENT_PAGE: 400,
  TOPIC_RESOURCE_LINK_INVALID_RESOURCE: 400,
  TOPIC_RESOURCE_LINK_INVALID_PLAYLIST: 400,
  TOPIC_RESOURCE_LINK_RESOURCE_NOT_FOUND: 404,
  TOPIC_RESOURCE_LINK_TOPIC_NOT_FOUND: 404,
  TOPIC_RESOURCE_LINK_SUBJECT_MISMATCH: 400,
  YOUTUBE_PLAYLIST_NOT_FOUND: 404,
  YOUTUBE_PLAYLIST_NOT_LINKED: 409,
  YOUTUBE_API_KEY_MISSING: 503,
  YOUTUBE_API_REQUEST_FAILED: 502,
  YOUTUBE_API_INVALID_RESPONSE: 502,
  YOUTUBE_VIDEO_NOT_FOUND: 404,
  YOUTUBE_VIDEO_DURATION_UNAVAILABLE: 409,
  ACTION_PROPOSAL_NOT_FOUND: 404,
  ACTION_PROPOSAL_NOT_PENDING: 409,
  ACTION_PROPOSAL_EXPIRED: 409,
  ACTION_PROPOSAL_STALE: 409,
  QUICK_ADD_DUPLICATE_CONFLICT: 409,
  ACTION_PROPOSAL_NOT_APPLYABLE: 409,
  YOUTUBE_VIDEO_PROGRESS_INVALID_POSITION: 400,
  YOUTUBE_VIDEO_PROGRESS_INVALID_WATCHED_SECONDS: 400,
  P48_STRATEGY_NOT_CONFIGURED: 409,
  P48_CAPACITY_SOURCE_MISSING: 409,
  PHYSICAL_RESOURCE_UNIT_SELECTION_INVALID: 409,
  PHYSICAL_SESSION_OWNERSHIP_CONFLICT: 409,
  PHYSICAL_SESSION_CANCEL_UNAVAILABLE: 409,
  PHYSICAL_PAGE_BOUNDARY_REQUIRED: 400,
  PHYSICAL_PAGE_BOUNDARY_INVALID: 400,
  PHYSICAL_PROGRESS_REVERSAL: 409,
  PHYSICAL_PROGRESS_CHANGED_DURING_SESSION: 409,
  PHYSICAL_PROGRESS_BOUNDARY_UNAVAILABLE: 409,
  PHYSICAL_BREAK_STATE_MISMATCH: 409,
  PHYSICAL_SESSION_IDENTITY_CHANGED: 409,
  PHYSICAL_PACE_SESSION_REQUIRED: 409,
  PHYSICAL_RESOURCE_UNIT_RANGE_INVALID: 409,
  PHYSICAL_RESOURCE_UNIT_ALREADY_COMPLETED: 409,
  PHYSICAL_RESOURCE_UNIT_SKIPPED: 409,
  RESOURCE_UNIT_NOT_PENDING_FOR_TASK: 409,
  RESOURCE_UNIT_OWNER_MISMATCH: 403,
  PHYSICAL_ACTIVE_TIME_REQUIRED: 400,
};

function caughtMessage(caught: unknown) {
  if (caught instanceof Error) return caught.message;
  if (caught && typeof caught === "object" && "message" in caught) return String(caught.message);
  return String(caught);
}

function domainError(message: string) {
  const code = Object.keys(domainErrorStatuses)
    .sort((left, right) => right.length - left.length)
    .find((candidate) => message.includes(candidate));
  return code ? { code, status: domainErrorStatuses[code] } : { code: "INTERNAL_ERROR", status: 500 };
}

function istanbulDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
}

function mondayOf(dateString: string) {
  const date = new Date(`${dateString}T12:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function addDays(dateString: string, days: number) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const WORK_MODE_LABELS: Readonly<Record<string, string>> = {
  video: "Video", book: "Kaynak kitap", notes: "Not", questions: "Soru çözümü",
  mock: "Deneme", review: "Tekrar", other: "Diğer",
};

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function activeProfile(client: SupabaseClient, userId: string) {
  const { data, error } = await client
    .from("exam_profiles")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new PlanningDomainError("NO_ACTIVE_EXAM_PROFILE");
  return data;
}

async function loadPlannerV2Proposal(
  client: SupabaseClient,
  exact: PlannerV2ProposalIdentity,
  userId: string,
  examProfileId: string,
) {
  const { data, error } = await client
    .from("confirmed_action_proposals")
    .select("id,user_id,exam_profile_id,action_kind,status,confirmed_at,expires_at,planner_proposal_id,proposal_fingerprint,planner_snapshot_fingerprint,planner_version,component_fingerprints,weekly_plan_id,plan_generation_version")
    .eq("id", exact.recordId)
    .eq("user_id", userId)
    .eq("exam_profile_id", examProfileId)
    .eq("action_kind", "planner_v2_week")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("PLANNER_V2_PROPOSAL_NOT_FOUND");
  return data;
}

async function currentPlan(client: SupabaseClient, profileId: string, weekStart: string) {
  const { data, error } = await client
    .from("weekly_plans")
    .select("*")
    .eq("exam_profile_id", profileId)
    .eq("week_start_date", weekStart)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function buildContext(
  client: SupabaseClient,
  profileId: string,
  userId: string,
  weekStartDate: string,
): Promise<WeeklyPlanningContext> {
  const [selectionResult, progressResult, curriculumResult, availabilityResult, resourcesResult] = await Promise.all([
    client.from("user_subjects").select("subject_id, status, subjects(id, name, sort_order)").eq("exam_profile_id", profileId),
    client.from("topic_progress").select("curriculum_node_id, state").eq("exam_profile_id", profileId),
    client.from("curriculum_nodes").select("*").eq("is_active", true),
    client.from("weekly_availability").select("weekday, start_time, end_time, is_active").eq("exam_profile_id", profileId),
    client.from("resources").select("*").eq("exam_profile_id", profileId).eq("status", "active"),
  ]);
  for (const result of [selectionResult, progressResult, curriculumResult, availabilityResult, resourcesResult]) {
    if (result.error) throw result.error;
  }
  const resources = resourcesResult.data ?? [];
  const resourceIds = resources.map((resource) => resource.id);
  const [sectionsResult, unitsResult, unitProgressResult, carryoverResult] = await Promise.all([
    resourceIds.length
      ? client.from("resource_sections").select("*").in("resource_id", resourceIds)
      : Promise.resolve({ data: [], error: null }),
    resourceIds.length
      ? client.from("resource_units").select("*").in("resource_id", resourceIds)
      : Promise.resolve({ data: [], error: null }),
    client.from("resource_unit_progress").select("resource_unit_id, status").eq("user_id", userId),
    client.from("tasks").select("*").eq("exam_profile_id", profileId).lt("planned_date", weekStartDate)
      .in("status", ["planned", "ready", "in_progress", "partially_completed", "rescheduled"])
      .order("priority_score", { ascending: false }),
  ]);
  for (const result of [sectionsResult, unitsResult, unitProgressResult, carryoverResult]) {
    if (result.error) throw result.error;
  }
  const carryovers = carryoverResult.data ?? [];
  const carryoverIds = carryovers.map((task) => task.id);
  const carryUnitsResult = carryoverIds.length
    ? await client.from("task_resource_units").select("task_id, resource_unit_id").in("task_id", carryoverIds).neq("status", "completed")
    : { data: [], error: null };
  if (carryUnitsResult.error) throw carryUnitsResult.error;

  return {
    examProfileId: profileId,
    weekStartDate,
    subjects: (selectionResult.data ?? []).map((selection: any) => ({
      id: selection.subject_id,
      name: selection.subjects?.name ?? "Ders",
      status: selection.status,
      sortOrder: selection.subjects?.sort_order ?? 0,
    })),
    curriculum: (curriculumResult.data ?? []).map((node) => ({
      id: node.id, subjectId: node.subject_id, parentId: node.parent_id,
      nodeType: node.node_type, name: node.name, sortOrder: node.sort_order, isActive: node.is_active,
    })),
    topicProgress: (progressResult.data ?? []).map((progress) => ({
      curriculumNodeId: progress.curriculum_node_id, state: progress.state,
    })),
    weeklyAvailability: (availabilityResult.data ?? []).map((window) => ({
      weekday: window.weekday, start_time: window.start_time, end_time: window.end_time, is_active: window.is_active,
    })),
    resources: resources.map((resource) => ({
      id: resource.id, subjectId: resource.subject_id, name: resource.name,
      role: resource.resource_role, difficulty: resource.difficulty, status: resource.status,
    })),
    resourceSections: (sectionsResult.data ?? []).map((section) => ({
      id: section.id, resourceId: section.resource_id, curriculumNodeId: section.curriculum_node_id,
      name: section.name, sortOrder: section.sort_order,
      planningRole: section.planning_role ?? "curriculum", isActive: section.is_active ?? true,
    })),
    resourceUnits: (unitsResult.data ?? []).map((unit) => ({
      id: unit.id, resourceId: unit.resource_id, sectionId: unit.resource_section_id,
      name: unit.name, unitType: unit.unit_type, sortOrder: unit.sort_order,
      estimatedMinutes: unit.estimated_minutes, isActive: unit.is_active ?? true,
    })),
    resourceUnitProgress: (unitProgressResult.data ?? []).map((progress) => ({
      resourceUnitId: progress.resource_unit_id, status: progress.status,
    })),
    existingCarryoverTasks: carryovers.map((task) => ({
      id: task.id, subjectId: task.subject_id, curriculumNodeId: task.curriculum_node_id,
      resourceId: task.resource_id, taskType: task.task_type, title: task.title,
      description: task.description, estimatedMinutes: task.estimated_minutes,
      importance: task.importance, priorityScore: task.priority_score,
      resourceUnitIds: (carryUnitsResult.data ?? []).filter((unit) => unit.task_id === task.id).map((unit) => unit.resource_unit_id),
    })),
  } as WeeklyPlanningContext;
}

async function planWithTasks(client: SupabaseClient, plan: any) {
  if (!plan) return { plan: null, tasks: [] };
  const { data: tasks, error } = await client
    .from("tasks")
    .select("*, subjects(name), resources(id,name,resource_type), resource_sections(resource_id,resources(id,name,resource_type)), task_progress(completed_minutes, actual_study_minutes), task_resource_units(id, resource_unit_id, status, completed_at, resource_units(resource_id,name,unit_type,estimated_minutes,resources(id,name,resource_type)))")
    .eq("weekly_plan_id", plan.id)
    .order("planned_date")
    .order("priority_score", { ascending: false });
  if (error) throw error;

  const firstRelation = (value: any) => Array.isArray(value) ? value[0] ?? null : value ?? null;
  const plannerOrderedTasks = (tasks ?? []).map((task: any) => {
    const directResource = firstRelation(task.resources);
    const section = firstRelation(task.resource_sections);
    const sectionResource = firstRelation(section?.resources);
    let unitResource: any = null;
    let unitResourceId: string | null = null;

    for (const link of task.task_resource_units ?? []) {
      const unit = firstRelation(link?.resource_units);
      if (!unit) continue;
      if (!unitResourceId && typeof unit.resource_id === "string") unitResourceId = unit.resource_id;
      if (!unitResource) unitResource = firstRelation(unit.resources);
      if (unitResourceId && unitResource) break;
    }

    const materialResourceId =
      (typeof task.resource_id === "string" && task.resource_id) ||
      (typeof directResource?.id === "string" && directResource.id) ||
      (typeof section?.resource_id === "string" && section.resource_id) ||
      (typeof sectionResource?.id === "string" && sectionResource.id) ||
      unitResourceId ||
      (typeof unitResource?.id === "string" && unitResource.id) ||
      null;

    const materialResource = directResource ?? sectionResource ?? unitResource ?? null;

    return {
      ...task,
      material_resource_id: materialResourceId,
      resources: materialResource ?? task.resources,
    };
  });
  if (plannerOrderedTasks.length === 0) return { plan, tasks: [] };

  const taskIds = plannerOrderedTasks.map((task: any) => task.id);
  const { data: preferences, error: preferenceError } = await client
    .from("task_daily_preferences")
    .select("task_id, planned_date, manual_order")
    .in("task_id", taskIds);
  if (preferenceError) throw preferenceError;

  return {
    plan,
    tasks: applyDailyTaskOrder(plannerOrderedTasks, preferences ?? []),
  };
}

const P48_SUBJECT_TARGETS = [
  { subjectId: "20000000-0000-0000-0000-000000000006", subjectName: "Hukuk", weeklyMinutes: 450, scoreWeight: 20 },
  { subjectId: "20000000-0000-0000-0000-000000000007", subjectName: "İktisat", weeklyMinutes: 360, scoreWeight: 20 },
  { subjectId: "20000000-0000-0000-0000-000000000008", subjectName: "Maliye", weeklyMinutes: 210, scoreWeight: 20 },
  { subjectId: "20000000-0000-0000-0000-000000000009", subjectName: "Muhasebe", weeklyMinutes: 210, scoreWeight: 20 },
  { subjectId: "20000000-0000-0000-0000-000000000002", subjectName: "Matematik", weeklyMinutes: 180, scoreWeight: 5 },
  { subjectId: "20000000-0000-0000-0000-000000000001", subjectName: "Türkçe", weeklyMinutes: 120, scoreWeight: 5 },
  { subjectId: "20000000-0000-0000-0000-000000000003", subjectName: "Tarih", weeklyMinutes: 150, scoreWeight: 4.5 },
  { subjectId: "20000000-0000-0000-0000-000000000004", subjectName: "Coğrafya", weeklyMinutes: 120, scoreWeight: 3 },
] as const;

function p48Windows(rows: any[]) {
  return rows.map((row) => ({ weekday: row.weekday, start_time: row.start_time, end_time: row.end_time, is_active: row.is_active }));
}

function p48Periods(rows: any[]) {
  return rows.map((row) => ({
    name: row.name,
    periodType: row.period_type,
    startDate: row.start_date,
    endDate: row.end_date,
    capacityMultiplier: row.capacity_multiplier == null ? null : Number(row.capacity_multiplier),
  }));
}

function p48Exceptions(rows: any[]) {
  return rows.map((row) => ({
    date: row.exception_date,
    type: row.exception_type,
    startTime: row.start_time,
    endTime: row.end_time,
    minutesDelta: row.minutes_delta,
  }));
}

async function loadP48Roadmap(client: SupabaseClient, userId: string, profile: any) {
  const strategyResult = await client.from("p48_strategy_profiles")
    .select("*")
    .eq("user_id", userId)
    .eq("exam_profile_id", profile.id)
    .eq("status", "active")
    .maybeSingle();
  if (strategyResult.error) throw strategyResult.error;
  if (!strategyResult.data) return { configured: false };

  const roadmapToday = istanbulDate();
  const roadmapWeekStart = mondayOf(roadmapToday);

  const [targetResult, sessionsResult, periodsResult, availabilityResult, exceptionsResult, dailyOverrides] = await Promise.all([
    client.from("p48_resource_targets")
      .select("planned_minutes,sequence_order,work_mode,resources(id,subject_id,name,status,resource_type,publisher)")
      .eq("user_id", userId)
      .eq("exam_profile_id", profile.id)
      .order("sequence_order"),
    client.from("study_sessions")
      .select("resource_id,duration_minutes")
      .eq("user_id", userId)
      .eq("exam_profile_id", profile.id)
      .eq("status", "completed")
      .not("resource_id", "is", null),
    client.from("calendar_periods")
      .select("period_type,name,start_date,end_date,capacity_multiplier")
      .eq("user_id", userId)
      .eq("exam_profile_id", profile.id)
      .order("start_date"),
    client.from("weekly_availability")
      .select("weekday,start_time,end_time,is_active")
      .eq("user_id", userId)
      .eq("exam_profile_id", profile.id)
      .eq("is_active", true),
    client.from("schedule_exceptions")
      .select("exception_date,exception_type,start_time,end_time,minutes_delta")
      .eq("user_id", userId)
      .eq("exam_profile_id", profile.id)
      .gte("exception_date", roadmapWeekStart)
      .lte("exception_date", addDays(roadmapWeekStart, 6)),
    loadP48DailyCapacityOverrides(
      client,
      userId,
      profile.id,
      roadmapWeekStart,
      addDays(roadmapWeekStart, 6),
    ),
  ]);
  for (const result of [targetResult, sessionsResult, periodsResult, availabilityResult, exceptionsResult]) if (result.error) throw result.error;

  const actualByResource = new Map<string, number>();
  for (const row of sessionsResult.data ?? []) {
    if (!row.resource_id) continue;
    actualByResource.set(row.resource_id, (actualByResource.get(row.resource_id) ?? 0) + Number(row.duration_minutes ?? 0));
  }

  const resources = (targetResult.data ?? []).map((row: any) => ({
    resourceId: row.resources.id,
    subjectId: row.resources.subject_id,
    subjectName: P48_SUBJECT_TARGETS.find((subject) => subject.subjectId === row.resources.subject_id)?.subjectName ?? "Ders",
    resourceName: row.resources.name,
    plannedMinutes: Number(row.planned_minutes),
    actualMinutes: actualByResource.get(row.resources.id) ?? 0,
    sequenceOrder: Number(row.sequence_order),
    workMode: row.work_mode,
    resourceStatus: row.resources.status,
    publisher: row.resources.publisher,
    resourceType: row.resources.resource_type,
  }));

  const materialWorkloads = await loadMaterialWorkloads(
    client,
    userId,
    profile.id,
    resources.map((resource) => ({
      resourceId: resource.resourceId,
      plannedMinutes: resource.plannedMinutes,
    })),
  );
  const periods = p48Periods(periodsResult.data ?? []);
  const today = roadmapToday;

  const normalWeeklyMinutes = calculateWeeklyAvailableMinutes(
    p48Windows(availabilityResult.data ?? []),
  );

  const grossDayCapacities: Record<string, number> = {};
  for (let index = 0; index < 7; index += 1) {
    const date = addDays(roadmapWeekStart, index);
    const capacityContext = {
      date,
      weeklyAvailability: p48Windows(availabilityResult.data ?? []),
      calendarPeriods: periods.map((period) => ({
        startDate: period.startDate,
        endDate: period.endDate,
        capacityMultiplier: period.capacityMultiplier,
      })),
    };

    const baseCapacity = calculateEffectiveDayCapacity({
      ...capacityContext,
      scheduleExceptions: [],
    });

    const effectiveCapacity = calculateEffectiveDayCapacity({
      ...capacityContext,
      scheduleExceptions: p48Exceptions(exceptionsResult.data ?? []),
    });

    grossDayCapacities[date] = grossCapacityForDate(
      date,
      effectiveCapacity,
      dailyOverrides,
      baseCapacity,
    );
  }
  const targetExamDate = strategyResult.data.target_exam_date;
  const subjectForecasts = forecastP48Resources({
    asOfDate: today,
    targetExamDate,
    subjects: P48_SUBJECT_TARGETS.map((subject) => ({ ...subject })),
    resources: resources.map((resource) => ({
      ...resource,
      materialRemainingMinutes:
        materialWorkloads[resource.resourceId]?.totalRemainingMinutes ?? null,
    })),
    periods,
  });
  const baseMonths = buildP48Months({
    asOfDate: today,
    targetExamDate,
    monthlyTargetMinutes: Number(strategyResult.data.monthly_target_minutes),
    periods,
  });
  const months = baseMonths.map((month) => {
    const [year, monthNumber] = month.month.split("-").map(Number);
    const monthStart = `${month.month}-01`;
    const monthEnd = new Date(Date.UTC(year, monthNumber, 0, 12)).toISOString().slice(0, 10);
    const focusResources = subjectForecasts.flatMap((subject) => subject.resources
      .filter((resource: any) => resource.forecastStartDate && resource.forecastFinishDate
        && resource.forecastStartDate <= monthEnd && resource.forecastFinishDate >= monthStart)
      .map((resource: any) => `${subject.subjectName}: ${resource.resourceName}`));
    for (const subject of subjectForecasts) {
      if (subject.newSourceDate && subject.newSourceDate >= monthStart && subject.newSourceDate <= monthEnd) {
        focusResources.push(`${subject.subjectName}: Yeni kaynak zamanı`);
      }
    }
    return { ...month, focusResources: [...new Set(focusResources)].slice(0, 5) };
  });
  const currentWeek = await planWithTasks(
    client,
    await currentPlan(client, profile.id, mondayOf(today)),
  );

  const capacity = buildWeeklyCapacitySummary({
    normalWeeklyMinutes,
    planningTargetMinutes: Number(strategyResult.data.weekly_target_minutes),
    effectiveDayCapacities: grossDayCapacities,
    planningBudgetMinutes:
      currentWeek.plan?.planning_budget_minutes == null
        ? null
        : Number(currentWeek.plan.planning_budget_minutes),
  });
  const totalPlannedResourceMinutes = resources.reduce((sum, resource) => sum + resource.plannedMinutes, 0);
  const totalActualResourceMinutes = resources.reduce((sum, resource) => sum + Math.min(resource.actualMinutes, resource.plannedMinutes), 0);
  const milestones = [
    ...periods.map((period) => ({ type: "academic_gap", date: period.startDate, endDate: period.endDate, title: period.name, subjectName: null })),
    ...subjectForecasts.filter((subject) => subject.newSourceDate).map((subject) => ({
      type: "new_resource",
      date: subject.newSourceDate!,
      endDate: null,
      title: `Yeni kaynak zamanı · ${subject.subjectName}`,
      subjectName: subject.subjectName,
    })),
    {
      type: "source_gap",
      date: "2027-01-18",
      endDate: null,
      title: "Vatandaşlık + güncel bilgiler kaynağını ekle",
      subjectName: "Genel Kültür",
    },
    {
      type: "exam",
      date: targetExamDate,
      endDate: null,
      title: "KPSS 2027 hedef günü (varsayım)",
      subjectName: null,
    },
  ].sort((a, b) => a.date.localeCompare(b.date));

  return {
    configured: true,
    strategy: {
      scoreType: strategyResult.data.score_type,
      targetExamDate,
      weeklyTargetMinutes: Number(strategyResult.data.weekly_target_minutes),
      monthlyTargetMinutes: Number(strategyResult.data.monthly_target_minutes),
      sourceNote: strategyResult.data.source_note,
      daysToExam: Math.max(0, Math.ceil((new Date(`${targetExamDate}T12:00:00Z`).getTime() - new Date(`${today}T12:00:00Z`).getTime()) / 86_400_000)),
    },
    subjects: P48_SUBJECT_TARGETS.map((subject) => ({ ...subject })),
    subjectForecasts,
    materialWorkloads,
    months,
    periods,
    milestones,
    currentWeek,
    capacity,
    availability: availabilityResult.data ?? [],
    resourcesSummary: {
      count: resources.length,
      totalPlannedMinutes: totalPlannedResourceMinutes,
      totalActualMinutes: totalActualResourceMinutes,
      progressPercent: totalPlannedResourceMinutes > 0 ? Math.round((totalActualResourceMinutes / totalPlannedResourceMinutes) * 100) : 0,
    },
  };
}

async function generateP48Week(client: SupabaseClient, userId: string, profile: any, force = false) {
  const strategyResult = await client.from("p48_strategy_profiles")
    .select("*")
    .eq("user_id", userId)
    .eq("exam_profile_id", profile.id)
    .eq("status", "active")
    .maybeSingle();
  if (strategyResult.error) throw strategyResult.error;
  if (!strategyResult.data) throw new Error("P48_STRATEGY_NOT_CONFIGURED");

  const today = istanbulDate();
  const weekStart = mondayOf(today);
  const existing = await currentPlan(client, profile.id, weekStart);
  if (existing && !force) return { ...(await planWithTasks(client, existing)), created: false };

  const [availabilityResult, periodsResult, exceptionsResult, targetResult, sessionsResult, allocationsResult, dailyOverrides] = await Promise.all([
    client.from("weekly_availability").select("*").eq("user_id", userId).eq("exam_profile_id", profile.id).eq("is_active", true),
    client.from("calendar_periods").select("*").eq("user_id", userId).eq("exam_profile_id", profile.id),
    client.from("schedule_exceptions").select("*").eq("user_id", userId).eq("exam_profile_id", profile.id)
      .gte("exception_date", weekStart).lte("exception_date", addDays(weekStart, 6)),
    client.from("p48_resource_targets")
      .select("planned_minutes,sequence_order,work_mode,resources(id,subject_id,name,status)")
      .eq("user_id", userId).eq("exam_profile_id", profile.id),
    client.from("study_sessions")
      .select("resource_id,duration_minutes,started_at")
      .eq("user_id", userId).eq("exam_profile_id", profile.id).eq("status", "completed"),
    client.from("study_session_allocations")
      .select("planned_credit_minutes,study_sessions!inner(started_at)")
      .eq("user_id", userId).eq("exam_profile_id", profile.id).is("superseded_at", null),
    loadP48DailyCapacityOverrides(client, userId, profile.id, weekStart, addDays(weekStart, 6)),
  ]);
  for (const result of [availabilityResult, periodsResult, exceptionsResult, targetResult, sessionsResult, allocationsResult]) if (result.error) throw result.error;

  const capacitySourceState = classifyP48CapacitySource({
    weeklyTargetMinutes: Number(strategyResult.data.weekly_target_minutes),
    activeAvailabilityCount: (availabilityResult.data ?? []).length,
    dailyOverrideCount: dailyOverrides.size,
  });

  if (capacitySourceState === "missing_capacity_source") {
    throw new Error("P48_CAPACITY_SOURCE_MISSING");
  }

  const { actualByResource } = aggregateCompletedStudySessions(sessionsResult.data ?? []);
  const plannedCreditByDate = aggregatePlannedCreditByDate(allocationsResult.data ?? []);

  const dayCapacities: Record<string, number> = {};
  for (let index = 0; index < 7; index += 1) {
    const date = addDays(weekStart, index);
    const capacityContext = {
      date,
      weeklyAvailability: p48Windows(availabilityResult.data ?? []),
      calendarPeriods: p48Periods(periodsResult.data ?? []).map((period) => ({
        startDate: period.startDate,
        endDate: period.endDate,
        capacityMultiplier: period.capacityMultiplier,
      })),
    };
    const baseCapacity = calculateEffectiveDayCapacity({
      ...capacityContext,
      scheduleExceptions: [],
    });
    const effectiveCapacity = calculateEffectiveDayCapacity({
      ...capacityContext,
      scheduleExceptions: p48Exceptions(exceptionsResult.data ?? []),
    });
    const planningCapacity = planningCapacityForDate(date, effectiveCapacity, dailyOverrides, baseCapacity);
    dayCapacities[date] = date < today ? 0 : Math.max(0, planningCapacity - (plannedCreditByDate.get(date) ?? 0));
  }

  const resources = (targetResult.data ?? []).map((row: any) => ({
    resourceId: row.resources.id,
    resourceName: row.resources.name,
    subjectId: row.resources.subject_id,
    subjectName: P48_SUBJECT_TARGETS.find((subject) => subject.subjectId === row.resources.subject_id)?.subjectName ?? "Ders",
    workMode: row.work_mode,
    remainingMinutes: row.resources.status === "completed"
      ? 0
      : Math.max(0, Number(row.planned_minutes) - (actualByResource.get(row.resources.id) ?? 0)),
    sequenceOrder: Number(row.sequence_order),
  }));

  const blocks = buildP48WeekBlocks({
    weekStart,
    currentDate: today,
    weeklyTargetMinutes: Number(strategyResult.data.weekly_target_minutes),
    dayCapacities,
    subjects: P48_SUBJECT_TARGETS.map((subject) => ({ ...subject })),
    resources,
  });

  const normalized = blocks.map((block) => ({
    plannedDate: block.plannedDate,
    subjectId: block.subjectId,
    workMode: block.workMode,
    resourceId: block.resourceId,
    estimatedMinutes: block.estimatedMinutes,
    title: block.isNewResourceWindow
      ? `${block.subjectName} · Yeni kaynak zamanı`
      : `${block.subjectName} · ${WORK_MODE_LABELS[block.workMode] ?? "Çalışma"} · ${block.resourceName}`,
    description: block.isNewResourceWindow
      ? `Mevcut P48 kaynakları planlanan süreden önce tamamlandı. ${block.subjectName} için yeni kaynak/deneme seç.`
      : `Kaynak: ${block.resourceName}`,
  }));
  const availableMinutes = Object.entries(dayCapacities)
    .filter(([date]) => date >= today)
    .reduce((sum, [, minutes]) => sum + minutes, 0);

  if (availableMinutes <= 0 || normalized.length === 0) {
    return { plan: null, tasks: [], created: false, academicGap: true, dayCapacities, generatedBlocks: 0 };
  }

  const stored = await client.rpc("replace_manual_weekly_plan", {
    p_payload: { weekStartDate: weekStart, availableMinutes, blocks: normalized },
  });
  if (stored.error) throw stored.error;
  const plan = await currentPlan(client, profile.id, weekStart);
  return { ...(await planWithTasks(client, plan)), created: true, dayCapacities, generatedBlocks: normalized.length };
}

async function nextTask(client: SupabaseClient, profile: any, userId: string) {
  const context = await loadDailyCoachContext(client, userId, profile, istanbulDate(), { respectCurrentTime: true });
  const recommendation = context.recommendation;
  if (!context.plan || !recommendation) throw new PlanningDomainError("NO_RECOMMENDABLE_TASK");
  const task = context.allTasks.find((candidate: any) => candidate.id === recommendation.taskId);
  if (!task) throw new PlanningDomainError("NO_RECOMMENDABLE_TASK");
  return {
    task,
    reason: recommendation.reason,
    remainingMinutes: recommendation.recommendedSessionMinutes,
    taskRemainingMinutes: recommendation.taskRemainingMinutes,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) return json({ error: { code: "UNAUTHORIZED", message: "Authorization required" } }, 401);
    const client = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } },
    );
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError || !authData.user) return json({ error: { code: "UNAUTHORIZED", message: "Invalid token" } }, 401);
    const userId = authData.user.id;
    const profile = await activeProfile(client, userId);
    const physicalLifecycle = new PhysicalStudyLifecycleService(client, {
      captureEnabled: isPhysicalPaceCaptureEnabled(
        Deno.env.get("PHYSICAL_PACE_CAPTURE_V1_PROFILE_IDS"),
        profile.id,
      ),
    });
    const pathname = new URL(request.url).pathname;
    const route = pathname.includes("/app-api") ? pathname.split("/app-api")[1] || "/" : pathname;
    const today = istanbulDate();
    const weekStart = mondayOf(today);
    const plannerV2Capabilities = plannerV2ProposalCapabilities(
      Deno.env.get("PLANNER_V2_PREVIEW_V1_PROFILE_IDS"),
      Deno.env.get("PLANNER_V2_CONFIRM_V1_PROFILE_IDS"),
      Deno.env.get("PLANNER_V2_APPLY_V1_PROFILE_IDS"),
      profile.id,
    );
    const plannerV2PreviewEnabled = plannerV2Capabilities.previewEnabled;
    const plannerV2ConfirmationEnabled = plannerV2Capabilities.confirmationEnabled;
    const plannerV2ApplyEnabled = plannerV2Capabilities.applyEnabled;

    if (request.method === "GET" && route === "/planner-v2/capability") {
      return json(plannerV2Capabilities);
    }
    if (request.method === "POST" && route === "/planner-v2/preview") {
      if (!plannerV2PreviewEnabled) throw new Error("PLANNER_V2_PREVIEW_DISABLED");
      const shadow: any = await runCanonicalPlannerV2ReadOnlyShadow({
        client,
        userId,
        examProfileId: profile.id,
        currentDate: today,
        includeLifecycleContracts: true,
      });
      const preview = buildPlannerV2Preview(shadow.proposal, shadow.existingTaskScopes);
      const componentFingerprints = await fingerprintPlannerV2SnapshotComponents(
        shadow.plannerInput,
        shadow.proposal.snapshotFingerprint,
      );
      const applyPlan = buildPlannerV2ApplyPlanCandidate({
        proposal: shadow.proposal,
        tasks: shadow.existingTaskScopes,
      });
      const stored = await serviceClient.rpc("create_planner_v2_proposal_candidate", {
        p_user_id: userId,
        p_exam_profile_id: profile.id,
        p_weekly_plan_id: shadow.weeklyPlanId,
        p_plan_generation_version: shadow.planGenerationVersion,
        p_planner_proposal_id: preview.proposalId,
        p_proposal_fingerprint: preview.proposalFingerprint,
        p_planner_snapshot_fingerprint: preview.snapshotFingerprint,
        p_planner_version: preview.plannerVersion,
        p_component_fingerprints: componentFingerprints,
        p_apply_plan: applyPlan,
        p_preview: preview,
        p_idempotency_key: `planner-v2-preview:${preview.proposalFingerprint}`,
      });
      if (stored.error) throw stored.error;
      return json({
        preview,
        confirmation: stored.data,
        applyEnabled: plannerV2ApplyEnabled,
        productionMutationAuthority: plannerV2Capabilities.productionMutationAuthority,
      }, 201);
    }
    if (request.method === "POST" && route === "/planner-v2/confirm") {
      if (!plannerV2ConfirmationEnabled) throw new Error("PLANNER_V2_CONFIRM_DISABLED");
      const body = await request.json().catch(() => null);
      const exact = parseExactPlannerV2ProposalIdentity(body);
      const prior = await loadPlannerV2Proposal(client, exact, userId, profile.id);
      assertExactPlannerV2ProposalPersistence(prior, exact, "PLANNER_V2_CONFIRMATION_IDENTITY_MISMATCH");
      if (prior.status !== "previewed" && prior.status !== "confirmed") {
        throw new Error(plannerV2LifecycleErrorCode(prior.status));
      }
      const confirmed = await client.rpc("confirm_planner_v2_proposal_candidate", {
        p_record_id: exact.recordId,
        p_planner_proposal_id: exact.proposalId,
        p_proposal_fingerprint: exact.proposalFingerprint,
        p_planner_snapshot_fingerprint: exact.snapshotFingerprint,
        p_planner_version: exact.plannerVersion,
      });
      if (confirmed.error) throw confirmed.error;
      const persisted = await loadPlannerV2Proposal(client, exact, userId, profile.id);
      const confirmation = assertAuthoritativePlannerV2Confirmation(persisted, exact);
      return json({
        confirmation,
        applyEnabled: plannerV2ApplyEnabled,
        productionMutationAuthority: plannerV2Capabilities.productionMutationAuthority,
      });
    }
    if (request.method === "POST" && route === "/planner-v2/apply") {
      if (!plannerV2ApplyEnabled) throw new Error("PLANNER_V2_APPLY_DISABLED");
      const exact = parseExactPlannerV2ProposalIdentity(await request.json().catch(() => null));
      const persisted = await loadPlannerV2Proposal(client, exact, userId, profile.id);
      assertExactPlannerV2ProposalPersistence(persisted, exact, "PLANNER_V2_APPLY_IDENTITY_MISMATCH");

      if (persisted.status !== "applied") {
        assertAuthoritativePlannerV2Confirmation(persisted, exact);
        const shadow: any = await runCanonicalPlannerV2ReadOnlyShadow({
          client,
          userId,
          examProfileId: profile.id,
          currentDate: today,
          includeLifecycleContracts: true,
        });
        const currentFingerprints = await fingerprintPlannerV2SnapshotComponents(
          shadow.plannerInput,
          shadow.proposal.snapshotFingerprint,
        );
        const freshness = validatePlannerV2Freshness(persisted.component_fingerprints, currentFingerprints);
        if (
          persisted.weekly_plan_id !== shadow.weeklyPlanId ||
          persisted.plan_generation_version !== shadow.planGenerationVersion ||
          !freshness.fresh
        ) throw new Error("ACTION_PROPOSAL_STALE");
      }

      const applied = await serviceClient.rpc("apply_planner_v2_proposal_candidate", {
        p_actor_user_id: userId,
        p_actor_exam_profile_id: profile.id,
        p_record_id: exact.recordId,
        p_planner_proposal_id: exact.proposalId,
        p_proposal_fingerprint: exact.proposalFingerprint,
        p_planner_snapshot_fingerprint: exact.snapshotFingerprint,
        p_planner_version: exact.plannerVersion,
      });
      if (applied.error) throw applied.error;
      return json({
        application: assertAuthoritativePlannerV2Apply(applied.data, exact),
      });
    }

    if (request.method === "GET" && route === "/p48/roadmap") {
      return json(await loadP48Roadmap(client, userId, profile));
    }
    if (request.method === "POST" && route === "/p48/bootstrap") {
      const bootstrap = await client.rpc("bootstrap_p48_strategy");
      if (bootstrap.error) throw bootstrap.error;
      await generateP48Week(client, userId, profile, true);
      return json({ bootstrap: bootstrap.data, roadmap: await loadP48Roadmap(client, userId, profile) }, 201);
    }
    if (request.method === "POST" && route === "/p48/week/generate") {
      return json(await generateP48Week(client, userId, profile, false), 201);
    }
    const resourceYoutubeVideosMatch = route.match(/^\/resources\/([0-9a-f-]+)\/youtube-videos$/);
    if (request.method === "GET" && resourceYoutubeVideosMatch) {
      const resourceId = resourceYoutubeVideosMatch[1];

      const { data: resource, error: resourceError } = await client
        .from("resources")
        .select("id,name,resource_type")
        .eq("id", resourceId)
        .eq("user_id", userId)
        .eq("exam_profile_id", profile.id)
        .maybeSingle();
      if (resourceError) throw resourceError;
      if (!resource) {
        return json({ error: { code: "RESOURCE_NOT_FOUND", message: "Resource not found" } }, 404);
      }

      const { data: links, error: linksError } = await client
        .from("topic_resource_links")
        .select("youtube_playlist_id,created_at")
        .eq("user_id", userId)
        .eq("exam_profile_id", profile.id)
        .eq("resource_id", resourceId)
        .not("youtube_playlist_id", "is", null)
        .order("created_at", { ascending: true });
      if (linksError) throw linksError;

      const playlistIds = [...new Set(
        (links ?? [])
          .map((link: any) => link.youtube_playlist_id)
          .filter((value: unknown): value is string => typeof value === "string" && value.length > 0),
      )];

      if (!playlistIds.length) {
        return json({
          resource: { id: resource.id, name: resource.name, resourceType: resource.resource_type },
          playlists: [],
        });
      }

      const [playlistsResult, videosResult] = await Promise.all([
        client
          .from("youtube_playlists")
          .select("id,source_url,youtube_playlist_id,title,total_duration_seconds,video_count,last_synced_at")
          .eq("user_id", userId)
          .eq("exam_profile_id", profile.id)
          .in("id", playlistIds),
        client
          .from("youtube_playlist_videos")
          .select("id,youtube_playlist_id,youtube_video_id,title,position,duration_seconds,thumbnail_url,channel_title,published_at")
          .eq("user_id", userId)
          .eq("exam_profile_id", profile.id)
          .eq("is_active", true)
          .in("youtube_playlist_id", playlistIds),
      ]);
      if (playlistsResult.error) throw playlistsResult.error;
      if (videosResult.error) throw videosResult.error;

      const playlistById = new Map((playlistsResult.data ?? []).map((row: any) => [row.id, row]));
      const videos = videosResult.data ?? [];
      const videoIds = videos.map((video: any) => video.id);
      const progressResult = videoIds.length
        ? await client
            .from("youtube_video_progress")
            .select("youtube_playlist_video_id,last_position_seconds,watched_seconds,completed_at,created_at,updated_at")
            .eq("user_id", userId)
            .eq("exam_profile_id", profile.id)
            .in("youtube_playlist_video_id", videoIds)
        : { data: [], error: null };
      if (progressResult.error) throw progressResult.error;
      const progressByVideoId = new Map(
        (progressResult.data ?? []).map((row: any) => [row.youtube_playlist_video_id, row]),
      );

      return json({
        resource: { id: resource.id, name: resource.name, resourceType: resource.resource_type },
        playlists: playlistIds.flatMap((playlistId) => {
          const playlist: any = playlistById.get(playlistId);
          if (!playlist) return [];
          return [{
            id: playlist.id,
            sourceUrl: playlist.source_url,
            youtubePlaylistId: playlist.youtube_playlist_id,
            title: playlist.title,
            totalDurationSeconds: Number(playlist.total_duration_seconds ?? 0),
            videoCount: Number(playlist.video_count ?? 0),
            lastSyncedAt: playlist.last_synced_at,
            videos: videos
              .filter((video: any) => video.youtube_playlist_id === playlist.id)
              .sort((left: any, right: any) => Number(left.position) - Number(right.position))
              .map((video: any) => ({
                id: video.id,
                youtubeVideoId: video.youtube_video_id,
                title: video.title,
                position: Number(video.position),
                durationSeconds: Number(video.duration_seconds),
                thumbnailUrl: video.thumbnail_url,
                channelTitle: video.channel_title,
                publishedAt: video.published_at,
                progress: progressByVideoId.has(video.id) && Number(video.duration_seconds) > 0
                  ? presentYouTubeVideoProgress(
                      progressByVideoId.get(video.id),
                      Number(video.duration_seconds),
                    )
                  : null,
              })),
          }];
        }),
      });
    }
    const youtubeVideoProgressMatch = route.match(/^\/youtube-videos\/([0-9a-f-]+)\/progress$/);
    if ((request.method === "GET" || request.method === "PUT") && youtubeVideoProgressMatch) {
      const youtubePlaylistVideoId = youtubeVideoProgressMatch[1];

      const { data: video, error: videoError } = await client
        .from("youtube_playlist_videos")
        .select("id,youtube_playlist_id,youtube_video_id,title,duration_seconds,position,is_active")
        .eq("id", youtubePlaylistVideoId)
        .eq("user_id", userId)
        .eq("exam_profile_id", profile.id)
        .eq("is_active", true)
        .maybeSingle();
      if (videoError) throw videoError;
      if (!video) throw new Error("YOUTUBE_VIDEO_NOT_FOUND");

      const durationSeconds = Number(video.duration_seconds ?? 0);
      if (!Number.isInteger(durationSeconds) || durationSeconds <= 0) {
        throw new Error("YOUTUBE_VIDEO_DURATION_UNAVAILABLE");
      }

      if (request.method === "GET") {
        const { data: progress, error: progressError } = await client
          .from("youtube_video_progress")
          .select("youtube_playlist_video_id,last_position_seconds,watched_seconds,completed_at,created_at,updated_at")
          .eq("user_id", userId)
          .eq("exam_profile_id", profile.id)
          .eq("youtube_playlist_video_id", youtubePlaylistVideoId)
          .maybeSingle();
        if (progressError) throw progressError;

        return json({
          video: {
            id: video.id,
            youtubePlaylistId: video.youtube_playlist_id,
            youtubeVideoId: video.youtube_video_id,
            title: video.title,
            durationSeconds,
            position: video.position,
          },
          progress: progress
            ? presentYouTubeVideoProgress(progress, durationSeconds)
            : null,
        });
      }

      const body = await request.json().catch(() => null);
      const input = normalizeYouTubeVideoProgressInput(body);

      const { data: saved, error: saveError } = await client.rpc(
        "record_youtube_video_progress",
        {
          p_video_id: youtubePlaylistVideoId,
          p_position_seconds: input.lastPositionSeconds,
          p_watched_seconds: input.watchedSeconds,
        },
      );
      if (saveError) throw saveError;

      return json({
        video: {
          id: video.id,
          youtubePlaylistId: video.youtube_playlist_id,
          youtubeVideoId: video.youtube_video_id,
          title: video.title,
          durationSeconds,
          position: video.position,
        },
        progress: saved,
      });
    }
    const youtubePlaylistSyncMatch = route.match(/^\/youtube-playlists\/([0-9a-f-]+)\/sync$/);
    if (request.method === "POST" && youtubePlaylistSyncMatch) {
      const playlistId = youtubePlaylistSyncMatch[1];

      const { data: playlist, error: playlistError } = await client
        .from("youtube_playlists")
        .select("id,youtube_playlist_id,source_url,title,total_duration_seconds,video_count,last_synced_at")
        .eq("id", playlistId)
        .eq("user_id", userId)
        .eq("exam_profile_id", profile.id)
        .maybeSingle();
      if (playlistError) throw playlistError;
      if (!playlist) throw new Error("YOUTUBE_PLAYLIST_NOT_FOUND");

      const { data: linked, error: linkedError } = await client
        .from("topic_resource_links")
        .select("id")
        .eq("user_id", userId)
        .eq("exam_profile_id", profile.id)
        .eq("youtube_playlist_id", playlist.id)
        .limit(1);
      if (linkedError) throw linkedError;
      if (!(linked ?? []).length) throw new Error("YOUTUBE_PLAYLIST_NOT_LINKED");

      const apiKey = Deno.env.get("YOUTUBE_API_KEY")?.trim();
      if (!apiKey) throw new Error("YOUTUBE_API_KEY_MISSING");

      const catalog = await fetchYouTubePlaylistCatalog({
        apiKey,
        youtubePlaylistId: playlist.youtube_playlist_id,
      });

      const { data: persisted, error: persistError } = await client.rpc(
        "sync_youtube_playlist_catalog",
        {
          p_playlist_id: playlist.id,
          p_payload: {
            title: catalog.title,
            videoCount: catalog.videoCount,
            totalDurationSeconds: catalog.totalDurationSeconds,
            videos: catalog.videos,
          },
        },
      );
      if (persistError) throw persistError;

      return json({
        playlist: {
          id: playlist.id,
          youtubePlaylistId: playlist.youtube_playlist_id,
          title: catalog.title,
          videoCount: catalog.videoCount,
          totalDurationSeconds: catalog.totalDurationSeconds,
          skippedVideoCount: catalog.skippedVideoCount,
        },
        sync: persisted,
      });
    }
    const topicMaterialLinksMatch = route.match(/^\/topics\/([0-9a-f-]+)\/material-links$/);
    if ((request.method === "GET" || request.method === "PUT") && topicMaterialLinksMatch) {
      const curriculumNodeId = topicMaterialLinksMatch[1];

      const { data: topic, error: topicError } = await client
        .from("curriculum_nodes")
        .select("id,subject_id,name,is_active")
        .eq("id", curriculumNodeId)
        .eq("is_active", true)
        .maybeSingle();
      if (topicError) throw topicError;
      if (!topic) throw new Error("TOPIC_RESOURCE_LINK_TOPIC_NOT_FOUND");

      if (request.method === "GET") {
        const { data: links, error: linksError } = await client
          .from("topic_resource_links")
          .select("id,curriculum_node_id,resource_id,youtube_playlist_id,is_primary,created_at,updated_at,resources(id,name,resource_type,subject_id),youtube_playlists(id,source_url,youtube_playlist_id,title,total_duration_seconds,video_count,last_synced_at)")
          .eq("user_id", userId)
          .eq("exam_profile_id", profile.id)
          .eq("curriculum_node_id", curriculumNodeId)
          .order("is_primary", { ascending: false })
          .order("created_at", { ascending: true });
        if (linksError) throw linksError;

        return json({
          topic: { id: topic.id, name: topic.name, subjectId: topic.subject_id },
          links: links ?? [],
        });
      }

      const body = await request.json().catch(() => null);
      const input = normalizeTopicResourceLinkInput(body);

      const { data: resource, error: resourceError } = await client
        .from("resources")
        .select("id,name,subject_id,resource_type")
        .eq("id", input.resourceId)
        .eq("user_id", userId)
        .eq("exam_profile_id", profile.id)
        .maybeSingle();
      if (resourceError) throw resourceError;
      if (!resource) throw new Error("TOPIC_RESOURCE_LINK_RESOURCE_NOT_FOUND");
      if (resource.subject_id !== topic.subject_id) {
        throw new Error("TOPIC_RESOURCE_LINK_SUBJECT_MISMATCH");
      }

      let playlistRow: any = null;
      if (input.playlist) {
        const { data: playlist, error: playlistError } = await client
          .from("youtube_playlists")
          .upsert({
            user_id: userId,
            exam_profile_id: profile.id,
            source_url: input.playlist.sourceUrl,
            youtube_playlist_id: input.playlist.youtubePlaylistId,
          }, { onConflict: "user_id,exam_profile_id,youtube_playlist_id" })
          .select("id,source_url,youtube_playlist_id,title,total_duration_seconds,video_count,last_synced_at")
          .single();
        if (playlistError) throw playlistError;
        playlistRow = playlist;
      }

      const { data: saved, error: saveError } = await client
        .from("topic_resource_links")
        .upsert({
          user_id: userId,
          exam_profile_id: profile.id,
          curriculum_node_id: curriculumNodeId,
          resource_id: resource.id,
          youtube_playlist_id: playlistRow?.id ?? null,
          is_primary: input.isPrimary,
        }, { onConflict: "user_id,exam_profile_id,curriculum_node_id,resource_id" })
        .select("id,curriculum_node_id,resource_id,youtube_playlist_id,is_primary,created_at,updated_at")
        .single();
      if (saveError) throw saveError;

      return json({
        topic: { id: topic.id, name: topic.name, subjectId: topic.subject_id },
        resource: { id: resource.id, name: resource.name, resourceType: resource.resource_type },
        playlist: playlistRow,
        link: saved,
      });
    }
    const resourceProgressMatch = route.match(/^\/resources\/([0-9a-f-]+)\/progress$/);
    if ((request.method === "GET" || request.method === "PUT") && resourceProgressMatch) {
      const resourceId = resourceProgressMatch[1];
      const { data: resource, error: resourceError } = await client
        .from("resources")
        .select("id,name,resource_type,exam_profile_id")
        .eq("id", resourceId)
        .eq("user_id", userId)
        .eq("exam_profile_id", profile.id)
        .maybeSingle();
      if (resourceError) throw resourceError;
      if (!resource) {
        return json({ error: { code: "RESOURCE_NOT_FOUND", message: "Resource not found" } }, 404);
      }

      if (request.method === "GET") {
        const { data: progress, error: progressError } = await client
          .from("resource_progress")
          .select("resource_id,current_page,total_pages,created_at,updated_at")
          .eq("user_id", userId)
          .eq("resource_id", resourceId)
          .maybeSingle();
        if (progressError) throw progressError;

        return json({
          resource: {
            id: resource.id,
            name: resource.name,
            resourceType: resource.resource_type,
          },
          progress: progress ? presentResourceProgress(progress) : null,
        });
      }

      const body = await request.json().catch(() => null);
      const normalized = normalizeResourceProgress({
        totalPages: Number(body?.totalPages),
        currentPage: Number(body?.currentPage),
      });

      const { data: saved, error: saveError } = await client
        .from("resource_progress")
        .upsert({
          user_id: userId,
          exam_profile_id: profile.id,
          resource_id: resourceId,
          current_page: normalized.currentPage,
          total_pages: normalized.totalPages,
        }, { onConflict: "user_id,resource_id" })
        .select("resource_id,current_page,total_pages,created_at,updated_at")
        .single();
      if (saveError) throw saveError;

      return json({
        resource: {
          id: resource.id,
          name: resource.name,
          resourceType: resource.resource_type,
        },
        progress: presentResourceProgress(saved),
      });
    }
    if (request.method === "GET" && route === "/weekly-plan/options") {
      const [subjectsResult, resourcesResult, availabilityResult] = await Promise.all([
        client.from("user_subjects").select("subject_id, subjects(id,name,sort_order)").eq("user_id",userId).eq("exam_profile_id",profile.id).eq("status","active"),
        client.from("resources").select("id,subject_id,name,resource_type").eq("user_id",userId).eq("exam_profile_id",profile.id).eq("status","active").order("name"),
        client.from("weekly_availability").select("weekday,start_time,end_time,is_active").eq("user_id",userId).eq("exam_profile_id",profile.id).eq("is_active",true),
      ]);
      for (const result of [subjectsResult,resourcesResult,availabilityResult]) if (result.error) throw result.error;
      const availability=(availabilityResult.data??[]).map((row:any)=>({weekday:row.weekday,start_time:row.start_time,end_time:row.end_time,is_active:row.is_active}));
      return json({
        weekStartDate: weekStart,
        weekEndDate: addDays(weekStart,6),
        availableMinutes: calculateWeeklyAvailableMinutes(availability),
        subjects: (subjectsResult.data??[]).map((row:any)=>({id:row.subject_id,name:row.subjects?.name??"Ders",sortOrder:row.subjects?.sort_order??0})).sort((a:any,b:any)=>a.sortOrder-b.sortOrder),
        resources: resourcesResult.data??[],
      });
    }
    if (request.method === "POST" && route === "/weekly-plan/manual") {
      const body=await request.json();
      const blocks=Array.isArray(body.blocks)?body.blocks:[];
      const [subjectsResult,resourcesResult,availabilityResult,periodsResult,exceptionsResult,sessionsResult,dailyOverrides]=await Promise.all([
        client.from("user_subjects").select("subject_id, subjects(name)").eq("user_id",userId).eq("exam_profile_id",profile.id).eq("status","active"),
        client.from("resources").select("id,subject_id,name,resource_type").eq("user_id",userId).eq("exam_profile_id",profile.id).eq("status","active"),
        client.from("weekly_availability").select("weekday,start_time,end_time,is_active").eq("user_id",userId).eq("exam_profile_id",profile.id).eq("is_active",true),
        client.from("calendar_periods").select("*").eq("user_id",userId).eq("exam_profile_id",profile.id),
        client.from("schedule_exceptions").select("*").eq("user_id",userId).eq("exam_profile_id",profile.id).gte("exception_date",weekStart).lte("exception_date",addDays(weekStart,6)),
        client.from("study_sessions").select("duration_minutes,started_at").eq("user_id",userId).eq("exam_profile_id",profile.id).eq("status","completed").gte("started_at",`${weekStart}T00:00:00+03:00`).lt("started_at",`${addDays(weekStart,7)}T00:00:00+03:00`),
        loadP48DailyCapacityOverrides(client,userId,profile.id,weekStart,addDays(weekStart,6)),
      ]);
      for(const result of [subjectsResult,resourcesResult,availabilityResult,periodsResult,exceptionsResult,sessionsResult]) if(result.error) throw result.error;
      const subjectNames=new Map((subjectsResult.data??[]).map((row:any)=>[row.subject_id,row.subjects?.name??"Ders"]));
      const resources=new Map((resourcesResult.data??[]).map((row:any)=>[row.id,row]));
      const availability=(availabilityResult.data??[]).map((row:any)=>({weekday:row.weekday,start_time:row.start_time,end_time:row.end_time,is_active:row.is_active}));
      const {actualByDate}=aggregateCompletedStudySessions(sessionsResult.data??[]);
      const dayCapacities:Record<string,number>={};
      for(let index=0;index<7;index++){const date=addDays(weekStart,index);const capacityContext={date,weeklyAvailability:availability,calendarPeriods:p48Periods(periodsResult.data??[])};const baseCapacity=calculateEffectiveDayCapacity({...capacityContext,scheduleExceptions:[]});const effective=calculateEffectiveDayCapacity({...capacityContext,scheduleExceptions:p48Exceptions(exceptionsResult.data??[])});const planningCapacity=planningCapacityForDate(date,effective,dailyOverrides,baseCapacity);dayCapacities[date]=date<today?0:Math.max(0,planningCapacity-(actualByDate.get(date)??0));}
      const availableMinutes=Object.values(dayCapacities).reduce((sum,minutes)=>sum+minutes,0);
      const normalized=blocks.map((block:any)=>{
        const subjectName=subjectNames.get(block.subjectId);
        const resource=block.resourceId?resources.get(block.resourceId):null;
        const mode=WORK_MODE_LABELS[String(block.workMode)]??String(block.workMode??"");
        const detail=String(block.detail??"").trim();
        const descriptor=detail||resource?.name||"Çalışma";
        return {
          plannedDate:String(block.plannedDate??""),subjectId:String(block.subjectId??""),
          workMode:String(block.workMode??""),resourceId:block.resourceId?String(block.resourceId):null,
          estimatedMinutes:Number(block.estimatedMinutes),
          title:`${subjectName??"Ders"} · ${mode} · ${descriptor}`,
          description:resource?.name?`Kaynak: ${resource.name}${detail&&detail!==resource.name?` · ${detail}`:""}`:(detail||null),
        };
      });
      if(findDailyCapacityOverloads(normalized,dayCapacities).length)throw new Error("MANUAL_PLAN_OVER_CAPACITY");
      const stored=await client.rpc("replace_manual_weekly_plan",{p_payload:{weekStartDate:weekStart,availableMinutes,blocks:normalized}});
      if(stored.error) throw stored.error;
      const plan=await currentPlan(client,profile.id,weekStart);
      return json({...(await planWithTasks(client,plan)),manual:stored.data},201);
    }

    if (request.method === "POST" && route === "/weekly-plan/build") {
      const existing = await currentPlan(client, profile.id, weekStart);
      if (existing) return json({ ...(await planWithTasks(client, existing)), created: false });
      const context = await buildContext(client, profile.id, userId, weekStart);
      const draft = buildWeeklyPlanV0(context);
      const { data, error } = await client.rpc("persist_weekly_plan", { p_plan: draft });
      if (error) throw error;
      const plan = await currentPlan(client, profile.id, weekStart);
      return json({ ...(await planWithTasks(client, plan)), created: data?.created ?? true }, 201);
    }
    if (request.method === "GET" && route === "/weekly-plan/current") {
      return json(await planWithTasks(client, await currentPlan(client, profile.id, weekStart)));
    }
    if (request.method === "GET" && route === "/tasks") {
      const plan = await currentPlan(client, profile.id, weekStart);
      return json((await planWithTasks(client, plan)).tasks);
    }
    if (request.method === "PUT" && route === "/tasks/daily-order") {
      const body = await request.json().catch(() => null);
      const date = typeof body?.date === "string" ? body.date : "";
      const taskIds = Array.isArray(body?.taskIds) ? body.taskIds.filter((id: unknown): id is string => typeof id === "string") : [];

      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("INVALID_DAILY_ORDER_DATE");
      if (taskIds.length === 0 || new Set(taskIds).size !== taskIds.length) throw new Error("INVALID_DAILY_ORDER_TASKS");

      const plan = await currentPlan(client, profile.id, weekStart);
      if (!plan) throw new Error("WEEKLY_PLAN_NOT_FOUND");

      const { data: dayTasks, error: dayTasksError } = await client
        .from("tasks")
        .select("id, planned_date, priority_score")
        .eq("user_id", userId)
        .eq("exam_profile_id", profile.id)
        .eq("weekly_plan_id", plan.id)
        .eq("planned_date", date)
        .order("priority_score", { ascending: false });
      if (dayTasksError) throw dayTasksError;

      const expectedIds = (dayTasks ?? []).map((task: any) => task.id);
      const expectedSet = new Set(expectedIds);
      const exactSameSet = expectedIds.length === taskIds.length && taskIds.every((id) => expectedSet.has(id));
      if (!exactSameSet) throw new Error("DAILY_ORDER_TASK_SET_MISMATCH");

      const rows = taskIds.map((taskId, manualOrder) => ({
        user_id: userId,
        task_id: taskId,
        planned_date: date,
        manual_order: manualOrder,
        updated_at: new Date().toISOString(),
      }));

      const { error: preferenceError } = await client
        .from("task_daily_preferences")
        .upsert(rows, { onConflict: "user_id,task_id,planned_date" });
      if (preferenceError) throw preferenceError;

      return json({ date, taskIds, manualOrderApplied: true });
    }
    if (request.method === "GET" && route === "/tasks/quick-add/options") {
      const { data: subjectRows, error: subjectError } = await client
        .from("user_subjects")
        .select("subject_id, subjects(name,sort_order)")
        .eq("user_id", userId)
        .eq("exam_profile_id", profile.id)
        .eq("status", "active");
      if (subjectError) throw subjectError;

      return json({
        weekStartDate: weekStart,
        weekEndDate: addDays(weekStart, 6),
        minDate: today,
        subjects: (subjectRows ?? [])
          .map((row: any) => ({
            id: row.subject_id,
            name: row.subjects?.name ?? "Ders",
            sortOrder: row.subjects?.sort_order ?? 0,
          }))
          .sort((left: any, right: any) => left.sortOrder - right.sortOrder),
      });
    }
    if (request.method === "POST" && route === "/tasks/quick-add/preview") {
      const body = await request.json().catch(() => null);
      const plan = await currentPlan(client, profile.id, weekStart);
      if (!plan) throw new Error("WEEKLY_PLAN_NOT_FOUND");

      const title = typeof body?.title === "string" ? body.title : "";
      const estimatedMinutes = Number(body?.estimatedMinutes);
      const plannedDate = typeof body?.plannedDate === "string" ? body.plannedDate : "";
      const subjectId = typeof body?.subjectId === "string" ? body.subjectId : "";

      const planStart = String(plan.week_start_date ?? weekStart);
      const planEnd = String(plan.week_end_date ?? addDays(weekStart, 6));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(plannedDate) || plannedDate < today || plannedDate < planStart || plannedDate > planEnd) {
        throw new Error("QUICK_ADD_INVALID_DATE");
      }

      const { data: subjectRow, error: subjectError } = await client
        .from("user_subjects")
        .select("subject_id, subjects(name)")
        .eq("user_id", userId)
        .eq("exam_profile_id", profile.id)
        .eq("subject_id", subjectId)
        .eq("status", "active")
        .maybeSingle();
      if (subjectError) throw subjectError;
      if (!subjectRow) throw new Error("QUICK_ADD_INVALID_SUBJECT");

      const dayContext = await loadDailyCoachContext(client, userId, profile, plannedDate);
      const preview = buildQuickAddTaskPreview({
        weeklyPlanId: plan.id,
        subjectId,
        subjectName: subjectRow.subjects?.name ?? "Ders",
        title,
        plannedDate,
        estimatedMinutes,
        remainingCapacityMinutes: Number(dayContext.remainingCapacityMinutes ?? 0),
      });

      if (preview.status !== "READY") return json(preview);

      const taskDedupeKey = [
        "quick-task-v1",subjectId,plannedDate,String(estimatedMinutes),
        title.trim().toLocaleLowerCase("tr-TR"),
      ].join(":");
      const proposalResult = await serviceClient.rpc(
        "create_confirmed_action_proposal",
        {
          p_user_id: userId,
          p_exam_profile_id: profile.id,
          p_weekly_plan_id: plan.id,
          p_action_kind: "quick_task",
          p_plan_generation_version: Number(plan.generation_version),
          p_mutation_payload: {
            candidate: preview.candidate,
            capacity: preview.capacity,
            taskDedupeKey,
          },
          p_display_payload: preview,
          p_idempotency_key: `quick-task-preview:${crypto.randomUUID()}`,
        },
      );
      if (proposalResult.error) throw proposalResult.error;

      return json({ ...preview, confirmation: proposalResult.data });
    }
    if (request.method === "POST" && route === "/tasks/quick-add/apply") {
      const body = await request.json().catch(() => null);
      const proposalId = typeof body?.proposalId === "string" ? body.proposalId : "";
      if (!/^[0-9a-f-]{36}$/i.test(proposalId)) throw new Error("ACTION_PROPOSAL_NOT_FOUND");
      const applied = await client.rpc("apply_confirmed_action_proposal", {
        p_proposal_id: proposalId,
      });
      if (applied.error) throw applied.error;
      const plan = await currentPlan(client,profile.id,weekStart);
      return json({
        ...applied.data,
        plan: await planWithTasks(client,plan),
      });
    }
    if (request.method === "POST" && route === "/study-intent/substitutions/preview") {
      const body = await request.json().catch(() => null);
      const sourceTaskId = typeof body?.sourceTaskId === "string" ? body.sourceTaskId : "";
      const replacementSessionId = typeof body?.replacementSessionId === "string" ? body.replacementSessionId : "";
      const sourceMinutes = Math.floor(Number(body?.sourceMinutes));
      const replacementTitle = typeof body?.replacementTitle === "string" ? body.replacementTitle.trim() : "";
      const idempotencyKey = typeof body?.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
      if (!sourceTaskId || !replacementSessionId || !replacementTitle || !idempotencyKey || sourceMinutes <= 0) {
        throw new Error("SUBSTITUTION_REPLACEMENT_INVALID");
      }
      const plan = await currentPlan(client,profile.id,weekStart);
      if (!plan) throw new Error("WEEKLY_PLAN_NOT_FOUND");
      const [sourceResult,sessionResult,allocationResult] = await Promise.all([
        client.from("tasks")
          .select("id,title,subject_id,planned_date,estimated_minutes,status,task_progress(completed_minutes)")
          .eq("id",sourceTaskId).eq("user_id",userId).eq("exam_profile_id",profile.id)
          .eq("weekly_plan_id",plan.id).maybeSingle(),
        client.from("study_sessions")
          .select("id,task_id,subject_id,curriculum_node_id,resource_id,duration_minutes,status")
          .eq("id",replacementSessionId).eq("user_id",userId).eq("exam_profile_id",profile.id)
          .eq("status","completed").maybeSingle(),
        client.from("study_session_allocations")
          .select("id,accounting_intent,actual_minutes,planned_credit_minutes,superseded_at")
          .eq("session_id",replacementSessionId).eq("user_id",userId)
          .eq("accounting_intent","extra").is("superseded_at",null).maybeSingle(),
      ]);
      for (const result of [sourceResult,sessionResult,allocationResult]) if (result.error) throw result.error;
      const source:any=sourceResult.data; const session:any=sessionResult.data; const allocation:any=allocationResult.data;
      if (!source || !session || !allocation || session.task_id===source.id) throw new Error("SUBSTITUTION_REPLACEMENT_INVALID");
      if (!["planned","ready","in_progress","partially_completed","rescheduled"].includes(source.status)) throw new Error("SUBSTITUTION_SOURCE_INVALID");
      const progress=Array.isArray(source.task_progress)?source.task_progress[0]:source.task_progress;
      const remainingMinutes=Math.max(0,Number(source.estimated_minutes??0)-Number(progress?.completed_minutes??0));
      if (sourceMinutes>remainingMinutes || sourceMinutes>Number(allocation.actual_minutes??0)) throw new Error("SUBSTITUTION_REPLACEMENT_INVALID");
      const preview={
        kind:"STUDY_SUBSTITUTION_PREVIEW",previewOnly:true,explicitConfirmationRequired:true,status:"READY",
        source:{taskId:source.id,title:source.title,plannedDate:source.planned_date,remainingMinutes,minutesRelieved:sourceMinutes},
        replacement:{sessionId:session.id,title:replacementTitle,actualMinutes:Number(allocation.actual_minutes),subjectId:session.subject_id},
        changes:[{changeType:"SUBSTITUTE",taskId:source.id,beforeRemainingMinutes:remainingMinutes,afterRemainingMinutes:remainingMinutes-sourceMinutes}],
        explanation:`${replacementTitle}, ${source.title} görevinin ${sourceMinutes} dakikası yerine sayılacak. Başka görev değişmeyecek.`,
      };
      const proposal=await serviceClient.rpc("create_confirmed_action_proposal",{
        p_user_id:userId,p_exam_profile_id:profile.id,p_weekly_plan_id:plan.id,
        p_action_kind:"substitution",p_plan_generation_version:Number(plan.generation_version),
        p_mutation_payload:{sourceTaskId,replacementSessionId,sourceMinutes,replacementTitle,reason:"user_replacement",initiatedBy:"user"},
        p_display_payload:preview,p_idempotency_key:idempotencyKey,
      });
      if(proposal.error)throw proposal.error;
      return json({...preview,confirmation:proposal.data});
    }
    if (request.method === "POST" && route === "/study-intent/carryovers/confirm") {
      const body=await request.json().catch(()=>null);
      const taskId=typeof body?.taskId==="string"?body.taskId:"";
      const fromDate=typeof body?.fromDate==="string"?body.fromDate:"";
      const toDate=typeof body?.toDate==="string"?body.toDate:"";
      const remainingMinutes=Math.floor(Number(body?.remainingMinutes));
      const idempotencyKey=typeof body?.idempotencyKey==="string"?body.idempotencyKey.trim():"";
      if(!taskId||!/^\d{4}-\d{2}-\d{2}$/.test(fromDate)||!/^\d{4}-\d{2}-\d{2}$/.test(toDate)||remainingMinutes<=0||!idempotencyKey){
        throw new Error("CARRYOVER_SOURCE_STALE");
      }
      const plan=await currentPlan(client,profile.id,weekStart);
      if(!plan)throw new Error("WEEKLY_PLAN_NOT_FOUND");
      const proposal=await serviceClient.rpc("create_confirmed_action_proposal",{
        p_user_id:userId,p_exam_profile_id:profile.id,p_weekly_plan_id:plan.id,
        p_action_kind:"carryover",p_plan_generation_version:Number(plan.generation_version),
        p_mutation_payload:{taskId,fromDate,toDate,remainingMinutes,reason:"user_could_not_finish",initiatedBy:"user"},
        p_display_payload:{kind:"CARRYOVER_CONFIRMATION",taskId,fromDate,toDate,remainingMinutes},
        p_idempotency_key:idempotencyKey,
      });
      if(proposal.error)throw proposal.error;
      const applied=await client.rpc("apply_confirmed_action_proposal",{p_proposal_id:proposal.data.proposalId});
      if(applied.error)throw applied.error;
      return json({...applied.data,confirmation:proposal.data});
    }
    const taskActionPreviewMatch = route.match(/^\/tasks\/([0-9a-f-]+)\/action-preview$/);
    if (request.method === "POST" && taskActionPreviewMatch) {
      const body = await request.json().catch(() => null);
      const action = typeof body?.action === "string" ? body.action : "";
      if (!["DEFER", "REMOVE_TODAY", "DURATION_DETAILS"].includes(action)) {
        throw new Error("TASK_ACTION_INVALID_ACTION");
      }

      const plan = await currentPlan(client, profile.id, weekStart);
      if (!plan) throw new Error("WEEKLY_PLAN_NOT_FOUND");

      const taskId = taskActionPreviewMatch[1];
      const [taskResult, activeSessionResult] = await Promise.all([
        client
          .from("tasks")
          .select("id,title,status,planned_date,estimated_minutes,subjects(name),resources(name),task_progress(completed_minutes,actual_study_minutes)")
          .eq("id", taskId)
          .eq("user_id", userId)
          .eq("exam_profile_id", profile.id)
          .eq("weekly_plan_id", plan.id)
          .maybeSingle(),
        client
          .from("study_sessions")
          .select("id")
          .eq("user_id", userId)
          .eq("exam_profile_id", profile.id)
          .eq("task_id", taskId)
          .eq("status", "active")
          .maybeSingle(),
      ]);
      if (taskResult.error) throw taskResult.error;
      if (activeSessionResult.error) throw activeSessionResult.error;
      if (!taskResult.data) return json({ error: { code: "TASK_NOT_FOUND", message: "Task not found" } }, 404);

      const task: any = taskResult.data;
      const progressRow = Array.isArray(task.task_progress) ? task.task_progress[0] : task.task_progress;
      const estimatedMinutes = Math.max(0, Number(task.estimated_minutes ?? 0));
      const completedMinutes = Math.min(
        estimatedMinutes,
        Math.max(0, Number(progressRow?.completed_minutes ?? 0)),
      );
      const remainingMinutes = Math.max(0, estimatedMinutes - completedMinutes);
      const nestedName = (value: any) => Array.isArray(value) ? value[0]?.name ?? null : value?.name ?? null;

      let targetDate: string | null = null;
      let targetRemainingCapacityMinutes: number | null = null;
      if (action === "DEFER" && task.planned_date === today && !activeSessionResult.data && task.status !== "completed") {
        const weekEnd = String(plan.week_end_date ?? addDays(weekStart, 6));
        for (let candidateDate = addDays(today, 1); candidateDate <= weekEnd; candidateDate = addDays(candidateDate, 1)) {
          const dayContext = await loadDailyCoachContext(client, userId, profile, candidateDate);
          const remainingCapacity = Math.max(0, Number(dayContext.remainingCapacityMinutes ?? 0));
          if (remainingCapacity >= remainingMinutes) {
            targetDate = candidateDate;
            targetRemainingCapacityMinutes = remainingCapacity;
            break;
          }
        }
      }

      const preview = buildTaskActionPreview({
        action: action as TaskActionPreviewAction,
        task: {
          id: task.id,
          title: task.title,
          subjectName: nestedName(task.subjects),
          resourceName: nestedName(task.resources),
          plannedDate: task.planned_date,
          status: task.status,
          estimatedMinutes,
          completedMinutes,
          remainingMinutes,
          active: Boolean(activeSessionResult.data),
        },
        currentDate: today,
        targetDate,
        targetRemainingCapacityMinutes,
      });

      return json(preview);
    }
    if (request.method === "GET" && route === "/tasks/next") {
      const recommendation=await nextTask(client, profile, userId);
      await recordRecommendationEvent(client,{userId,examProfileId:profile.id,taskId:recommendation.task.id,eventType:"next_best_task",channel:"web",reason:recommendation.reason});
      return json(recommendation);
    }
    if(request.method==="POST"&&route==="/schedule-exceptions"){
      const body=await request.json();const {data,error}=await client.from("schedule_exceptions").insert({user_id:userId,exam_profile_id:profile.id,exception_date:body.date,exception_type:body.type,start_time:body.startTime??null,end_time:body.endTime??null,minutes_delta:body.minutesDelta??null,note:body.note??null}).select("*").single();if(error)throw error;return json(data,201);
    }
    if(request.method==="POST"&&route==="/plans/current/apply-confirmed"){
      const body=await request.json().catch(()=>null);
      const proposalId=typeof body?.proposalId==="string"?body.proposalId:"";
      if(!/^[0-9a-f-]{36}$/i.test(proposalId))throw new Error("ACTION_PROPOSAL_NOT_FOUND");
      const applied=await client.rpc("apply_confirmed_action_proposal",{p_proposal_id:proposalId});
      if(applied.error)throw applied.error;
      const current=await currentPlan(client,profile.id,weekStart);
      return json({...applied.data,plan:await planWithTasks(client,current)});
    }
    if(request.method==="POST"&&route==="/plans/current/recalculate"){
      const plan=await currentPlan(client,profile.id,weekStart);if(!plan)throw new Error("WEEKLY_PLAN_NOT_FOUND");const body=await request.json().catch(()=>({}));return json(await recalculateCurrentPlan(client,userId,profile,plan,body.trigger??"manual_request"));
    }
    if(request.method==="GET"&&route==="/plans/minimum-day"){
      const plan=await currentPlan(client,profile.id,weekStart);if(!plan)throw new Error("WEEKLY_PLAN_NOT_FOUND");const url=new URL(request.url);const date=url.searchParams.get("date")??today;const raw=url.searchParams.get("availableMinutes");const minimum=await minimumDayPlan(client,userId,profile,plan,date,raw===null?undefined:Number(raw));await recordRecommendationEvent(client,{userId,examProfileId:profile.id,eventType:"minimum_plan",channel:"web",reason:"minimum_day_requested"});return json(minimum);
    }
    if(request.method==="GET"&&route==="/plans/risks"){const {data,error}=await client.from("plan_risks").select("*").eq("exam_profile_id",profile.id).eq("status","open").order("created_at",{ascending:false});if(error)throw error;return json(data??[]);}
    if(request.method==="GET"&&route==="/backlog/current"){const plan=await currentPlan(client,profile.id,weekStart);if(!plan)return json(null);const {data,error}=await client.from("backlog_states").select("*").eq("weekly_plan_id",plan.id).maybeSingle();if(error)throw error;return json(data);}
    if(request.method==="GET"&&route==="/plan-revisions/latest"){const {data,error}=await client.from("plan_revisions").select("*").eq("exam_profile_id",profile.id).order("created_at",{ascending:false}).limit(1).maybeSingle();if(error)throw error;return json(data);}
    if(request.method==="GET"&&route==="/progress/projection")return json(await syllabusProjection(client,userId,profile));
    if(request.method==="GET"&&route==="/reports/weekly/current"){
      const {data,error}=await client.from("weekly_reports").select("*").eq("exam_profile_id",profile.id).eq("week_start_date",weekStart).maybeSingle();if(error)throw error;return json(data);
    }
    if(request.method==="GET"&&route==="/reports/weekly/latest"){
      const {data,error}=await client.from("weekly_reports").select("*").eq("exam_profile_id",profile.id).order("week_start_date",{ascending:false}).limit(1).maybeSingle();if(error)throw error;return json(data);
    }
    if(request.method==="POST"&&route==="/reports/weekly/generate"){
      const body=await request.json().catch(()=>({}));const target=body.weekStartDate??weekStart;if(mondayOf(target)!==target)throw new Error("INVALID_WEEK_START");return json(await generateWeeklyReport(client,userId,profile,target),201);
    }
    if(request.method==="GET"&&route==="/pilot/metrics")return json(await pilotMetrics(client,userId,profile.id));
    if(request.method==="GET"&&route==="/data-gaps/open"){
      const {data,error}=await client.from("data_gap_events").select("*").eq("exam_profile_id",profile.id).eq("status","open").order("gap_date",{ascending:false});if(error)throw error;return json(data??[]);
    }
    const gapMatch=route.match(/^\/data-gaps\/([0-9a-f-]+)\/confirm-no-study$/);
    if(request.method==="POST"&&gapMatch){const {data,error}=await client.rpc("resolve_data_gap_event",{p_event_id:gapMatch[1],p_result:"confirmed_no_study"});if(error)throw error;return json(data);}
    if (request.method === "GET" && route === "/study-sessions/active") {
      const { data: session, error } = await client.from("study_sessions").select("*, tasks(title)").eq("status","active").maybeSingle();
      if (error) throw error;
      if (!session) return json({ session: null, break: null, paused: false });
      const { data: breaks, error: breakError } = await client
        .from("study_session_breaks")
        .select("id, session_id, started_at, ended_at")
        .eq("session_id", session.id)
        .order("started_at", { ascending: true });
      if (breakError) throw breakError;
      const openBreak = (breaks ?? []).find((row) => row.ended_at === null) ?? null;
      const closedBreakSeconds = (breaks ?? []).reduce((sum, row) => {
        if (!row.ended_at) return sum;
        const seconds = (Date.parse(row.ended_at) - Date.parse(row.started_at)) / 1000;
        return sum + (Number.isFinite(seconds) ? Math.max(0, seconds) : 0);
      }, 0);
      const lifecycle = await physicalLifecycle.describeSession(session);
      return json({
        session:{
          ...session,
          accountingIntent:session.task_id?"planned":null,
          lifecycle:lifecycle.lifecycle,
          physicalCapture:lifecycle.physicalCapture,
        },
        break: openBreak,
        paused: Boolean(openBreak),
        closedBreakSeconds,
      });
    }
    if (request.method === "GET" && route === "/execution/summary") {
      const weekRange = getZonedWeekRange(today);
      const [dailyPlan,weekRows,allocationRows,results] = await Promise.all([
        loadDailyCoachContext(client,userId,profile,today),
        client.from("study_sessions").select("duration_minutes").eq("status","completed").gte("ended_at",weekRange.startUtc).lt("ended_at",weekRange.endUtc),
        client.from("study_session_allocations").select("accounting_intent,actual_minutes,planned_credit_minutes,study_sessions!inner(ended_at)")
          .eq("exam_profile_id",profile.id).is("superseded_at",null)
          .gte("study_sessions.ended_at",weekRange.startUtc).lt("study_sessions.ended_at",weekRange.endUtc),
        client.from("test_results").select("*, subjects(name), resource_units(name)").order("completed_at",{ascending:false}).limit(5),
      ]);
      for(const result of [weekRows,allocationRows,results]) if(result.error) throw result.error;
      const allocations=allocationRows.data??[];
      return json({
        todayStudyMinutes:dailyPlan.studiedMinutes,
        weekStudyMinutes:(weekRows.data??[]).reduce((s,r)=>s+(r.duration_minutes??0),0),
        weekPlannedActualMinutes:allocations.filter((row:any)=>row.accounting_intent==="planned").reduce((sum:number,row:any)=>sum+Number(row.actual_minutes??0),0),
        weekExtraStudyMinutes:allocations.filter((row:any)=>row.accounting_intent==="extra").reduce((sum:number,row:any)=>sum+Number(row.actual_minutes??0),0),
        weekPlannedCreditMinutes:allocations.reduce((sum:number,row:any)=>sum+Number(row.planned_credit_minutes??0),0),
        recentResults:results.data??[],
        dailyPlan:{
          date:dailyPlan.date,
          tasks:dailyPlan.tasks,
          completedTaskIds:dailyPlan.completedTaskIds,
          deferredTaskCount:dailyPlan.deferredTaskCount,
          deferredMinutes:dailyPlan.deferredMinutes,
          capacityMinutes:dailyPlan.capacityMinutes,
          remainingCapacityMinutes:dailyPlan.remainingCapacityMinutes,
          totalMinutes:dailyPlan.totalMinutes,
          totalCommittedMinutes:dailyPlan.totalCommittedMinutes??dailyPlan.studiedMinutes+dailyPlan.totalMinutes,
        },
      });
    }
    if (request.method === "POST" && route === "/study-sessions/start") {
      const body=await request.json();
      return json(await physicalLifecycle.start({
        taskId:body.taskId,
        entrySource:body.entrySource??"web",
        resourceUnitId:typeof body.resourceUnitId==="string"?body.resourceUnitId:null,
      }),201);
    }
    if (request.method === "POST" && route === "/study-sessions/retroactive") {
      const body=await request.json();
      const taskId=typeof body?.taskId==="string"&&body.taskId?body.taskId:null;
      const accountingIntent=taskId?(body.accountingIntent??"planned"):body.accountingIntent;
      const idempotencyKey=typeof body?.idempotencyKey==="string"?body.idempotencyKey.trim():"";
      if(!taskId&&accountingIntent!=="extra")throw new Error("STUDY_INTENT_REQUIRED");
      if(!idempotencyKey)throw new Error("STUDY_INTENT_IDEMPOTENCY_REQUIRED");
      const {data,error}=await client.rpc("record_retroactive_session",{p_payload:{...body,taskId,accountingIntent,idempotencyKey,examProfileId:profile.id,entrySource:body.entrySource??"retroactive"}}); if(error) throw error;
      const plan=await currentPlan(client,profile.id,weekStart);
      const isExtra=data?.allocation?.accounting_intent==="extra";
      const replanPreview=isExtra
        ?{applied:false,planMutationApplied:false,noChange:true,extraStudyAffectedDecision:false,explanation:"Ekstra çalışma kaydedildi; mevcut plandaki görevler değiştirilmedi."}
        :plan?await previewCurrentPlan(client,userId,profile,plan,"study_deviation"):null;
      return json({...data,replanPreview,planMutationApplied:false},201);
    }
    const sessionMatch=route.match(/^\/study-sessions\/([0-9a-f-]+)\/(finish|cancel|pause|resume)$/);
    if(request.method==="POST"&&sessionMatch){
      const action=sessionMatch[2];
      const body=action==="finish"?await request.json().catch(()=>({})):{};
      const data=action==="finish"
        ?await physicalLifecycle.finish(sessionMatch[1],body.completedThroughPage)
        :action==="cancel"
          ?await physicalLifecycle.cancel(sessionMatch[1])
          :action==="pause"
            ?await physicalLifecycle.pause(sessionMatch[1])
            :await physicalLifecycle.resume(sessionMatch[1]);
      const plan=action==="finish"?await currentPlan(client,profile.id,weekStart):null;
      const replanPreview=plan?await previewCurrentPlan(client,userId,profile,plan,"study_deviation"):null;
      return json(action==="finish"?{...data,replanPreview,planMutationApplied:false}:data);
    }
    if(request.method==="POST"&&route==="/test-results"){
      const body=await request.json();
      const {data,error}=await client.rpc("record_test_result",{p_payload:{...body,examProfileId:profile.id,entrySource:body.entrySource??"web"}});
      if(error)throw error;
      let mastery=null; let masteryPending=false;
      if(data.curriculum_node_id){
        try { mastery=await recalculateTopicMastery(client,{userId,examProfileId:profile.id,curriculumNodeId:data.curriculum_node_id,sourceTestResultId:data.id,triggerType:body.revisionScheduleId?"revision_result":"test_result"}); }
        catch(caught){ masteryPending=true; console.error("MASTERY_RECALCULATION_FAILED",caughtMessage(caught)); }
      }
      return json({...data,mastery,masteryPending},201);
    }
    const resultMatch=route.match(/^\/test-results\/([0-9a-f-]+)(?:\/(review))?$/);
    if(request.method==="PATCH"&&resultMatch&&!resultMatch[2]){
      const body=await request.json();
      const {data,error}=await client.rpc("update_test_result",{p_result_id:resultMatch[1],p_correct:body.correct,p_wrong:body.wrong,p_blank:body.blank,p_total:body.total,p_duration:body.durationMinutes??null});
      if(error)throw error;
      let mastery=null; let masteryPending=false;
      if(data.curriculum_node_id){
        try { mastery=await recalculateTopicMastery(client,{userId,examProfileId:profile.id,curriculumNodeId:data.curriculum_node_id,sourceTestResultId:data.id,triggerType:"manual_recalculation"}); }
        catch(caught){ masteryPending=true; console.error("MASTERY_RECALCULATION_FAILED",caughtMessage(caught)); }
      }
      return json({...data,mastery,masteryPending});
    }
    if(request.method==="POST"&&resultMatch?.[2]==="review"){const {data,error}=await client.rpc("review_test_result",{p_result_id:resultMatch[1]});if(error)throw error;return json(data);}
    const topicPerformanceMatch=route.match(/^\/topics\/([0-9a-f-]+)\/performance$/);
    if(request.method==="GET"&&topicPerformanceMatch){
      const topicId=topicPerformanceMatch[1];
      const [progress,assessments,revisions,results]=await Promise.all([
        client.from("topic_progress").select("*, curriculum_nodes(name, subjects(name))").eq("exam_profile_id",profile.id).eq("curriculum_node_id",topicId).maybeSingle(),
        client.from("topic_assessments").select("*").eq("exam_profile_id",profile.id).eq("curriculum_node_id",topicId).order("created_at",{ascending:false}).limit(10),
        client.from("revision_schedules").select("*").eq("exam_profile_id",profile.id).eq("curriculum_node_id",topicId).order("created_at",{ascending:false}).limit(10),
        client.from("test_results").select("id,correct_count,wrong_count,blank_count,total_questions,accuracy,completed_at,review_status").eq("exam_profile_id",profile.id).eq("curriculum_node_id",topicId).order("completed_at",{ascending:false}).limit(3),
      ]);
      for(const result of [progress,assessments,revisions,results]) if(result.error)throw result.error;
      if(!progress.data)throw new Error("TOPIC_PROGRESS_NOT_FOUND");
      return json({topicProgress:progress.data,assessments:assessments.data??[],revisions:(revisions.data??[]).map((row)=>revisionWithUrgency(row,today)),recentResults:results.data??[]});
    }
    if(request.method==="GET"&&(route==="/revisions"||route==="/revisions/due")){
      let query=client.from("revision_schedules").select("*, curriculum_nodes(name, subjects(name))").eq("exam_profile_id",profile.id).in("status",["scheduled","due"]).order("scheduled_for",{ascending:true});
      if(route==="/revisions/due")query=query.lte("scheduled_for",today);
      const {data,error}=await query; if(error)throw error;
      return json((data??[]).map((row)=>revisionWithUrgency(row,today)));
    }
    const revisionCompleteMatch=route.match(/^\/revisions\/([0-9a-f-]+)\/complete$/);
    if(request.method==="POST"&&revisionCompleteMatch){const {data,error}=await client.rpc("complete_revision",{p_revision_id:revisionCompleteMatch[1]});if(error)throw error;return json(revisionWithUrgency(data,today));}
    if(request.method==="GET"&&route==="/messaging/telegram/status"){const {data,error}=await client.from("messaging_identities").select("external_user_id,external_chat_id,username,linked_at").eq("provider","telegram").maybeSingle();if(error)throw error;return json({linked:Boolean(data),identity:data});}
    if(request.method==="POST"&&route==="/messaging/telegram/link-token"){const raw=crypto.randomUUID().replaceAll("-","");const hash=await sha256(raw);const {error}=await client.from("messaging_link_tokens").insert({user_id:userId,provider:"telegram",token_hash:hash,expires_at:new Date(Date.now()+15*60_000).toISOString()});if(error)throw error;const username=Deno.env.get("TELEGRAM_BOT_USERNAME")??"BOT_USERNAME";return json({token:raw,expiresInSeconds:900,url:`https://t.me/${username}?start=${raw}`,configured:username!=="BOT_USERNAME"},201);}
    const match = route.match(/^\/tasks\/([0-9a-f-]+)\/(start|progress|complete-unit|complete)$/);
    if (request.method === "POST" && match) {
      const [, taskId, action] = match;
      const body = action === "start" || action === "complete" ? {} : await request.json();
      const rpc = action === "start" ? ["start_task", { p_task_id: taskId }]
        : action === "progress" ? ["update_task_progress", { p_task_id: taskId, p_completed_minutes: body.completedMinutes }]
        : action === "complete-unit" ? ["complete_task_unit", { p_task_id: taskId, p_resource_unit_id: body.resourceUnitId }]
        : ["complete_task", { p_task_id: taskId }];
      const { data, error } = await client.rpc(rpc[0] as string, rpc[1] as Record<string, unknown>);
      if (error) throw error;
      if (action === "complete") {
        const plan=await currentPlan(client,profile.id,weekStart);
        const replanPreview=plan?await previewCurrentPlan(client,userId,profile,plan,"study_deviation"):null;
        return json({...data,replanPreview,planMutationApplied:false});
      }
      return json(data);
    }
    return json({ error: { code: "NOT_FOUND", message: "Route not found" } }, 404);
  } catch (caught) {
    const message = caughtMessage(caught);
    const mapped = caught instanceof PlanningDomainError
      ? domainError(caught.code)
      : domainError(message);
    const { code, status } = mapped;
    return json({ error: { code, message } }, status);
  }
});
