import { createClient } from "npm:@supabase/supabase-js@2";
import { executeAiStudyMessageV1 } from "../_shared/ai-coach.bundle.js";
import { OpenAiGatewayV1 } from "../_shared/ai-coach/openai-gateway.ts";
import { loadCurrentGrossCapacityForDate } from "../_shared/ai-coach/target-capacity.ts";
import { runPlanningV2ShadowDecision } from "../_shared/planning-v2-shadow.ts";
import { createAiCoachPlanPreviewHandler } from "./handler.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

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
});

Deno.serve(handler);
