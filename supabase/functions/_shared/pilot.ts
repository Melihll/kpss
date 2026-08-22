import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  buildDailyPlanProjection,
  DEFAULT_RESOURCE_UNIT_MINUTES,
  getNextBestTask,
  getZonedWeekRange,
  interpretWeeklyReport,
  remainingTaskMinutes,
} from "./planning.bundle.js";
import { loadAdaptiveBase, syllabusProjection } from "./adaptive.ts";
import { recommendationWindow } from "./recommendation-window.ts";
import { baselineExecutionOrder, hydrateTaskResource } from "./task-context.ts";

type RecommendationTask = {
  id: string;
  status: string;
  importance: string;
  priorityScore: number;
  plannedDate: string | null;
  estimatedMinutes: number;
  completedMinutes: number;
  pendingUnitMinutes?: number | null;
  createdAt: string;
  isRevision?: boolean;
  revisionUrgency?: string | null;
  masteryLevel?: string | null;
  topicState?: string | null;
};

export const PILOT_TIMEZONE = "Europe/Istanbul";
export const localDate = (instant = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: PILOT_TIMEZONE }).format(instant);
export const mondayOf = (dateString: string) => {
  const value = new Date(`${dateString}T12:00:00Z`);
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() - day + 1);
  return value.toISOString().slice(0, 10);
};
export const addDays = (dateString: string, days: number) => {
  const value = new Date(`${dateString}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
export const localDayRange = (dateString: string) => ({
  startUtc: new Date(`${dateString}T00:00:00+03:00`).toISOString(),
  endUtc: new Date(`${addDays(dateString, 1)}T00:00:00+03:00`).toISOString(),
});

const sum = (rows: any[] | null, field: string) => (rows ?? []).reduce((total, row) => total + Number(row[field] ?? 0), 0);
const ratio = (numerator: number, denominator: number) => denominator > 0 ? numerator / denominator : 1;

export async function recordRecommendationEvent(
  client: SupabaseClient,
  input: { userId: string; examProfileId: string; taskId?: string | null; eventType: "next_best_task" | "minimum_plan" | "daily_plan"; channel: "web" | "telegram" | "scheduler"; reason: string },
) {
  const { error } = await client.from("recommendation_events").insert({
    user_id: input.userId,
    exam_profile_id: input.examProfileId,
    task_id: input.taskId ?? null,
    event_type: input.eventType,
    channel: input.channel,
    reason: input.reason,
  });
  if (error) throw error;
}

function remainingClockMinutes(availability: any[], date: string) {
  if (date !== localDate()) return Number.POSITIVE_INFINITY;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: PILOT_TIMEZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  const weekdays: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  const weekday = weekdays[parts.weekday] ?? 1;
  const current = Number(parts.hour) * 60 + Number(parts.minute);
  const intervals = availability.filter((window) => window.weekday === weekday && window.is_active !== false)
    .map((window) => {
      const [startHour, startMinute] = String(window.start_time).split(":").map(Number);
      const [endHour, endMinute] = String(window.end_time).split(":").map(Number);
      return { start: Math.max(current, startHour * 60 + startMinute), end: endHour * 60 + endMinute };
    })
    .filter((interval) => interval.end > interval.start)
    .sort((left, right) => left.start - right.start);
  let total = 0;
  let end = -1;
  for (const interval of intervals) {
    if (interval.start > end) total += interval.end - interval.start;
    else if (interval.end > end) total += interval.end - end;
    end = Math.max(end, interval.end);
  }
  return total;
}

export async function loadDailyCoachContext(
  client: SupabaseClient,
  userId: string,
  profile: any,
  date: string,
  options: { respectCurrentTime?: boolean } = {},
) {
  const weekStart = mondayOf(date);
  const planResult = await client.from("weekly_plans").select("*")
    .eq("user_id", userId).eq("exam_profile_id", profile.id).eq("week_start_date", weekStart).eq("status", "active").maybeSingle();
  if (planResult.error) throw planResult.error;
  if (!planResult.data) return {
    date,
    plan: null,
    taskCount: 0,
    scheduledTaskCount: 0,
    totalMinutes: 0,
    capacityMinutes: 0,
    studiedMinutes: 0,
    remainingCapacityMinutes: 0,
    availableNowMinutes: 0,
    tasks: [],
    allTasks: [],
    completedTaskIds: [],
    deferredTaskIds: [],
    deferredTaskCount: 0,
    deferredMinutes: 0,
    recommendation: null,
  };

  const tasksResult = await client.from("tasks")
    .select("id,title,task_type,status,importance,priority_score,planned_date,estimated_minutes,created_at,revision_schedule_id,source_reason,dedupe_key,resource_id,resource_section_id,resources(name,resource_type),resource_sections(resources(name,resource_type)),task_progress(completed_minutes),task_resource_units(status,resource_units(resource_id,unit_type,estimated_minutes,resources(name,resource_type)))")
    .eq("user_id", userId).eq("weekly_plan_id", planResult.data.id);
  if (tasksResult.error) throw tasksResult.error;
  const adaptive = await loadAdaptiveBase(client, userId, profile, planResult.data);
  const dayRange = localDayRange(date);
  const [sessionsResult,allocationsResult] = await Promise.all([
    client.from("study_sessions")
      .select("duration_minutes")
      .eq("user_id", userId)
      .eq("exam_profile_id", profile.id)
      .eq("status", "completed")
      .gte("started_at", dayRange.startUtc)
      .lt("started_at", dayRange.endUtc),
    client.from("study_session_allocations")
      .select("accounting_intent,actual_minutes,planned_credit_minutes,study_sessions!inner(started_at)")
      .eq("user_id",userId)
      .eq("exam_profile_id",profile.id)
      .is("superseded_at",null)
      .gte("study_sessions.started_at",dayRange.startUtc)
      .lt("study_sessions.started_at",dayRange.endUtc),
  ]);
  if (sessionsResult.error) throw sessionsResult.error;
  if (allocationsResult.error) throw allocationsResult.error;
  const studiedMinutes = sum(sessionsResult.data, "duration_minutes");
  const allocationRows=allocationsResult.data??[];
  const plannedCreditMinutes=sum(allocationRows,"planned_credit_minutes");
  const plannedActualMinutes=allocationRows.filter((row:any)=>row.accounting_intent==="planned").reduce((total:number,row:any)=>total+Number(row.actual_minutes??0),0);
  const extraStudyMinutes=allocationRows.filter((row:any)=>row.accounting_intent==="extra").reduce((total:number,row:any)=>total+Number(row.actual_minutes??0),0);
  const allocatedActualMinutes=sum(allocationRows,"actual_minutes");
  const unknownStudyMinutes=Math.max(0,studiedMinutes-allocatedActualMinutes)+allocationRows.filter((row:any)=>row.accounting_intent==="unknown").reduce((total:number,row:any)=>total+Number(row.actual_minutes??0),0);
  const adaptiveMap = new Map(adaptive.adaptiveTasks.map((item: any) => [item.id, item]));
  const enriched = (tasksResult.data ?? []).map((task: any) => {
    const hydratedTask = hydrateTaskResource(task);
    const pendingUnits = (task.task_resource_units ?? []).filter((link: any) => link.status === "pending");
    const pendingUnitMinutes = pendingUnits.length
      ? pendingUnits.reduce((total: number, link: any) => {
        const unit = link.resource_units;
        return total + Number(unit?.estimated_minutes ?? (DEFAULT_RESOURCE_UNIT_MINUTES as Record<string, number>)[unit?.unit_type ?? "other"] ?? 30);
      }, 0)
      : null;
    const completedMinutes = Number(task.task_progress?.[0]?.completed_minutes ?? 0);
    return {
      raw: hydratedTask,
      pendingUnitCount: pendingUnits.length,
      mapped: {
        id: task.id,
        status: task.status,
        importance: task.importance,
        priorityScore: task.priority_score,
        plannedDate: task.planned_date,
        estimatedMinutes: task.estimated_minutes,
        completedMinutes,
        pendingUnitMinutes,
        executionOrder: baselineExecutionOrder(task),
        createdAt: task.created_at,
        isRevision: Boolean(task.revision_schedule_id),
        revisionUrgency: adaptive.allAdaptiveRevisions.find((row: any) => row.id === task.revision_schedule_id)?.urgency ?? null,
        masteryLevel: (adaptiveMap.get(task.id) as any)?.masteryLevel ?? null,
        topicState: (adaptiveMap.get(task.id) as any)?.topicState ?? null,
      } satisfies RecommendationTask,
    };
  });
  const mapped = enriched.map((item) => item.mapped);
  const rankedToday: Array<{ mapped: RecommendationTask; reason: string; remainingMinutes: number }> = [];
  let todayCandidates = mapped.filter((task) => task.plannedDate === date);
  while (todayCandidates.length) {
    try {
      const selected = getNextBestTask(todayCandidates, { today: date });
      rankedToday.push({ mapped: selected.recommendedTask as RecommendationTask, reason: selected.reason, remainingMinutes: selected.remainingMinutes });
      todayCandidates = todayCandidates.filter((task) => task.id !== selected.recommendedTask.id);
    } catch {
      break;
    }
  }
  const rankedIds = new Set(rankedToday.map((item) => item.mapped.id));
  const dayCapacity = Number(adaptive.dayCapacities[date] ?? 0);
  const projection = buildDailyPlanProjection({
    date,
    capacityMinutes: dayCapacity,
    completedStudyMinutes: plannedCreditMinutes,
    plannedCreditMinutes,
    actualStudyMinutes: studiedMinutes,
    extraStudyMinutes,
    unknownStudyMinutes,
    tasks: [
      ...rankedToday.map((item) => ({ id: item.mapped.id, plannedDate: item.mapped.plannedDate, status: item.mapped.status, remainingMinutes: item.remainingMinutes })),
      ...mapped.filter((task) => !rankedIds.has(task.id)).map((task) => ({
        id: task.id,
        plannedDate: task.plannedDate,
        status: task.status,
        remainingMinutes: remainingTaskMinutes(task as any),
      })),
    ],
  });
  const remainingCapacityMinutes = projection.remainingCapacityMinutes;
  const availableNowMinutes = options.respectCurrentTime
    ? adaptive.dailyCapacityOverrides?.has(date)
      ? remainingCapacityMinutes
      : Math.min(remainingCapacityMinutes, remainingClockMinutes(adaptive.availability ?? [], date))
    : remainingCapacityMinutes;
  let recommendation: null | {
    taskId: string;
    title: string;
    taskType: string;
    reason: string;
    remainingMinutes: number;
    taskRemainingMinutes: number;
    recommendedSessionMinutes: number;
    completedMinutes: number;
    estimatedMinutes: number;
    pendingUnitCount: number;
    needsResult: boolean;
  } = null;
  try {
    const scheduledIds = new Set(projection.openItems.map((item: any) => item.taskId));
    const selected = getNextBestTask(mapped.filter((task) => scheduledIds.has(task.id)), { today: date, availableMinutes: availableNowMinutes });
    const item = enriched.find((candidate) => candidate.raw.id === selected.recommendedTask.id);
    const allocated = projection.openItems.find((candidate: any) => candidate.taskId === selected.recommendedTask.id)?.scheduledMinutes ?? 0;
    const window = recommendationWindow(selected.remainingMinutes, Math.min(availableNowMinutes, allocated));
    const taskRemainingMinutes = window.taskRemainingMinutes;
    const needsResult = item?.raw.task_type === "solve_resource_units" && item.pendingUnitCount > 0 && taskRemainingMinutes === 0;
    if (item && availableNowMinutes > 0 && window.recommendedSessionMinutes > 0) recommendation = {
      taskId: item.raw.id,
      title: item.raw.title,
      taskType: item.raw.task_type,
      reason: selected.reason,
      remainingMinutes: selected.remainingMinutes,
      taskRemainingMinutes,
      recommendedSessionMinutes: needsResult ? 0 : window.recommendedSessionMinutes,
      completedMinutes: item.mapped.completedMinutes,
      estimatedMinutes: item.mapped.estimatedMinutes,
      pendingUnitCount: item.pendingUnitCount,
      needsResult,
    };
  } catch {
    recommendation = null;
  }

  const focusTasks: Array<{
    id: string;
    title: string;
    taskType: string;
    minutes: number;
    remainingMinutes: number;
    reason: string;
    needsResult: boolean;
  }> = [];
  for (const projected of projection.openItems) {
    const item = enriched.find((candidate) => candidate.raw.id === projected.taskId);
    const ranked = rankedToday.find((candidate) => candidate.mapped.id === projected.taskId);
    if (!item || !ranked) continue;
    focusTasks.push({
      id: item.raw.id,
      title: item.raw.title,
      taskType: item.raw.task_type,
      minutes: projected.scheduledMinutes,
      remainingMinutes: projected.remainingMinutes,
      reason: ranked.reason,
      needsResult: false,
    });
  }
  return {
    date,
    plan: planResult.data,
    taskCount: focusTasks.length,
    scheduledTaskCount: focusTasks.length,
    totalMinutes: projection.scheduledOpenMinutes,
    totalCommittedMinutes: projection.totalCommittedMinutes,
    capacityMinutes: dayCapacity,
    studiedMinutes,
    plannedActualMinutes,
    plannedCreditMinutes,
    extraStudyMinutes,
    unknownStudyMinutes,
    nominalActualOverageMinutes:projection.nominalActualOverageMinutes,
    remainingCapacityMinutes,
    availableNowMinutes,
    tasks: focusTasks,
    allTasks: enriched.map((item) => item.raw),
    completedTaskIds: projection.completedTaskIds,
    deferredTaskIds: projection.deferredTaskIds,
    deferredTaskCount: projection.deferredTaskIds.length,
    deferredMinutes: projection.deferredMinutes,
    recommendation,
  };
}

export async function buildDailyPlanSummary(client: SupabaseClient, userId: string, profile: any, date: string) {
  return await loadDailyCoachContext(client, userId, profile, date);
}

export async function generateWeeklyReport(client: SupabaseClient, userId: string, profile: any, weekStartDate: string) {
  const weekEndDate = addDays(weekStartDate, 6);
  const range = getZonedWeekRange(weekStartDate);
  const [planResult, tasksResult, sessionsResult, resultsResult, topicsResult, revisionsResult] = await Promise.all([
    client.from("weekly_plans").select("id,planned_minutes").eq("user_id", userId).eq("exam_profile_id", profile.id)
      .eq("week_start_date", weekStartDate).maybeSingle(),
    client.from("tasks").select("id,status,estimated_minutes,completed_at").eq("user_id", userId).eq("exam_profile_id", profile.id)
      .gte("planned_date", weekStartDate).lte("planned_date", weekEndDate).neq("status", "cancelled"),
    client.from("study_sessions").select("duration_minutes").eq("user_id", userId).eq("exam_profile_id", profile.id)
      .eq("status", "completed").gte("started_at", range.startUtc).lt("started_at", range.endUtc),
    client.from("test_results").select("total_questions").eq("user_id", userId).eq("exam_profile_id", profile.id)
      .gte("completed_at", range.startUtc).lt("completed_at", range.endUtc),
    client.from("topic_progress").select("id").eq("user_id", userId).eq("exam_profile_id", profile.id)
      .gte("learned_at", range.startUtc).lt("learned_at", range.endUtc),
    client.from("revision_schedules").select("status,scheduled_for,completed_at").eq("user_id", userId).eq("exam_profile_id", profile.id)
      .lte("scheduled_for", weekEndDate),
  ]);
  for (const result of [planResult, tasksResult, sessionsResult, resultsResult, topicsResult, revisionsResult]) {
    if (result.error) throw result.error;
  }
  const backlogResult = planResult.data
    ? await client.from("backlog_states").select("severity").eq("user_id", userId).eq("weekly_plan_id", planResult.data.id).maybeSingle()
    : { data: null, error: null };
  if (backlogResult.error) throw backlogResult.error;
  const projection = await syllabusProjection(client, userId, profile);
  const tasks = tasksResult.data ?? [];
  const revisions = revisionsResult.data ?? [];
  const plannedMinutes = planResult.data?.planned_minutes ?? sum(tasks, "estimated_minutes");
  const completedTaskCount = tasks.filter((task) => task.status === "completed").length;
  const revisionCompletedCount = revisions.filter((revision) => revision.completed_at &&
    revision.completed_at >= range.startUtc && revision.completed_at < range.endUtc).length;
  const revisionDueCount = revisions.filter((revision) => revision.scheduled_for >= weekStartDate && revision.scheduled_for <= weekEndDate).length;
  const backlogSeverity = (backlogResult.data?.severity ?? "normal") as "normal" | "attention" | "risk" | "critical";
  const interpretation = interpretWeeklyReport({
    plannedMinutes,
    actualMinutes: sum(sessionsResult.data, "duration_minutes"),
    plannedTaskCount: tasks.length,
    completedTaskCount,
    backlogSeverity,
    projectionStatus: projection.status,
  });
  const row = {
    user_id: userId,
    exam_profile_id: profile.id,
    week_start_date: weekStartDate,
    week_end_date: weekEndDate,
    planned_minutes: plannedMinutes,
    actual_minutes: sum(sessionsResult.data, "duration_minutes"),
    planned_task_count: tasks.length,
    completed_task_count: completedTaskCount,
    question_count: sum(resultsResult.data, "total_questions"),
    completed_topic_count: topicsResult.data?.length ?? 0,
    revision_completed_count: revisionCompletedCount,
    revision_due_count: revisionDueCount,
    backlog_severity: backlogSeverity,
    projection_status: projection.status,
    plan_status: interpretation.status,
    explanation: interpretation.explanation,
  };
  const stored = await client.from("weekly_reports").upsert(row, { onConflict: "user_id,week_start_date" }).select("*").single();
  if (stored.error) throw stored.error;
  return stored.data;
}

export async function pilotMetrics(client: SupabaseClient, userId: string, profileId: string) {
  const [actions,tasks,reschedules,sessions,results,revisions,recommendations,exceptions,replans,risks] = await Promise.all([
    client.from("scheduled_actions").select("id").eq("user_id",userId).eq("action_type","daily_plan").eq("status","completed"),
    client.from("tasks").select("id,status,estimated_minutes").eq("user_id",userId).eq("exam_profile_id",profileId).neq("status","cancelled"),
    client.from("task_reschedule_events").select("id").eq("user_id",userId),
    client.from("study_sessions").select("duration_minutes,entry_source,task_id").eq("user_id",userId).eq("exam_profile_id",profileId).eq("status","completed"),
    client.from("test_results").select("wrong_count,review_status").eq("user_id",userId).eq("exam_profile_id",profileId),
    client.from("revision_schedules").select("status").eq("user_id",userId).eq("exam_profile_id",profileId),
    client.from("recommendation_events").select("event_type").eq("user_id",userId).eq("exam_profile_id",profileId),
    client.from("schedule_exceptions").select("id").eq("user_id",userId).eq("exam_profile_id",profileId),
    client.from("plan_revisions").select("id").eq("user_id",userId).eq("exam_profile_id",profileId),
    client.from("plan_risks").select("severity").eq("user_id",userId).eq("exam_profile_id",profileId),
  ]);
  for(const result of [actions,tasks,reschedules,sessions,results,revisions,recommendations,exceptions,replans,risks]) if(result.error) throw result.error;
  const taskRows=tasks.data??[],sessionRows=sessions.data??[],resultRows=results.data??[],revisionRows=revisions.data??[],events=recommendations.data??[];
  const wrongResults=resultRows.filter(row=>row.wrong_count>0);
  return {
    daily_plan_days: actions.data?.length??0,
    task_completion_rate: ratio(taskRows.filter(row=>row.status==="completed").length,taskRows.length),
    task_reschedule_rate: ratio(reschedules.data?.length??0,taskRows.length),
    partial_completion_rate: ratio(taskRows.filter(row=>row.status==="partially_completed").length,taskRows.length),
    planned_vs_actual_minutes_ratio: ratio(sum(sessionRows,"duration_minutes"),sum(taskRows,"estimated_minutes")),
    next_best_task_usage_count: events.filter(row=>row.event_type==="next_best_task").length,
    retroactive_study_count: sessionRows.filter(row=>row.entry_source==="retroactive"||(row.entry_source==="telegram"&&!row.task_id)).length,
    test_result_count: resultRows.length,
    wrong_review_completion_rate: ratio(wrongResults.filter(row=>row.review_status==="reviewed").length,wrongResults.length),
    revision_completion_rate: ratio(revisionRows.filter(row=>row.status==="completed").length,revisionRows.length),
    minimum_plan_usage_count: events.filter(row=>row.event_type==="minimum_plan").length,
    schedule_exception_count: exceptions.data?.length??0,
    replan_count: replans.data?.length??0,
    backlog_risk_count: (risks.data??[]).filter(row=>row.severity==="risk"||row.severity==="critical").length,
  };
}
