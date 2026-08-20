export const YOUTUBE_PROGRESS_CHECKPOINT_MS = 15_000;

interface WatchDeltaInput {
  readonly previousPositionSeconds: number;
  readonly currentPositionSeconds: number;
  readonly elapsedWallSeconds: number;
  readonly playbackRate: number;
}

export function countedYouTubeWatchDelta({
  previousPositionSeconds,
  currentPositionSeconds,
  elapsedWallSeconds,
  playbackRate,
}: WatchDeltaInput): number {
  const mediaDelta = currentPositionSeconds - previousPositionSeconds;
  if (
    !Number.isFinite(mediaDelta) ||
    !Number.isFinite(elapsedWallSeconds) ||
    !Number.isFinite(playbackRate) ||
    mediaDelta <= 0 ||
    elapsedWallSeconds <= 0
  ) {
    return 0;
  }

  const safeRate = Math.max(0.25, playbackRate);
  const maximumNaturalDelta = (elapsedWallSeconds * safeRate * 1.75) + 0.75;

  // A jump larger than normal playback is treated as a seek, not watched time.
  return mediaDelta <= maximumNaturalDelta ? mediaDelta : 0;
}

export function clampYouTubeWatchedSeconds(
  watchedSeconds: number,
  addedSeconds: number,
  durationSeconds: number,
): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  return Math.min(
    durationSeconds,
    Math.max(0, watchedSeconds) + Math.max(0, addedSeconds),
  );
}

export function shouldCheckpointYouTubeProgress(
  nowMs: number,
  lastSavedAtMs: number,
  intervalMs = YOUTUBE_PROGRESS_CHECKPOINT_MS,
): boolean {
  return nowMs - lastSavedAtMs >= intervalMs;
}

export function youtubeTimeLabel(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remaining = safe % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`
    : `${minutes}:${String(remaining).padStart(2, "0")}`;
}