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
