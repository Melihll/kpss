import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("P1-14 study session mode contract", () => {
  const migration = readFileSync(
    new URL("../supabase/migrations/20260820130000_add_study_session_mode.sql", import.meta.url),
    "utf8",
  );
  const types = readFileSync(
    new URL("../packages/domain/src/types.ts", import.meta.url),
    "utf8",
  );

  it("keeps session_type separate and adds the four coarse material modes", () => {
    expect(migration).toContain("add column session_mode text null");
    expect(migration).toContain("study_sessions_mode_valid");
    expect(migration).toContain("'book', 'video', 'questions', 'mixed'");
    expect(migration).not.toContain("drop column session_type");
    expect(migration).not.toContain("rename column session_type");
  });

  it("derives task sessions deterministically from task work_mode", () => {
    expect(migration).toContain("when task_work_mode = 'video' then 'video'");
    expect(migration).toContain("when task_work_mode in ('questions', 'mock') then 'questions'");
    expect(migration).toContain("when task_work_mode in ('book', 'notes') then 'book'");
    expect(migration).toContain("else 'mixed'");
    expect(migration).toContain("study_sessions_set_session_mode");
  });

  it("backfills existing sessions and makes the new field required", () => {
    expect(migration).toContain("update public.study_sessions s");
    expect(migration).toContain("set session_mode = 'mixed'");
    expect(migration).toContain("alter column session_mode set not null");
  });

  it("does not replace existing start/finish/retroactive RPC signatures", () => {
    expect(migration).not.toContain("create or replace function public.start_study_session");
    expect(migration).not.toContain("create or replace function public.finish_study_session");
    expect(migration).not.toContain("create or replace function public.record_retroactive_session");
    expect(migration).not.toContain("telegram_start_study_session");
  });

  it("exposes the mode in the canonical domain type", () => {
    expect(types).toContain('export type StudySessionMode = "book" | "video" | "questions" | "mixed";');
    expect(types).toContain("session_mode: StudySessionMode");
  });
});