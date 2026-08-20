import { describe, expect, it } from "vitest";
import { summarizeResourceVideoProgress } from "./resource-material-progress";

describe("P1-12 resource material video summary", () => {
  it("aggregates watched seconds and completed videos", () => {
    const summary = summarizeResourceVideoProgress([{
      videos: [
        {
          durationSeconds: 100,
          progress: { watchedSeconds: 100, completed: true },
        },
        {
          durationSeconds: 300,
          progress: { watchedSeconds: 100, completed: false },
        },
      ],
    }]);

    expect(summary.totalVideos).toBe(2);
    expect(summary.completedVideos).toBe(1);
    expect(summary.watchedSeconds).toBe(200);
    expect(summary.totalDurationSeconds).toBe(400);
    expect(summary.progressPercent).toBe(50);
  });

  it("does not allow watched progress to exceed canonical video duration", () => {
    const summary = summarizeResourceVideoProgress([{
      videos: [{
        durationSeconds: 120,
        progress: { watchedSeconds: 999, completed: true },
      }],
    }]);

    expect(summary.watchedSeconds).toBe(120);
    expect(summary.progressPercent).toBe(100);
  });

  it("returns a stable empty summary", () => {
    expect(summarizeResourceVideoProgress([])).toEqual({
      totalVideos: 0,
      completedVideos: 0,
      watchedSeconds: 0,
      totalDurationSeconds: 0,
      progressPercent: 0,
    });
  });
});