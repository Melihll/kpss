import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/20260821130000_confirmed_product_actions.sql", import.meta.url),
  "utf8",
);
const appApi = readFileSync(
  new URL("../supabase/functions/app-api/index.ts", import.meta.url),
  "utf8",
);
const coachHandler = readFileSync(
  new URL("../supabase/functions/ai-coach-plan-preview/handler.ts", import.meta.url),
  "utf8",
);
const coachIndex = readFileSync(
  new URL("../supabase/functions/ai-coach-plan-preview/index.ts", import.meta.url),
  "utf8",
);

describe("R2 confirmed product action contract", () => {
  it("stores server-created, expiring, user-scoped proposals", () => {
    expect(migration).toContain("create table public.confirmed_action_proposals");
    expect(migration).toContain("expires_at timestamptz not null");
    expect(migration).toContain("using(auth.uid() = user_id)");
    expect(migration).toContain("to service_role");
    expect(migration).not.toContain("grant insert");
    expect(migration).not.toContain("grant update");
  });

  it("rejects cross-user, expired, changed-generation and changed-snapshot apply", () => {
    expect(migration).toContain("where id = p_proposal_id and user_id = v_user");
    expect(migration).toContain("ACTION_PROPOSAL_EXPIRED");
    expect(migration).toContain("v_plan.generation_version <> v_proposal.plan_generation_version");
    expect(migration).toContain("confirmation_plan_fingerprint(v_user,v_plan.id) <> v_proposal.snapshot_fingerprint");
  });

  it("creates a quick task once and returns an idempotent repeat", () => {
    expect(migration).toContain("on conflict(weekly_plan_id,dedupe_key) do nothing");
    expect(migration).toContain("if v_proposal.status = 'applied'");
    expect(migration).toContain("insert into public.task_progress");
    expect(migration).toContain("'refresh',jsonb_build_array('today','week')");
  });

  it("applies capacity plus plan revision inside the same database function", () => {
    expect(migration).toContain("insert into public.schedule_exceptions");
    expect(migration).toContain("v_revision_result := public.apply_plan_revision");
    expect(migration).toContain("confirmation_dedupe_key");
    expect(migration).toContain("pg_advisory_xact_lock");
  });

  it("keeps previews non-mutating and requires an explicit proposal apply route", () => {
    expect(appApi).toContain('route === "/tasks/quick-add/preview"');
    expect(appApi).toContain('route === "/tasks/quick-add/apply"');
    expect(appApi).toContain('route==="/plans/current/apply-confirmed"');
    expect(coachHandler).toContain("result.decision === \"READY_TO_APPLY\"");
    expect(coachHandler).toContain("prepareCapacityConfirmation");
    expect(coachIndex).toContain("CONFIRMATION_PROPOSAL_DIVERGENCE");
  });

  it("does not restore automatic study-deviation application", () => {
    expect(appApi).not.toMatch(/recalculateCurrentPlan\([^\n]+study_deviation/);
    expect(coachIndex).toContain('"capacity_change"');
    expect(coachIndex).not.toContain('"study_deviation"');
  });
});
