import { randomUUID, createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error explicit local-only shared fixture.
import { createLocalP48PilotFixture } from '../../scripts/lib/local-p48-pilot-fixture.mjs';

const url = process.env.SUPABASE_URL!, key = process.env.SUPABASE_ANON_KEY!, dbUrl = process.env.SUPABASE_DB_URL!;
if (url !== 'http://127.0.0.1:54321' || new URL(dbUrl).hostname !== '127.0.0.1' || new URL(dbUrl).port !== '54322') throw Error('EXACT_LOCAL_ENDPOINTS_REQUIRED');
const sql = postgres(dbUrl, { max: 3, connection: { application_name: 'kpss_integrity_regression', statement_timeout: 20000 } });
const output = process.env.INTEGRITY_EVIDENCE_DIR;
const persist = (name: string, data: unknown) => { if (output) fs.writeFileSync(path.join(output, name), JSON.stringify(data, null, 2)); };
const actors: any[] = [], events: any[] = [];
const edition = '11000000-0000-0000-0000-000000000001', math = '20000000-0000-0000-0000-000000000002', stats = '20000000-0000-0000-0000-000000000014';
const windows = [{ weekday: 2, start_time: '07:15', end_time: '08:15', label: 'Personal Tuesday' }, { weekday: 4, start_time: '20:10', end_time: '21:10', label: 'Personal Thursday' }];
const check = async (query: any) => { const r = await query; if (r.error) throw r.error; return r.data; };
const client = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
async function actor(label: string, status = 'active') {
  const api = client(), nonce = randomUUID(), email = `integrity-${label}-${nonce}@example.invalid`;
  const sign = await api.auth.signUp({ email, password: `Local-${nonce}!` });
  expect(sign.error).toBeNull(); expect(sign.data.session?.access_token).toBeTruthy();
  const userId = sign.data.user!.id, token = sign.data.session!.access_token;
  const profile = await check(api.from('exam_profiles').insert({ user_id: userId, exam_edition_id: edition, preparation_start_date: '2026-08-19', target_exam_date: '2027-12-21', status }).select('*').single());
  const a = { label, api, userId, profileId: profile.id, token, email }; actors.push(a);
  persist('integration-fixture-identities.json', actors.map(({ label, userId, profileId, email }) => ({ label, userId, profileId, email })));
  return a;
}
async function choices(a: any) {
  const data: Record<string, any[]> = {};
  for (const table of ['exam_profiles', 'user_subjects', 'weekly_availability', 'resources', 'calendar_periods', 'p48_strategy_profiles', 'p48_resource_targets']) {
    const r = await sql`select to_jsonb(t) as data from public.${sql(table)} t where user_id=${a.userId}::uuid order by to_jsonb(t)::text`;
    data[table] = r.map(x => x.data);
  }
  data.capacityMinutes = [data.weekly_availability.filter(w => w.is_active).reduce((sum, w) => sum + minutes(w.end_time) - minutes(w.start_time), 0)];
  return data;
}
function minutes(time: string) { const [h, m] = time.split(':').map(Number); return h! * 60 + m!; }
async function state(a: any) { return check(a.api.rpc('weekly_availability_state', { p_exam_profile_id: a.profileId })); }
async function replace(a: any, payload: any, revision: string) { return a.api.rpc('replace_weekly_availability', { p_exam_profile_id: a.profileId, p_windows: payload, p_expected_revision: revision }); }
async function seed(a: any, strategy = false, capacity = true, resource = true) {
  await check(a.api.from('user_subjects').insert([math, stats].map(subject_id => ({ user_id: a.userId, exam_profile_id: a.profileId, subject_id, status: 'active' }))));
  if (capacity) await check(replace(a, windows, (await state(a)).revision));
  if (resource) {
    const r = await check(a.api.from('resources').insert({ user_id: a.userId, exam_profile_id: a.profileId, subject_id: math, name: 'Personal math book', resource_type: 'book', resource_role: 'primary', difficulty: 'normal', status: 'active' }).select('id').single());
    if (strategy) await check(a.api.from('p48_resource_targets').insert({ user_id: a.userId, exam_profile_id: a.profileId, resource_id: r.id, planned_minutes: 1000, sequence_order: 1, work_mode: 'book' }));
  }
  await check(a.api.from('calendar_periods').insert({ user_id: a.userId, exam_profile_id: a.profileId, period_type: 'custom', name: 'My academic period', start_date: '2026-12-14', end_date: '2026-12-18', capacity_multiplier: 0.25 }));
  if (strategy) await check(a.api.from('p48_strategy_profiles').insert({ user_id: a.userId, exam_profile_id: a.profileId, score_type: 'KPSSP48', target_exam_date: '2027-12-21', weekly_target_minutes: 120, monthly_target_minutes: 480, status: 'active', source_note: 'Explicit local selective fixture' }));
}
async function http(a: any, route: string, method = 'GET', body?: unknown) {
  const r = await fetch(`${url}/functions/v1/app-api${route}`, { method, headers: { apikey: key, authorization: `Bearer ${a.token}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  const result = { status: r.status, body: await r.json() };
  events.push({ actor: a.label, route, method, request: body ?? null, ...result }); persist('integration-http-results.json', events);
  return result;
}
async function planCounts(a: any) { return (await sql`select (select count(*)::int from public.weekly_plans where user_id=${a.userId}::uuid) as plans,(select count(*)::int from public.tasks where user_id=${a.userId}::uuid) as tasks,(select count(*)::int from public.study_sessions where user_id=${a.userId}::uuid) as sessions`)[0]; }

describe.sequential('actual local onboarding integrity with real Auth JWT, REST, Edge and PostgreSQL', () => {
  let fresh: any, draft: any, partial: any, selective: any, pilot: any, empty: any, missing: any, available: any, failed: any;
  beforeAll(async () => {
    fresh = await actor('new'); await seed(fresh);
    draft = await actor('draft', 'draft'); await seed(draft);
    partial = await actor('partial');
    selective = await actor('selective'); await seed(selective, true);
    pilot = await actor('pilot');
    await check(pilot.api.from('exam_profiles').update({ target_exam_date: '2027-09-06' }).eq('id', pilot.profileId));
    await createLocalP48PilotFixture(pilot.api, { url, userId: pilot.userId, profileId: pilot.profileId });
    empty = await actor('zero'); await seed(empty, true, false);
    missing = await actor('missing-resource'); await seed(missing, true, true, false);
    available = await actor('availability'); await seed(available);
    failed = await actor('generation-failure'); await seed(failed, true);
  }, 60000);
  afterAll(async () => { persist('integration-final-plan-counts.json', await Promise.all(actors.map(async a => ({ label: a.label, ...await planCounts(a) })))); await sql.end(); });

  it.each(['new', 'draft', 'partial', 'selective', 'pilot'])('ordinary reads and repeated/concurrent bootstrap preserve all choices: %s', async label => {
    const a = actors.find(a => a.label === label), before = await choices(a);
    for (let repeat = 0; repeat < 2; repeat++) {
      for (const route of ['/p48/roadmap', '/weekly-plan/current', '/execution/summary', '/study-sessions/active']) {
        const r = await http(a, route); expect(r.status).toBe(label === 'draft' ? 400 : 200);
      }
    }
    const boots = await Promise.all(Array.from({ length: 3 }, () => http(a, '/p48/bootstrap', 'POST', {})));
    expect(boots.map(r => r.status)).toEqual(Array(3).fill(label === 'draft' ? 400 : label === 'selective' || label === 'pilot' ? 200 : 409));
    expect(await choices(a)).toEqual(before); expect(await planCounts(a)).toEqual({ plans: 0, tasks: 0, sessions: 0 });
    persist(`preserved-${label}.json`, { before, after: await choices(a), concurrentBootstrapStatuses: boots.map(r => r.status) });
  });
  it('requires explicit intent without producing a first plan', async () => {
    expect((await http(pilot, '/p48/week/generate', 'POST', {})).status).toBe(400);
    expect((await pilot.api.rpc('create_p48_week_once', { p_payload: {} })).error?.message).toContain('EXPLICIT_INTENT_REQUIRED');
    expect(await planCounts(pilot)).toEqual({ plans: 0, tasks: 0, sessions: 0 });
  });
  it.each(['zero', 'missing-resource'])('rejects unsafe readiness: %s', async label => {
    const a = actors.find(a => a.label === label), before = await choices(a);
    const read = await http(a, '/p48/roadmap'); expect(read.body.weekGenerationReadiness.ready).toBe(false);
    const generate = await http(a, '/p48/week/generate', 'POST', { intent: 'generate_week' }); expect(generate.status).toBe(409);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
    const monday = new Date(today + 'T12:00:00Z'); monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const direct = await a.api.rpc('create_p48_week_once', { p_payload: { intent: 'generate_week', weekStartDate: monday.toISOString().slice(0, 10), availableMinutes: 60, blocks: [{ plannedDate: today, subjectId: math, estimatedMinutes: 60, workMode: 'book', title: 'Untrusted caller budget' }] } });
    expect(direct.error?.message).toBe(label === 'zero' ? 'P48_CAPACITY_SOURCE_MISSING' : 'P48_RESOURCES_REQUIRED');
    expect(await choices(a)).toEqual(before); expect((await planCounts(a)).plans).toBe(0);
  });
  it('configured pilot explicitly creates one week and concurrent duplicates preserve tasks', async () => {
    const before = await choices(pilot);
    const results = await Promise.all(Array.from({ length: 3 }, () => http(pilot, '/p48/week/generate', 'POST', { intent: 'generate_week' })));
    expect(results.map(r => r.status)).toEqual([201, 201, 201]);
    expect(results.filter(r => r.body.created)).toHaveLength(1);
    expect(new Set(results.map(r => r.body.plan.id)).size).toBe(1);
    const counts = await planCounts(pilot); expect(counts.plans).toBe(1); expect(counts.tasks).toBeGreaterThan(0); expect(counts.sessions).toBe(0);
    const tasks = await sql`select id,status from public.tasks where user_id=${pilot.userId}::uuid order by id`;
    expect(tasks.every(t => t.status !== 'cancelled')).toBe(true);
    expect((await http(pilot, '/p48/week/generate', 'POST', { intent: 'generate_week' })).body.created).toBe(false);
    expect(await sql`select id,status from public.tasks where user_id=${pilot.userId}::uuid order by id`).toEqual(tasks);
    expect(await choices(pilot)).toEqual(before);
    persist('configured-pilot-generation.json', { before, after: await choices(pilot), results, counts, tasks });
  });
  it('custom selected active resource profile generates without importing other subjects or resources', async () => {
    // Distinct daily capacity is explicit fixture configuration, not a bootstrap default.
    const weekday = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Istanbul', weekday: 'short' }).format(new Date()) === 'Sat' ? 6 : 7);
    const current = await state(selective); await check(replace(selective, [...windows, { weekday, start_time: '10:00', end_time: '11:00' }], current.revision));
    const before = await choices(selective), generated = await http(selective, '/p48/week/generate', 'POST', { intent: 'generate_week' });
    expect(generated.status).toBe(201); expect(generated.body.plan).toBeTruthy();
    expect(generated.body.tasks.every((t: any) => t.subject_id === math && t.resource_id)).toBe(true);
    expect(await choices(selective)).toEqual(before);
  });
  it('plan INSERT failure rolls back the real planner without configuration side effects', async () => {
    const s = await state(failed); await check(replace(failed, [{ weekday: 6, start_time: '10:00', end_time: '12:00' }, { weekday: 7, start_time: '10:00', end_time: '12:00' }], s.revision));
    const before = await choices(failed);
    await sql.begin(tx => tx.unsafe(`create function public.local_integrity_plan_fault() returns trigger language plpgsql set search_path='' as $$begin if new.user_id='${failed.userId}'::uuid then raise exception 'LOCAL_PLAN_INSERT_FAILURE'; end if; return new; end;$$; create trigger local_integrity_plan_fault before insert on public.weekly_plans for each row execute function public.local_integrity_plan_fault();`));
    try {
      const result = await http(failed, '/p48/week/generate', 'POST', { intent: 'generate_week' });
      expect(result.status).toBe(500); expect(JSON.stringify(result.body)).toContain('LOCAL_PLAN_INSERT_FAILURE');
      expect(await choices(failed)).toEqual(before); expect(await planCounts(failed)).toEqual({ plans: 0, tasks: 0, sessions: 0 });
      persist('plan-failure-rollback.json', { before, after: await choices(failed), result, rowRepair: false });
    } finally { await sql.begin(tx => tx.unsafe('drop trigger local_integrity_plan_fault on public.weekly_plans; drop function public.local_integrity_plan_fault();')); }
  });
  it('interrupts the real bootstrap RPC mid-execution and restores the exact read-only definition', async () => {
    const original = (await sql`select pg_get_functiondef('public.bootstrap_p48_strategy()'::regprocedure) as d`)[0].d;
    const before = await choices(fresh), delayed = original.replace('begin\n', `begin\n  if auth.uid()='${fresh.userId}'::uuid then perform pg_sleep(15); end if;\n`);
    expect(delayed).not.toBe(original); await sql.unsafe(delayed);
    try {
      // The S0 API is now independent of this retired SQL function. Exercise
      // interruption on the actual direct RPC and verify the API stays read-only.
      expect((await http(fresh, '/p48/bootstrap', 'POST', {})).status).toBe(409);
      const pending = Promise.resolve(fresh.api.rpc('bootstrap_p48_strategy'));
      let waiting: any[] = [];
      for (let i = 0; i < 30 && !waiting.length; i++) { await new Promise(r => setTimeout(r, 100)); waiting = await sql`select pid,wait_event,query from pg_stat_activity where wait_event='PgSleep' and query ilike '%bootstrap_p48_strategy%'`; }
      expect(waiting).toHaveLength(1);
      const cancelled = await sql`select pg_cancel_backend(${waiting[0].pid}) as cancelled`; expect(cancelled[0].cancelled).toBe(true);
      const result = await pending; expect(result.error?.code).toBe('57014'); expect(await choices(fresh)).toEqual(before);
      persist('bootstrap-interruption.json', { before, after: await choices(fresh), result, cancelled: true, delayScopedToNewUser: fresh.userId, rowRepair: false });
    } finally {
      await sql.unsafe(original);
      expect((await sql`select pg_get_functiondef('public.bootstrap_p48_strategy()'::regprocedure) as d`)[0].d).toBe(original);
      persist('bootstrap-definition-restored.json', { exactDefinitionRestored: true, sha256: createHash('sha256').update(original).digest('hex') });
    }
  });

  it.each([
    null, [{ weekday: 8, start_time: '07:00', end_time: '08:00' }], [{ weekday: 2, start_time: '09:00', end_time: '08:00' }],
    [{ weekday: 2, start_time: '25:00', end_time: '08:00' }], [{ ...windows[0], user_id: 'foreign' }],
    [windows[0], { ...windows[0], start_time: '07:30' }],
  ].map(payload => ({ payload })))('invalid availability retains exact rows and revision: $payload', async ({ payload }) => {
    const before = await state(available), result = await replace(available, payload, before.revision);
    expect(result.error).toBeTruthy(); expect(await state(available)).toEqual(before);
  });
  it('actual availability INSERT exception rolls back its preceding DELETE', async () => {
    const before = await state(available);
    await sql.unsafe(`create function public.local_integrity_availability_fault() returns trigger language plpgsql set search_path='' as $$begin if new.user_id='${available.userId}'::uuid and new.label='INJECT_INSERT_FAILURE' then raise exception 'LOCAL_AVAILABILITY_INSERT_FAILURE'; end if; return new; end;$$; create trigger local_integrity_availability_fault before insert on public.weekly_availability for each row execute function public.local_integrity_availability_fault();`);
    try {
      const result = await replace(available, [{ weekday: 1, start_time: '06:00', end_time: '07:00', label: 'INJECT_INSERT_FAILURE' }], before.revision);
      expect(result.error?.message).toContain('LOCAL_AVAILABILITY_INSERT_FAILURE'); expect(await state(available)).toEqual(before);
      persist('availability-insert-rollback.json', { before, result: result.error, after: await state(available), rowRepair: false });
    } finally { await sql.unsafe('drop trigger local_integrity_availability_fault on public.weekly_availability; drop function public.local_integrity_availability_fault();'); }
  });
  it('identical concurrent and delayed duplicate submits preserve row IDs', async () => {
    const before = await state(available);
    const results = await Promise.all(Array.from({ length: 4 }, () => replace(available, windows, before.revision)));
    expect(results.every(r => !r.error && !r.data.changed)).toBe(true); expect(await state(available)).toEqual(before);
    const payload = [{ weekday: 1, start_time: '06:00', end_time: '07:00' }];
    await check(replace(available, payload, before.revision)); const saved = await state(available);
    const retry = await replace(available, payload, before.revision); expect(retry.error).toBeNull(); expect(retry.data.changed).toBe(false); expect(await state(available)).toEqual(saved);
    persist('availability-duplicate-results.json', { original: before, saved, retry: retry.data });
  });
  it('conflicting concurrent saves from one revision yield one winner and one conflict', async () => {
    const before = await state(available);
    const payloads = [[{ weekday: 3, start_time: '07:00', end_time: '08:00' }], [{ weekday: 5, start_time: '17:00', end_time: '19:00' }]];
    const results = await Promise.all(payloads.map(p => replace(available, p, before.revision)));
    expect(results.filter(r => !r.error)).toHaveLength(1); expect(results.filter(r => r.error?.message === 'AVAILABILITY_CONFLICT')).toHaveLength(1);
    const winner = results.find(r => !r.error)!.data; expect(await state(available)).toEqual({ windows: winner.windows, revision: winner.revision });
    persist('availability-concurrent-results.json', { before, results: results.map(r => ({ data: r.data, error: r.error })), after: await state(available) });
  });
  it('allows adjacent windows and explicit empty, reporting zero capacity honestly', async () => {
    const before = await state(available);
    const adjacent = await replace(available, [{ weekday: 1, start_time: '07:00', end_time: '08:00' }, { weekday: 1, start_time: '08:00', end_time: '09:00' }], before.revision);
    expect(adjacent.error).toBeNull(); expect(adjacent.data.capacity_minutes).toBe(120);
    const clear = await replace(available, [], adjacent.data.revision); expect(clear.error).toBeNull(); expect(clear.data.capacity_minutes).toBe(0); expect(clear.data.windows).toEqual([]);
  });
  it('denies cross-user reads/writes and anonymous RPCs with unchanged foreign rows', async () => {
    const before = await choices(fresh), mine = await choices(draft);
    const read = await draft.api.rpc('weekly_availability_state', { p_exam_profile_id: fresh.profileId }); expect(read.error?.message).toBe('EXAM_PROFILE_NOT_FOUND');
    const write = await draft.api.rpc('replace_weekly_availability', { p_exam_profile_id: fresh.profileId, p_windows: [], p_expected_revision: (await state(fresh)).revision }); expect(write.error?.message).toBe('EXAM_PROFILE_NOT_FOUND');
    for (const [name, params] of [['bootstrap_p48_strategy', {}], ['weekly_availability_state', { p_exam_profile_id: fresh.profileId }], ['replace_weekly_availability', { p_exam_profile_id: fresh.profileId, p_windows: [], p_expected_revision: (await state(fresh)).revision }], ['create_p48_week_once', { p_payload: {} }]] as const) expect((await client().rpc(name, params)).error?.code).toBe('42501');
    expect(await choices(fresh)).toEqual(before); expect(await choices(draft)).toEqual(mine);
  });
  it('retains JWT and Planner V2 Confirm/Apply gates', async () => {
    const unauth = await fetch(`${url}/functions/v1/app-api/p48/roadmap`, { headers: { apikey: key } }); expect(unauth.status).toBe(401);
    for (const route of ['/planner-v2/confirm', '/planner-v2/apply']) {
      const result = await http(fresh, route, 'POST', {}); expect(result.status).toBe(403); expect(JSON.stringify(result.body)).toContain('DISABLED');
    }
    const proposals = await sql`select count(*)::int as n from public.planning_v2_proposals where user_id=${fresh.userId}::uuid`; expect(proposals[0].n).toBe(0);
  });
});
