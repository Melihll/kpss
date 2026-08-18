import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildPlanningSnapshotFromDbBundleV1,
  type PlanningSnapshotDbBundleV1,
  type PlanningTaskDbRowV1,
} from "./index";

function capacities(
  mondayDelta = 0,
) {
  return [
    {
      date: "2026-08-17" as const,
      grossCapacityMinutes:
        240 + mondayDelta,
      reserveMinutes: 0,
      alreadyStudiedMinutes: 0,
    },
    {
      date: "2026-08-18" as const,
      grossCapacityMinutes: 240,
      reserveMinutes: 0,
      alreadyStudiedMinutes: 0,
    },
    {
      date: "2026-08-19" as const,
      grossCapacityMinutes: 240,
      reserveMinutes: 0,
      alreadyStudiedMinutes: 0,
    },
    {
      date: "2026-08-20" as const,
      grossCapacityMinutes: 240,
      reserveMinutes: 0,
      alreadyStudiedMinutes: 0,
    },
    {
      date: "2026-08-21" as const,
      grossCapacityMinutes: 240,
      reserveMinutes: 0,
      alreadyStudiedMinutes: 0,
    },
    {
      date: "2026-08-22" as const,
      grossCapacityMinutes: 300,
      reserveMinutes: 0,
      alreadyStudiedMinutes: 0,
    },
    {
      date: "2026-08-23" as const,
      grossCapacityMinutes: 300,
      reserveMinutes: 15,
      alreadyStudiedMinutes: 0,
    },
  ];
}

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

    task_type:
      "solve_resource_units",

    title: "Matematik I",

    planned_date: "2026-08-18",

    estimated_minutes: 90,

    priority_score: 60,
    importance: "important",

    status: "ready",
    completed_at: null,

    ...overrides,
  };
}

function bundle(
  options: {
    readonly mondayCapacityDelta?: number;
    readonly task?: PlanningTaskDbRowV1;
    readonly completedMinutes?: number;
  } = {},
): PlanningSnapshotDbBundleV1 {
  return {
    weeklyPlan: {
      id: "plan-1",

      user_id: "user-1",
      exam_profile_id: "profile-1",

      week_start_date:
        "2026-08-17",

      week_end_date:
        "2026-08-23",

      available_minutes: 1800,

      planning_budget_minutes:
        1785,

      planned_minutes: 1785,

      status: "active",

      generation_version: 3,
    },

    tasks: [
      options.task ?? task(),
    ],

    taskProgress: [
      {
        task_id:
          options.task?.id ??
          "task-1",

        user_id: "user-1",

        completed_minutes:
          options.completedMinutes ??
          43,
      },
    ],

    learnerStates: [],

    dailyCapacities:
      capacities(
        options.mondayCapacityDelta ??
          0,
      ),
  };
}

const versions = {
  plannerVersion:
    "planner-v2",

  scoringVersion:
    "scoring-v1",

  learnerStateVersion:
    "learner-state-v1",

  snapshotSchemaVersion:
    "snapshot-v2",
} as const;

function build(
  dbBundle:
    PlanningSnapshotDbBundleV1,
  trigger:
    | "STUDY_DEVIATION"
    | "CAPACITY_INCREASE"
    | "CAPACITY_DECREASE" =
      "STUDY_DEVIATION",
) {
  return buildPlanningSnapshotFromDbBundleV1({
    bundle:
      dbBundle,

    snapshotId:
      `snapshot-${trigger}`,

    generatedAt:
      "2026-08-18T19:00:00+03:00",

    currentDate:
      "2026-08-18",

    trigger,

    versions,

    examDate:
      "2027-09-06",
  });
}

describe(
  "Planning V2 DB snapshot builder",
  () => {
    it("builds a real PlanningSnapshotV2 from normalized DB state", () => {
      const snapshot =
        build(bundle());

      expect(
        snapshot.userId,
      ).toBe("user-1");

      expect(
        snapshot.examProfileId,
      ).toBe("profile-1");

      expect(
        snapshot.meta.weekStart,
      ).toBe("2026-08-17");

      expect(
        snapshot.meta.weekEnd,
      ).toBe("2026-08-23");

      expect(
        snapshot.availableMinutes,
      ).toBe(1800);

      expect(
        snapshot.planningBudgetMinutes,
      ).toBe(1785);

      expect(
        snapshot.reserveMinutes,
      ).toBe(15);
    });

    it("preserves remaining task work", () => {
      const snapshot =
        build(bundle());

      const mapped =
        snapshot.existingTasks[0];

      expect(
        mapped?.estimatedMinutes,
      ).toBe(90);

      expect(
        mapped?.completedMinutes,
      ).toBe(43);

      expect(
        mapped?.remainingMinutes,
      ).toBe(47);

      expect(
        mapped?.priorityScore,
      ).toBe(60);

      expect(
        mapped?.importance,
      ).toBe("important");
    });

    it("does not infer lifecycle completion from 90/90 minutes", () => {
      const snapshot =
        build(
          bundle({
            task: task({
              status:
                "partially_completed",
            }),

            completedMinutes: 90,
          }),
        );

      const mapped =
        snapshot.existingTasks[0];

      expect(
        mapped?.remainingMinutes,
      ).toBe(0);

      expect(
        mapped?.isCompleted,
      ).toBe(false);

      expect(
        mapped?.isPartiallyCompleted,
      ).toBe(true);

      expect(
        snapshot.completedTaskIds,
      ).not.toContain("task-1");
    });

    it("uses effective +60 daily capacity without expanding planning budget", () => {
      const snapshot =
        build(
          bundle({
            mondayCapacityDelta: 60,
          }),

          "CAPACITY_INCREASE",
        );

      expect(
        snapshot.availableMinutes,
      ).toBe(1860);

      expect(
        snapshot.planningBudgetMinutes,
      ).toBe(1785);

      expect(
        snapshot.meta.requestedScope,
      ).toBe("NO_REPLAN");
    });

    it("allows effective capacity below the stable planning budget", () => {
      const snapshot =
        build(
          bundle({
            mondayCapacityDelta: -90,
          }),

          "CAPACITY_DECREASE",
        );

      expect(
        snapshot.availableMinutes,
      ).toBe(1710);

      expect(
        snapshot.planningBudgetMinutes,
      ).toBe(1785);

      expect(
        snapshot.meta.requestedScope,
      ).toBe(
        "LOCAL_CAPACITY_REPAIR",
      );
    });

    it("subtracts real study from daily remaining capacity", () => {
      const source =
        bundle();

      const modified = {
        ...source,

        dailyCapacities:
          source.dailyCapacities.map(
            (day) =>
              day.date ===
              "2026-08-18"
                ? {
                    ...day,
                    alreadyStudiedMinutes:
                      43,
                  }
                : day,
          ),
      };

      const snapshot =
        build(modified);

      const day =
        snapshot.dailyCapacities.find(
          (item) =>
            item.date ===
            "2026-08-18",
        );

      expect(
        day?.planningCapacityMinutes,
      ).toBe(240);

      expect(
        day?.alreadyStudiedMinutes,
      ).toBe(43);

      expect(
        day?.remainingCapacityMinutes,
      ).toBe(197);
    });

    it("is deterministic for the same DB bundle and snapshot metadata", () => {
      const source =
        bundle();

      expect(
        build(source),
      ).toEqual(
        build(source),
      );
    });
  },
);
