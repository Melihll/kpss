import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function withoutComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function requireMatch(source, expression, message) {
  if (!expression.test(source)) throw new Error(message);
}

function forbidMatch(source, expression, message) {
  if (expression.test(source)) throw new Error(message);
}

const handler = withoutComments(
  read("supabase/functions/ai-coach-interpret/handler.ts"),
);
const index = withoutComments(
  read("supabase/functions/ai-coach-interpret/index.ts"),
);
const provider = withoutComments(
  read("supabase/functions/_shared/ai-coach/openai-gateway.ts"),
);
const endpoint = `${handler}\n${index}`;
const runtime = `${endpoint}\n${provider}`;
const config = read("supabase/config.toml");

for (const expression of [
  /\.(?:insert|update|delete|upsert|rpc)\s*\(/i,
  /apply_plan_revision/i,
  /runPlanningV2ShadowDecision/i,
  /planning-v2-shadow/i,
  /scheduler-worker/i,
  /telegram-webhook/i,
  /SUPABASE_SERVICE_ROLE_KEY/i,
]) {
  forbidMatch(runtime, expression, `AI coach runtime contains forbidden capability ${expression}`);
}

requireMatch(
  index,
  /executeAiStudyMessageV1/,
  "AI coach endpoint does not use the mandatory safe executor",
);
requireMatch(
  index,
  /OpenAiGatewayV1/,
  "AI coach endpoint does not use OpenAiGatewayV1",
);
requireMatch(
  config,
  /\[functions\.ai-coach-interpret\][\s\S]*?verify_jwt\s*=\s*true/,
  "ai-coach-interpret must keep Supabase JWT verification enabled",
);

console.log("AI coach safety checks passed");
console.log("database mutations: 0 detected");
console.log("planning calls:      0 detected");
console.log("service-role access: 0 detected");
console.log("JWT verification:    enabled");
