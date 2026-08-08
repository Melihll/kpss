import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  getNextBestTask,
  getZonedWeekRange,
  interpretWeeklyReport,
  type RecommendationTask,
} from "./planning.bundle.js";
import { loadAdaptiveBase, syllabusProjection } from "./adaptive.ts";

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
  input: { userId: string; examProfileId: string; taskId?: string | null; eventType: "next_best_task" | "minimum_plan"; channel: "web" | "telegram" | "scheduler"; reason: string },
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

export async function buildDailyPlanSummary(client: SupabaseClient, userId: string, profile: any, date: string) {
  const weekStart = mondayOf(date);
  const planResult = await client.from("weekly_plans").select("*")
    .eq("user_id", userId).eq("exam_profile_id", profile.id).eq("week_start_date", weekStart).eq("status", "active").maybeSingle();
  if (planResult.error) throw planResult.error;
  if (!planResult.data) return { date, taskCount: 0, totalMinutes: 0, capacityMinutes: 0, tasks: [], recommendation: null };

  const tasksResult = await client.from("tasks")
    .select("id,title,status,importance,priority_score,planned_date,estimated_minutes,created_at,revision_schedule_id,task_progress(completed_minutes)")
    .eq("user_id", userId).eq("weekly_plan_id", planResult.data.id);
  if (tasksResult.error) throw tasksResult.error;
  const adaptive = await loadAdaptiveBase(client, userId, profile, planResult.data);
  const adaptiveMap = new Map(adaptive.adaptiveTasks.map((item: any) => [item.id, item]));
  const mapped: RecommendationTask[] = (tasksResult.data ?? []).map((task: any) => ({
    id: task.id,
    status: task.status,
    importance: task.importance,
    priorityScore: task.priority_score,
    plannedDate: task.planned_date,
    estimatedMinutes: task.estimated_minutes,
    completedMinutes: task.task_progress?.[0]?.completed_minutes ?? 0,
    createdAt: task.created_at,
    isRevision: Boolean(task.revision_schedule_id),
    revisionUrgency: adaptive.allAdaptiveRevisions.find((row: any) => row.id === task.revision_schedule_id)?.urgency ?? null,
    masteryLevel: (adaptiveMap.get(task.id) as any)?.masteryLevel ?? null,
    topicState: (adaptiveMap.get(task.id) as any)?.topicState ?? null,
  }));
  let recommendation: null | { taskId: string; title: string; reason: string; remainingMinutes: number } = null;
  try {
    const selected = getNextBestTask(mapped, { today: date, availableMinutes: adaptive.dayCapacities[date] ?? 0 });
    const task = (tasksResult.data ?? []).find((row) => row.id === selected.recommendedTask.id);
    if (task) recommendation = { taskId: task.id, title: task.title, reason: selected.reason, remainingMinutes: selected.remainingMinutes };
  } catch {
    recommendation = null;
  }
  const todayTasks = (tasksResult.data ?? []).filter((task) => task.planned_date === date &&
    ["planned", "ready", "in_progress", "partially_completed", "rescheduled"].includes(task.status));
  return {
    date,
    taskCount: todayTasks.length,
    totalMinutes: sum(todayTasks, "estimated_minutes"),
    capacityMinutes: adaptive.dayCapacities[date] ?? 0,
    tasks: todayTasks,
    recommendation,
  };
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

export const formatMinutes = (minutes: number) => `${Math.floor(minutes/60)}s ${minutes%60}dk`;
export const weeklyReportMessage = (report: any) => `Haftalık özet\n\n${formatMinutes(report.actual_minutes)} / ${formatMinutes(report.planned_minutes)}\n${report.completed_task_count} / ${report.planned_task_count} görev\n${report.question_count} soru\n${report.completed_topic_count} konu\n${report.revision_completed_count} / ${report.revision_due_count} tekrar\n\nDurum: ${String(report.plan_status).toLocaleUpperCase("tr-TR")}`;
