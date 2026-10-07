// LOCAL-only transport observation/fault injection. Never a product/server route.
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { readLocalSupabaseStatus } from "./supabase-status.mjs";
import { ACCEPTANCE_EMAIL, assertLocalVideoEnvironment } from "./local-video-acceptance.mjs";

const profileId = process.argv[process.argv.indexOf("--profile-id") + 1];
const videoId = process.argv[process.argv.indexOf("--video-id") + 1];
if (!/^[0-9a-f-]{36}$/.test(videoId ?? "")) throw new Error("An explicit LOCAL catalog video UUID is required.");
const local = readLocalSupabaseStatus();
assertLocalVideoEnvironment(local, profileId, ACCEPTANCE_EMAIL);
const output = path.resolve(".release");
fs.mkdirSync(output, { recursive: true });
const controlPath = path.join(output, "proxy-control.json");
if (!fs.existsSync(controlPath)) fs.writeFileSync(controlPath, '{"mode":"normal"}\n');
const events = [];
let activeProgress = 0;
let maximumConcurrentProgress = 0;
let sequence = 0;
const persist = () => fs.writeFileSync(path.join(output, "local-network.json"), JSON.stringify({ localOnly: true, targetHost: new URL(local.url).host, maximumConcurrentProgress, events, production: "NOT DEPLOYED" }, null, 2) + "\n");

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1:54323");
  if (url.origin !== "http://127.0.0.1:54323") { response.writeHead(400); response.end(); return; }
  const progress = request.method === "PUT" && url.pathname === `/functions/v1/app-api/youtube-videos/${videoId}/progress`;
  const event = { id: ++sequence, startedAt: new Date().toISOString(), method: request.method, path: url.pathname, progress, status: null, durationMs: null, fault: null };
  events.push(event);
  const started = performance.now();
  if (progress) { activeProgress++; maximumConcurrentProgress = Math.max(maximumConcurrentProgress, activeProgress); }
  try {
    const buffers = [];
    for await (const chunk of request) buffers.push(chunk);
    const body = Buffer.concat(buffers);
    // Credentials/Auth body/headers are never included in evidence.
    const control = JSON.parse(fs.readFileSync(controlPath, "utf8"));
    if (progress && control.mode === "slow") {
      event.fault = "controlled delay";
      await new Promise((resolve) => setTimeout(resolve, Math.min(60_000, Math.max(1000, Number(control.delayMs) || 35_000))));
    }
    const coachFailure = control.mode === "coach-fail" && request.method === "POST" && url.pathname === "/functions/v1/app-api/ai-coach/reactive";
    if ((progress && control.mode === "fail") || coachFailure) {
      event.fault = "controlled 503, not forwarded";
      event.status = 503;
      response.writeHead(503, { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" });
      response.end('{"error":{"code":"LOCAL_ACCEPTANCE_CONTROLLED_FAILURE","message":"Bağlantı geçici olarak kullanılamıyor. Tekrar deneyebilirsin."}}');
      return;
    }
    const headers = new Headers(request.headers);
    for (const name of ["host", "content-length", "connection", "accept-encoding"]) headers.delete(name);
    const upstream = await fetch(`${local.url}${url.pathname}${url.search}`, { method: request.method, headers, body: ["GET", "HEAD"].includes(request.method) ? undefined : body, redirect: "manual" });
    const outputHeaders = Object.fromEntries(upstream.headers);
    for (const name of ["content-encoding", "content-length", "transfer-encoding"]) delete outputHeaders[name];
    event.status = upstream.status;
    response.writeHead(upstream.status, outputHeaders);
    response.end(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    event.status = 502;
    response.writeHead(502, { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" });
    response.end('{"error":{"code":"LOCAL_ACCEPTANCE_PROXY_ERROR"}}');
  } finally {
    if (progress) activeProgress--;
    event.durationMs = Math.round(performance.now() - started);
    persist();
  }
});
server.listen(54323, "127.0.0.1", () => console.log("LOCAL acceptance transport on 127.0.0.1:54323; credentials are not logged; no production target."));
