import { createClient } from "npm:@supabase/supabase-js@2";
import { executeAiStudyMessageV1 } from "../_shared/ai-coach.bundle.js";
import { OpenAiGatewayV1 } from "../_shared/ai-coach/openai-gateway.ts";
import { loadCurrentGrossCapacityForDate } from "../_shared/ai-coach/target-capacity.ts";
import { runPlanningV2ShadowDecision } from "../_shared/planning-v2-shadow.ts";
import { previewCurrentPlan } from "../_shared/adaptive.ts";
import { createAiCoachPlanPreviewHandler } from "./handler.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

function mondayOf(date: string): string {
  const value = new Date(`${date}T12:00:00Z`);
  const offset = (value.getUTCDay() + 6) % 7;
  value.setUTCDate(value.getUTCDate() - offset);
  return value.toISOString().slice(0, 10);
}

function mutationSignature(proposal: any): string {
  const moves = (proposal?.moves ?? proposal?.tasksToMove ?? []).map((item: any) =>
    `M:${item.taskId}:${item.fromDate ?? ""}:${item.toDate ?? ""}`
  );
  const backlog = (proposal?.backlog ?? proposal?.tasksToBacklog ?? []).map((item: any) =>
    `B:${typeof item === "string" ? item : item.taskId}`
  );
  return [...moves, ...backlog].sort().join("|");
}

const handler = createAiCoachPlanPreviewHandler({
  createUserClient: (authorization) =>
    createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false },
      },
    ),
  createShadowClient: () =>
    createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    ),
  createGateway: () => {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) throw new Error("AI_PROVIDER_UNAVAILABLE");
    return new OpenAiGatewayV1({ apiKey });
  },
  executeAiStudyMessage: executeAiStudyMessageV1,
  loadCurrentGrossCapacity: loadCurrentGrossCapacityForDate,
  runShadowDecision: runPlanningV2ShadowDecision,
  prepareCapacityConfirmation: async ({
    userClient,
    proposalClient,
    userId,
    examProfileId,
    currentDate,
    capacityEvent,
    shadowResult,
    changes,
  }) => {
    const [profileResult, planResult] = await Promise.all([
      userClient.from("exam_profiles").select("*")
        .eq("id", examProfileId).eq("user_id", userId).single(),
      userClient.from("weekly_plans").select("*")
        .eq("user_id", userId).eq("exam_profile_id", examProfileId)
        .eq("week_start_date", mondayOf(currentDate)).eq("status", "active").single(),
    ]);
    if (profileResult.error || planResult.error) throw new Error("CONFIRMATION_CONTEXT_FAILED");

    const preview = await previewCurrentPlan(
      userClient,userId,profileResult.data,planResult.data,"capacity_change",
      { hypotheticalCapacityEvent: capacityEvent },
    );
    if (!preview.payload || preview.noChange) throw new Error("CONFIRMATION_PAYLOAD_MISSING");
    if (
      mutationSignature(shadowResult.proposal) !== mutationSignature(preview.decision) ||
      (preview.decision.tasksToCreate?.length ?? 0) > 0 ||
      (preview.decision.tasksToCancel?.length ?? 0) > 0
    ) {
      throw new Error("CONFIRMATION_PROPOSAL_DIVERGENCE");
    }

    const scheduleDedupeKey = `coach-capacity-v1:${shadowResult.snapshotId}`;
    const created = await proposalClient.rpc("create_confirmed_action_proposal", {
      p_user_id: userId,
      p_exam_profile_id: examProfileId,
      p_weekly_plan_id: planResult.data.id,
      p_action_kind: "capacity_change",
      p_plan_generation_version: Number(planResult.data.generation_version),
      p_mutation_payload: {
        scheduleException: {
          date: capacityEvent.effectiveDate,
          type: capacityEvent.deltaMinutes > 0 ? "extra_available" : "custom",
          minutesDelta: capacityEvent.deltaMinutes,
          note: "KPSS Coach confirmed capacity change",
          dedupeKey: scheduleDedupeKey,
        },
        planRevisionPayload: preview.payload,
      },
      p_display_payload: {
        changes,
        changedTaskCount: shadowResult.changedTaskCount,
        capacityEvent,
      },
      p_idempotency_key: `coach-confirmation-v1:${shadowResult.snapshotId}`,
    });
    if (created.error) throw created.error;
    return created.data;
  },
});

Deno.serve(handler);
