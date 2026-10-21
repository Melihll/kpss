// Task-owned, disposable DB48 replay. Never accepts a DB URL or existing container.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const image = "public.ecr.aws/supabase/postgres@sha256:3866d94d8426927e8db3f1c5d790752292bfbe27b5f1f46e199ae1b7d3c1710b";
const context = "desktop-linux";
const token = randomUUID();
const name = "kpss-eng002b-" + token;
const output = mkdtempSync(path.join(os.tmpdir(), "kpss-eng002b-replay-"));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const lf = bytes => Buffer.from(bytes.toString("latin1").replace(/\r\n/g, "\n"), "latin1");
const git = args => execFileSync("git", ["--no-optional-locks", ...args], { cwd: root });
const save = (file, data) => writeFileSync(path.join(output, file), data);
const report = { status: "BLOCKED", replay: "NOT EXECUTED", output, image,
  network: "none", publishedPorts: 0, database: "new container-local postgres",
  applied: [], postchecks: "NOT EXECUTED", cleanup: "NOT NEEDED" };
let container;
const originals = new Map();

function docker(args, input, required = true) {
  const r = spawnSync("docker", ["--context", context, ...args],
    { input, encoding: "utf8", timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
  if (required && (r.error || r.status !== 0)) {
    // Do not include arguments: initialization has a synthetic random password.
    throw new Error(r.error?.code ?? (r.stderr || r.stdout || "Docker command failed").trim());
  }
  return r;
}
function ownContainer() {
  if (!container || !/^[a-f0-9]{64}$/.test(container)) throw new Error("No task-owned container");
  const state = JSON.parse(docker(["inspect", container]).stdout)[0];
  if (state.Config.Labels?.["io.kpss.eng002b"] !== token ||
      state.HostConfig.NetworkMode !== "none" ||
      Object.keys(state.HostConfig.PortBindings ?? {}).length ||
      state.Mounts.some(m => m.Type !== "tmpfs") ||
      !state.HostConfig.Tmpfs?.["/var/lib/postgresql/data"]) {
    throw new Error("Container isolation/ownership check failed");
  }
  return state;
}
function sql(text) {
  return docker(["exec", "-i", container, "psql", "-X", "-qAt",
    "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], text).stdout.trim();
}

try {
  report.sourceCommit = git(["rev-parse", "HEAD"]).toString().trim();
  const provenance = JSON.parse(execFileSync(process.execPath,
    [path.join(root, "scripts/check-migration-provenance.mjs")], { encoding: "utf8" }));
  if (provenance.status !== "PASS" || provenance.counts.checked !== 48) throw new Error("Provenance gate failed");
  report.provenance = provenance.counts;
  report.excludedSql = provenance.unexpectedMigrationFiles;
  const manifestBytes = readFileSync(path.join(root, "docs/product/migration-provenance/db48.json"));
  report.manifestSha256 = sha(manifestBytes);
  const rows = JSON.parse(manifestBytes.toString("utf8")).migrations;
  const versions = rows.map(row => row.version);
  if (rows.length !== 48 || new Set(versions).size !== 48 ||
      versions.some((v, i) => i > 0 && v <= versions[i - 1])) throw new Error("Manifest order/uniqueness mismatch");
  const copyDirectory = path.join(output, "migrations");
  mkdirSync(copyDirectory);
  const copies = [];
  for (const row of rows) {
    const sourcePath = path.join(root, row.canonicalPath);
    const working = readFileSync(sourcePath);
    originals.set(sourcePath, sha(working));
    const bytes = git(["cat-file", "blob", "HEAD:" + row.canonicalPath]);
    if (sha(bytes) !== row.canonicalSourceSha256 || !lf(working).equals(lf(bytes))) {
      throw new Error("Exact source mismatch: " + row.filename);
    }
    writeFileSync(path.join(copyDirectory, row.filename), bytes);
    copies.push({ row, bytes });
  }

  // OUTSIDE DB48: prove the one-byte edit without replaying or recording this SQL.
  const compatibilityPath = "supabase/migrations/20261010220000_s0_r2_actual_progress_protection.sql";
  if (versions.includes("20261010220000")) throw new Error("Compatibility file unexpectedly entered DB48");
  const canonical = git(["cat-file", "blob", "HEAD:" + compatibilityPath]);
  const original = readFileSync(path.join(root, compatibilityPath));
  originals.set(path.join(root, compatibilityPath), sha(original));
  if (sha(canonical) !== "753779b041d36f0acbc2541cac9c5caa497c7552731e7ab1fc6bb717d3dc33eb" ||
      !lf(original).equals(canonical)) throw new Error("Compatibility source SHA mismatch");
  const marker = Buffer.from("$function$");
  const offset = original.lastIndexOf(marker) + marker.length;
  if (offset < marker.length || ![10, 13].includes(original[offset])) throw new Error("Unexpected terminator");
  const patched = Buffer.concat([original.subarray(0, offset), Buffer.from(";"), original.subarray(offset)]);
  if (patched.length !== original.length + 1 ||
      !Buffer.concat([patched.subarray(0, offset), patched.subarray(offset + 1)]).equals(original)) {
    throw new Error("Compatibility difference is not one semicolon");
  }
  save("compatibility-original.sql", original);
  save("compatibility-fresh-only.sql", patched);
  report.compatibility = { path: compatibilityPath, canonicalGitSha256: sha(canonical),
    originalWorkingSha256: sha(original), temporarySha256: sha(patched),
    insertedByte: ";", byteOffset: offset, otherDifferences: 0, inDb48: false, executed: false };

  const endpoint = docker(["context", "inspect", context, "--format", "{{.Endpoints.docker.Host}}"]).stdout.trim();
  if (endpoint !== "npipe:////./pipe/dockerDesktopLinuxEngine") throw new Error("Expected local Docker Desktop named pipe");
  report.dockerEndpoint = endpoint;
  docker(["info", "--format", "{{.ServerVersion}}"]);
  report.imageId = docker(["image", "inspect", image, "--format", "{{.Id}}"]).stdout.trim();
  const password = randomBytes(32).toString("hex");
  container = docker(["create", "--pull=never", "--name", name,
    "--label", "io.kpss.eng002b=" + token, "--network", "none", "--restart", "no",
    "--tmpfs", "/var/lib/postgresql/data:rw,size=1073741824",
    "-e", "PGDATA=/var/lib/postgresql/data", "-e", "POSTGRES_DB=postgres",
    "-e", "POSTGRES_PASSWORD=" + password, image,
    "postgres", "-D", "/etc/postgresql", "-c", "listen_addresses="]).stdout.trim();
  report.containerName = name;
  report.containerId = container;
  ownContainer();
  docker(["start", container]);
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    const probe = docker(["exec", container, "pg_isready", "-U", "postgres", "-d", "postgres"], undefined, false);
    const state = ownContainer();
    if (!state.State.Running) throw new Error("Container exited during initialization");
    const mainProcess = docker(["exec", container, "cat", "/proc/1/comm"]).stdout.trim();
    if (probe.status === 0 && ["postgres", ".postgres-wrapp"].includes(mainProcess)) { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error("New PostgreSQL container readiness timeout");
  report.server = JSON.parse(sql("select json_build_object('version',version(),'currentUser',current_user,'superuser',(select rolsuper from pg_roles where rolname=current_user));"));
  if (report.server.currentUser !== "postgres" || report.server.superuser) throw new Error("Expected normal Supabase postgres operator");
  const baseline = JSON.parse(sql("select json_build_object('publicTables',(select count(*) from pg_tables where schemaname='public'),'authUsers',(select count(*) from auth.users),'historyExists',to_regclass('supabase_migrations.schema_migrations') is not null);"));
  if (baseline.publicTables !== 0 || baseline.authUsers !== 0) throw new Error("Image is not an empty application database");
  report.emptyBaseline = baseline;
  sql("create schema if not exists supabase_migrations; create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);");
  if (sql("select count(*) from supabase_migrations.schema_migrations;") !== "0") throw new Error("Fresh migration history must be empty");

  report.replay = "FAIL";
  for (const { row, bytes } of copies) {
    report.firstBlocker = { version: row.version, filename: row.filename, sha256: sha(bytes) };
    sql(bytes);
    // Only successful execution receives a new history entry in this new DB.
    sql("insert into supabase_migrations.schema_migrations(version,name) values ('" +
      row.version + "','" + row.filename.slice(15, -4) + "');");
    report.applied.push({ version: row.version, sha256: sha(bytes) });
    console.log("APPLIED " + row.version + " (" + report.applied.length + "/48)");
  }
  delete report.firstBlocker;
  report.replay = "PASS";
  const history = JSON.parse(sql("select coalesce(json_agg(version order by version),'[]') from supabase_migrations.schema_migrations;"));
  if (JSON.stringify(history) !== JSON.stringify(versions)) throw new Error("Fresh history differs from DB48");
  const checks = JSON.parse(sql("\nselect json_object_agg(name,ok) from (values\n ('coreTablesRls', (select count(*)=4 and bool_and(relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('user_profiles','tasks','study_sessions','weekly_plans'))),\n ('corePolicies', (select count(distinct tablename)=4 from pg_policies where schemaname='public' and tablename in ('user_profiles','tasks','study_sessions','weekly_plans'))),\n ('coreFunctions', to_regprocedure('auth.uid()') is not null and to_regprocedure('public.preview_study_session_finish(uuid)') is not null and to_regprocedure('public.confirm_study_session_finish(uuid,jsonb)') is not null and to_regprocedure('p0_session_integrity.guard_session_boundary()') is not null),\n ('repairFunctions', (select count(*)=9 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='p0_session_repair')),\n ('repairSchemaPrivate', not exists(select 1 from pg_roles r where r.rolname in ('anon','authenticated','service_role','authenticator') and has_schema_privilege(r.oid,'p0_session_repair','USAGE'))),\n ('repairFunctionsPrivate', not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join pg_roles r where n.nspname='p0_session_repair' and r.rolname in ('anon','authenticated','service_role','authenticator') and has_function_privilege(r.oid,p.oid,'EXECUTE'))),\n ('repairNoPublicExecute', not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where n.nspname='p0_session_repair' and a.grantee=0 and a.privilege_type='EXECUTE')),\n ('repairRoleRestricted', (select not rolcanlogin and not rolinherit and not rolsuper and not rolbypassrls and not rolcreaterole and not rolcreatedb from pg_roles where rolname='kpss_session_repairer')),\n ('operatorExecute', has_function_privilege('postgres','p0_session_repair.apply(uuid,text,integer)','EXECUTE')),\n ('noAuthUserData', (select count(*)=0 from auth.users))\n) as checks(name,ok);"));
  report.postchecks = checks;
  if (Object.values(checks).some(value => value !== true)) throw new Error("A scoped schema/ACL/RLS postcheck failed");
  report.status = "PASS";
} catch (error) {
  report.error = error.message;
  console.error(error.message);
} finally {
  for (const [file, expected] of originals) {
    try {
      if (sha(readFileSync(file)) !== expected) {
        report.status = "BLOCKED";
        report.sourceDrift = file;
      }
    } catch (error) {
      report.status = "BLOCKED";
      (report.sourceVerificationErrors ??= []).push({ file, error: error.message });
    }
  }
  report.canonicalFilesUnchanged = !report.sourceDrift && !report.sourceVerificationErrors;
  if (container) {
    try {
      ownContainer();
      docker(["rm", "-f", "-v", container]);
      report.cleanup = "REMOVED OWN CONTAINER AND TMPFS";
    } catch (error) {
      report.status = "BLOCKED";
      report.cleanup = "FAILED: " + error.message;
    }
  }
  try {
    save("result.json", JSON.stringify(report, null, 2) + "\n");
  } catch (error) {
    report.status = "BLOCKED";
    report.resultWriteError = error.message;
  }
  process.exitCode = report.status === "PASS" ? 0 : 1;
  console.log(JSON.stringify(report, null, 2));
}
