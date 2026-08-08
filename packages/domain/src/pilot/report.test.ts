import { describe, expect, it } from "vitest";
import { interpretWeeklyReport } from "./report";

describe("weekly report interpretation", () => {
  it("marks balanced execution as good", () => {
    const report = interpretWeeklyReport({
      plannedMinutes: 600, actualMinutes: 540, plannedTaskCount: 10, completedTaskCount: 9,
      backlogSeverity: "normal", projectionStatus: "ON_TRACK",
    });
    expect(report.status).toBe("good");
    expect(report.explanation).toContain("%90");
  });

  it("does not turn one bad signal into risk", () => {
    expect(interpretWeeklyReport({
      plannedMinutes: 600, actualMinutes: 600, plannedTaskCount: 10, completedTaskCount: 10,
      backlogSeverity: "risk", projectionStatus: "ON_TRACK",
    }).status).toBe("attention");
  });

  it("marks multiple material signals as risk", () => {
    expect(interpretWeeklyReport({
      plannedMinutes: 600, actualMinutes: 250, plannedTaskCount: 10, completedTaskCount: 4,
      backlogSeverity: "normal", projectionStatus: "ON_TRACK",
    }).status).toBe("risk");
  });
});
