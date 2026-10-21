// Test-only copies. Never alters a canonical migration or a production switch.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const baselineCommit = "19fecf22386a9b8427f48f326927096a210d30ed";
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
export const versionsSql = prefix => "ARRAY[" + prefix.map(r => literal(r.version)).join(",") + "]::text[]";
export const completedRows = prefix => prefix.map((r, i) =>
  [i + 1, r.version, r.canonicalSourceSha256, r.replaySha256, true]);

export function assertPrefix(state, prefix) {
  assert.deepEqual(state.history, prefix.map(r => r.version), "Unexpected migration history");
  assert.deepEqual(state.completed, completedRows(prefix), "Successful migration order/SHA mismatch");
}

function boundaryAssertion(prefix, runId) {
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
 if (select jsonb_agg(jsonb_build_array(run_id::text,source_commit,image) order by run_id) from eng002c_replay.run)
 is distinct from ${literal(JSON.stringify([[runId, baselineCommit, image]]))}::jsonb then
  raise exception 'ENG002C_RUN_IDENTITY_MISMATCH'; end if;
 if (select array_agg(version order by version) from supabase_migrations.schema_migrations)
 is distinct from ${versionsSql(prefix)} then raise exception 'ENG002C_HISTORY_MISMATCH'; end if;
 if (select coalesce(jsonb_agg(jsonb_build_array(ordinal,version,canonical_sha256,replay_sha256,success) order by ordinal),'[]')
     from eng002c_replay.completed) is distinct from ${expected} then
  raise exception 'ENG002C_SUCCESS_SEQUENCE_MISMATCH'; end if;
end $eng002c_boundary$;
`;
}

export function buildCopies(rows, runId) {
  assert.match(runId, /^[a-f0-9-]{36}$/);
  assert.equal(rows.length, 69);
  assert.equal(new Set(rows.map(r => r.version)).size, 69);
  rows.forEach((r, i) => {
    assert.match(r.version, /^\d{14}$/);
    if (i) assert(rows[i - 1].version < r.version, "Migration order drift");
    verifySource(r.bytes, r.canonicalSourceSha256);
  });
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
      const assertion = boundaryAssertion(copies, runId);
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
