import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertProductionClientEnvironment, scanProductionArtifact } from "./production-build-safety.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const web = path.join(root, "apps/web");
const dist = path.join(web, "dist");
const inputs = assertProductionClientEnvironment(process.env);
// Exact workspace output only. Refuse junction/symlink escapes before deletion.
if (path.relative(root, dist) !== path.join("apps", "web", "dist") ||
    (fs.existsSync(dist) && fs.realpathSync(dist).toLowerCase() !== dist.toLowerCase())) {
  throw new Error("Refusing to clean an output outside the exact repository web dist directory.");
}
fs.rmSync(dist, { recursive: true, force: true });
execFileSync(process.execPath, [path.join(root, "node_modules/typescript/bin/tsc"), "-b", "packages/domain", "apps/web", "--pretty", "false"], { cwd: root, stdio: "inherit" });
execFileSync(process.execPath, [path.join(web, "node_modules/vite/bin/vite.js"), "build"], { cwd: web, env: process.env, stdio: "inherit" });
const artifact = scanProductionArtifact(dist, inputs.origin);
const output = path.join(root, ".release");
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, "production-artifact.json"), JSON.stringify({ sourceHead: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), publicInputSource: "explicit process environment", inputNames: inputs.names, expectedOrigin: inputs.origin, ...artifact, production: "NOT DEPLOYED" }, null, 2) + "\n");
console.log(`Production artifact safety PASS: ${artifact.manifest.length} files; no local application endpoint/fixture/Lab marker. Manifest ${artifact.manifestSha256}`);
