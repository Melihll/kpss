import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../apps/web/src/${path}`, import.meta.url), "utf8");
describe("video integration boundaries", () => {
  it("places the local environment gate before loading any auth or data modules", () => {
    const entry = read("dev-video-entry.tsx");
    expect(entry.indexOf("if (localVideoReviewAllowed(")).toBeLessThan(entry.indexOf('import("./dev-video-review")'));
    expect(entry).not.toMatch(/import .+ from .*(AuthContext|app-api|supabase)/);
    expect(read("main.tsx")).toContain('void import("./dev-video-entry")');
  });
  it("waits for verified progress before embedding and never accepts an iframe URL", () => {
    const player = read("components/VideoPlayerDrawer.tsx");
    expect(player).toContain("verifiedVideoId !== selectedVideo.id");
    expect(player).toContain("verifiedVideoProgress(selectedVideo, selectedPlaylistId, payload)");
    expect(player).toContain("verifiedVideoProgress(video, playlistId, payload)");
    expect(player).toContain("disabled={locked || !libraryMatches || !playableCatalogVideo(video)}");
    expect(player).toContain("videoId: video.youtubeVideoId");
    expect(player).not.toContain("<iframe");
    expect(player).not.toContain("src={");
    expect(player).not.toContain("localStorage");
  });
  it("reuses the real workspace without provisioning resources or starting a session in the review", () => {
    const review = read("dev-video-review.tsx");
    expect(review).toContain('"/weekly-plan/current"');
    expect(review).toContain("<StudyMaterialWorkspace");
    expect(review).not.toMatch(/method:|\/sync|material-links|\/study-sessions|ensureWeek/);
    expect(read("ux-lab/CoachVideo.tsx")).toContain('href="/ux-lab/live-video"');
  });
});
