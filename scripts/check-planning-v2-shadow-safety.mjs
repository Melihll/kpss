import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildSync } from "esbuild";

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

const migrationPath =
  "supabase/migrations/20260818190000_create_planning_v2_shadow_persistence.sql";
const migration = withoutComments(read(migrationPath));
const runner = withoutComments(
  read("supabase/functions/_shared/planning-v2-shadow.ts"),
);
const endpoint = withoutComments([
  read("supabase/functions/planning-v2-shadow/handler.ts"),
  read("supabase/functions/planning-v2-shadow/index.ts"),
].join("\n"));
const v1Bundle = read("supabase/functions/_shared/planning.bundle.js");
const v2Bundle = read("supabase/functions/_shared/planning-v2.bundle.js");

for (const table of [
  "learner_unit_states_v2",
  "planning_v2_snapshots",
  "planning_v2_proposals",
]) {
  requireMatch(
    migration,
    new RegExp(`create\\s+table\\s+public\\.${table}\\b`, "i"),
    `missing additive shadow table: ${table}`,
  );
  requireMatch(
    migration,
    new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, "i"),
    `RLS not enabled: ${table}`,
  );
}

for (const column of [
  "external_snapshot_id",
  "snapshot_hash",
  "idempotency_key",
  "trigger_type",
  "requested_scope",
  "available_minutes",
  "planning_budget_minutes",
  "reserve_minutes",
  "snapshot_payload",
]) {
  requireMatch(
    migration,
    new RegExp(`\\b${column}\\b`, "i"),
    `snapshot persistence column missing: ${column}`,
  );
}

for (const column of [
  "planning_snapshot_id",
  "external_proposal_id",
  "idempotency_key",
  "decision",
  "changed_task_count",
  "apply_recommended",
  "validation_valid",
  "proposal_payload",
  "validation_payload",
  "apply_dedupe_key",
]) {
  requireMatch(
    migration,
    new RegExp(`\\b${column}\\b`, "i"),
    `proposal persistence column missing: ${column}`,
  );
}

forbidMatch(
  migration,
  /(?:alter\s+table|update|delete\s+from|insert\s+into)\s+public\.(?:tasks|weekly_plans|plan_revisions)\b/i,
  "migration mutates a V1 plan table",
);
forbidMatch(
  migration,
  /create\s+trigger[\s\S]*?\bon\s+public\.(?:tasks|weekly_plans|plan_revisions)\b/i,
  "migration adds a trigger to a V1 plan table",
);
forbidMatch(
  migration,
  /planning_budget_minutes\s*<=\s*available_minutes/i,
  "migration rejects valid capacity-decrease snapshots",
);

requireMatch(
  migration,
  /grant\s+select[\s\S]*?to\s+authenticated/i,
  "authenticated shadow read grant missing",
);
requireMatch(
  migration,
  /grant\s+select\s*,\s*insert\s*,\s*update\s*,\s*delete[\s\S]*?to\s+service_role/i,
  "service-role shadow write grant missing",
);

const forbiddenRuntime = [
  /\.update\s*\(/i,
  /\.delete\s*\(/i,
  /\.rpc\s*\(/i,
  /apply_plan_revision/i,
  /telegram_apply_plan_revision/i,
  /recalculateCurrentPlan/i,
  /persistTasksToBacklog/i,
];
for (const expression of forbiddenRuntime) {
  forbidMatch(runner, expression, `shadow runner contains ${expression}`);
  forbidMatch(endpoint, expression, `manual endpoint contains ${expression}`);
}

for (const exportName of [
  "buildPlanningSnapshotFromDbBundleV1",
  "decidePlanningActionV2",
  "evaluatePlanningV2ShadowDecision",
  "toPlanningV2SnapshotRow",
  "toPlanningV2ProposalRow",
]) {
  requireMatch(
    v2Bundle,
    new RegExp(`\\b${exportName}\\b`),
    `V2 bundle export missing: ${exportName}`,
  );
}

const generatedV1Bundle = buildSync({
  entryPoints: [path.join(root, "packages/domain/src/planning/index.ts")],
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  write: false,
}).outputFiles[0]?.text;
if (generatedV1Bundle !== v1Bundle) {
  throw new Error("V1 planning.bundle.js is not reproducible from current domain sources");
}

console.log("✅ Planning V2 shadow safety checks passed");
console.log("tables:            3 additive shadow tables");
console.log("real mutations:    0 detected");
console.log("V1 bundle source sync: verified");
console.log("V2 exports:        5 verified");
