interface MaterialVideoProgress {
  readonly watchedSeconds: number;
  readonly completed: boolean;
}

interface MaterialVideo {
  readonly durationSeconds: number;
  readonly progress: MaterialVideoProgress | null;
}

interface MaterialPlaylist {
  readonly videos: readonly MaterialVideo[];
}

export interface ResourceVideoProgressSummary {
  readonly totalVideos: number;
  readonly completedVideos: number;
  readonly watchedSeconds: number;
  readonly totalDurationSeconds: number;
  readonly progressPercent: number;
}

export function summarizeResourceVideoProgress(
  playlists: readonly MaterialPlaylist[],
): ResourceVideoProgressSummary {
  const videos = playlists.flatMap((playlist) => playlist.videos);
  const totalDurationSeconds = videos.reduce(
    (sum, video) => sum + Math.max(0, Number(video.durationSeconds ?? 0)),
    0,
  );
  const watchedSeconds = videos.reduce(
    (sum, video) => sum + Math.min(
      Math.max(0, Number(video.durationSeconds ?? 0)),
      Math.max(0, Number(video.progress?.watchedSeconds ?? 0)),
    ),
    0,
  );

  return Object.freeze({
    totalVideos: videos.length,
    completedVideos: videos.filter((video) => video.progress?.completed).length,
    watchedSeconds,
    totalDurationSeconds,
    progressPercent: totalDurationSeconds > 0
      ? Math.min(100, Math.round((watchedSeconds / totalDurationSeconds) * 100))
      : 0,
  });
}