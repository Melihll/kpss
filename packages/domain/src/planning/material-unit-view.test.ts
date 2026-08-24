import { describe, expect, it } from "vitest";
import { normalizeMaterialUnit } from "./material-unit-view";

describe("MAT-001 MaterialUnitView normalization", () => {
  it("normalizes a physical page range without losing exact pagination", () => {
    const unit = normalizeMaterialUnit({
      sourceKind: "physical",
      id: "unit-pages-42-53",
      resourceId: "book-1",
      curriculumNodeId: "topic-1",
      sourceUnitType: "reading",
      title: "EBOB-EKOK sayfa 42-53",
      sortOrder: 5,
      pageStart: 42,
      pageEnd: 53,
      estimatedMinutes: 35,
      progressState: "not_started",
      mappingStatus: "validated",
      mappingProvenance: "reviewed_catalog",
      isActive: true,
    });

    expect(unit).toMatchObject({
      id: "physical:unit-pages-42-53",
      sourceKind: "physical",
      resourceId: "book-1",
      curriculumNodeId: "topic-1",
      unitType: "page_range",
      pageStart: 42,
      pageEnd: 53,
      estimatedMinutes: 35,
      progressState: "not_started",
      plannerEligible: true,
    });
  });

  it("normalizes a physical test as an atomic test unit", () => {
    const unit = normalizeMaterialUnit({
      sourceKind: "physical",
      id: "test-3",
      resourceId: "question-bank-1",
      curriculumNodeId: "topic-1",
      sourceUnitType: "test",
      title: "Test 3",
      sortOrder: 6,
      estimatedMinutes: 25,
      progressState: "in_progress",
      mappingStatus: "validated",
      mappingProvenance: "reviewed_catalog",
      isActive: true,
    });

    expect(unit).toMatchObject({
      id: "physical:test-3",
      unitType: "test",
      progressState: "in_progress",
      plannerEligible: true,
    });
  });

  it("normalizes a partially watched YouTube video using real duration", () => {
    const unit = normalizeMaterialUnit({
      sourceKind: "youtube",
      id: "playlist-video-5",
      resourceId: "video-course-1",
      curriculumNodeId: "topic-1",
      title: "EBOB-EKOK 1",
      sortOrder: 5,
      durationSeconds: 1902,
      watchedSeconds: 600,
      completedAt: null,
      mappingStatus: "validated",
      mappingProvenance: "reviewed_mapping",
      isActive: true,
    });

    expect(unit).toMatchObject({
      id: "youtube:playlist-video-5",
      sourceKind: "youtube",
      unitType: "video",
      durationSeconds: 1902,
      progressState: "in_progress",
      plannerEligible: true,
    });
  });

  it("preserves completed YouTube execution history", () => {
    const unit = normalizeMaterialUnit({
      sourceKind: "youtube",
      id: "playlist-video-6",
      resourceId: "video-course-1",
      curriculumNodeId: "topic-1",
      title: "EBOB-EKOK 2",
      sortOrder: 6,
      durationSeconds: 1638,
      watchedSeconds: 1638,
      completedAt: "2026-08-20T10:00:00Z",
      mappingStatus: "validated",
      mappingProvenance: "reviewed_mapping",
      isActive: true,
    });

    expect(unit.progressState).toBe("completed");
    expect(unit.completedAt).toBe("2026-08-20T10:00:00Z");
  });

  it("keeps ambiguously mapped material out of authoritative exact-scope planning", () => {
    const unit = normalizeMaterialUnit({
      sourceKind: "youtube",
      id: "playlist-video-7",
      resourceId: "video-course-1",
      curriculumNodeId: null,
      title: "Mixed Topic Video",
      sortOrder: 7,
      durationSeconds: 2400,
      watchedSeconds: 0,
      completedAt: null,
      mappingStatus: "ambiguous",
      mappingProvenance: "ai_candidate",
      isActive: true,
    });

    expect(unit.curriculumNodeId).toBeNull();
    expect(unit.plannerEligible).toBe(false);
  });

  it("does not allow a validated AI-only mapping into authoritative planning", () => {
    const unit = normalizeMaterialUnit({
      sourceKind: "youtube",
      id: "ai-video",
      resourceId: "video-course-1",
      curriculumNodeId: "topic-1",
      title: "AI candidate mapping",
      sortOrder: 20,
      durationSeconds: 1800,
      watchedSeconds: 0,
      completedAt: null,
      mappingStatus: "validated",
      mappingProvenance: "ai_candidate",
      isActive: true,
    });

    expect(unit.mappingStatus).toBe("validated");
    expect(unit.mappingProvenance).toBe("ai_candidate");
    expect(unit.plannerEligible).toBe(false);
  });
  it("keeps inactive material historically visible but unavailable for new planning", () => {
    const unit = normalizeMaterialUnit({
      sourceKind: "physical",
      id: "old-test",
      resourceId: "book-1",
      curriculumNodeId: "topic-2",
      sourceUnitType: "test",
      title: "Old Test",
      sortOrder: 9,
      estimatedMinutes: 20,
      progressState: "completed",
      mappingStatus: "validated",
      mappingProvenance: "reviewed_catalog",
      isActive: false,
    });

    expect(unit.progressState).toBe("completed");
    expect(unit.plannerEligible).toBe(false);
  });
});
