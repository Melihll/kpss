import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const domain = read("packages/domain/src/ai-coach/ai-economics-v1.ts");
const adapter = read("supabase/functions/_shared/ai-coach/ai-usage-ledger-v1.ts");
const migration = read("supabase/migrations/20260911150000_ai_usage_ledger_v1.sql");
const runtime = [
  read("supabase/functions/ai-coach-interpret/index.ts"),
  read("supabase/functions/ai-coach-plan-preview/index.ts"),
].join("\n");

const counts = {
  DOMAIN_PROVIDER_CALLS: domain.match(/\b(fetch|responses\.create|chat\.completions)\s*\(/g)?.length ?? 0,
  DOMAIN_DB_CALLS: domain.match(/\.(from|rpc|insert|update|upsert|delete)\s*\(/g)?.length ?? 0,
  DOMAIN_PLANNER_CALLS: domain.match(/\b(buildPlannerV2Preview|previewCurrentPlan|apply_confirmed|create_confirmed)\b/g)?.length ?? 0,
  LEDGER_RPC_CALLS: adapter.match(/\.rpc\(AI_USAGE_LEDGER_V1_RPC/g)?.length ?? 0,
  LEDGER_ARBITRARY_TABLE_WRITES: adapter.match(/\.(insert|update|upsert|delete)\s*\(/g)?.length ?? 0,
  RUNTIME_ROUTER_WIRING: runtime.match(/(routeAiCapabilityV1|AiUsageEventV1|recordAiUsageEventV1)/g)?.length ?? 0,
};

let failed = false;
for (const [name, count] of Object.entries(counts)) {
  console.log(`${name}=${count}`);
}
if (counts.DOMAIN_PROVIDER_CALLS !== 0 || counts.DOMAIN_DB_CALLS !== 0 || counts.DOMAIN_PLANNER_CALLS !== 0) failed = true;
if (counts.LEDGER_RPC_CALLS !== 1 || counts.LEDGER_ARBITRARY_TABLE_WRITES !== 0 || counts.RUNTIME_ROUTER_WIRING !== 0) failed = true;

const forbiddenStorageColumns = ["prompt", "message", "conversation", "coach_context", "api_key", "secret"];
const createTable = migration.match(/create table public\.ai_usage_events \(([\s\S]*?)\n\);/)?.[1] ?? "";
for (const column of forbiddenStorageColumns) {
  const found = new RegExp(`^\\s*${column}\\s+`, "im").test(createTable);
  console.log(`FORBIDDEN_LEDGER_COLUMN_${column.toUpperCase()}=${found ? 1 : 0}`);
  if (found) failed = true;
}

const requiredSecurity = [
  "alter table public.ai_usage_events enable row level security",
  "revoke all on public.ai_usage_events from public,anon,authenticated",
  "grant select on public.ai_usage_events to authenticated",
  "revoke all on function public.record_ai_usage_event_v1(jsonb) from public,anon,authenticated",
  "grant execute on function public.record_ai_usage_event_v1(jsonb) to service_role",
  "AI_USAGE_EVENT_IMMUTABLE",
  "AI_USAGE_EVENT_UNKNOWN_FIELD",
];
for (const marker of requiredSecurity) {
  if (!migration.includes(marker)) {
    console.error(`MISSING_SECURITY_MARKER=${marker}`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log("AI_ECONOMICS_V1_SAFETY_OK");
