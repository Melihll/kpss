import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { readLocalSupabaseStatus } from "./supabase-status.mjs";

const MATH = "20000000-0000-0000-0000-000000000002";
const TOPIC = "30000000-0000-0000-0000-000000000001";
const { url, anonKey } = readLocalSupabaseStatus();
const api = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const unique = randomUUID();
const signup = await api.auth.signUp({ email: `tg-${unique}@example.test`, password: `Safe-${unique}` });
if (signup.error || !signup.data.session || !signup.data.user) throw signup.error ?? new Error("signup failed");
const user = signup.data.user;

const profile = await api.from("exam_profiles").insert({
  user_id: user.id,
  exam_edition_id: "11000000-0000-0000-0000-000000000001",
  preparation_start_date: "2026-08-01",
  status: "active",
}).select("id").single();
if (profile.error) throw profile.error;
await api.from("user_subjects").insert({ user_id: user.id, exam_profile_id: profile.data.id, subject_id: MATH, status: "active" });
await api.rpc("initialize_subject_progress", { p_exam_profile_id: profile.data.id, p_subject_id: MATH });
await api.from("weekly_availability").insert(Array.from({ length: 7 }, (_, index) => ({
  user_id: user.id,
  exam_profile_id: profile.data.id,
  weekday: index + 1,
  start_time: "09:00",
  end_time: "18:00",
})));
const resource = await api.from("resources").insert({
  user_id: user.id,
  exam_profile_id: profile.data.id,
  subject_id: MATH,
  name: "Telegram Test Kitabı",
  resource_type: "question_bank",
  resource_role: "primary",
  difficulty: "normal",
  status: "active",
}).select("id").single();
if (resource.error) throw resource.error;
const section = await api.from("resource_sections").insert({
  resource_id: resource.data.id,
  curriculum_node_id: TOPIC,
  name: "Temel Kavramlar",
  sort_order: 1,
}).select("id").single();
if (section.error) throw section.error;
const unit = await api.from("resource_units").insert({
  resource_id: resource.data.id,
  resource_section_id: section.data.id,
  unit_type: "test",
  name: "Telegram Test 1",
  sort_order: 1,
  question_count: 10,
  estimated_minutes: 20,
}).select("id").single();
if (unit.error) throw unit.error;

const headers = {
  Authorization: `Bearer ${signup.data.session.access_token}`,
  apikey: anonKey,
  "Content-Type": "application/json",
};
const app = async (path, method = "GET", body) => {
  const response = await fetch(`${url}/functions/v1/app-api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(payload));
  return payload;
};
const built = await app("/weekly-plan/build", "POST");
const solveTask = built.tasks.find((task) => task.task_type === "solve_resource_units");
if (!solveTask) throw new Error("solve task missing");
const link = await app("/messaging/telegram/link-token", "POST");

const telegram = async (update, { failStage, expectedStatus = 200 } = {}) => {
  const response = await fetch(`${url}/functions/v1/telegram-webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Bot-Api-Secret-Token": "local-test-secret",
      ...(failStage ? { "X-Telegram-Mock-Fail-Stage": failStage } : {}),
    },
    body: JSON.stringify(update),
  });
  const payload = await response.json();
  if (response.status !== expectedStatus) throw new Error(`Expected ${expectedStatus}, got ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
};
const scheduler = async (reference) => {
  const response = await fetch(`${url}/functions/v1/scheduler-worker`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Scheduler-Secret": "local-scheduler-secret" },
    body: JSON.stringify({ reference, limit: 100 }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`Scheduler ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
};
const telegramNumericId = 1_000_000_000 + Number.parseInt(unique.slice(0, 7), 16);
const from = { id: telegramNumericId, username: "pilot" };
const chat = { id: telegramNumericId };
let updateId = telegramNumericId * 10;
const message = (text) => ({ update_id: ++updateId, message: { message_id: updateId, from, chat, text } });
const callback = (data) => ({
  update_id: ++updateId,
  callback_query: { id: `cb-${updateId}`, from, message: { message_id: updateId, chat }, data },
});

const linked = await telegram(message(`/start ${link.token}`));
if (!linked.outbound.text.includes("bağlandı")) throw new Error("link failed");
const identity = await api.from("messaging_identities").select("external_user_id").single();
if (identity.data?.external_user_id !== String(from.id)) throw new Error("identity missing");
const today = await telegram(message("/bugun"));
if (!today.outbound.text.includes("Bugünkü planın")) throw new Error("bugun failed");
const now = await telegram(message("/simdi"));
if (!now.recommendation?.taskId) throw new Error("simdi failed");

const startUpdate = callback(`task_start:${solveTask.id}`);
const failedBeforeBusiness = await telegram(startUpdate, { failStage: "before-business", expectedStatus: 400 });
if (failedBeforeBusiness.error !== "MOCK_FAILURE_BEFORE_BUSINESS") throw new Error("before-business failure was not recorded");
const started = await telegram(startUpdate);
if (started.session.status !== "active") throw new Error("callback start failed");
const duplicate = await telegram(startUpdate);
if (!duplicate.duplicate) throw new Error("retry was not deduplicated");
const activeCount = await api.from("study_sessions").select("id", { count: "exact", head: true }).eq("status", "active");
if (activeCount.count !== 1) throw new Error("retry created duplicate active sessions");

const finishUpdate = callback(`session_finish:${started.session.id}`);
const failedAfterBusiness = await telegram(finishUpdate, { failStage: "after-business", expectedStatus: 400 });
if (failedAfterBusiness.error !== "MOCK_FAILURE_AFTER_BUSINESS") throw new Error("after-business failure was not recorded");
const storedAfterFailure = await api.from("study_sessions").select("status,duration_minutes").eq("id", started.session.id).single();
if (storedAfterFailure.data?.status !== "completed") throw new Error("business mutation did not commit before delivery failure");
const minutesBeforeRetry = (await api.from("task_progress").select("actual_study_minutes").eq("task_id", solveTask.id).single()).data?.actual_study_minutes;
const finished = await telegram(finishUpdate);
if (finished.session.status !== "completed") throw new Error("finish failed");
const minutesAfterRetry = (await api.from("task_progress").select("actual_study_minutes").eq("task_id", solveTask.id).single()).data?.actual_study_minutes;
if (minutesAfterRetry !== minutesBeforeRetry) throw new Error("delivery retry duplicated business accounting");
const completedDuplicate = await telegram(finishUpdate);
if (!completedDuplicate.duplicate) throw new Error("completed event was not a no-op");

await telegram(callback(`result_begin:${solveTask.id}`));
await telegram(message("7"));
await telegram(message("2"));
const preview = await telegram(message("1"));
if (!preview.outbound.text.includes("Toplam 10")) throw new Error("result preview failed");
const saved = await telegram(callback("result_save"));
if (saved.result.review_status !== "pending" || saved.result.total_questions !== 10) throw new Error("result save failed");
const reviewed = await telegram(callback(`result_review:${saved.result.id}`));
if (reviewed.result.review_status !== "reviewed") throw new Error("review failed");

const evidence = await app("/test-results", "POST", {
  subjectId: MATH, curriculumNodeId: TOPIC, correct: 10, wrong: 0, blank: 0, total: 10,
  idempotencyKey: `telegram-mastery-${unique}`,
});
if (evidence.mastery?.assessment?.resulting_mastery_level !== "strong" || !evidence.mastery?.revision) {
  throw new Error(`Telegram mastery setup failed: ${JSON.stringify(evidence)}`);
}
const dueDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
const dueSetup = await api.rpc("apply_topic_mastery_assessment", { p_payload: {
  examProfileId: profile.data.id, curriculumNodeId: TOPIC, triggerType: "manual_recalculation",
  sourceTestResultId: null, sourceResultUpdatedAt: null,
  sampleQuestionCount: 20, sampleCorrectCount: 17, sampleWrongCount: 2, sampleBlankCount: 1,
  previousMasteryLevel: "strong", resultingMasteryLevel: "strong", resultingTopicState: "learned",
  assessmentReason: "CONSISTENT_STRONG_RESULTS",
  revision: { shouldSchedule: true, scheduledFor: dueDate, revisionType: "short_review", estimatedMinutes: 15, reason: "TELEGRAM_DUE_FIXTURE" },
} });
if (dueSetup.error) throw dueSetup.error;
const specialMenu = await telegram(message("/ozel"));
const lessCallback = specialMenu.outbound.reply_markup.inline_keyboard[0][0].callback_data;
await telegram(callback(lessCallback));
const specialApplied = await telegram(message("90"));
if (!specialApplied.outbound.text.includes("→ 90 dk") || !specialApplied.replan?.revision) throw new Error("special situation replan failed");
const minimumPlan = await telegram(message("/minimum"));
if (!minimumPlan.minimum || minimumPlan.minimum.totalMinutes > 90) throw new Error("minimum plan failed");
const adaptiveNow = await telegram(message("/simdi"));
if (!["due_revision", "weak_topic", "critical_revision"].includes(adaptiveNow.recommendation?.reason)) throw new Error(`adaptive simdi failed: ${JSON.stringify(adaptiveNow)}`);
const repeatList = await telegram(message("/tekrar"));
const completeData = repeatList.outbound.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data;
if (!repeatList.outbound.text.includes("Bugünkü tekrarların") || !completeData?.startsWith("revision_complete:")) throw new Error("tekrar list failed");
const completeUpdate = callback(completeData);
const repeatCompleted = await telegram(completeUpdate);
if (repeatCompleted.revision.status !== "completed") throw new Error("revision callback failed");
const repeatDuplicate = await telegram(completeUpdate);
if (!repeatDuplicate.duplicate) throw new Error("revision callback retry was not deduplicated");
const storedRevision = await api.from("revision_schedules").select("status,completed_at").eq("id", evidence.mastery.revision.id).single();
if (storedRevision.data?.status !== "completed" || !storedRevision.data.completed_at) throw new Error("revision completion was not persisted");

const manual = await telegram(message("/calisma_ekle"));
const subjectCallback = manual.outbound.reply_markup.inline_keyboard[0][0].callback_data;
await telegram(callback(subjectCallback));
const retroactive = await telegram(message("35"));
if (retroactive.session.duration_minutes !== 35 || retroactive.session.entry_source !== "telegram") throw new Error("manual log failed");

const calendarToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
await scheduler(`${calendarToday}T12:00:00+03:00`);
const openGap = await api.from("data_gap_events").select("*").eq("status", "open").order("gap_date", { ascending: false }).limit(1).single();
if (openGap.error || !openGap.data.notified_at) throw openGap.error ?? new Error("data gap notification missing");
const noStudy = await telegram(callback(`gap_no_study:${openGap.data.id}`));
if (noStudy.dataGap?.resolution_result !== "confirmed_no_study") throw new Error("data gap no-study callback failed");

const referenceDate = new Date(`${calendarToday}T12:00:00Z`);
referenceDate.setUTCDate(referenceDate.getUTCDate() - 1);
const previousDate = referenceDate.toISOString().slice(0, 10);
await scheduler(`${previousDate}T12:00:00+03:00`);
const addGap = await api.from("data_gap_events").select("*").eq("status", "open").order("gap_date", { ascending: false }).limit(1).single();
if (addGap.error) throw addGap.error;
const addBegin = await telegram(callback(`gap_add_study:${addGap.data.id}`));
const gapSubjectData = addBegin.outbound.reply_markup.inline_keyboard[0][0].callback_data;
await telegram(callback(gapSubjectData));
const gapStudy = await telegram(message("25"));
if (gapStudy.session.duration_minutes !== 25 || !gapStudy.session.ended_at.startsWith(addGap.data.gap_date)) throw new Error("data gap retroactive date flow failed");
const resolvedGap = await api.from("data_gap_events").select("status,resolution_result").eq("id", addGap.data.id).single();
if (resolvedGap.data?.status !== "resolved" || resolvedGap.data.resolution_result !== "study_added") throw new Error("data gap study resolution missing");

const sunday = new Date(`${calendarToday}T12:00:00Z`);
const isoDay = sunday.getUTCDay() || 7;
sunday.setUTCDate(sunday.getUTCDate() - isoDay - 6);
const previousSunday = sunday.toISOString().slice(0, 10);
await scheduler(`${previousSunday}T20:00:00+03:00`);
const weeklyAction = await api.from("scheduled_actions").select("result_payload,dedupe_key").eq("action_type", "weekly_report").eq("status", "completed").limit(1).single();
if (weeklyAction.error || weeklyAction.data.result_payload?.notification !== "sent" || !weeklyAction.data.result_payload?.outbound?.text?.includes("Haftalık özet")) throw weeklyAction.error ?? new Error("weekly report Telegram send missing");
const actionCountBefore = (await api.from("scheduled_actions").select("id", { count: "exact", head: true })).count;
await scheduler(`${previousSunday}T20:00:00+03:00`);
const actionCountAfter = (await api.from("scheduled_actions").select("id", { count: "exact", head: true })).count;
if (actionCountAfter !== actionCountBefore) throw new Error("scheduler retry created duplicate actions");

console.log(JSON.stringify({
  TELEGRAM_SMOKE: "PASS",
  planId: built.plan.id,
  linked: true,
  bugun: true,
  recommendation: now.recommendation,
  sessionStarted: true,
  sessionFinishedMinutes: finished.session.duration_minutes,
  resultRecorded: "7D/2Y/1B",
  wrongReview: "reviewed",
  tekrarListed: true,
  revisionCompleted: true,
  revisionCallbackDeduplicated: true,
  specialSituationReplanned: true,
  minimumPlanMinutes: minimumPlan.minimum.totalMinutes,
  adaptiveRecommendation: adaptiveNow.recommendation.reason,
  manualStudyMinutes: retroactive.session.duration_minutes,
  dataGapNoStudyResolved: true,
  dataGapStudyAdded: true,
  weeklyReportSent: true,
  schedulerNotificationDeduplicated: true,
  retryDeduplicated: true,
  retryBeforeBusinessRecovered: true,
  retryAfterBusinessDidNotMutate: true,
  completedEventNoOp: true,
  transport: "mock",
}, null, 2));
