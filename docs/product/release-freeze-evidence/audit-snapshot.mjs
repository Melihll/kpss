// Read-only repository/artifact inventory. No network, credentials or DB calls.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const output = path.join(root, "docs/product/release-freeze-evidence");
const git = (...args) => execFileSync("git", ["-c", "core.quotepath=false", "-c", "core.autocrlf=false", "-c", "core.safecrlf=false", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const lines = (s) => s ? s.split(/\r?\n/) : [];
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const webBaseline = "395a536d18b79ea124bdac0d4498a021d9ce9bc0";
const edgeBaseline = "735de8d96edcef78816a0843e72669c7d16a034b";
const untracked = lines(git("ls-files", "--others", "--exclude-standard"));
const category = (p) => p.startsWith("apps/web/") ? /\.test\./.test(p) ? "TEST" : "WEB" : p.startsWith("supabase/migrations/") || p.endsWith(".sql") ? "DATABASE" : p.startsWith("supabase/functions/") ? /\.test\./.test(p) ? "TEST" : "EDGE" : p.startsWith("docs/") ? "DOCS" : p.startsWith("scripts/") || p.startsWith("tests/") ? "LOCAL_TOOLING_TEST" : /package|lock|config|\.toml|tsbuildinfo/.test(p) ? "CONFIG" : p.startsWith("assets/") ? "BRAND_SOURCE" : "DOMAIN_OTHER";
const inventory = {};
for (const [label, baseline] of [["web", webBaseline], ["appApi", edgeBaseline]]) {
  const changed = lines(git("diff", "--name-status", baseline));
  inventory[label] = { baseline, baselineToHead: lines(git("diff", "--name-status", `${baseline}..HEAD`)), trackedCandidateDiff: changed.map((line) => ({ status: line.split("\t")[0], path: line.split("\t").at(-1), category: category(line.split("\t").at(-1)) })), untracked: untracked.filter((p) => !p.startsWith("docs/product/release-freeze-evidence/")).map((p) => ({ path: p, category: category(p) })) };
}
const modifiedEdge = new Set(lines(git("diff", "--name-only", edgeBaseline)).filter((p) => !p.startsWith("docs/")));
const closure = (entry) => {
  const seen = new Set();
  function visit(file) {
    if (seen.has(file) || !fs.existsSync(path.join(root, file))) return;
    seen.add(file);
    const source = read(file).replace(/import\s+type\s+[\s\S]*?from\s*["'][^"']+["']\s*;?/g, "");
    const imports = [...source.matchAll(/(?:from\s*|import\s*\()(["'])([^"']+)\1/g)].map((m) => m[2]);
    for (const specifier of imports.filter((s) => s.startsWith("."))) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
      const resolved = [target, `${target}.ts`, `${target}.js`, `${target}/index.ts`].find((p) => fs.existsSync(path.join(root, p)) && fs.statSync(path.join(root, p)).isFile());
      if (resolved) visit(resolved);
    }
  }
  visit(entry);
  return [...seen].sort();
};
const graphs = Object.fromEntries(fs.readdirSync(path.join(root, "supabase/functions"), { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith("_") && fs.existsSync(path.join(root, "supabase/functions", d.name, "index.ts"))).map((d) => {
  const files = closure(`supabase/functions/${d.name}/index.ts`);
  return [d.name, { files, changedSinceAppApiBaseline: files.filter((p) => modifiedEdge.has(p)), note: "Static relative import closure; comparison anchor is app-api's documented source, not proof of other functions' live deployment versions." }];
}));
const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((d) => d.isDirectory() ? walk(`${dir}/${d.name}`) : [`${dir}/${d.name}`]);
const files = [...new Set([...lines(git("ls-files")), ...untracked])].filter((p) => !p.startsWith("docs/product/release-freeze-evidence/") && !p.endsWith(".tsbuildinfo") && fs.existsSync(path.join(root, p)));
const runtimeFiles = files.filter((p) => /^(apps\/web\/|supabase\/functions\/|packages\/domain\/src\/|assets\/brand\/)/.test(p) && !/\.test\./.test(p));
const runtimeManifest = runtimeFiles.sort().map((p) => ({ path: p, bytes: fs.statSync(path.join(root, p)).size, sha256: hash(fs.readFileSync(path.join(root, p))) }));
const buildFiles = walk("apps/web/dist");
const buildManifest = buildFiles.sort().map((p) => ({ path: p.replace("apps/web/dist/", ""), bytes: fs.statSync(path.join(root, p)).size, sha256: hash(fs.readFileSync(path.join(root, p))) }));
const bundles = buildFiles.filter((p) => /\.(js|html|css)$/.test(p)).map((p) => ({ path: p, text: read(p) }));
const markers = { localSupabase: "http://127.0.0.1:54321", testVideo: "M7lc1UVf-VE", localAccount: "video-acceptance-local@example.test", labToolbar: "UX LAB", labRoute: "/ux-lab/", acceptancePasswordEnv: "KPSS_VIDEO_ACCEPTANCE_PASSWORD", debugger: "debugger;" };
const bundleSweep = Object.fromEntries(Object.entries(markers).map(([label, marker]) => [label, bundles.filter((b) => b.text.includes(marker)).map((b) => b.path)]));
const jwtRoles = [...new Set(bundles.flatMap((b) => [...b.text.matchAll(/eyJ[A-Za-z0-9_-]+\.(eyJ[A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)].map((m) => { try { return JSON.parse(Buffer.from(m[1], "base64url")).role ?? "unknown"; } catch { return "unparsed"; } })))];
const envNames = [...new Set(walk("supabase/functions").filter((p) => p.endsWith(".ts") && !p.endsWith(".test.ts")).flatMap((p) => [...read(p).matchAll(/Deno\.env\.get\(\s*["']([^"']+)/g)].map((m) => m[1])))].sort();
const preflight = { date: "2026-10-06", branch: git("branch", "--show-current"), head: git("rev-parse", "HEAD"), upstream: git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"), originDevelop: git("rev-parse", "origin/develop"), originMain: git("rev-parse", "origin/main"), upstreamAheadBehind: git("rev-list", "--left-right", "--count", "HEAD...@{upstream}"), status: lines(git("status", "--short")), staged: lines(git("diff", "--cached", "--name-status")), unstaged: lines(git("diff", "--name-status")), untracked, runtimeManifestSha256: hash(JSON.stringify(runtimeManifest)), buildManifestSha256: hash(JSON.stringify(buildManifest)), runtimeManifest, buildManifest, bundleSweep, embeddedJwtRoles: jwtRoles, serverEnvironmentNames: envNames, dbDiffSinceAppApiBaseline: lines(git("diff", "--name-status", edgeBaseline, "--", "supabase/migrations", "supabase/seed.sql", "supabase/config.toml")), dbDiffSinceWebBaseline: lines(git("diff", "--name-status", webBaseline, "--", "supabase/migrations")), production: "NOT DEPLOYED", candidate: "DIRTY; runtime manifest identifies audited files but is not a release commit" };
for (const [name, value] of Object.entries({ "snapshot.json": preflight, "change-inventory.json": inventory, "edge-import-closures.json": graphs })) fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + "\n");
console.log(JSON.stringify({ head: preflight.head, staged: preflight.staged.length, unstaged: preflight.unstaged.length, untracked: untracked.length, runtimeManifestSha256: preflight.runtimeManifestSha256, buildManifestSha256: preflight.buildManifestSha256, bundleSweep, embeddedJwtRoles: jwtRoles, dbDiffSinceAppApiBaseline: preflight.dbDiffSinceAppApiBaseline, changedEdgeClosures: Object.fromEntries(Object.entries(graphs).map(([n, g]) => [n, g.changedSinceAppApiBaseline])) }, null, 2));
