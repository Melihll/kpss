// Offline tests of the fresh-only copy builder and exact successful-prefix contract.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { baselineCommit, sha, verifySource, buildCopies, completedRows, assertPrefix, versionsSql } from "./lib/canonical-replay-compatibility.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const git = args => execFileSync("git", ["--no-optional-locks", ...args], { cwd: root });
const files = git(["ls-tree", "-r", "--name-only", baselineCommit, "--", "supabase/migrations"])
  .toString().trim().split(/\r?\n/).filter(f => f.endsWith(".sql")).sort();
const rows = files.map(canonicalPath => {
  const bytes = git(["cat-file", "blob", baselineCommit + ":" + canonicalPath]);
  return { canonicalPath, filename: path.basename(canonicalPath), version: path.basename(canonicalPath).slice(0, 14), bytes, canonicalSourceSha256: sha(bytes) };
});
const runId = "00000000-1111-2222-3333-444444444444";
const copies = buildCopies(rows, runId);
const results = [];
function check(name, fn) { fn(); results.push({ name, status: "PASS" }); }
function rejects(name, fn) { check(name, () => assert.throws(fn)); }
check("three-temporary-edits-only", () => {
  assert.equal(copies.filter(r => r.transformation).length, 3);
  copies.forEach((copy, i) => {
    assert.equal(sha(rows[i].bytes), rows[i].canonicalSourceSha256);
    if (!copy.transformation) assert(copy.bytes.equals(rows[i].bytes));
  });
});
for (const ordinal of [68, 69]) check("boundary-" + ordinal + "-exact-prefix", () => {
  const copy = copies[ordinal - 1];
  assert(copy.bytes.toString().includes(versionsSql(copies.slice(0, ordinal - 1))));
  assert(!copy.bytes.toString().includes("schema_migrations)<>" + (ordinal - 22)));
  assert.equal(copy.transformation.productionSecurityRemainderUnchanged, true);
  assert.equal(copy.transformation.exactRoundTrip, true);
});
rejects("missing-migration", () => buildCopies(rows.slice(1), runId));
rejects("duplicate-version", () => buildCopies(rows.map((r, i) => i === 1 ? { ...r, version: rows[0].version } : r), runId));
rejects("unsorted-migrations", () => buildCopies([rows[1], rows[0], ...rows.slice(2)], runId));
rejects("source-sha-drift", () => verifySource(Buffer.concat([rows[0].bytes, Buffer.from(" ")]), rows[0].canonicalSourceSha256));
for (const index of [51, 67, 68]) rejects("pinned-compatibility-source-drift-" + rows[index].version, () => {
  const changed = Buffer.concat([rows[index].bytes, Buffer.from("\n-- changed\n")]);
  buildCopies(rows.map((r, i) => i === index ? { ...r, bytes: changed, canonicalSourceSha256: sha(changed) } : r), runId);
});
const prefix = copies.slice(0, 68);
const valid = () => ({ history: prefix.map(r => r.version), completed: completedRows(prefix) });
check("valid-ordered-success-prefix", () => assertPrefix(valid(), prefix));
check("valid-empty-prefix", () => assertPrefix({ history: [], completed: [] }, []));
rejects("unexpected-history", () => { const s = valid(); s.history.push("20990101000000"); assertPrefix(s, prefix); });
rejects("missing-history", () => { const s = valid(); s.history.pop(); assertPrefix(s, prefix); });
rejects("same-count-wrong-history", () => { const s = valid(); s.history[0] = "20000101000000"; assertPrefix(s, prefix); });
rejects("history-order-drift", () => { const s = valid(); [s.history[0], s.history[1]] = [s.history[1], s.history[0]]; assertPrefix(s, prefix); });
rejects("success-order-drift", () => { const s = valid(); [s.completed[0], s.completed[1]] = [s.completed[1], s.completed[0]]; assertPrefix(s, prefix); });
rejects("success-source-sha-drift", () => { const s = valid(); s.completed[0][2] = "0".repeat(64); assertPrefix(s, prefix); });
rejects("success-replay-sha-drift", () => { const s = valid(); s.completed[0][3] = "0".repeat(64); assertPrefix(s, prefix); });
rejects("unsuccessful-ledger-row", () => { const s = valid(); s.completed[0][4] = false; assertPrefix(s, prefix); });
console.log(JSON.stringify({ status: "PASS", passed: results.length, results }, null, 2));
