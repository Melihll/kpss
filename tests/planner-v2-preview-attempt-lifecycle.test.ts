import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const api = readFileSync(
  join(root, "supabase/functions/app-api/index.ts"),
  "utf8",
);
const migration = readFileSync(
  join(
    root,
    "supabase/migrations/20260901123000_planner_v2_preview_attempt_lifecycle.sql",
  ),
  "utf8",
);

describe("Planner V2 preview attempt lifecycle", () => {
  it("gives every explicit preview request a distinct lifecycle idempotency identity", () => {
    expect(api).toContain(
      'p_idempotency_key: `planner-v2-preview:${preview.proposalFingerprint}:${crypto.randomUUID()}`',
    );
    expect(api).not.toContain(
      'p_idempotency_key: `planner-v2-preview:${preview.proposalFingerprint}`,',
    );
  });

  it("allows the same deterministic proposal to have multiple lifecycle records", () => {
    expect(migration).toContain(
      "drop index if exists public.confirmed_action_proposals_planner_identity_unique",
    );
    expect(migration).toContain(
      "create index if not exists confirmed_action_proposals_planner_identity_idx",
    );
    expect(migration).not.toContain(
      "create unique index confirmed_action_proposals_planner_identity_idx",
    );
  });

  it("does not introduce a lifecycle state resurrection", () => {
    expect(migration).not.toMatch(
      /set\s+status\s*=\s*['"]previewed['"]/i,
    );
    expect(migration).not.toContain("confirmed_at");
    expect(migration).not.toContain("applied_at");
  });
});
