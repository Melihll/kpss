export const YOUTUBE_VIDEO_COMPLETION_RATIO = 0.95;

export interface YouTubeVideoProgressInput {
  readonly lastPositionSeconds: number;
  readonly watchedSeconds: number;
}

export interface YouTubeVideoProgressView {
  readonly youtubePlaylistVideoId: string;
  readonly lastPositionSeconds: number;
  readonly watchedSeconds: number;
  readonly durationSeconds: number;
  readonly progressPercent: number;
  readonly remainingSeconds: number;
  readonly completed: boolean;
  readonly completedAt: string | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
}

function requireNonNegativeInteger(
  value: unknown,
  code: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new Error(code);
  }
  return value;
}

export function normalizeYouTubeVideoProgressInput(
  input: unknown,
): YouTubeVideoProgressInput {
  if (!input || typeof input !== "object") {
    throw new Error("YOUTUBE_VIDEO_PROGRESS_INVALID_POSITION");
  }

  const value = input as Record<string, unknown>;
  return Object.freeze({
    lastPositionSeconds: requireNonNegativeInteger(
      value.lastPositionSeconds,
      "YOUTUBE_VIDEO_PROGRESS_INVALID_POSITION",
    ),
    watchedSeconds: requireNonNegativeInteger(
      value.watchedSeconds,
      "YOUTUBE_VIDEO_PROGRESS_INVALID_WATCHED_SECONDS",
    ),
  });
}

export function youtubeVideoCompletionThresholdSeconds(
  durationSeconds: number,
): number {
  if (!Number.isInteger(durationSeconds) || durationSeconds <= 0) {
    throw new Error("YOUTUBE_VIDEO_DURATION_UNAVAILABLE");
  }
  return Math.ceil(durationSeconds * YOUTUBE_VIDEO_COMPLETION_RATIO);
}

export function presentYouTubeVideoProgress(
  row: Record<string, unknown>,
  durationSeconds: number,
): YouTubeVideoProgressView {
  const threshold = youtubeVideoCompletionThresholdSeconds(durationSeconds);
  const lastPositionSeconds = Math.min(
    durationSeconds,
    Math.max(0, Number(row.last_position_seconds ?? 0)),
  );
  const watchedSeconds = Math.min(
    durationSeconds,
    Math.max(0, Number(row.watched_seconds ?? 0)),
  );
  const completedAt = row.completed_at ? String(row.completed_at) : null;

  return Object.freeze({
    youtubePlaylistVideoId: String(row.youtube_playlist_video_id),
    lastPositionSeconds,
    watchedSeconds,
    durationSeconds,
    progressPercent: Math.min(
      100,
      Math.round((watchedSeconds / durationSeconds) * 100),
    ),
    remainingSeconds: Math.max(0, durationSeconds - watchedSeconds),
    completed: completedAt !== null || watchedSeconds >= threshold,
    completedAt,
    createdAt: row.created_at ? String(row.created_at) : null,
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  });
}