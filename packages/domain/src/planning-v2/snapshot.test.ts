import { describe, expect, it } from "vitest";
import {
  buildPlanningSnapshotV2,
  remainingTaskMinutesV2,
} from "./index";

const versions = {
  plannerVersion: "planning-v2-dev",
  scoringVersion: "scoring-v1-dev",
  learnerStateVersion: "learner-state-v1-dev",
  snapshotSchemaVersion: "snapshot-v1",
} as const;

function baseInput() {
  return {
    snapshotId: "snapshot-test-1",
    generatedAt: "2026-08-18T12:00:00+03:00",
    currentDate: "2026-08-18",
    weekStart: "2026-08-17",
    weekEnd: "2026-08-23",

    trigger: "STUDY_DEVIATION" as const,
    versions,

    userId: "user-1",
    examProfileId: "profile-1",
    examDate: "2027-09-01",

    availableMinutes: 1800,
    planningBudgetMinutes: 1785,
    reserveMinutes: 15,

    dailyCapacities: [
      {
        date: "2026-08-17",
        grossCapacityMinutes: 240,
        reserveMinutes: 0,
        alreadyStudiedMinutes: 240,
      },
      {
        date: "2026-08-18",
        grossCapacityMinutes: 240,
        reserveMinutes: 0,
        alreadyStudiedMinutes: 10,
      },
    ],

    existingTasks: [],
  };
}

describe("PlanningSnapshotV2", () => {
  it("calculates remaining workload without changing lifecycle semantics", () => {
    expect(remainingTaskMinutesV2(90, 10)).toBe(80);
    expect(remainingTaskMinutesV2(65, 49)).toBe(16);
    expect(remainingTaskMinutesV2(75, 75)).toBe(0);
    expect(remainingTaskMinutesV2(75, 90)).toBe(0);
  });

  it("builds remaining day capacity from planning capacity minus studied time", () => {
    const snapshot = buildPlanningSnapshotV2(baseInput());

    expect(snapshot.dailyCapacities[0]?.remainingCapacityMinutes).toBe(0);
    expect(snapshot.dailyCapacities[1]?.remainingCapacityMinutes).toBe(230);
  });

  it("keeps a 75/75 partial task partial rather than inferring completion", () => {
    const snapshot = buildPlanningSnapshotV2({
      ...baseInput(),
      existingTasks: [
        {
          taskId: "task-partial",
          userId: "user-1",
          examProfileId: "profile-1",
          weeklyPlanId: "week-1",
          curriculumUnitId: "unit-1",
          subjectId: "subject-1",
          resourceId: "resource-1",
          title: "Partial task",
          taskType: "study",
          lifecycleStatus: "partially_completed",
          plannedDate: "2026-08-18",
          estimatedMinutes: 75,
          completedMinutes: 75,
          isCompleted: false,
          isActive: false,
          isPartiallyCompleted: true,
        },
      ],
    });

    const task = snapshot.existingTasks[0];

    expect(task?.remainingMinutes).toBe(0);
    expect(task?.lifecycleStatus).toBe("partially_completed");
    expect(task?.isPartiallyCompleted).toBe(true);
    expect(task?.isCompleted).toBe(false);
    expect(snapshot.completedTaskIds).toEqual([]);
  });

  it("derives active and completed ids only from explicit lifecycle flags", () => {
    const snapshot = buildPlanningSnapshotV2({
      ...baseInput(),
      existingTasks: [
        {
          taskId: "active",
          userId: "user-1",
          examProfileId: "profile-1",
          weeklyPlanId: "week-1",
          curriculumUnitId: null,
          subjectId: null,
          resourceId: null,
          title: "Active",
          taskType: "study",
          lifecycleStatus: "in_progress",
          plannedDate: "2026-08-18",
          estimatedMinutes: 90,
          completedMinutes: 10,
          isCompleted: false,
          isActive: true,
          isPartiallyCompleted: true,
        },
        {
          taskId: "completed",
          userId: "user-1",
          examProfileId: "profile-1",
          weeklyPlanId: "week-1",
          curriculumUnitId: null,
          subjectId: null,
          resourceId: null,
          title: "Completed",
          taskType: "study",
          lifecycleStatus: "completed",
          plannedDate: "2026-08-17",
          estimatedMinutes: 50,
          completedMinutes: 35,
          isCompleted: true,
          isActive: false,
          isPartiallyCompleted: false,
        },
      ],
    });

    expect(snapshot.activeTaskIds).toEqual(["active"]);
    expect(snapshot.completedTaskIds).toEqual(["completed"]);
  });

  it("defaults study deviation to NO_REPLAN", () => {
    const snapshot = buildPlanningSnapshotV2(baseInput());

    expect(snapshot.meta.requestedScope).toBe("NO_REPLAN");
  });

  it("is deeply frozen after construction", () => {
    const snapshot = buildPlanningSnapshotV2({
      ...baseInput(),
      existingTasks: [
        {
          taskId: "task-1",
          userId: "user-1",
          examProfileId: "profile-1",
          weeklyPlanId: "week-1",
          curriculumUnitId: null,
          subjectId: null,
          resourceId: null,
          resourceUnitIds: ["unit-a"],
          title: "Task",
          taskType: "study",
          lifecycleStatus: "ready",
          plannedDate: "2026-08-18",
          estimatedMinutes: 50,
          completedMinutes: 0,
          isCompleted: false,
          isActive: false,
          isPartiallyCompleted: false,
        },
      ],
    });

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.meta)).toBe(true);
    expect(Object.isFrozen(snapshot.dailyCapacities)).toBe(true);
    expect(Object.isFrozen(snapshot.existingTasks)).toBe(true);
    expect(Object.isFrozen(snapshot.existingTasks[0])).toBe(true);
    expect(Object.isFrozen(snapshot.existingTasks[0]?.resourceUnitIds)).toBe(true);
  });

  it("rejects duplicate task ids", () => {
    const task = {
      taskId: "duplicate",
      userId: "user-1",
      examProfileId: "profile-1",
      weeklyPlanId: "week-1",
      curriculumUnitId: null,
      subjectId: null,
      resourceId: null,
      title: "Duplicate",
      taskType: "study",
      lifecycleStatus: "ready",
      plannedDate: "2026-08-18",
      estimatedMinutes: 50,
      completedMinutes: 0,
      isCompleted: false,
      isActive: false,
      isPartiallyCompleted: false,
    } as const;

    expect(() =>
      buildPlanningSnapshotV2({
        ...baseInput(),
        existingTasks: [task, task],
      }),
    ).toThrow(/duplicate task id/);
  });

  it("rejects cross-user task contamination", () => {
    expect(() =>
      buildPlanningSnapshotV2({
        ...baseInput(),
        existingTasks: [
          {
            taskId: "foreign-task",
            userId: "another-user",
            examProfileId: "profile-1",
            weeklyPlanId: "week-1",
            curriculumUnitId: null,
            subjectId: null,
            resourceId: null,
            title: "Foreign",
            taskType: "study",
            lifecycleStatus: "ready",
            plannedDate: "2026-08-18",
            estimatedMinutes: 50,
            completedMinutes: 0,
            isCompleted: false,
            isActive: false,
            isPartiallyCompleted: false,
          },
        ],
      }),
    ).toThrow(/ownership mismatch/);
  });
});
