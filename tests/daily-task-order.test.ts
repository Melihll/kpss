import { describe, expect, it } from "vitest";
import { applyDailyTaskOrder } from "../supabase/functions/_shared/daily-task-order";

const tasks = [
  { id: "a", planned_date: "2026-08-20", priority_score: 90 },
  { id: "b", planned_date: "2026-08-20", priority_score: 80 },
  { id: "c", planned_date: "2026-08-20", priority_score: 70 },
  { id: "d", planned_date: "2026-08-21", priority_score: 95 },
];

describe("applyDailyTaskOrder", () => {
  it("preserves planner order when there are no preferences", () => {
    expect(applyDailyTaskOrder(tasks, []).map((task) => task.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("applies a complete manual order only inside the matching day", () => {
    const result = applyDailyTaskOrder(tasks, [
      { task_id: "a", planned_date: "2026-08-20", manual_order: 2 },
      { task_id: "b", planned_date: "2026-08-20", manual_order: 0 },
      { task_id: "c", planned_date: "2026-08-20", manual_order: 1 },
    ]);

    expect(result.map((task) => task.id)).toEqual(["b", "c", "a", "d"]);
  });

  it("ignores stale preferences after planned_date changes", () => {
    const result = applyDailyTaskOrder(tasks, [
      { task_id: "a", planned_date: "2026-08-19", manual_order: 2 },
      { task_id: "b", planned_date: "2026-08-20", manual_order: 0 },
      { task_id: "c", planned_date: "2026-08-20", manual_order: 1 },
    ]);

    expect(result.map((task) => task.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("uses current-date preferences when a stale row coexists with the same task", () => {
    const result = applyDailyTaskOrder(tasks, [
      { task_id: "a", planned_date: "2026-08-19", manual_order: 0 },
      { task_id: "a", planned_date: "2026-08-20", manual_order: 2 },
      { task_id: "b", planned_date: "2026-08-20", manual_order: 0 },
      { task_id: "c", planned_date: "2026-08-20", manual_order: 1 },
    ]);

    expect(result.map((task) => task.id)).toEqual(["b", "c", "a", "d"]);
  });
  it("ignores partial manual order so planner fallback stays deterministic", () => {
    const result = applyDailyTaskOrder(tasks, [
      { task_id: "a", planned_date: "2026-08-20", manual_order: 1 },
      { task_id: "b", planned_date: "2026-08-20", manual_order: 0 },
    ]);

    expect(result.map((task) => task.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("ignores duplicate manual_order values", () => {
    const result = applyDailyTaskOrder(tasks, [
      { task_id: "a", planned_date: "2026-08-20", manual_order: 0 },
      { task_id: "b", planned_date: "2026-08-20", manual_order: 0 },
      { task_id: "c", planned_date: "2026-08-20", manual_order: 1 },
    ]);

    expect(result.map((task) => task.id)).toEqual(["a", "b", "c", "d"]);
  });
});