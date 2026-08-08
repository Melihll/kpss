import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  buildWeeklyPlanV0,
  DEFAULT_RESOURCE_UNIT_MINUTES,
  getZonedDayRange,
  getZonedWeekRange,
  getNextBestTask,
  PlanningDomainError,
  type RecommendationTask,
  type WeeklyPlanningContext,
} from "../_shared/planning.bundle.js";
import { recalculateTopicMastery, revisionWithUrgency } from "../_shared/mastery.ts";
import { loadAdaptiveBase, minimumDayPlan, recalculateCurrentPlan, syllabusProjection } from "../_shared/adaptive.ts";
import { generateWeeklyReport, pilotMetrics, recordRecommendationEvent } from "../_shared/pilot.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
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
    })),
    resourceUnits: (unitsResult.data ?? []).map((unit) => ({
      id: unit.id, resourceId: unit.resource_id, sectionId: unit.resource_section_id,
      name: unit.name, unitType: unit.unit_type, sortOrder: unit.sort_order,
      estimatedMinutes: unit.estimated_minutes,
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
    .select("*, task_progress(completed_minutes), task_resource_units(id, resource_unit_id, status, completed_at, resource_units(name, unit_type, estimated_minutes))")
    .eq("weekly_plan_id", plan.id)
    .order("planned_date")
    .order("priority_score", { ascending: false });
  if (error) throw error;
  return { plan, tasks: tasks ?? [] };
}

function remainingTodayMinutes(windows: any[]) {
  const nowParts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Istanbul", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  const weekdays: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  const weekday = weekdays[nowParts.weekday] ?? 1;
  const current = Number(nowParts.hour) * 60 + Number(nowParts.minute);
  const intervals = windows.filter((window) => window.weekday === weekday && window.is_active !== false)
    .map((window) => {
      const [startHour, startMinute] = window.start_time.split(":").map(Number);
      const [endHour, endMinute] = window.end_time.split(":").map(Number);
      return { start: Math.max(current, startHour * 60 + startMinute), end: endHour * 60 + endMinute };
    }).filter((interval) => interval.end > interval.start).sort((a, b) => a.start - b.start);
  let total = 0;
  let end = -1;
  for (const interval of intervals) {
    if (interval.start > end) total += interval.end - interval.start;
    else if (interval.end > end) total += interval.end - end;
    end = Math.max(end, interval.end);
  }
  return total;
}

async function nextTask(client: SupabaseClient, profile: any, userId: string, weekStart: string) {
  const plan = await currentPlan(client, profile.id, weekStart);
  if (!plan) throw new PlanningDomainError("NO_RECOMMENDABLE_TASK");
  const [{ data: tasks, error: taskError }, { data: windows, error: windowError }] = await Promise.all([
    client.from("tasks").select("*, task_progress(completed_minutes)").eq("weekly_plan_id", plan.id),
    client.from("weekly_availability").select("weekday, start_time, end_time, is_active").eq("exam_profile_id", profile.id),
  ]);
  if (taskError) throw taskError;
  if (windowError) throw windowError;
  const adaptive = await loadAdaptiveBase(client, userId, profile, plan);
  const adaptiveMap = new Map(adaptive.adaptiveTasks.map((task: any) => [task.id, task]));
  const taskIds = (tasks ?? []).map((task) => task.id);
  const linksResult = taskIds.length
    ? await client.from("task_resource_units").select("task_id, status, resource_units(unit_type, estimated_minutes)").in("task_id", taskIds)
    : { data: [], error: null };
  if (linksResult.error) throw linksResult.error;
  const recommendationTasks: RecommendationTask[] = (tasks ?? []).map((task) => {
    const links = (linksResult.data ?? []).filter((link) => link.task_id === task.id && link.status === "pending");
    const pendingUnitMinutes = links.length
      ? links.reduce((sum, link: any) => sum + (link.resource_units?.estimated_minutes ?? DEFAULT_RESOURCE_UNIT_MINUTES[link.resource_units?.unit_type ?? "other"]), 0)
      : null;
    const signal: any = adaptiveMap.get(task.id) ?? {};
    const revision = task.revision_schedule_id
      ? adaptive.allAdaptiveRevisions.find((row: any) => row.id === task.revision_schedule_id)
      : null;
    return {
      id: task.id, status: task.status, importance: task.importance, priorityScore: task.priority_score,
      plannedDate: task.planned_date, estimatedMinutes: task.estimated_minutes,
      completedMinutes: task.task_progress?.[0]?.completed_minutes ?? 0,
      pendingUnitMinutes, createdAt: task.created_at,
      isRevision: Boolean(task.revision_schedule_id), revisionUrgency: revision?.urgency ?? null,
      masteryLevel: signal.masteryLevel ?? null, topicState: signal.topicState ?? null,
    };
  });
  const recommendation = getNextBestTask(recommendationTasks, {
    today: istanbulDate(), availableMinutes: Math.min(remainingTodayMinutes(windows ?? []), adaptive.dayCapacities[istanbulDate()] ?? 0),
  });
  const task = (tasks ?? []).find((candidate) => candidate.id === recommendation.recommendedTask.id);
  return { task, reason: recommendation.reason, remainingMinutes: recommendation.remainingMinutes };
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
    if (request.method === "GET" && route === "/tasks/next") {
      const recommendation=await nextTask(client, profile, userId, weekStart);
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
      const { data, error } = await client.from("study_sessions").select("*, tasks(title)").eq("status","active").maybeSingle();
      if (error) throw error; return json({ session: data });
    }
    if (request.method === "GET" && route === "/execution/summary") {
      const dayRange = getZonedDayRange(today);
      const weekRange = getZonedWeekRange(today);
      const [todayRows,weekRows,results] = await Promise.all([
        client.from("study_sessions").select("duration_minutes").eq("status","completed").gte("ended_at",dayRange.startUtc).lt("ended_at",dayRange.endUtc),
        client.from("study_sessions").select("duration_minutes").eq("status","completed").gte("ended_at",weekRange.startUtc).lt("ended_at",weekRange.endUtc),
        client.from("test_results").select("*, subjects(name), resource_units(name)").order("completed_at",{ascending:false}).limit(5),
      ]);
      for(const result of [todayRows,weekRows,results]) if(result.error) throw result.error;
      return json({todayStudyMinutes:(todayRows.data??[]).reduce((s,r)=>s+(r.duration_minutes??0),0),weekStudyMinutes:(weekRows.data??[]).reduce((s,r)=>s+(r.duration_minutes??0),0),recentResults:results.data??[]});
    }
    if (request.method === "POST" && route === "/study-sessions/start") {
      const body=await request.json(); const {data,error}=await client.rpc("start_study_session",{p_task_id:body.taskId,p_entry_source:body.entrySource??"web"}); if(error) throw error; return json(data,201);
    }
    if (request.method === "POST" && route === "/study-sessions/retroactive") {
      const body=await request.json(); const {data,error}=await client.rpc("record_retroactive_session",{p_payload:{...body,examProfileId:profile.id,entrySource:body.entrySource??"retroactive"}}); if(error) throw error; return json(data,201);
    }
    const sessionMatch=route.match(/^\/study-sessions\/([0-9a-f-]+)\/(finish|cancel)$/);
    if(request.method==="POST"&&sessionMatch){const rpc=sessionMatch[2]==="finish"?"finish_study_session":"cancel_study_session";const {data,error}=await client.rpc(rpc,{p_session_id:sessionMatch[1]});if(error)throw error;return json(data);}
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
