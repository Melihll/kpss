import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { replanWeeklyPlanV1 } from "../packages/domain/src/adaptive/replan";
import type { AdaptiveTask } from "../packages/domain/src/adaptive/types";
import { resolveNextPlanningBudget } from "../supabase/functions/_shared/adaptive.ts";
import { prepareDailyPlanNotification } from "../supabase/functions/_shared/scheduler-plan.ts";
// The importer stays plain ESM because it is also a standalone CLI.
// @ts-expect-error no declaration file is needed by this test harness.
import { buildBaselineExecutionPlan, buildCanonicalModel, loadCanonicalInputs, repositoryRoot } from "../scripts/import-p48-canonical.mjs";

const inputs = await loadCanonicalInputs(repositoryRoot);
const baseline = buildBaselineExecutionPlan(buildCanonicalModel(inputs), inputs.baseline);
const dailyAcademicCapacities = Object.fromEntries(baseline.dailyCapacity.map((day: any) => [
  day.date,
  day.capacityMinutes - day.reserveMinutes,
]));
const adaptiveTasks: AdaptiveTask[] = baseline.tasks.map((task: any, index: number) => ({
  id: `baseline-${String(index + 1).padStart(2, "0")}`,
  subjectId: task.subjectId,
  curriculumNodeId: task.curriculumNodeId,
  title: task.title,
  plannedDate: task.plannedDate,
  estimatedMinutes: task.estimatedMinutes,
  completedMinutes: 0,
  importance: "important",
  priorityScore: 60,
  status: "ready",
  createdAt: "2026-08-17T00:00:00Z",
  postponementCount: 0,
  sourceReason: "baseline_import",
}));

describe("W1 scheduler incident regression", () => {
  it("derives the real 35-task W1 budget and date-scoped reserve capacities", () => {
    expect(baseline.tasks).toHaveLength(35);
    expect(baseline.tasks.reduce((sum: number, task: any) => sum + task.estimatedMinutes, 0)).toBe(2310);
    expect(baseline.reserveRowCount).toBe(7);
    expect(baseline.reserveMinutes).toBe(210);
    expect(baseline.capacityMinutes).toBe(2520);
    expect(Object.values(dailyAcademicCapacities)).toEqual([330, 345, 330, 330, 330, 330, 315]);
    expect(Object.values(dailyAcademicCapacities).reduce((sum: number, value: any) => sum + value, 0)).toBe(2310);
  });

  it("keeps Monday morning daily_plan read-only with respect to the weekly task layout", async () => {
    const before = structuredClone(adaptiveTasks);
    let ensured = 0;
    let summarized = 0;
    const prepared = await prepareDailyPlanNotification({
      ensurePlan: async () => { ensured += 1; },
      buildSummary: async () => { summarized += 1; return { taskCount: 35, plannedMinutes: 2310 }; },
    });

    expect(ensured).toBe(1);
    expect(summarized).toBe(1);
    expect(prepared.replan).toEqual({ performed: false, trigger: null, tasksToBacklog: [] });
    expect(adaptiveTasks).toEqual(before);
    expect(adaptiveTasks.every((task) => task.plannedDate !== null && task.status === "ready")).toBe(true);
  });

  it("does not leave a destructive study_deviation call in the daily scheduler path", async () => {
    const worker = await readFile(resolve(repositoryRoot, "supabase/functions/scheduler-worker/index.ts"), "utf8");
    expect(worker).toContain("prepareDailyPlanNotification");
    expect(worker).not.toContain("recalculateCurrentPlan");
    expect(worker).not.toContain('"study_deviation"');
  });

  it("preserves explicit 2520/2310 override semantics instead of applying 0.85 twice", () => {
    expect(resolveNextPlanningBudget({
      planAvailableMinutes: 2520,
      planPlanningBudgetMinutes: 2310,
      outputAvailableMinutes: 2310,
      hasDailyCapacityOverrides: true,
    })).toBe(2310);
    expect(resolveNextPlanningBudget({
      planAvailableMinutes: 1800,
      planPlanningBudgetMinutes: 1530,
      outputAvailableMinutes: 1800,
      hasDailyCapacityOverrides: false,
    })).toBe(1530);
  });

  it("still produces a deterministic replan for a genuine capacity reduction", () => {
    const reduced = { ...dailyAcademicCapacities, "2026-08-17": 270 };
    const context = {
      profileId: "profile",
      planId: "w1",
      weekStart: "2026-08-17",
      weekEnd: "2026-08-23",
      currentDate: "2026-08-17",
      planningBudgetMinutes: 2310,
      dailyCapacities: reduced,
      actualMinutesByDate: {},
      plannedConsumedMinutesByDate: {},
      tasks: adaptiveTasks,
      revisions: [],
      trigger: "capacity_change" as const,
    };
    const first = replanWeeklyPlanV1(context);
    const repeated = replanWeeklyPlanV1(context);
    expect(first).toEqual(repeated);
    expect(first.availableMinutes).toBe(2250);
    expect(first.tasksToBacklog.length).toBeGreaterThan(0);
    expect(first.changedTaskCount).toBeGreaterThan(0);
  });
});
