import { describe, expect, it } from "vitest";
import { buildAiMaterialCoachingContext } from "../supabase/functions/_shared/ai-coach/material-context";
import type { MaterialWorkloadProjection } from "../supabase/functions/_shared/material-workload";

function projection(input: {
  pageMinutes?: number;
  remainingPages?: number;
  videoMinutes?: number;
  totalMinutes: number;
}): MaterialWorkloadProjection {
  const pageMinutes = input.pageMinutes ?? 0;
  const videoMinutes = input.videoMinutes ?? 0;

  return {
    page: input.remainingPages == null ? null : {
      currentPage: 0,
      totalPages: input.remainingPages,
      remainingPages: input.remainingPages,
      remainingMinutes: pageMinutes,
    },
    video: input.videoMinutes == null ? null : {
      watchedSeconds: 0,
      durationSeconds: videoMinutes * 60,
      remainingSeconds: videoMinutes * 60,
      remainingMinutes: videoMinutes,
    },
    totalRemainingMinutes: input.totalMinutes,
  };
}

describe("P2-09 deterministic AI material context", () => {
  it("marks page-heavy workload before AI", () => {
    const result = buildAiMaterialCoachingContext([{
      resourceId: "r1",
      resourceName: "Tarih",
      sequenceOrder: 1,
      projection: projection({
        pageMinutes: 180,
        remainingPages: 90,
        videoMinutes: 30,
        totalMinutes: 210,
      }),
    }]);

    expect(result[0]).toEqual({
      resourceName: "Tarih",
      remainingPages: 90,
      remainingVideoMinutes: 30,
      totalRemainingMinutes: 210,
      focus: "PAGE",
    });
  });

  it("marks video-heavy and equal mixed workloads deterministically", () => {
    const result = buildAiMaterialCoachingContext([
      {
        resourceId: "video",
        resourceName: "Video",
        sequenceOrder: 1,
        projection: projection({
          pageMinutes: 30,
          remainingPages: 10,
          videoMinutes: 60,
          totalMinutes: 90,
        }),
      },
      {
        resourceId: "mixed",
        resourceName: "Karma",
        sequenceOrder: 2,
        projection: projection({
          pageMinutes: 45,
          remainingPages: 20,
          videoMinutes: 45,
          totalMinutes: 90,
        }),
      },
    ]);

    expect(result.map((item) => item.focus)).toEqual(["VIDEO", "MIXED"]);
  });

  it("sorts by deterministic workload and limits AI context", () => {
    const result = buildAiMaterialCoachingContext([
      {
        resourceId: "small",
        resourceName: "Küçük",
        sequenceOrder: 1,
        projection: projection({
          remainingPages: 10,
          pageMinutes: 10,
          totalMinutes: 10,
        }),
      },
      {
        resourceId: "large",
        resourceName: "Büyük",
        sequenceOrder: 2,
        projection: projection({
          remainingPages: 100,
          pageMinutes: 100,
          totalMinutes: 100,
        }),
      },
    ], 1);

    expect(result).toHaveLength(1);
    expect(result[0]!.resourceName).toBe("Büyük");
  });

  it("marks zero remaining material as complete", () => {
    const result = buildAiMaterialCoachingContext([{
      resourceId: "done",
      resourceName: "Tamam",
      sequenceOrder: 1,
      projection: projection({
        remainingPages: 0,
        pageMinutes: 0,
        videoMinutes: 0,
        totalMinutes: 0,
      }),
    }]);

    expect(result[0]!.focus).toBe("COMPLETE");
  });
});