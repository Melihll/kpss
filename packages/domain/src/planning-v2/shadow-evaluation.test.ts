import { describe, expect, it } from "vitest";
import {
  buildFoundationWeekGoldenSnapshotV2,
  decidePlanningActionV2,
  evaluatePlanningV2ShadowDecision,
} from "./index";

function evaluate(
  options: Parameters<typeof buildFoundationWeekGoldenSnapshotV2>[0] = {},
) {
  const snapshot = buildFoundationWeekGoldenSnapshotV2(options);
  const decision = decidePlanningActionV2({ snapshot });
  return evaluatePlanningV2ShadowDecision({ snapshot, decision });
}

describe("Planning V2 shadow evaluation", () => {
  it("reports a feasible study deviation as a zero-change KEEP_PLAN", () => {
    const evaluation = evaluate({
      trigger: "STUDY_DEVIATION",
      completedMinutesByTaskId: { "task-01": 43 },
      partiallyCompletedTaskIds: ["task-01"],
      studiedMinutesByDate: { "2026-08-17": 43 },
    });

    expect(evaluation.currentPlan.feasible).toBe(true);
    expect(evaluation.currentPlan.issueCodes).toEqual([]);
    expect(evaluation.v2.decision).toBe("KEEP_PLAN");
    expect(evaluation.v2.changedTaskCount).toBe(0);
    expect(evaluation.stability.changeRatio).toBe(0);
  });

  it("keeps the stable budget and plan after +60 capacity", () => {
    const evaluation = evaluate({
      trigger: "CAPACITY_INCREASE",
      capacityDeltaByDate: { "2026-08-18": 60 },
    });

    expect(evaluation.currentPlan.feasible).toBe(true);
    expect(evaluation.currentPlan.planningBudgetMinutes).toBe(1785);
    expect(evaluation.capacity.grossMinutes).toBe(1860);
    expect(evaluation.capacity.planningMinutes).toBe(1845);
    expect(evaluation.v2.decision).toBe("KEEP_PLAN");
    expect(evaluation.v2.movedTaskIds).toEqual([]);
  });

  it("makes -90 capacity infeasibility and the exact backlog repair visible", () => {
    const evaluation = evaluate({
      trigger: "CAPACITY_DECREASE",
      capacityDeltaByDate: { "2026-08-18": -90 },
    });

    expect(evaluation.currentPlan.planningBudgetMinutes).toBe(1785);
    expect(evaluation.currentPlan.availableMinutes).toBe(1710);
    expect(evaluation.currentPlan.feasible).toBe(false);
    expect(evaluation.currentPlan.issueCodes).toContain("DAILY_OVERLOAD");
    expect(evaluation.v2.decision).toBe("READY_TO_APPLY");
    expect(evaluation.v2.backlogTaskIds).toEqual(["task-05"]);
    expect(evaluation.v2.changedTaskCount).toBe(1);
  });

  it("preserves partially_completed lifecycle at 90 of 90 minutes", () => {
    const evaluation = evaluate({
      trigger: "STUDY_DEVIATION",
      completedMinutesByTaskId: { "task-01": 90 },
      partiallyCompletedTaskIds: ["task-01"],
    });

    expect(evaluation.currentPlan.completedTaskCount).toBe(0);
    expect(evaluation.currentPlan.partialLifecycleTaskCount).toBe(1);
    expect(evaluation.currentPlan.remainingTaskCount).toBe(29);
    expect(evaluation.stability.partialTaskMutationCount).toBe(0);
    expect(evaluation.v2.preservedTaskIds).toContain("task-01");
  });

  it("reports exact moved IDs while protecting completed and active tasks", () => {
    const evaluation = evaluate({
      trigger: "CAPACITY_DECREASE",
      capacityDeltaByDate: {
        "2026-08-18": -50,
        "2026-08-19": 50,
      },
      completedTaskIds: ["task-01"],
      activeTaskIds: ["task-02"],
    });

    expect(evaluation.v2.decision).toBe("READY_TO_APPLY");
    expect(evaluation.v2.movedTaskIds).toEqual(["task-06"]);
    expect(evaluation.v2.backlogTaskIds).toEqual([]);
    expect(evaluation.stability.completedTaskMutationCount).toBe(0);
    expect(evaluation.stability.activeTaskMutationCount).toBe(0);
  });

  it("is deep-equal for the same immutable input", () => {
    const snapshot = buildFoundationWeekGoldenSnapshotV2({
      trigger: "CAPACITY_DECREASE",
      capacityDeltaByDate: {
        "2026-08-18": -50,
        "2026-08-19": 50,
      },
    });
    const decision = decidePlanningActionV2({ snapshot });

    const first = evaluatePlanningV2ShadowDecision({ snapshot, decision });
    const second = evaluatePlanningV2ShadowDecision({ snapshot, decision });

    expect(first).toEqual(second);
  });
});
