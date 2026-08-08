import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildDailyPlanSummary,
  formatMinutes,
  generateWeeklyReport,
  localDayRange,
  weeklyReportMessage,
} from "../_shared/pilot.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

async function sendTelegram(chatId: string, text: string, buttons: Array<Array<{text:string;callback_data:string}>> = []) {
  const payload: Record<string, unknown> = { chat_id: chatId, text };
  if (buttons.length) payload.reply_markup = { inline_keyboard: buttons };
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const mock = Deno.env.get("TELEGRAM_TRANSPORT_MODE") === "mock";
  if (mock || !token) return { ...payload, transport: mock ? "mock" : "TELEGRAM_NOT_CONFIGURED" };
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`TELEGRAM_SEND_FAILED:${response.status}`);
  return await response.json();
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  const expected = Deno.env.get("SCHEDULER_WORKER_SECRET");
  if (!expected || request.headers.get("X-Scheduler-Secret") !== expected) return json({ error: "FORBIDDEN" }, 403);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const body = await request.json().catch(() => ({}));
  const generated = await admin.rpc("generate_pilot_scheduled_actions", {
    p_reference: body.reference ?? new Date().toISOString(),
  });
  if (generated.error) throw generated.error;
  const claimed = await admin.rpc("claim_due_scheduled_actions", { p_limit: body.limit ?? 20, p_stale_seconds: 300 });
  if (claimed.error) throw claimed.error;
  const results: any[] = [];

  for (const action of claimed.data ?? []) {
    try {
      const identity = await admin.from("messaging_identities").select("external_chat_id")
        .eq("user_id", action.user_id).eq("provider", "telegram").maybeSingle();
      if (identity.error) throw identity.error;
      const profile = await admin.from("exam_profiles").select("*").eq("id", action.exam_profile_id)
        .eq("user_id", action.user_id).eq("status", "active").maybeSingle();
      if (profile.error) throw profile.error;
      if (!profile.data) throw new Error("NO_ACTIVE_EXAM_PROFILE");
      let result: Record<string, unknown> = { actionType: action.action_type, notification: "skipped_not_linked" };

      if (action.action_type === "daily_plan") {
        const summary = await buildDailyPlanSummary(admin, action.user_id, profile.data, action.payload.localDate);
        result = { ...result, summary };
        if (identity.data?.external_chat_id) {
          const reserved = await admin.rpc("reserve_scheduled_action_notification", { p_action_id: action.id });
          if (reserved.error) throw reserved.error;
          if (reserved.data) {
            const recommendation = summary.recommendation
              ? `\n\nŞimdi en mantıklı görev:\n${summary.recommendation.title}\n${summary.recommendation.remainingMinutes} dk`
              : "";
            const outbound = await sendTelegram(identity.data.external_chat_id,
              `Bugünkü planın\n\n${summary.taskCount} görev\nTahmini toplam: ${formatMinutes(summary.totalMinutes)}${recommendation}`);
            result = { ...result, notification: "sent", outbound };
          } else result = { ...result, notification: "deduplicated" };
        }
      } else if (action.action_type === "data_gap_check") {
        const range = localDayRange(action.payload.gapDate);
        const sessions = await admin.from("study_sessions").select("id", { count: "exact", head: true })
          .eq("user_id", action.user_id).eq("exam_profile_id", action.exam_profile_id).eq("status", "completed")
          .gte("started_at", range.startUtc).lt("started_at", range.endUtc);
        if (sessions.error) throw sessions.error;
        if ((sessions.count ?? 0) > 0) result = { ...result, gap: false, notification: "not_needed" };
        else {
          const upserted = await admin.from("data_gap_events").upsert({
            user_id: action.user_id, exam_profile_id: action.exam_profile_id, gap_date: action.payload.gapDate,
            gap_type: "missing_study_confirmation",
          }, { onConflict: "user_id,gap_date,gap_type", ignoreDuplicates: true });
          if (upserted.error) throw upserted.error;
          const event = await admin.from("data_gap_events").select("*").eq("user_id", action.user_id)
            .eq("gap_date", action.payload.gapDate).eq("gap_type", "missing_study_confirmation").single();
          if (event.error) throw event.error;
          result = { ...result, gap: true, dataGapEventId: event.data.id };
          if (identity.data?.external_chat_id && event.data.status === "open") {
            const reserved = await admin.from("data_gap_events").update({ notified_at: new Date().toISOString() })
              .eq("id", event.data.id).eq("user_id", action.user_id).is("notified_at", null).select("id").maybeSingle();
            if (reserved.error) throw reserved.error;
            if (reserved.data) {
              const outbound = await sendTelegram(identity.data.external_chat_id,
                "Dün için çalışma kaydı göremiyorum.", [[
                  { text: "Çalışmadım", callback_data: `gap_no_study:${event.data.id}` },
                  { text: "Çalıştım — Ekle", callback_data: `gap_add_study:${event.data.id}` },
                ]]);
              result = { ...result, notification: "sent", outbound };
            } else result = { ...result, notification: "deduplicated" };
          }
        }
      } else if (action.action_type === "weekly_report") {
        const report = await generateWeeklyReport(admin, action.user_id, profile.data, action.payload.weekStartDate);
        result = { ...result, report };
        if (identity.data?.external_chat_id) {
          const reserved = await admin.rpc("reserve_scheduled_action_notification", { p_action_id: action.id });
          if (reserved.error) throw reserved.error;
          if (reserved.data) result = { ...result, notification: "sent", outbound: await sendTelegram(identity.data.external_chat_id, weeklyReportMessage(report)) };
          else result = { ...result, notification: "deduplicated" };
        }
      }

      const completed = await admin.rpc("complete_scheduled_action", { p_action_id: action.id, p_result: result });
      if (completed.error) throw completed.error;
      results.push({ id: action.id, status: "completed", ...result });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      const failed = await admin.rpc("fail_scheduled_action", { p_action_id: action.id, p_error: message });
      results.push({ id: action.id, status: "failed", error: failed.error?.message ?? message });
    }
  }

  return json({ ok: true, generated: generated.data, claimed: claimed.data?.length ?? 0, results });
});
