import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const withoutComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");
const requireMatch = (source, expression, message) => {
  if (!expression.test(source)) throw new Error(message);
};
const forbidMatch = (source, expression, message) => {
  if (expression.test(source)) throw new Error(message);
};

const handler = withoutComments(
  read("supabase/functions/ai-coach-plan-preview/handler.ts"),
);
const index = withoutComments(
  read("supabase/functions/ai-coach-plan-preview/index.ts"),
);
const targetCapacity = withoutComments(
  read("supabase/functions/_shared/ai-coach/target-capacity.ts"),
);
const endpoint = `${handler}\n${index}\n${targetCapacity}`;
const config = read("supabase/config.toml");

for (const expression of [
  /\.(?:insert|update|delete|upsert|rpc)\s*\(/i,
  /apply_plan_revision/i,
  /telegram_apply_plan_revision/i,
  /recalculateCurrentPlan/i,
  /(?:tasks|weekly_plans|plan_revisions|p48_daily_capacity_overrides|schedule_exceptions)\s*\.\s*(?:insert|update|delete|upsert)/i,
]) {
  forbidMatch(endpoint, expression, `preview endpoint contains forbidden capability ${expression}`);
}

for (const required of [
  /executeAiStudyMessageV1/,
  /OpenAiGatewayV1/,
  /runPlanningV2ShadowDecision/,
  /loadCurrentGrossCapacityForDate/,
]) {
  requireMatch(index, required, `preview endpoint missing required safe path ${required}`);
}


requireMatch(
  handler,
  /loadCurrentGrossCapacity\(\{[\s\S]*?client:\s*userClient[\s\S]*?\}\)/,
  "targetMinutes capacity lookup must use the caller-scoped client",
);

requireMatch(
  config,
  /\[functions\.ai-coach-plan-preview\][\s\S]*?verify_jwt\s*=\s*true/,
  "ai-coach-plan-preview must keep JWT verification enabled",
);

console.log("AI coach plan preview safety checks passed");
console.log("real-plan mutations: 0 detected");
console.log("approved runner:      Planning V2 shadow only");
console.log("JWT verification:     enabled");
