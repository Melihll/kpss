import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export function assertProductionClientEnvironment(env) {
  const names = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"];
  if (names.some((name) => !env[name]?.trim())) throw new Error("Explicit production process inputs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required; .env.local is not a release source.");
  const url = new URL(env.VITE_SUPABASE_URL);
  if (url.protocol !== "https:" || !/^[a-z0-9]+\.supabase\.co$/.test(url.hostname) ||
      url.port || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("Production VITE_SUPABASE_URL must be an HTTPS Supabase project origin, never loopback/local API.");
  }
  const key = env.VITE_SUPABASE_ANON_KEY;
  if (key.startsWith("sb_secret_")) throw new Error("A server secret must never be a VITE client key.");
  if (!key.startsWith("sb_publishable_")) {
    let role;
    try { role = JSON.parse(Buffer.from(key.split(".")[1], "base64url")).role; } catch { /* reject below */ }
    if (role !== "anon") throw new Error("Production client key must be publishable or legacy anon, never service_role.");
  }
  return { origin: url.origin, names };
}

export function inspectProductionRuntime(text) {
  const markers = ["127.0.0.1:54321", "localhost:54321", "[::1]:54321", "M7lc1UVf-VE", "video-acceptance-local@example.test", "KPSS_VIDEO_ACCEPTANCE_PASSWORD", "UX LAB", "/ux-lab/"];
  const hits = markers.filter((marker) => text.includes(marker));
  // Supabase/Auth SDK's default http://localhost:9999 is unused when createClient
  // receives the mandatory explicit project URL; report it separately if present.
  const rejected = [];
  const sdkDefaultReferences = [];
  const routerParserReferences = [];
  for (const match of text.matchAll(/(?:https?|wss?):\/\/(?:127(?:\.\d{1,3}){3}|localhost|\[::1\])(?::\d+)?(?:\/[A-Za-z0-9_./-]*)?/gi)) {
    const url = match[0];
    const before = text.slice(Math.max(0, match.index - 45), match.index);
    const after = text.slice(match.index + url.length, match.index + url.length + 200);
    const declaration = before.match(/let ([A-Za-z_$][\w$]*)="$/);
    const router = after.match(/^";([A-Za-z_$][\w$]*)&&\(([A-Za-z_$][\w$]*)=\1\.location\.origin!=="null"\?\1\.location\.origin:\1\.location\.href\)/);
    if (url === "http://localhost" && declaration && router && declaration[1] === router[2]) routerParserReferences.push(url);
    else if (url === "http://localhost:9999" && /(?:=|,)[A-Za-z_$][\w$]*="$/.test(before) && /^",[A-Za-z_$][\w$]*="supabase\.auth\.token"/.test(after)) sdkDefaultReferences.push(url);
    else rejected.push(url);
  }
  return { hits, rejected: [...new Set(rejected)], sdkDefaultReferences, routerParserReferences };
}

export function scanProductionArtifact(directory, expectedOrigin) {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
  const files = walk(directory);
  const runtime = files.filter((file) => /\.(js|css|html)$/.test(file));
  const findings = runtime.map((file) => ({ file: path.relative(directory, file).replaceAll("\\", "/"), ...inspectProductionRuntime(fs.readFileSync(file, "utf8")) }));
  if (findings.some((finding) => finding.hits.length || finding.rejected.length)) throw new Error("Production artifact contains local endpoints, fixture or UX Lab markers; release refused.");
  if (!runtime.some((file) => fs.readFileSync(file, "utf8").includes(expectedOrigin))) throw new Error("Expected production project origin is missing from runtime chunks.");
  const manifest = files.sort().map((file) => ({ path: path.relative(directory, file).replaceAll("\\", "/"), bytes: fs.statSync(file).size, sha256: crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") }));
  return { findings, manifest, manifestSha256: crypto.createHash("sha256").update(JSON.stringify(manifest)).digest("hex") };
}
