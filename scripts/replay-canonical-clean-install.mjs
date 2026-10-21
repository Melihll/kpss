// Fresh-only PG17 replay. No DB URL, existing container, production flag, or SQL source edits.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { baselineCommit, image, sha, lf, literal, buildCopies, assertPrefix } from "./lib/canonical-replay-compatibility.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const context = "desktop-linux";
const token = randomUUID();
const name = "kpss-eng002c-boundary-" + token;
const output = mkdtempSync(path.join(os.tmpdir(), "kpss-eng002c-boundary-"));
const report = { status: "FAIL", replay: "NOT EXECUTED", output, image, baselineCommit,
  applied: [], postchecks: "NOT EXECUTED", negativeFixtures: [], cleanup: "NOT NEEDED",
  pg15: "INCOMPATIBLE / NOT EXECUTED: INHERIT/SET membership options and pg_auth_members columns require PG16+. config.toml unchanged." };
const originals = new Map();
const git = args => execFileSync("git", ["--no-optional-locks", ...args], { cwd: root });
const save = (file, data) => writeFileSync(path.join(output, file), data);
let container;

function docker(args, input, required = true) {
  const r = spawnSync("docker", ["--context", context, ...args],
    { input, encoding: "utf8", timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
  if (required && (r.error || r.status !== 0)) {
    // Never print arguments: create has a synthetic password.
    throw new Error(r.error?.code ?? (r.stderr || r.stdout || "Docker command failed").trim());
  }
  return r;
}
function ownContainer() {
  assert.match(container ?? "", /^[a-f0-9]{64}$/);
  const state = JSON.parse(docker(["inspect", container]).stdout)[0];
  if (state.Id !== container || state.Name !== "/" + name ||
      state.Config.Labels?.["io.kpss.eng002c.boundary"] !== token ||
      state.Config.Image !== image || state.HostConfig.NetworkMode !== "none" ||
      Object.keys(state.HostConfig.PortBindings ?? {}).length ||
      state.Mounts.some(m => m.Type !== "tmpfs") || !state.HostConfig.Tmpfs?.["/var/lib/postgresql/data"]) {
    throw new Error("Task container identity/isolation mismatch");
  }
}
function sql(text, required = true) {
  ownContainer();
  const r = docker(["exec", "-i", container, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
    "-v", "VERBOSITY=verbose", "-U", "postgres", "-d", "postgres"], text, required);
  return required ? r.stdout.trim() : r;
}
function state() {
  return JSON.parse(sql(`select json_build_object(
    'history',(select coalesce(json_agg(version order by version),'[]') from supabase_migrations.schema_migrations),
    'completed',(select coalesce(json_agg(json_build_array(ordinal,version,canonical_sha256,replay_sha256,success) order by ordinal),'[]') from eng002c_replay.completed));`));
}
function hashMutation(signature) {
  return `do $fixture$ declare d text; begin
    d:=pg_get_functiondef(${literal(signature)}::regprocedure);
    if strpos(d,'AS $function$')=0 then raise exception 'FIXTURE_SETUP_FAILED'; end if;
    execute replace(d,'AS $function$','AS $function$' || E'\n-- negative hash fixture\n');
    end $fixture$;`;
}
function guardFixtures(copy, prefix) {
  const before = state();
  assertPrefix(before, prefix);
  // Guard probes are always rolled back, including CREATE ROLE in the 68th guard.
  sql("begin;\n" + copy.probe + "\nrollback;");
  const first = literal(prefix[0].version);
  const cases = [
    ["missing-history", `delete from supabase_migrations.schema_migrations where version=${first};`, "ENG002C_HISTORY_MISMATCH"],
    ["unexpected-history", "insert into supabase_migrations.schema_migrations(version) values ('20990101000000');", "ENG002C_HISTORY_MISMATCH"],
    ["same-count-wrong-version", `delete from supabase_migrations.schema_migrations where version=${first}; insert into supabase_migrations.schema_migrations(version) values ('20990101000000');`, "ENG002C_HISTORY_MISMATCH"],
    ["wrong-success-order", "update eng002c_replay.completed set ordinal=10000 where ordinal=1; update eng002c_replay.completed set ordinal=1 where ordinal=2; update eng002c_replay.completed set ordinal=2 where ordinal=10000;", "ENG002C_SUCCESS_SEQUENCE_MISMATCH"],
    ["source-sha-ledger-drift", "update eng002c_replay.completed set canonical_sha256=repeat('0',64) where ordinal=1;", "ENG002C_SUCCESS_SEQUENCE_MISMATCH"],
    ["replay-sha-ledger-drift", "update eng002c_replay.completed set replay_sha256=repeat('0',64) where ordinal=1;", "ENG002C_SUCCESS_SEQUENCE_MISMATCH"],
    ["foreign-run", "update eng002c_replay.run set run_id='00000000-0000-0000-0000-000000000000';", "ENG002C_RUN_IDENTITY_MISMATCH"],
    ["ledger-privilege-drift", "grant select on eng002c_replay.completed to authenticated;", "ENG002C_LEDGER_PRIVILEGES_REQUIRED"],
    ["wrong-operator", "set local role authenticated;", "ENG002C_OPERATOR_REQUIRED"],
  ];
  if (copy.version === "20261017213000") {
    cases.push(["original-boundary-function-hash", hashMutation("p0_session_integrity.guard_session_boundary()"), "EXACT_PRODUCTION46_BOUNDARY_REQUIRED"]);
    cases.push(["existing-repair-role", "create role kpss_session_repairer nologin;", "REPAIR_ROLE_ALREADY_EXISTS"]);
  } else {
    const signature = "p0_session_repair.authorize(uuid,uuid,uuid,uuid,uuid,uuid,date,text,text)";
    cases.push(["repair-membership-drift", "grant kpss_session_repairer to postgres with inherit false,set true;", "EXACT_REPAIR_MEMBERSHIP_REQUIRED"]);
    cases.push(["repair-role-login", "alter role kpss_session_repairer login;", "RESTRICTED_REPAIR_ROLE_REQUIRED"]);
    cases.push(["repair-function-hash", hashMutation(signature), "EXACT_REPAIR_FUNCTION_BASELINE_REQUIRED"]);
    cases.push(["repair-function-owner", `grant kpss_session_repairer to postgres with inherit false,set true;
      grant create on schema p0_session_repair to kpss_session_repairer;
      alter function ${signature} owner to kpss_session_repairer;
      revoke create on schema p0_session_repair from kpss_session_repairer;
      revoke kpss_session_repairer from postgres granted by postgres;`, "EXACT_REPAIR_FUNCTION_BASELINE_REQUIRED"]);
  }
  for (const [fixture, mutation, expected] of cases) {
    const result = sql("begin;\n" + mutation + "\n" + copy.probe + "\nrollback;", false);
    assert(!result.error && result.status !== 0, "Negative guard fixture did not fail: " + fixture);
    assert.match(result.stderr, new RegExp("ERROR:.*P0001: " + expected), "Wrong negative fixture failure: " + fixture);
    assert.deepEqual(state(), before, "Fixture transaction did not roll back");
    report.negativeFixtures.push({ migration: copy.version, fixture, expected, status: "PASS" });
  }
  // Recheck the untouched production hash/membership/owner baseline after all rollbacks.
  sql("begin;\n" + copy.probe + "\nrollback;");
}

try {
  const args = process.argv.slice(2);
  assert(args.length === 0 || (args.length === 2 && args[0] === "--db48-evidence"), "Only --db48-evidence <result.json> is accepted");
  report.sourceCommit = git(["rev-parse", "HEAD"]).toString().trim();
  git(["merge-base", "--is-ancestor", baselineCommit, "HEAD"]);
  const inventory = ref => git(["ls-tree", "-r", "--name-only", ref, "--", "supabase/migrations"])
    .toString().trim().split(/\r?\n/).filter(f => f.endsWith(".sql")).sort();
  const files = inventory(baselineCommit);
  assert.equal(files.length, 69);
  assert.deepEqual(inventory("HEAD"), files, "Canonical Git inventory drift");
  assert.deepEqual(readdirSync(path.join(root, "supabase/migrations")).filter(f => f.toLowerCase().endsWith(".sql")).sort(), files.map(f => path.basename(f)), "Canonical working inventory drift");
  const rows = files.map(canonicalPath => {
    const absolute = path.join(root, canonicalPath);
    assert(lstatSync(absolute).isFile() && !lstatSync(absolute).isSymbolicLink());
    const working = readFileSync(absolute);
    originals.set(absolute, sha(working));
    const bytes = git(["cat-file", "blob", baselineCommit + ":" + canonicalPath]);
    assert.equal(sha(git(["cat-file", "blob", "HEAD:" + canonicalPath])), sha(bytes), "Canonical Git SHA drift");
    assert(lf(working).equals(lf(bytes)), "Canonical working source drift: " + canonicalPath);
    return { canonicalPath, filename: path.basename(canonicalPath), version: path.basename(canonicalPath).slice(0, 14), bytes, canonicalSourceSha256: sha(bytes) };
  });
  for (const relative of ["supabase/config.toml", "docs/product/migration-provenance/db48.json", "scripts/replay-db48-clean-install.mjs", "scripts/check-migration-provenance.mjs"]) {
    const absolute = path.join(root, relative);
    const bytes = readFileSync(absolute);
    originals.set(absolute, sha(bytes));
    assert(lf(bytes).equals(lf(git(["cat-file", "blob", baselineCommit + ":" + relative]))), "Protected baseline source drift");
  }
  report.harnessSha256 = {};
  for (const relative of ["scripts/replay-canonical-clean-install.mjs", "scripts/lib/canonical-replay-compatibility.mjs", "scripts/check-canonical-replay-compatibility.mjs"]) {
    const absolute = path.join(root, relative);
    const hash = sha(readFileSync(absolute));
    originals.set(absolute, hash);
    report.harnessSha256[relative] = hash;
  }
  report.provenance = JSON.parse(execFileSync(process.execPath, [path.join(root, "scripts/check-migration-provenance.mjs")], { encoding: "utf8" }));
  assert.equal(report.provenance.status, "PASS");
  assert.equal(report.provenance.counts.checked, 48);
  assert.equal(report.provenance.unexpectedMigrationFiles.length, 21);
  if (args.length) {
    const absolute = path.resolve(args[1]);
    const bytes = readFileSync(absolute);
    originals.set(absolute, sha(bytes));
    const evidence = JSON.parse(bytes);
    const manifest = JSON.parse(readFileSync(path.join(root, "docs/product/migration-provenance/db48.json")));
    assert.equal(evidence.status, "PASS"); assert.equal(evidence.replay, "PASS");
    assert.equal(evidence.manifestSha256, sha(readFileSync(path.join(root, "docs/product/migration-provenance/db48.json"))));
    assert.deepEqual(evidence.applied, manifest.migrations.map(r => ({ version: r.version, sha256: r.canonicalSourceSha256 })));
    assert.equal(Object.keys(evidence.postchecks).length, 10);
    assert(Object.values(evidence.postchecks).every(v => v === true));
    report.db48Evidence = { path: absolute, sha256: sha(bytes), replay: "48/48 PASS (existing)", postchecks: "10/10 PASS (existing)" };
  }
  const copies = buildCopies(rows, token);
  mkdirSync(path.join(output, "migrations"));
  mkdirSync(path.join(output, "compatibility"));
  report.inventory = copies.map(({ bytes, probe, ...row }) => row);
  for (const copy of copies) {
    writeFileSync(path.join(output, "migrations", copy.filename), copy.bytes);
    if (copy.transformation) {
      writeFileSync(path.join(output, "compatibility", copy.filename + ".original"), rows.find(r => r.version === copy.version).bytes);
      writeFileSync(path.join(output, "compatibility", copy.filename), copy.bytes);
    }
  }
  const endpoint = docker(["context", "inspect", context, "--format", "{{.Endpoints.docker.Host}}"]).stdout.trim();
  assert.equal(endpoint, "npipe:////./pipe/dockerDesktopLinuxEngine", "Only the local Docker Desktop pipe is allowed");
  report.imageId = docker(["image", "inspect", image, "--format", "{{.Id}}"]).stdout.trim();
  container = docker(["create", "--pull=never", "--name", name, "--label", "io.kpss.eng002c.boundary=" + token,
    "--network", "none", "--restart", "no", "--tmpfs", "/var/lib/postgresql/data:rw,size=1073741824",
    "-e", "PGDATA=/var/lib/postgresql/data", "-e", "POSTGRES_DB=postgres", "-e", "POSTGRES_PASSWORD=" + randomBytes(32).toString("hex"),
    image, "postgres", "-D", "/etc/postgresql", "-c", "listen_addresses="]).stdout.trim();
  report.containerId = container; report.containerName = name;
  ownContainer(); docker(["start", container]);
  let ready = false;
  for (let i = 0; i < 120; i++) {
    ownContainer();
    const probe = docker(["exec", container, "pg_isready", "-U", "postgres", "-d", "postgres"], undefined, false);
    const main = docker(["exec", container, "cat", "/proc/1/comm"]).stdout.trim();
    if (probe.status === 0 && ["postgres", ".postgres-wrapp"].includes(main)) { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert(ready, "New container readiness timeout");
  report.server = JSON.parse(sql("select json_build_object('version',version(),'currentUser',current_user,'sessionUser',session_user,'superuser',(select rolsuper from pg_roles where rolname=current_user));"));
  assert.match(report.server.version, /^PostgreSQL 17\.6 /);
  assert.equal(report.server.currentUser, "postgres"); assert.equal(report.server.sessionUser, "postgres"); assert.equal(report.server.superuser, false);
  report.emptyBaseline = JSON.parse(sql("select json_build_object('publicTables',(select count(*) from pg_tables where schemaname='public'),'authUsers',(select count(*) from auth.users),'historyExists',to_regclass('supabase_migrations.schema_migrations') is not null);"));
  assert.deepEqual(report.emptyBaseline, { publicTables: 0, authUsers: 0, historyExists: false });
  sql(`create schema if not exists supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key,statements text[],name text);
    create schema eng002c_replay authorization postgres;
    revoke all on schema eng002c_replay from public,anon,authenticated,service_role,authenticator;
    create table eng002c_replay.run(run_id uuid primary key,source_commit text not null,image text not null);
    create table eng002c_replay.completed(ordinal integer primary key check(ordinal>0),version text unique not null,
      canonical_sha256 text not null,replay_sha256 text not null,success boolean not null check(success));
    revoke all on all tables in schema eng002c_replay from public,anon,authenticated,service_role,authenticator;
    insert into eng002c_replay.run values (${literal(token)},${literal(baselineCommit)},${literal(image)});`);
  report.replay = "FAIL";
  for (const copy of copies) {
    const prefix = copies.slice(0, report.applied.length);
    report.firstBlocker = { ordinal: prefix.length + 1, version: copy.version, filename: copy.filename };
    assertPrefix(state(), prefix);
    assert.equal(sha(readFileSync(path.join(output, "migrations", copy.filename))), copy.replaySha256, "Temporary copy SHA drift");
    if (copy.probe) guardFixtures(copy, prefix);
    sql(copy.bytes);
    sql(`begin; insert into supabase_migrations.schema_migrations(version,name) values (${literal(copy.version)},${literal(copy.filename.slice(15,-4))});
      insert into eng002c_replay.completed values (${prefix.length + 1},${literal(copy.version)},${literal(copy.canonicalSourceSha256)},${literal(copy.replaySha256)},true); commit;`);
    report.applied.push({ version: copy.version, canonicalSha256: copy.canonicalSourceSha256, replaySha256: copy.replaySha256 });
    console.log("APPLIED " + copy.version + " (" + report.applied.length + "/69)");
  }
  delete report.firstBlocker;
  assertPrefix(state(), copies);
  report.replay = "PASS";
  const checks = JSON.parse(sql(`select json_object_agg(name,ok) from (values
    ('coreTablesRls',(select count(*)=4 and bool_and(relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('user_profiles','tasks','study_sessions','weekly_plans'))),
    ('corePolicies',(select count(distinct tablename)=4 from pg_policies where schemaname='public' and tablename in ('user_profiles','tasks','study_sessions','weekly_plans'))),
    ('coreFunctions',to_regprocedure('auth.uid()') is not null and to_regprocedure('public.preview_study_session_finish(uuid)') is not null and to_regprocedure('public.confirm_study_session_finish(uuid,jsonb)') is not null and to_regprocedure('p0_session_integrity.guard_session_boundary()') is not null),
    ('repairFunctions',(select count(*)=9 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='p0_session_repair')),
    ('repairSchemaPrivate',not exists(select 1 from pg_roles r where r.rolname in ('anon','authenticated','service_role','authenticator') and has_schema_privilege(r.oid,'p0_session_repair','USAGE'))),
    ('repairFunctionsPrivate',not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join pg_roles r where n.nspname='p0_session_repair' and r.rolname in ('anon','authenticated','service_role','authenticator') and has_function_privilege(r.oid,p.oid,'EXECUTE'))),
    ('repairNoPublicExecute',not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where n.nspname='p0_session_repair' and a.grantee=0 and a.privilege_type='EXECUTE')),
    ('repairRoleRestricted',(select not rolcanlogin and not rolinherit and not rolsuper and not rolbypassrls and not rolcreaterole and not rolcreatedb from pg_roles where rolname='kpss_session_repairer')),
    ('operatorExecute',has_function_privilege('postgres','p0_session_repair.authorize(uuid,uuid,uuid,uuid,uuid,uuid,date,text,text)','EXECUTE') and has_function_privilege('postgres','p0_session_repair.apply(uuid,text,integer)','EXECUTE') and has_function_privilege('postgres','p0_session_repair.snapshot(uuid)','EXECUTE') and has_function_privilege('postgres','p0_session_repair.revision(jsonb)','EXECUTE')),
    ('noAuthUserData',(select count(*)=0 from auth.users)),
    ('repairMembership',(select count(*)=1 and bool_and(member='postgres'::regrole and grantor='supabase_admin'::regrole and admin_option and not inherit_option and not set_option) from pg_auth_members where roleid='kpss_session_repairer'::regrole)),
    ('allWriterRolesRestricted',(select count(*)=8 and bool_and(not rolcanlogin and not rolinherit and not rolsuper and not rolbypassrls and not rolcreaterole and not rolcreatedb) from pg_roles where rolname in ('kpss_availability_writer','kpss_plan_writer','kpss_execution_writer','kpss_baseline_writer','kpss_capacity_writer','kpss_initial_plan_writer','kpss_session_writer','kpss_session_repairer'))),
    ('noClientWriterMembership',not exists(select 1 from pg_auth_members a join pg_roles r on r.oid=a.roleid join pg_roles m on m.oid=a.member where r.rolname in ('kpss_availability_writer','kpss_plan_writer','kpss_execution_writer','kpss_baseline_writer','kpss_capacity_writer','kpss_initial_plan_writer','kpss_session_writer','kpss_session_repairer') and m.rolname in ('anon','authenticated','service_role','authenticator'))),
    ('extraTablesRls',(select count(*)=6 and bool_and(relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('ai_coach_proactive_presentations','ai_coach_proactive_user_controls','ai_coach_proactive_clear_observations','study_capacity_preferences','study_capacity_history','initial_manual_plan_receipts'))),
    ('extraPolicies',(select count(distinct tablename)=6 from pg_policies where schemaname='public' and tablename in ('ai_coach_proactive_presentations','ai_coach_proactive_user_controls','ai_coach_proactive_clear_observations','study_capacity_preferences','study_capacity_history','initial_manual_plan_receipts'))),
    ('writerFunctionOwners',(select count(p.oid)=4 and bool_and(coalesce(pg_get_userbyid(p.proowner)=e.owner_name and p.prosecdef,false)) from (values ('public.replace_weekly_availability(uuid,jsonb,text)','kpss_availability_writer'),('public.create_p48_week_once(jsonb)','kpss_plan_writer'),('public.set_study_capacity(uuid,text,jsonb,text)','kpss_capacity_writer'),('public.create_initial_manual_plan(jsonb)','kpss_initial_plan_writer')) e(signature,owner_name) left join pg_proc p on p.oid=to_regprocedure(e.signature))),
    ('repairOwners',(select count(*)=9 and bool_and(pg_get_userbyid(p.proowner)=case when p.proname='authorize' then 'postgres' else 'kpss_session_repairer' end) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='p0_session_repair')),
    ('ledgerPrivate',not exists(select 1 from pg_roles r where r.rolname in ('anon','authenticated','service_role','authenticator') and (has_schema_privilege(r.oid,'eng002c_replay','USAGE') or has_table_privilege(r.oid,'eng002c_replay.completed','SELECT,INSERT,UPDATE,DELETE'))))
    ) checks(name,ok);`));
  report.postchecks = checks;
  assert(Object.values(checks).every(v => v === true), "A scoped ACL/RLS postcheck failed");
  report.status = "PASS";
} catch (error) {
  report.error = error.message;
  console.error(error.message);
  if (container && report.emptyBaseline) {
    try { report.historyAtStop = state(); } catch (e) { report.historyReadError = e.message; }
  }
} finally {
  for (const [file, expected] of originals) {
    try { assert.equal(sha(readFileSync(file)), expected, "Source changed during replay"); }
    catch (e) { report.status = "FAIL"; (report.sourceVerificationErrors ??= []).push({ file, error: e.message }); }
  }
  report.canonicalFilesUnchanged = !report.sourceVerificationErrors;
  if (container) {
    try { ownContainer(); docker(["rm", "-f", "-v", container]); report.cleanup = "REMOVED OWN CONTAINER AND TMPFS"; }
    catch (e) { report.status = "FAIL"; report.cleanup = "FAILED: " + e.message; }
  }
  report.successfulMigrations = report.applied.length;
  try { save("result.json", JSON.stringify(report, null, 2) + "\n"); }
  catch (e) { report.status = "FAIL"; report.resultWriteError = e.message; }
  process.exitCode = report.status === "PASS" ? 0 : 1;
  console.log(JSON.stringify({ status: report.status, replay: report.replay, successfulMigrations: report.applied.length,
    postchecks: report.postchecks, negativeFixtures: report.negativeFixtures.length, firstBlocker: report.firstBlocker,
    error: report.error, output, cleanup: report.cleanup, canonicalFilesUnchanged: report.canonicalFilesUnchanged,
    sourceVerificationErrors: report.sourceVerificationErrors, resultWriteError: report.resultWriteError }, null, 2));
}
