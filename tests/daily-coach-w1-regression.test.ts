import { describe, expect, it } from "vitest";
import type { RecommendationTask } from "../packages/domain/src/planning/types";
import { buildBaselineExecutionPlan, buildCanonicalModel, loadCanonicalInputs, repositoryRoot } from "../scripts/import-p48-canonical.mjs";
import { baselineExecutionOrder, hydrateTaskResource } from "../supabase/functions/_shared/task-context.ts";
// Exercise the checked-in module that app-api actually deploys.
// @ts-expect-error the generated edge bundle intentionally has no declaration file.
import { buildDailyPlanProjection, getNextBestTask, remainingTaskMinutes } from "../supabase/functions/_shared/planning.bundle.js";

const TODAY = "2026-08-17";
const inputs = await loadCanonicalInputs(repositoryRoot);
const baseline = buildBaselineExecutionPlan(buildCanonicalModel(inputs), inputs.baseline);
const monday = baseline.tasks.filter((task: any) => task.plannedDate === TODAY);
const ids = ["z-economics", "y-law", "x-turkish", "w-math", "a-history"];

function recommendationTasks(): RecommendationTask[] {
  return monday.map((task: any, index: number) => ({
    id: ids[index]!,
    status: "ready",
    importance: "important",
    priorityScore: 60,
    plannedDate: task.plannedDate,
    estimatedMinutes: task.estimatedMinutes,
    completedMinutes: 0,
    executionOrder: baselineExecutionOrder({ source_reason: "baseline_import", dedupe_key: task.dedupeKey }),
    createdAt: `2026-08-16T00:00:0${5 - index}Z`,
  }));
}

function selectFromToday(tasks: RecommendationTask[]) {
  const ranked: RecommendationTask[] = [];
  let candidates = tasks.filter((task) => task.plannedDate === TODAY);
  while (candidates.some((task) => !["completed", "cancelled", "missed"].includes(task.status))) {
    const selected = getNextBestTask(candidates, { today: TODAY });
    ranked.push(selected.recommendedTask);
    candidates = candidates.filter((task) => task.id !== selected.recommendedTask.id);
  }
  const rankedIds = new Set(ranked.map((task) => task.id));
  const projection = buildDailyPlanProjection({
    date: TODAY,
    capacityMinutes: 330,
    completedStudyMinutes: 0,
    tasks: [
      ...ranked.map((task) => ({ id: task.id, plannedDate: task.plannedDate, status: task.status, remainingMinutes: remainingTaskMinutes(task) })),
      ...tasks.filter((task) => !rankedIds.has(task.id)).map((task) => ({ id: task.id, plannedDate: task.plannedDate, status: task.status, remainingMinutes: remainingTaskMinutes(task) })),
    ],
  });
  const scheduledIds = new Set(projection.openItems.map((item) => item.taskId));
  return getNextBestTask(tasks.filter((task) => scheduledIds.has(task.id)), { today: TODAY, availableMinutes: projection.remainingCapacityMinutes });
}

describe("W1 daily coach recommendation regression", () => {
  it("recommends Monday baseline order 1 when five tasks share priority 60", () => {
    expect(monday).toHaveLength(5);
    expect(monday.map((task: any) => task.estimatedMinutes)).toEqual([90, 90, 45, 60, 45]);
    const selected = selectFromToday(recommendationTasks());
    expect(selected.recommendedTask.id).toBe("z-economics");
    expect(monday[0].title).toBe("İktisat · İktisada Giriş · s.3–22");
    expect(selected.remainingMinutes).toBe(90);
  });

  it("recommends order 2 after order 1 is completed", () => {
    const tasks = recommendationTasks();
    tasks[0] = { ...tasks[0]!, status: "completed", completedMinutes: 90 };
    expect(selectFromToday(tasks).recommendedTask.id).toBe("y-law");
  });

  it("keeps a real in-progress task ahead of baseline order", () => {
    const tasks = recommendationTasks();
    tasks[4] = { ...tasks[4]!, status: "in_progress" };
    expect(selectFromToday(tasks).recommendedTask.id).toBe("a-history");
  });

  it("keeps a genuinely today partial task ahead of a ready baseline task", () => {
    const tasks = recommendationTasks();
    tasks[3] = { ...tasks[3]!, status: "partially_completed", completedMinutes: 15 };
    expect(selectFromToday(tasks).recommendedTask.id).toBe("w-math");
  });

  it("does not let a stale 2026-08-13 manual partial task enter the 2026-08-17 projection", () => {
    const staleManual: RecommendationTask = {
      id: "1c382ecc-e9cf-4b8e-ba68-613dad37b230",
      status: "partially_completed",
      importance: "important",
      priorityScore: 60,
      plannedDate: "2026-08-13",
      estimatedMinutes: 60,
      completedMinutes: 15,
      executionOrder: null,
      createdAt: "2026-08-13T00:00:00Z",
    };
    expect(selectFromToday([staleManual, ...recommendationTasks()]).recommendedTask.id).toBe("z-economics");
  });

  it("hydrates the canonical History resource through resource_section relations", () => {
    const historyArtifact = inputs.baseline.tasks.find((task: any) => task.date === TODAY && task.order === 5);
    const hydrated = hydrateTaskResource({
      id: "46303e2d-d80d-4cb5-a17a-6f85daaa3fb0",
      resource_id: null,
      resource_section_id: "d3fa5229-151f-4032-8ed3-74d42f6067a5",
      resources: null,
      resource_sections: { resources: { name: historyArtifact.resource, resource_type: "notes" } },
      task_resource_units: [],
    });
    expect(hydrated.resources?.name).toBe("2026 KPSS Tarih Ders Notları");
  });
});
