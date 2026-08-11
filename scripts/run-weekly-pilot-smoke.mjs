import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { readLocalSupabaseStatus } from "./supabase-status.mjs";

const EDITION = "11000000-0000-0000-0000-000000000001";
const MATH = "20000000-0000-0000-0000-000000000002";
const TURKISH = "20000000-0000-0000-0000-000000000001";
const { url, anonKey } = readLocalSupabaseStatus();
const api = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const id = randomUUID();
const sign = await api.auth.signUp({ email: `weekly-pilot-${id}@example.test`, password: `Safe-${id}` });
if (sign.error) throw sign.error;
const user = sign.data.user.id;
const token = sign.data.session.access_token;
const profile = await api.from("exam_profiles").insert({ user_id: user, exam_edition_id: EDITION, preparation_start_date: "2026-08-01", target_exam_date: "2027-08-01", status: "active" }).select("id").single();
if (profile.error) throw profile.error;
for (const subjectId of [MATH, TURKISH]) {
  const selected = await api.from("user_subjects").insert({ user_id: user, exam_profile_id: profile.data.id, subject_id: subjectId, status: "active" });
  if (selected.error) throw selected.error;
  const initialized = await api.rpc("initialize_subject_progress", { p_exam_profile_id: profile.data.id, p_subject_id: subjectId });
  if (initialized.error) throw initialized.error;
}
const istanbulToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
const addDateDays = (date, days) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
const isoWeekday = (date) => {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
};
const runtimeToday = istanbulToday();
const runtimeWeekday = isoWeekday(runtimeToday);
const sourceDate = runtimeWeekday === 7 ? addDateDays(runtimeToday, -1) : runtimeToday;
const targetDate = runtimeWeekday === 7 ? runtimeToday : addDateDays(runtimeToday, 1);
const availability = await api.from("weekly_availability").insert([
  { user_id: user, exam_profile_id: profile.data.id, weekday: isoWeekday(sourceDate), start_time: "14:00", end_time: "18:00" },
  { user_id: user, exam_profile_id: profile.data.id, weekday: isoWeekday(targetDate), start_time: "14:00", end_time: "18:00" },
]);
if (availability.error) throw availability.error;
const resource = await api.from("resources").insert({ user_id: user, exam_profile_id: profile.data.id, subject_id: MATH, name: "Pilot Matematik Kitabı", resource_type: "question_bank", resource_role: "primary", difficulty: "normal", status: "active" }).select("id").single();
if (resource.error) throw resource.error;

const base = `${url}/functions/v1/app-api`;
async function http(path, { method = "GET", body } = {}) {
  const response = await fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${token}`, apikey: anonKey, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

const options = await http("/weekly-plan/options");
if (options.availableMinutes !== 480) throw new Error(`expected 480 available minutes, got ${options.availableMinutes}`);
if (sourceDate < options.weekStartDate || targetDate > options.weekEndDate) throw new Error(`pilot fixture escaped current week: ${sourceDate} -> ${targetDate}`);
const saved = await http("/weekly-plan/manual", { method: "POST", body: { blocks: [
  { plannedDate: sourceDate, subjectId: MATH, workMode: "video", resourceId: null, detail: "Temel Kavramlar videosu", estimatedMinutes: 60 },
  { plannedDate: sourceDate, subjectId: MATH, workMode: "questions", resourceId: resource.data.id, detail: "Temel Kavramlar soru çözümü", estimatedMinutes: 180 },
  { plannedDate: targetDate, subjectId: TURKISH, workMode: "notes", resourceId: null, detail: "Sözcükte Anlam notu", estimatedMinutes: 60 },
] } });
const active = saved.tasks.filter((task) => task.status !== "cancelled");
if (active.length !== 3) throw new Error(`manual plan task count failed: ${active.length}`);
if (!active.some((task) => task.work_mode === "video") || !active.some((task) => task.work_mode === "questions")) throw new Error("work mode persistence failed");
const video = active.find((task) => task.work_mode === "video");
const longTask = active.find((task) => task.work_mode === "questions");
if (!video || !longTask) throw new Error("manual plan fixtures missing");

const endedAt = `${sourceDate}T17:35:00+03:00`;
const retro = await http("/study-sessions/retroactive", { method: "POST", body: { taskId: video.id, subjectId: MATH, durationMinutes: 95, endedAt, note: "Plan 60, gerçek 95" } });
if (retro.duration_minutes !== 95) throw new Error("retroactive actual duration failed");
if (!retro.replan?.decision) throw new Error("automatic study deviation replan missing");
const completedVideo = await http(`/tasks/${video.id}/complete`, { method: "POST" });
if (!completedVideo.replan?.decision) throw new Error("completion replan missing");
const current = await http("/weekly-plan/current");
const refreshedLong = current.tasks.find((task) => task.id === longTask.id);
const refreshedVideo = current.tasks.find((task) => task.id === video.id);
if (!refreshedVideo || refreshedVideo.task_progress?.[0]?.actual_study_minutes !== 95) throw new Error("actual study minutes not reflected");
if (!refreshedLong || refreshedLong.planned_date !== targetDate) throw new Error(`slow study did not move remaining task to ${targetDate}: ${JSON.stringify(refreshedLong)}`);
const next = await http("/tasks/next");
if (!next.task?.id) throw new Error("next task missing after replan");

console.log(JSON.stringify({
  WEEKLY_PILOT_SMOKE: "PASS",
  weeklyCapacityMinutes: options.availableMinutes,
  manualTaskCount: active.length,
  workModesPersisted: true,
  plannedVideoMinutes: video.estimated_minutes,
  actualVideoMinutes: refreshedVideo.task_progress[0].actual_study_minutes,
  automaticReplan: true,
  sourceDate,
  targetDate,
  movedTaskTo: refreshedLong.planned_date,
  completedSlowTask: true,
  nextTaskAvailable: true,
}, null, 2));
