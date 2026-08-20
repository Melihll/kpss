import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260820103000_add_study_session_breaks.sql",
    import.meta.url,
  ),
  "utf8",
);

const appApi = readFileSync(
  new URL("../supabase/functions/app-api/index.ts", import.meta.url),
  "utf8",
);

describe("P1-03 study session breaks contract", () => {
  it("models breaks separately from study_sessions status", () => {
    expect(migration).toContain("create table public.study_session_breaks");
    expect(migration).toContain("study_session_breaks_one_open_per_session");
    expect(migration).not.toContain("status = 'paused'");
    expect(migration).not.toContain("status='paused'");
  });

  it("provides idempotent pause and resume RPCs", () => {
    expect(migration).toContain("public.pause_study_session");
    expect(migration).toContain("public.resume_study_session");
    expect(migration).toContain("'paused', true");
    expect(migration).toContain("'paused', false");
  });

  it("subtracts break seconds before writing study duration", () => {
    expect(migration).toContain("break_seconds numeric := 0");
    expect(migration).toContain(
      "extract(epoch from (finished_at - s.started_at)) - break_seconds",
    );
    expect(migration).toContain("duration_minutes = mins");
    expect(migration).toContain(
      "public.task_progress.actual_study_minutes + mins",
    );
  });

  it("closes an open break before finish or cancel", () => {
    expect(migration).toMatch(
      /update public\.study_session_breaks[\s\S]*ended_at = finished_at/,
    );
    expect(migration).toMatch(
      /update public\.study_session_breaks[\s\S]*ended_at = cancelled_at/,
    );
  });

  it("exposes pause state and pause/resume actions through app-api", () => {
    expect(appApi).toContain('from("study_session_breaks")');
    expect(appApi).toContain("paused: Boolean(openBreak)");
    expect(appApi).toContain("(finish|cancel|pause|resume)");
    expect(appApi).toContain('"pause_study_session"');
    expect(appApi).toContain('"resume_study_session"');
  });
});