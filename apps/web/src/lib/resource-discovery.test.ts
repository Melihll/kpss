import { describe, expect, it } from "vitest";
import type { SubjectForecast } from "./roadmap";
import { mergeDiscoveredResources, type DiscoveredResource } from "./resource-discovery";

const math: SubjectForecast = {
  subjectId: "math",
  subjectName: "Matematik",
  weeklyMinutes: 300,
  totalPlannedMinutes: 1200,
  totalActualMinutes: 180,
  newSourceDate: null,
  resources: [
    {
      resourceId: "question-bank-1",
      resourceName: "Matematik Soru Bankası",
      plannedMinutes: 600,
      actualMinutes: 180,
      progressPercent: 30,
      remainingMinutes: 420,
      forecastFinishDate: "2026-10-01",
      completed: false,
      resourceType: "question_bank",
    },
    {
      resourceId: "question-bank-2",
      resourceName: "Genel Yetenek Matematik Soru Bankası",
      plannedMinutes: 600,
      actualMinutes: 0,
      progressPercent: 0,
      remainingMinutes: 600,
      forecastFinishDate: "2026-12-01",
      completed: false,
      resourceType: "question_bank",
    },
  ],
};

function discovered(overrides: Partial<DiscoveredResource> = {}): DiscoveredResource {
  return {
    resourceId: "video-course",
    subjectId: "math",
    resourceName: "2026 KPSS Matematik Video Ders Notları – İlyas Güneş",
    publisher: "Yargı Plus",
    resourceType: "video_course",
    status: "active",
    ...overrides,
  };
}

describe("resource discovery merge", () => {
  it("adds an active video course missing from roadmap forecasts", () => {
    const [merged] = mergeDiscoveredResources([math], [discovered()]);

    expect(merged?.resources).toHaveLength(3);
    expect(merged?.resources[2]).toMatchObject({
      resourceId: "video-course",
      resourceName: "2026 KPSS Matematik Video Ders Notları – İlyas Güneş",
      publisher: "Yargı Plus",
      resourceType: "video_course",
      progressPercent: 0,
      completed: false,
    });
    expect(merged?.resources.slice(0, 2)).toEqual(math.resources);
  });

  it("does not duplicate a resource already represented by the roadmap", () => {
    const [merged] = mergeDiscoveredResources([math], [
      discovered({ resourceId: "question-bank-1", resourceType: "question_bank" }),
    ]);

    expect(merged?.resources).toEqual(math.resources);
  });

  it("keeps inactive, unsupported, and unrelated-subject resources filtered out", () => {
    const [merged] = mergeDiscoveredResources([math], [
      discovered({ resourceId: "inactive", status: "paused" }),
      discovered({ resourceId: "unsupported", resourceType: "audio_course" }),
      discovered({ resourceId: "history-video", subjectId: "history" }),
    ]);

    expect(merged?.resources).toEqual(math.resources);
  });
});
