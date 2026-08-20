import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("P1-12 unified resource detail drawer contract", () => {
  const detail = readFileSync(
    new URL("../apps/web/src/components/ResourceDetailDrawer.tsx", import.meta.url),
    "utf8",
  );
  const page = readFileSync(
    new URL("../apps/web/src/pages/ResourcesPage.tsx", import.meta.url),
    "utf8",
  );
  const appApi = readFileSync(
    new URL("../supabase/functions/app-api/index.ts", import.meta.url),
    "utf8",
  );

  it("shows page and video progress in one resource detail dialog", () => {
    expect(detail).toContain("Sayfa ve video ilerlemesi tek yerde");
    expect(detail).toContain("<ResourceProgressPanel");
    expect(detail).toContain("<VideoPlayerPanel");
    expect(detail).toContain('activeTab === "page"');
    expect(detail).toContain('activeTab === "video"');
    expect(detail).toContain("summarizeResourceVideoProgress");
  });

  it("lets either resource action open the same drawer on the intended tab", () => {
    expect(page).toContain('setDetailTab("page")');
    expect(page).toContain('setDetailTab("video")');
    expect(page).toContain("setDetailResource(resource)");
    expect(page).toContain("<ResourceDetailDrawer");
    expect(page).not.toContain("<VideoPlayerDrawer");
    expect(page).not.toContain("<ResourceProgressDrawer");
  });

  it("preloads video progress with the owned resource video catalog", () => {
    const start = appApi.indexOf("const resourceYoutubeVideosMatch");
    const end = appApi.indexOf("const youtubeVideoProgressMatch", start);
    const route = appApi.slice(start, end);

    expect(route).toContain('from("youtube_video_progress")');
    expect(route).toContain('eq("user_id", userId)');
    expect(route).toContain('eq("exam_profile_id", profile.id)');
    expect(route).toContain("presentYouTubeVideoProgress");
    expect(route).toContain("progressByVideoId");
  });

  it("does not introduce plan, task, unit or session mutations", () => {
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