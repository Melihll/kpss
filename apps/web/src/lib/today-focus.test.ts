import { describe, expect, it } from "vitest";
import { resolveTodayFocus } from "./today-focus";

type Task = {
  id: string;
  status: string;
};

describe("resolveTodayFocus", () => {
  it("keeps the server recommendation authoritative when one exists", () => {
    const recommended: Task = { id: "recommended", status: "ready" };
    const fallback: Task = { id: "fallback", status: "ready" };

    expect(resolveTodayFocus({
      recommendation: {
        task: recommended,
        reason: "important_topic",
        remainingMinutes: 45,
      },
      todayTasks: [fallback],
      dailyMinutes: new Map([["fallback", 60]]),
      hasActiveSession: false,
    })).toEqual({
      task: recommended,
      reason: "important_topic",
      remainingMinutes: 45,
      source: "recommendation",
    });
  });

  it("uses the first open daily-plan task when recommendation is unavailable", () => {
    const first: Task = { id: "economics", status: "ready" };
    const second: Task = { id: "law", status: "ready" };

    expect(resolveTodayFocus({
      recommendation: null,
      todayTasks: [first, second],
      dailyMinutes: new Map([
        ["economics", 60],
        ["law", 60],
      ]),
      hasActiveSession: false,
    })).toEqual({
      task: first,
      reason: "daily_plan_fallback",
      remainingMinutes: 60,
      source: "daily_plan_fallback",
    });
  });

  it("does not use completed or zero-minute tasks as fallback", () => {
    expect(resolveTodayFocus({
      recommendation: null,
      todayTasks: [
        { id: "completed", status: "completed" },
        { id: "zero", status: "ready" },
      ],
      dailyMinutes: new Map([
        ["completed", 60],
        ["zero", 0],
      ]),
      hasActiveSession: false,
    })).toBeNull();
  });

  it("does not create a fallback focus while a session is active", () => {
    expect(resolveTodayFocus({
      recommendation: null,
      todayTasks: [{ id: "next", status: "ready" }],
      dailyMinutes: new Map([["next", 60]]),
      hasActiveSession: true,
    })).toBeNull();
  });
});