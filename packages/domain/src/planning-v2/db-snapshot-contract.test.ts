import {
  describe,
  expect,
  it,
} from "vitest";

import {
  mergePlanningTaskProgressV1,
  normalizePlanningSnapshotDbBundleV1,
  type PlanningSnapshotDbBundleV1,
  type PlanningTaskDbRowV1,
} from "./index";

function task(
  overrides:
    Partial<PlanningTaskDbRowV1> = {},
): PlanningTaskDbRowV1 {
  return {
    id: "task-1",

    user_id: "user-1",
    exam_profile_id: "profile-1",
    weekly_plan_id: "plan-1",

    subject_id: "math",
    curriculum_node_id: "math-1",

    resource_id: "resource-1",
    resource_section_id: null,

    task_type: "solve_resource_units",
    title: "Matematik I",

    planned_date: "2026-08-18",

    estimated_minutes: 90,

    status: "ready",
    completed_at: null,

    ...overrides,
  };
}

function bundle(
  overrides:
    Partial<PlanningSnapshotDbBundleV1> = {},
): PlanningSnapshotDbBundleV1 {
  return {
    weeklyPlan: {
      id: "plan-1",

      user_id: "user-1",
      exam_profile_id: "profile-1",

      week_start_date: "2026-08-17",
      week_end_date: "2026-08-23",

      available_minutes: 1800,
      planning_budget_minutes: 1785,
      planned_minutes: 1785,

      status: "active",
      generation_version: 3,
    },

    tasks: [
      task(),
    ],

    taskProgress: [
      {
        task_id: "task-1",
        user_id: "user-1",
        completed_minutes: 43,
      },
    ],

    learnerStates: [],

    dailyCapacities: [
      {
        date: "2026-08-17",
        grossCapacityMinutes: 240,
        reserveMinutes: 0,
        alreadyStudiedMinutes: 0,
      },
      {
        date: "2026-08-18",
        grossCapacityMinutes: 240,
        reserveMinutes: 0,
        alreadyStudiedMinutes: 43,
      },
    ],

    ...overrides,
  };
}

describe(
  "Planning V2 DB snapshot contract",
  () => {
    it("merges task progress into remaining work", () => {
      const result =
        mergePlanningTaskProgressV1(
          task(),
          {
            task_id: "task-1",
            user_id: "user-1",
            completed_minutes: 43,
          },
        );

      expect(
        result.estimatedMinutes,
      ).toBe(90);

      expect(
        result.completedMinutes,
      ).toBe(43);

      expect(
        result.remainingMinutes,
      ).toBe(47);
    });

    it("does not infer lifecycle completion from minutes", () => {
      const result =
        mergePlanningTaskProgressV1(
          task({
            status:
              "partially_completed",
          }),
          {
            task_id: "task-1",
            user_id: "user-1",
            completed_minutes: 90,
          },
        );

      expect(
        result.remainingMinutes,
      ).toBe(0);

      expect(
        result.isCompleted,
      ).toBe(false);

      expect(
        result.isPartiallyCompleted,
      ).toBe(true);
    });

    it("treats completed lifecycle explicitly", () => {
      const result =
        mergePlanningTaskProgressV1(
          task({
            status: "completed",
            completed_at:
              "2026-08-18T15:00:00+03:00",
          }),
          {
            task_id: "task-1",
            user_id: "user-1",
            completed_minutes: 90,
          },
        );

      expect(
        result.isCompleted,
      ).toBe(true);

      expect(
        result.isActive,
      ).toBe(false);
    });

    it("treats in-progress lifecycle explicitly", () => {
      const result =
        mergePlanningTaskProgressV1(
          task({
            status:
              "in_progress",
          }),
          {
            task_id: "task-1",
            user_id: "user-1",
            completed_minutes: 10,
          },
        );

      expect(
        result.isActive,
      ).toBe(true);

      expect(
        result.isPartiallyCompleted,
      ).toBe(false);
    });

    it("normalizes a consistent DB bundle deterministically", () => {
      const first =
        normalizePlanningSnapshotDbBundleV1(
          bundle(),
        );

      const second =
        normalizePlanningSnapshotDbBundleV1(
          bundle(),
        );

      expect(first).toEqual(second);

      expect(
        first.totalRemainingMinutes,
      ).toBe(47);
    });

    it("rejects task ownership mismatch", () => {
      expect(() =>
        normalizePlanningSnapshotDbBundleV1(
          bundle({
            tasks: [
              task({
                user_id:
                  "another-user",
              }),
            ],
          }),
        ),
      ).toThrow(
        /ownership mismatch/,
      );
    });

    it("rejects orphan progress rows", () => {
      expect(() =>
        normalizePlanningSnapshotDbBundleV1(
          bundle({
            taskProgress: [
              {
                task_id:
                  "missing-task",

                user_id:
                  "user-1",

                completed_minutes: 10,
              },
            ],
          }),
        ),
      ).toThrow(
        /orphan task progress/,
      );
    });

    it("rejects duplicate daily capacity rows", () => {
      expect(() =>
        normalizePlanningSnapshotDbBundleV1(
          bundle({
            dailyCapacities: [
              {
                date:
                  "2026-08-18",

                grossCapacityMinutes: 240,
                reserveMinutes: 0,
                alreadyStudiedMinutes: 0,
              },
              {
                date:
                  "2026-08-18",

                grossCapacityMinutes: 240,
                reserveMinutes: 0,
                alreadyStudiedMinutes: 0,
              },
            ],
          }),
        ),
      ).toThrow(
        /duplicate daily capacity/,
      );
    });

    it("rejects progress from another user", () => {
      expect(() =>
        mergePlanningTaskProgressV1(
          task(),
          {
            task_id:
              "task-1",

            user_id:
              "another-user",

            completed_minutes: 10,
          },
        ),
      ).toThrow(
        /progress ownership mismatch/,
      );
    });
  },
);
