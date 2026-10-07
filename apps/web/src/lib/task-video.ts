import type { RoadmapTask, TaskMaterialScope } from "./roadmap";
import type { ResourceVideoLibraryResponse, VideoItem, VideoProgress, VideoProgressResponse } from "../components/VideoPlayerDrawer";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function playableCatalogVideo(video: VideoItem): boolean {
  return UUID.test(video.id) && YOUTUBE_VIDEO_ID.test(video.youtubeVideoId) &&
    Number.isInteger(video.durationSeconds) && video.durationSeconds > 0;
}

export type TaskVideoResolution =
  | { kind: "exact"; video: VideoItem }
  | { kind: "choose" }
  | { kind: "unavailable"; message: string };

/** Join persisted catalog identity, never URL, title, index or opaque identity text. */
export function resolveTaskVideo(resourceId: string, scope: TaskMaterialScope | null, library: ResourceVideoLibraryResponse): TaskVideoResolution {
  if (library.resource.id !== resourceId || (scope && scope.resourceId !== resourceId)) {
    return { kind: "unavailable", message: "Görev ve video kaynağı eşleşmiyor. Kaynak bağlantısını kontrol et." };
  }
  if (scope?.kind !== "full_video") return { kind: "choose" };
  const matches = library.playlists.flatMap((playlist) => playlist.videos)
    .filter((video) => video.id === scope.youtubePlaylistVideoId);
  const video = matches[0];
  if (matches.length !== 1 || !video || !playableCatalogVideo(video) || video.durationSeconds !== scope.durationSeconds) {
    return { kind: "unavailable", message: "Göreve bağlı video doğrulanamadı. Kaynak bağlantısını ve senkronizasyonu kontrol et." };
  }
  return { kind: "exact", video };
}

/** A successful null means no saved row. A failed read must never imply zero progress. */
export function verifiedVideoProgress(video: VideoItem, playlistId: string, payload: VideoProgressResponse): VideoProgress | null {
  const metadata = payload.video;
  if (!playableCatalogVideo(video) || metadata.id !== video.id || metadata.youtubePlaylistId !== playlistId ||
      metadata.youtubeVideoId !== video.youtubeVideoId || metadata.durationSeconds !== video.durationSeconds) {
    throw new Error("VIDEO_PROGRESS_IDENTITY_MISMATCH");
  }
  const progress = payload.progress;
  if (progress && (progress.youtubePlaylistVideoId !== video.id || progress.durationSeconds !== video.durationSeconds ||
      !Number.isInteger(progress.lastPositionSeconds) || progress.lastPositionSeconds < 0 || progress.lastPositionSeconds > video.durationSeconds ||
      !Number.isInteger(progress.watchedSeconds) || progress.watchedSeconds < 0 || progress.watchedSeconds > video.durationSeconds)) {
    throw new Error("VIDEO_PROGRESS_IDENTITY_MISMATCH");
  }
  return progress;
}

/** Present the same server record; this does not alter task/session completion. */
export function taskWithVideoProgress(task: RoadmapTask, progress: VideoProgress): RoadmapTask {
  const scope = task.material_scope;
  if (scope?.kind !== "full_video" || scope.youtubePlaylistVideoId !== progress.youtubePlaylistVideoId ||
      scope.durationSeconds !== progress.durationSeconds) return task;
  return { ...task, material_scope: { ...scope, watchedSeconds: progress.watchedSeconds, completed: progress.completed } };
}
