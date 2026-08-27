import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const api = readFileSync(join(root, "supabase/functions/app-api/index.ts"), "utf8");
const capability = readFileSync(join(root, "supabase/functions/_shared/planner-v2-proposal-capability.ts"), "utf8");
const migration = readFileSync(join(root, "supabase/migrations/20260826120000_planner_v2_proposal_lifecycle_candidate.sql"), "utf8");
const web = readFileSync(join(root, "apps/web/src/components/PlannerV2PreviewPanel.tsx"), "utf8");

describe("W6 production-inactive proposal runtime safety", () => {
  it("keeps the profile capability default-OFF and refuses wildcard activation", () => {
    expect(capability).toContain("if (!configuredProfileIds?.trim() || !examProfileId) return false");
    expect(capability).toContain('value !== "*"');
  });

  it("checks the gate before generation or proposal persistence", () => {
    const route = api.indexOf('route === "/planner-v2/preview"');
    const gate = api.indexOf("if (!plannerV2ProposalEnabled)", route);
    const generation = api.indexOf("runCanonicalPlannerV2ReadOnlyShadow", gate);
    const persistence = api.indexOf('serviceClient.rpc("create_planner_v2_proposal_candidate"', generation);
    expect(route).toBeGreaterThan(0);
    expect(gate).toBeGreaterThan(route);
    expect(generation).toBeGreaterThan(gate);
    expect(persistence).toBeGreaterThan(generation);
  });

  it("exposes no Planner V2 Apply HTTP route", () => {
    expect(api).not.toContain('route === "/planner-v2/apply"');
    expect(web).not.toContain('"/planner-v2/apply"');
    expect(web).toContain("Apply üretimde ve bu ekranda kapalıdır");
  });

  it("binds confirmation to every exact proposal identity field", () => {
    for (const field of ["recordId", "proposalId", "proposalFingerprint", "snapshotFingerprint", "plannerVersion"]) {
      expect(api).toContain(field);
    }
    expect(api).toContain("confirm_planner_v2_proposal_candidate");
  });

  it("keeps atomicity, freshness, capacity, ownership, and idempotency inside one database RPC", () => {
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("planner_v2_database_fingerprint");
    expect(migration).toContain("PLANNER_V2_EXACT_CAPACITY_RECHECK_FAILED");
    expect(migration).toContain("PLANNER_V2_RESOURCE_OWNER_MISMATCH");
    expect(migration).toContain("tasks_active_canonical_workload_unique");
    expect(migration).toContain("if v_row.status='applied'");
  });
});
