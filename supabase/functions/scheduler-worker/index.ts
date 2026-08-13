import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildDailyPlanSummary,
  generateWeeklyReport,
  localDayRange,
} from "../_shared/pilot.ts";
import {
  dailyCoachCard,
  formatDailyCoachMessage,
  weeklyReportPresentation,
  weeklyStartPresentation,
} from "../_shared/telegram-coach.ts";
import { cardDelivery, deliverTelegram, textDelivery } from "../_shared/telegram-transport.ts";
import { recalculateCurrentPlan } from "../_shared/adaptive.ts";
import { ensureP48WeekPlanForService } from "../_shared/p48-week.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

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
        const weekStart = action.payload.weekStartDate ?? (() => { const value=new Date(`${action.payload.localDate}T12:00:00Z`); const day=value.getUTCDay()||7; value.setUTCDate(value.getUTCDate()-day+1); return value.toISOString().slice(0,10); })();
        await ensureP48WeekPlanForService(admin, action.user_id, profile.data, action.payload.localDate);
        const activePlan = await admin.from("weekly_plans").select("*").eq("user_id",action.user_id).eq("exam_profile_id",action.exam_profile_id).eq("week_start_date",weekStart).eq("status","active").maybeSingle();
        if (activePlan.error) throw activePlan.error;
        if (activePlan.data) await recalculateCurrentPlan(admin,action.user_id,profile.data,activePlan.data,"study_deviation",true);
        const summary = await buildDailyPlanSummary(admin, action.user_id, profile.data, action.payload.localDate);
        result = { ...result, summary };
        if (identity.data?.external_chat_id) {
          const range = localDayRange(action.payload.localDate);
          const manualView = await admin.from("recommendation_events").select("id", { count: "exact", head: true })
            .eq("user_id", action.user_id)
            .eq("exam_profile_id", action.exam_profile_id)
            .eq("event_type", "daily_plan")
            .eq("channel", "telegram")
            .gte("created_at", range.startUtc)
            .lt("created_at", range.endUtc);
          if (manualView.error) throw manualView.error;
          if ((manualView.count ?? 0) > 0) {
            result = { ...result, notification: "suppressed_manual_view" };
          } else {
            const reserved = await admin.rpc("reserve_scheduled_action_notification", { p_action_id: action.id });
            if (reserved.error) throw reserved.error;
            if (reserved.data) {
              const recommendation = summary.recommendation;
              const primaryButton = recommendation?.needsResult
                ? { text: "Sonuç Gir", callback_data: `result_begin:${recommendation.taskId}` }
                : { text: "Şimdi başla", callback_data: "now" };
              const buttons = [[primaryButton], [{ text: "Bugünü gör", callback_data: "today" }, { text: "Az vaktim var", callback_data: "special_less" }]];
              const weeklyStart = new Date(`${action.payload.localDate}T12:00:00Z`).getUTCDay() === 1;
              const presentation = weeklyStart ? weeklyStartPresentation(summary) : { text: formatDailyCoachMessage(summary), card: dailyCoachCard(summary) };
              const outbound = await deliverTelegram(summary.plan
                ? cardDelivery(identity.data.external_chat_id, presentation.card, presentation.text, buttons)
                : textDelivery(identity.data.external_chat_id, presentation.text, [[{ text: "Tekrar dene", callback_data: "today" }]]));
              result = { ...result, notification: "sent", outbound };
            } else result = { ...result, notification: "deduplicated" };
          }
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
              const outbound = await deliverTelegram(textDelivery(identity.data.external_chat_id,
                "Dün için çalışma kaydı görünmüyor. Çalıştıysan ekleyebilirsin.", [[
                  { text: "Çalışmadım", callback_data: `gap_no_study:${event.data.id}` },
                  { text: "Çalışma ekle", callback_data: `gap_add_study:${event.data.id}` },
                ]]));
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
          if (reserved.data) {
            const presentation = weeklyReportPresentation(report);
            result = { ...result, notification: "sent", outbound: await deliverTelegram(cardDelivery(
              identity.data.external_chat_id,
              presentation.card,
              presentation.text,
              [[{ text: "Yeni haftayı aç", callback_data: "today" }], [{ text: "Dikkat konusunu çalış", callback_data: "revisions" }]],
            )) };
          }
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
