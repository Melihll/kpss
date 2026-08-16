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
const responseJson = async (response, label) => {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} returned non-JSON ${response.status}: ${text.slice(0, 300)}`);
  }
};
const app = async (path, method = "GET", body) => {
  const response = await fetch(`${url}/functions/v1/app-api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = await responseJson(response, `app-api ${method} ${path}`);
  if (!response.ok) throw new Error(JSON.stringify(payload));
  return payload;
};
const built = await app("/weekly-plan/build", "POST");
const solveTask = built.tasks.find((task) => task.task_type === "solve_resource_units");
const learnTask = built.tasks.find((task) => task.task_type === "learn_topic");
if (!solveTask) throw new Error("solve task missing");
if (!learnTask) throw new Error("learn task missing");
const link = await app("/messaging/telegram/link-token", "POST");

const telegram = async (update, { failStage, failCard = false, expectedStatus = 200 } = {}) => {
  const response = await fetch(`${url}/functions/v1/telegram-webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Bot-Api-Secret-Token": "local-test-secret",
      ...(failStage ? { "X-Telegram-Mock-Fail-Stage": failStage } : {}),
      ...(failCard ? { "X-Telegram-Mock-Fail-Card": "true" } : {}),
    },
    body: JSON.stringify(update),
  });
  const payload = await responseJson(response, `telegram update ${update.update_id}`);
  if (response.status !== expectedStatus) throw new Error(`Expected ${expectedStatus}, got ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
};
const scheduler = async (reference) => {
  const response = await fetch(`${url}/functions/v1/scheduler-worker`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Scheduler-Secret": "local-scheduler-secret" },
    body: JSON.stringify({ reference, limit: 100 }),
  });
  const payload = await responseJson(response, `scheduler ${reference}`);
  if (!response.ok) throw new Error(`Scheduler ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
};
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const shiftDate = (date, days) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
const waitForScheduledAction = async ({ reference, dedupeKey, timeoutMs = 60_000, intervalMs = 100 }) => {
  const deadline = Date.now() + timeoutMs;
  let lastState = null;
  while (Date.now() < deadline) {
    const action = await api.from("scheduled_actions")
      .select("id,user_id,exam_profile_id,action_type,status,attempt_count,last_error,result_payload,dedupe_key")
      .eq("user_id", user.id)
      .eq("exam_profile_id", profile.data.id)
      .eq("dedupe_key", dedupeKey)
      .maybeSingle();
    if (action.error) throw new Error(`scheduled action lookup ${dedupeKey}: ${action.error.code} ${action.error.message}`);
    lastState = action.data;
    if (action.data?.status === "completed") return action.data;
    if (action.data?.status === "failed" && Number(action.data.attempt_count ?? 0) >= 3) {
      throw new Error(`scheduled action permanently failed ${dedupeKey}: ${action.data.last_error ?? "UNKNOWN"}`);
    }
    await scheduler(reference);
    await delay(intervalMs);
  }
  throw new Error(`scheduled action timeout ${dedupeKey}: ${JSON.stringify(lastState)}`);
};
const telegramNumericId = 1_000_000_000 + Number.parseInt(unique.slice(0, 7), 16);
const from = { id: telegramNumericId, username: "pilot" };
const chat = { id: telegramNumericId };
let updateId = telegramNumericId * 10;
const message = (text) => ({ update_id: ++updateId, message: { message_id: updateId, from, chat, text } });
const callback = (data, { photo = false } = {}) => ({
  update_id: ++updateId,
  callback_query: {
    id: `cb-${updateId}`,
    from,
    message: { message_id: updateId, chat, ...(photo ? { photo: [{ file_id: `photo-${updateId}`, width: 1080, height: 1080 }] } : {}) },
    data,
  },
});

const linkUpdate = message(`/start ${link.token}`);
const failedLinked = await telegram(linkUpdate, { failStage: "after-business", expectedStatus: 400 });
if (failedLinked.error !== "MOCK_FAILURE_AFTER_BUSINESS") throw new Error(`link post-business failure was not checkpointed: ${JSON.stringify(failedLinked)}`);
const identityAfterLinkMutation = await api.from("messaging_identities").select("external_user_id", { count: "exact" }).eq("user_id", user.id).eq("external_user_id", String(from.id)).single();
if (identityAfterLinkMutation.data?.external_user_id !== String(from.id) || identityAfterLinkMutation.count !== 1) throw new Error(`link business mutation was not committed exactly once: ${JSON.stringify(identityAfterLinkMutation)}`);
const linked = await telegram(linkUpdate);
if (!linked.outbound.text.includes("bağlandı")) throw new Error("link failed");
if (linked.recovered || linked.ok !== true) throw new Error(`link success was hidden by fallback: ${JSON.stringify(linked)}`);
const linkRetry = await telegram(linkUpdate);
if (!linkRetry.duplicate || linkRetry.outbound) throw new Error(`link retry was not lifecycle-idempotent: ${JSON.stringify(linkRetry)}`);
const identity = await api.from("messaging_identities").select("external_user_id", { count: "exact" }).eq("user_id", user.id).eq("external_user_id", String(from.id)).single();
if (identity.data?.external_user_id !== String(from.id)) throw new Error("identity missing");
if (identity.count !== 1) throw new Error(`link retry created duplicate identities: ${JSON.stringify(identity)}`);
if (process.env.TELEGRAM_SMOKE_LINK_ONLY === "true") {
  console.log(JSON.stringify({ TELEGRAM_LINK_SMOKE: "PASS", identityCreatedOnce: true, checkpointRetryDeliveredSuccess: true, duplicateRetryNoOp: true }, null, 2));
  process.exit(0);
}
const greeting = await telegram(message("Merhaba"));
if (!greeting.outbound.text.includes("en iyi sonraki adımı") || greeting.outbound.reply_markup.inline_keyboard.flat().length !== 4) throw new Error("friendly greeting failed");
const today = await telegram(message("/bugun"));
if (today.outbound.method !== "sendPhoto" || !today.outbound.visual || today.outbound.caption !== "Bugünün planı hazır." || !(today.summary?.taskCount > 0)) throw new Error(`bugun actionable visual plan failed: ${JSON.stringify(today)}`);
const todayFallback = await telegram(message("/bugun"), { failCard: true });
if (todayFallback.outbound.method !== "sendMessage" || !todayFallback.outbound.visualFallback || !todayFallback.outbound.text.includes("Bugün")) throw new Error("daily visual renderer fallback failed");
const now = await telegram(message("/simdi"));
if (!now.recommendation?.taskId || now.outbound.method !== "sendPhoto" || now.outbound.caption !== "Şimdi başlayabilirsin.") throw new Error("simdi visual recommendation failed");
const naturalNow = await telegram(message("Ne çalışayım?"));
if (!naturalNow.recommendation?.taskId) throw new Error("natural-language now intent failed");

const learnStarted = await telegram(callback(`task_start:${learnTask.id}`, { photo: true }));
if (learnStarted.outbound.method !== "editMessageCaption" || !learnStarted.outbound.text.includes("Planlanan:")) throw new Error(`photo callback did not become the canonical session state: ${JSON.stringify(learnStarted)}`);
const canonicalActiveMessageId = learnStarted.outbound.message_id;
const backdated = new Date(Date.now() - (20 * 60 + 5) * 1000).toISOString();
const backdateResult = await api.from("study_sessions").update({ started_at: backdated }).eq("id", learnStarted.session.id);
if (backdateResult.error) throw backdateResult.error;
const whileActive = await telegram(message("Ne çalışayım?"));
if (!whileActive.activeSession || !whileActive.outbound.text.includes("Çalışman devam ediyor")) throw new Error("active session was not surfaced by /simdi");
if (whileActive.outbound.method !== "editMessageCaption" || whileActive.outbound.message_id !== canonicalActiveMessageId) throw new Error(`slash /simdi did not edit the canonical active message: ${JSON.stringify(whileActive)}`);
const activeButtons = whileActive.outbound.reply_markup?.inline_keyboard?.flat()?.map((button) => button.callback_data) ?? [];
if (activeButtons.length !== 2 || !activeButtons.some((data) => data.startsWith("session_finish:")) || !activeButtons.includes("today")) throw new Error(`active session keyboard is not the current state: ${JSON.stringify(whileActive)}`);
const todayWhileActive = await telegram(message("/bugun"));
if (!todayWhileActive.activeSession || todayWhileActive.outbound.method !== "editMessageCaption" || todayWhileActive.outbound.message_id !== canonicalActiveMessageId) throw new Error(`active /bugun did not reuse the canonical state: ${JSON.stringify(todayWhileActive)}`);
const blockedSecondStart = await telegram(callback(`task_start:${solveTask.id}`, { photo: true }));
if (!blockedSecondStart.activeSession || !blockedSecondStart.outbound.text.includes("Çalışman devam ediyor") || !blockedSecondStart.outbound.keyboardCleared) throw new Error("second task start was not safely redirected to the active state");
const learnFinished = await telegram(callback(`session_finish:${learnStarted.session.id}`));
if (learnFinished.session.duration_minutes !== 20) throw new Error(`expected 20-minute session, got ${learnFinished.session.duration_minutes}`);
if (learnFinished.outbound.method !== "sendPhoto" || !learnFinished.outbound.keyboardCleared || learnFinished.outbound.caption !== "Çalışma kaydedildi.") throw new Error(`finish did not produce exactly one current completion delivery: ${JSON.stringify(learnFinished)}`);
const partialCompletionLabels = learnFinished.outbound.reply_markup?.inline_keyboard?.flat()?.map((button) => button.text) ?? [];
if (partialCompletionLabels.includes("Görev Bitti") || !partialCompletionLabels.includes("Devam Et")) throw new Error(`partial completion actions are misleading: ${JSON.stringify(learnFinished)}`);
const learnProgress = await api.from("task_progress").select("completed_minutes,actual_study_minutes").eq("user_id", user.id).eq("task_id", learnTask.id).single();
if (learnProgress.error || learnProgress.data.completed_minutes !== 20 || learnProgress.data.actual_study_minutes !== 20) throw learnProgress.error ?? new Error(`session progress not applied: ${JSON.stringify(learnProgress.data)}`);
const partialNow = await telegram(message("/simdi"));
if (partialNow.recommendation?.taskId !== learnTask.id || partialNow.recommendation.remainingMinutes !== Math.max(0, learnTask.estimated_minutes - 20)) throw new Error(`remaining minutes did not decrease after session: ${JSON.stringify(partialNow.recommendation)}`);
const afterStudyToday = await telegram(message("/bugun"));
if (afterStudyToday.summary?.studiedMinutes !== 20 || afterStudyToday.summary?.remainingCapacityMinutes !== Math.max(0, afterStudyToday.summary.capacityMinutes - 20)) {
  throw new Error(`daily capacity did not account for completed study: ${JSON.stringify(afterStudyToday.summary)}`);
}
const manualLinked = await telegram(message("10 dk çalıştım"));
const manualChoices = manualLinked.outbound.reply_markup?.inline_keyboard?.flat() ?? [];
if (manualChoices.some((button) => button.callback_data?.startsWith("manual_subject:"))) {
  throw new Error(`manual linked study added an unnecessary subject step: ${JSON.stringify(manualLinked)}`);
}
const realTaskChoices = manualChoices.filter((button) => button.callback_data?.startsWith("manual_task:") && button.callback_data !== "manual_task:none");
if (realTaskChoices.length > 3) throw new Error(`manual linked study exposed too many task choices: ${JSON.stringify(manualLinked)}`);
const learnTaskChoice = realTaskChoices.find((button) => button.callback_data === `manual_task:${learnTask.id}`)?.callback_data;
if (!learnTaskChoice) throw new Error(`manual linked study task choice missing: ${JSON.stringify(manualLinked)}`);
const manualLinkedSaved = await telegram(callback(learnTaskChoice));
if (manualLinkedSaved.session.task_id !== learnTask.id || manualLinkedSaved.session.duration_minutes !== 10) throw new Error("manual linked study did not attach to the selected task");
if (manualLinkedSaved.outbound.text.includes("Kaç dakika") || manualLinkedSaved.outbound.text.includes("Hangi dersi")) {
  throw new Error(`manual linked study repeated an already-known clarification: ${JSON.stringify(manualLinkedSaved)}`);
}
const staleManualChoice = await telegram(callback(learnTaskChoice));
if (!staleManualChoice.stale || staleManualChoice.outbound.method !== "editMessageReplyMarkup" || staleManualChoice.session) throw new Error(`consumed manual callback was not retired safely: ${JSON.stringify(staleManualChoice)}`);
const progressAfterManual = await api.from("task_progress").select("completed_minutes,actual_study_minutes").eq("user_id", user.id).eq("task_id", learnTask.id).single();
if (progressAfterManual.error || progressAfterManual.data.completed_minutes !== 30 || progressAfterManual.data.actual_study_minutes !== 30) throw progressAfterManual.error ?? new Error(`manual linked progress not applied: ${JSON.stringify(progressAfterManual.data)}`);
const afterManualNow = await telegram(message("/simdi"));
if (afterManualNow.recommendation?.taskId !== learnTask.id || afterManualNow.recommendation.remainingMinutes !== Math.max(0, learnTask.estimated_minutes - 30)) throw new Error(`manual study did not reduce task remaining: ${JSON.stringify(afterManualNow.recommendation)}`);

const startUpdate = callback(`task_start:${solveTask.id}`, { photo: true });
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
if (failedAfterBusiness.error !== "MOCK_FAILURE_AFTER_BUSINESS") throw new Error(`after-business failure was not recorded: ${JSON.stringify(failedAfterBusiness)}`);
const storedAfterFailure = await api.from("study_sessions").select("status,duration_minutes").eq("user_id", user.id).eq("id", started.session.id).single();
if (storedAfterFailure.data?.status !== "completed") throw new Error("business mutation did not commit before delivery failure");
const minutesBeforeRetry = (await api.from("task_progress").select("actual_study_minutes").eq("user_id", user.id).eq("task_id", solveTask.id).single()).data?.actual_study_minutes;
const completedBeforeRetry = (await api.from("task_progress").select("completed_minutes").eq("user_id", user.id).eq("task_id", solveTask.id).single()).data?.completed_minutes;
const finished = await telegram(finishUpdate);
if (finished.session.status !== "completed") throw new Error("finish failed");
if (finished.outbound.method !== "sendPhoto" || !finished.outbound.keyboardCleared || finished.outbound.caption !== "Çalışma kaydedildi.") throw new Error(`finish retry did not resume one completion delivery: ${JSON.stringify(finished)}`);
const minutesAfterRetry = (await api.from("task_progress").select("actual_study_minutes").eq("user_id", user.id).eq("task_id", solveTask.id).single()).data?.actual_study_minutes;
const completedAfterRetry = (await api.from("task_progress").select("completed_minutes").eq("user_id", user.id).eq("task_id", solveTask.id).single()).data?.completed_minutes;
if (minutesAfterRetry !== minutesBeforeRetry) throw new Error("delivery retry duplicated business accounting");
if (completedAfterRetry !== completedBeforeRetry) throw new Error("delivery retry duplicated task progress");
const completedDuplicate = await telegram(finishUpdate);
if (!completedDuplicate.duplicate) throw new Error("completed event was not a no-op");
const completedSessionCountBeforeStale = (await api.from("study_sessions").select("id", { count: "exact", head: true }).eq("id", started.session.id).eq("status", "completed")).count;
const staleFinish = await telegram(callback(`session_finish:${started.session.id}`));
const completedSessionCountAfterStale = (await api.from("study_sessions").select("id", { count: "exact", head: true }).eq("id", started.session.id).eq("status", "completed")).count;
if (!staleFinish.stale || staleFinish.outbound.method !== "editMessageText" || staleFinish.outbound.text !== "Bu çalışma tamamlandı." || completedSessionCountAfterStale !== completedSessionCountBeforeStale) throw new Error(`stale finish was not a coherent business no-op: ${JSON.stringify(staleFinish)}`);

const fallbackUpdate = callback("task_start:not-a-uuid");
const fallbackOnce = await telegram(fallbackUpdate);
if (!fallbackOnce.recovered || fallbackOnce.outbound.method !== "editMessageText" || !fallbackOnce.outbound.text.includes("Kısa bir sorun oldu")) throw new Error(`generic fallback was not delivered once in the interaction: ${JSON.stringify(fallbackOnce)}`);
const fallbackRetry = await telegram(fallbackUpdate);
if (!fallbackRetry.duplicate || fallbackRetry.outbound) throw new Error(`same failed update produced a duplicate fallback: ${JSON.stringify(fallbackRetry)}`);

await telegram(callback(`result_begin:${solveTask.id}`));
await telegram(message("7"));
await telegram(message("2"));
const preview = await telegram(message("1"));
if (!preview.outbound.text.includes("Toplam 10")) throw new Error("result preview failed");
const saved = await telegram(callback("result_save"));
if (saved.result.review_status !== "pending" || saved.result.total_questions !== 10) throw new Error("result save failed");
const reviewed = await telegram(callback(`result_review:${saved.result.id}`));
if (reviewed.result.review_status !== "reviewed") throw new Error("review failed");
const staleCompletedStart = await telegram(callback(`task_start:${solveTask.id}`));
if (!staleCompletedStart.stale || staleCompletedStart.outbound.method !== "editMessageReplyMarkup") throw new Error(`completed task stale button was not handled safely: ${JSON.stringify(staleCompletedStart)}`);

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
const beforeSpecialToday = await telegram(message("/bugun"));
const completedBeforeSpecial = Number(beforeSpecialToday.summary?.studiedMinutes ?? 0);
const specialMenu = await telegram(message("/ozel"));
const lessCallback = "special_less";
await telegram(callback(lessCallback));
const specialApplied = await telegram(message("90"));
if (specialApplied.remainingAvailabilityMinutes !== 90
  || specialApplied.replan?.dayCapacities?.[dueDate] !== completedBeforeSpecial + 90
  || !specialApplied.replan?.revision) {
  throw new Error(`special situation replan failed: ${JSON.stringify(specialApplied)}`);
}
const minimumPlan = await telegram(message("/minimum"));
if (!minimumPlan.minimum || minimumPlan.minimum.totalMinutes > 90) throw new Error("minimum plan failed");
const adaptiveNow = await telegram(message("/simdi"));
if (adaptiveNow.recommendation?.reason !== "continue_partial"
  || adaptiveNow.recommendation?.remainingMinutes !== 30
  || adaptiveNow.recommendation?.completedMinutes !== 30) {
  throw new Error(`adaptive simdi partial-progress regression failed: ${JSON.stringify(adaptiveNow)}`);
}
const repeatList = await telegram(message("/tekrar"));
const completeData = repeatList.outbound.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data;
if (!repeatList.outbound.text.includes("Bugünkü tekrarların") || !completeData?.startsWith("revision_complete:")) throw new Error("tekrar list failed");
const completeUpdate = callback(completeData);
const repeatCompleted = await telegram(completeUpdate);
if (repeatCompleted.revision.status !== "completed") throw new Error("revision callback failed");
const repeatDuplicate = await telegram(completeUpdate);
if (!repeatDuplicate.duplicate) throw new Error("revision callback retry was not deduplicated");
const storedRevision = await api.from("revision_schedules").select("status,completed_at").eq("user_id", user.id).eq("exam_profile_id", profile.data.id).eq("id", evidence.mastery.revision.id).single();
if (storedRevision.data?.status !== "completed" || !storedRevision.data.completed_at) throw new Error("revision completion was not persisted");

const manual = await telegram(message("/calisma_ekle"));
const subjectCallback = manual.outbound.reply_markup.inline_keyboard[0][0].callback_data;
const manualSubjectStep = await telegram(callback(subjectCallback));
const generalChoice = manualSubjectStep.outbound.reply_markup?.inline_keyboard?.flat()?.find((button) => button.callback_data === "manual_task:none")?.callback_data;
if (generalChoice) await telegram(callback(generalChoice));
const retroactive = await telegram(message("35"));
if (retroactive.session.duration_minutes !== 35 || retroactive.session.entry_source !== "telegram") throw new Error("manual log failed");

const calendarToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
const todaySchedulerReference = `${calendarToday}T12:00:00+03:00`;
const dailyAction = await waitForScheduledAction({
  reference: todaySchedulerReference,
  dedupeKey: `daily_plan:${user.id}:${calendarToday}`,
});
if (dailyAction.result_payload?.notification !== "suppressed_manual_view") throw new Error(`manual /bugun did not suppress duplicate scheduler message: ${JSON.stringify(dailyAction)}`);
await waitForScheduledAction({
  reference: todaySchedulerReference,
  dedupeKey: `data_gap_check:${user.id}:${calendarToday}`,
});
const currentGapDate = shiftDate(calendarToday, -1);
const openGap = await api.from("data_gap_events").select("*")
  .eq("user_id", user.id)
  .eq("exam_profile_id", profile.data.id)
  .eq("gap_date", currentGapDate)
  .eq("gap_type", "missing_study_confirmation")
  .eq("status", "open")
  .single();
if (openGap.error || !openGap.data.notified_at) throw openGap.error ?? new Error("data gap notification missing");
const noStudy = await telegram(callback(`gap_no_study:${openGap.data.id}`));
if (noStudy.dataGap?.resolution_result !== "confirmed_no_study") throw new Error("data gap no-study callback failed");

const referenceDate = new Date(`${calendarToday}T12:00:00Z`);
referenceDate.setUTCDate(referenceDate.getUTCDate() - 1);
const previousDate = referenceDate.toISOString().slice(0, 10);
const previousSchedulerReference = `${previousDate}T12:00:00+03:00`;
await waitForScheduledAction({
  reference: previousSchedulerReference,
  dedupeKey: `data_gap_check:${user.id}:${previousDate}`,
});
const previousGapDate = shiftDate(previousDate, -1);
const addGap = await api.from("data_gap_events").select("*")
  .eq("user_id", user.id)
  .eq("exam_profile_id", profile.data.id)
  .eq("gap_date", previousGapDate)
  .eq("gap_type", "missing_study_confirmation")
  .eq("status", "open")
  .single();
if (addGap.error) throw addGap.error;
const addBegin = await telegram(callback(`gap_add_study:${addGap.data.id}`));
const gapSubjectData = addBegin.outbound.reply_markup.inline_keyboard[0][0].callback_data;
const gapSubjectStep = await telegram(callback(gapSubjectData));
const gapGeneralChoice = gapSubjectStep.outbound.reply_markup?.inline_keyboard
  ?.flat()
  ?.find((button) => button.callback_data === "manual_task:none")?.callback_data;
if (gapGeneralChoice) {
  const gapDurationStep = await telegram(callback(gapGeneralChoice));
  if (!gapDurationStep.outbound.text.includes("Kaç dakika çalıştın?")) {
    throw new Error(`data gap duration prompt missing after task choice: ${JSON.stringify(gapDurationStep)}`);
  }
} else if (!gapSubjectStep.outbound.text.includes("Kaç dakika çalıştın?")) {
  throw new Error(`data gap subject flow did not reach duration step: ${JSON.stringify(gapSubjectStep)}`);
}
const gapStudy = await telegram(message("25"));
if (gapStudy.session?.duration_minutes !== 25 || !gapStudy.session?.ended_at?.startsWith(addGap.data.gap_date)) throw new Error(`data gap retroactive date flow failed: ${JSON.stringify(gapStudy)}`);
const resolvedGap = await api.from("data_gap_events").select("status,resolution_result").eq("user_id", user.id).eq("id", addGap.data.id).single();
if (resolvedGap.data?.status !== "resolved" || resolvedGap.data.resolution_result !== "study_added") throw new Error("data gap study resolution missing");

const sunday = new Date(`${calendarToday}T12:00:00Z`);
const isoDay = sunday.getUTCDay() || 7;
sunday.setUTCDate(sunday.getUTCDate() - isoDay - 6);
const previousSunday = sunday.toISOString().slice(0, 10);
const weeklySchedulerReference = `${previousSunday}T20:00:00+03:00`;
const weeklyDedupeKey = `weekly_report:${user.id}:${previousSunday}`;
const weeklyAction = await waitForScheduledAction({ reference: weeklySchedulerReference, dedupeKey: weeklyDedupeKey });
if (weeklyAction.result_payload?.notification !== "sent" || weeklyAction.result_payload?.outbound?.method !== "sendPhoto" || weeklyAction.result_payload?.outbound?.caption !== "Haftalık özetin hazır.") throw new Error(`weekly report Telegram visual send missing: ${JSON.stringify(weeklyAction)}`);
const actionCountBefore = (await api.from("scheduled_actions").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("dedupe_key", weeklyDedupeKey)).count;
await scheduler(weeklySchedulerReference);
const actionCountAfter = (await api.from("scheduled_actions").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("dedupe_key", weeklyDedupeKey)).count;
if (actionCountAfter !== actionCountBefore) throw new Error("scheduler retry created duplicate actions");

const noOpenResult = await telegram(message("30 soru 7 yanlış"));
const noOpenResultActions = noOpenResult.outbound.reply_markup?.inline_keyboard?.flat()?.map((button) => button.callback_data) ?? [];
if (noOpenResult.result || !noOpenResultActions.includes("today") || !noOpenResultActions.includes("result_find")) throw new Error(`unmatched result flow is still a dead end: ${JSON.stringify(noOpenResult)}`);

await telegram(callback("today_skip"));
const closedToday = await telegram(message("/bugun"));
const closedTodayActions = closedToday.outbound.reply_markup?.inline_keyboard?.flat()?.map((button) => button.callback_data) ?? [];
if (closedToday.summary?.remainingCapacityMinutes !== 0 || closedToday.summary?.recommendation || closedTodayActions.some((action) => action.startsWith("task_start:") || action === "special_less" || action === "today_skip")) {
  throw new Error(`closed day still exposes a study recommendation: ${JSON.stringify(closedToday)}`);
}
const closedNow = await telegram(message("/simdi"));
if (closedNow.recommendation || !closedNow.outbound.text.includes("süre kalmadı")) throw new Error(`closed day /simdi is inconsistent: ${JSON.stringify(closedNow)}`);
const closedGreeting = await telegram(message("Merhaba"));
const closedGreetingActions = closedGreeting.outbound.reply_markup?.inline_keyboard?.flat()?.map((button) => button.callback_data) ?? [];
if (closedGreetingActions.includes("now") || closedGreetingActions.includes("special_less")) throw new Error(`closed-day greeting is not state-aware: ${JSON.stringify(closedGreeting)}`);
const closedMinimum = await telegram(message("/minimum"));
if (closedMinimum.minimum?.totalMinutes !== 0) throw new Error(`minimum flow regressed at zero capacity: ${JSON.stringify(closedMinimum)}`);
await telegram(message("/ozel"));
const reopened = await telegram(callback("special_total:20"));
const reopenedToday = await telegram(message("/bugun"));
if (reopenedToday.summary?.remainingCapacityMinutes !== 20) throw new Error(`0→20 remaining override failed: ${JSON.stringify({ reopened, reopenedToday })}`);
const timeBoxedNow = await telegram(message("/simdi"));
if (timeBoxedNow.recommendation && (timeBoxedNow.recommendation.recommendedSessionMinutes > 20 || timeBoxedNow.recommendation.taskRemainingMinutes < timeBoxedNow.recommendation.recommendedSessionMinutes)) {
  throw new Error(`recommendation exceeded the reopened window: ${JSON.stringify(timeBoxedNow)}`);
}

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
  schedulerDailyPlanSuppressedAfterManualView: true,
  callbackCardsEditedInPlace: true,
  visualDailyCardSent: true,
  visualNowCardSent: true,
  visualWeeklyReportSent: true,
  visualRendererFallbackToText: true,
  activeSessionGuarded: true,
  activeSessionCanonicalMessage: true,
  staleSessionMessageCoherent: true,
  zeroCapacityStateAware: true,
  remainingAvailabilityPreservesCompleted: true,
  recommendationTimeBoxed: true,
  unmatchedResultActionable: true,
  sessionMinutesUpdateTaskRemaining: true,
  dailyCapacityAccountsForStudy: true,
  manualStudyCanReduceTaskRemaining: true,
  staleCompletedTaskStartHandled: true,
  naturalLanguageIntent: true,
  retryDeduplicated: true,
  retryBeforeBusinessRecovered: true,
  retryAfterBusinessDidNotMutate: true,
  completedEventNoOp: true,
  transport: "mock",
}, null, 2));
