import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(path), "utf8");

describe("PLN-002 study intent implementation contract", () => {
  const migration = source("supabase/migrations/20260822120000_study_intent_semantics.sql");

  it("creates normalized, user-scoped accounting and typed transition records", () => {
    expect(migration).toContain("create table public.study_session_allocations");
    expect(migration).toContain("create table public.study_substitutions");
    expect(migration).toContain("create table public.task_carryovers");
    expect(migration).toContain("accounting_intent in ('planned','extra','unknown')");
    expect(migration).toContain("planned_credit_minutes <= actual_minutes");
    expect(migration).toContain("using(auth.uid() = user_id)");
    expect(migration).toContain("unique(user_id,idempotency_key)");
  });

  it("keeps intent separate from modality and does not invent historical intent", () => {
    expect(migration).not.toMatch(/alter table public\.study_sessions[\s\S]{0,200}session_mode/i);
    expect(migration).not.toMatch(/insert into public\.study_session_allocations\s*\([^)]*\)\s*select/i);
    expect(migration).toContain("historical_unknown");
  });

  it("accounts planned, extra, overrun and retries without double credit", () => {
    expect(migration).toContain("public.account_completed_study_session");
    expect(migration).toContain("least(v_actual_minutes,v_remaining_minutes)");
    expect(migration).toContain("p_accounting_intent='extra'");
    expect(migration).toContain("STUDY_INTENT_REQUIRED");
    expect(migration).toContain("STUDY_INTENT_IDEMPOTENCY_REQUIRED");
    expect(migration).toContain("for update");
  });

  it("extends confirmed actions for explicit substitution and carryover only", () => {
    expect(migration).toContain("'substitution'");
    expect(migration).toContain("'carryover'");
    expect(migration).toContain("SUBSTITUTION_SOURCE_INVALID");
    expect(migration).toContain("SUBSTITUTION_REPLACEMENT_INVALID");
    expect(migration).toContain("CARRYOVER_SOURCE_STALE");
    expect(migration).toContain("ACTION_PROPOSAL_STALE");
    expect(migration).toContain("pg_advisory_xact_lock");
  });

  it("exposes intent-aware recording and explicit preview/confirm UI", () => {
    const appApi = source("supabase/functions/app-api/index.ts");
    const execution = source("apps/web/src/components/ExecutionPanel.tsx");
    const taskDrawer = source("apps/web/src/components/TaskActionPreviewDrawer.tsx");
    expect(appApi).toContain('route === "/study-intent/substitutions/preview"');
    expect(appApi).toContain("accountingIntent");
    expect(appApi).toContain("idempotencyKey");
    expect(execution).toContain("Bu çalışma mevcut planına ek mi, yoksa planlı bir görevin yerine mi yapıldı?");
    expect(execution).toContain("Ekstra çalıştım");
    expect(execution).toContain("Planlı bir görev yerine yaptım");
    expect(taskDrawer).toContain("Devri onayla");
    expect(taskDrawer).toContain("/study-intent/carryovers/confirm");
  });

  it("keeps study recording preview-only and extra actual outside displacement capacity", () => {
    const appApi = source("supabase/functions/app-api/index.ts");
    const adaptive = source("packages/domain/src/adaptive/replan.ts");
    expect(appApi).toContain("planMutationApplied:false");
    expect(adaptive).toContain("plannedConsumedMinutesByDate");
    expect(adaptive).not.toMatch(/minutes - \(context\.actualMinutesByDate/);
  });
});
