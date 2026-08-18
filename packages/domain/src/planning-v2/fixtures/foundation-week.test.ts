import { describe, expect, it } from "vitest";
import {
  FOUNDATION_WEEK_V2,
  buildFoundationWeekGoldenSnapshotV2,
  goldenTasksForDateV2,
} from "./foundation-week";

describe("Planning V2 foundation-week golden fixture", () => {
  it("matches the canonical 30-task / 1785-minute week", () => {
    const snapshot = buildFoundationWeekGoldenSnapshotV2();

    expect(snapshot.existingTasks).toHaveLength(30);

    const nominalMinutes = snapshot.existingTasks.reduce(
      (sum, task) => sum + task.estimatedMinutes,
      0,
    );

    expect(nominalMinutes).toBe(1785);
    expect(snapshot.availableMinutes).toBe(1800);
    expect(snapshot.planningBudgetMinutes).toBe(1785);
    expect(snapshot.reserveMinutes).toBe(15);
  });

  it("matches the exact canonical daily task counts and minutes", () => {
    const snapshot = buildFoundationWeekGoldenSnapshotV2();

    const expected = [
      ["2026-08-17", 4, 240],
      ["2026-08-18", 4, 240],
      ["2026-08-19", 4, 240],
      ["2026-08-20", 4, 240],
      ["2026-08-21", 4, 240],
      ["2026-08-22", 5, 300],
      ["2026-08-23", 5, 285],
    ] as const;

    for (const [date, count, minutes] of expected) {
      const tasks = goldenTasksForDateV2(snapshot, date);

      expect(tasks).toHaveLength(count);

      expect(
        tasks.reduce(
          (sum, task) => sum + task.estimatedMinutes,
          0,
        ),
      ).toBe(minutes);
    }
  });

  it("represents 1800 gross minutes with 1785 planning capacity", () => {
    const snapshot = buildFoundationWeekGoldenSnapshotV2();

    const gross = snapshot.dailyCapacities.reduce(
      (sum, day) => sum + day.grossCapacityMinutes,
      0,
    );

    const planning = snapshot.dailyCapacities.reduce(
      (sum, day) => sum + day.planningCapacityMinutes,
      0,
    );

    expect(gross).toBe(1800);
    expect(planning).toBe(1785);

    const sunday = snapshot.dailyCapacities.find(
      (day) => day.date === "2026-08-23",
    );

    expect(sunday?.grossCapacityMinutes).toBe(300);
    expect(sunday?.reserveMinutes).toBe(15);
    expect(sunday?.planningCapacityMinutes).toBe(285);
  });

  it("reproduces the 43-minute study-deviation state", () => {
    const snapshot = buildFoundationWeekGoldenSnapshotV2({
      trigger: "STUDY_DEVIATION",

      completedMinutesByTaskId: {
        "task-01": 43,
      },

      partiallyCompletedTaskIds: ["task-01"],

      studiedMinutesByDate: {
        "2026-08-17": 43,
      },
    });

    const task = snapshot.existingTasks.find(
      (item) => item.taskId === "task-01",
    );

    const monday = snapshot.dailyCapacities.find(
      (day) => day.date === "2026-08-17",
    );

    expect(task?.estimatedMinutes).toBe(90);
    expect(task?.completedMinutes).toBe(43);
    expect(task?.remainingMinutes).toBe(47);
    expect(task?.lifecycleStatus).toBe("partially_completed");

    expect(monday?.remainingCapacityMinutes).toBe(197);

    const mondayRemainingWork = goldenTasksForDateV2(
      snapshot,
      "2026-08-17",
    ).reduce(
      (sum, item) => sum + item.remainingMinutes,
      0,
    );

    expect(mondayRemainingWork).toBe(197);

    const wholeWeekRemaining = snapshot.existingTasks.reduce(
      (sum, item) => sum + item.remainingMinutes,
      0,
    );

    expect(wholeWeekRemaining).toBe(1742);
    expect(snapshot.meta.requestedScope).toBe("NO_REPLAN");
  });

  it("represents a partial 90/10 task as 80 minutes remaining", () => {
    const snapshot = buildFoundationWeekGoldenSnapshotV2({
      currentDate: "2026-08-18",
      trigger: "STUDY_DEVIATION",

      completedMinutesByTaskId: {
        "task-05": 10,
      },

      partiallyCompletedTaskIds: ["task-05"],

      studiedMinutesByDate: {
        "2026-08-18": 10,
      },
    });

    const task = snapshot.existingTasks.find(
      (item) => item.taskId === "task-05",
    );

    expect(task?.estimatedMinutes).toBe(90);
    expect(task?.completedMinutes).toBe(10);
    expect(task?.remainingMinutes).toBe(80);
    expect(task?.isPartiallyCompleted).toBe(true);
    expect(task?.isCompleted).toBe(false);
  });

  it("preserves 75/75 partial lifecycle semantics", () => {
    const snapshot = buildFoundationWeekGoldenSnapshotV2({
      completedMinutesByTaskId: {
        "task-17": 75,
      },

      partiallyCompletedTaskIds: ["task-17"],
    });

    const task = snapshot.existingTasks.find(
      (item) => item.taskId === "task-17",
    );

    expect(task?.remainingMinutes).toBe(0);
    expect(task?.lifecycleStatus).toBe("partially_completed");
    expect(task?.isPartiallyCompleted).toBe(true);
    expect(task?.isCompleted).toBe(false);
    expect(snapshot.completedTaskIds).not.toContain("task-17");
  });

  it("marks active work explicitly and does not infer it from progress", () => {
    const snapshot = buildFoundationWeekGoldenSnapshotV2({
      currentDate: "2026-08-18",

      completedMinutesByTaskId: {
        "task-05": 10,
      },

      activeTaskIds: ["task-05"],
    });

    const task = snapshot.existingTasks.find(
      (item) => item.taskId === "task-05",
    );

    expect(task?.isActive).toBe(true);
    expect(task?.lifecycleStatus).toBe("in_progress");
    expect(snapshot.activeTaskIds).toEqual(["task-05"]);
  });

  it("represents a +60 capacity event without increasing the planning budget", () => {
    const snapshot = buildFoundationWeekGoldenSnapshotV2({
      trigger: "CAPACITY_INCREASE",

      capacityDeltaByDate: {
        "2026-08-17": 60,
      },
    });

    const monday = snapshot.dailyCapacities.find(
      (day) => day.date === "2026-08-17",
    );

    expect(monday?.grossCapacityMinutes).toBe(300);
    expect(snapshot.availableMinutes).toBe(1860);

    expect(snapshot.planningBudgetMinutes).toBe(
      FOUNDATION_WEEK_V2.planningBudgetMinutes,
    );

    expect(snapshot.meta.requestedScope).toBe("NO_REPLAN");
  });
});
