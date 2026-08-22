import { describe, expect, it } from "vitest";
import { buildDailyPlanProjection, findDailyCapacityOverloads } from "./daily";

const TODAY = "2026-08-16";
const task = (id: string, overrides: Partial<{ plannedDate: string | null; status: string; remainingMinutes: number }> = {}) => ({
  id,
  plannedDate: TODAY,
  status: "ready",
  remainingMinutes: 60,
  ...overrides,
});

describe("buildDailyPlanProjection", () => {
  it("caps the reported 23h30 workload at a 3 hour daily capacity", () => {
    const result = buildDailyPlanProjection({
      date: TODAY,
      capacityMinutes: 180,
      completedStudyMinutes: 0,
      tasks: [...Array.from({ length: 23 }, (_, index) => task(String(index))), task("last", { remainingMinutes: 30 })],
    });
    expect(result.scheduledOpenMinutes).toBe(180);
    expect(result.openItems).toHaveLength(3);
    expect(result.deferredTaskIds).toHaveLength(21);
    expect(result.deferredMinutes).toBe(1_230);
  });

  it("preserves completed study and limits open work to remaining capacity", () => {
    const result = buildDailyPlanProjection({
      date: TODAY,
      capacityMinutes: 180,
      completedStudyMinutes: 60,
      tasks: [task("done", { status: "completed", remainingMinutes: 0 }), task("one", { remainingMinutes: 90 }), task("two", { remainingMinutes: 90 })],
    });
    expect(result.completedTaskIds).toEqual(["done"]);
    expect(result.openItems.some((item) => item.taskId === "done")).toBe(false);
    expect(result.completedStudyMinutes).toBe(60);
    expect(result.scheduledOpenMinutes).toBe(120);
    expect(result.totalCommittedMinutes).toBe(180);
  });

  it("does not let voluntary extra study displace approved planned work", () => {
    const result = buildDailyPlanProjection({
      date: TODAY,
      capacityMinutes: 180,
      completedStudyMinutes: 0,
      plannedCreditMinutes: 0,
      actualStudyMinutes: 40,
      extraStudyMinutes: 40,
      tasks: [task("turkish"), task("geography"), task("law")],
    });
    expect(result.remainingCapacityMinutes).toBe(180);
    expect(result.scheduledOpenMinutes).toBe(180);
    expect(result.actualStudyMinutes).toBe(40);
    expect(result.extraStudyMinutes).toBe(40);
    expect(result.totalActualMinutes).toBe(40);
    expect(result.deferredTaskIds).toEqual([]);
  });

  it("returns no open workload at zero capacity", () => {
    const result = buildDailyPlanProjection({ date: TODAY, capacityMinutes: 0, completedStudyMinutes: 0, tasks: [task("open")] });
    expect(result.openItems).toEqual([]);
    expect(result.scheduledOpenMinutes).toBe(0);
    expect(result.deferredTaskIds).toEqual(["open"]);
    expect(result.deferredMinutes).toBe(60);
  });

  it("excludes future and unscheduled backlog tasks from Today", () => {
    const result = buildDailyPlanProjection({
      date: TODAY,
      capacityMinutes: 180,
      completedStudyMinutes: 0,
      tasks: [task("future", { plannedDate: "2026-08-17" }), task("backlog", { plannedDate: null })],
    });
    expect(result.openItems).toEqual([]);
    expect(result.scheduledOpenMinutes).toBe(0);
    expect(result.deferredTaskIds).toEqual([]);
    expect(result.deferredMinutes).toBe(0);
  });

  it("detects daily overload even when the weekly total fits", () => {
    expect(findDailyCapacityOverloads([
      { plannedDate: TODAY, estimatedMinutes: 180 },
      { plannedDate: TODAY, estimatedMinutes: 60 },
    ], { [TODAY]: 180, "2026-08-17": 180 })).toEqual([
      { date: TODAY, plannedMinutes: 240, capacityMinutes: 180 },
    ]);
  });
});
