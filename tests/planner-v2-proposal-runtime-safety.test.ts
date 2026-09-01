import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const api = readFileSync(join(root, "supabase/functions/app-api/index.ts"), "utf8");
const capability = readFileSync(join(root, "supabase/functions/_shared/planner-v2-proposal-capability.ts"), "utf8");
const migration = readFileSync(join(root, "supabase/migrations/20260826120000_planner_v2_proposal_lifecycle_candidate.sql"), "utf8");
const web = readFileSync(join(root, "apps/web/src/components/PlannerV2PreviewPanel.tsx"), "utf8");

describe("Planner V2 gated proposal runtime safety", () => {
  it("keeps independent preview, confirmation, and Apply gates default-OFF and refuses wildcard or malformed activation", () => {
    expect(capability).toContain('PLANNER_V2_PREVIEW_V1_PROFILE_IDS');
    expect(capability).toContain('PLANNER_V2_CONFIRM_V1_PROFILE_IDS');
    expect(capability).toContain('PLANNER_V2_APPLY_V1_PROFILE_IDS');
    expect(capability).toContain('value === "*"');
    expect(capability).toContain("PROFILE_UUID");
    expect(api).not.toContain("PLANNER_V2_PROPOSAL_LIFECYCLE_PROFILE_IDS");
  });

  it("checks the preview gate before generation or proposal persistence", () => {
    const route = api.indexOf('route === "/planner-v2/preview"');
    const gate = api.indexOf("if (!plannerV2PreviewEnabled)", route);
    const generation = api.indexOf("runCanonicalPlannerV2ReadOnlyShadow", gate);
    const persistence = api.indexOf('serviceClient.rpc("create_planner_v2_proposal_candidate"', generation);
    expect(route).toBeGreaterThan(0);
    expect(gate).toBeGreaterThan(route);
    expect(generation).toBeGreaterThan(gate);
    expect(persistence).toBeGreaterThan(generation);
  });

  it("requires both preview and confirmation authority before confirmation", () => {
    const route = api.indexOf('route === "/planner-v2/confirm"');
    const gate = api.indexOf("if (!plannerV2ConfirmationEnabled)", route);
    const confirmation = api.indexOf('client.rpc("confirm_planner_v2_proposal_candidate"', gate);
    expect(route).toBeGreaterThan(0);
    expect(gate).toBeGreaterThan(route);
    expect(confirmation).toBeGreaterThan(gate);
    expect(capability).toContain("previewEnabled &&");
  });

  it("hides confirmation UI for preview-only profiles", () => {
    expect(web).toContain('capability.confirmationEnabled || confirmation || proposalState === "applied"');
    expect(web).toContain("capability.confirmationEnabled && proposalState");
    expect(web).toContain("Pilot önizleme modu");
    expect(web).not.toContain('disabled={!capability.confirmationEnabled');
  });

  it("exposes Apply only behind the independent gate and exact persisted confirmation", () => {
    const route = api.indexOf('route === "/planner-v2/apply"');
    const gate = api.indexOf("if (!plannerV2ApplyEnabled)", route);
    const persistence = api.indexOf("loadPlannerV2Proposal", gate);
    const confirmation = api.indexOf("assertAuthoritativePlannerV2Confirmation", persistence);
    const freshness = api.indexOf("validatePlannerV2Freshness", confirmation);
    const apply = api.indexOf('serviceClient.rpc("apply_planner_v2_proposal_candidate"', freshness);
    expect(route).toBeGreaterThan(0);
    expect(gate).toBeGreaterThan(route);
    expect(persistence).toBeGreaterThan(gate);
    expect(confirmation).toBeGreaterThan(persistence);
    expect(freshness).toBeGreaterThan(confirmation);
    expect(apply).toBeGreaterThan(freshness);
    expect(web).toContain('"/planner-v2/apply"');
    expect(web).toContain("canApplyPlannerV2Proposal(capability, confirmation)");
  });

  it("derives Apply actor and profile from authenticated server context", () => {
    expect(api).toContain("p_actor_user_id: userId");
    expect(api).toContain("p_actor_exam_profile_id: profile.id");
    expect(api).toContain("PLANNER_V2_CLIENT_AUTHORITY_REFUSED");
    expect(web).not.toContain("serviceRoleKey");
    expect(web).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("returns confirmed UI state only from an authoritative persisted confirmation", () => {
    expect(api).toContain("assertAuthoritativePlannerV2Confirmation(persisted, exact)");
    expect(web).toContain("deriveConfirmedPlannerV2State(response, payload.confirmation)");
    expect(web).not.toContain("setConfirmed(true)");
    expect(web).toContain("confirmationFailureMessage(code)");
  });

  it("makes the database Apply RPC server-only and actor-bound", () => {
    expect(migration).toContain("p_actor_user_id uuid");
    expect(migration).toContain("p_actor_exam_profile_id uuid");
    expect(migration).toContain("coalesce(auth.role(),'') <> 'service_role'");
    expect(migration).toContain("from public,anon,authenticated");
    expect(migration).toMatch(/grant execute on function public\.apply_planner_v2_proposal_candidate[\s\S]*?to service_role;/);
    expect(migration).not.toMatch(/grant execute on function public\.apply_planner_v2_proposal_candidate[\s\S]*?to authenticated;/);
  });

  it("protects canonical task metadata without revoking legacy task writes", () => {
    expect(migration).toContain("tasks_planner_v2_metadata_complete");
    expect(migration).toContain("guard_planner_v2_task_metadata");
    expect(migration).toContain("tasks_guard_planner_v2_metadata");
    expect(migration).toContain("PLANNER_V2_CANONICAL_METADATA_SERVER_ONLY");
    expect(migration).not.toMatch(/revoke\s+(insert|update)[\s\S]*?on\s+public\.tasks/i);
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
