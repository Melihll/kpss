import { describe, expect, it } from "vitest";
import {
  YOUTUBE_PROGRESS_CHECKPOINT_MS,
  clampYouTubeWatchedSeconds,
  countedYouTubeWatchDelta,
  shouldCheckpointYouTubeProgress,
  youtubeTimeLabel,
} from "./youtube-player-progress";

describe("P1-11B youtube player progress accounting", () => {
  it("counts normal playback", () => {
    expect(countedYouTubeWatchDelta({
      previousPositionSeconds: 10,
      currentPositionSeconds: 11.05,
      elapsedWallSeconds: 1,
      playbackRate: 1,
    })).toBeCloseTo(1.05);
  });

  it("counts legitimate 2x playback", () => {
    expect(countedYouTubeWatchDelta({
      previousPositionSeconds: 10,
      currentPositionSeconds: 12,
      elapsedWallSeconds: 1,
      playbackRate: 2,
    })).toBe(2);
  });

  it("does not count a forward seek as watched time", () => {
    expect(countedYouTubeWatchDelta({
      previousPositionSeconds: 10,
      currentPositionSeconds: 80,
      elapsedWallSeconds: 1,
      playbackRate: 1,
    })).toBe(0);
  });

  it("does not count a backward seek", () => {
    expect(countedYouTubeWatchDelta({
      previousPositionSeconds: 80,
      currentPositionSeconds: 20,
      elapsedWallSeconds: 1,
      playbackRate: 1,
    })).toBe(0);
  });

  it("clamps watched seconds at video duration", () => {
    expect(clampYouTubeWatchedSeconds(95, 10, 100)).toBe(100);
  });

  it("checkpoints at fifteen seconds", () => {
    expect(YOUTUBE_PROGRESS_CHECKPOINT_MS).toBe(15_000);
    expect(shouldCheckpointYouTubeProgress(14_999, 0)).toBe(false);
    expect(shouldCheckpointYouTubeProgress(15_000, 0)).toBe(true);
  });

  it("formats player times", () => {
    expect(youtubeTimeLabel(65)).toBe("1:05");
    expect(youtubeTimeLabel(3661)).toBe("1:01:01");
  });
});