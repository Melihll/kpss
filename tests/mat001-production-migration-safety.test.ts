import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260824123500_mat001_material_progress_and_video_topic_mapping.sql",
  ),
  "utf8",
).toLowerCase();

describe("MAT-001 production migration safety", () => {
  it("is additive and does not rewrite production progress history", () => {
    expect(migration).not.toMatch(/\bdelete\s+from\b/);
    expect(migration).not.toMatch(/\btruncate\b/);
    expect(migration).not.toMatch(/\bdrop\s+(table|column)\b/);
    expect(migration).not.toMatch(/update\s+public\.resource_unit_progress/);
  });

  it("keeps existing completed progress valid when exact page progress is unknown", () => {
    expect(migration).toContain(
      "if new.completed_through_page is null then",
    );
    expect(migration).toContain("return new;");
  });

  it("does not replace existing task or study execution RPCs", () => {
    expect(migration).not.toContain("complete_task_unit");
    expect(migration).not.toContain("record_test_result");
    expect(migration).not.toContain("finish_study_session");
    expect(migration).not.toContain("record_youtube_video_progress");
  });

  it("adds the new mapping store behind RLS without anonymous access", () => {
    expect(migration).toContain(
      "alter table public.youtube_video_topic_links enable row level security",
    );
    expect(migration).toContain(
      "revoke all on public.youtube_video_topic_links from public, anon, authenticated",
    );
  });
});
