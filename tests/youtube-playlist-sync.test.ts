import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  fetchYouTubePlaylistCatalog,
  parseYouTubeDurationSeconds,
} from "../supabase/functions/_shared/youtube-playlist";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("P1-10 YouTube playlist catalog", () => {
  it("parses YouTube ISO-8601 durations deterministically", () => {
    expect(parseYouTubeDurationSeconds("PT45S")).toBe(45);
    expect(parseYouTubeDurationSeconds("PT12M5S")).toBe(725);
    expect(parseYouTubeDurationSeconds("PT1H2M3S")).toBe(3723);
    expect(parseYouTubeDurationSeconds("P1DT1H")).toBe(90000);
    expect(() => parseYouTubeDurationSeconds("not-a-duration"))
      .toThrow("YOUTUBE_API_INVALID_RESPONSE");
  });

  it("imports playlist videos and total duration", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        items: [{ id: "PL123", snippet: { title: "KPSS Tarih" }, contentDetails: { itemCount: 2 } }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        items: [
          { contentDetails: { videoId: "video-a" }, snippet: { position: 0 } },
          { contentDetails: { videoId: "video-b" }, snippet: { position: 1 } },
        ],
      }))
      .mockResolvedValueOnce(jsonResponse({
        items: [
          {
            id: "video-a",
            snippet: {
              title: "İlk Video",
              channelTitle: "Hoca",
              publishedAt: "2026-01-01T00:00:00Z",
              thumbnails: { high: { url: "https://img/a.jpg" } },
            },
            contentDetails: { duration: "PT10M" },
          },
          {
            id: "video-b",
            snippet: {
              title: "İkinci Video",
              channelTitle: "Hoca",
              publishedAt: "2026-01-02T00:00:00Z",
              thumbnails: { default: { url: "https://img/b.jpg" } },
            },
            contentDetails: { duration: "PT5M30S" },
          },
        ],
      }));

    const catalog = await fetchYouTubePlaylistCatalog({
      apiKey: "test-key",
      youtubePlaylistId: "PL123",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(catalog.title).toBe("KPSS Tarih");
    expect(catalog.videoCount).toBe(2);
    expect(catalog.totalDurationSeconds).toBe(930);
    expect(catalog.skippedVideoCount).toBe(0);
    expect(catalog.videos.map((video) => video.youtubeVideoId)).toEqual(["video-a", "video-b"]);
    expect(catalog.videos[0]?.position).toBe(0);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("skips unavailable videos instead of inventing metadata", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        items: [{ id: "PL123", snippet: { title: "Playlist" } }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        items: [
          { contentDetails: { videoId: "available" }, snippet: { position: 0 } },
          { contentDetails: { videoId: "deleted" }, snippet: { position: 1 } },
        ],
      }))
      .mockResolvedValueOnce(jsonResponse({
        items: [{
          id: "available",
          snippet: { title: "Available" },
          contentDetails: { duration: "PT2M" },
        }],
      }));

    const catalog = await fetchYouTubePlaylistCatalog({
      apiKey: "test-key",
      youtubePlaylistId: "PL123",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(catalog.videoCount).toBe(1);
    expect(catalog.skippedVideoCount).toBe(1);
    expect(catalog.totalDurationSeconds).toBe(120);
  });

  it("rejects missing playlists and upstream failures", async () => {
    const missing = vi.fn().mockResolvedValueOnce(jsonResponse({ items: [] }));
    await expect(fetchYouTubePlaylistCatalog({
      apiKey: "test-key",
      youtubePlaylistId: "missing",
      fetchImpl: missing as unknown as typeof fetch,
    })).rejects.toThrow("YOUTUBE_PLAYLIST_NOT_FOUND");

    const failed = vi.fn().mockResolvedValueOnce(jsonResponse({ error: {} }, 403));
    await expect(fetchYouTubePlaylistCatalog({
      apiKey: "test-key",
      youtubePlaylistId: "PL123",
      fetchImpl: failed as unknown as typeof fetch,
    })).rejects.toThrow("YOUTUBE_API_REQUEST_FAILED");
  });
});

describe("P1-10 persistence and app-api safety contract", () => {
  const migration = readFileSync(
    new URL("../supabase/migrations/20260820120000_youtube_playlist_sync.sql", import.meta.url),
    "utf8",
  );
  const appApi = readFileSync(
    new URL("../supabase/functions/app-api/index.ts", import.meta.url),
    "utf8",
  );

  it("stores ordered video metadata with RLS", () => {
    expect(migration).toContain("create table public.youtube_playlist_videos");
    expect(migration).toContain("youtube_video_id text not null");
    expect(migration).toContain("duration_seconds integer not null");
    expect(migration).toContain("position integer not null");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain('create policy "Users own youtube playlist videos"');
  });

  it("persists one normalized catalog atomically through an RPC", () => {
    expect(migration).toContain("sync_youtube_playlist_catalog");
    expect(migration).toContain("for update");
    expect(migration).toContain("jsonb_array_elements");
    expect(migration).toContain("on conflict(youtube_playlist_id, youtube_video_id)");
    expect(migration).toContain("last_synced_at = now()");
  });

  it("uses a server-side API key and owned playlist route", () => {
    const start = appApi.indexOf("const youtubePlaylistSyncMatch");
    const end = appApi.indexOf("const topicMaterialLinksMatch", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const route = appApi.slice(start, end);
    expect(route).toContain('Deno.env.get("YOUTUBE_API_KEY")');
    expect(route).toContain('eq("user_id", userId)');
    expect(route).toContain('eq("exam_profile_id", profile.id)');
    expect(route).toContain('from("topic_resource_links")');
    expect(route).toContain('"sync_youtube_playlist_catalog"');
  });

  it("does not mutate planner units or current plans", () => {
    const start = appApi.indexOf("const youtubePlaylistSyncMatch");
    const end = appApi.indexOf("const topicMaterialLinksMatch", start);
    const route = appApi.slice(start, end);
    expect(route).not.toContain('from("resource_units")');
    expect(route).not.toContain("weekly-plan");
    expect(route).not.toContain("persist_weekly_plan");
    expect(route).not.toContain("recalculate");
    expect(migration).not.toContain("insert into public.resource_units");
    expect(migration).not.toContain("update public.resource_units");
    expect(migration).not.toContain("update public.weekly_plans");
    expect(migration).not.toContain("insert into public.tasks");
  });
});