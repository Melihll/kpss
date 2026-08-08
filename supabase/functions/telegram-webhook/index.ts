import { createClient } from "npm:@supabase/supabase-js@2";
import { getNextBestTask } from "../_shared/planning.bundle.js";
import { recalculateTopicMastery, revisionWithUrgency } from "../_shared/mastery.ts";
import { loadAdaptiveBase, minimumDayPlan, recalculateCurrentPlan } from "../_shared/adaptive.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const hash = async (value: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

type Button = { text: string; callback_data: string };
type Admin = ReturnType<typeof createClient>;
type TelegramDelivery = {
  __telegramDelivery: true;
  method: string;
  payload: Record<string, unknown>;
};

async function telegramCall(method: string, payload: Record<string, unknown>) {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const mock = Deno.env.get("TELEGRAM_TRANSPORT_MODE") === "mock";
  if (mock || !token) return { ...payload, transport: mock ? "mock" : "TELEGRAM_NOT_CONFIGURED" };
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`TELEGRAM_${method.toUpperCase()}_FAILED`);
  return payload;
}

const sendMessage = (chatId: string, text: string, buttons: Button[][] = []): TelegramDelivery => ({
  __telegramDelivery: true,
  method: "sendMessage",
  payload: {
    chat_id: chatId,
    text,
    reply_markup: buttons.length ? { inline_keyboard: buttons } : undefined,
  },
});

const editMessage = (chatId: string, messageId: number, text: string, buttons: Button[][] = []) =>
  telegramCall("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    reply_markup: buttons.length ? { inline_keyboard: buttons } : undefined,
  });

const answerCallbackQuery = (callbackQueryId: string) =>
  telegramCall("answerCallbackQuery", { callback_query_id: callbackQueryId });

async function deliverBody(body: Record<string, unknown>) {
  const outbound = body.outbound as TelegramDelivery | undefined;
  if (!outbound?.__telegramDelivery) return body;
  return {
    ...body,
    outbound: await telegramCall(outbound.method, outbound.payload),
  };
}

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
const monday = (date: string) => {
  const value = new Date(`${date}T12:00:00Z`);
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() - day + 1);
  return value.toISOString().slice(0, 10);
};

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
      const delivered = await deliverBody(body);
      await complete();
      return json(delivered, status);
    };

    if (claimed.data.businessCompleted && claimed.data.resultPayload) {
      const saved = claimed.data.resultPayload as { body: Record<string, unknown>; status: number };
      const delivered = await deliverBody(saved.body);
      await complete();
      return json(delivered, saved.status);
    }
    if (mockFailureStage === "before-business") throw new Error("MOCK_FAILURE_BEFORE_BUSINESS");

    const callbackQuery = update.callback_query;
    const message = update.message ?? callbackQuery?.message;
    const from = update.message?.from ?? callbackQuery?.from;
    if (!from || !message?.chat?.id) throw new Error("INVALID_TELEGRAM_UPDATE");
    const chatId = String(message.chat.id);
    const text = String(update.message?.text ?? "").trim();
    const callback = String(callbackQuery?.data ?? "");
    if (callbackQuery?.id) await answerCallbackQuery(String(callbackQuery.id));

    if (text.startsWith("/start ")) {
      const linked = await admin.rpc("consume_messaging_link_token", {
        p_token_hash: await hash(text.slice(7).trim()),
        p_external_user_id: String(from.id),
        p_external_chat_id: chatId,
        p_username: from.username ?? null,
      });
      if (linked.error) throw linked.error;
      return await finalize({ ok: true, outbound: await sendMessage(chatId, "Telegram hesabın KPSS Koçu'na bağlandı.") });
    }

    const identity = await admin.from("messaging_identities")
      .select("user_id")
      .eq("provider", "telegram")
      .eq("external_user_id", String(from.id))
      .maybeSingle();
    if (identity.error) throw identity.error;
    if (!identity.data) {
      return await finalize({ ok: true, outbound: await sendMessage(chatId, "Önce web dashboard üzerinden Telegram hesabını bağla.") });
    }

    const userId = identity.data.user_id;
    const day = today();
    const week = monday(day);

    if (text === "/minimum" || callback === "minimum") {
      const profile = await admin.from("exam_profiles").select("*").eq("user_id", userId).eq("status", "active").maybeSingle();
      const plan = profile.data ? await admin.from("weekly_plans").select("*").eq("user_id",userId).eq("exam_profile_id",profile.data.id).eq("week_start_date",week).eq("status","active").maybeSingle() : {data:null};
      if (!profile.data || !plan.data) return await finalize({ok:true,outbound:await sendMessage(chatId,"Aktif haftalık plan bulunamadı.")});
      const minimum = await minimumDayPlan(admin,userId,profile.data,plan.data,day);
      const lines = minimum.tasks.map((task:any,index:number)=>`${index+1}. ${task.title} — ${task.minutes} dk`).join("\n");
      return await finalize({ok:true,minimum,outbound:await sendMessage(chatId,minimum.tasks.length?`Minimum planın (${minimum.totalMinutes} dk)\n\n${lines}`:"Bugünkü sürene uyan anlamlı minimum görev yok.")});
    }

    if (text === "/ozel" || callback === "special") {
      await setState(admin,userId,chatId,"special_mode",{});
      return await finalize({ok:true,outbound:await sendMessage(chatId,"Bugünkü planını etkileyen durum?",[[{text:"Bugün daha az vaktim var",callback_data:"special_less"}],[{text:"Ekstra vaktim var",callback_data:"special_extra"}],[{text:"İptal",callback_data:"form_cancel"}]])});
    }
    if (callback === "special_less" || callback === "special_extra") {
      const profile = await admin.from("exam_profiles").select("*").eq("user_id",userId).eq("status","active").maybeSingle();
      const plan = profile.data ? await admin.from("weekly_plans").select("*").eq("user_id",userId).eq("exam_profile_id",profile.data.id).eq("week_start_date",week).eq("status","active").maybeSingle() : {data:null};
      if(!profile.data||!plan.data)return await finalize({ok:true,outbound:await sendMessage(chatId,"Aktif haftalık plan bulunamadı.")});
      const base=await loadAdaptiveBase(admin,userId,profile.data,plan.data);
      await setState(admin,userId,chatId,callback==="special_less"?"special_less_minutes":"special_extra_minutes",{profileId:profile.data.id,planId:plan.data.id,normalMinutes:base.dayCapacities[day]??0});
      return await finalize({ok:true,outbound:await sendMessage(chatId,callback==="special_less"?"Bugün toplam kaç dakika çalışabilirsin?":"Bugün kaç dakika fazladan çalışabilirsin?")});
    }

    if (text === "/tekrar") {
      const revisions = await admin.from("revision_schedules")
        .select("id,scheduled_for,revision_type,estimated_minutes,curriculum_nodes(name,subjects(name))")
        .eq("user_id", userId)
        .in("status", ["scheduled", "due"])
        .lte("scheduled_for", day)
        .order("scheduled_for", { ascending: true });
      if (revisions.error) throw revisions.error;
      if (!revisions.data?.length) {
        return await finalize({ ok: true, outbound: await sendMessage(chatId, "Bugün bekleyen tekrarın yok.") });
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
      const buttons = revisions.data.map((row: any) => [{ text: "Tekrarı Tamamla", callback_data: `revision_complete:${row.id}` }]);
      return await finalize({ ok: true, revisions: revisions.data, outbound: await sendMessage(chatId, `Bugünkü tekrarların\n\n${rows.join("\n\n")}`, buttons) });
    }

    if (callback.startsWith("revision_complete:")) {
      const completed = await admin.rpc("telegram_complete_revision", {
        p_user_id: userId,
        p_revision_id: callback.slice(18),
      });
      if (completed.error) throw completed.error;
      return await finalize({ ok: true, revision: completed.data, outbound: await sendMessage(chatId, "Tekrar tamamlandı.") });
    }

    if (text === "/bugun") {
      const tasks = await admin.from("tasks")
        .select("id,title,estimated_minutes")
        .eq("user_id", userId)
        .eq("planned_date", day)
        .in("status", ["planned", "ready", "in_progress", "partially_completed", "rescheduled"])
        .order("priority_score", { ascending: false });
      if (tasks.error) throw tasks.error;
      const total = (tasks.data ?? []).reduce((sum, task) => sum + task.estimated_minutes, 0);
      const lines = (tasks.data ?? []).map((task, index) => `${index + 1}. ${task.title} — ${task.estimated_minutes} dk`).join("\n");
      return await finalize({
        ok: true,
        outbound: await sendMessage(
          chatId,
          `Bugünkü planın\n\n${tasks.data?.length ?? 0} görev\nTahmini toplam: ${Math.floor(total / 60)}s ${total % 60}dk\n\n${lines}`,
          [[{ text: "Şimdi Ne Yapmalıyım?", callback_data: "now" }], [{ text: "Minimum Plan", callback_data: "minimum" }], [{ text: "Özel Durum", callback_data: "special" },{ text: "Çalışma Ekle", callback_data: "manual_begin" }]],
        ),
      });
    }

    if (text === "/simdi" || callback === "now") {
      const plan = await admin.from("weekly_plans")
        .select("*")
        .eq("user_id", userId)
        .eq("week_start_date", week)
        .eq("status", "active")
        .maybeSingle();
      if (!plan.data) return await finalize({ ok: true, outbound: await sendMessage(chatId, "Şu anda aktif haftalık görev bulunamadı.") });
      const tasks = await admin.from("tasks")
        .select("id,title,status,importance,priority_score,planned_date,estimated_minutes,created_at,curriculum_node_id,revision_schedule_id,task_progress(completed_minutes)")
        .eq("user_id", userId)
        .eq("weekly_plan_id", plan.data.id);
      if (tasks.error) throw tasks.error;
      const profile = await admin.from("exam_profiles").select("*").eq("user_id",userId).eq("status","active").maybeSingle();
      const adaptive = profile.data ? await loadAdaptiveBase(admin,userId,profile.data,plan.data) : null;
      const adaptiveTasks = new Map((adaptive?.adaptiveTasks??[]).map((item:any)=>[item.id,item]));
      const mapped = (tasks.data ?? []).map((task: any) => ({
        id: task.id,
        status: task.status,
        importance: task.importance,
        priorityScore: task.priority_score,
        plannedDate: task.planned_date,
        estimatedMinutes: task.estimated_minutes,
        completedMinutes: task.task_progress?.[0]?.completed_minutes ?? 0,
        createdAt: task.created_at,
        isRevision:Boolean(task.revision_schedule_id),
        revisionUrgency:adaptive?.allAdaptiveRevisions.find((row:any)=>row.id===task.revision_schedule_id)?.urgency??null,
        masteryLevel:(adaptiveTasks.get(task.id) as any)?.masteryLevel??null,
        topicState:(adaptiveTasks.get(task.id) as any)?.topicState??null,
      }));
      try {
        const recommendation = getNextBestTask(mapped, { today: day, availableMinutes:adaptive?.dayCapacities[day]??null });
        const task = (tasks.data ?? []).find((candidate) => candidate.id === recommendation.recommendedTask.id)!;
        return await finalize({
          ok: true,
          outbound: await sendMessage(
            chatId,
            `Şimdi:\n\n${task.title}\nTahmini kalan: ${recommendation.remainingMinutes} dk`,
            [[{ text: "Çalışmaya Başla", callback_data: `task_start:${task.id}` }]],
          ),
          recommendation: { taskId: task.id, reason: recommendation.reason },
        });
      } catch {
        return await finalize({ ok: true, outbound: await sendMessage(chatId, "Şu anda aktif haftalık görev bulunamadı.") });
      }
    }

    if (callback.startsWith("task_start:")) {
      const started = await admin.rpc("telegram_start_study_session", {
        p_user_id: userId,
        p_task_id: callback.slice(11),
      });
      if (started.error) throw started.error;
      return await finalize({
        ok: true,
        outbound: await sendMessage(chatId, "Çalışma başladı.\n\nBitirdiğinde aşağıdaki düğmeyi kullan.", [[{
          text: "Çalışmayı Bitir",
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
      const task = finished.data.task_id
        ? await admin.from("tasks").select("task_type").eq("id", finished.data.task_id).eq("user_id", userId).maybeSingle()
        : { data: null };
      const buttons = task.data?.task_type === "solve_resource_units"
        ? [[{ text: "Sonuç Gir", callback_data: `result_begin:${finished.data.task_id}` }, { text: "Sonra", callback_data: "result_later" }]]
        : [];
      return await finalize({
        ok: true,
        outbound: await sendMessage(chatId, `Çalışma tamamlandı.\nSüre: ${finished.data.duration_minutes} dk`, buttons),
        session: finished.data,
      });
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
      if (!task.data || !unit) return await finalize({ ok: true, outbound: await sendMessage(chatId, "Sonuç girilecek bekleyen test ünitesi bulunamadı.") });
      await setState(admin, userId, chatId, "result_correct", {
        taskId: task.data.id,
        examProfileId: task.data.exam_profile_id,
        subjectId: task.data.subject_id,
        curriculumNodeId: task.data.curriculum_node_id,
        resourceId: task.data.resource_id,
        resourceUnitId: unit.resource_unit_id,
      });
      return await finalize({ ok: true, outbound: await sendMessage(chatId, "Doğru sayısı?") });
    }

    if (callback === "result_save") {
      const state = await getState(admin, userId, chatId);
      if (state?.state !== "result_confirm") throw new Error("RESULT_FORM_EXPIRED");
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
      return await finalize({
        ok: true,
        result: result.data,
        mastery,
        masteryPending,
        outbound: await sendMessage(
          chatId,
          `Sonuç kaydedildi: ${result.data.correct_count}D ${result.data.wrong_count}Y ${result.data.blank_count}B\nBaşarı: %${(Number(result.data.accuracy) * 100).toFixed(1)}${buttons.length ? "\n\nYanlışlarının çözümlerini inceledin mi?" : ""}`,
          buttons,
        ),
      });
    }

    if (callback.startsWith("result_review:")) {
      const reviewed = await admin.rpc("telegram_review_test_result", {
        p_user_id: userId,
        p_result_id: callback.slice(14),
      });
      if (reviewed.error) throw reviewed.error;
      return await finalize({ ok: true, result: reviewed.data, outbound: await sendMessage(chatId, "Yanlış incelemesi tamamlandı olarak işaretlendi.") });
    }

    if (callback === "result_later" || callback === "form_cancel") {
      await clearState(admin, userId, chatId);
      return await finalize({ ok: true, outbound: await sendMessage(chatId, callback === "result_later" ? "Sonuç/inceleme beklemede kalacak." : "İşlem iptal edildi.") });
    }

    if (text === "/calisma_ekle" || callback === "manual_begin") {
      const profile = await admin.from("exam_profiles").select("id").eq("user_id", userId).eq("status", "active").maybeSingle();
      if (!profile.data) return await finalize({ ok: true, outbound: await sendMessage(chatId, "Aktif sınav profili bulunamadı.") });
      const subjects = await admin.from("user_subjects")
        .select("subject_id,subjects(name)")
        .eq("user_id", userId)
        .eq("exam_profile_id", profile.data.id)
        .eq("status", "active");
      if (subjects.error) throw subjects.error;
      await setState(admin, userId, chatId, "manual_subject", { examProfileId: profile.data.id });
      const buttons = (subjects.data ?? []).map((item: any) => [{
        text: item.subjects?.name ?? "Ders",
        callback_data: `manual_subject:${item.subject_id}`,
      }]);
      return await finalize({ ok: true, outbound: await sendMessage(chatId, "Hangi dersi çalıştın?", buttons) });
    }

    if (callback.startsWith("manual_subject:")) {
      const state = await getState(admin, userId, chatId);
      if (state?.state !== "manual_subject") throw new Error("MANUAL_FORM_EXPIRED");
      await setState(admin, userId, chatId, "manual_duration", {
        ...state.payload,
        subjectId: callback.slice(15),
      });
      return await finalize({ ok: true, outbound: await sendMessage(chatId, "Kaç dakika çalıştın?") });
    }

    const state = await getState(admin, userId, chatId);
    if (state && /^\d+$/.test(text)) {
      const value = Number(text);
      if (state.state === "result_correct") {
        await setState(admin, userId, chatId, "result_wrong", { ...state.payload, correct: value });
        return await finalize({ ok: true, outbound: await sendMessage(chatId, "Yanlış sayısı?") });
      }
      if (state.state === "result_wrong") {
        await setState(admin, userId, chatId, "result_blank", { ...state.payload, wrong: value });
        return await finalize({ ok: true, outbound: await sendMessage(chatId, "Boş sayısı?") });
      }
      if (state.state === "result_blank") {
        const correct = Number(state.payload.correct);
        const wrong = Number(state.payload.wrong);
        const total = correct + wrong + value;
        if (total <= 0) return await finalize({ ok: true, outbound: await sendMessage(chatId, "Toplam soru sayısı sıfırdan büyük olmalı. Boş sayısını tekrar gir.") });
        await setState(admin, userId, chatId, "result_confirm", { ...state.payload, blank: value, total });
        return await finalize({
          ok: true,
          outbound: await sendMessage(chatId, `${correct} doğru\n${wrong} yanlış\n${value} boş\nToplam ${total}`, [[
            { text: "Kaydet", callback_data: "result_save" },
            { text: "İptal", callback_data: "form_cancel" },
          ]]),
        });
      }
      if (state.state === "manual_duration") {
        if (value <= 0) return await finalize({ ok: true, outbound: await sendMessage(chatId, "Süre sıfırdan büyük olmalı.") });
        const session = await admin.rpc("telegram_record_retroactive_session", {
          p_user_id: userId,
          p_payload: { ...state.payload, durationMinutes: value },
        });
        if (session.error) throw session.error;
        await clearState(admin, userId, chatId);
        return await finalize({ ok: true, session: session.data, outbound: await sendMessage(chatId, `${value} dakikalık çalışma kaydedildi.`) });
      }
      if (state.state === "special_less_minutes" || state.state === "special_extra_minutes") {
        const normal=Number(state.payload.normalMinutes??0);const less=state.state==="special_less_minutes";
        const inserted=await admin.from("schedule_exceptions").insert({user_id:userId,exam_profile_id:state.payload.profileId,exception_date:day,exception_type:less?"custom":"extra_available",minutes_delta:less?value-normal:value,note:"Telegram özel durum"});if(inserted.error)throw inserted.error;
        const profile=await admin.from("exam_profiles").select("*").eq("id",state.payload.profileId).eq("user_id",userId).single();const plan=await admin.from("weekly_plans").select("*").eq("id",state.payload.planId).eq("user_id",userId).single();
        const replanned=await recalculateCurrentPlan(admin,userId,profile.data,plan.data,"capacity_change",true);await clearState(admin,userId,chatId);
        const updated=replanned.dayCapacities[day]??0;return await finalize({ok:true,replan:replanned,outbound:await sendMessage(chatId,`Bugünkü kapasite ${normal} dk → ${updated} dk olarak güncellendi.\n${replanned.decision.explanation}`)});
      }
    }

    return await finalize({
      ok: true,
      outbound: await sendMessage(chatId, "Desteklenen komutlar: /bugun, /simdi, /tekrar, /minimum, /ozel, /calisma_ekle"),
    });
  } catch (error) {
    if (lifecycleAdmin && lifecycleEventId) {
      await lifecycleAdmin.rpc("fail_external_event", {
        p_provider: "telegram",
        p_external_event_id: lifecycleEventId,
        p_last_error: error instanceof Error ? error.message : String(error),
      });
    }
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 400);
  }
});

void editMessage;
