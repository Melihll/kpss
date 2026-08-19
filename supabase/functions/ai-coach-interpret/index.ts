import { createClient } from "npm:@supabase/supabase-js@2";
import { executeAiStudyMessageV1 } from "../_shared/ai-coach.bundle.js";
import { OpenAiGatewayV1 } from "../_shared/ai-coach/openai-gateway.ts";
import { createAiCoachInterpretHandler } from "./handler.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

const handler = createAiCoachInterpretHandler({
  createUserClient: (authorization) =>
    createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false },
      },
    ),
  createGateway: () => {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      throw new Error("AI_PROVIDER_UNAVAILABLE");
    }
    return new OpenAiGatewayV1({ apiKey });
  },
  executeAiStudyMessage: executeAiStudyMessageV1,
});

Deno.serve(handler);
