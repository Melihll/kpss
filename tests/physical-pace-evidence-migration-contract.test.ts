import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const path = resolve(
  process.cwd(),
  "supabase/migrations/20260825130000_atomic_physical_pace_evidence.sql",
);
const sql = readFileSync(path, "utf8").toLowerCase();
const normalized = sql.replace(/\s+/g, " ");

function functionBody(name: string): string {
  const start = normalized.indexOf(`function public.${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = normalized.indexOf("create", start + 20);
  return normalized.slice(start, next < 0 ? normalized.length : next);
}

describe("W2 atomic physical pace migration candidate", () => {
  it("creates an accepted-only immutable evidence event with causal idempotency", () => {
    expect(normalized).toContain("create table public.physical_pace_evidence");
    expect(normalized).toContain("study_session_id uuid not null");
    expect(normalized).toContain("unique (user_id, study_session_id)");
    expect(normalized).toContain("actual_active_seconds integer not null");
    expect(normalized).toContain("progressed_pages integer generated always as (end_page_boundary - start_page_boundary) stored");
    expect(normalized).toContain("evidence_status in ('accepted')");
    expect(normalized).toContain("prevent_physical_evidence_update");
  });

  it("keeps server start time, material boundary, and pause time in protected W2 tables", () => {
    expect(normalized).toContain("create table public.physical_study_activity_snapshots");
    expect(normalized).toContain("activity_started_at timestamptz not null default now()");
    expect(normalized).toContain("start_page_boundary integer not null");
    expect(normalized).toContain("create table public.physical_study_activity_breaks");
    expect(normalized).toContain("physical_activity_break_one_open_per_session");
    expect(normalized).toContain("revoke all on public.physical_study_activity_snapshots from public, anon, authenticated");
    expect(normalized).toContain("revoke all on public.physical_study_activity_breaks from public, anon, authenticated");
  });

  it("preserves exact owner/profile/material identity with foreign keys", () => {
    expect(normalized).toContain("physical_pace_evidence_session_owner_fk");
    expect(normalized).toContain("physical_pace_evidence_resource_owner_fk");
    expect(normalized).toContain("physical_pace_evidence_section_resource_fk");
    expect(normalized).toContain("physical_pace_evidence_unit_resource_fk");
    expect(normalized).toContain("physical_pace_evidence_curriculum_subject_fk");
  });

  it("uses an exact start snapshot and rejects zero/reversed/invalid/stale progress safely", () => {
    const start = functionBody("start_physical_study_session");
    const finish = functionBody("finish_physical_study_session");
    expect(start).toContain("insert into public.physical_study_activity_snapshots");
    expect(start).toContain("v_unit.page_start - 1");
    expect(finish).toContain("physical_progress_reversal");
    expect(finish).toContain("physical_page_boundary_invalid");
    expect(finish).toContain("physical_progress_changed_during_session");
    expect(finish).toContain("if p_end_page_boundary = v_snapshot.start_page_boundary");
    expect(finish).toContain("'evidence',null");
  });

  it("calculates actual active seconds from server time minus breaks, never planned minutes", () => {
    const finish = functionBody("finish_physical_study_session");
    expect(finish).toContain("extract(epoch from (finished_at-v_snapshot.activity_started_at))-break_seconds");
    expect(finish).toContain("from public.physical_study_activity_breaks");
    expect(finish).toContain("physical_break_state_mismatch");
    expect(finish).toContain("actual_active_seconds");
    expect(finish).not.toContain("estimated_minutes");
    expect(finish).not.toContain("planned_minutes");
  });

  it("atomically combines session, progress, evidence, and unit completion without swallowing failure", () => {
    const finish = functionBody("finish_physical_study_session");
    expect(finish).toContain("update public.study_sessions");
    expect(finish).toContain("public.account_completed_study_session");
    expect(finish).toContain("insert into public.resource_unit_progress");
    expect(finish).toContain("insert into public.physical_pace_evidence");
    expect(finish).toContain("public.complete_task_unit");
    expect(finish).not.toContain("exception when");
  });

  it("preserves overlap safety and does not replace existing sanctioned RPCs", () => {
    const start = functionBody("start_physical_study_session");
    expect(start).toContain("pg_advisory_xact_lock");
    expect(start).toContain("active_session_exists");
    expect(start).toContain("security definer");
    expect(sql).not.toContain("create or replace function public.start_study_session");
    expect(sql).not.toContain("create or replace function public.finish_study_session");
    expect(sql).not.toContain("create or replace function public.record_retroactive_session");
    expect(sql).not.toContain("create or replace function public.record_test_result");
  });

  it("does not create evidence from task completion or backfill history", () => {
    expect(sql).not.toMatch(/insert\s+into\s+public\.physical_pace_evidence\s+select/);
    expect(sql).not.toMatch(/update\s+public\.study_sessions\s+set\s+physical_start_page_boundary/);
    expect(sql).not.toContain("add column physical_start_page_boundary");
    expect(sql).not.toContain("create or replace function public.complete_task_unit");
  });

  it("uses RLS, revokes direct writes, and grants only sanctioned RPC execution", () => {
    expect(normalized).toContain("alter table public.physical_pace_evidence enable row level security");
    expect(normalized).toContain("grant select on public.physical_pace_evidence to authenticated");
    expect(normalized).not.toContain("grant insert on public.physical_pace_evidence to authenticated");
    expect(normalized).toContain("grant execute on function public.start_physical_study_session");
    expect(normalized).toContain("grant execute on function public.pause_physical_study_session");
    expect(normalized).toContain("grant execute on function public.resume_physical_study_session");
    expect(normalized).toContain("grant execute on function public.finish_physical_study_session");
  });

  it("contains no production data rewrite or planner mutation", () => {
    expect(sql).not.toMatch(/\bdelete\s+from\b/);
    expect(sql).not.toMatch(/\btruncate\b/);
    expect(sql).not.toContain("weekly_plans");
    expect(sql).not.toContain("confirmed_action_proposals");
    expect(sql).not.toContain("study_deviation");
  });
});
