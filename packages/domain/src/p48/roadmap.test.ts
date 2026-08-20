import { describe, expect, it } from "vitest";
import { buildP48Months, buildP48WeekBlocks, forecastP48Resources } from "./roadmap";

const subjects = [
  { subjectId: "law", subjectName: "Hukuk", weeklyMinutes: 360 },
  { subjectId: "econ", subjectName: "İktisat", weeklyMinutes: 300 },
];

describe("P48 long-range roadmap", () => {
  it("leaves exam weeks empty and reduces the monthly target", () => {
    const months = buildP48Months({
      asOfDate: "2027-01-01",
      targetExamDate: "2027-03-06",
      monthlyTargetMinutes: 7200,
      periods: [{ name: "Final", periodType: "final", startDate: "2027-01-04", endDate: "2027-01-17", capacityMultiplier: 0 }],
    });
    expect(months[0]!.blockedDays).toBe(14);
    expect(months[0]!.plannedMinutes).toBeLessThan(7200);
    expect(months[1]!.plannedMinutes).toBe(7200);
  });

  it("forecasts a new-resource window when owned resources finish before the exam", () => {
    const forecast = forecastP48Resources({
      asOfDate: "2026-08-17",
      targetExamDate: "2027-09-06",
      subjects: [subjects[0]!],
      periods: [],
      resources: [{ resourceId: "r1", subjectId: "law", subjectName: "Hukuk", resourceName: "Kitap", plannedMinutes: 1200, actualMinutes: 0, sequenceOrder: 1, workMode: "book" }],
    });
    expect(forecast[0]!.resources[0]!.forecastFinishDate).toBeTruthy();
    expect(forecast[0]!.newSourceDate).toBeTruthy();
    expect(forecast[0]!.newSourceDate! < "2027-09-06").toBe(true);
  });

  it("builds a week within the available daily capacity", () => {
    const blocks = buildP48WeekBlocks({
      weekStart: "2026-08-17",
      currentDate: "2026-08-17",
      weeklyTargetMinutes: 660,
      dayCapacities: {
        "2026-08-17": 240,
        "2026-08-18": 240,
        "2026-08-19": 180,
      },
      subjects,
      resources: [
        { resourceId: "r1", resourceName: "Hukuk Kitabı", subjectId: "law", subjectName: "Hukuk", workMode: "book", remainingMinutes: 600, sequenceOrder: 1 },
        { resourceId: "r2", resourceName: "İktisat Kitabı", subjectId: "econ", subjectName: "İktisat", workMode: "book", remainingMinutes: 600, sequenceOrder: 1 },
      ],
    });
    const byDate = new Map<string, number>();
    for (const block of blocks) byDate.set(block.plannedDate, (byDate.get(block.plannedDate) ?? 0) + block.estimatedMinutes);
    expect([...byDate.entries()].every(([date, minutes]) => minutes <= (({ "2026-08-17": 240, "2026-08-18": 240, "2026-08-19": 180 } as Record<string, number>)[date] ?? 0))).toBe(true);
    expect(blocks.reduce((sum, block) => sum + block.estimatedMinutes, 0)).toBe(660);
  });
});
describe("P2-08 material-aware resource finish projection", () => {
  const baseInput = {
    asOfDate: "2026-08-17",
    targetExamDate: "2027-09-06",
    subjects: [
      { subjectId: "law", subjectName: "Hukuk", weeklyMinutes: 300 },
    ],
    periods: [],
  };

  it("uses real material remaining workload for the finish date", () => {
    const legacy = forecastP48Resources({
      ...baseInput,
      resources: [{
        resourceId: "legacy",
        subjectId: "law",
        subjectName: "Hukuk",
        resourceName: "Legacy",
        plannedMinutes: 1200,
        actualMinutes: 0,
        sequenceOrder: 1,
        workMode: "book",
      }],
    });

    const materialAware = forecastP48Resources({
      ...baseInput,
      resources: [{
        resourceId: "material",
        subjectId: "law",
        subjectName: "Hukuk",
        resourceName: "Material",
        plannedMinutes: 1200,
        actualMinutes: 0,
        materialRemainingMinutes: 300,
        sequenceOrder: 1,
        workMode: "book",
      }],
    });

    expect(materialAware[0]!.resources[0]!.forecastFinishDate).toBe("2026-08-23");
    expect(
      materialAware[0]!.resources[0]!.forecastFinishDate!
      < legacy[0]!.resources[0]!.forecastFinishDate!,
    ).toBe(true);
  });

  it("preserves the legacy session-minute fallback when material progress is absent", () => {
    const forecast = forecastP48Resources({
      ...baseInput,
      resources: [{
        resourceId: "fallback",
        subjectId: "law",
        subjectName: "Hukuk",
        resourceName: "Fallback",
        plannedMinutes: 600,
        actualMinutes: 300,
        materialRemainingMinutes: null,
        sequenceOrder: 1,
        workMode: "book",
      }],
    });

    expect(forecast[0]!.resources[0]!.forecastFinishDate).toBe("2026-08-23");
  });

  it("treats zero material workload as complete even without session minutes", () => {
    const forecast = forecastP48Resources({
      ...baseInput,
      resources: [{
        resourceId: "done",
        subjectId: "law",
        subjectName: "Hukuk",
        resourceName: "Done",
        plannedMinutes: 1200,
        actualMinutes: 0,
        materialRemainingMinutes: 0,
        sequenceOrder: 1,
        workMode: "book",
      }],
    });

    const resource = forecast[0]!.resources[0]!;
    expect(resource.completed).toBe(true);
    expect(resource.remainingMinutes).toBe(0);
    expect(resource.progressPercent).toBe(100);
    expect(resource.forecastFinishDate).toBe("2026-08-17");
  });

  it("does not let legacy session minutes hide unfinished real material progress", () => {
    const forecast = forecastP48Resources({
      ...baseInput,
      resources: [{
        resourceId: "unfinished",
        subjectId: "law",
        subjectName: "Hukuk",
        resourceName: "Unfinished",
        plannedMinutes: 300,
        actualMinutes: 300,
        materialRemainingMinutes: 300,
        sequenceOrder: 1,
        workMode: "book",
      }],
    });

    const resource = forecast[0]!.resources[0]!;
    expect(resource.completed).toBe(false);
    expect(resource.remainingMinutes).toBe(0);
    expect(resource.forecastFinishDate).toBe("2026-08-23");
  });
});