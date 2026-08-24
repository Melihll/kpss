import { describe, expect, it } from "vitest";
import {
  summarizeCanonicalMaterialUnits,
} from "../supabase/functions/_shared/canonical-material-shadow";

describe("MAT-001 canonical material workload shadow", () => {
  it("calculates known physical and full-video remaining workload", () => {
    const result = summarizeCanonicalMaterialUnits("r1", [
      {
        resourceId: "r1",
        sourceKind: "physical",
        unitType: "page_range",
        pageStart: 10,
        pageEnd: 20,
        completedThroughPage: 12,
        estimatedMinutes: 30,
        progressState: "in_progress",
        plannerEligible: true,
        isActive: true,
      },
      {
        resourceId: "r1",
        sourceKind: "youtube",
        durationSeconds: 1000,
        watchedSeconds: 300,
        progressState: "in_progress",
        plannerEligible: true,
        isActive: true,
      },
    ]);

    expect(result).toEqual({
      resourceId: "r1",
      knownRemainingMinutes: 34,
      eligibleUnitCount: 2,
      unknownDurationUnitCount: 0,
      blockedUnitCount: 0,
      coverage: "complete",
    });
  });

  it("marks unresolved active material as partial instead of inventing parity", () => {
    const result = summarizeCanonicalMaterialUnits("r1", [
      {
        resourceId: "r1",
        sourceKind: "youtube",
        durationSeconds: 1000,
        watchedSeconds: 300,
        progressState: "in_progress",
        plannerEligible: true,
        isActive: true,
      },
      {
        resourceId: "r1",
        sourceKind: "youtube",
        durationSeconds: 1200,
        watchedSeconds: 0,
        progressState: "not_started",
        plannerEligible: false,
        isActive: true,
      },
    ]);

    expect(result.coverage).toBe("partial");
    expect(result.blockedUnitCount).toBe(1);
    expect(result.knownRemainingMinutes).toBe(12);
  });

  it("does not let inactive material reduce canonical coverage", () => {
    const result = summarizeCanonicalMaterialUnits("r1", [
      {
        resourceId: "r1",
        sourceKind: "physical",
        unitType: "reading",
        estimatedMinutes: 20,
        progressState: "not_started",
        plannerEligible: true,
        isActive: true,
      },
      {
        resourceId: "r1",
        sourceKind: "youtube",
        plannerEligible: false,
        isActive: false,
      },
    ]);

    expect(result.coverage).toBe("complete");
    expect(result.knownRemainingMinutes).toBe(20);
    expect(result.blockedUnitCount).toBe(0);
  });
});
