import { remainingTaskMinutes as domainRemainingTaskMinutes, type RecommendationTask } from "@kpss-coach/domain";
import { describe, expect, it } from "vitest";
import { taskRemainingMinutes, totalTaskRemainingMinutes } from "./roadmap";

function task(estimatedMinutes: number, completedMinutes: number, status = "partially_completed") {
  return {
    estimated_minutes: estimatedMinutes,
    status,
    task_progress: [{ completed_minutes: completedMinutes, actual_study_minutes: completedMinutes }],
  };
}

function domainTask(estimatedMinutes: number, completedMinutes: number): RecommendationTask {
  return {
    id: "task",
    status: "partially_completed",
    importance: "important",
    priorityScore: 60,
    plannedDate: "2026-08-18",
    estimatedMinutes,
    completedMinutes,
    pendingUnitMinutes: null,
    createdAt: "2026-08-18T00:00:00.000Z",
  };
}

describe("week remaining-time display", () => {
  it("shows 80 remaining for a 90-minute task with 10 minutes completed", () => {
    expect(taskRemainingMinutes(task(90, 10))).toBe(80);
  });

  it("totals Aug 18 operational workload as 230 minutes", () => {
    expect(totalTaskRemainingMinutes([
      task(90, 10),
      task(50, 0, "ready"),
      task(50, 0, "ready"),
      task(50, 0, "ready"),
    ])).toBe(230);
  });

  it("shows 16 remaining for a 65-minute task with 49 minutes completed", () => {
    expect(taskRemainingMinutes(task(65, 49))).toBe(16);
  });

  it("clamps remaining time to zero without changing lifecycle status", () => {
    const partiallyCompleted = task(75, 75);

    expect(taskRemainingMinutes(partiallyCompleted)).toBe(0);
    expect(partiallyCompleted.status).toBe("partially_completed");
  });

  it("keeps the full estimate for an untouched ready task", () => {
    expect(taskRemainingMinutes(task(50, 0, "ready"))).toBe(50);
  });

  it("keeps availability separate from remaining workload", () => {
    const capacityMinutes = 240;
    const remainingWorkloadMinutes = totalTaskRemainingMinutes([
      task(90, 10),
      task(50, 0, "ready"),
      task(50, 0, "ready"),
      task(50, 0, "ready"),
    ]);

    expect({ capacityMinutes, remainingWorkloadMinutes }).toEqual({
      capacityMinutes: 240,
      remainingWorkloadMinutes: 230,
    });
  });

  it("uses the same remaining-time calculation as Today", () => {
    const partiallyCompleted = task(90, 10);

    expect(taskRemainingMinutes(partiallyCompleted)).toBe(domainRemainingTaskMinutes(domainTask(90, 10)));
  });
});
