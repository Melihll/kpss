import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const runner = readFileSync(path.join(root, "supabase/functions/_shared/canonical-planner-v2-readonly.ts"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");
const productionScript = readFileSync(path.join(root, "scripts/run-canonical-planner-v2-readonly.mjs"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");

for (const [source, label] of [[runner, "adapter"], [productionScript, "production runner"]]) {
  for (const expression of [/\.insert\s*\(/i, /\.update\s*\(/i, /\.upsert\s*\(/i, /\.delete\s*\(/i, /\.rpc\s*\(/i]) {
    if (expression.test(source)) throw new Error(`${label} contains forbidden mutation: ${expression}`);
  }
}
for (const forbidden of ["planning-v2-shadow.ts", "runPlanningV2ShadowDecision", "applyCurrentPlanRevision", "replace_manual_weekly_plan"] ) {
  if (runner.includes(forbidden) || productionScript.includes(forbidden)) {
    throw new Error(`strictly read-only path references forbidden persistence/apply path: ${forbidden}`);
  }
}
for (const required of ["buildCanonicalPlannerV2Proposal", "compareCanonicalPlannerV2Shadow", "loadCanonicalWorkloadReadiness", "diagnosticPersistence: false", "mutationAuthority: false"]) {
  if (!runner.includes(required)) throw new Error(`read-only adapter contract missing: ${required}`);
}

console.log("Canonical Planner V2 read-only safety checks passed");
console.log("mutation methods: 0 detected");
console.log("diagnostic persistence imports: 0 detected");
console.log("proposal/apply authority: false");
