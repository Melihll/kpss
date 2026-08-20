import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  normalizeYouTubeVideoProgressInput,
  presentYouTubeVideoProgress,
  youtubeVideoCompletionThresholdSeconds,
} from "../supabase/functions/_shared/youtube-video-progress";

describe("P1-11A youtube video progress helpers", () => {
  it("keeps resume position separate from actually watched seconds", () => {
    const input = normalizeYouTubeVideoProgressInput({
      lastPositionSeconds: 2400,
      watchedSeconds: 300,
    });

    expect(input.lastPositionSeconds).toBe(2400);
    expect(input.watchedSeconds).toBe(300);
  });

  it("rejects negative and non-integer values", () => {
    expect(() => normalizeYouTubeVideoProgressInput({
      lastPositionSeconds: -1,
      watchedSeconds: 0,
    })).toThrow("YOUTUBE_VIDEO_PROGRESS_INVALID_POSITION");

    expect(() => normalizeYouTubeVideoProgressInput({
      lastPositionSeconds: 1.5,
      watchedSeconds: 0,
    })).toThrow("YOUTUBE_VIDEO_PROGRESS_INVALID_POSITION");

    expect(() => normalizeYouTubeVideoProgressInput({
      lastPositionSeconds: 10,
      watchedSeconds: -1,
    })).toThrow("YOUTUBE_VIDEO_PROGRESS_INVALID_WATCHED_SECONDS");
  });

  it("uses a deterministic 95 percent completion threshold", () => {
    expect(youtubeVideoCompletionThresholdSeconds(1000)).toBe(950);
    expect(youtubeVideoCompletionThresholdSeconds(101)).toBe(96);
  });

  it("presents watched progress without treating a seek as watched time", () => {
    const view = presentYouTubeVideoProgress({
      youtube_playlist_video_id: "video-row-1",
      last_position_seconds: 900,
      watched_seconds: 120,
      completed_at: null,
      created_at: "2026-08-20T09:00:00Z",
      updated_at: "2026-08-20T09:05:00Z",
    }, 1000);

    expect(view.lastPositionSeconds).toBe(900);
    expect(view.watchedSeconds).toBe(120);
    expect(view.progressPercent).toBe(12);
    expect(view.completed).toBe(false);
  });

  it("marks progress complete at the threshold", () => {
    const view = presentYouTubeVideoProgress({
      youtube_playlist_video_id: "video-row-1",
      last_position_seconds: 950,
      watched_seconds: 950,
      completed_at: "2026-08-20T09:10:00Z",
    }, 1000);

    expect(view.progressPercent).toBe(95);
    expect(view.completed).toBe(true);
  });
});

describe("P1-11A database and app-api contract", () => {
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20260820123000_youtube_video_progress.sql",
      import.meta.url,
    ),
    "utf8",
  );

  const appApi = readFileSync(
    new URL("../supabase/functions/app-api/index.ts", import.meta.url),
    "utf8",
  );

  it("creates user-scoped video progress with RLS", () => {
    expect(migration).toContain("create table public.youtube_video_progress");
    expect(migration).toContain("last_position_seconds integer not null");
    expect(migration).toContain("watched_seconds integer not null");
    expect(migration).toContain("primary key (user_id, youtube_playlist_video_id)");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain('create policy "Users own youtube video progress"');
  });

  it("records absolute watched progress atomically and idempotently", () => {
    expect(migration).toContain("record_youtube_video_progress");
    expect(migration).toContain("on conflict(user_id, youtube_playlist_video_id)");
    expect(migration).toContain("greatest(");
    expect(migration).toContain("v_video.duration_seconds * 0.95");
    expect(migration).toContain("least(p_position_seconds, v_video.duration_seconds)");
    expect(migration).toContain("least(p_watched_seconds, v_video.duration_seconds)");
  });

  it("exposes scoped GET/PUT progress for an active synced video", () => {
    const start = appApi.indexOf("const youtubeVideoProgressMatch");
    const end = appApi.indexOf("const youtubePlaylistSyncMatch", start);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const route = appApi.slice(start, end);
    expect(route).toContain('request.method === "GET"');
    expect(route).toContain('request.method === "PUT"');
    expect(route).toContain('from("youtube_playlist_videos")');
    expect(route).toContain('from("youtube_video_progress")');
    expect(route).toContain('eq("user_id", userId)');
    expect(route).toContain('eq("exam_profile_id", profile.id)');
    expect(route).toContain('"record_youtube_video_progress"');
  });

  it("does not mutate study sessions, planner units, tasks or weekly plans", () => {
    const start = appApi.indexOf("const youtubeVideoProgressMatch");
    const end = appApi.indexOf("const youtubePlaylistSyncMatch", start);
    const route = appApi.slice(start, end);

    expect(route).not.toContain('from("study_sessions")');
    expect(route).not.toContain('from("resource_units")');
    expect(route).not.toContain('from("tasks")');
    expect(route).not.toContain("weekly-plan");
    expect(route).not.toContain("recalculate");
    expect(migration).not.toContain("insert into public.study_sessions");
    expect(migration).not.toContain("update public.resource_units");
    expect(migration).not.toContain("update public.weekly_plans");
    expect(migration).not.toContain("update public.tasks");
  });
});