import { describe, expect, it } from "vitest";
import { getNextBestTask } from "./recommendation";
import type { RecommendationTask } from "./types";

function task(overrides: Partial<RecommendationTask>): RecommendationTask {
  return {
    id: "task",
    status: "ready",
    importance: "important",
    priorityScore: 50,
    plannedDate: "2026-08-08",
    estimatedMinutes: 60,
    completedMinutes: 0,
    createdAt: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

describe("getNextBestTask", () => {
  it("selects in-progress first", () => {
    expect(getNextBestTask([task({ id: "ready", priorityScore: 100 }), task({ id: "active", status: "in_progress" })], { today: "2026-08-08" }).recommendedTask.id).toBe("active");
  });

  it("selects partial before a new task", () => {
    const result = getNextBestTask([task({ id: "new" }), task({ id: "partial", status: "partially_completed", completedMinutes: 30 })], { today: "2026-08-08" });
    expect(result.recommendedTask.id).toBe("partial");
    expect(result.reason).toBe("continue_partial");
  });

  it("prioritizes overdue core", () => {
    const result = getNextBestTask([task({ id: "today", plannedDate: "2026-08-08", priorityScore: 99 }), task({ id: "core", importance: "core", plannedDate: "2026-08-07" })], { today: "2026-08-08" });
    expect(result.recommendedTask.id).toBe("core");
    expect(result.reason).toBe("overdue_core");
  });

  it("prefers a task fitting the available window within the same tier", () => {
    const result = getNextBestTask([task({ id: "long", estimatedMinutes: 90, priorityScore: 90, plannedDate: "2026-08-09" }), task({ id: "fit", estimatedMinutes: 30, priorityScore: 50, plannedDate: "2026-08-09" })], { today: "2026-08-08", availableMinutes: 35 });
    expect(result.recommendedTask.id).toBe("fit");
    expect(result.reason).toBe("fits_available_window");
  });

  it("uses deterministic priority, remaining time, creation and id tie-breaks", () => {
    const result = getNextBestTask([
      task({ id: "b", priorityScore: 70, estimatedMinutes: 30, plannedDate: "2026-08-09" }),
      task({ id: "a", priorityScore: 70, estimatedMinutes: 30, plannedDate: "2026-08-09" }),
    ], { today: "2026-08-08" });
    expect(result.recommendedTask.id).toBe("a");
  });

  it("combines session progress and pending resource units without double-counting remaining work", () => {
    expect(getNextBestTask([
      task({ id: "session-progress", estimatedMinutes: 60, completedMinutes: 20, pendingUnitMinutes: 60 }),
    ], { today: "2026-08-08" }).remainingMinutes).toBe(40);

    expect(getNextBestTask([
      task({ id: "unit-progress", estimatedMinutes: 60, completedMinutes: 0, pendingUnitMinutes: 30 }),
    ], { today: "2026-08-08" }).remainingMinutes).toBe(30);

    expect(getNextBestTask([
      task({ id: "awaiting-result", estimatedMinutes: 60, completedMinutes: 60, pendingUnitMinutes: 60, status: "partially_completed" }),
    ], { today: "2026-08-08" }).remainingMinutes).toBe(0);
  });
});
