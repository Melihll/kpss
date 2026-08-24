import { describe, expect, it } from "vitest";
import { normalizeMaterialUnit } from "./material-unit-view";
import { calculateRemainingMaterialScope } from "./material-remaining-scope";

describe("MAT-001 remaining material scope", () => {
  it("returns only unfinished physical scope and trims a partially completed page range", () => {
    const units = [
      normalizeMaterialUnit({
        sourceKind: "physical",
        id: "pages-42-47",
        resourceId: "book-1",
        curriculumNodeId: "topic-1",
        sourceUnitType: "reading",
        title: "Pages 42-47",
        sortOrder: 1,
        pageStart: 42,
        pageEnd: 47,
        estimatedMinutes: 20,
        progressState: "completed",
        completedThroughPage: 47,
        mappingStatus: "validated",
        mappingProvenance: "reviewed_catalog" as const,
        isActive: true,
      }),
      normalizeMaterialUnit({
        sourceKind: "physical",
        id: "pages-48-53",
        resourceId: "book-1",
        curriculumNodeId: "topic-1",
        sourceUnitType: "reading",
        title: "Pages 48-53",
        sortOrder: 2,
        pageStart: 48,
        pageEnd: 53,
        estimatedMinutes: 20,
        progressState: "in_progress",
        completedThroughPage: 49,
        mappingStatus: "validated",
        mappingProvenance: "reviewed_catalog" as const,
        isActive: true,
      }),
      normalizeMaterialUnit({
        sourceKind: "physical",
        id: "test-3",
        resourceId: "book-1",
        curriculumNodeId: "topic-1",
        sourceUnitType: "test",
        title: "Test 3",
        sortOrder: 3,
        estimatedMinutes: 25,
        progressState: "not_started",
        mappingStatus: "validated",
        mappingProvenance: "reviewed_catalog" as const,
        isActive: true,
      }),
    ];

    const scope = calculateRemainingMaterialScope({
      units,
      resourceId: "book-1",
      curriculumNodeId: "topic-1",
    });

    expect(scope.map((unit) => unit.id)).toEqual([
      "physical:pages-48-53",
      "physical:test-3",
    ]);

    expect(scope[0]).toMatchObject({
      remainingPageStart: 50,
      remainingPageEnd: 53,
    });
  });

  it("calculates real remaining seconds for a partially watched YouTube video", () => {
    const units = [normalizeMaterialUnit({
      sourceKind: "youtube",
      id: "video-6",
      resourceId: "course-1",
      curriculumNodeId: "topic-1",
      title: "Video 6",
      sortOrder: 6,
      durationSeconds: 1638,
      watchedSeconds: 600,
      completedAt: null,
      mappingStatus: "validated",
      mappingProvenance: "reviewed_mapping",
      isActive: true,
    })];

    const scope = calculateRemainingMaterialScope({
      units,
      resourceId: "course-1",
      curriculumNodeId: "topic-1",
    });

    expect(scope).toHaveLength(1);
    const first = scope[0];
    if (!first) throw new Error("Expected one remaining YouTube unit");
    expect(first.remainingSeconds).toBe(1038);
  });

  it("excludes completed, skipped, inactive and ambiguously mapped units from automatic scope", () => {
    const make = (
      id: string,
      progressState: "not_started" | "completed" | "skipped",
      isActive = true,
      mappingStatus: "validated" | "ambiguous" = "validated",
    ) => normalizeMaterialUnit({
      sourceKind: "physical" as const,
      id,
      resourceId: "book-2",
      curriculumNodeId: "topic-2",
      sourceUnitType: "test" as const,
      title: id,
      sortOrder: Number(id.replace(/\D/g, "")) || 1,
      estimatedMinutes: 20,
      progressState,
      mappingStatus,
      mappingProvenance: "reviewed_catalog" as const,
      isActive,
    });

    const scope = calculateRemainingMaterialScope({
      resourceId: "book-2",
      curriculumNodeId: "topic-2",
      units: [
        make("test-1", "completed"),
        make("test-2", "skipped"),
        make("test-3", "not_started", false),
        make("test-4", "not_started", true, "ambiguous"),
        make("test-5", "not_started"),
      ],
    });

    expect(scope.map((unit) => unit.id)).toEqual(["physical:test-5"]);
  });

  it("does not cross into another curriculum topic or resource", () => {
    const base = {
      sourceKind: "physical" as const,
      sourceUnitType: "test" as const,
      title: "Test",
      estimatedMinutes: 20,
      progressState: "not_started" as const,
      mappingStatus: "validated" as const,
      mappingProvenance: "reviewed_catalog" as const,
      isActive: true,
    };

    const units = [
      normalizeMaterialUnit({ ...base, id: "wanted", resourceId: "book-1", curriculumNodeId: "topic-1", sortOrder: 1 }),
      normalizeMaterialUnit({ ...base, id: "other-topic", resourceId: "book-1", curriculumNodeId: "topic-2", sortOrder: 2 }),
      normalizeMaterialUnit({ ...base, id: "other-resource", resourceId: "book-2", curriculumNodeId: "topic-1", sortOrder: 3 }),
    ];

    const scope = calculateRemainingMaterialScope({
      units,
      resourceId: "book-1",
      curriculumNodeId: "topic-1",
    });

    expect(scope.map((unit) => unit.id)).toEqual(["physical:wanted"]);
  });

  it("returns canonical deterministic order regardless of input order", () => {
    const create = (id: string, sortOrder: number) => normalizeMaterialUnit({
      sourceKind: "physical" as const,
      id,
      resourceId: "book-3",
      curriculumNodeId: "topic-3",
      sourceUnitType: "test" as const,
      title: id,
      sortOrder,
      estimatedMinutes: 20,
      progressState: "not_started" as const,
      mappingStatus: "validated" as const,
      mappingProvenance: "reviewed_catalog" as const,
      isActive: true,
    });

    const scope = calculateRemainingMaterialScope({
      units: [create("test-3", 3), create("test-1", 1), create("test-2", 2)],
      resourceId: "book-3",
      curriculumNodeId: "topic-3",
    });

    expect(scope.map((unit) => unit.sourceId)).toEqual(["test-1", "test-2", "test-3"]);
  });

  it("uses the same remaining-scope engine without subject identity", () => {
    const build = (resourceId: string, topicId: string, unitId: string) =>
      normalizeMaterialUnit({
        sourceKind: "physical" as const,
        id: unitId,
        resourceId,
        curriculumNodeId: topicId,
        sourceUnitType: "chapter" as const,
        title: "Unit",
        sortOrder: 1,
        estimatedMinutes: 30,
        progressState: "not_started" as const,
        mappingStatus: "validated" as const,
        mappingProvenance: "reviewed_catalog" as const,
        isActive: true,
      });

    const math = calculateRemainingMaterialScope({
      units: [build("math-book", "math-topic", "math-unit")],
      resourceId: "math-book",
      curriculumNodeId: "math-topic",
    });

    const history = calculateRemainingMaterialScope({
      units: [build("history-book", "history-topic", "history-unit")],
      resourceId: "history-book",
      curriculumNodeId: "history-topic",
    });

    const mathFirst = math[0];
    const historyFirst = history[0];
    if (!mathFirst || !historyFirst) {
      throw new Error("Expected equivalent subject-agnostic remaining units");
    }
    expect(mathFirst.unitType).toBe(historyFirst.unitType);
    expect(mathFirst.remainingSeconds).toBe(historyFirst.remainingSeconds);
  });
});
