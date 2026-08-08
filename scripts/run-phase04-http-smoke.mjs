import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { readLocalSupabaseStatus } from "./supabase-status.mjs";

const EDITION = "11000000-0000-0000-0000-000000000001";
const MATH = "20000000-0000-0000-0000-000000000002";
const TOPIC = "30000000-0000-0000-0000-000000000001";
const { url, anonKey } = readLocalSupabaseStatus();
const api = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const unique = randomUUID();
const signup = await api.auth.signUp({ email: `phase04-http-${unique}@example.test`, password: `Safe-${unique}` });
if (signup.error || !signup.data.session || !signup.data.user) throw signup.error ?? new Error("signup failed");
const user = signup.data.user;
const token = signup.data.session.access_token;
const base = `${url}/functions/v1/app-api`;

async function http(path, { method = "GET", body, authenticated = true } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(authenticated ? { Authorization: `Bearer ${token}` } : {}),
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, payload: await response.json() };
}

function expectResponse(result, status, code) {
  if (result.response.status !== status || (code && result.payload.error?.code !== code)) {
    throw new Error(`Expected ${status}${code ? ` ${code}` : ""}, got ${result.response.status}: ${JSON.stringify(result.payload)}`);
  }
  return result.payload;
}

const preflight = await fetch(`${base}/test-results/00000000-0000-0000-0000-000000000000`, {
  method: "OPTIONS",
  headers: { Origin: "http://127.0.0.1:5173", "Access-Control-Request-Method": "PATCH" },
});
if (!preflight.headers.get("Access-Control-Allow-Methods")?.split(/,\s*/).includes("PATCH")) {
  throw new Error("PATCH is missing from CORS preflight");
}
expectResponse(await http("/study-sessions/active", { authenticated: false }), 401);

const profile = await api.from("exam_profiles").insert({
  user_id: user.id,
  exam_edition_id: EDITION,
  preparation_start_date: "2026-08-01",
  status: "active",
}).select("id").single();
if (profile.error) throw profile.error;
await api.from("user_subjects").insert({ user_id: user.id, exam_profile_id: profile.data.id, subject_id: MATH, status: "active" });
const initialized = await api.rpc("initialize_subject_progress", { p_exam_profile_id: profile.data.id, p_subject_id: MATH });
if (initialized.error) throw initialized.error;
await api.from("weekly_availability").insert(Array.from({ length: 7 }, (_, index) => ({
  user_id: user.id,
  exam_profile_id: profile.data.id,
  weekday: index + 1,
  start_time: "09:00",
  end_time: "18:00",
})));

async function createTestResource(name, role) {
  const resource = await api.from("resources").insert({
    user_id: user.id,
    exam_profile_id: profile.data.id,
    subject_id: MATH,
    name,
    resource_type: "question_bank",
    resource_role: role,
    difficulty: "normal",
    status: "active",
  }).select("id").single();
  if (resource.error) throw resource.error;
  const section = await api.from("resource_sections").insert({
    resource_id: resource.data.id,
    curriculum_node_id: TOPIC,
    name: `${name} Section`,
    sort_order: 1,
  }).select("id").single();
  if (section.error) throw section.error;
  const unit = await api.from("resource_units").insert({
    resource_id: resource.data.id,
    resource_section_id: section.data.id,
    unit_type: "test",
    name: `${name} Unit`,
    sort_order: 1,
    question_count: 10,
    estimated_minutes: 20,
  }).select("id").single();
  if (unit.error) throw unit.error;
  return { resourceId: resource.data.id, unitId: unit.data.id };
}

const primary = await createTestResource("HTTP Primary", "primary");
const other = await createTestResource("HTTP Other", "reinforcement");
const built = expectResponse(await http("/weekly-plan/build", { method: "POST" }), 201);
const solveTask = built.tasks.find((task) => task.task_type === "solve_resource_units" && task.resource_id === primary.resourceId);
if (!solveTask) throw new Error("primary solve task missing");

const otherTask = await api.from("tasks").insert({
  user_id: user.id,
  exam_profile_id: profile.data.id,
  weekly_plan_id: built.plan.id,
  subject_id: MATH,
  curriculum_node_id: TOPIC,
  resource_id: other.resourceId,
  task_type: "solve_resource_units",
  title: "HTTP Other Solve",
  planned_date: new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date()),
  estimated_minutes: 20,
  importance: "optional",
  priority_score: 10,
  status: "ready",
  source_reason: "resource_progress",
  dedupe_key: `http-other-${unique}`,
}).select("id").single();
if (otherTask.error) throw otherTask.error;
await api.from("task_progress").insert({ user_id: user.id, task_id: otherTask.data.id });
await api.from("task_resource_units").insert({ user_id: user.id, task_id: otherTask.data.id, resource_unit_id: other.unitId });

const started = expectResponse(await http("/study-sessions/start", { method: "POST", body: { taskId: solveTask.id } }), 201);
expectResponse(await http("/study-sessions/start", { method: "POST", body: { taskId: otherTask.data.id } }), 409, "ACTIVE_SESSION_EXISTS");
const active = expectResponse(await http("/study-sessions/active"), 200);
if (active.session?.id !== started.id) throw new Error("active session was not restored through HTTP");
const finished = expectResponse(await http(`/study-sessions/${started.id}/finish`, { method: "POST" }), 200);
if (finished.status !== "completed" || finished.duration_minutes < 1) throw new Error("session finish failed");
const actual = await api.from("task_progress").select("actual_study_minutes").eq("task_id", solveTask.id).single();
if (actual.error || actual.data.actual_study_minutes !== finished.duration_minutes) throw new Error("actual study minutes not applied");

const retroactive = expectResponse(await http("/study-sessions/retroactive", {
  method: "POST",
  body: { subjectId: MATH, curriculumNodeId: TOPIC, durationMinutes: 35 },
}), 201);
if (retroactive.duration_minutes !== 35) throw new Error("retroactive session failed");

expectResponse(await http("/test-results", {
  method: "POST",
  body: { subjectId: MATH, correct: 7, wrong: 2, blank: 1, total: 9 },
}), 400, "INVALID_TEST_RESULT_TOTAL");
expectResponse(await http("/test-results", {
  method: "POST",
  body: {
    taskId: solveTask.id,
    subjectId: MATH,
    curriculumNodeId: TOPIC,
    resourceId: other.resourceId,
    resourceUnitId: other.unitId,
    correct: 7,
    wrong: 2,
    blank: 1,
    total: 10,
    idempotencyKey: `mismatch-${unique}`,
  },
}), 400, "RESOURCE_UNIT_NOT_LINKED_TO_TASK");

const result = expectResponse(await http("/test-results", {
  method: "POST",
  body: {
    taskId: solveTask.id,
    subjectId: MATH,
    curriculumNodeId: TOPIC,
    resourceId: primary.resourceId,
    resourceUnitId: primary.unitId,
    correct: 7,
    wrong: 2,
    blank: 1,
    total: 10,
    durationMinutes: 20,
    idempotencyKey: `valid-${unique}`,
  },
}), 201);
const corrected = expectResponse(await http(`/test-results/${result.id}`, {
  method: "PATCH",
  body: { correct: 8, wrong: 1, blank: 1, total: 10, durationMinutes: 18 },
}), 200);
if (Number(corrected.accuracy) !== 0.8 || corrected.duration_minutes !== 18) throw new Error("correction failed");
const reviewed = expectResponse(await http(`/test-results/${result.id}/review`, { method: "POST" }), 200);
if (reviewed.review_status !== "reviewed") throw new Error("wrong review failed");
const summary = expectResponse(await http("/execution/summary"), 200);
const recent = summary.recentResults.find((candidate) => candidate.id === result.id);
if (!recent || Number(recent.accuracy) !== 0.8 || recent.review_status !== "reviewed") throw new Error("corrected result missing from summary");

console.log(JSON.stringify({
  PHASE04_HTTP_SMOKE: "PASS",
  corsPatch: true,
  unauthorized: true,
  activeSessionConflict: true,
  liveSessionMinutes: finished.duration_minutes,
  retroactiveMinutes: retroactive.duration_minutes,
  invalidResultMapped: true,
  taskUnitMismatchRejected: true,
  correctionAccuracy: Number(corrected.accuracy),
  wrongReview: reviewed.review_status,
}, null, 2));
