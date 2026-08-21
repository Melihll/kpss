import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(path), "utf8");

function section(text: string, start: string, end: string) {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);
  expect(from, `missing section start: ${start}`).toBeGreaterThanOrEqual(0);
  expect(to, `missing section end: ${end}`).toBeGreaterThan(from);
  return text.slice(from, to);
}

describe("P0 planning mutation safety contracts", () => {
  it("keeps calculation preview-only and makes Apply an explicit function", () => {
    const adaptive = source("supabase/functions/_shared/adaptive.ts");
    const preview = section(adaptive, "export async function previewCurrentPlan", "export async function applyCurrentPlanRevision");
    const apply = section(adaptive, "export async function applyCurrentPlanRevision", "export async function recalculateCurrentPlan");

    expect(preview).not.toContain('.rpc("apply_plan_revision"');
    expect(preview).not.toContain('.rpc("telegram_apply_plan_revision"');
    expect(preview).toContain("planMutationApplied:false");
    expect(apply).toContain('client.rpc("apply_plan_revision"');
    expect(apply).toContain('client.rpc("telegram_apply_plan_revision"');
  });

  it("uses preview-only planning after web finish, retroactive study, and task completion", () => {
    const appApi = source("supabase/functions/app-api/index.ts");
    const execution = section(appApi, 'route === "/study-sessions/retroactive"', 'route==="/test-results"');
    const taskCompletion = section(appApi, "const match = route.match", 'return json({ error: { code: "NOT_FOUND"');

    expect(execution).toContain("previewCurrentPlan");
    expect(execution).not.toContain("recalculateCurrentPlan");
    expect(taskCompletion).toContain("previewCurrentPlan");
    expect(taskCompletion).not.toContain("recalculateCurrentPlan");
    expect(execution).toContain("replanPreview");
    expect(taskCompletion).toContain("replanPreview");
  });

  it("uses preview-only planning after Telegram finish, manual study, and task_done", () => {
    const telegram = source("supabase/functions/telegram-webhook/index.ts");
    const helper = section(telegram, "async function replanAfterStudy", "const ACTIVE_MESSAGE_KEY");
    const manualStudy = section(telegram, "const saveManualStudy", "const manualOpenTasks");

    expect(helper).toContain("previewCurrentPlan");
    expect(helper).not.toContain("recalculateCurrentPlan");
    expect(helper).toContain("return await previewCurrentPlan");
    expect(manualStudy).toContain("SESSION_TIME_OVERLAP");
    expect(manualStudy).toContain("Bu süre mevcut bir çalışma kaydıyla çakışıyor; tekrar kaydetmedim.");
    expect(manualStudy.indexOf("SESSION_TIME_OVERLAP")).toBeLessThan(manualStudy.indexOf("replanAfterStudy"));
  });

  it("maps overlap to a deterministic structured web conflict", () => {
    const appApi = source("supabase/functions/app-api/index.ts");
    expect(appApi).toContain("SESSION_TIME_OVERLAP: 409");
  });

  it("adds one shared, concurrency-serialized overlap invariant for web and Telegram", () => {
    const sql = source("supabase/migrations/20260821120000_harden_study_time_and_plan_audit.sql");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("SESSION_TIME_OVERLAP");
    expect(sql).toMatch(/existing\.started_at\s*<\s*end_time/i);
    expect(sql).toMatch(/existing\.ended_at[^\n]+>\s*start_time/i);
    expect(sql).toContain("public.telegram_record_retroactive_session");
    expect(sql).toContain("public.record_retroactive_session");
  });

  it("audits an explicit planned-date to backlog transition atomically", () => {
    const sql = source("supabase/migrations/20260821120000_harden_study_time_and_plan_audit.sql");
    expect(sql).toContain("alter column to_date drop not null");
    expect(sql).toContain("backlog_replanning");
    expect(sql).toContain("old.planned_date");
    expect(sql).toContain("new.planned_date");
    expect(sql).toContain("public.task_reschedule_events");
  });
});
