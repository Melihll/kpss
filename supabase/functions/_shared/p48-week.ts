import { buildP48WeekBlocks, calculateEffectiveDayCapacity } from "./planning.bundle.js";
import { aggregateCompletedStudySessions, aggregatePlannedCreditByDate } from "./completed-study.ts";
import { loadP48DailyCapacityOverrides, planningCapacityForDate } from "./capacity-overrides.ts";

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

const WORK_MODE_LABELS: Record<string, string> = {
  video: "Video",
  book: "Konu çalışması",
  notes: "Not",
  questions: "Soru çözümü",
  mock: "Deneme",
  review: "Tekrar",
  other: "Çalışma",
};

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function mondayOf(date: string) {
  const value = new Date(`${date}T12:00:00Z`);
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() - day + 1);
  return value.toISOString().slice(0, 10);
}

function p48Windows(rows: any[]) {
  return rows.map((row) => ({ weekday: row.weekday, start_time: row.start_time, end_time: row.end_time, is_active: row.is_active }));
}

function p48Periods(rows: any[]) {
  return rows.map((row) => ({
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

async function loadPlanWithTasks(client: any, userId: string, examProfileId: string, weekStart: string) {
  const plan = await client.from("weekly_plans").select("*")
    .eq("user_id", userId)
    .eq("exam_profile_id", examProfileId)
    .eq("week_start_date", weekStart)
    .eq("status", "active")
    .maybeSingle();
  if (plan.error) throw plan.error;
  if (!plan.data) return { plan: null, tasks: [] };
  const tasks = await client.from("tasks")
    .select("*, subjects(name), resources(name,resource_type), task_progress(completed_minutes,actual_study_minutes)")
    .eq("user_id", userId)
    .eq("weekly_plan_id", plan.data.id)
    .neq("status", "cancelled")
    .order("planned_date")
    .order("priority_score", { ascending: false });
  if (tasks.error) throw tasks.error;
  return { plan: plan.data, tasks: tasks.data ?? [] };
}

/**
 * Makes sure a P48 user has a real-resource weekly plan for the requested week.
 * It is intentionally a no-op when a plan already exists, so study progress in
 * the current week is never destroyed by the scheduler or Telegram.
 */
export async function ensureP48WeekPlanForService(
  client: any,
  userId: string,
  profile: any,
  referenceDate: string,
) {
  const strategy = await client.from("p48_strategy_profiles").select("*")
    .eq("user_id", userId)
    .eq("exam_profile_id", profile.id)
    .eq("status", "active")
    .maybeSingle();
  if (strategy.error) throw strategy.error;
  if (!strategy.data) return { configured: false, created: false, plan: null, tasks: [] };

  const weekStart = mondayOf(referenceDate);
  const current = await loadPlanWithTasks(client, userId, profile.id, weekStart);
  if (current.plan) return { configured: true, created: false, ...current };

  const [availability, periods, exceptions, targets, sessions, allocations, dailyOverrides] = await Promise.all([
    client.from("weekly_availability").select("*").eq("user_id", userId).eq("exam_profile_id", profile.id).eq("is_active", true),
    client.from("calendar_periods").select("*").eq("user_id", userId).eq("exam_profile_id", profile.id),
    client.from("schedule_exceptions").select("*").eq("user_id", userId).eq("exam_profile_id", profile.id)
      .gte("exception_date", weekStart).lte("exception_date", addDays(weekStart, 6)),
    client.from("p48_resource_targets")
      .select("planned_minutes,sequence_order,work_mode,resources(id,subject_id,name,status)")
      .eq("user_id", userId).eq("exam_profile_id", profile.id),
    client.from("study_sessions").select("resource_id,duration_minutes,started_at")
      .eq("user_id", userId).eq("exam_profile_id", profile.id).eq("status", "completed"),
    client.from("study_session_allocations")
      .select("planned_credit_minutes,study_sessions!inner(started_at)")
      .eq("user_id", userId).eq("exam_profile_id", profile.id).is("superseded_at", null),
    loadP48DailyCapacityOverrides(client, userId, profile.id, weekStart, addDays(weekStart, 6)),
  ]);
  for (const result of [availability, periods, exceptions, targets, sessions, allocations]) if (result.error) throw result.error;

  const { actualByResource } = aggregateCompletedStudySessions(sessions.data ?? []);
  const plannedCreditByDate = aggregatePlannedCreditByDate(allocations.data ?? []);

  const dayCapacities: Record<string, number> = {};
  for (let index = 0; index < 7; index += 1) {
    const date = addDays(weekStart, index);
    const capacityContext = {
      date,
      weeklyAvailability: p48Windows(availability.data ?? []),
      calendarPeriods: p48Periods(periods.data ?? []),
    };
    const baseCapacity = calculateEffectiveDayCapacity({
      ...capacityContext,
      scheduleExceptions: [],
    });
    const effectiveCapacity = calculateEffectiveDayCapacity({
      ...capacityContext,
      scheduleExceptions: p48Exceptions(exceptions.data ?? []),
    });
    const planningCapacity = planningCapacityForDate(date, effectiveCapacity, dailyOverrides, baseCapacity);
    dayCapacities[date] = date < referenceDate ? 0 : Math.max(0, planningCapacity - (plannedCreditByDate.get(date) ?? 0));
  }

  const resources = (targets.data ?? []).map((row: any) => ({
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
    currentDate: referenceDate,
    weeklyTargetMinutes: Number(strategy.data.weekly_target_minutes),
    dayCapacities,
    subjects: P48_SUBJECT_TARGETS.map((subject) => ({ ...subject })),
    resources,
  });

  const normalized = blocks.map((block: any) => ({
    plannedDate: block.plannedDate,
    subjectId: block.subjectId,
    workMode: block.workMode,
    resourceId: block.resourceId,
    estimatedMinutes: block.estimatedMinutes,
    title: block.isNewResourceWindow
      ? `${block.subjectName} · Yeni kaynak zamanı`
      : `${block.subjectName} · ${WORK_MODE_LABELS[block.workMode] ?? "Çalışma"} · ${block.resourceName}`,
    description: block.isNewResourceWindow
      ? `Mevcut P48 kaynakları tamamlandı. ${block.subjectName} için yeni kaynak/deneme seç.`
      : `Kaynak: ${block.resourceName}`,
  }));
  const availableMinutes = Object.entries(dayCapacities)
    .filter(([date]) => date >= referenceDate)
    .reduce((sum, [, minutes]) => sum + minutes, 0);

  if (availableMinutes <= 0 || normalized.length === 0) {
    return { configured: true, created: false, academicGap: true, plan: null, tasks: [], dayCapacities };
  }

  const stored = await client.rpc("service_replace_manual_weekly_plan", {
    p_user_id: userId,
    p_payload: { weekStartDate: weekStart, availableMinutes, blocks: normalized },
  });
  if (stored.error) throw stored.error;
  const created = await loadPlanWithTasks(client, userId, profile.id, weekStart);
  return { configured: true, created: true, ...created, dayCapacities };
}
