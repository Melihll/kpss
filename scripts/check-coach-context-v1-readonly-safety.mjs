import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const adapterFiles = [
  "supabase/functions/_shared/coach-context-v1-readonly.ts",
  "supabase/functions/_shared/canonical-capacity-readonly.ts",
  "supabase/functions/_shared/planner-v2-persisted-readonly.ts",
];
const source = adapterFiles.map((file) => readFileSync(resolve(root, file), "utf8")).join("\n");

const checks = [
  ["DB_MUTATION_CALLS", /\.(insert|update|upsert|delete)\s*\(/g],
  ["PLANNER_PREVIEW_RECOMPUTATIONS", /\b(buildPlannerV2Preview|runCanonicalPlannerV2ReadOnlyShadow)\s*\(/g],
  ["LEGACY_COACH_TRUTH_LOADER_CALLS", /\b(loadDailyCoachContext|loadAiCoachMaterialContext|loadMaterialWorkloads|loadCurrentGrossCapacityForDate|getNextBestTask|buildDailyPlanProjection)\s*\(/g],
  ["LLM_PROVIDER_CALLS", /\b(openai|anthropic|gemini|chat\.completions|responses\.create)\b/gi],
];

let failed = false;
for (const [label, pattern] of checks) {
  const count = source.match(pattern)?.length ?? 0;
  console.log(`${label}=${count}`);
  if (count !== 0) failed = true;
}

if (!source.includes('unknownCoachContextV1Fact("canonical_selector_unavailable"')) {
  console.error("CANONICAL_NEXT_WORK_UNKNOWN_MISSING");
  failed = true;
}
if (!source.includes('blockedCoachContextV1Fact<any>("pln002_completeness_unresolved"')) {
  console.error("PLN002_FAIL_CLOSED_MISSING");
  failed = true;
}

if (failed) process.exit(1);
console.log("COACH_CONTEXT_V1_READONLY_SAFETY_OK");
