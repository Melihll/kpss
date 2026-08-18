import { describe, expect, it } from "vitest";
import {
  buildPlanningSnapshotV2,
  decidePlanningActionV2,
  evaluatePlanningV2ShadowDecision,
  repairCurrentPlanLocallyV1,
  type ExistingScheduledTaskInputV2,
} from "./index";

const DATES = [
  "2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20",
  "2026-08-21", "2026-08-22", "2026-08-23",
] as const;

type TaskSpec = {
  id: string;
  date: string;
  estimated: number;
  completed?: number;
  active?: boolean;
  done?: boolean;
  partial?: boolean;
};

function task(spec: TaskSpec): ExistingScheduledTaskInputV2 {
  return {
    taskId: spec.id,
    userId: "synthetic-user",
    examProfileId: "synthetic-profile",
    weeklyPlanId: "synthetic-week",
    curriculumUnitId: `unit-${spec.id}`,
    subjectId: "synthetic-subject",
    resourceId: null,
    title: spec.id,
    taskType: "study",
    lifecycleStatus: spec.done
      ? "completed"
      : spec.active
        ? "in_progress"
        : spec.partial
          ? "partially_completed"
          : "ready",
    plannedDate: spec.date,
    estimatedMinutes: spec.estimated,
    completedMinutes: spec.completed ?? 0,
    isCompleted: spec.done ?? false,
    isActive: spec.active ?? false,
    isPartiallyCompleted: spec.partial ?? false,
  };
}

function snapshot(
  tasks: readonly TaskSpec[],
  capacities: Readonly<Record<string, number>>,
) {
  const dailyCapacities = DATES.map((date) => ({
    date,
    grossCapacityMinutes: capacities[date] ?? 0,
    reserveMinutes: 0,
    alreadyStudiedMinutes: 0,
  }));
  const available = dailyCapacities.reduce(
    (sum, day) => sum + day.grossCapacityMinutes,
    0,
  );
  return buildPlanningSnapshotV2({
    snapshotId: "synthetic-past-due",
    snapshotHash: "synthetic-hash",
    generatedAt: "2026-08-18T12:00:00+03:00",
    currentDate: "2026-08-18",
    weekStart: "2026-08-17",
    weekEnd: "2026-08-23",
    trigger: "MISSED_DAY",
    versions: {
      plannerVersion: "test",
      scoringVersion: "test",
      learnerStateVersion: "test",
      snapshotSchemaVersion: "test",
    },
    userId: "synthetic-user",
    examProfileId: "synthetic-profile",
    examDate: "2027-09-01",
    availableMinutes: available,
    planningBudgetMinutes: available,
    reserveMinutes: 0,
    dailyCapacities,
    existingTasks: tasks.map(task),
  });
}

const REAL_PATTERN: readonly TaskSpec[] = [
  { id: "past-partial", date: "2026-08-17", estimated: 90, completed: 62, partial: true },
  { id: "past-75", date: "2026-08-17", estimated: 75 },
  { id: "past-45", date: "2026-08-17", estimated: 45 },
  { id: "future-valid", date: "2026-08-18", estimated: 20 },
];

describe("Planning V2 past-due local repair", () => {
  it("moves one past-due task to current-date capacity", () => {
    const result = repairCurrentPlanLocallyV1(snapshot(
      [{ id: "past-60", date: "2026-08-17", estimated: 60 }],
      { "2026-08-18": 60 },
    ));
    expect(result.successful).toBe(true);
    expect(result.moves).toEqual([expect.objectContaining({
      taskId: "past-60", fromDate: "2026-08-17", toDate: "2026-08-18",
      remainingMinutes: 60,
    })]);
    expect(result.changedTaskCount).toBe(1);
  });

  it("uses the nearest day where the whole task fits", () => {
    const result = repairCurrentPlanLocallyV1(snapshot(
      [{ id: "past-75", date: "2026-08-17", estimated: 75 }],
      { "2026-08-18": 30, "2026-08-19": 90 },
    ));
    expect(result.moves[0]?.toDate).toBe("2026-08-19");
    expect(result.moves[0]?.remainingMinutes).toBe(75);
  });

  it("moves exactly multiple past-due tasks without future churn", () => {
    const result = repairCurrentPlanLocallyV1(snapshot(
      REAL_PATTERN,
      { "2026-08-18": 123, "2026-08-19": 45 },
    ));
    expect(result.successful).toBe(true);
    expect(result.moves.map((move) => move.taskId).sort()).toEqual([
      "past-45", "past-75", "past-partial",
    ]);
    expect(result.changedTaskCount).toBe(3);
    expect(result.moves.map((move) => move.taskId)).not.toContain("future-valid");
  });

  it("preserves partial lifecycle/progress and schedules only remaining work", () => {
    const source = snapshot(
      [REAL_PATTERN[0]!],
      { "2026-08-18": 28 },
    );
    const result = repairCurrentPlanLocallyV1(source);
    expect(result.moves[0]?.remainingMinutes).toBe(28);
    expect(source.existingTasks[0]).toMatchObject({
      estimatedMinutes: 90,
      completedMinutes: 62,
      remainingMinutes: 28,
      isPartiallyCompleted: true,
      lifecycleStatus: "partially_completed",
    });
  });

  it("never moves a completed past-date task", () => {
    const result = repairCurrentPlanLocallyV1(snapshot(
      [{ id: "done", date: "2026-08-17", estimated: 60, done: true }],
      { "2026-08-18": 60 },
    ));
    expect(result.moves).toEqual([]);
    expect(result.changedTaskCount).toBe(0);
  });

  it("blocks safely when an active past-due task cannot move", () => {
    const source = snapshot(
      [{ id: "active", date: "2026-08-17", estimated: 60, active: true }],
      { "2026-08-18": 60 },
    );
    const repair = repairCurrentPlanLocallyV1(source);
    const decision = decidePlanningActionV2({ snapshot: source });
    expect(repair.successful).toBe(false);
    expect(repair.moves).toEqual([]);
    expect(decision.decision).toBe("BLOCKED");
  });

  it("uses existing backlog semantics when no remaining capacity exists", () => {
    const result = repairCurrentPlanLocallyV1(snapshot(
      [{ id: "past-60", date: "2026-08-17", estimated: 60 }],
      {},
    ));
    expect(result.successful).toBe(true);
    expect(result.moves).toEqual([]);
    expect(result.backlog).toEqual([expect.objectContaining({
      taskId: "past-60", remainingMinutes: 60,
    })]);
  });

  it("is deterministic for the same past-due snapshot", () => {
    const source = snapshot(REAL_PATTERN, {
      "2026-08-18": 123,
      "2026-08-19": 45,
    });
    expect(repairCurrentPlanLocallyV1(source)).toEqual(
      repairCurrentPlanLocallyV1(source),
    );
  });

  it("produces READY_TO_APPLY evaluation with exact safe mutations", () => {
    const fillers: TaskSpec[] = Array.from({ length: 6 }, (_, index) => ({
      id: `done-${index}`,
      date: "2026-08-18",
      estimated: 1,
      completed: 1,
      done: true,
    }));
    const source = snapshot([...REAL_PATTERN, ...fillers], {
      "2026-08-18": 123,
      "2026-08-19": 45,
    });
    const decision = decidePlanningActionV2({ snapshot: source });
    const evaluation = evaluatePlanningV2ShadowDecision({ snapshot: source, decision });
    expect(decision.decision).toBe("READY_TO_APPLY");
    expect(decision.proposal.scope).toBe("MISSED_DAY_REPAIR");
    expect(evaluation.currentPlan.feasible).toBe(false);
    expect(evaluation.currentPlan.issueCodes).toContain("PAST_DUE_REMAINING_WORK");
    expect(evaluation.v2.changedTaskCount).toBe(3);
    expect(evaluation.v2.movedTaskIds.slice().sort()).toEqual([
      "past-45", "past-75", "past-partial",
    ]);
    expect(evaluation.stability.completedTaskMutationCount).toBe(0);
    expect(evaluation.stability.activeTaskMutationCount).toBe(0);
  });
});
