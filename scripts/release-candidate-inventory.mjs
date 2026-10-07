// Repository inventory only. No environment values, network or database access.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const git = (...args) => execFileSync("git", ["-c", "core.quotepath=false", "-c", "core.safecrlf=false", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trimEnd();
const lines = (s) => s ? s.split(/\r?\n/) : [];
const tracked = lines(git("diff", "--name-status")).map((row) => ({ status: row.split("\t")[0], path: row.split("\t").at(-1) }));
const untracked = lines(git("ls-files", "--others", "--exclude-standard")).map((file) => ({ status: "UNTRACKED", path: file }));
export function classify(file) {
  if (/\.tsbuildinfo$|(?:^|\/)dist\/|app-api-audit\.bundle\.js$|regression\.log$/.test(file)) return ["GENERATED", "Reproducible compiler/build output; exclude from release commit."];
  if (/(?:^|\/)\.env|supabase\/\.temp\/|node_modules\/|\.release\//.test(file)) return ["LOCAL ONLY", "Ignored local environment/runtime material; never release input."];
  if (/\.test\.[cm]?[jt]sx?$|^tests\//.test(file)) return ["TEST", "Regression/contract coverage for the accepted implementation and release safety."];
  if (/^docs\/product\/(?:brand-evidence|ux-lab-evidence|release-freeze-evidence|release-blocker-evidence)\//.test(file)) return ["EVIDENCE", "Retained acceptance/audit evidence; inspect for credentials before committing."];
  if (/^docs\//.test(file)) return ["DOCS", "Product acceptance, migration or release record; preserve history."];
  if (/^scripts\/(?:local-video-acceptance|setup-local-video|setup-local-frontend|local-frontend|supabase-command)/.test(file)) return ["LOCAL ONLY", "Reviewed repository tooling with LOCAL guards; safe to version, not a deploy artifact."];
  return ["RELEASE SOURCE", file.startsWith("apps/web/") ? "Accepted real frontend, isolated DEV review, brand or release build tooling." : file.startsWith("supabase/functions/") ? "Existing app-api preview/canonical material contract; no schema change." : file.startsWith("assets/brand/") ? "Official preserved source brand asset." : "Intentional release configuration/tooling; review with source and lockfile."];
}
const files = [...tracked, ...untracked].map((item) => {
  const [group, purpose] = classify(item.path);
  const versionedLocalTool = /^scripts\/(?:local-video-acceptance|setup-local-video|setup-local-frontend|local-frontend|supabase-command)/.test(item.path);
  return { ...item, group, purpose, commitEligible: group !== "GENERATED" && (group !== "LOCAL ONLY" || versionedLocalTool) };
});
const destination = path.join(root, "docs/product/release-blocker-evidence");
fs.mkdirSync(destination, { recursive: true });
const historical = JSON.parse(fs.readFileSync(path.join(root, "docs/product/release-freeze-evidence/snapshot.json"), "utf8"));
const originalFiles = [...historical.unstaged.map((row) => ({ status: row.split("\t")[0], path: row.split("\t").at(-1) })), ...historical.untracked.map((file) => ({ status: "UNTRACKED", path: file }))].map((item) => {
  const [group, purpose] = classify(item.path);
  return { ...item, group, purpose, disposition: group === "GENERATED" ? "Ignored reproducible output; historical generated audit bundle retained in .release/." : "Preserved in intentional release file set." };
});
const inventory = { head: git("rev-parse", "HEAD"), trackedCount: tracked.length, untrackedCount: untracked.length, groups: Object.fromEntries([...new Set(files.map((f) => f.group))].map((group) => [group, files.filter((f) => f.group === group).length])), files, originalFreeze: { trackedCount: historical.unstaged.length, untrackedCount: historical.untracked.length, files: originalFiles }, ignoredLocalInputs: ["apps/web/.env.local", "apps/web/.env.local.backup", "supabase/.temp/", "apps/web/dist/", ".release/", "*.tsbuildinfo"], production: "NOT DEPLOYED" };
fs.writeFileSync(path.join(destination, "worktree-inventory.json"), JSON.stringify(inventory, null, 2) + "\n");
console.log(JSON.stringify({ tracked: inventory.trackedCount, untracked: inventory.untrackedCount, groups: inventory.groups }));
