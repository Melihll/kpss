import { createClient } from "npm:@supabase/supabase-js@2";
import { runPlanningV2ShadowDecision } from "../_shared/planning-v2-shadow.ts";
import { createPlanningV2ShadowHandler } from "./handler.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

const handler = createPlanningV2ShadowHandler({
  createUserClient: (authorization) =>
    createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false },
      },
    ),

  createServiceClient: () =>
    createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    ),

  runShadowDecision: runPlanningV2ShadowDecision,
});

Deno.serve(handler);
