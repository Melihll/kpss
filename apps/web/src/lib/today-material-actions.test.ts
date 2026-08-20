import { describe, expect, it } from "vitest";
import {
  defaultTaskMaterialTab,
  taskMaterialResource,
  taskMaterialResourceId,
} from "./today-material-actions";
import type { RoadmapTask } from "./roadmap";

function task(overrides: Partial<RoadmapTask> = {}): RoadmapTask {
  return {
    id: "task-1",
    title: "Tarih · Çalışma",
    description: null,
    planned_date: "2026-08-20",
    estimated_minutes: 60,
    status: "ready",
    work_mode: "book",
    ...overrides,
  };
}

describe("P1-13 Today material actions", () => {
  it("prefers the backend-resolved canonical material resource id", () => {
    expect(taskMaterialResourceId(task({
      material_resource_id: "resolved-resource",
      resource_id: "direct-resource",
      resources: { id: "nested-resource", name: "Kitap", resource_type: "book" },
    }))).toBe("resolved-resource");
  });

  it("falls back to direct and nested resource ids", () => {
    expect(taskMaterialResourceId(task({ resource_id: "direct-resource" }))).toBe("direct-resource");
    expect(taskMaterialResourceId(task({
      resources: { id: "nested-resource", name: "Kitap", resource_type: "book" },
    }))).toBe("nested-resource");
  });

  it("builds a minimal ResourceForecast adapter without planner semantics", () => {
    expect(taskMaterialResource(task({
      material_resource_id: "resource-1",
      resources: { id: "resource-1", name: "Tarih Notları", resource_type: "notes" },
    }))).toMatchObject({
      resourceId: "resource-1",
      resourceName: "Tarih Notları",
      plannedMinutes: 0,
      actualMinutes: 0,
      progressPercent: 0,
      remainingMinutes: 0,
      resourceType: "notes",
    });
  });

  it("returns null when a task has no material resource", () => {
    expect(taskMaterialResource(task())).toBeNull();
  });

  it("opens video work in video tab and other work in page tab", () => {
    expect(defaultTaskMaterialTab(task({ work_mode: "video" }))).toBe("video");
    expect(defaultTaskMaterialTab(task({ work_mode: "book" }))).toBe("page");
    expect(defaultTaskMaterialTab(task({ work_mode: null }))).toBe("page");
  });
});