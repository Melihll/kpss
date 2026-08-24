import { describe, expect, it } from "vitest";
import { evaluateMaterialPlannerReadiness } from "./material-readiness";

describe("MAT-001 planner readiness", () => {
  it("marks a fully canonical active resource ready", () => {
    const result = evaluateMaterialPlannerReadiness({
      resourceId: "book-1",
      isActive: true,
      sectionCoverageComplete: true,
      unitCoverageComplete: true,
      topicMappingCoverageComplete: true,
      orderingValid: true,
      workloadMetadataComplete: true,
      unresolvedValidationIssues: 0,
    });

    expect(result.status).toBe("ready");
    expect(result.plannerReady).toBe(true);
  });

  it("marks incomplete canonical coverage partial", () => {
    const result = evaluateMaterialPlannerReadiness({
      resourceId: "book-1",
      isActive: true,
      sectionCoverageComplete: true,
      unitCoverageComplete: true,
      topicMappingCoverageComplete: false,
      orderingValid: true,
      workloadMetadataComplete: true,
      unresolvedValidationIssues: 0,
    });

    expect(result.status).toBe("partial");
    expect(result.plannerReady).toBe(false);
  });

  it("blocks a resource with structural validation issues", () => {
    const result = evaluateMaterialPlannerReadiness({
      resourceId: "book-1",
      isActive: true,
      sectionCoverageComplete: true,
      unitCoverageComplete: true,
      topicMappingCoverageComplete: true,
      orderingValid: false,
      workloadMetadataComplete: true,
      unresolvedValidationIssues: 2,
    });

    expect(result.status).toBe("blocked");
    expect(result.plannerReady).toBe(false);
  });

  it("keeps inactive material outside new planning", () => {
    const result = evaluateMaterialPlannerReadiness({
      resourceId: "book-1",
      isActive: false,
      sectionCoverageComplete: true,
      unitCoverageComplete: true,
      topicMappingCoverageComplete: true,
      orderingValid: true,
      workloadMetadataComplete: true,
      unresolvedValidationIssues: 0,
    });

    expect(result.status).toBe("inactive");
    expect(result.plannerReady).toBe(false);
  });
});
