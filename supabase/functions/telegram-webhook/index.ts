import { createClient } from "npm:@supabase/supabase-js@2";
import { recalculateTopicMastery, revisionWithUrgency } from "../_shared/mastery.ts";
import { loadAdaptiveBase, minimumDayPlan, recalculateCurrentPlan } from "../_shared/adaptive.ts";
import { loadDailyCoachContext, recordRecommendationEvent } from "../_shared/pilot.ts";
import { DEFAULT_RESOURCE_UNIT_MINUTES, remainingTaskMinutes } from "../_shared/planning.bundle.js";
import { ensureP48WeekPlanForService } from "../_shared/p48-week.ts";
import {
  classifyTelegramText,
  completionCard,
  dailyCoachCard,
  foldedTelegramText,
  formatDailyCoachMessage,
  formatMinutesShort,
  formatNowCoachMessage,
  formatReplanSummary,
  friendlyHelpMessage,
  greetingMessage,
  mainMenuButtons,
  nowCoachCard,
  parseAvailableMinutes,
  parseManualStudyText,
  parseTestResultText,
  replanCard,
  testResultPresentation,
  unknownMessage,
  type ParsedTestResult,
  type TelegramButton,
} from "../_shared/telegram-coach.ts";
import {
  answerTelegramCallback,
  cardDelivery,
  deliverTelegram,
  textDelivery,
  type TelegramDelivery,
} from "../_shared/telegram-transport.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const hash = async (value: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

type Button = TelegramButton;
// The edge helpers intentionally work with the service-role client across several
// RPC/table result shapes. Pinning this alias to createClient's inferred schema
// makes newer supabase-js releases collapse ungenerated tables to `never`.
// Keep the boundary permissive until generated Database types are introduced.
type Admin = ReturnType<typeof createClient<any>>;
async function deliverBody(body: Record<string, unknown>, forceCardFailure = false) {
  const outbound = body.outbound as TelegramDelivery | undefined;
  if (!outbound?.__telegramDelivery) return body;
  return {
    ...body,
    outbound: await deliverTelegram(outbound, { forceCardFailure }),
  };
}

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
const monday = (date: string) => {
  const value = new Date(`${date}T12:00:00Z`);
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() - day + 1);
  return value.toISOString().slice(0, 10);
};

async function replanAfterStudy(admin: Admin, userId: string, examProfileId: string, day: string) {
  const profile = await admin.from("exam_profiles").select("*").eq("id",examProfileId).eq("user_id",userId).eq("status","active").maybeSingle();
  if (profile.error) throw profile.error;
  if (!profile.data) return null;
  const plan = await admin.from("weekly_plans").select("*").eq("user_id",userId).eq("exam_profile_id",examProfileId).eq("week_start_date",monday(day)).eq("status","active").maybeSingle();
  if (plan.error) throw plan.error;
  if (!plan.data) return null;
  return await recalculateCurrentPlan(admin,userId,profile.data,plan.data,"study_deviation",true);
}

async function setState(admin: Admin, userId: string, chatId: string, state: string, payload: Record<string, unknown>) {
  const result = await admin.from("telegram_conversation_states").upsert({
    user_id: userId,
    chat_id: chatId,
    state,
    payload,
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,chat_id" });
  if (result.error) throw result.error;
}

async function clearState(admin: Admin, userId: string, chatId: string) {
  const result = await admin.from("telegram_conversation_states").delete().eq("user_id", userId).eq("chat_id", chatId);
  if (result.error) throw result.error;
}

async function getState(admin: Admin, userId: string, chatId: string) {
  const result = await admin.from("telegram_conversation_states")
    .select("state,payload,expires_at")
    .eq("user_id", userId)
    .eq("chat_id", chatId)
    .maybeSingle();
  if (result.error) throw result.error;
  if (result.data && new Date(result.data.expires_at).getTime() <= Date.now()) {
    await clearState(admin, userId, chatId);
    return null;
  }
  return result.data;
}

Deno.serve(async (req) => {
  let lifecycleAdmin: Admin | null = null;
  let lifecycleEventId: string | null = null;
  let fallbackChatId: string | null = null;
  try {
    const expectedSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
    if (!expectedSecret || req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== expectedSecret) {
      return json({ error: "FORBIDDEN" }, 403);
    }

    const update = await req.json();
    const eventId = String(update.update_id);
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const staleSeconds = Number(Deno.env.get("TELEGRAM_EVENT_STALE_SECONDS") ?? "60");
    const claimed = await admin.rpc("claim_external_event", {
      p_provider: "telegram",
      p_external_event_id: eventId,
      p_stale_seconds: staleSeconds,
    });
    if (claimed.error) throw claimed.error;
    if (!claimed.data?.claimed) {
      return json({
        ok: true,
        duplicate: true,
        processing: claimed.data?.status === "processing",
      });
    }

    lifecycleAdmin = admin;
    lifecycleEventId = eventId;
    const mockFailureStage = Deno.env.get("TELEGRAM_TRANSPORT_MODE") === "mock"
      ? req.headers.get("X-Telegram-Mock-Fail-Stage")
      : null;
    const forceCardFailure = Deno.env.get("TELEGRAM_TRANSPORT_MODE") === "mock" &&
      req.headers.get("X-Telegram-Mock-Fail-Card") === "true";

    const complete = async () => {
      const completed = await admin.rpc("complete_external_event", {
        p_provider: "telegram",
        p_external_event_id: eventId,
      });
      if (completed.error) throw completed.error;
      lifecycleEventId = null;
    };
    const finalize = async (body: Record<string, unknown>, status = 200) => {
      const checkpoint = await admin.rpc("checkpoint_external_event", {
        p_provider: "telegram",
        p_external_event_id: eventId,
        p_result_payload: { body, status },
      });
      if (checkpoint.error) throw checkpoint.error;
      if (mockFailureStage === "after-business") throw new Error("MOCK_FAILURE_AFTER_BUSINESS");
      const delivered = await deliverBody(body, forceCardFailure);
      await complete();
      return json(delivered, status);
    };

    if (claimed.data.businessCompleted && claimed.data.resultPayload) {
      const saved = claimed.data.resultPayload as { body: Record<string, unknown>; status: number };
      const delivered = await deliverBody(saved.body, forceCardFailure);
      await complete();
      return json(delivered, saved.status);
    }
    if (mockFailureStage === "before-business") throw new Error("MOCK_FAILURE_BEFORE_BUSINESS");

    const callbackQuery = update.callback_query;
    const message = update.message ?? callbackQuery?.message;
    const from = update.message?.from ?? callbackQuery?.from;
    if (!from || !message?.chat?.id) throw new Error("INVALID_TELEGRAM_UPDATE");
    const chatId = String(message.chat.id);
    fallbackChatId = chatId;
    const text = String(update.message?.text ?? "").trim();
    const callback = String(callbackQuery?.data ?? "");
    const callbackMessageId = callbackQuery?.message?.message_id ? Number(callbackQuery.message.message_id) : null;
    const respond = (messageText: string, buttons: Button[][] = []) => textDelivery(chatId, messageText, buttons, callbackMessageId);
    const respondCard = (card: Parameters<typeof cardDelivery>[1], messageText: string, buttons: Button[][] = []) => cardDelivery(chatId, card, messageText, buttons);
    if (callbackQuery?.id) await answerTelegramCallback(String(callbackQuery.id));

    if (text.startsWith("/start ")) {
      const linked = await admin.rpc("consume_messaging_link_token", {
        p_token_hash: await hash(text.slice(7).trim()),
        p_external_user_id: String(from.id),
        p_external_chat_id: chatId,
        p_username: from.username ?? null,
      });
      if (linked.error) throw linked.error;
      return await finalize({ ok: true, outbound: respond("Telegram hesabın KPSS Koçu’na bağlandı.\n\nBugünün en iyi adımıyla başlayabiliriz.", mainMenuButtons()) });
    }

    const identity = await admin.from("messaging_identities")
      .select("user_id")
      .eq("provider", "telegram")
      .eq("external_user_id", String(from.id))
      .maybeSingle();
    if (identity.error) throw identity.error;
    if (!identity.data) {
      return await finalize({ ok: true, outbound: respond("Önce web uygulamasındaki Ayarlar bölümünden Telegram hesabını bağla.") });
    }

    const userId = identity.data.user_id;
    const day = today();
    const week = monday(day);
    const conversationState = await getState(admin, userId, chatId);
    const intent = conversationState ? "unknown" : classifyTelegramText(text);
    const availableMinutes = conversationState ? null : parseAvailableMinutes(text);
    const parsedManual = conversationState ? null : parseManualStudyText(text);
    const parsedResult = conversationState ? null : parseTestResultText(text);
    const activeSession = async () => {
      const session = await admin.from("study_sessions")
        .select("id,task_id,started_at")
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();
      if (session.error) throw session.error;
      if (!session.data) return null;
      const task = session.data.task_id
        ? await admin.from("tasks")
          .select("id,title,task_type,estimated_minutes,status,task_progress(completed_minutes)")
          .eq("id", session.data.task_id)
          .eq("user_id", userId)
          .maybeSingle()
        : { data: null, error: null };
      if (task.error) throw task.error;
      return { ...session.data, task: task.data };
    };

    const applyTotalCapacity = async (totalMinutes: number, note: string) => {
      const profile = await admin.from("exam_profiles").select("*").eq("user_id", userId).eq("status", "active").maybeSingle();
      const plan = profile.data ? await admin.from("weekly_plans").select("*").eq("user_id", userId).eq("exam_profile_id", profile.data.id).eq("week_start_date", week).eq("status", "active").maybeSingle() : { data: null, error: null };
      if (profile.error) throw profile.error;
      if (plan.error) throw plan.error;
      if (!profile.data || !plan.data) return null;
      const base = await loadAdaptiveBase(admin, userId, profile.data, plan.data);
      const normal = Number(base.dayCapacities[day] ?? 0);
      const inserted = await admin.from("schedule_exceptions").insert({
        user_id: userId,
        exam_profile_id: profile.data.id,
        exception_date: day,
        exception_type: "custom",
        minutes_delta: Math.max(0, totalMinutes) - normal,
        note,
      });
      if (inserted.error) throw inserted.error;
      const replanned = await recalculateCurrentPlan(admin, userId, profile.data, plan.data, "capacity_change", true);
      return { normal, updated: Number(replanned.dayCapacities[day] ?? totalMinutes), replanned };
    };

    const openSolveTasks = async () => {
      const profile = await admin.from("exam_profiles").select("id").eq("user_id", userId).eq("status", "active").maybeSingle();
      if (profile.error) throw profile.error;
      if (!profile.data) return [];
      const plan = await admin.from("weekly_plans").select("id").eq("user_id", userId).eq("exam_profile_id", profile.data.id).eq("week_start_date", week).eq("status", "active").maybeSingle();
      if (plan.error) throw plan.error;
      if (!plan.data) return [];
      const result = await admin.from("tasks")
        .select("id,title,exam_profile_id,subject_id,curriculum_node_id,resource_id,status,task_resource_units(resource_unit_id,status)")
        .eq("user_id", userId)
        .eq("weekly_plan_id", plan.data.id)
        .eq("task_type", "solve_resource_units")
        .in("status", ["planned", "ready", "in_progress", "partially_completed", "rescheduled"])
        .order("priority_score", { ascending: false });
      if (result.error) throw result.error;
      return result.data ?? [];
    };

    const setParsedResultState = async (parsed: ParsedTestResult, task: any) => {
      const unit = task.task_resource_units?.find((candidate: any) => candidate.status !== "completed");
      if (!unit) return false;
      await setState(admin, userId, chatId, "result_confirm", {
        taskId: task.id,
        examProfileId: task.exam_profile_id,
        subjectId: task.subject_id,
        curriculumNodeId: task.curriculum_node_id,
        resourceId: task.resource_id,
        resourceUnitId: unit.resource_unit_id,
        correct: parsed.correct,
        wrong: parsed.wrong,
        blank: parsed.blank,
        total: parsed.total,
      });
      return true;
    };

    const saveManualStudy = async (payload: Record<string, unknown>, durationMinutes: number) => {
      const session = await admin.rpc("telegram_record_retroactive_session", {
        p_user_id: userId,
        p_payload: { ...payload, durationMinutes },
      });
      if (session.error) throw session.error;
      const targetDay = String(payload.endedAt ?? day).slice(0, 10);
      const replan = session.data.exam_profile_id ? await replanAfterStudy(admin, userId, session.data.exam_profile_id, targetDay) : null;
      if (payload.dataGapEventId) {
        const resolved = await admin.from("data_gap_events").update({ status: "resolved", resolution_result: "study_added", resolved_at: new Date().toISOString() }).eq("id", payload.dataGapEventId).eq("user_id", userId).eq("status", "open");
        if (resolved.error) throw resolved.error;
      }
      await clearState(admin, userId, chatId);
      const summary = formatReplanSummary(replan);
      return { session: session.data, replan, message: `${formatMinutesShort(durationMinutes)} çalışma kaydedildi.${summary ? `\n${summary}` : ""}` };
    };

    const manualOpenTasks = async (payload: Record<string, unknown>, subjectId?: string) => {
      const targetDate = typeof payload.endedAt === "string" ? payload.endedAt.slice(0, 10) : day;
      const plan = await admin.from("weekly_plans")
        .select("id")
        .eq("user_id", userId)
        .eq("exam_profile_id", payload.examProfileId)
        .eq("week_start_date", monday(targetDate))
        .eq("status", "active")
        .maybeSingle();
      if (plan.error) throw plan.error;
      if (!plan.data) return [];
      let openTasksQuery = admin.from("tasks")
        .select("id,title,subject_id,curriculum_node_id,resource_id,status,priority_score")
        .eq("user_id", userId)
        .eq("weekly_plan_id", plan.data.id)
        .in("status", ["planned", "ready", "in_progress", "partially_completed", "rescheduled"])
        .order("priority_score", { ascending: false });
      if (subjectId) openTasksQuery = openTasksQuery.eq("subject_id", subjectId);
      const openTasks = await openTasksQuery;
      if (openTasks.error) throw openTasks.error;
      return openTasks.data ?? [];
    };
    const manualTasksForSubject = (payload: Record<string, unknown>, subjectId: string) => manualOpenTasks(payload, subjectId);

    if (callback.startsWith("gap_no_study:")) {
      const eventId=callback.slice(13);
      const event=await admin.from("data_gap_events").select("*").eq("id",eventId).eq("user_id",userId).maybeSingle();
      if(event.error)throw event.error;if(!event.data)throw new Error("DATA_GAP_NOT_FOUND");
      if(event.data.status==="open"){
        const resolved=await admin.from("data_gap_events").update({status:"resolved",resolution_result:"confirmed_no_study",resolved_at:new Date().toISOString()}).eq("id",eventId).eq("user_id",userId);
        if(resolved.error)throw resolved.error;
      }
      return await finalize({ok:true,dataGap:{...event.data,status:"resolved",resolution_result:event.data.resolution_result??"confirmed_no_study"},outbound:respond("Dün için çalışmadığın kaydedildi.")});
    }

    if (callback.startsWith("gap_add_study:")) {
      const eventId=callback.slice(14);
      const event=await admin.from("data_gap_events").select("id,exam_profile_id,gap_date,status").eq("id",eventId).eq("user_id",userId).maybeSingle();
      if(event.error)throw event.error;if(!event.data)throw new Error("DATA_GAP_NOT_FOUND");
      if(event.data.status==="resolved")return await finalize({ok:true,outbound:respond("Bu eksik kayıt daha önce çözüldü.")});
      const subjects=await admin.from("user_subjects").select("subject_id,subjects(name)").eq("user_id",userId).eq("exam_profile_id",event.data.exam_profile_id).eq("status","active");
      if(subjects.error)throw subjects.error;
      await setState(admin,userId,chatId,"manual_subject",{examProfileId:event.data.exam_profile_id,dataGapEventId:eventId,endedAt:`${event.data.gap_date}T21:00:00+03:00`});
      const buttons=(subjects.data??[]).slice(0,4).map((item:any)=>[{text:item.subjects?.name??"Ders",callback_data:`manual_subject:${item.subject_id}`}]);
      return await finalize({ok:true,outbound:respond("Hangi dersi çalıştın?",buttons)});
    }

    if (intent === "no_study" || callback === "today_skip") {
      const applied = await applyTotalCapacity(0, "Telegram: bugün çalışamayacak");
      if (!applied) return await finalize({ ok: true, outbound: respond("Aktif haftalık plan bulunamadı.") });
      const summary = formatReplanSummary(applied.replanned);
      const message = summary
        ? `Bugünün kalan planını yeniden dağıttım.\n${summary}`
        : "Bugünün kapasitesini kapattım. Haftanın kalanında ek değişiklik gerekmiyor.";
      const changed = Number(applied.replanned?.decision?.changedTaskCount ?? 0);
      return await finalize({
        ok: true,
        replan: applied.replanned,
        outbound: changed > 0
          ? respondCard(replanCard("Bugün plan dışı", applied.replanned, message), message, [[{ text: "Haftayı gör", callback_data: "today" }]])
          : respond(message, [[{ text: "Haftayı gör", callback_data: "today" }]]),
      });
    }

    if (text === "/minimum" || callback === "minimum" || intent === "minimum") {
      const profile = await admin.from("exam_profiles").select("*").eq("user_id", userId).eq("status", "active").maybeSingle();
      const plan = profile.data ? await admin.from("weekly_plans").select("*").eq("user_id",userId).eq("exam_profile_id",profile.data.id).eq("week_start_date",week).eq("status","active").maybeSingle() : {data:null};
      if (!profile.data || !plan.data) return await finalize({ok:true,outbound:respond("Aktif haftalık plan bulunamadı.")});
      const minimum = await minimumDayPlan(admin,userId,profile.data,plan.data,day);
      await recordRecommendationEvent(admin,{userId,examProfileId:profile.data.id,eventType:"minimum_plan",channel:"telegram",reason:"minimum_day_requested"});
      const lines = minimum.tasks.map((task:any,index:number)=>`${index+1}. ${task.title} — ${task.minutes} dk`).join("\n");
      return await finalize({ok:true,minimum,outbound:respond(minimum.tasks.length?`Minimum planın (${minimum.totalMinutes} dk)\n\n${lines}`:"Bugünkü sürene uyan anlamlı minimum görev yok.")});
    }

    if ((intent === "special" && availableMinutes !== null) || callback.startsWith("special_total:")) {
      const total = callback.startsWith("special_total:") ? Number(callback.slice(14)) : Number(availableMinutes);
      if (!Number.isFinite(total) || total < 0) return await finalize({ ok: true, outbound: respond("Süreyi dakika olarak yazabilir misin?") });
      const applied = await applyTotalCapacity(total, "Telegram: sınırlı zaman");
      if (!applied) return await finalize({ ok: true, outbound: respond("Aktif haftalık plan bulunamadı.") });
      const message = `Bugünkü çalışma alanını ${formatMinutesShort(applied.updated)} olarak güncelledim.${formatReplanSummary(applied.replanned) ? `\n${formatReplanSummary(applied.replanned)}` : ""}`;
      return await finalize({ ok: true, replan: applied.replanned, outbound: respond(message, [[{ text: "Şimdi ne çalışayım?", callback_data: "now" }]]) });
    }

    if (text === "/ozel" || callback === "special" || intent === "special") {
      await setState(admin,userId,chatId,"special_mode",{});
      return await finalize({ok:true,outbound:respond("Bugün toplam ne kadar vaktin var? İstersen süreyi yazarak da devam edebilirsin.",[[{text:"20 dk",callback_data:"special_total:20"},{text:"30 dk",callback_data:"special_total:30"}],[{text:"45 dk",callback_data:"special_total:45"},{text:"60 dk",callback_data:"special_total:60"}]])});
    }
    if (callback === "special_less" || callback === "special_extra") {
      const profile = await admin.from("exam_profiles").select("*").eq("user_id",userId).eq("status","active").maybeSingle();
      const plan = profile.data ? await admin.from("weekly_plans").select("*").eq("user_id",userId).eq("exam_profile_id",profile.data.id).eq("week_start_date",week).eq("status","active").maybeSingle() : {data:null};
      if(!profile.data||!plan.data)return await finalize({ok:true,outbound:respond("Aktif haftalık plan bulunamadı.")});
      const base=await loadAdaptiveBase(admin,userId,profile.data,plan.data);
      await setState(admin,userId,chatId,callback==="special_less"?"special_less_minutes":"special_extra_minutes",{profileId:profile.data.id,planId:plan.data.id,normalMinutes:base.dayCapacities[day]??0});
      return await finalize({ok:true,outbound:respond(callback==="special_less"?"Bugün toplam kaç dakika çalışabilirsin?":"Bugün kaç dakika fazladan çalışabilirsin?")});
    }

    if (text === "/tekrar" || callback === "revisions" || intent === "revision") {
      const revisions = await admin.from("revision_schedules")
        .select("id,scheduled_for,revision_type,estimated_minutes,curriculum_nodes(name,subjects(name))")
        .eq("user_id", userId)
        .in("status", ["scheduled", "due"])
        .lte("scheduled_for", day)
        .order("scheduled_for", { ascending: true });
      if (revisions.error) throw revisions.error;
      if (!revisions.data?.length) {
        return await finalize({ ok: true, outbound: respond( "Bugün bekleyen tekrarın yok.") });
      }
      const typeNames: Record<string, string> = {
        short_review: "Kısa tekrar", wrong_review: "Yanlış inceleme", topic_test: "Konu testi", intensive_review: "Yoğun tekrar",
      };
      const rows = revisions.data.map((row: any, index: number) => {
        const urgency = revisionWithUrgency(row, day).urgency;
        const subject = row.curriculum_nodes?.subjects?.name ?? "Ders";
        const topic = row.curriculum_nodes?.name ?? "Konu";
        const timing = urgency === "due" ? "Bugün" : "Gecikmiş";
        return `${index + 1}. ${subject} — ${topic}\n${typeNames[row.revision_type]} — ${row.estimated_minutes} dk — ${timing}`;
      });
      const buttons = revisions.data.slice(0, 4).map((row: any) => [{ text: "Tekrarı Tamamla", callback_data: `revision_complete:${row.id}` }]);
      return await finalize({ ok: true, revisions: revisions.data, outbound: respond( `Bugünkü tekrarların\n\n${rows.join("\n\n")}`, buttons) });
    }

    if (callback.startsWith("revision_complete:")) {
      const completed = await admin.rpc("telegram_complete_revision", {
        p_user_id: userId,
        p_revision_id: callback.slice(18),
      });
      if (completed.error) throw completed.error;
      return await finalize({ ok: true, revision: completed.data, outbound: respond( "Tekrar tamamlandı.") });
    }

    if (text === "/bugun" || callback === "today" || intent === "today") {
      const profile = await admin.from("exam_profiles").select("*").eq("user_id", userId).eq("status", "active").maybeSingle();
      if (profile.error) throw profile.error;
      if (!profile.data) return await finalize({ ok: true, outbound: respond("Aktif sınav profili bulunamadı.") });
      await ensureP48WeekPlanForService(admin, userId, profile.data, day);
      const summary = await loadDailyCoachContext(admin, userId, profile.data, day);
      await recordRecommendationEvent(admin, {
        userId,
        examProfileId: profile.data.id,
        eventType: "daily_plan",
        channel: "telegram",
        reason: "manual_daily_plan_view",
      });
      const running = await activeSession();
      const buttons: Button[][] = running
        ? [[{ text: "Bitir", callback_data: `session_finish:${running.id}` }], [{ text: "Çalışma ekle", callback_data: "manual_begin" }]]
        : [[{ text: summary.recommendation?.needsResult ? "Sonuç gir" : "Çalışmaya başla", callback_data: summary.recommendation?.needsResult ? `result_begin:${summary.recommendation.taskId}` : summary.recommendation ? `task_start:${summary.recommendation.taskId}` : "now" }], [{ text: "Az vaktim var", callback_data: "special_less" }, { text: "Bugün çalışamam", callback_data: "today_skip" }]];
      const message = formatDailyCoachMessage(summary);
      return await finalize({
        ok: true,
        summary,
        outbound: !summary.plan
          ? respond(message, [[{ text: "Tekrar dene", callback_data: "today" }]])
          : running?.task
          ? respond(`Çalışman devam ediyor.\n${running.task.title}\n\nBitirdiğinde buradan tamamla.`, buttons)
          : respondCard(dailyCoachCard(summary), message, buttons),
      });
    }

    if (text === "/simdi" || callback === "now" || intent === "now") {
      const running = await activeSession();
      if (running?.task) {
        const elapsedMinutes = Math.max(0, Math.floor((Date.now() - new Date(running.started_at).getTime()) / 60_000));
        const completed = Number(running.task.task_progress?.[0]?.completed_minutes ?? 0);
        return await finalize({
          ok: true,
          activeSession: running,
          outbound: respond(
            `Çalışman devam ediyor\n\n${running.task.title}\nBu oturum: yaklaşık ${elapsedMinutes} dk\nKayıtlı ilerleme: ${completed}/${running.task.estimated_minutes} dk`,
            [[{ text: "Çalışmayı Bitir", callback_data: `session_finish:${running.id}` }]],
          ),
        });
      }
      const profile = await admin.from("exam_profiles").select("*").eq("user_id", userId).eq("status", "active").maybeSingle();
      if (profile.error) throw profile.error;
      if (!profile.data) return await finalize({ ok: true, outbound: respond("Aktif sınav profili bulunamadı.") });
      await ensureP48WeekPlanForService(admin, userId, profile.data, day);
      const context = await loadDailyCoachContext(admin, userId, profile.data, day, { respectCurrentTime: true });
      const recommendation = context.recommendation;
      if (!recommendation) return await finalize({ ok: true, outbound: respond("Şu anda önerebileceğim açık bir görev yok.") });
      await recordRecommendationEvent(admin, {
        userId,
        examProfileId: profile.data.id,
        taskId: recommendation.taskId,
        eventType: "next_best_task",
        channel: "telegram",
        reason: recommendation.reason,
      });
      const actionButton = recommendation.needsResult
        ? { text: "Sonuç Gir", callback_data: `result_begin:${recommendation.taskId}` }
        : { text: "Çalışmaya Başla", callback_data: `task_start:${recommendation.taskId}` };
      return await finalize({
        ok: true,
        recommendation,
        outbound: respondCard(nowCoachCard(recommendation, day), formatNowCoachMessage(recommendation), [[actionButton], [{ text: "Bugünü gör", callback_data: "today" }]]),
      });
    }

    if (callback.startsWith("task_start:")) {
      const requestedTaskId = callback.slice(11);
      const running = await activeSession();
      if (running?.task) {
        const sameTask = running.task.id === requestedTaskId;
        return await finalize({
          ok: true,
          activeSession: running,
          outbound: respond(
            sameTask
              ? `Bu çalışma zaten devam ediyor.\n\n${running.task.title}`
              : `Önce devam eden çalışmayı bitirmen gerekiyor.\n\n${running.task.title}`,
            [[{ text: "Çalışmayı Bitir", callback_data: `session_finish:${running.id}` }]],
          ),
        });
      }
      const requestedTask = await admin.from("tasks").select("id,title,status,estimated_minutes").eq("id", requestedTaskId).eq("user_id", userId).maybeSingle();
      if (requestedTask.error) throw requestedTask.error;
      if (!requestedTask.data) return await finalize({ ok: true, outbound: respond("Görev bulunamadı.") });
      if (["completed", "missed", "cancelled"].includes(requestedTask.data.status)) {
        return await finalize({
          ok: true,
          outbound: respond("Bu görev artık açık değil. Güncel sıradaki görevi gösterebilirim.", [[{ text: "Sıradaki Görev", callback_data: "now" }]]),
        });
      }
      const started = await admin.rpc("telegram_start_study_session", {
        p_user_id: userId,
        p_task_id: requestedTaskId,
      });
      if (started.error) {
        if (String(started.error.message ?? started.error).includes("TASK_NOT_STARTABLE")) {
          return await finalize({
            ok: true,
            outbound: respond("Bu görev artık açık değil. Güncel sıradaki görevi gösterebilirim.", [[{ text: "Sıradaki Görev", callback_data: "now" }]]),
          });
        }
        throw started.error;
      }
      return await finalize({
        ok: true,
        outbound: respond(`${requestedTask.data.title} başladı.\nPlanlanan: ${formatMinutesShort(requestedTask.data.estimated_minutes)}.\n\nBitirdiğinde buradan tamamla.`, [[{
          text: "Bitir",
          callback_data: `session_finish:${started.data.id}`,
        }]]),
        session: started.data,
      });
    }

    if (callback.startsWith("session_finish:")) {
      const finished = await admin.rpc("telegram_finish_study_session", {
        p_user_id: userId,
        p_session_id: callback.slice(15),
      });
      if (finished.error) throw finished.error;
      const replan = finished.data.exam_profile_id ? await replanAfterStudy(admin,userId,finished.data.exam_profile_id,day) : null;
      const task = finished.data.task_id
        ? await admin.from("tasks")
          .select("id,title,task_type,status,estimated_minutes,exam_profile_id,task_progress(completed_minutes),task_resource_units(status,resource_units(unit_type,estimated_minutes))")
          .eq("id", finished.data.task_id)
          .eq("user_id", userId)
          .maybeSingle()
        : { data: null, error: null };
      if (task.error) throw task.error;
      const completedMinutes = Number(task.data?.task_progress?.[0]?.completed_minutes ?? 0);
      const estimatedMinutes = Number(task.data?.estimated_minutes ?? 0);
      const pendingLinks = (task.data?.task_resource_units ?? []).filter((unit: any) => unit.status === "pending");
      const pendingUnitMinutes = pendingLinks.length
        ? pendingLinks.reduce((total: number, link: any) => {
          const unit = link.resource_units;
          return total + Number(unit?.estimated_minutes ?? (DEFAULT_RESOURCE_UNIT_MINUTES as Record<string, number>)[unit?.unit_type ?? "other"] ?? 30);
        }, 0)
        : null;
      const remainingMinutes = task.data
        ? remainingTaskMinutes({ estimatedMinutes, completedMinutes, pendingUnitMinutes } as any)
        : 0;
      const pendingUnits = pendingLinks.length;
      const needsResult = task.data?.task_type === "solve_resource_units" && pendingUnits > 0 && remainingMinutes === 0;
      const buttons: Button[][] = [];
      if (task.data?.task_type === "solve_resource_units" && pendingUnits > 0) {
        buttons.push([{ text: "Sonuç Gir", callback_data: `result_begin:${finished.data.task_id}` }]);
      }
      if (task.data && task.data.status !== "completed" && remainingMinutes > 0) {
        if (task.data.task_type === "custom") buttons.push([{ text: "Görev bitti", callback_data: `task_done:${task.data.id}` }]);
        buttons.push([{ text: "Devam et", callback_data: `task_start:${task.data.id}` }, { text: "Bugünü gör", callback_data: "today" }]);
      } else {
        buttons.push([{ text: "Sonraki görev", callback_data: "now" }, { text: "Bugünü gör", callback_data: "today" }]);
      }
      let nextRecommendation = null;
      if (finished.data.exam_profile_id) {
        const profile = await admin.from("exam_profiles").select("*").eq("id", finished.data.exam_profile_id).eq("user_id", userId).maybeSingle();
        if (profile.error) throw profile.error;
        if (profile.data) nextRecommendation = (await loadDailyCoachContext(admin, userId, profile.data, day, { respectCurrentTime: true })).recommendation;
      }
      const actualMinutes = Number(finished.data.duration_minutes ?? 0);
      const message = [
        `${formatMinutesShort(actualMinutes)} kaydedildi.`,
        task.data && remainingMinutes > 0 ? `Bu görevde ${formatMinutesShort(remainingMinutes)} kaldı.` : task.data ? "Görev tamamlandı." : "",
        needsResult ? "Test sonucu girişi bekliyor." : "",
        nextRecommendation ? `\n${nextRecommendation.taskId === task.data?.id ? "Devam" : "Sıradaki"}: ${nextRecommendation.title} · ${formatMinutesShort(nextRecommendation.remainingMinutes)}` : "",
        formatReplanSummary(replan) ? `\n${formatReplanSummary(replan)}` : "",
      ].filter(Boolean).join("\n");
      const meaningful = actualMinutes >= 20 || remainingMinutes === 0 || Number(replan?.decision?.changedTaskCount ?? 0) > 0;
      return await finalize({
        ok: true,
        outbound: meaningful && task.data
          ? respondCard(completionCard({ title: task.data.title, actualMinutes, remainingMinutes, next: nextRecommendation, replan }), message, buttons)
          : respond(message, buttons),
        session: finished.data,
        replan,
        taskProgress: task.data ? { completedMinutes, estimatedMinutes, remainingMinutes, status: task.data.status, needsResult } : null,
      });
    }

    if (callback.startsWith("task_done:")) {
      const taskId = callback.slice(10);
      const task = await admin.from("tasks")
        .select("id,title,task_type,status,exam_profile_id")
        .eq("id",taskId)
        .eq("user_id",userId)
        .maybeSingle();
      if (task.error) throw task.error;
      if (!task.data || task.data.task_type !== "custom") {
        return await finalize({ ok:true, outbound:respond("Bu çalışma artık tamamlanabilir durumda değil.") });
      }
      const completed = await admin.rpc("telegram_complete_task", { p_user_id:userId, p_task_id:taskId });
      if (completed.error) throw completed.error;
      const replan = await replanAfterStudy(admin,userId,task.data.exam_profile_id,day);
      const moved = Number(replan?.decision?.changedTaskCount ?? 0);
      const note = formatReplanSummary(replan);
      const message = `Görev tamamlandı.\n${task.data.title}${note ? `\n\n${note}` : ""}`;
      return await finalize({
        ok:true,
        task:completed.data,
        replan,
        outbound:moved > 0
          ? respondCard(replanCard("Görev tamamlandı", replan, message), message, [[{text:"Sonraki görev",callback_data:"now"},{text:"Bugünü gör",callback_data:"today"}]])
          : respond(message, [[{text:"Sonraki görev",callback_data:"now"},{text:"Bugünü gör",callback_data:"today"}]])
      });
    }

    if (parsedResult) {
      const tasks = await openSolveTasks();
      const query = foldedTelegramText(parsedResult.query);
      const matches = query ? tasks.filter((task: any) => foldedTelegramText(task.title).includes(query) || query.split(" ").every((part) => foldedTelegramText(task.title).includes(part))) : tasks;
      const selected = matches.length === 1 ? matches[0] : tasks.length === 1 ? tasks[0] : null;
      if (selected && await setParsedResultState(parsedResult, selected)) {
        return await finalize({ ok: true, outbound: respond(`${selected.title}\n\n${parsedResult.correct} doğru · ${parsedResult.wrong} yanlış${parsedResult.blank ? ` · ${parsedResult.blank} boş` : ""}\nToplam ${parsedResult.total} soru`, [[{ text: "Kaydet", callback_data: "result_save" }, { text: "İptal", callback_data: "form_cancel" }]]) });
      }
      if (!tasks.length) return await finalize({ ok: true, outbound: respond("Sonuçla eşleştirilecek açık bir test görevi bulunamadı.") });
      await setState(admin, userId, chatId, "result_task", { parsedResult });
      const buttons = (matches.length ? matches : tasks).slice(0, 4).map((task: any) => [{ text: task.title.slice(0, 54), callback_data: `result_task:${task.id}` }]);
      return await finalize({ ok: true, outbound: respond("Bu sonuç hangi teste ait?", buttons) });
    }

    if (callback.startsWith("result_task:")) {
      const state = await getState(admin, userId, chatId);
      if (state?.state !== "result_task") return await finalize({ ok: true, outbound: respond("Bu test seçimi artık geçerli değil. Sonucu yeniden yazabilirsin.") });
      const tasks = await openSolveTasks();
      const task = tasks.find((candidate: any) => candidate.id === callback.slice(12));
      const parsed = state.payload.parsedResult as ParsedTestResult | undefined;
      if (!task || !parsed || !await setParsedResultState(parsed, task)) return await finalize({ ok: true, outbound: respond("Bu test artık sonuç girişine açık değil.") });
      return await finalize({ ok: true, outbound: respond(`${task.title}\n\n${parsed.correct} doğru · ${parsed.wrong} yanlış${parsed.blank ? ` · ${parsed.blank} boş` : ""}\nToplam ${parsed.total} soru`, [[{ text: "Kaydet", callback_data: "result_save" }, { text: "İptal", callback_data: "form_cancel" }]]) });
    }

    if (callback.startsWith("result_begin:")) {
      const task = await admin.from("tasks")
        .select("id,exam_profile_id,subject_id,curriculum_node_id,resource_id,task_type,task_resource_units(resource_unit_id,status)")
        .eq("id", callback.slice(13))
        .eq("user_id", userId)
        .eq("task_type", "solve_resource_units")
        .maybeSingle();
      if (task.error) throw task.error;
      const unit = task.data?.task_resource_units?.find((candidate: any) => candidate.status !== "completed");
      if (!task.data || !unit) return await finalize({ ok: true, outbound: respond( "Sonuç girilecek bekleyen test ünitesi bulunamadı.") });
      await setState(admin, userId, chatId, "result_correct", {
        taskId: task.data.id,
        examProfileId: task.data.exam_profile_id,
        subjectId: task.data.subject_id,
        curriculumNodeId: task.data.curriculum_node_id,
        resourceId: task.data.resource_id,
        resourceUnitId: unit.resource_unit_id,
      });
      return await finalize({ ok: true, outbound: respond( "Doğru sayısı?") });
    }

    if (callback === "result_save") {
      const state = await getState(admin, userId, chatId);
      if (state?.state !== "result_confirm") {
        return await finalize({ ok: true, outbound: respond("Bu sonuç girişi artık geçerli değil. Test sonucunu yeniden başlatabilirsin.") });
      }
      const payload = state.payload as Record<string, unknown>;
      const result = await admin.rpc("telegram_record_test_result", {
        p_user_id: userId,
        p_payload: { ...payload, idempotencyKey: `telegram:${eventId}` },
      });
      if (result.error) throw result.error;
      let mastery = null;
      let masteryPending = false;
      if (result.data.curriculum_node_id) {
        try {
          mastery = await recalculateTopicMastery(admin, {
            userId,
            examProfileId: result.data.exam_profile_id,
            curriculumNodeId: result.data.curriculum_node_id,
            sourceTestResultId: result.data.id,
            triggerType: "test_result",
            serviceRole: true,
          });
        } catch (caught) {
          masteryPending = true;
          console.error("MASTERY_RECALCULATION_FAILED", caught instanceof Error ? caught.message : String(caught));
        }
      }
      await clearState(admin, userId, chatId);
      const buttons = result.data.review_status === "pending"
        ? [[{ text: "İnceledim", callback_data: `result_review:${result.data.id}` }, { text: "Sonra", callback_data: "result_later" }]]
        : [];
      const presentation = testResultPresentation(result.data, mastery);
      return await finalize({
        ok: true,
        result: result.data,
        mastery,
        masteryPending,
        outbound: presentation.card
          ? respondCard(presentation.card, `${presentation.text}${buttons.length ? "\n\nYanlışlarının çözümlerini inceledin mi?" : ""}`, buttons)
          : respond(`${presentation.text}${buttons.length ? "\n\nYanlışlarının çözümlerini inceledin mi?" : ""}`, buttons),
      });
    }

    if (callback.startsWith("result_review:")) {
      const reviewed = await admin.rpc("telegram_review_test_result", {
        p_user_id: userId,
        p_result_id: callback.slice(14),
      });
      if (reviewed.error) throw reviewed.error;
      return await finalize({ ok: true, result: reviewed.data, outbound: respond( "Yanlış incelemesi tamamlandı olarak işaretlendi.") });
    }

    if (callback === "result_later" || callback === "form_cancel") {
      await clearState(admin, userId, chatId);
      return await finalize({ ok: true, outbound: respond( callback === "result_later" ? "Sonuç/inceleme beklemede kalacak." : "İşlem iptal edildi.") });
    }

    if (text === "/calisma_ekle" || callback === "manual_begin" || intent === "manual") {
      const profile = await admin.from("exam_profiles").select("id").eq("user_id", userId).eq("status", "active").maybeSingle();
      if (!profile.data) return await finalize({ ok: true, outbound: respond( "Aktif sınav profili bulunamadı.") });
      const subjects = await admin.from("user_subjects")
        .select("subject_id,subjects(name)")
        .eq("user_id", userId)
        .eq("exam_profile_id", profile.data.id)
        .eq("status", "active");
      if (subjects.error) throw subjects.error;
      const statePayload: Record<string, unknown> = {
        examProfileId: profile.data.id,
        ...(parsedManual ? { durationMinutes: parsedManual.minutes, manualQuery: parsedManual.query } : {}),
      };
      if (parsedManual) {
        const query = foldedTelegramText(parsedManual.query);
        const allTasks = await manualOpenTasks(statePayload);
        const queryParts = query.split(" ").filter((part) => part.length > 3);
        const globalTaskMatches = allTasks.filter((task: any) => {
          const title = foldedTelegramText(task.title);
          return title.includes(query) || queryParts.some((part) => title.includes(part));
        });
        if (globalTaskMatches.length === 1) {
          const task = globalTaskMatches[0];
          const saved = await saveManualStudy({ ...statePayload, subjectId: task.subject_id, taskId: task.id, curriculumNodeId: task.curriculum_node_id, resourceId: task.resource_id }, parsedManual.minutes);
          return await finalize({ ok: true, session: saved.session, replan: saved.replan, outbound: respond(saved.message, [[{ text: "Bugünü gör", callback_data: "today" }]]) });
        }
        const matchedTaskSubjects = new Set(globalTaskMatches.map((task: any) => task.subject_id));
        if (globalTaskMatches.length > 1 && matchedTaskSubjects.size === 1) {
          const subjectId = globalTaskMatches[0].subject_id;
          await setState(admin, userId, chatId, "manual_task", { ...statePayload, subjectId });
          const taskButtons = globalTaskMatches.slice(0, 3).map((item: any) => [{ text: item.title.slice(0, 54), callback_data: `manual_task:${item.id}` }]);
          taskButtons.push([{ text: "Genel çalışma", callback_data: "manual_task:none" }]);
          return await finalize({ ok: true, outbound: respond("Hangi konuydu?", taskButtons) });
        }
        const matchedSubjects = ((subjects.data ?? []) as any[]).filter((item: any) => query && query.includes(foldedTelegramText(item.subjects?.name ?? "")));
        if (matchedSubjects.length === 1) {
          const subjectId = matchedSubjects[0].subject_id;
          const tasks = await manualTasksForSubject(statePayload, subjectId);
          const taskMatches = tasks.filter((task: any) => query.split(" ").some((part) => part.length > 3 && foldedTelegramText(task.title).includes(part)));
          const task = taskMatches.length === 1 ? taskMatches[0] : tasks.length === 1 ? tasks[0] : null;
          if (task) {
            const saved = await saveManualStudy({ ...statePayload, subjectId, taskId: task.id, curriculumNodeId: task.curriculum_node_id, resourceId: task.resource_id }, parsedManual.minutes);
            return await finalize({ ok: true, session: saved.session, replan: saved.replan, outbound: respond(saved.message, [[{ text: "Bugünü gör", callback_data: "today" }]]) });
          }
          if (!tasks.length) {
            const saved = await saveManualStudy({ ...statePayload, subjectId }, parsedManual.minutes);
            return await finalize({ ok: true, session: saved.session, replan: saved.replan, outbound: respond(saved.message, [[{ text: "Bugünü gör", callback_data: "today" }]]) });
          }
          await setState(admin, userId, chatId, "manual_task", { ...statePayload, subjectId });
          const taskButtons = tasks.slice(0, 3).map((item: any) => [{ text: item.title.slice(0, 54), callback_data: `manual_task:${item.id}` }]);
          taskButtons.push([{ text: "Genel çalışma", callback_data: "manual_task:none" }]);
          return await finalize({ ok: true, outbound: respond(`${matchedSubjects[0].subjects?.name ?? "Bu derste"} hangi konuydu?`, taskButtons) });
        }
      }
      await setState(admin, userId, chatId, "manual_subject", statePayload);
      const buttons = (subjects.data ?? []).slice(0, 4).map((item: any) => [{
        text: item.subjects?.name ?? "Ders",
        callback_data: `manual_subject:${item.subject_id}`,
      }]);
      return await finalize({ ok: true, outbound: respond(parsedManual ? "Hangi dersti?" : "Hangi dersi çalıştın?", buttons) });
    }

    if (callback.startsWith("manual_subject:")) {
      const state = await getState(admin, userId, chatId);
      if (state?.state !== "manual_subject") {
        return await finalize({ ok: true, outbound: respond("Bu çalışma ekleme adımı artık geçerli değil. Çalışma Ekle ile yeniden başlayabilirsin.") });
      }
      const subjectId = callback.slice(15);
      const tasks = await manualTasksForSubject(state.payload, subjectId);
      const knownDuration = Number(state.payload.durationMinutes ?? 0);
      if (tasks.length === 1) {
        const task = tasks[0];
        const payload = {
          ...state.payload,
          subjectId,
          taskId: task.id,
          curriculumNodeId: task.curriculum_node_id,
          resourceId: task.resource_id,
        };
        if (knownDuration > 0) {
          const saved = await saveManualStudy(payload, knownDuration);
          return await finalize({ ok: true, session: saved.session, replan: saved.replan, outbound: respond(saved.message, [[{ text: "Bugünü gör", callback_data: "today" }]]) });
        }
        await setState(admin, userId, chatId, "manual_duration", payload);
        return await finalize({ ok: true, outbound: respond(`“${task.title}” göreviyle eşleştirdim. Kaç dakika çalıştın?`) });
      }
      if (tasks.length > 1) {
        await setState(admin, userId, chatId, "manual_task", { ...state.payload, subjectId });
        const buttons: Button[][] = tasks.slice(0, 3).map((task: any) => [{ text: task.title.slice(0, 50), callback_data: `manual_task:${task.id}` }]);
        buttons.push([{ text: "Genel çalışma", callback_data: "manual_task:none" }]);
        return await finalize({ ok: true, outbound: respond(knownDuration > 0 ? "Hangi konuydu?" : "Bu çalışma hangi göreve aitti?", buttons) });
      }
      if (knownDuration > 0) {
        const saved = await saveManualStudy({ ...state.payload, subjectId }, knownDuration);
        return await finalize({ ok: true, session: saved.session, replan: saved.replan, outbound: respond(saved.message, [[{ text: "Bugünü gör", callback_data: "today" }]]) });
      }
      await setState(admin, userId, chatId, "manual_duration", { ...state.payload, subjectId });
      return await finalize({ ok: true, outbound: respond("Açık bir görevle eşleştiremedim; genel çalışma olarak kaydedeceğim. Kaç dakika çalıştın?") });
    }

    if (callback.startsWith("manual_task:")) {
      const state = await getState(admin, userId, chatId);
      if (state?.state !== "manual_task") {
        return await finalize({ ok: true, outbound: respond("Bu çalışma seçimi artık geçerli değil. Çalışma Ekle ile yeniden başlayabilirsin.") });
      }
      const taskId = callback.slice(12);
      const knownDuration = Number(state.payload.durationMinutes ?? 0);
      if (taskId === "none") {
        if (knownDuration > 0) {
          const saved = await saveManualStudy(state.payload, knownDuration);
          return await finalize({ ok: true, session: saved.session, replan: saved.replan, outbound: respond(saved.message, [[{ text: "Bugünü gör", callback_data: "today" }]]) });
        }
        await setState(admin, userId, chatId, "manual_duration", state.payload);
        return await finalize({ ok: true, outbound: respond("Genel çalışma olarak kaydedeceğim. Kaç dakika çalıştın?") });
      }
      const task = await admin.from("tasks")
        .select("id,title,curriculum_node_id,resource_id,status")
        .eq("id", taskId)
        .eq("user_id", userId)
        .eq("subject_id", state.payload.subjectId)
        .maybeSingle();
      if (task.error) throw task.error;
      if (!task.data || ["completed", "missed", "cancelled"].includes(task.data.status)) {
        return await finalize({ ok: true, outbound: respond("Bu görev artık açık değil. Çalışma Ekle ile güncel görevlerden yeniden seçebilirsin.") });
      }
      const payload = {
        ...state.payload,
        taskId: task.data.id,
        curriculumNodeId: task.data.curriculum_node_id,
        resourceId: task.data.resource_id,
      };
      if (knownDuration > 0) {
        const saved = await saveManualStudy(payload, knownDuration);
        return await finalize({ ok: true, session: saved.session, replan: saved.replan, outbound: respond(saved.message, [[{ text: "Bugünü gör", callback_data: "today" }]]) });
      }
      await setState(admin, userId, chatId, "manual_duration", payload);
      return await finalize({ ok: true, outbound: respond(`“${task.data.title}” göreviyle eşleştirdim. Kaç dakika çalıştın?`) });
    }

    const state = await getState(admin, userId, chatId);
    if (state && /^\d+$/.test(text)) {
      const value = Number(text);
      if (state.state === "result_correct") {
        await setState(admin, userId, chatId, "result_wrong", { ...state.payload, correct: value });
        return await finalize({ ok: true, outbound: respond( "Yanlış sayısı?") });
      }
      if (state.state === "result_wrong") {
        await setState(admin, userId, chatId, "result_blank", { ...state.payload, wrong: value });
        return await finalize({ ok: true, outbound: respond( "Boş sayısı?") });
      }
      if (state.state === "result_blank") {
        const correct = Number(state.payload.correct);
        const wrong = Number(state.payload.wrong);
        const total = correct + wrong + value;
        if (total <= 0) return await finalize({ ok: true, outbound: respond( "Toplam soru sayısı sıfırdan büyük olmalı. Boş sayısını tekrar gir.") });
        await setState(admin, userId, chatId, "result_confirm", { ...state.payload, blank: value, total });
        return await finalize({
          ok: true,
          outbound: respond( `${correct} doğru\n${wrong} yanlış\n${value} boş\nToplam ${total}`, [[
            { text: "Kaydet", callback_data: "result_save" },
            { text: "İptal", callback_data: "form_cancel" },
          ]]),
        });
      }
      if (state.state === "manual_duration") {
        if (value <= 0) return await finalize({ ok: true, outbound: respond( "Süre sıfırdan büyük olmalı.") });
        const saved = await saveManualStudy(state.payload, value);
        return await finalize({ ok: true, session: saved.session, replan: saved.replan, outbound: respond(saved.message, [[{ text: "Bugünü gör", callback_data: "today" }]]) });
      }
      if (state.state === "special_less_minutes" || state.state === "special_extra_minutes") {
        const normal=Number(state.payload.normalMinutes??0);const less=state.state==="special_less_minutes";
        const inserted=await admin.from("schedule_exceptions").insert({user_id:userId,exam_profile_id:state.payload.profileId,exception_date:day,exception_type:less?"custom":"extra_available",minutes_delta:less?value-normal:value,note:"Telegram özel durum"});if(inserted.error)throw inserted.error;
        const profile=await admin.from("exam_profiles").select("*").eq("id",state.payload.profileId).eq("user_id",userId).single();const plan=await admin.from("weekly_plans").select("*").eq("id",state.payload.planId).eq("user_id",userId).single();
        const replanned=await recalculateCurrentPlan(admin,userId,profile.data,plan.data,"capacity_change",true);await clearState(admin,userId,chatId);
        const updated=replanned.dayCapacities[day]??0;const summary=formatReplanSummary(replanned);return await finalize({ok:true,replan:replanned,outbound:respond(`Bugünkü çalışma alanı ${formatMinutesShort(normal)} → ${formatMinutesShort(updated)} olarak güncellendi.${summary?`\n${summary}`:""}`,[[{text:"Şimdi ne çalışayım?",callback_data:"now"}]])});
      }
    }

    if (state && text) {
      const prompts: Record<string, string> = {
        result_correct: "Doğru sayısını sayı olarak yaz. Örnek: 14",
        result_wrong: "Yanlış sayısını sayı olarak yaz. Örnek: 2",
        result_blank: "Boş sayısını sayı olarak yaz. Örnek: 4",
        manual_duration: "Çalışma süresini dakika olarak yaz. Örnek: 45",
        manual_task: "Aşağıdaki görevlerden birini veya ‘Genel çalışma’ seçeneğini kullan.",
        special_less_minutes: "Bugün çalışabileceğin toplam süreyi dakika olarak yaz. Örnek: 90",
        special_extra_minutes: "Ekstra süreni dakika olarak yaz. Örnek: 30",
        special_mode: "Aşağıdaki seçeneklerden birini kullan: ‘Bugün daha az vaktim var’ veya ‘Ekstra vaktim var’.",
      };
      if (prompts[state.state]) return await finalize({ ok: true, outbound: respond(prompts[state.state]) });
    }

    if (intent === "greeting") {
      return await finalize({
        ok: true,
        outbound: respond(greetingMessage(), mainMenuButtons()),
      });
    }

    if (intent === "help") {
      return await finalize({ ok: true, outbound: respond(friendlyHelpMessage(), mainMenuButtons()) });
    }

    return await finalize({
      ok: true,
      outbound: respond(unknownMessage(), mainMenuButtons()),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (lifecycleAdmin && lifecycleEventId && fallbackChatId && !errorMessage.startsWith("MOCK_FAILURE_")) {
      try {
        const outbound = await deliverTelegram(textDelivery(
          fallbackChatId,
          "Kısa bir sorun oldu. Bugünkü planını yeniden kontrol edelim.",
          [[{ text: "Bugünü kontrol et", callback_data: "today" }]],
        ));
        const completed = await lifecycleAdmin.rpc("complete_external_event", {
          p_provider: "telegram",
          p_external_event_id: lifecycleEventId,
        });
        if (!completed.error) {
          lifecycleEventId = null;
          return json({ ok: false, recovered: true, outbound });
        }
      } catch {
        // The lifecycle failure below keeps Telegram's retry semantics intact.
      }
    }
    if (lifecycleAdmin && lifecycleEventId) {
      await lifecycleAdmin.rpc("fail_external_event", {
        p_provider: "telegram",
        p_external_event_id: lifecycleEventId,
        p_last_error: errorMessage,
      });
    }
    return json({ ok: false, error: errorMessage }, 400);
  }
});
