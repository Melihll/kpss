import { describe, expect, it } from "vitest";
import { normalizeMaterialUnit } from "./material-unit-view";
import { proposeCompletedUpToHere } from "./material-progress-import";

function makeUnit(
  id: string,
  sortOrder: number,
  options: {
    resourceId?: string;
    progressState?: "not_started" | "in_progress" | "completed" | "skipped";
    isActive?: boolean;
    mappingStatus?: "validated" | "ambiguous";
  } = {},
) {
  return normalizeMaterialUnit({
    sourceKind: "physical",
    id,
    resourceId: options.resourceId ?? "book-1",
    curriculumNodeId: "topic-1",
    sourceUnitType: "test",
    title: id,
    sortOrder,
    estimatedMinutes: 20,
    progressState: options.progressState ?? "not_started",
    mappingStatus: options.mappingStatus ?? "validated",
    mappingProvenance: "reviewed_catalog",
    isActive: options.isActive ?? true,
  });
}

describe("MAT-001 completed-up-to-here proposal", () => {
  it("proposes all eligible earlier units through the selected boundary", () => {
    const units = [makeUnit("u1", 1), makeUnit("u2", 2), makeUnit("u3", 3), makeUnit("u4", 4)];

    const result = proposeCompletedUpToHere({
      units,
      resourceId: "book-1",
      boundaryUnitId: "physical:u3",
    });

    expect(result.boundaryFound).toBe(true);
    expect(result.proposedUnitIds).toEqual(["physical:u1", "physical:u2", "physical:u3"]);
    expect(result.canApplyWithoutReview).toBe(true);
  });

  it("preserves already completed units as unchanged history", () => {
    const result = proposeCompletedUpToHere({
      units: [
        makeUnit("u1", 1, { progressState: "completed" }),
        makeUnit("u2", 2),
      ],
      resourceId: "book-1",
      boundaryUnitId: "physical:u2",
    });

    expect(result.unchangedCompletedUnitIds).toEqual(["physical:u1"]);
    expect(result.proposedUnitIds).toEqual(["physical:u2"]);
  });

  it("does not touch units after the selected boundary", () => {
    const result = proposeCompletedUpToHere({
      units: [makeUnit("u1", 1), makeUnit("u2", 2), makeUnit("u3", 3)],
      resourceId: "book-1",
      boundaryUnitId: "physical:u2",
    });

    expect(result.proposedUnitIds).not.toContain("physical:u3");
  });

  it("surfaces skipped material instead of blindly overwriting it", () => {
    const result = proposeCompletedUpToHere({
      units: [
        makeUnit("u1", 1),
        makeUnit("u2", 2, { progressState: "skipped" }),
        makeUnit("u3", 3),
      ],
      resourceId: "book-1",
      boundaryUnitId: "physical:u3",
    });

    expect(result.canApplyWithoutReview).toBe(false);
    expect(result.conflicts).toContainEqual({
      unitId: "physical:u2",
      reason: "skipped_unit",
    });
  });

  it("surfaces inactive and ambiguous material for review", () => {
    const result = proposeCompletedUpToHere({
      units: [
        makeUnit("u1", 1, { isActive: false }),
        makeUnit("u2", 2, { mappingStatus: "ambiguous" }),
        makeUnit("u3", 3),
      ],
      resourceId: "book-1",
      boundaryUnitId: "physical:u3",
    });

    expect(result.canApplyWithoutReview).toBe(false);
    expect(result.conflicts.map((item) => item.reason)).toEqual([
      "inactive_unit",
      "mapping_not_validated",
    ]);
  });

  it("fails safely when the boundary does not exist in the requested resource", () => {
    const result = proposeCompletedUpToHere({
      units: [makeUnit("u1", 1), makeUnit("u2", 2)],
      resourceId: "book-1",
      boundaryUnitId: "physical:missing",
    });

    expect(result.boundaryFound).toBe(false);
    expect(result.canApplyWithoutReview).toBe(false);
    expect(result.proposedUnitIds).toEqual([]);
  });
});
