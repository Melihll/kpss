import { describe, expect, it } from "vitest";
// Exercise the checked-in module that app-api and telegram-webhook deploy.
// @ts-expect-error the generated edge bundle intentionally has no declaration file.
import { replanWeeklyPlanV1 } from "../supabase/functions/_shared/planning.bundle.js";

describe("deployed planning bundle study-deviation stability", () => {
  it("leaves future dates unchanged when an early completion frees capacity", () => {
    const task = (id: string, plannedDate: string, estimatedMinutes: number, status = "ready") => ({
      id,
      subjectId: "subject",
      curriculumNodeId: "topic",
      title: id,
      plannedDate,
      estimatedMinutes,
      completedMinutes: 0,
      importance: "important",
      priorityScore: 50,
      status,
      createdAt: `2026-08-17T00:00:0${id.length}Z`,
      postponementCount: 0,
    });
    const result = replanWeeklyPlanV1({
      profileId: "profile",
      planId: "plan",
      weekStart: "2026-08-17",
      weekEnd: "2026-08-23",
      currentDate: "2026-08-17",
      planningBudgetMinutes: 150,
      dailyCapacities: { "2026-08-17": 120, "2026-08-18": 120 },
      actualMinutesByDate: { "2026-08-17": 70 },
      plannedConsumedMinutesByDate: { "2026-08-17": 90 },
      tasks: [task("done", "2026-08-17", 90, "completed"), task("future", "2026-08-18", 60)],
      revisions: [],
      trigger: "study_deviation",
    });

    expect(result.tasksToMove).toEqual([]);
    expect(result.tasksToBacklog).toEqual([]);
    expect(result.changedTaskCount).toBe(0);
    expect(result.tasksToKeep).toContain("future");
  });
});
