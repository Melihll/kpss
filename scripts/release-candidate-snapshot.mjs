// Git/source reads only. No environment, network, Auth or database access.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const destination = process.argv[2] ?? "docs/product/release-blocker-evidence/candidate-source.json";
const git = (...args) => execFileSync("git", ["-c", "core.quotepath=false", "-c", "core.safecrlf=false", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const lines = (value) => value ? value.split(/\r?\n/) : [];
const baseline = "735de8d96edcef78816a0843e72669c7d16a034b";
const changed = new Set([...lines(git("diff", "--name-only", baseline)), ...lines(git("ls-files", "--others", "--exclude-standard"))]);
function closure(entry) {
  const seen = new Set();
  function visit(file) {
    if (seen.has(file) || !fs.existsSync(file)) return;
    seen.add(file);
    const source = fs.readFileSync(file, "utf8").replace(/import\s+type\s+[\s\S]*?from\s*["'][^"']+["']\s*;?/g, "");
    for (const match of source.matchAll(/(?:from\s*|import\s*\()(["'])([^"']+)\1/g)) {
      if (!match[2].startsWith(".")) continue;
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), match[2]));
      const resolved = [target, `${target}.ts`, `${target}.js`, `${target}/index.ts`].find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
      if (resolved) visit(resolved);
    }
  }
  visit(entry);
  return [...seen].sort();
}
const graphs = Object.fromEntries(fs.readdirSync("supabase/functions", { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith("_") && fs.existsSync(`supabase/functions/${d.name}/index.ts`)).map((d) => {
  const files = closure(`supabase/functions/${d.name}/index.ts`);
  return [d.name, { files, changedSinceDocumentedAppApiSource: files.filter((file) => changed.has(file)) }];
}));
const files = [...new Set([...lines(git("ls-files")), ...lines(git("ls-files", "--others", "--exclude-standard"))])].filter((file) => /^(apps\/web\/|supabase\/functions\/|packages\/domain\/src\/|assets\/brand\/)/.test(file) && !/\.test\.|\.tsbuildinfo$/.test(file) && fs.existsSync(file));
const runtimeManifest = files.sort().map((file) => ({ path: file, sha256: crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") }));
const result = { measuredAt: new Date().toISOString(), head: git("rev-parse", "HEAD"), branch: git("branch", "--show-current"), upstream: git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"), aheadBehind: git("rev-list", "--left-right", "--count", "HEAD...@{upstream}"), worktree: lines(git("status", "--short")), documentedWebBaseline: "395a536d18b79ea124bdac0d4498a021d9ce9bc0", documentedAppApiBaseline: baseline, edgeClosures: graphs, databaseDiff: lines(git("diff", "--name-status", baseline, "--", "supabase/migrations", "supabase/seed.sql", "supabase/config.toml")), runtimeManifest, runtimeManifestSha256: crypto.createHash("sha256").update(JSON.stringify(runtimeManifest)).digest("hex"), production: "NOT DEPLOYED", note: "Documented baselines only; other Edge closures do not prove their live deployment versions. A dirty precommit record identifies source hashes; the containing release commit and ignored postcommit snapshot provide the final RC identity." };
const absolute = path.resolve(root, destination);
if (path.relative(root, absolute).startsWith("..") || path.isAbsolute(path.relative(root, absolute))) throw new Error("Snapshot output must stay inside the repository.");
fs.mkdirSync(path.dirname(absolute), { recursive: true });
fs.writeFileSync(absolute, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ head: result.head, databaseDiff: result.databaseDiff, changedClosures: Object.fromEntries(Object.entries(graphs).map(([name, graph]) => [name, graph.changedSinceDocumentedAppApiSource])), runtimeManifestSha256: result.runtimeManifestSha256 }));
