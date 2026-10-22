// Offline fixtures: frozen history, append-only PRs, fresh copies, and local Docker targets.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { baselineCommit, frozenMigrationCount, image, sha, verifySource, buildCopies, completedRows,
  assertPrefix, versionsSql, readCanonicalInventory, assertAppendOnlyInventory, assertSnapshotMembership,
  dockerTarget, assertLocalDockerEndpoint } from "./lib/canonical-replay-compatibility.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { rows, sourceCommit, comparisonCommit } = readCanonicalInventory(root, {
  comparisonCommit: process.env.MIGRATION_BASE_COMMIT,
});
const frozen = rows.slice(0, frozenMigrationCount);
const runId = "00000000-1111-2222-3333-444444444444";
const copies = buildCopies(rows, runId, sourceCommit);
const manifest = JSON.parse(readFileSync(path.join(root, "docs/product/migration-provenance/db48.json")));
const members = new Set(manifest.migrations.map(r => r.canonicalPath));
const outside = candidate => candidate.filter(r => !members.has(r.canonicalPath)).map(r => r.canonicalPath).sort();
const results = [];
function check(name, fn) { fn(); results.push({ name, status: "PASS" }); }
function rejects(name, fn, message) { check(name, () => assert.throws(fn, message)); }
function tail(version, body = "select 1;\n", suffix = "eng003a_offline_fixture") {
  const filename = version + "_" + suffix + ".sql";
  const bytes = Buffer.from(body);
  return { canonicalPath: "supabase/migrations/" + filename, filename, version, bytes, canonicalSourceSha256: sha(bytes) };
}
const firstTail = tail("20990101000000");
const secondTail = tail("20990102000000");
const seventy = [...frozen, firstTail];
const seventyOne = [...seventy, secondTail];

check("candidate-inventory-and-pr-base", () => assertAppendOnlyInventory(rows));
check("three-temporary-edits-only", () => {
  assert.equal(copies.filter(r => r.transformation).length, 3);
  copies.forEach((copy, i) => {
    assert.equal(sha(rows[i].bytes), rows[i].canonicalSourceSha256);
    if (!copy.transformation) assert(copy.bytes.equals(rows[i].bytes));
  });
});
for (const version of ["20261017213000", "20261018234500"]) check("boundary-" + version + "-exact-prefix", () => {
  const i = copies.findIndex(r => r.version === version);
  const copy = copies[i];
  assert(copy.bytes.toString().includes(versionsSql(copies.slice(0, i))));
  assert.equal(copy.transformation.expectedSuccessful, i);
  assert.equal(copy.transformation.productionSecurityRemainderUnchanged, true);
  assert.equal(copy.transformation.exactRoundTrip, true);
  assert(copy.probe.includes(JSON.stringify([[runId, sourceCommit, baselineCommit, image]])));
});
check("every-frozen-source-hash-is-immutable", () => {
  for (const [index, row] of frozen.entries()) {
    const bytes = Buffer.concat([row.bytes, Buffer.from("\n-- changed\n")]);
    assert.throws(() => buildCopies(frozen.map((r, i) => i === index ? { ...r, bytes, canonicalSourceSha256: sha(bytes) } : r),
      runId, sourceCommit), /Frozen 69/);
  }
});
rejects("missing-frozen-migration", () => buildCopies(frozen.slice(1), runId, sourceCommit), /Frozen migration missing/);
rejects("same-count-wrong-version", () => assertAppendOnlyInventory([tail("20000101000000"), ...frozen.slice(1)]), /Frozen 69/);
rejects("duplicate-version", () => assertAppendOnlyInventory([...frozen, { ...firstTail, version: frozen.at(-1).version,
  filename: frozen.at(-1).version + "_duplicate.sql", canonicalPath: "supabase/migrations/" + frozen.at(-1).version + "_duplicate.sql" }]), /order\/duplicate\/backdate/);
rejects("reordered-frozen-migrations", () => assertAppendOnlyInventory([frozen[1], frozen[0], ...frozen.slice(2)]), /order\/duplicate\/backdate/);
rejects("source-sha-drift", () => verifySource(Buffer.concat([frozen[0].bytes, Buffer.from(" ")]), frozen[0].canonicalSourceSha256), /SHA drift/);
rejects("renamed-frozen-migration", () => assertAppendOnlyInventory(frozen.map((r, i) => i ? r : {
  ...r, filename: r.version + "_renamed.sql", canonicalPath: "supabase/migrations/" + r.version + "_renamed.sql" })), /Frozen 69/);
rejects("path-traversal", () => assertAppendOnlyInventory([...frozen, { ...firstTail, canonicalPath: "../" + firstTail.filename }]), /Canonical path drift/);
rejects("version-name-mismatch", () => assertAppendOnlyInventory([...frozen, { ...firstTail, version: secondTail.version }]), /version\/name mismatch/);
rejects("invalid-migration-filename", () => assertAppendOnlyInventory([...frozen, tail("20990101000000", "select 1;", "wrong-name")]), /Invalid canonical migration filename/);
rejects("invalid-run-uuid", () => buildCopies(frozen, "-".repeat(36), sourceCommit));
rejects("invalid-candidate-sha", () => buildCopies(frozen, runId, "HEAD"));
rejects("comparison-ref-must-be-exact-sha", () => readCanonicalInventory(root, { comparisonCommit: "origin/develop" }));
check("one-chronological-append-N70", () => {
  assertAppendOnlyInventory(seventy, frozen);
  const c = buildCopies(seventy, runId, sourceCommit);
  assert.equal(c.length, 70);
  assert(c.at(-1).bytes.equals(firstTail.bytes));
  assert.equal(c.filter(r => r.transformation).length, 3);
  assertPrefix({ history: c.map(r => r.version), completed: completedRows(c) }, c);
});
check("next-pr-append-N71-preserves-previous-tail", () => {
  assertAppendOnlyInventory(seventyOne, seventy);
  const c = buildCopies(seventyOne, runId, sourceCommit);
  assert.equal(c.length, 71);
  assert.equal(c.at(-2).replaySha256, firstTail.canonicalSourceSha256);
  assert.equal(c.at(-1).replaySha256, secondTail.canonicalSourceSha256);
});
rejects("backdated-append", () => assertAppendOnlyInventory([...frozen, tail("20261018000000")]), /order\/duplicate\/backdate/);
rejects("backdated-insert-even-if-sorted", () => assertAppendOnlyInventory([...frozen, tail("20261018000000")].sort((a,b) => a.version.localeCompare(b.version))), /Frozen 69/);
rejects("reordered-appended-migrations", () => assertAppendOnlyInventory([...frozen, secondTail, firstTail]), /order\/duplicate\/backdate/);
rejects("missing-previously-appended-migration", () => assertAppendOnlyInventory(frozen, seventy), /Previously committed migration missing/);
rejects("changed-previously-appended-migration", () => assertAppendOnlyInventory([...frozen, tail(firstTail.version, "select 2;\n")], seventy), /Only chronological append-only/);
rejects("renamed-previously-appended-migration", () => assertAppendOnlyInventory([...frozen, tail(firstTail.version, "select 1;\n", "renamed")], seventy), /Only chronological append-only/);
rejects("replaced-previously-appended-version", () => assertAppendOnlyInventory([...frozen, secondTail], seventy), /Only chronological append-only/);
check("candidate-commit-bound-to-temporary-copies", () => {
  const alternate = sourceCommit === "1".repeat(40) ? "2".repeat(40) : "1".repeat(40);
  const c = buildCopies(frozen, runId, alternate);
  for (const version of ["20261017213000", "20261018234500"]) {
    assert.notEqual(c.find(r => r.version === version).replaySha256, copies.find(r => r.version === version).replaySha256);
  }
});
check("historical-DB48-and-known21-identities", () => {
  const summary = assertSnapshotMembership(frozen, manifest, outside(frozen));
  assert.equal(summary.db48Count, 48);
  assert.equal(summary.frozenOutsideSnapshot.length, 21);
  assert.equal(summary.appendedCount, 0);
});
check("snapshot-external-set-grows-with-tail", () => {
  const summary = assertSnapshotMembership(seventyOne, manifest, outside(seventyOne));
  assert.equal(outside(seventyOne).length, 23);
  assert.equal(summary.appendedCount, 2);
  assert.deepEqual(summary.frozenOutsideSnapshot, assertSnapshotMembership(frozen, manifest, outside(frozen)).frozenOutsideSnapshot);
});
rejects("same-count-wrong-snapshot-external-file", () => assertSnapshotMembership(frozen, manifest,
  ["supabase/migrations/20990101000000_wrong.sql", ...outside(frozen).slice(1)].sort()), /identity drift/);
rejects("missing-snapshot-external-file", () => assertSnapshotMembership(seventy, manifest, outside(frozen)), /identity drift/);
rejects("duplicate-DB48-member", () => assertSnapshotMembership(frozen, { ...manifest,
  migrations: manifest.migrations.map((r,i) => i === 1 ? manifest.migrations[0] : r) }, outside(frozen)), /Duplicate DB48/);
rejects("DB48-history-size-drift", () => assertSnapshotMembership(frozen, { ...manifest, migrations: manifest.migrations.slice(1) }, outside(frozen)), /remain 48/);
rejects("DB48-source-hash-drift", () => assertSnapshotMembership(frozen, { ...manifest,
  migrations: manifest.migrations.map((r,i) => i ? r : { ...r, canonicalSourceSha256: "0".repeat(64) }) }, outside(frozen)), /DB48 source SHA drift/);
const prefix = buildCopies(seventy, runId, sourceCommit);
const valid = () => ({ history: prefix.map(r => r.version), completed: completedRows(prefix) });
check("valid-ordered-success-prefix-N70", () => assertPrefix(valid(), prefix));
check("valid-empty-prefix", () => assertPrefix({ history: [], completed: [] }, []));
rejects("unexpected-history", () => { const s = valid(); s.history.push("20990103000000"); assertPrefix(s, prefix); });
rejects("missing-tail-history", () => { const s = valid(); s.history.pop(); assertPrefix(s, prefix); });
rejects("same-count-wrong-history", () => { const s = valid(); s.history[0] = "20000101000000"; assertPrefix(s, prefix); });
rejects("history-order-drift", () => { const s = valid(); [s.history[0], s.history[1]] = [s.history[1], s.history[0]]; assertPrefix(s, prefix); });
rejects("success-order-drift", () => { const s = valid(); [s.completed[0], s.completed[1]] = [s.completed[1], s.completed[0]]; assertPrefix(s, prefix); });
rejects("success-source-sha-drift", () => { const s = valid(); s.completed.at(-1)[2] = "0".repeat(64); assertPrefix(s, prefix); });
rejects("success-replay-sha-drift", () => { const s = valid(); s.completed.at(-1)[3] = "0".repeat(64); assertPrefix(s, prefix); });
rejects("unsuccessful-ledger-row", () => { const s = valid(); s.completed.at(-1)[4] = false; assertPrefix(s, prefix); });

for (const platform of ["win32", "linux"]) check("local-Docker-" + platform, () => {
  const target = dockerTarget(platform);
  assertLocalDockerEndpoint(target, target.endpoint);
  assert.deepEqual(dockerTarget(platform, { DOCKER_HOST: target.endpoint, DOCKER_CONTEXT: target.context }), target);
});
check("current-Docker-environment-is-local", () => dockerTarget(process.platform, process.env));
rejects("unsupported-Docker-platform", () => dockerTarget("darwin"));
for (const endpoint of ["tcp://127.0.0.1:2375", "tcp://remote:2376", "ssh://remote", "http://remote", "unix:///tmp/other.sock",
  "npipe:////./pipe/other"]) rejects("reject-Docker-endpoint-" + endpoint, () => assertLocalDockerEndpoint(dockerTarget("linux"), endpoint), /endpoint rejected/);
rejects("Windows-remote-pipe-rejected", () => assertLocalDockerEndpoint(dockerTarget("win32"), "npipe:////remote/pipe/docker"));
rejects("remote-Docker-host-environment", () => dockerTarget("linux", { DOCKER_HOST: "tcp://remote:2375" }));
rejects("remote-Docker-context-environment", () => dockerTarget("linux", { DOCKER_CONTEXT: "production" }));
rejects("Docker-TLS-environment", () => dockerTarget("linux", { DOCKER_TLS_VERIFY: "1" }));
rejects("Docker-certificate-environment", () => dockerTarget("win32", { DOCKER_CERT_PATH: "private" }));
check("Docker-rejection-does-not-print-credentials", () => {
  const canary = "DO_NOT_PRINT_FIXTURE_CREDENTIAL";
  for (const fn of [() => dockerTarget("linux", { DOCKER_HOST: "ssh://" + canary + "@remote" }),
    () => assertLocalDockerEndpoint(dockerTarget("linux"), "tcp://" + canary + "@remote:2376")]) {
    assert.throws(fn, error => !error.message.includes(canary) && /rejected/.test(error.message));
  }
});
console.log(JSON.stringify({ status: "PASS", passed: results.length, sourceCommit, comparisonCommit,
  candidateMigrations: rows.length, frozenMigrations: frozenMigrationCount, results }, null, 2));
