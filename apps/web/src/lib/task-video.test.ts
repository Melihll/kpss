import { describe, expect, it } from "vitest";
import type { RoadmapTask, TaskMaterialScope } from "./roadmap";
import type { ResourceVideoLibraryResponse, VideoItem, VideoProgress, VideoProgressResponse } from "../components/VideoPlayerDrawer";
import { playableCatalogVideo, resolveTaskVideo, taskWithVideoProgress, verifiedVideoProgress } from "./task-video";

const resourceId = "00000000-0000-4000-8000-000000000001";
const playlistId = "00000000-0000-4000-8000-000000000002";
const video: VideoItem = { id: "00000000-0000-4000-8000-000000000003", youtubeVideoId: "00000000001", title: "Aynı ders başlığı", position: 0, durationSeconds: 1200, thumbnailUrl: null, channelTitle: null, publishedAt: null, progress: null };
const other: VideoItem = { ...video, id: "00000000-0000-4000-8000-000000000004", youtubeVideoId: "00000000002", position: 1 };
const library: ResourceVideoLibraryResponse = { resource: { id: resourceId, name: "Kaynak", resourceType: "video_course" }, playlists: [{ id: playlistId, sourceUrl: "", youtubePlaylistId: "external-playlist", title: null, totalDurationSeconds: 2400, videoCount: 2, lastSyncedAt: null, videos: [other, video] }] };
const scope: TaskMaterialScope = { kind: "full_video", resourceId, youtubePlaylistVideoId: video.id, title: "Eski başlık", position: 9, durationSeconds: 1200, watchedSeconds: 60, completed: false };
const progress: VideoProgress = { youtubePlaylistVideoId: video.id, lastPositionSeconds: 720, watchedSeconds: 300, durationSeconds: 1200, progressPercent: 25, remainingSeconds: 900, completed: false, completedAt: null, createdAt: null, updatedAt: null };
const response: VideoProgressResponse = { video: { id: video.id, youtubePlaylistId: playlistId, youtubeVideoId: video.youtubeVideoId, title: video.title, position: 0, durationSeconds: video.durationSeconds }, progress };
const task: RoadmapTask = { id: "task", title: "Çalışma", description: null, planned_date: null, estimated_minutes: 20, status: "ready", work_mode: "video", material_resource_id: resourceId, material_scope: scope };
const withVideos = (videos: VideoItem[]): ResourceVideoLibraryResponse => ({ ...library, playlists: [{ ...library.playlists[0]!, videos }] });

describe("canonical task video resolution", () => {
  it("joins catalog UUID within the real resource, ignoring title, position and list order", () => {
    expect(resolveTaskVideo(resourceId, scope, library)).toEqual({ kind: "exact", video });
  });
  it("never substitutes the first incomplete video when the canonical item is missing", () => {
    expect(resolveTaskVideo(resourceId, scope, withVideos([other]))).toMatchObject({ kind: "unavailable" });
  });
  it("rejects a different resource or conflicting catalog duration", () => {
    expect(resolveTaskVideo("another-resource", scope, library).kind).toBe("unavailable");
    expect(resolveTaskVideo(resourceId, { ...scope, resourceId: "other" }, library).kind).toBe("unavailable");
    expect(resolveTaskVideo(resourceId, scope, withVideos([{ ...video, durationSeconds: 1300 }])).kind).toBe("unavailable");
  });
  it("requires explicit choice for resource-only or absent scope", () => {
    expect(resolveTaskVideo(resourceId, { kind: "resource", resourceId }, library)).toEqual({ kind: "choose" });
    expect(resolveTaskVideo(resourceId, null, library)).toEqual({ kind: "choose" });
  });
  it("rejects duplicated identity rather than picking the first match", () => {
    expect(resolveTaskVideo(resourceId, scope, withVideos([video, video])).kind).toBe("unavailable");
  });
  it.each(["https://www.youtube.com/watch?v=00000000001", "https://example.com/embed", "javascript:alert(1)", "<iframe>", "bad-id"])("rejects URL or malformed playback identity %s", (youtubeVideoId) => {
    expect(playableCatalogVideo({ ...video, youtubeVideoId })).toBe(false);
    expect(resolveTaskVideo(resourceId, scope, withVideos([{ ...video, youtubeVideoId }])).kind).toBe("unavailable");
  });
  it("rejects raw URL catalog identity and unknown duration", () => {
    expect(playableCatalogVideo({ ...video, id: "https://youtu.be/00000000001" })).toBe(false);
    expect(playableCatalogVideo({ ...video, durationSeconds: 0 })).toBe(false);
  });
});

describe("existing progress response authority", () => {
  it("keeps seek/resume separate from watched time", () => {
    expect(verifiedVideoProgress(video, playlistId, response)).toBe(progress);
  });
  it("accepts server-confirmed absence of a saved row", () => {
    expect(verifiedVideoProgress(video, playlistId, { ...response, progress: null })).toBeNull();
  });
  it.each(["id", "youtubePlaylistId", "youtubeVideoId", "durationSeconds"] as const)("rejects mismatched response metadata %s", (key) => {
    expect(() => verifiedVideoProgress(video, playlistId, { ...response, video: { ...response.video, [key]: key === "durationSeconds" ? 1500 : "other" } })).toThrow("IDENTITY_MISMATCH");
  });
  it("rejects progress for another item or beyond catalog bounds", () => {
    for (const patch of [{ youtubePlaylistVideoId: other.id }, { durationSeconds: 1600 }, { watchedSeconds: 1201 }, { lastPositionSeconds: -1 }]) {
      expect(() => verifiedVideoProgress(video, playlistId, { ...response, progress: { ...progress, ...patch } })).toThrow();
    }
  });
  it("updates only matching task presentation and preserves task completion authority", () => {
    expect(taskWithVideoProgress(task, progress)).toMatchObject({ status: "ready", material_scope: { watchedSeconds: 300, completed: false, youtubePlaylistVideoId: video.id } });
    expect(taskWithVideoProgress(task, { ...progress, completed: true }).status).toBe("ready");
    expect(taskWithVideoProgress(task, { ...progress, youtubePlaylistVideoId: other.id })).toBe(task);
    expect(taskWithVideoProgress(task, { ...progress, durationSeconds: 1400 })).toBe(task);
    const resourceTask = { ...task, material_scope: { kind: "resource", resourceId } as const };
    expect(taskWithVideoProgress(resourceTask, progress)).toBe(resourceTask);
  });
});
