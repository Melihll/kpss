import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const domain = read("packages/domain/src/ai-coach/ai-economics-v1.ts");
const adapter = read("supabase/functions/_shared/ai-coach/ai-usage-ledger-v1.ts");
const migration = read("supabase/migrations/20260911150000_ai_usage_ledger_v1.sql");
const reservationAdapter = read("supabase/functions/_shared/ai-coach/ai-budget-reservation-v1.ts");
const providerBoundary = [
  read("supabase/functions/_shared/ai-coach/provider-runtime-config-v1.ts"),
  read("supabase/functions/_shared/ai-coach/provider-attempt-v1.ts"),
  read("supabase/functions/_shared/ai-coach/provider-runtime-catalog-v1.ts"),
  read("supabase/functions/_shared/ai-coach/provider-fx-policy-v1.ts"),
  read("supabase/functions/_shared/ai-coach/provider-openai-billing-bound-v1.ts"),
  read("supabase/functions/_shared/ai-coach/openai-input-token-count-v1.ts"),
  read("supabase/functions/_shared/ai-coach/openai-coach-request-v1.ts"),
  read("supabase/functions/_shared/ai-coach/provider-openai-billing-audit-v1.ts"),
  read("supabase/functions/_shared/ai-coach/provider-runtime-activation-v1.ts"),
  read("supabase/functions/_shared/ai-coach/openai-server-secret-v1.ts"),
  read("supabase/functions/_shared/ai-coach/provider-fx-acquisition-v1.ts"),
  read("supabase/functions/_shared/ai-coach/provider-reconciliation-policy-v1.ts"),
  read("supabase/functions/_shared/ai-coach/dev-smoke-policy-v1.ts"),
].join("\n");
const devGateway = read("supabase/functions/_shared/ai-coach/openai-dev-gateway-v1.ts");
const readOnlyOrchestrator = read("supabase/functions/_shared/ai-coach/read-only-coach-orchestrator-v1.ts");
const reservationMigration = read("supabase/migrations/20260911170000_ai_provider_runtime_reservations_v1.sql");
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
  RESERVATION_RPC_GATEWAYS: reservationAdapter.match(/\.rpc\(name,/g)?.length ?? 0,
  RESERVATION_ARBITRARY_TABLE_WRITES: reservationAdapter.match(/\.(insert|update|upsert|delete)\s*\(/g)?.length ?? 0,
  PROVIDER_BOUNDARY_NETWORK_CALLS: providerBoundary.match(/\bfetch\s*\(/g)?.length ?? 0,
  DEV_GATEWAY_INJECTED_HTTP_CALLS: devGateway.match(/\binput\.fetchImpl\s*\(/g)?.length ?? 0,
  DEV_GATEWAY_GLOBAL_FETCH_CALLS: devGateway.match(/\bglobalThis\.fetch\s*\(|\bfetch\s*\(/g)?.length ?? 0,
  ORCHESTRATOR_NETWORK_CALLS: readOnlyOrchestrator.match(/\b(fetch|responses\.create|chat\.completions)\s*\(/g)?.length ?? 0,
  ORCHESTRATOR_DIRECT_DB_WRITES: readOnlyOrchestrator.match(/\.(insert|update|upsert|delete)\s*\(/g)?.length ?? 0,
  ORCHESTRATOR_PLANNER_PREVIEW_CALLS: readOnlyOrchestrator.match(/\b(buildPlannerV2Preview|previewCurrentPlan|create_confirmed|apply_confirmed)\b/g)?.length ?? 0,
  ORCHESTRATOR_LEGACY_COACH_LOADERS: readOnlyOrchestrator.match(/\b(loadCoachContext|loadMaterialContext|buildCoachSystemPrompt)\b/g)?.length ?? 0,
  ORCHESTRATOR_INJECTED_PROVIDER_CALLS: readOnlyOrchestrator.match(/generationTransport\.execute\s*\(/g)?.length ?? 0,
  RUNTIME_ROUTER_WIRING: runtime.match(/(routeAiCapabilityV1|AiUsageEventV1|recordAiUsageEventV1)/g)?.length ?? 0,
  RUNTIME_DEV_GATEWAY_WIRING: runtime.match(/(openai-dev-gateway-v1|resolveAiProviderRuntimeActivationV1|createOpenAiDevGatewayV1)/g)?.length ?? 0,
};

let failed = false;
for (const [name, count] of Object.entries(counts)) {
  console.log(`${name}=${count}`);
}
if (counts.DOMAIN_PROVIDER_CALLS !== 0 || counts.DOMAIN_DB_CALLS !== 0 || counts.DOMAIN_PLANNER_CALLS !== 0) failed = true;
if (counts.LEDGER_RPC_CALLS !== 1 || counts.LEDGER_ARBITRARY_TABLE_WRITES !== 0 || counts.RESERVATION_RPC_GATEWAYS !== 1 || counts.RESERVATION_ARBITRARY_TABLE_WRITES !== 0 || counts.PROVIDER_BOUNDARY_NETWORK_CALLS !== 0 || counts.DEV_GATEWAY_INJECTED_HTTP_CALLS !== 1 || counts.DEV_GATEWAY_GLOBAL_FETCH_CALLS !== 0 || counts.ORCHESTRATOR_NETWORK_CALLS !== 0 || counts.ORCHESTRATOR_DIRECT_DB_WRITES !== 0 || counts.ORCHESTRATOR_PLANNER_PREVIEW_CALLS !== 0 || counts.ORCHESTRATOR_LEGACY_COACH_LOADERS !== 0 || counts.ORCHESTRATOR_INJECTED_PROVIDER_CALLS !== 1 || counts.RUNTIME_ROUTER_WIRING !== 0 || counts.RUNTIME_DEV_GATEWAY_WIRING !== 0) failed = true;

const forbiddenStorageColumns = ["prompt", "message", "conversation", "coach_context", "api_key", "secret"];
const createTable = migration.match(/create table public\.ai_usage_events \(([\s\S]*?)\n\);/)?.[1] ?? "";
for (const column of forbiddenStorageColumns) {
  const found = new RegExp(`^\\s*${column}\\s+`, "im").test(createTable);
  console.log(`FORBIDDEN_LEDGER_COLUMN_${column.toUpperCase()}=${found ? 1 : 0}`);
  if (found) failed = true;
}

for (const table of ["ai_budget_reservations", "ai_budget_reservation_events"]) {
  const definition = reservationMigration.match(new RegExp(`create table public\\.${table} \\(([\\s\\S]*?)\\n\\);`))?.[1] ?? "";
  for (const column of forbiddenStorageColumns) {
    const found = new RegExp(`^\\s*${column}\\s+`, "im").test(definition);
    console.log(`FORBIDDEN_${table.toUpperCase()}_COLUMN_${column.toUpperCase()}=${found ? 1 : 0}`);
    if (found) failed = true;
  }
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

const reservationSecurity = [
  "pg_advisory_xact_lock",
  "status in ('reserved','reconciliation_required')",
  "record_ai_usage_and_settle_reservation_v1",
  "revoke all on public.ai_budget_reservations from public,anon,authenticated,service_role",
  "grant select on public.ai_budget_reservations to authenticated,service_role",
  "revoke all on function public.reserve_ai_budget_v1(jsonb)",
  "grant execute on function public.reserve_ai_budget_v1(jsonb)",
  "AI_BUDGET_SETTLEMENT_SCOPE_MISMATCH",
  "cost_bound_invariant_violation",
  "billing_bound_version",
  "Europe/Istanbul",
];
for (const marker of reservationSecurity) {
  if (!reservationMigration.includes(marker)) {
    console.error(`MISSING_RESERVATION_SECURITY_MARKER=${marker}`);
    failed = true;
  }
}

for (const marker of ["requestPayloadCoverage", "server_rejects_above_bound", "providerOutputLimitEnforced", "uncoveredBillableTokenClasses", "authorizeProductionProviderCostMaximumV1", "openai_responses_input_tokens_exact", "complete_generation_request", "inputCountBillingTreatment", "cacheWriteBillingTreatment", "stableCanonicalJsonV1", "SHA-256"]) {
  if (!providerBoundary.includes(marker)) {
    console.error(`MISSING_PROVIDER_BOUND_MARKER=${marker}`);
    failed = true;
  }
}

for (const marker of ["production_prohibited", "runtime_switch_off", "billing_gate_unavailable", "OPENAI_API_KEY", "server_secret", "requestTimeNetworkFetchAllowed", "server_side_scheduled_config_acquisition", "realDevSmokeBillingEligible: false", "readyForDevSmoke: false"]) {
  if (!providerBoundary.includes(marker)) {
    console.error(`MISSING_DEV_RUNTIME_SAFETY_MARKER=${marker}`);
    failed = true;
  }
}

for (const marker of ["https://api.openai.com", "/v1/responses/input_tokens", "/v1/responses", "X-Client-Request-Id", "x-request-id", "automaticRetryCount: 0", "AbortController", "redirect: \"error\""]) {
  if (!devGateway.includes(marker)) {
    console.error(`MISSING_DEV_GATEWAY_MARKER=${marker}`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log("AI_ECONOMICS_V1_SAFETY_OK");
