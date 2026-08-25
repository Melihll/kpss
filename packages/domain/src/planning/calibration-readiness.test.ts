import { describe, expect, it } from "vitest";
import {
  calibrationEvidenceExclusionReason,
  estimatePhysicalPace,
  evaluateCalibrationReadiness,
  toPlannerV2WorkloadHandoff,
  type EstimatePhysicalPaceRequest,
  type MaterialWorkloadEstimate,
  type WorkloadEvidence,
} from "./canonical-workload";

function sample(overrides: Partial<WorkloadEvidence> = {}): WorkloadEvidence {
  return {
    id: "w2-1",
    userId: "user-1",
    examProfileId: "profile-1",
    sourceKind: "physical_pace_evidence",
    resourceId: "resource-1",
    subjectId: "subject-1",
    curriculumNodeId: "node-1",
    materialType: "page_range",
    actualMinutes: 20,
    progressAmount: 10,
    progressUnit: "page",
    sampleStart: "2026-08-01T09:00:00.000Z",
    sampleEnd: "2026-08-01T09:20:00.000Z",
    evidenceQuality: ["actual_elapsed_time", "actual_progress_delta"],
    provenance: "physical_pace_evidence:atomic_physical_finish",
    evidenceStatus: "accepted",
    causalActivityId: "session-1",
    startPageBoundary: 0,
    endPageBoundary: 10,
    ...overrides,
  };
}

function request(evidence: readonly WorkloadEvidence[]): EstimatePhysicalPaceRequest {
  return {
    userId: "user-1",
    examProfileId: "profile-1",
    resourceId: "resource-1",
    subjectId: "subject-1",
    materialType: "page_range",
    evidence,
  };
}

describe("W4 calibration readiness", () => {
  it("keeps zero accepted W2 evidence unknown", () => {
    expect(evaluateCalibrationReadiness(request([]))).toMatchObject({
      scope: "none",
      compatibleSampleCount: 0,
      pace: null,
      confidence: "none",
      authority: "unknown",
      usableForShadow: false,
      usableForPlanner: false,
      blockedReason: "accepted_w2_evidence_unavailable",
    });
  });

  it("makes one exact-resource sample visible in shadow but insufficient for planning", () => {
    expect(evaluateCalibrationReadiness(request([sample()]))).toMatchObject({
      scope: "resource_material_type",
      hierarchyReason: "exact_resource_compatible_evidence_won",
      compatibleSampleCount: 1,
      pace: 2,
      confidence: "low",
      authority: "calibrated",
      usableForShadow: true,
      usableForPlanner: false,
      blockedReason: "confidence_insufficient",
    });
  });

  it("promotes three compatible exact-resource samples to medium readiness", () => {
    const evidence = Array.from({ length: 3 }, (_, index) => sample({
      id: `w2-${index}`,
      causalActivityId: `session-${index}`,
    }));
    expect(evaluateCalibrationReadiness(request(evidence))).toMatchObject({
      compatibleSampleCount: 3,
      totalObservedMinutes: 60,
      totalProgressAmount: 30,
      pace: 2,
      confidence: "medium",
      usableForPlanner: true,
      blockedReason: null,
    });
  });

  it.each([
    ["candidate status", sample({ evidenceStatus: "candidate" }), "status_not_accepted"],
    ["historical pseudo-sample", sample({ sourceKind: "test_result_completion" }), "non_w2_source"],
    ["other user", sample({ userId: "user-2" }), "cross_user"],
    ["other profile", sample({ examProfileId: "profile-2" }), "cross_profile"],
    ["other material type", sample({ materialType: "test" }), "incompatible_material_type"],
    ["missing activity identity", sample({ causalActivityId: null }), "missing_causal_activity"],
    ["zero progress", sample({ progressAmount: 0, endPageBoundary: 0 }), "zero_progress"],
    ["malformed boundaries", sample({ progressAmount: 10, endPageBoundary: 11 }), "malformed_boundaries"],
    ["invalid active time", sample({ actualMinutes: 0 }), "invalid_active_time"],
  ] as const)("excludes %s", (_label, evidence, reason) => {
    expect(calibrationEvidenceExclusionReason(evidence, request([]))).toBe(reason);
    expect(estimatePhysicalPace(request([evidence]))).toBeNull();
  });

  it("uses a deterministic median session pace so one extreme session cannot dominate", () => {
    const evidence = [
      sample({ id: "b", causalActivityId: "b", actualMinutes: 20 }),
      sample({ id: "a", causalActivityId: "a", actualMinutes: 1000 }),
      sample({ id: "c", causalActivityId: "c", actualMinutes: 20 }),
    ];
    const forward = estimatePhysicalPace(request(evidence));
    const reverse = estimatePhysicalPace(request([...evidence].reverse()));
    expect(forward).toMatchObject({
      pace: 2,
      aggregationPolicy: "median_session_minutes_per_page",
      totalObservedMinutes: 1040,
      totalObservedProgress: 30,
    });
    expect(reverse).toEqual(forward);
  });

  it("blocks unknown workload at the Planner V2 boundary", () => {
    const estimate: MaterialWorkloadEstimate = {
      materialViewId: "physical:span",
      sourceKind: "physical",
      resourceId: "resource-1",
      subjectId: "subject-1",
      materialType: "page_range",
      remainingAmount: 10,
      remainingUnit: "page",
      estimatedMinutes: null,
      authority: "unknown",
      confidence: "low",
      plannerEligible: false,
      reason: "pace_confidence_insufficient",
      evidence: {
        scope: "resource_material_type",
        sampleCount: 1,
        totalObservedMinutes: 20,
        provenance: ["physical_pace_evidence:atomic_physical_finish"],
      },
    };
    expect(toPlannerV2WorkloadHandoff(estimate)).toMatchObject({
      estimatedMinutes: null,
      workloadAuthority: "unknown",
      plannerEligible: false,
      unresolvedWorkloadReason: "pace_confidence_insufficient",
    });
  });
});
