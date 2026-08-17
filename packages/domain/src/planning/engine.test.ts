import { describe, expect, it } from "vitest";
import { buildWeeklyPlanV0 } from "./engine";
import type { WeeklyPlanningContext } from "./types";

function context(overrides: Partial<WeeklyPlanningContext> = {}): WeeklyPlanningContext {
  return {
    examProfileId: "profile-a",
    weekStartDate: "2026-08-03",
    subjects: [
      { id: "math", name: "Matematik", status: "active", sortOrder: 1 },
      { id: "history", name: "Tarih", status: "active", sortOrder: 2 },
    ],
    curriculum: [
      { id: "math-2", subjectId: "math", parentId: null, nodeType: "topic", name: "Sayılar", sortOrder: 2, isActive: true },
      { id: "math-1", subjectId: "math", parentId: null, nodeType: "topic", name: "Temel Kavramlar", sortOrder: 1, isActive: true },
      { id: "history-1", subjectId: "history", parentId: null, nodeType: "topic", name: "İlk Türkler", sortOrder: 1, isActive: true },
    ],
    topicProgress: [],
    weeklyAvailability: Array.from({ length: 5 }, (_, index) => ({ weekday: index + 1, start_time: "14:00", end_time: "20:00" })),
    resources: [],
    resourceSections: [],
    resourceUnits: [],
    resourceUnitProgress: [],
    existingCarryoverTasks: [],
    ...overrides,
  };
}

describe("Planning Engine V0", () => {
  it("converts 1800 capacity into a 1530 minute budget", () => {
    const plan = buildWeeklyPlanV0(context());
    expect(plan.availableMinutes).toBe(1800);
    expect(plan.planningBudgetMinutes).toBe(1530);
  });

  it("never exceeds planning or daily capacity", () => {
    const plan = buildWeeklyPlanV0(context());
    expect(plan.plannedMinutes).toBeLessThanOrEqual(plan.planningBudgetMinutes);
    expect(plan.tasks.reduce((sum, task) => sum + task.estimatedMinutes, 0)).toBe(plan.plannedMinutes);
  });

  it("allocates candidates round-robin across subjects", () => {
    const plan = buildWeeklyPlanV0(context({
      resources: [
        { id: "math-book", subjectId: "math", name: "M", role: "primary", difficulty: "normal", status: "active" },
        { id: "history-book", subjectId: "history", name: "T", role: "primary", difficulty: "normal", status: "active" },
      ],
      resourceSections: [
        { id: "math-section", resourceId: "math-book", curriculumNodeId: "math-1", name: "M", sortOrder: 1, planningRole: "curriculum", isActive: true },
        { id: "history-section", resourceId: "history-book", curriculumNodeId: "history-1", name: "T", sortOrder: 1, planningRole: "curriculum", isActive: true },
      ],
      resourceUnits: [
        { id: "mu", resourceId: "math-book", sectionId: "math-section", name: "Test 1", unitType: "test", sortOrder: 1, estimatedMinutes: 30, isActive: true },
        { id: "hu", resourceId: "history-book", sectionId: "history-section", name: "Test 1", unitType: "test", sortOrder: 1, estimatedMinutes: 30, isActive: true },
      ],
    }));
    expect(plan.tasks.map((task) => task.subjectId)).toEqual(["math", "history", "math", "history"]);
  });

  it("selects the first curriculum topic by sort_order", () => {
    const plan = buildWeeklyPlanV0(context({ subjects: [{ id: "math", name: "Matematik", status: "active", sortOrder: 1 }] }));
    expect(plan.tasks[0]?.curriculumNodeId).toBe("math-1");
  });

  it("skips completed resource units and groups at most two", () => {
    const plan = buildWeeklyPlanV0(context({
      subjects: [{ id: "math", name: "Matematik", status: "active", sortOrder: 1 }],
      resources: [{ id: "book", subjectId: "math", name: "Book", role: "primary", difficulty: "normal", status: "active" }],
      resourceSections: [{ id: "section", resourceId: "book", curriculumNodeId: "math-1", name: "Section", sortOrder: 1, planningRole: "curriculum", isActive: true }],
      resourceUnits: [1, 2, 3, 4].map((number) => ({ id: `u${number}`, resourceId: "book", sectionId: "section", name: `Test ${number}`, unitType: "test" as const, sortOrder: number, estimatedMinutes: 30, isActive: true })),
      resourceUnitProgress: [{ resourceUnitId: "u1", status: "completed" }],
    }));
    const solve = plan.tasks.find((task) => task.taskType === "solve_resource_units");
    expect(solve?.resourceUnitIds).toEqual(["u2", "u3"]);
  });

  it("chooses primary resources before reinforcement", () => {
    const plan = buildWeeklyPlanV0(context({
      subjects: [{ id: "math", name: "Matematik", status: "active", sortOrder: 1 }],
      resources: [
        { id: "reinforcement", subjectId: "math", name: "R", role: "reinforcement", difficulty: "normal", status: "active" },
        { id: "primary", subjectId: "math", name: "P", role: "primary", difficulty: "normal", status: "active" },
      ],
      resourceSections: [
        { id: "rs", resourceId: "reinforcement", curriculumNodeId: "math-1", name: "R", sortOrder: 1, planningRole: "curriculum", isActive: true },
        { id: "ps", resourceId: "primary", curriculumNodeId: "math-1", name: "P", sortOrder: 2, planningRole: "curriculum", isActive: true },
      ],
      resourceUnits: [
        { id: "ru", resourceId: "reinforcement", sectionId: "rs", name: "R1", unitType: "test", sortOrder: 1, estimatedMinutes: 30, isActive: true },
        { id: "pu", resourceId: "primary", sectionId: "ps", name: "P1", unitType: "test", sortOrder: 1, estimatedMinutes: 30, isActive: true },
      ],
    }));
    expect(plan.tasks.find((task) => task.taskType === "solve_resource_units")?.resourceId).toBe("primary");
  });

  it("moves to the next unfinished section mapped to the same curriculum node", () => {
    const plan = buildWeeklyPlanV0(context({
      subjects: [{ id: "math", name: "Matematik", status: "active", sortOrder: 1 }],
      resources: [{ id: "primary", subjectId: "math", name: "P", role: "primary", difficulty: "normal", status: "active" }],
      resourceSections: [
        { id: "s1", resourceId: "primary", curriculumNodeId: "math-1", name: "First", sortOrder: 1, planningRole: "curriculum", isActive: true },
        { id: "s2", resourceId: "primary", curriculumNodeId: "math-1", name: "Second", sortOrder: 2, planningRole: "curriculum", isActive: true },
      ],
      resourceUnits: [
        { id: "u1", resourceId: "primary", sectionId: "s1", name: "First unit", unitType: "chapter", sortOrder: 1, estimatedMinutes: 30, isActive: true },
        { id: "u2", resourceId: "primary", sectionId: "s2", name: "Second unit", unitType: "chapter", sortOrder: 1, estimatedMinutes: 30, isActive: true },
      ],
      resourceUnitProgress: [{ resourceUnitId: "u1", status: "completed" }],
    }));
    expect(plan.tasks.find((task) => task.taskType === "solve_resource_units")?.resourceUnitIds).toEqual(["u2"]);
  });

  it("finishes eligible primary sections before selecting reinforcement", () => {
    const plan = buildWeeklyPlanV0(context({
      subjects: [{ id: "math", name: "Matematik", status: "active", sortOrder: 1 }],
      resources: [
        { id: "primary", subjectId: "math", name: "P", role: "primary", difficulty: "normal", status: "active" },
        { id: "reinforcement", subjectId: "math", name: "R", role: "reinforcement", difficulty: "normal", status: "active" },
      ],
      resourceSections: [
        { id: "p1", resourceId: "primary", curriculumNodeId: "math-1", name: "P1", sortOrder: 1, planningRole: "curriculum", isActive: true },
        { id: "p2", resourceId: "primary", curriculumNodeId: "math-1", name: "P2", sortOrder: 2, planningRole: "curriculum", isActive: true },
        { id: "r1", resourceId: "reinforcement", curriculumNodeId: "math-1", name: "R1", sortOrder: 1, planningRole: "curriculum", isActive: true },
      ],
      resourceUnits: [
        { id: "pu1", resourceId: "primary", sectionId: "p1", name: "PU1", unitType: "chapter", sortOrder: 1, estimatedMinutes: 30, isActive: true },
        { id: "pu2", resourceId: "primary", sectionId: "p2", name: "PU2", unitType: "chapter", sortOrder: 1, estimatedMinutes: 30, isActive: true },
        { id: "ru1", resourceId: "reinforcement", sectionId: "r1", name: "RU1", unitType: "test", sortOrder: 1, estimatedMinutes: 30, isActive: true },
      ],
      resourceUnitProgress: [{ resourceUnitId: "pu1", status: "completed" }],
    }));
    const solve = plan.tasks.find((task) => task.taskType === "solve_resource_units");
    expect(solve?.resourceId).toBe("primary");
    expect(solve?.resourceUnitIds).toEqual(["pu2"]);
  });

  it("excludes reference-only and review sections from normal curriculum progression", () => {
    const plan = buildWeeklyPlanV0(context({
      subjects: [{ id: "math", name: "Matematik", status: "active", sortOrder: 1 }],
      resources: [{ id: "primary", subjectId: "math", name: "P", role: "primary", difficulty: "normal", status: "active" }],
      resourceSections: [
        { id: "reference", resourceId: "primary", curriculumNodeId: "math-1", name: "Answers", sortOrder: 1, planningRole: "reference_only", isActive: true },
        { id: "review", resourceId: "primary", curriculumNodeId: "math-1", name: "Review", sortOrder: 2, planningRole: "review_only", isActive: true },
      ],
      resourceUnits: [
        { id: "answer", resourceId: "primary", sectionId: "reference", name: "Answer key", unitType: "reading", sortOrder: 1, estimatedMinutes: 10, isActive: true },
        { id: "review-unit", resourceId: "primary", sectionId: "review", name: "Review", unitType: "reading", sortOrder: 1, estimatedMinutes: 20, isActive: true },
      ],
    }));
    expect(plan.tasks.some((task) => task.taskType === "solve_resource_units")).toBe(false);
  });

  it("does not emit duplicate candidates for duplicate context references", () => {
    const plan = buildWeeklyPlanV0(context());
    expect(new Set(plan.tasks.map((task) => task.dedupeKey)).size).toBe(plan.tasks.length);
  });

  it("places carryover before normal curriculum work", () => {
    const plan = buildWeeklyPlanV0(context({
      existingCarryoverTasks: [{
        id: "old-task", subjectId: "math", curriculumNodeId: "math-1", resourceId: null,
        taskType: "learn_topic", title: "Carry", description: null, estimatedMinutes: 30,
        importance: "important", priorityScore: 50, resourceUnitIds: [],
      }],
    }));
    expect(plan.tasks[0]?.sourceReason).toBe("carryover");
    expect(plan.tasks[0]?.carriedFromTaskId).toBe("old-task");
  });

  it("skips an oversized task and can still select a smaller later task", () => {
    const plan = buildWeeklyPlanV0(context({
      weeklyAvailability: [{ weekday: 1, start_time: "09:00", end_time: "10:00" }],
      existingCarryoverTasks: [{
        id: "huge", subjectId: "math", curriculumNodeId: null, resourceId: null,
        taskType: "custom", title: "Huge", description: null, estimatedMinutes: 90,
        importance: "core", priorityScore: 90, resourceUnitIds: [],
      }],
    }));
    expect(plan.tasks.some((task) => task.title === "Huge")).toBe(false);
    expect(plan.plannedMinutes).toBeLessThanOrEqual(51);
  });
});
