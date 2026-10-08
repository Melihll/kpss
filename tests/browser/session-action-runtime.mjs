// Runs the actual web app with LOCAL-only network and event evidence.
// Fixture mode simulates session responses without writing any session to the DB.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createServer } from '../../apps/web/node_modules/vite/dist/node/index.js';
import { readLocalSupabaseStatus } from '../../scripts/supabase-status.mjs';
import { assertLocalVideoEnvironment, ACCEPTANCE_EMAIL } from '../../scripts/local-video-acceptance.mjs';
const root = path.resolve(process.argv[2] ?? '.release/mobile-session-action-fix-20261008');
if (!root.startsWith(path.resolve('.release') + path.sep)) throw new Error('Ignored evidence root required');
fs.mkdirSync(root, { recursive: true });
const local = readLocalSupabaseStatus();
const profileId = 'a9cb4d62-5d48-4bdd-a17d-ae8c6f240f31', userId = 'f5887c7b-012d-48ad-8d17-71101b82ab37';
assertLocalVideoEnvironment(local, profileId, ACCEPTANCE_EMAIL);
const taskId = '19c01150-747c-4ddd-a08a-0c19d60934b9';
const readModels = JSON.parse(fs.readFileSync(path.join(root, 'local-read-models.json'))).readModels;
const fixtureReads = { '/functions/v1/app-api/weekly-plan/current': readModels.weekly, '/functions/v1/app-api/execution/summary': readModels.summary, '/functions/v1/app-api/p48/roadmap': readModels.roadmap };
const controlFile = path.join(root, 'control.json');
if (!fs.existsSync(controlFile)) fs.writeFileSync(controlFile, JSON.stringify({ transport: 'fixture', reset: 'initial', mode: 'normal' }));
const readEvidence = file => {
  const original = fs.existsSync(path.join(root, file)) ? JSON.parse(fs.readFileSync(path.join(root, file))) : [];
  const journal = path.join(root, file + '.ndjson');
  const rows = fs.existsSync(journal) ? fs.readFileSync(journal, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
  return file === 'network.json' ? [...new Map([...original, ...rows].map(row => [row.id, row])).values()] : [...original, ...rows];
};
const network = readEvidence('network.json'), ui = readEvidence('ui-events.json');
let sequence = network.at(-1)?.id ?? 0, starts = network.filter(e => e.transport === 'live' && e.method === 'POST' && e.path.endsWith('/study-sessions/start')).length, reset = '', fixture;
const previous = new Map(network.map(event => [event.id, JSON.stringify(event)])); let uiCount = ui.length;
const persist = () => {
  // Append-only evidence avoids transient empty reads and Windows rename locks.
  for (const event of network) { const row = JSON.stringify(event); if (previous.get(event.id) !== row) { fs.appendFileSync(path.join(root, 'network.json.ndjson'), row + '\n'); previous.set(event.id, row); } }
  for (; uiCount < ui.length; uiCount++) fs.appendFileSync(path.join(root, 'ui-events.json.ndjson'), JSON.stringify(ui[uiCount]) + '\n');
};
const summarize = value => {
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const key of ['id', 'task_id', 'session_id', 'status', 'started_at', 'ended_at', 'duration_minutes', 'paused', 'lifecycle', 'outcome', 'closedBreakSeconds', 'session', 'break', 'error', 'code', 'message']) if (key in value) result[key] = summarize(value[key]);
  return result;
};
const proxy = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1:54326');
  const buffers = []; for await (const chunk of req) buffers.push(chunk);
  const body = Buffer.concat(buffers), study = u.pathname.startsWith('/functions/v1/app-api/study-sessions/');
  const c = JSON.parse(fs.readFileSync(controlFile));
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !u.pathname.startsWith('/auth/v1/') && !(study && req.method === 'POST')) { res.writeHead(403); return res.end('LOCAL test refuses unrelated writes'); }
  if (study && req.method === 'POST') {
    let sub; try { sub = JSON.parse(Buffer.from(String(req.headers.authorization).split('.')[1], 'base64url')).sub; } catch { /* rejected below */ }
    if (sub !== userId) { res.writeHead(403); return res.end('Dedicated LOCAL account required'); }
    if (u.pathname.endsWith('/start')) {
      if (c.transport !== 'live' || starts || JSON.parse(body).taskId !== taskId) { res.writeHead(403); return res.end('Exactly one dedicated LOCAL start permitted'); }
      starts++;
    }
  }
  const event = { id: ++sequence, at: new Date().toISOString(), transport: c.transport, phase: c.phase, method: req.method, path: u.pathname, status: null };
  network.push(event); persist(); const started = performance.now();
  try {
    if (req.method === 'POST' && u.pathname.endsWith('/pause') && c.mode === 'slow') { event.controlledDelayMs = 12000; persist(); await new Promise(resolve => setTimeout(resolve, 12000)); }
    let status, output, bytes;
    if (c.transport === 'fixture' && req.method === 'GET' && u.pathname in fixtureReads) {
      status = 200; output = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }; bytes = Buffer.from(JSON.stringify(fixtureReads[u.pathname]));
    } else if (study && c.transport === 'fixture' && req.method !== 'OPTIONS') {
      if (reset !== c.reset) {
        reset = c.reset;
        fixture = { session: { id: '00000000-0000-4000-8000-000000000001', task_id: taskId, started_at: new Date().toISOString(), status: 'active', tasks: { title: 'LOCAL pause audit · Soru çözümü' }, lifecycle: 'legacy' }, break: null, paused: false, closedBreakSeconds: 0 };
      }
      let value = fixture;
      if (req.method === 'POST') {
        if (u.pathname.endsWith('/pause')) { fixture.paused = true; fixture.break = { id: '00000000-0000-4000-8000-000000000002', session_id: fixture.session.id, started_at: new Date().toISOString(), ended_at: null }; value = { paused: true, break: fixture.break }; }
        else if (u.pathname.endsWith('/resume')) { fixture.paused = false; fixture.break = null; value = { paused: false }; }
        else if (u.pathname.endsWith('/finish')) { value = { session: { ...fixture.session, status: 'completed' } }; fixture = { session: null, break: null, paused: false, closedBreakSeconds: 0 }; }
        else throw new Error('Unexpected fixture mutation');
      }
      status = 200; output = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }; bytes = Buffer.from(JSON.stringify(value));
    } else {
      const headers = new Headers(req.headers);
      for (const key of ['host', 'content-length', 'connection', 'accept-encoding']) headers.delete(key);
      const response = await fetch(local.url + u.pathname + u.search, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body, redirect: 'error' });
      status = response.status; output = Object.fromEntries(response.headers); bytes = Buffer.from(await response.arrayBuffer());
      for (const key of ['content-encoding', 'content-length', 'transfer-encoding']) delete output[key];
    }
    event.status = status;
    if (study && req.method !== 'OPTIONS') event.response = summarize(JSON.parse(bytes));
    res.writeHead(status, output); res.end(bytes);
  } catch { event.status = 502; res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end('{"error":{"code":"LOCAL_TEST_TRANSPORT_ERROR"}}'); }
  finally { event.durationMs = Math.round(performance.now() - started); event.completedAt = new Date().toISOString(); persist(); }
});
await new Promise(resolve => proxy.listen(54326, '127.0.0.1', resolve));
process.env.VITE_SUPABASE_URL = 'http://127.0.0.1:54326'; process.env.VITE_SUPABASE_ANON_KEY = local.anonKey;
const vite = await createServer({ root: path.resolve('apps/web'), configFile: path.resolve('apps/web/vite.config.ts'), server: { host: '127.0.0.1', port: 5175, strictPort: true }, plugins: [{ name: 'local-session-action-evidence', transformIndexHtml() { return [{ tag: 'script', attrs: { src: '/__session_audit.js' }, injectTo: 'head' }]; }, configureServer(server) {
  server.middlewares.use(async (req, res, next) => {
    if (req.url === '/__session_audit.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(fs.readFileSync('tests/browser/session-action-instrumentation.js')); }
    if (req.url === '/__session_audit/control') { res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); return res.end(fs.readFileSync(controlFile)); }
    if (req.url === '/__session_audit/event' && req.method === 'POST') { const buffers = []; for await (const chunk of req) buffers.push(chunk); ui.push({ receivedAt: new Date().toISOString(), ...JSON.parse(Buffer.concat(buffers)) }); persist(); res.writeHead(204); return res.end(); }
    next();
  });
} }] });
await vite.listen(); console.log('LOCAL session test ready: web 5175, proxy 54326 -> 54321; exactly one live start permitted.');
async function stop() { await vite.close(); proxy.close(); process.exit(0); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
