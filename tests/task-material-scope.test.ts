import { describe, expect, it } from "vitest";
import { projectTaskMaterialScope } from "../supabase/functions/_shared/task-material-scope";

const emptyEvidence = () => ({
  unitProgressById: new Map<string, any>(),
  videoById: new Map<string, any>(),
  videoProgressById: new Map<string, any>(),
});

function physicalTask(overrides: Record<string, unknown> = {}) {
  return {
    canonical_boundary: {
      kind: "physical_pages",
      pageStart: 40,
      pageEnd: 60,
      remainingPageStart: 42,
      remainingPageEnd: 56,
    },
    task_resource_units: [{
      resource_unit_id: "unit-1",
      status: "pending",
      resource_units: {
        id: "unit-1",
        resource_id: "resource-1",
        page_start: 40,
        page_end: 60,
      },
    }],
    ...overrides,
  };
}

describe("task material scope projection", () => {
  it("projects the persisted Planner physical boundary with current unit progress", () => {
    const evidence = emptyEvidence();
    evidence.unitProgressById.set("unit-1", {
      status: "in_progress",
      completed_through_page: 49,
    });

    expect(projectTaskMaterialScope(physicalTask(), "resource-1", evidence)).toEqual({
      kind: "page_range",
      resourceId: "resource-1",
      resourceUnitId: "unit-1",
      pageStart: 42,
      pageEnd: 56,
      completedThroughPage: 49,
      completed: false,
    });
  });

  it("uses one linked legacy page unit but does not merge multiple units", () => {
    const legacy = physicalTask({ canonical_boundary: null });
    expect(projectTaskMaterialScope(legacy, "resource-1", emptyEvidence())).toMatchObject({
      kind: "page_range",
      pageStart: 40,
      pageEnd: 60,
    });

    const multiple = {
      ...legacy,
      task_resource_units: [
        ...legacy.task_resource_units,
        {
          resource_unit_id: "unit-2",
          status: "pending",
          resource_units: {
            id: "unit-2",
            resource_id: "resource-1",
            page_start: 61,
            page_end: 80,
          },
        },
      ],
    };
    expect(projectTaskMaterialScope(multiple, "resource-1", emptyEvidence())).toEqual({
      kind: "resource",
      resourceId: "resource-1",
    });
  });

  it("projects exact video identity and live progress from persisted records", () => {
    const evidence = emptyEvidence();
    evidence.videoById.set("video-8", {
      id: "video-8",
      title: "Sayı Basamakları",
      position: 8,
      duration_seconds: 1_680,
    });
    evidence.videoProgressById.set("video-8", {
      watched_seconds: 720,
      completed_at: null,
    });

    expect(projectTaskMaterialScope({
      canonical_boundary: {
        kind: "full_video",
        videoId: "video-8",
        durationSeconds: 1_680,
        watchedSeconds: 300,
      },
      task_resource_units: [],
    }, "resource-1", evidence)).toEqual({
      kind: "full_video",
      resourceId: "resource-1",
      youtubePlaylistVideoId: "video-8",
      title: "Sayı Basamakları",
      position: 8,
      durationSeconds: 1_680,
      watchedSeconds: 720,
      completed: false,
    });
  });

  it("falls back without interpreting title or opaque identity", () => {
    expect(projectTaskMaterialScope({
      title: "Sayfa 42-56 · Video 8",
      canonical_workload_identity: "youtube:opaque",
      canonical_boundary: null,
      task_resource_units: [],
    }, "resource-1", emptyEvidence())).toEqual({
      kind: "resource",
      resourceId: "resource-1",
    });
    expect(projectTaskMaterialScope({}, null, emptyEvidence())).toBeNull();
  });
});
