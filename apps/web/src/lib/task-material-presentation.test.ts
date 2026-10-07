import { describe, expect, it } from "vitest";
import { taskMaterialPresentation } from "./task-material-presentation";
import type { RoadmapTask } from "./roadmap";

const task = (material_scope: RoadmapTask["material_scope"]): RoadmapTask => ({
  id: "task-1",
  title: "Matematik",
  description: null,
  planned_date: "2026-09-29",
  estimated_minutes: 25,
  status: "ready",
  work_mode: "book",
  material_resource_id: "resource-1",
  resources: { id: "resource-1", name: "Yediiklim Matematik", resource_type: "book" },
  material_scope,
});

describe("task material presentation", () => {
  it("describes exact physical scope and progress", () => {
    expect(taskMaterialPresentation(task({
      kind: "page_range",
      resourceId: "resource-1",
      resourceUnitId: "unit-1",
      pageStart: 42,
      pageEnd: 56,
      completedThroughPage: 47,
      completed: false,
    }))).toMatchObject({
      scopeLabel: "Sayfa 42–56",
      progressLabel: "6 / 15 sayfa tamamlandı",
      exact: true,
    });
  });

  it("describes exact video identity and current watched time", () => {
    expect(taskMaterialPresentation(task({
      kind: "full_video",
      resourceId: "resource-1",
      youtubePlaylistVideoId: "video-8",
      title: "Sayı Basamakları",
      position: 8,
      durationSeconds: 1_680,
      watchedSeconds: 720,
      completed: false,
    }))).toMatchObject({
      scopeLabel: "Video 9 · Sayı Basamakları",
      progressLabel: "12 / 28 dk izlendi",
      exact: true,
    });
  });

  it("labels resource-only fallback without implying exact scope", () => {
    expect(taskMaterialPresentation(task({
      kind: "resource",
      resourceId: "resource-1",
    }))).toMatchObject({
      scopeLabel: "Kaynak detayı",
      progressLabel: "Göreve özel kapsam belirtilmemiş",
      exact: false,
    });
  });
});
