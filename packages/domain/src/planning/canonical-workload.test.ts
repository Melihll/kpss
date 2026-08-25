import { describe, expect, it } from "vitest";
import {
  estimateCanonicalMaterialWorkload,
  estimatePhysicalPace,
  summarizeCanonicalWorkload,
  type WorkloadEvidence,
} from "./canonical-workload";
import type { MaterialUnitView } from "./material-unit-view";

const basePhysical: MaterialUnitView = {
  id: "physical:u1",
  sourceId: "u1",
  sourceKind: "physical",
  resourceId: "r1",
  curriculumNodeId: "topic1",
  unitType: "page_range",
  title: "Pages 10-19",
  sortOrder: 1,
  pageStart: 10,
  pageEnd: 19,
  durationSeconds: null,
  watchedSeconds: null,
  lastPositionSeconds: null,
  mappingId: null,
  segmentStartSeconds: null,
  segmentEndSeconds: null,
  estimatedMinutes: 999,
  progressState: "not_started",
  completedThroughPage: null,
  completedAt: null,
  mappingStatus: "validated",
  mappingProvenance: "reviewed_catalog",
  isActive: true,
  plannerEligible: true,
};

const evidence = (overrides: Partial<WorkloadEvidence> = {}): WorkloadEvidence => ({
  id: "e1",
  userId: "user1",
  examProfileId: "profile1",
  sourceKind: "physical_pace_evidence",
  resourceId: "r1",
  subjectId: "subject1",
  curriculumNodeId: "topic1",
  materialType: "page_range",
  actualMinutes: 30,
  progressAmount: 10,
  progressUnit: "page",
  sampleStart: "2026-08-01T09:00:00.000Z",
  sampleEnd: "2026-08-01T09:30:00.000Z",
  evidenceQuality: ["actual_elapsed_time", "actual_progress_delta"],
  provenance: "record_test_result:first_completion",
  evidenceStatus: "accepted",
  causalActivityId: "session1",
  startPageBoundary: 0,
  endPageBoundary: 10,
  ...overrides,
});

const request = (material: MaterialUnitView, observations: WorkloadEvidence[] = []) => ({
  userId: "user1",
  examProfileId: "profile1",
  subjectId: "subject1",
  material,
  evidence: observations,
});

describe("MAT-001 canonical workload engine", () => {
  it("returns exact zero for a completed physical unit without using fabricated duration", () => {
    const result = estimateCanonicalMaterialWorkload(request({
      ...basePhysical,
      progressState: "completed",
      estimatedMinutes: 999,
    }));

    expect(result).toMatchObject({
      remainingAmount: 0,
      remainingUnit: "page",
      estimatedMinutes: 0,
      authority: "exact",
      confidence: "high",
      plannerEligible: true,
      reason: "completed",
    });
  });

  it("uses an authoritative partial page boundary", () => {
    const samples = Array.from({ length: 3 }, (_, index) => evidence({
      id: `e${index}`,
      actualMinutes: 20,
      progressAmount: 10,
    }));
    const result = estimateCanonicalMaterialWorkload(request({
      ...basePhysical,
      progressState: "in_progress",
      completedThroughPage: 14,
    }, samples));

    expect(result).toMatchObject({
      remainingAmount: 5,
      remainingUnit: "page",
      estimatedMinutes: 10,
      authority: "calibrated",
      confidence: "medium",
      plannerEligible: true,
    });
  });

  it("calibrates an in-memory structural span with inclusive page arithmetic and ceil rounding", () => {
    const samples = Array.from({ length: 3 }, (_, index) => evidence({
      id: `span-e${index}`,
      causalActivityId: `span-session-${index}`,
      actualMinutes: 25,
      progressAmount: 10,
    }));
    const result = estimateCanonicalMaterialWorkload(request({
      ...basePhysical,
      id: "physical:section:sec1:gap:10-19",
      sourceId: "section:sec1:gap:10-19",
      estimatedMinutes: 999,
      plannerEligible: false,
    }, samples));

    expect(result).toMatchObject({
      remainingAmount: 10,
      estimatedMinutes: 25,
      authority: "calibrated",
      confidence: "medium",
      plannerEligible: true,
      reason: "pace_calibrated",
    });
  });

  it("blocks an invalid physical progress boundary", () => {
    const result = estimateCanonicalMaterialWorkload(request({
      ...basePhysical,
      progressState: "in_progress",
      completedThroughPage: 20,
    }, [evidence()]));

    expect(result).toMatchObject({
      estimatedMinutes: null,
      authority: "unknown",
      plannerEligible: false,
      reason: "invalid_progress_boundary",
    });
  });

  it("keeps a physical span with no pace evidence unknown and blocked", () => {
    const result = estimateCanonicalMaterialWorkload(request({
      ...basePhysical,
      estimatedMinutes: 1234,
    }));

    expect(result).toMatchObject({
      remainingAmount: 10,
      estimatedMinutes: null,
      authority: "unknown",
      confidence: "none",
      plannerEligible: false,
      reason: "pace_evidence_unavailable",
    });
  });

  it("counts a known physical range as unknown workload even when topic mapping is missing", () => {
    const result = estimateCanonicalMaterialWorkload(request({
      ...basePhysical,
      mappingStatus: "missing",
      curriculumNodeId: null,
      plannerEligible: false,
    }));

    expect(result).toMatchObject({
      remainingAmount: 10,
      estimatedMinutes: null,
      authority: "unknown",
      plannerEligible: false,
      reason: "mapping_missing",
    });
  });

  it("ranks exact-resource pace above subject/type pace", () => {
    const observations = [
      ...Array.from({ length: 3 }, (_, i) => evidence({ id: `subject-${i}`, resourceId: "other", actualMinutes: 10 })),
      ...Array.from({ length: 3 }, (_, i) => evidence({ id: `resource-${i}`, actualMinutes: 30 })),
    ];
    const pace = estimatePhysicalPace({
      userId: "user1",
      examProfileId: "profile1",
      resourceId: "r1",
      subjectId: "subject1",
      materialType: "page_range",
      evidence: observations,
    });

    expect(pace).toMatchObject({ pace: 3, scope: "resource_material_type", sampleCount: 3 });
  });

  it("ranks subject/type pace above generic type pace", () => {
    const observations = [
      ...Array.from({ length: 3 }, (_, i) => evidence({ id: `generic-${i}`, resourceId: "other", subjectId: "other-subject", actualMinutes: 10 })),
      ...Array.from({ length: 3 }, (_, i) => evidence({ id: `subject-${i}`, resourceId: "other", actualMinutes: 30 })),
    ];
    const pace = estimatePhysicalPace({
      userId: "user1",
      examProfileId: "profile1",
      resourceId: "r1",
      subjectId: "subject1",
      materialType: "page_range",
      evidence: observations,
    });

    expect(pace).toMatchObject({ pace: 3, scope: "subject_material_type", sampleCount: 3 });
  });

  it("never leaks incompatible evidence across material types", () => {
    const pace = estimatePhysicalPace({
      userId: "user1",
      examProfileId: "profile1",
      resourceId: "r1",
      subjectId: "subject1",
      materialType: "page_range",
      evidence: [evidence({ materialType: "test" })],
    });

    expect(pace).toBeNull();
  });

  it("does not claim high confidence or planner eligibility from insufficient evidence", () => {
    const result = estimateCanonicalMaterialWorkload(request(basePhysical, [evidence()]));

    expect(result).toMatchObject({
      authority: "unknown",
      estimatedMinutes: null,
      confidence: "low",
      plannerEligible: false,
      reason: "pace_confidence_insufficient",
    });
  });

  it("uses only an explicit fallback policy and requires separate planning authorization", () => {
    const fallback = {
      materialType: "page_range" as const,
      minutesPerPage: 4,
      confidence: "medium" as const,
      provenance: "reviewed_product_policy:v1",
      authorizedForPlanning: false,
    };
    const blocked = estimateCanonicalMaterialWorkload({
      ...request(basePhysical),
      fallbackPolicies: [fallback],
    });
    const authorized = estimateCanonicalMaterialWorkload({
      ...request(basePhysical),
      fallbackPolicies: [{ ...fallback, authorizedForPlanning: true }],
    });

    expect(blocked).toMatchObject({
      authority: "fallback",
      estimatedMinutes: 40,
      confidence: "medium",
      plannerEligible: false,
      reason: "fallback_not_authorized_for_planning",
    });
    expect(authorized).toMatchObject({
      authority: "fallback",
      estimatedMinutes: 40,
      plannerEligible: true,
      reason: "configured_fallback",
    });
  });

  it("calculates exact full-video remaining workload from watched seconds", () => {
    const result = estimateCanonicalMaterialWorkload(request({
      ...basePhysical,
      id: "youtube:v1:mapping:m1",
      sourceId: "v1",
      sourceKind: "youtube",
      unitType: "video",
      durationSeconds: 301,
      watchedSeconds: 120,
      lastPositionSeconds: 250,
      mappingId: "m1",
      pageStart: null,
      pageEnd: null,
      estimatedMinutes: null,
    }));

    expect(result).toMatchObject({
      remainingAmount: 181,
      remainingUnit: "video_second",
      estimatedMinutes: 4,
      authority: "exact",
      confidence: "high",
      plannerEligible: true,
      reason: "authoritative_full_video",
    });
  });

  it("returns zero for a completed video", () => {
    const result = estimateCanonicalMaterialWorkload(request({
      ...basePhysical,
      id: "youtube:v1:mapping:m1",
      sourceId: "v1",
      sourceKind: "youtube",
      unitType: "video",
      durationSeconds: 301,
      watchedSeconds: 120,
      mappingId: "m1",
      pageStart: null,
      pageEnd: null,
      estimatedMinutes: null,
      progressState: "completed",
    }));

    expect(result).toMatchObject({ remainingAmount: 0, estimatedMinutes: 0, authority: "exact" });
  });

  it.each([
    ["unmapped", { mappingStatus: "missing", curriculumNodeId: null, plannerEligible: false }, "mapping_missing"],
    ["ambiguous", { mappingStatus: "ambiguous", plannerEligible: false }, "mapping_ambiguous"],
  ] as const)("blocks an %s video despite known duration", (_label, overrides, reason) => {
    const result = estimateCanonicalMaterialWorkload(request({
      ...basePhysical,
      id: "youtube:v1",
      sourceId: "v1",
      sourceKind: "youtube",
      unitType: "video",
      durationSeconds: 600,
      watchedSeconds: 0,
      pageStart: null,
      pageEnd: null,
      estimatedMinutes: null,
      ...overrides,
    }));
    expect(result).toMatchObject({ authority: "unknown", estimatedMinutes: null, plannerEligible: false, reason });
  });

  it("blocks segment mappings until segment progress exists", () => {
    const result = estimateCanonicalMaterialWorkload(request({
      ...basePhysical,
      id: "youtube:v1:mapping:m1",
      sourceId: "v1",
      sourceKind: "youtube",
      unitType: "video",
      durationSeconds: 600,
      watchedSeconds: 300,
      mappingId: "m1",
      segmentStartSeconds: 100,
      segmentEndSeconds: 200,
      pageStart: null,
      pageEnd: null,
      estimatedMinutes: null,
      plannerEligible: false,
    }));
    expect(result).toMatchObject({ authority: "unknown", estimatedMinutes: null, plannerEligible: false, reason: "segment_progress_unavailable" });
  });

  it("derives planner eligibility from authority, confidence, and canonical mapping", () => {
    const low = estimateCanonicalMaterialWorkload(request(basePhysical, [evidence()]));
    const medium = estimateCanonicalMaterialWorkload(request(basePhysical,
      Array.from({ length: 3 }, (_, index) => evidence({ id: `e${index}`, actualMinutes: 20 }))));
    const unmapped = estimateCanonicalMaterialWorkload(request({ ...basePhysical, plannerEligible: false, mappingStatus: "missing", curriculumNodeId: null },
      Array.from({ length: 3 }, (_, index) => evidence({ id: `e${index}`, actualMinutes: 20 }))));

    expect([low.plannerEligible, medium.plannerEligible, unmapped.plannerEligible]).toEqual([false, true, false]);
  });

  it("is deterministic regardless of evidence input order", () => {
    const observations = [evidence({ id: "b", actualMinutes: 20 }), evidence({ id: "a", actualMinutes: 30 }), evidence({ id: "c", actualMinutes: 10 })];
    const forward = estimateCanonicalMaterialWorkload(request(basePhysical, observations));
    const reverse = estimateCanonicalMaterialWorkload(request(basePhysical, [...observations].reverse()));
    expect(reverse).toEqual(forward);
  });

  it("summarizes authority, blocks, pages, confidence, and grouping", () => {
    const estimates = [
      estimateCanonicalMaterialWorkload(request(basePhysical)),
      estimateCanonicalMaterialWorkload(request({
        ...basePhysical,
        id: "youtube:v1:mapping:m1",
        sourceId: "v1",
        sourceKind: "youtube",
        unitType: "video",
        durationSeconds: 61,
        watchedSeconds: 0,
        mappingId: "m1",
        pageStart: null,
        pageEnd: null,
        estimatedMinutes: null,
      })),
    ];
    const summary = summarizeCanonicalWorkload(estimates);

    expect(summary).toMatchObject({
      totalMaterialViews: 2,
      exactWorkloadViews: 1,
      calibratedWorkloadViews: 0,
      fallbackWorkloadViews: 0,
      unknownWorkloadViews: 1,
      plannerEligibleViews: 1,
      exactYoutubeRemainingMinutes: 2,
      physicalPagesWithCalibratedWorkload: 0,
      physicalPagesWithUnknownWorkload: 10,
      blockedByReason: { pace_evidence_unavailable: 1 },
    });
  });
});
