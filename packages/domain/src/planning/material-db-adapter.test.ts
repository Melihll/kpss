import { describe, expect, it } from "vitest";
import {
  adaptPhysicalMaterialRow,
  adaptYoutubeMaterialRow,
  adaptYoutubeMaterialRows,
} from "./material-db-adapter";

describe("MAT-001 production material adapters", () => {
  it("adapts a real physical resource unit through its section topic mapping", () => {
    const unit = adaptPhysicalMaterialRow({
      unit: {
        id: "unit-1",
        resource_id: "book-1",
        resource_section_id: "section-1",
        unit_type: "reading",
        name: "EBOB-EKOK pages 42-53",
        sort_order: 1,
        page_start: 42,
        page_end: 53,
        estimated_minutes: 35,
        is_active: true,
      },
      section: {
        id: "section-1",
        resource_id: "book-1",
        curriculum_node_id: "topic-ebob",
        is_active: true,
      },
      progress: null,
      mappingProvenance: "reviewed_catalog",
    });

    expect(unit).toMatchObject({
      id: "physical:unit-1",
      resourceId: "book-1",
      curriculumNodeId: "topic-ebob",
      unitType: "page_range",
      pageStart: 42,
      pageEnd: 53,
      progressState: "not_started",
      plannerEligible: true,
    });
  });

  it("preserves physical completion from resource_unit_progress", () => {
    const unit = adaptPhysicalMaterialRow({
      unit: {
        id: "test-3",
        resource_id: "book-1",
        resource_section_id: "section-1",
        unit_type: "test",
        name: "Test 3",
        sort_order: 3,
        page_start: null,
        page_end: null,
        estimated_minutes: 25,
        is_active: true,
      },
      section: {
        id: "section-1",
        resource_id: "book-1",
        curriculum_node_id: "topic-ebob",
        is_active: true,
      },
      progress: {
        resource_unit_id: "test-3",
        status: "completed",
        completed_at: "2026-08-20T10:00:00Z",
      },
      mappingProvenance: "reviewed_catalog",
    });

    expect(unit.progressState).toBe("completed");
    expect(unit.completedAt).toBe("2026-08-20T10:00:00Z");
  });

  it("supports the future partial-page persistence field without requiring it today", () => {
    const unit = adaptPhysicalMaterialRow({
      unit: {
        id: "pages-48-53",
        resource_id: "book-1",
        resource_section_id: "section-1",
        unit_type: "reading",
        name: "Pages 48-53",
        sort_order: 2,
        page_start: 48,
        page_end: 53,
        estimated_minutes: 20,
        is_active: true,
      },
      section: {
        id: "section-1",
        resource_id: "book-1",
        curriculum_node_id: "topic-ebob",
        is_active: true,
      },
      progress: {
        resource_unit_id: "pages-48-53",
        status: "in_progress",
        completed_at: null,
        completed_through_page: 49,
      },
      mappingProvenance: "reviewed_catalog",
    });

    expect(unit.completedThroughPage).toBe(49);
  });

  it("keeps a physical unit without canonical section topic mapping out of exact planning", () => {
    const unit = adaptPhysicalMaterialRow({
      unit: {
        id: "unit-unmapped",
        resource_id: "book-2",
        resource_section_id: null,
        unit_type: "reading",
        name: "Unmapped pages",
        sort_order: 1,
        page_start: 10,
        page_end: 20,
        estimated_minutes: 20,
        is_active: true,
      },
      section: null,
      progress: null,
      mappingProvenance: "reviewed_catalog",
    });

    expect(unit.curriculumNodeId).toBeNull();
    expect(unit.plannerEligible).toBe(false);
  });

  it("keeps playlist videos non-authoritative when individual video-topic mapping is absent", () => {
    const unit = adaptYoutubeMaterialRow({
      video: {
        id: "playlist-video-5",
        youtube_playlist_id: "playlist-1",
        title: "EBOB-EKOK 1",
        position: 5,
        duration_seconds: 1902,
        is_active: true,
      },
      progress: null,
      resourceId: "video-course-1",
      mapping: null,
    });

    expect(unit.durationSeconds).toBe(1902);
    expect(unit.curriculumNodeId).toBeNull();
    expect(unit.plannerEligible).toBe(false);
  });

  it("adapts a reviewed individual video-topic mapping into exact planning", () => {
    const unit = adaptYoutubeMaterialRow({
      video: {
        id: "playlist-video-6",
        youtube_playlist_id: "playlist-1",
        title: "EBOB-EKOK 2",
        position: 6,
        duration_seconds: 1638,
        is_active: true,
      },
      progress: {
        youtube_playlist_video_id: "playlist-video-6",
        watched_seconds: 600,
        last_position_seconds: 600,
        completed_at: null,
      },
      resourceId: "video-course-1",
      mapping: {
        curriculum_node_id: "topic-ebob",
        mapping_status: "validated",
        mapping_provenance: "reviewed_mapping",
        is_active: true,
      },
    });

    expect(unit).toMatchObject({
      sourceKind: "youtube",
      resourceId: "video-course-1",
      curriculumNodeId: "topic-ebob",
      durationSeconds: 1638,
      watchedSeconds: 600,
      progressState: "in_progress",
      plannerEligible: true,
    });
  });

  it("keeps AI-only video mappings outside authoritative planning", () => {
    const unit = adaptYoutubeMaterialRow({
      video: {
        id: "playlist-video-7",
        youtube_playlist_id: "playlist-1",
        title: "Candidate video",
        position: 7,
        duration_seconds: 1800,
        is_active: true,
      },
      progress: null,
      resourceId: "video-course-1",
      mapping: {
        curriculum_node_id: "topic-x",
        mapping_status: "validated",
        mapping_provenance: "ai_candidate",
        is_active: true,
      },
    });

    expect(unit.plannerEligible).toBe(false);
  });
});

describe("MAT-001 M:N-safe YouTube material identity", () => {
  it("keeps M:N mappings canonically distinct and blocks conflicting full-video authority", () => {
    const units = adaptYoutubeMaterialRows({
      video: {
        id: "video-many",
        youtube_playlist_id: "playlist-1",
        title: "Multi-topic video",
        position: 3,
        duration_seconds: 1200,
        is_active: true,
      },
      progress: {
        youtube_playlist_video_id: "video-many",
        watched_seconds: 300,
        last_position_seconds: 450,
        completed_at: null,
      },
      resourceId: "course-1",
      mappings: [
        {
          id: "mapping-a",
          curriculum_node_id: "topic-a",
          mapping_status: "validated",
          mapping_provenance: "reviewed_mapping",
          is_active: true,
        },
        {
          id: "mapping-b",
          curriculum_node_id: "topic-b",
          mapping_status: "validated",
          mapping_provenance: "reviewed_mapping",
          is_active: true,
        },
      ],
    });

    expect(units.map((unit) => unit.id)).toEqual([
      "youtube:video-many:mapping:mapping-a",
      "youtube:video-many:mapping:mapping-b",
    ]);
    expect(units.every((unit) => unit.plannerEligible === false)).toBe(true);
    expect(units.every((unit) => unit.lastPositionSeconds === 450)).toBe(true);
  });

  it("preserves a validated segment but keeps it outside exact planning until segment progress exists", () => {
    const [unit] = adaptYoutubeMaterialRows({
      video: {
        id: "video-segment",
        youtube_playlist_id: "playlist-1",
        title: "Segmented video",
        position: 4,
        duration_seconds: 1800,
        is_active: true,
      },
      progress: {
        youtube_playlist_video_id: "video-segment",
        watched_seconds: 500,
        last_position_seconds: 650,
        completed_at: null,
      },
      resourceId: "course-1",
      mappings: [{
        id: "mapping-segment",
        curriculum_node_id: "topic-a",
        mapping_status: "validated",
        mapping_provenance: "reviewed_mapping",
        segment_start_seconds: 300,
        segment_end_seconds: 900,
        is_active: true,
      }],
    });

    expect(unit).toMatchObject({
      id: "youtube:video-segment:mapping:mapping-segment",
      segmentStartSeconds: 300,
      segmentEndSeconds: 900,
      watchedSeconds: 500,
      lastPositionSeconds: 650,
      plannerEligible: false,
    });
  });

  it("keeps one reviewed full-video mapping planner eligible", () => {
    const [unit] = adaptYoutubeMaterialRows({
      video: {
        id: "video-single",
        youtube_playlist_id: "playlist-1",
        title: "Single-topic video",
        position: 5,
        duration_seconds: 900,
        is_active: true,
      },
      progress: null,
      resourceId: "course-1",
      mappings: [{
        id: "mapping-single",
        curriculum_node_id: "topic-a",
        mapping_status: "validated",
        mapping_provenance: "reviewed_mapping",
        is_active: true,
      }],
    });

    expect(unit!.id).toBe("youtube:video-single:mapping:mapping-single");
    expect(unit!.plannerEligible).toBe(true);
  });
});
