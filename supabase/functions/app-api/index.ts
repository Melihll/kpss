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
import { minimumDayPlan, recalculateCurrentPlan, syllabusProjection } from "../_shared/adaptive.ts";
import { generateWeeklyReport, loadDailyCoachContext, pilotMetrics, recordRecommendationEvent } from "../_shared/pilot.ts";
import { aggregateCompletedStudySessions } from "../_shared/completed-study.ts";
import { loadP48DailyCapacityOverrides, planningCapacityForDate } from "../_shared/capacity-overrides.ts";
import { applyDailyTaskOrder } from "../_shared/daily-task-order.ts";

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
  NO_ACTIVE_EXAM_PROFILE: 400,
  NO_WEEKLY_AVAILABILITY: 400,
  INVALID_TEST_RESULT: 400,
  INVALID_TEST_RESULT_TOTAL: 400,
  INVALID_TEST_RESULT_COUNTS: 400,
  INVALID_SESSION_DURATION: 400,
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
  P48_STRATEGY_NOT_CONFIGURED: 409,
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
    .select("*, subjects(name), resources(name, resource_type), task_progress(completed_minutes, actual_study_minutes), task_resource_units(id, resource_unit_id, status, completed_at, resource_units(name, unit_type, estimated_minutes))")
    .eq("weekly_plan_id", plan.id)
    .order("planned_date")
    .order("priority_score", { ascending: false });
  if (error) throw error;

  const plannerOrderedTasks = tasks ?? [];
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

  const [targetResult, sessionsResult, periodsResult, availabilityResult] = await Promise.all([
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
  ]);
  for (const result of [targetResult, sessionsResult, periodsResult, availabilityResult]) if (result.error) throw result.error;

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

  const periods = p48Periods(periodsResult.data ?? []);
  const today = istanbulDate();
  const targetExamDate = strategyResult.data.target_exam_date;
  const subjectForecasts = forecastP48Resources({
    asOfDate: today,
    targetExamDate,
    subjects: P48_SUBJECT_TARGETS.map((subject) => ({ ...subject })),
    resources,
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
  const currentWeek = await planWithTasks(client, await currentPlan(client, profile.id, mondayOf(today)));
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
    months,
    periods,
    milestones,
    currentWeek,
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

  const [availabilityResult, periodsResult, exceptionsResult, targetResult, sessionsResult, dailyOverrides] = await Promise.all([
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
    loadP48DailyCapacityOverrides(client, userId, profile.id, weekStart, addDays(weekStart, 6)),
  ]);
  for (const result of [availabilityResult, periodsResult, exceptionsResult, targetResult, sessionsResult]) if (result.error) throw result.error;

  const { actualByDate, actualByResource } = aggregateCompletedStudySessions(sessionsResult.data ?? []);

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
    dayCapacities[date] = date < today ? 0 : Math.max(0, planningCapacity - (actualByDate.get(date) ?? 0));
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
    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError || !authData.user) return json({ error: { code: "UNAUTHORIZED", message: "Invalid token" } }, 401);
    const userId = authData.user.id;
    const profile = await activeProfile(client, userId);
    const pathname = new URL(request.url).pathname;
    const route = pathname.includes("/app-api") ? pathname.split("/app-api")[1] || "/" : pathname;
    const today = istanbulDate();
    const weekStart = mondayOf(today);

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
    if (request.method === "GET" && route === "/tasks/next") {
      const recommendation=await nextTask(client, profile, userId);
      await recordRecommendationEvent(client,{userId,examProfileId:profile.id,taskId:recommendation.task.id,eventType:"next_best_task",channel:"web",reason:recommendation.reason});
      return json(recommendation);
    }
    if(request.method==="POST"&&route==="/schedule-exceptions"){
      const body=await request.json();const {data,error}=await client.from("schedule_exceptions").insert({user_id:userId,exam_profile_id:profile.id,exception_date:body.date,exception_type:body.type,start_time:body.startTime??null,end_time:body.endTime??null,minutes_delta:body.minutesDelta??null,note:body.note??null}).select("*").single();if(error)throw error;return json(data,201);
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
      return json({ session, break: openBreak, paused: Boolean(openBreak), closedBreakSeconds });
    }
    if (request.method === "GET" && route === "/execution/summary") {
      const weekRange = getZonedWeekRange(today);
      const [dailyPlan,weekRows,results] = await Promise.all([
        loadDailyCoachContext(client,userId,profile,today),
        client.from("study_sessions").select("duration_minutes").eq("status","completed").gte("ended_at",weekRange.startUtc).lt("ended_at",weekRange.endUtc),
        client.from("test_results").select("*, subjects(name), resource_units(name)").order("completed_at",{ascending:false}).limit(5),
      ]);
      for(const result of [weekRows,results]) if(result.error) throw result.error;
      return json({
        todayStudyMinutes:dailyPlan.studiedMinutes,
        weekStudyMinutes:(weekRows.data??[]).reduce((s,r)=>s+(r.duration_minutes??0),0),
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
      const body=await request.json(); const {data,error}=await client.rpc("start_study_session",{p_task_id:body.taskId,p_entry_source:body.entrySource??"web"}); if(error) throw error; return json(data,201);
    }
    if (request.method === "POST" && route === "/study-sessions/retroactive") {
      const body=await request.json(); const {data,error}=await client.rpc("record_retroactive_session",{p_payload:{...body,examProfileId:profile.id,entrySource:body.entrySource??"retroactive"}}); if(error) throw error;
      const plan=await currentPlan(client,profile.id,weekStart);
      const replan=plan?await recalculateCurrentPlan(client,userId,profile,plan,"study_deviation"):null;
      return json({...data,replan},201);
    }
    const sessionMatch=route.match(/^\/study-sessions\/([0-9a-f-]+)\/(finish|cancel|pause|resume)$/);
    if(request.method==="POST"&&sessionMatch){
      const action=sessionMatch[2];
      const rpc=action==="finish"
        ?"finish_study_session"
        :action==="cancel"
          ?"cancel_study_session"
          :action==="pause"
            ?"pause_study_session"
            :"resume_study_session";
      const {data,error}=await client.rpc(rpc,{p_session_id:sessionMatch[1]});
      if(error)throw error;
      const plan=action==="finish"?await currentPlan(client,profile.id,weekStart):null;
      const replan=plan?await recalculateCurrentPlan(client,userId,profile,plan,"study_deviation"):null;
      return json(action==="finish"?{...data,replan}:data);
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
        const replan=plan?await recalculateCurrentPlan(client,userId,profile,plan,"study_deviation"):null;
        return json({...data,replan});
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
