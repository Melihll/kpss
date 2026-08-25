import { describe, expect, it } from "vitest";
import { summarizeCalibrationShadow } from "../supabase/functions/_shared/canonical-material-shadow";
import { estimateCanonicalMaterialWorkload, type WorkloadEvidence } from "../packages/domain/src/planning/canonical-workload";

const material = {
  id: "physical:section:gap", sourceId: "section:gap", sourceKind: "physical" as const,
  resourceId: "resource-1", curriculumNodeId: "node-1", unitType: "page_range" as const,
  title: "Pages 1-10", sortOrder: 1, pageStart: 1, pageEnd: 10,
  durationSeconds: null, watchedSeconds: null, lastPositionSeconds: null,
  mappingId: null, segmentStartSeconds: null, segmentEndSeconds: null,
  estimatedMinutes: 999, progressState: "not_started" as const,
  completedThroughPage: null, completedAt: null, mappingStatus: "validated" as const,
  mappingProvenance: "reviewed_catalog" as const, isActive: true, plannerEligible: false,
};

function sample(index: number): WorkloadEvidence {
  return {
    id: `w2-${index}`, userId: "user-1", examProfileId: "profile-1",
    sourceKind: "physical_pace_evidence", resourceId: "resource-1", subjectId: "subject-1",
    curriculumNodeId: "node-1", materialType: "page_range", actualMinutes: 20,
    progressAmount: 10, progressUnit: "page", sampleStart: null, sampleEnd: null,
    evidenceQuality: ["actual_elapsed_time", "actual_progress_delta"],
    provenance: "physical_pace_evidence:atomic_physical_finish", evidenceStatus: "accepted",
    causalActivityId: `session-${index}`, startPageBoundary: 0, endPageBoundary: 10,
  };
}

describe("W4 calibration shadow report", () => {
  it("reports global, scope, material, YouTube, and total readiness without identifiers", () => {
    const evidence = [sample(1), sample(2), sample(3)];
    const estimate = estimateCanonicalMaterialWorkload({
      userId: "user-1", examProfileId: "profile-1", subjectId: "subject-1",
      material, evidence,
    });
    const report = summarizeCalibrationShadow(
      "user-1", "profile-1", [material], evidence, [estimate],
    );

    expect(report.global).toMatchObject({
      totalAcceptedPhysicalEvidence: 3,
      totalUsablePaceSamples: 3,
    });
    expect(report.scope).toMatchObject({
      exactResourceReadyScopes: 1,
      subjectTypeReadyScopes: 1,
      typeReadyScopes: 1,
      mediumHighScopes: 3,
      confidenceDistribution: { low: 0, medium: 3, high: 0 },
    });
    expect(report.material).toMatchObject({
      physicalViewsCalibrated: 1,
      physicalPagesCalibrated: 10,
      physicalPagesUnknown: 0,
      physicalEstimatedRemainingMinutes: 20,
      plannerEligibleCalibratedViews: 1,
    });
    expect(JSON.stringify(report.scope.calibratedScopes)).not.toContain("resource-1");
    expect(report.youtube).toEqual({ exactViews: 0, exactRemainingMinutes: 0 });
  });
});
