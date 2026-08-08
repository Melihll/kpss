import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { readLocalSupabaseStatus } from "./supabase-status.mjs";

const { url, anonKey } = readLocalSupabaseStatus();
const client = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const unique = randomUUID();
const signup = await client.auth.signUp({
  email: `edge-${unique}@example.test`,
  password: `Safe-${unique}`,
  options: { data: { display_name: "Edge Smoke" } },
});
if (signup.error || !signup.data.user || !signup.data.session) {
  throw signup.error ?? new Error("Edge smoke signup did not return a session");
}
const userId = signup.data.user.id;
const profile = await client.from("exam_profiles").insert({
  user_id: userId,
  exam_edition_id: "11000000-0000-0000-0000-000000000001",
  preparation_start_date: "2026-08-01",
  status: "active",
}).select("id").single();
if (profile.error) throw profile.error;
const profileId = profile.data.id;
const selection = await client.from("user_subjects").insert({
  user_id: userId,
  exam_profile_id: profileId,
  subject_id: "20000000-0000-0000-0000-000000000002",
  status: "active",
});
if (selection.error) throw selection.error;
const initialization = await client.rpc("initialize_subject_progress", {
  p_exam_profile_id: profileId,
  p_subject_id: "20000000-0000-0000-0000-000000000002",
});
if (initialization.error) throw initialization.error;
const availability = await client.from("weekly_availability").insert(
  Array.from({ length: 7 }, (_, index) => ({
    user_id: userId,
    exam_profile_id: profileId,
    weekday: index + 1,
    start_time: "09:00",
    end_time: "18:00",
  })),
);
if (availability.error) throw availability.error;

const base = `${url}/functions/v1/app-api`;
async function request(path, method = "GET", body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${signup.data.session.access_token}`,
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${method} ${path} failed (${response.status}): ${JSON.stringify(payload)}`);
  return payload;
}

const built = await request("/weekly-plan/build", "POST");
if (!built.plan || built.tasks.length < 1) throw new Error("Build did not create a plan with tasks");
const current = await request("/weekly-plan/current");
if (current.plan.id !== built.plan.id) throw new Error("Current plan does not match built plan");
const next = await request("/tasks/next");
if (!next.task?.id || !next.reason) throw new Error("Next task did not return a recommendation");
const started = await request(`/tasks/${next.task.id}/start`, "POST");
if (started.status !== "in_progress") throw new Error("Recommended task did not start");

console.log(JSON.stringify({
  EDGE_SMOKE: "PASS",
  availableMinutes: built.plan.available_minutes,
  planningBudgetMinutes: built.plan.planning_budget_minutes,
  generatedTasks: built.tasks.length,
  recommendation: { taskId: next.task.id, reason: next.reason, remainingMinutes: next.remainingMinutes },
  startedStatus: started.status,
}, null, 2));
