// Test-only copies. Never alters a canonical migration or a production switch.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export const baselineCommit = "19fecf22386a9b8427f48f326927096a210d30ed";
// Immutable ordered [path, version, exact Git-blob SHA-256] tuples at baselineCommit.
export const frozenMigrationCount = 69;
export const frozenInventorySha256 = "d25abe4aba0b721953c4b68a917ce38b53d916277183ba99f96a1881ca51410e";
export const image = "public.ecr.aws/supabase/postgres@sha256:3866d94d8426927e8db3f1c5d790752292bfbe27b5f1f46e199ae1b7d3c1710b";
export const sha = bytes => createHash("sha256").update(bytes).digest("hex");
export const lf = bytes => Buffer.from(bytes.toString("latin1").replace(/\r\n/g, "\n"), "latin1");
export const literal = value => "'" + String(value).replaceAll("'", "''") + "'";
const pinned = {
  "20261010220000": "753779b041d36f0acbc2541cac9c5caa497c7552731e7ab1fc6bb717d3dc33eb",
  "20261017213000": "08edf16942a19e32703d5ede1ec7dcd65993fe687048c726e1ee0d7663f8f287",
  "20261018234500": "bb0c9675557e8b22722e0b2cd22ec92feecb926808dbbe4e205acdfb6542c88b",
};

export function verifySource(bytes, expected) {
  assert.equal(sha(bytes), expected, "Canonical source SHA drift");
}
const inventoryTuples = rows => rows.map(r => [r.canonicalPath, r.version, r.canonicalSourceSha256]);

export function assertAppendOnlyInventory(rows, previousRows) {
  function validate(candidate) {
    assert(candidate.length >= frozenMigrationCount, "Frozen migration missing");
    candidate.forEach((r, i) => {
      assert.match(r.filename, /^\d{14}_[a-z0-9_]+\.sql$/, "Invalid canonical migration filename");
      assert.equal(r.canonicalPath, "supabase/migrations/" + r.filename, "Canonical path drift");
      assert.equal(r.version, r.filename.slice(0, 14), "Migration version/name mismatch");
      assert.match(r.canonicalSourceSha256, /^[a-f0-9]{64}$/);
      verifySource(r.bytes, r.canonicalSourceSha256);
      if (i) assert(candidate[i - 1].version < r.version, "Migration order/duplicate/backdate drift");
    });
    assert.equal(sha(JSON.stringify(inventoryTuples(candidate.slice(0, frozenMigrationCount)))),
      frozenInventorySha256, "Frozen 69 migration version/path/source SHA drift");
  }
  validate(rows);
  if (previousRows) {
    validate(previousRows);
    assert(rows.length >= previousRows.length, "Previously committed migration missing");
    assert.deepEqual(inventoryTuples(rows.slice(0, previousRows.length)), inventoryTuples(previousRows),
      "Only chronological append-only migrations are accepted");
  }
}

// The candidate tree supplies new SQL; immutable history and the PR base constrain it.
// Untracked or modified SQL is deliberately not a second migration source.
export function readCanonicalInventory(root, { comparisonCommit, remember = () => {} } = {}) {
  const git = args => execFileSync("git", ["--no-optional-locks", ...args], { cwd: root });
  comparisonCommit ??= git(["rev-parse", "refs/remotes/origin/develop"]).toString().trim();
  assert.match(comparisonCommit, /^[a-f0-9]{40}$/, "Comparison commit must be an exact Git SHA");
  const sourceCommit = git(["rev-parse", "HEAD"]).toString().trim();
  git(["merge-base", "--is-ancestor", baselineCommit, comparisonCommit]);
  git(["merge-base", "--is-ancestor", comparisonCommit, sourceCommit]);
  const at = ref => git(["ls-tree", "-r", "--name-only", ref, "--", "supabase/migrations"])
    .toString().trim().split(/\r?\n/).filter(f => /\.sql$/i.test(f)).sort().map(canonicalPath => {
      const bytes = git(["cat-file", "blob", ref + ":" + canonicalPath]);
      return { canonicalPath, filename: path.basename(canonicalPath), version: path.basename(canonicalPath).slice(0, 14),
        bytes, canonicalSourceSha256: sha(bytes) };
    });
  const rows = at(sourceCommit);
  assertAppendOnlyInventory(rows, at(comparisonCommit));
  assert.deepEqual(readdirSync(path.join(root, "supabase/migrations")).filter(f => /\.sql$/i.test(f)).sort(),
    rows.map(r => r.filename), "Canonical working inventory drift");
  for (const row of rows) {
    const absolute = path.join(root, row.canonicalPath);
    const metadata = lstatSync(absolute);
    assert(metadata.isFile() && !metadata.isSymbolicLink(), "Regular canonical file required");
    const working = readFileSync(absolute);
    remember(absolute, sha(working));
    assert(lf(working).equals(lf(row.bytes)), "Canonical working source drift: " + row.canonicalPath);
  }
  return { rows, sourceCommit, comparisonCommit };
}

export function assertSnapshotMembership(rows, manifest, unexpectedMigrationFiles) {
  assertAppendOnlyInventory(rows);
  assert.equal(manifest.migrations.length, 48, "Historical DB48 must remain 48 records");
  const frozen = new Map(rows.slice(0, frozenMigrationCount).map(r => [r.canonicalPath, r]));
  const members = new Set();
  for (const row of manifest.migrations) {
    const original = frozen.get(row.canonicalPath);
    assert(original, "DB48 member outside frozen history");
    assert(!members.has(row.canonicalPath), "Duplicate DB48 member");
    assert.equal(row.version, original.version, "DB48 version drift");
    assert.equal(row.canonicalSourceSha256, original.canonicalSourceSha256, "DB48 source SHA drift");
    members.add(row.canonicalPath);
  }
  const knownOutside = rows.slice(0, frozenMigrationCount).filter(r => !members.has(r.canonicalPath));
  assert.equal(knownOutside.length, 21);
  assert.deepEqual(unexpectedMigrationFiles, rows.filter(r => !members.has(r.canonicalPath)).map(r => r.canonicalPath).sort(),
    "Snapshot-external migration identity drift");
  return { db48Count: 48, frozenOutsideSnapshot: inventoryTuples(knownOutside), appendedCount: rows.length - frozenMigrationCount };
}

export function dockerTarget(platform, environment = {}) {
  const target = platform === "win32"
    ? { context: "desktop-linux", endpoint: "npipe:////./pipe/dockerDesktopLinuxEngine" }
    : platform === "linux" ? { context: "default", endpoint: "unix:///var/run/docker.sock" } : null;
  assert(target, "Only Windows Docker Desktop or local Linux Docker is supported");
  // Reject overrides without echoing values: a remote URI may contain credentials.
  assert(!environment.DOCKER_HOST || environment.DOCKER_HOST === target.endpoint, "Docker host override rejected");
  assert(!environment.DOCKER_CONTEXT || environment.DOCKER_CONTEXT === target.context, "Docker context override rejected");
  assert(!environment.DOCKER_TLS_VERIFY && !environment.DOCKER_CERT_PATH, "Docker TLS override rejected");
  return target;
}

export function assertLocalDockerEndpoint(target, endpoint) {
  assert(endpoint === target.endpoint, "Remote or unexpected Docker endpoint rejected");
}

export const versionsSql = prefix => "ARRAY[" + prefix.map(r => literal(r.version)).join(",") + "]::text[]";
export const completedRows = prefix => prefix.map((r, i) =>
  [i + 1, r.version, r.canonicalSourceSha256, r.replaySha256, true]);

export function assertPrefix(state, prefix) {
  assert.deepEqual(state.history, prefix.map(r => r.version), "Unexpected migration history");
  assert.deepEqual(state.completed, completedRows(prefix), "Successful migration order/SHA mismatch");
}

function boundaryAssertion(prefix, runId, sourceCommit) {
  const expected = literal(JSON.stringify(completedRows(prefix))) + "::jsonb";
  return `do $eng002c_boundary$ begin
 if session_user<>'postgres' or current_user<>'postgres'
 or current_setting('server_version_num')::integer not between 170000 and 179999 then
  raise exception 'ENG002C_OPERATOR_REQUIRED'; end if;
 if (select nspowner from pg_namespace where nspname='eng002c_replay') is distinct from 'postgres'::regrole
 or (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='eng002c_replay' and c.relname in ('run','completed') and c.relowner='postgres'::regrole and c.relkind='r')<>2
 or exists(select 1 from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
     where n.nspname='eng002c_replay' and a.grantee<>'postgres'::regrole)
 or exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
     cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
     where n.nspname='eng002c_replay' and c.relname in ('run','completed') and a.grantee<>'postgres'::regrole) then
  raise exception 'ENG002C_LEDGER_PRIVILEGES_REQUIRED'; end if;
 if (select jsonb_agg(jsonb_build_array(run_id::text,source_commit,baseline_commit,image) order by run_id) from eng002c_replay.run)
 is distinct from ${literal(JSON.stringify([[runId, sourceCommit, baselineCommit, image]]))}::jsonb then
  raise exception 'ENG002C_RUN_IDENTITY_MISMATCH'; end if;
 if (select array_agg(version order by version) from supabase_migrations.schema_migrations)
 is distinct from ${versionsSql(prefix)} then raise exception 'ENG002C_HISTORY_MISMATCH'; end if;
 if (select coalesce(jsonb_agg(jsonb_build_array(ordinal,version,canonical_sha256,replay_sha256,success) order by ordinal),'[]')
     from eng002c_replay.completed) is distinct from ${expected} then
  raise exception 'ENG002C_SUCCESS_SEQUENCE_MISMATCH'; end if;
end $eng002c_boundary$;
`;
}

export function buildCopies(rows, runId, sourceCommit) {
  assert.match(runId, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
  assert.match(sourceCommit, /^[a-f0-9]{40}$/, "Exact candidate commit required");
  assertAppendOnlyInventory(rows);
  const copies = [];
  for (const row of rows) {
    const original = row.bytes;
    let bytes = original;
    let transformation;
    let probe;
    if (pinned[row.version]) verifySource(original, pinned[row.version]);
    if (row.version === "20261010220000") {
      const marker = Buffer.from("$function$");
      const offset = original.lastIndexOf(marker) + marker.length;
      assert(offset >= marker.length && original[offset] === 10, "Unexpected semicolon boundary");
      bytes = Buffer.concat([original.subarray(0, offset), Buffer.from(";"), original.subarray(offset)]);
      assert(Buffer.concat([bytes.subarray(0, offset), bytes.subarray(offset + 1)]).equals(original));
      transformation = { kind: "one-semicolon", byteOffset: offset, otherDifferences: 0 };
    }
    if (["20261017213000", "20261018234500"].includes(row.version)) {
      const oldCount = row.version === "20261017213000" ? 46 : 47;
      const old = `(select count(*) from supabase_migrations.schema_migrations)<>${oldCount}`;
      const replacement = `(select array_agg(version order by version) from supabase_migrations.schema_migrations) is distinct from ${versionsSql(copies)}`;
      const text = original.toString("utf8");
      assert.equal(text.split(old).length, 2, "Production guard count fragment drift");
      assert(text.startsWith("begin;\n"));
      const assertion = boundaryAssertion(copies, runId, sourceCommit);
      const modified = text.replace(old, replacement).replace("begin;\n", "begin;\n" + assertion);
      assert.equal(modified.replace(assertion, "").replace(replacement, old), text,
        "Unapproved change to production security conditions");
      bytes = Buffer.from(modified);
      const productionGuard = modified.slice(modified.indexOf("do $$ begin"));
      const guardEnd = productionGuard.indexOf("\nend $$;");
      assert(guardEnd > 0);
      probe = assertion + productionGuard.slice(0, guardEnd + "\nend $$;".length);
      transformation = { kind: "fresh-only-history-boundary", oldCount, expectedSuccessful: copies.length,
        exactRoundTrip: true, productionSecurityRemainderUnchanged: true };
    }
    copies.push({ ...row, bytes, replaySha256: sha(bytes), transformation, probe });
  }
  assert.equal(copies.filter(r => r.transformation).length, 3);
  return copies;
}
