import { describe, expect, it } from "vitest";
import { mergeMovableTaskOrder, moveTaskId } from "./today-task-order";

describe("moveTaskId", () => {
  it("moves a task down to the requested index", () => {
    expect(moveTaskId(["a", "b", "c"], "a", 2)).toEqual(["b", "c", "a"]);
  });

  it("moves a task up to the requested index", () => {
    expect(moveTaskId(["a", "b", "c"], "c", 0)).toEqual(["c", "a", "b"]);
  });

  it("keeps order unchanged when task is missing", () => {
    expect(moveTaskId(["a", "b"], "x", 1)).toEqual(["a", "b"]);
  });
});

describe("mergeMovableTaskOrder", () => {
  it("reorders only movable task slots and preserves fixed tasks", () => {
    expect(
      mergeMovableTaskOrder(
        ["focus", "a", "b", "completed", "c"],
        ["a", "b", "c"],
        ["c", "a", "b"],
      ),
    ).toEqual(["focus", "c", "a", "completed", "b"]);
  });

  it("falls back safely when the movable set is invalid", () => {
    expect(
      mergeMovableTaskOrder(["a", "b", "c"], ["a", "b"], ["b", "x"]),
    ).toEqual(["a", "b", "c"]);
  });
});