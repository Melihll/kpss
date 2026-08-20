import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("P1-11B YouTube player UI contract", () => {
  const player = readFileSync(
    new URL("../apps/web/src/components/VideoPlayerDrawer.tsx", import.meta.url),
    "utf8",
  );
  const resourcesPage = readFileSync(
    new URL("../apps/web/src/pages/ResourcesPage.tsx", import.meta.url),
    "utf8",
  );
  const appApi = readFileSync(
    new URL("../supabase/functions/app-api/index.ts", import.meta.url),
    "utf8",
  );

  it("loads the official iframe API and resumes from saved position", () => {
    expect(player).toContain("https://www.youtube.com/iframe_api");
    expect(player).toContain("new YT.Player");
    expect(player).toContain("seekTo(resume, true)");
    expect(player).toContain("getCurrentTime()");
    expect(player).toContain("getPlaybackRate()");
  });

  it("uses GET/PUT P1-11A progress checkpoints", () => {
    expect(player).toContain("`/youtube-videos/${selectedVideo.id}/progress`");
    expect(player).toContain("`/youtube-videos/${video.id}/progress`");
    expect(player).toContain('method: "PUT"');
    expect(player).toContain("visibilitychange");
    expect(player).toContain("pagehide");
    expect(player).toContain("YOUTUBE_PROGRESS_CHECKPOINT_MS");
  });

  it("keeps video player separate from page progress until P1-12", () => {
    expect(resourcesPage).toContain('import { VideoPlayerDrawer }');
    expect(resourcesPage).toContain("setVideoResource(resource)");
    expect(resourcesPage).toContain("<VideoPlayerDrawer");
    expect(resourcesPage).toContain("<ResourceProgressDrawer");
  });

  it("lists only owned synced active videos for the resource", () => {
    const start = appApi.indexOf("const resourceYoutubeVideosMatch");
    const end = appApi.indexOf("const youtubeVideoProgressMatch", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const route = appApi.slice(start, end);
    expect(route).toContain('from("resources")');
    expect(route).toContain('from("topic_resource_links")');
    expect(route).toContain('from("youtube_playlist_videos")');
    expect(route).toContain('eq("user_id", userId)');
    expect(route).toContain('eq("exam_profile_id", profile.id)');
    expect(route).toContain('eq("is_active", true)');
  });

  it("does not mutate planner, tasks, resource units or study sessions", () => {
    const start = appApi.indexOf("const resourceYoutubeVideosMatch");
    const end = appApi.indexOf("const youtubeVideoProgressMatch", start);
    const route = appApi.slice(start, end);

    expect(route).not.toContain('from("study_sessions")');
    expect(route).not.toContain('from("resource_units")');
    expect(route).not.toContain('from("tasks")');
    expect(route).not.toContain("weekly-plan");
    expect(route).not.toContain("recalculate");
  });
});