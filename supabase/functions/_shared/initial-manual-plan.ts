import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const statuses: Record<string, number> = {
  UNAUTHORIZED: 401, EXAM_PROFILE_NOT_FOUND: 404, INVALID_INITIAL_PLAN_PAYLOAD: 422,
  INITIAL_PLAN_UNAVAILABLE: 503, PLAN_ALREADY_EXISTS: 409, PROTECTED_COMMITMENT_EXISTS: 409,
  FIRST_PLAN_STALE: 409, REVIEW_PAYLOAD_MISMATCH: 409, FIRST_PLAN_NOT_READY: 422,
  IDEMPOTENCY_CONFLICT: 409,
};

// Dispatch after JWT verification, before the legacy active-profile guard. RPCs independently bind auth.uid().
export async function initialManualPlanRoute(
  request: Request, route: string, client: SupabaseClient,
  json: (body: unknown, status?: number) => Response,
): Promise<Response | null> {
  if (!["/initial-plan/readiness", "/initial-plan/preview", "/initial-plan/create", "/initial-plan/operation"].includes(route)) return null;
  try {
    const url = new URL(request.url);
    const body = request.method === "POST" ? await request.json() : null;
    const profileId = body?.profileId ?? url.searchParams.get("profileId");
    if (typeof profileId !== "string" || !UUID.test(profileId)) throw Error("INVALID_INITIAL_PLAN_PAYLOAD");
    let result;
    if (request.method === "GET" && route === "/initial-plan/operation") {
      const op = url.searchParams.get("operationId");
      if (!op || !UUID.test(op)) throw Error("INVALID_INITIAL_PLAN_PAYLOAD");
      result = await client.rpc("initial_manual_plan_operation", { p_exam_profile_id: profileId, p_operation_id: op });
    } else if (request.method === "GET" && route === "/initial-plan/readiness") {
      const week = url.searchParams.get("weekStartDate");
      if (!week || !DATE.test(week)) throw Error("INVALID_INITIAL_PLAN_PAYLOAD");
      result = await client.rpc("initial_manual_plan_readiness", { p_exam_profile_id: profileId, p_week_start: week });
    } else if (request.method === "POST" && route === "/initial-plan/preview") {
      if (Object.keys(body).some(k => !["profileId", "weekStartDate", "blocks"].includes(k)) || !DATE.test(body.weekStartDate)) throw Error("INVALID_INITIAL_PLAN_PAYLOAD");
      result = await client.rpc("preview_initial_manual_plan", { p_exam_profile_id: profileId, p_week_start: body.weekStartDate, p_blocks: body.blocks });
    } else if (request.method === "POST" && route === "/initial-plan/create") {
      result = await client.rpc("create_initial_manual_plan", { p_payload: body });
    } else return json({ error: { code: "NOT_FOUND" } }, 404);
    if (result.error) {
      if (["PGRST202", "42883", "42P01"].includes(result.error.code)) throw Error("INITIAL_PLAN_UNAVAILABLE");
      throw result.error;
    }
    if (result.data?.contractVersion !== "initial-manual-plan-v1") throw Error("INITIAL_PLAN_UNAVAILABLE");
    return json(result.data, route === "/initial-plan/create" ? 201 : 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? "");
    const code = Object.keys(statuses).find(k => message.includes(k)) ?? "INITIAL_PLAN_FAILED";
    return json({ error: { code, message: code } }, statuses[code] ?? 500);
  }
}

export async function hasInitialManualPlan(client: SupabaseClient, profileId: string, planId?: string) {
  let query = client.from("initial_manual_plan_receipts").select("weekly_plan_id").eq("exam_profile_id", profileId);
  if (planId) query = query.eq("weekly_plan_id", planId);
  const r = await query.maybeSingle();
  // Old backend/DB compatibility: this optional read must not break existing pilots.
  if (r.error && ["42P01", "PGRST205"].includes(r.error.code)) return null;
  if (r.error) throw r.error;
  return r.data;
}

// Factual projection only. It neither generates tasks nor invokes a legacy JS planner.
export async function initialManualToday(
  client: SupabaseClient, profileId: string, today: string, week: string,
  presentPlan: (plan: any) => Promise<any>,
) {
  const receipt = await hasInitialManualPlan(client, profileId);
  if (!receipt) return { supported: false };
  const planResult = await client.from("weekly_plans").select("*").eq("id", receipt.weekly_plan_id).eq("exam_profile_id", profileId).single();
  if (planResult.error) throw planResult.error;
  const actual = await presentPlan(planResult.data);
  const [capacity, progress, sessions] = await Promise.all([
    client.rpc("study_capacity_readiness", { p_exam_profile_id: profileId, p_week_start: week }),
    client.from("task_progress").select("task_id,completed_minutes").in("task_id", actual.tasks.map((t: any) => t.id)),
    client.from("study_sessions").select("started_at,duration_minutes").eq("exam_profile_id", profileId).eq("status", "completed"),
  ]);
  for (const r of [capacity, progress, sessions]) if (r.error) throw r.error;
  const remaining = new Map((progress.data ?? []).map((p: any) => [p.task_id, p.completed_minutes]));
  const todayTasks = actual.tasks.filter((t: any) => t.planned_date === today && !["cancelled", "missed"].includes(t.status));
  const open = todayTasks.filter((t: any) => t.status !== "completed").map((t: any) => ({ id: t.id, minutes: Math.max(0, t.estimated_minutes - Number(remaining.get(t.id) ?? 0)) }));
  const total = open.reduce((s: number, t: any) => s + t.minutes, 0);
  const dateOf = (value: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date(value));
  const completed = sessions.data ?? [];
  const studied = completed.filter(s => dateOf(s.started_at) === today).reduce((s, t) => s + (t.duration_minutes ?? 0), 0);
  const weekEnd = new Date(week + "T12:00:00Z"); weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  const cap = Number(capacity.data.dayCapacities?.[today] ?? 0);
  const upcoming = actual.tasks.filter((t: any) => t.planned_date > today && !["cancelled", "missed", "completed"].includes(t.status));
  return {
    supported: true, plan: actual.plan, tasks: actual.tasks,
    upcomingStartDate: upcoming.map((t: any) => t.planned_date).sort()[0] ?? null,
    summary: {
      todayStudyMinutes: studied,
      weekStudyMinutes: completed.filter(s => dateOf(s.started_at) >= week && dateOf(s.started_at) <= weekEnd.toISOString().slice(0, 10)).reduce((s, t) => s + (t.duration_minutes ?? 0), 0),
      dailyPlan: { date: today, tasks: open, completedTaskIds: todayTasks.filter((t: any) => t.status === "completed").map((t: any) => t.id), deferredTaskCount: 0, deferredMinutes: 0, capacityMinutes: cap, remainingCapacityMinutes: Math.max(0, cap - total), totalMinutes: total, totalCommittedMinutes: total + studied },
    },
  };
}
