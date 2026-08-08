import { describe, expect, it } from "vitest";
import { deriveTaskStatus, transitionTopicForLearnTask } from "./lifecycle";

describe("task and topic lifecycle", () => {
  it("maps 1/2 units to partially completed", () => {
    expect(deriveTaskStatus({ currentStatus: "in_progress", estimatedMinutes: 60, completedMinutes: 0, unitStatuses: ["completed", "pending"] })).toBe("partially_completed");
  });

  it("maps 2/2 units to completed", () => {
    expect(deriveTaskStatus({ currentStatus: "in_progress", estimatedMinutes: 60, completedMinutes: 0, unitStatuses: ["completed", "completed"] })).toBe("completed");
  });

  it("maps partial completed minutes to partial state", () => {
    expect(deriveTaskStatus({ currentStatus: "in_progress", estimatedMinutes: 90, completedMinutes: 55 })).toBe("partially_completed");
  });

  it("rejects negative progress and explicit completion with pending units", () => {
    expect(() => deriveTaskStatus({ currentStatus: "ready", estimatedMinutes: 60, completedMinutes: -1 })).toThrow(/INVALID_TASK_PROGRESS/);
    expect(() => deriveTaskStatus({ currentStatus: "ready", estimatedMinutes: 60, completedMinutes: 0, unitStatuses: ["pending"], explicitComplete: true })).toThrow(/TASK_HAS_PENDING_UNITS/);
  });

  it("starts a not-started learn topic as learning", () => {
    expect(transitionTopicForLearnTask("not_started", "start")).toBe("learning");
  });

  it("completes a learning topic into practicing", () => {
    expect(transitionTopicForLearnTask("learning", "complete")).toBe("practicing");
  });

  it("never regresses advanced topic states", () => {
    expect(transitionTopicForLearnTask("maintenance", "start")).toBe("maintenance");
    expect(transitionTopicForLearnTask("learned", "complete")).toBe("learned");
    expect(transitionTopicForLearnTask("remediation", "complete")).toBe("remediation");
  });
});
