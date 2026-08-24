import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260824123500_mat001_material_progress_and_video_topic_mapping.sql",
);

const sql = readFileSync(migrationPath, "utf8").toLowerCase();
const normalizedSql = sql.replace(/\s+/g, " ").trim();

describe("MAT-001 persistence migration contract", () => {
  it("adds exact partial-page persistence without backfilling history", () => {
    expect(normalizedSql).toContain("add column completed_through_page integer null");
    expect(normalizedSql).toContain("resource_unit_progress_completed_through_page_positive");
    expect(sql).not.toMatch(
      /update\s+public\.resource_unit_progress\s+set\s+completed_through_page/,
    );
  });

  it("validates physical partial-page boundaries against the canonical unit", () => {
    expect(normalizedSql).toContain("validate_resource_unit_progress_page_boundary");
    expect(normalizedSql).toContain("completed_through_page_out_of_range");
    expect(normalizedSql).toContain("completed_through_page_status_invalid");
    expect(normalizedSql).toContain("completed_through_page_completed_inconsistent");
    expect(normalizedSql).toContain("completed_through_page_in_progress_inconsistent");
  });

  it("creates canonical individual YouTube video-topic mappings", () => {
    expect(normalizedSql).toContain("create table public.youtube_video_topic_links");
    expect(normalizedSql).toContain("youtube_playlist_video_id uuid not null");
    expect(normalizedSql).toContain("curriculum_node_id uuid not null");
    expect(normalizedSql).toContain("mapping_status text not null default 'ambiguous'");
    expect(normalizedSql).toContain("mapping_provenance text not null default 'ai_candidate'");
  });

  it("binds mapping ownership to user profile and authoritative video", () => {
    expect(normalizedSql).toContain("youtube_playlist_videos_id_owner_unique");
    expect(normalizedSql).toContain(
      "foreign key (youtube_playlist_video_id, user_id, exam_profile_id)",
    );
    expect(normalizedSql).toContain(
      "references public.youtube_playlist_videos(id, user_id, exam_profile_id)",
    );
    expect(normalizedSql).toContain("youtube_video_topic_links_profile_owner_fk");
  });

  it("restricts mapping status and provenance", () => {
    expect(normalizedSql).toContain("mapping_status in ('validated', 'ambiguous')");
    expect(normalizedSql).toContain(
      "mapping_provenance in ('reviewed_mapping', 'trusted_import', 'corrected', 'ai_candidate')",
    );
  });

  it("supports optional deterministic video segments", () => {
    expect(normalizedSql).toContain("segment_start_seconds integer null");
    expect(normalizedSql).toContain("segment_end_seconds integer null");
    expect(normalizedSql).toContain("youtube_video_topic_links_segment_pair");
    expect(normalizedSql).toContain("youtube_video_topic_links_segment_order");
    expect(normalizedSql).toContain("validate_youtube_video_topic_link");
    expect(normalizedSql).toContain("segment_outside_video_duration");
  });

  it("preserves mapping history while preventing duplicate active mappings", () => {
    expect(normalizedSql).toContain("youtube_video_topic_links_active_unique");
    expect(normalizedSql).toContain("where is_active = true");
  });

  it("uses updated-at infrastructure and RLS", () => {
    expect(normalizedSql).toContain("youtube_video_topic_links_set_updated_at");
    expect(normalizedSql).toContain(
      "alter table public.youtube_video_topic_links enable row level security",
    );
    expect(normalizedSql).toContain(
      'create policy "users own youtube video topic links"',
    );
    expect(normalizedSql).toContain("auth.uid()");
  });

  it("does not grant anonymous access to video-topic mappings", () => {
    expect(normalizedSql).toContain(
      "revoke all on public.youtube_video_topic_links from public, anon, authenticated",
    );
    expect(normalizedSql).toContain(
      "grant select, insert, update, delete on public.youtube_video_topic_links to authenticated",
    );
  });
});
