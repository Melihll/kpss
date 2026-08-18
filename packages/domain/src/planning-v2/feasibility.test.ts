import { describe, expect, it } from "vitest";
import {
  buildFoundationWeekGoldenSnapshotV2,
  buildPlanningSnapshotV2,
  checkCurrentPlanFeasibilityV2,
  isCurrentPlanFeasibleV2,
} from "./index";

describe("Planning V2 current-plan feasibility", () => {
  it("accepts the canonical foundation week without changes", () => {
    const snapshot = buildFoundationWeekGoldenSnapshotV2();

    const result = checkCurrentPlanFeasibilityV2(snapshot);

    expect(result.feasible).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.totalRemainingWorkMinutes).toBe(1785);
    expect(result.totalRemainingCapacityMinutes).toBe(1785);
    expect(result.totalOverloadMinutes).toBe(0);
  });

  it("keeps the real 43-minute study deviation feasible", () => {
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

    const result = checkCurrentPlanFeasibilityV2(snapshot);

    expect(result.feasible).toBe(true);
    expect(result.totalRemainingWorkMinutes).toBe(1742);
    expect(result.totalRemainingCapacityMinutes).toBe(1742);
    expect(result.totalOverloadMinutes).toBe(0);

    expect(snapshot.meta.requestedScope).toBe("NO_REPLAN");
  });

  it("does not require plan changes after a capacity increase", () => {
    const snapshot = buildFoundationWeekGoldenSnapshotV2({
      trigger: "CAPACITY_INCREASE",

      capacityDeltaByDate: {
        "2026-08-17": 60,
      },
    });

    const result = checkCurrentPlanFeasibilityV2(snapshot);

    expect(result.feasible).toBe(true);
    expect(result.totalOverloadMinutes).toBe(0);
    expect(result.totalSlackMinutes).toBe(60);
    expect(snapshot.meta.requestedScope).toBe("NO_REPLAN");
  });

  it("keeps a 90/10 partial task feasible when the previous day is complete", () => {
    const snapshot = buildFoundationWeekGoldenSnapshotV2({
      currentDate: "2026-08-18",
      trigger: "STUDY_DEVIATION",

      completedMinutesByTaskId: {
        "task-01": 90,
        "task-02": 50,
        "task-03": 70,
        "task-04": 30,
        "task-05": 10,
      },

      completedTaskIds: [
        "task-01",
        "task-02",
        "task-03",
        "task-04",
      ],

      partiallyCompletedTaskIds: ["task-05"],

      studiedMinutesByDate: {
        "2026-08-17": 240,
        "2026-08-18": 10,
      },
    });

    const result = checkCurrentPlanFeasibilityV2(snapshot);

    const tuesday = result.daily.find(
      (day) => day.date === "2026-08-18",
    );

    expect(tuesday?.scheduledRemainingMinutes).toBe(230);
    expect(tuesday?.remainingCapacityMinutes).toBe(230);
    expect(tuesday?.overloadMinutes).toBe(0);
    expect(result.feasible).toBe(true);
  });

  it("detects the exact overload caused by a capacity decrease", () => {
    const snapshot = buildFoundationWeekGoldenSnapshotV2({
      trigger: "CAPACITY_DECREASE",

      capacityDeltaByDate: {
        "2026-08-18": -90,
      },
    });

    const result = checkCurrentPlanFeasibilityV2(snapshot);

    const tuesday = result.daily.find(
      (day) => day.date === "2026-08-18",
    );

    expect(result.feasible).toBe(false);

    expect(tuesday?.scheduledRemainingMinutes).toBe(240);
    expect(tuesday?.remainingCapacityMinutes).toBe(150);
    expect(tuesday?.overloadMinutes).toBe(90);

    expect(
      result.violations.some(
        (violation) =>
          violation.code === "DAILY_OVERLOAD" &&
          violation.date === "2026-08-18" &&
          violation.excessMinutes === 90,
      ),
    ).toBe(true);
  });

  it("allows unused capacity without treating it as a planning defect", () => {
    const snapshot = buildFoundationWeekGoldenSnapshotV2({
      capacityDeltaByDate: {
        "2026-08-18": 120,
      },
    });

    const result = checkCurrentPlanFeasibilityV2(snapshot);

    const tuesday = result.daily.find(
      (day) => day.date === "2026-08-18",
    );

    expect(tuesday?.slackMinutes).toBe(120);
    expect(result.feasible).toBe(true);
  });

  it("does not treat a 75/75 partial task as completed but counts zero remaining workload", () => {
    const snapshot = buildFoundationWeekGoldenSnapshotV2({
      completedMinutesByTaskId: {
        "task-17": 75,
      },

      partiallyCompletedTaskIds: ["task-17"],
    });

    const result = checkCurrentPlanFeasibilityV2(snapshot);

    const task = snapshot.existingTasks.find(
      (item) => item.taskId === "task-17",
    );

    expect(task?.isCompleted).toBe(false);
    expect(task?.remainingMinutes).toBe(0);
    expect(result.feasible).toBe(true);
  });

  it("detects unfinished work stranded before currentDate", () => {
    const snapshot = buildFoundationWeekGoldenSnapshotV2({
      currentDate: "2026-08-18",
    });

    const result = checkCurrentPlanFeasibilityV2(snapshot);

    expect(result.feasible).toBe(false);

    const violation = result.violations.find(
      (item) => item.code === "PAST_DUE_REMAINING_WORK",
    );

    expect(violation).toBeDefined();
    expect(violation?.taskIds).toEqual([
      "task-01",
      "task-02",
      "task-03",
      "task-04",
    ]);
    expect(violation?.excessMinutes).toBe(240);
  });

  it("rejects a scheduled task without matching day capacity", () => {
    const snapshot = buildPlanningSnapshotV2({
      snapshotId: "missing-capacity",
      generatedAt: "2026-08-18T18:00:00+03:00",
      currentDate: "2026-08-18",
      weekStart: "2026-08-18",
      weekEnd: "2026-08-19",

      trigger: "STUDY_DEVIATION",

      versions: {
        plannerVersion: "planning-v2-dev",
        scoringVersion: "scoring-v1-dev",
        learnerStateVersion: "learner-state-v1-dev",
        snapshotSchemaVersion: "snapshot-v1",
      },

      userId: "user-1",
      examProfileId: "profile-1",
      examDate: "2027-09-01",

      availableMinutes: 120,
      planningBudgetMinutes: 120,
      reserveMinutes: 0,

      dailyCapacities: [
        {
          date: "2026-08-18",
          grossCapacityMinutes: 60,
          reserveMinutes: 0,
          alreadyStudiedMinutes: 0,
        },
      ],

      existingTasks: [
        {
          taskId: "task-1",
          userId: "user-1",
          examProfileId: "profile-1",
          weeklyPlanId: "week-1",

          curriculumUnitId: "unit-1",
          subjectId: "math",
          resourceId: null,

          title: "Missing capacity task",
          taskType: "study",
          lifecycleStatus: "ready",

          plannedDate: "2026-08-19",

          estimatedMinutes: 60,
          completedMinutes: 0,

          isCompleted: false,
          isActive: false,
          isPartiallyCompleted: false,
        },
      ],
    });

    const result = checkCurrentPlanFeasibilityV2(snapshot);

    expect(result.feasible).toBe(false);

    expect(
      result.violations.some(
        (violation) =>
          violation.code === "MISSING_DAY_CAPACITY",
      ),
    ).toBe(true);
  });

  it("provides a boolean convenience guard", () => {
    const snapshot = buildFoundationWeekGoldenSnapshotV2();

    expect(isCurrentPlanFeasibleV2(snapshot)).toBe(true);
  });
});

