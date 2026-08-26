import { describe, expect, it } from "vitest";
import type { PlannerV2WorkloadHandoff } from "../planning/canonical-workload";
import {
  CANONICAL_PLANNER_V2_VERSION,
  buildCanonicalPlannerV2Proposal,
  compareCanonicalPlannerV2Shadow,
  type CanonicalPlannerV2Demand,
  type CanonicalPlannerV2Input,
} from "./canonical-shadow";

function workload(overrides: Partial<PlannerV2WorkloadHandoff> = {}): PlannerV2WorkloadHandoff {
  return {
    materialViewId: "youtube:video-1:mapping:map-1",
    sourceKind: "youtube",
    resourceId: "resource-1",
    subjectId: "subject-1",
    materialType: "video",
    remainingAmount: 1800,
    remainingUnit: "video_second",
    estimatedMinutes: 30,
    workloadAuthority: "exact",
    workloadConfidence: "high",
    plannerEligible: true,
    unresolvedWorkloadReason: null,
    evidence: { scope: "intrinsic", sampleCount: 0, totalObservedMinutes: 0, provenance: ["duration_seconds"] },
    ...overrides,
  };
}

function demand(id: string, overrides: Partial<CanonicalPlannerV2Demand> = {}): CanonicalPlannerV2Demand {
  return {
    demandId: id,
    canonicalWorkloadIdentity: id,
    workload: workload({ materialViewId: `youtube:${id}:mapping:map` }),
    curriculumNodeId: `node-${id}`,
    title: id,
    boundary: { kind: "full_video", videoId: id, durationSeconds: 1800, watchedSeconds: 0 },
    learningStage: "learn",
    learningStageAllowed: true,
    learningStageReason: "learn_available",
    userPriority: 50,
    curriculumOrder: 1,
    alreadyStarted: false,
    earliestDate: "2026-08-26",
    latestDate: "2026-08-27",
    prerequisiteWorkloadIdentities: [],
    sourceProvenance: ["canonical_workload"],
    ...overrides,
  };
}

function input(overrides: Partial<CanonicalPlannerV2Input> = {}): CanonicalPlannerV2Input {
  return {
    userId: "user-1",
    examProfileId: "profile-1",
    currentDate: "2026-08-25",
    horizonStart: "2026-08-25",
    horizonEnd: "2026-08-27",
    dailyCapacities: [
      { date: "2026-08-25", configuredCapacityMinutes: 60, alreadyStudiedMinutes: 0 },
      { date: "2026-08-26", configuredCapacityMinutes: 60, alreadyStudiedMinutes: 0 },
      { date: "2026-08-27", configuredCapacityMinutes: 60, alreadyStudiedMinutes: 0 },
    ],
    commitments: [],
    demands: [demand("video-1")],
    completedWorkloadIdentities: [],
    progressVersion: "progress-v1",
    policy: {
      plannerVersion: CANONICAL_PLANNER_V2_VERSION,
      protectCurrentDay: true,
      materialSplitting: "whole_canonical_workload_only",
      orderingPolicy: "user_priority_continuation_stage_curriculum_stable_id",
    },
    ...overrides,
  };
}

describe("W5 canonical Planner V2 shadow", () => {
  it("fits exact whole workload without exceeding integer capacity", async () => {
    const proposal = await buildCanonicalPlannerV2Proposal(input());
    expect(proposal.scheduledItems).toHaveLength(1);
    expect(proposal.scheduledItems[0]).toMatchObject({ plannedDate: "2026-08-26", estimatedMinutes: 30 });
    expect(proposal.capacity).toMatchObject({ plannedMinutes: 30, availableMinutes: 180, unmetEligibleMinutes: 0 });
  });

  it("leaves a one-minute overflow unmet instead of rounding capacity upward", async () => {
    const proposal = await buildCanonicalPlannerV2Proposal(input({
      dailyCapacities: [
        { date: "2026-08-25", configuredCapacityMinutes: 0, alreadyStudiedMinutes: 0 },
        { date: "2026-08-26", configuredCapacityMinutes: 29, alreadyStudiedMinutes: 0 },
        { date: "2026-08-27", configuredCapacityMinutes: 0, alreadyStudiedMinutes: 0 },
      ],
    }));
    expect(proposal.scheduledItems).toHaveLength(0);
    expect(proposal.unmetEligibleDemand).toEqual([
      expect.objectContaining({ estimatedMinutes: 30, reason: "insufficient_contiguous_capacity" }),
    ]);
  });

  it("handles a zero-capacity day deterministically", async () => {
    const proposal = await buildCanonicalPlannerV2Proposal(input({
      dailyCapacities: [
        { date: "2026-08-25", configuredCapacityMinutes: 0, alreadyStudiedMinutes: 0 },
        { date: "2026-08-26", configuredCapacityMinutes: 0, alreadyStudiedMinutes: 0 },
        { date: "2026-08-27", configuredCapacityMinutes: 30, alreadyStudiedMinutes: 0 },
      ],
    }));
    expect(proposal.scheduledItems[0]?.plannedDate).toBe("2026-08-27");
  });

  it("subtracts protected commitments and reconciles whole-horizon accounting", async () => {
    const proposal = await buildCanonicalPlannerV2Proposal(input({
      commitments: [{
        commitmentId: "locked-1", date: "2026-08-26", minutes: 40,
        classification: "locked", occupiesCapacity: true,
        canonicalWorkloadIdentity: null, materialViewId: null, source: "user_locked",
      }],
    }));
    expect(proposal.scheduledItems[0]?.plannedDate).toBe("2026-08-27");
    expect(proposal.dailyPlans[1]).toMatchObject({ protectedCommitmentMinutes: 40, availableMinutes: 20 });
    expect(proposal.capacity.plannedMinutes + proposal.capacity.unusedMinutes).toBe(proposal.capacity.availableMinutes);
  });

  it("surfaces protected overcommit without inventing negative capacity or overtime", async () => {
    const proposal = await buildCanonicalPlannerV2Proposal(input({
      dailyCapacities: [
        { date: "2026-08-25", configuredCapacityMinutes: 0, alreadyStudiedMinutes: 0 },
        { date: "2026-08-26", configuredCapacityMinutes: 20, alreadyStudiedMinutes: 10 },
        { date: "2026-08-27", configuredCapacityMinutes: 0, alreadyStudiedMinutes: 0 },
      ],
      commitments: [{
        commitmentId: "manual", date: "2026-08-26", minutes: 25,
        classification: "manual", occupiesCapacity: true,
        canonicalWorkloadIdentity: null, materialViewId: null, source: "manual",
      }],
    }));
    expect(proposal.dailyPlans[1]).toMatchObject({ availableMinutes: 0, overcommittedMinutes: 15 });
    expect(proposal.capacity.overcommittedMinutes).toBe(15);
    expect(proposal.warnings).toContain("PROTECTED_COMMITMENTS_EXCEED_CONFIGURED_CAPACITY");
  });

  it("never schedules unknown physical workload or fabricates duration", async () => {
    const unknown = demand("physical-unknown", {
      canonicalWorkloadIdentity: "physical:span-1",
      workload: workload({
        materialViewId: "physical:span-1", sourceKind: "physical", materialType: "page_range",
        remainingAmount: 10, remainingUnit: "page", estimatedMinutes: null,
        workloadAuthority: "unknown", workloadConfidence: "none", plannerEligible: false,
        unresolvedWorkloadReason: "pace_evidence_unavailable",
      }),
      boundary: { kind: "physical_pages", pageStart: 1, pageEnd: 10, remainingPageStart: 1, remainingPageEnd: 10 },
    });
    const proposal = await buildCanonicalPlannerV2Proposal(input({ demands: [unknown] }));
    expect(proposal.scheduledItems).toHaveLength(0);
    expect(proposal.blockedDemands[0]).toMatchObject({
      blockedReason: "pace_evidence_unavailable", unresolvedWorkloadReason: "pace_evidence_unavailable",
    });
  });

  it("preserves the canonical unknown reason ahead of a secondary stage block", async () => {
    const unknown = demand("physical-stage-unknown", {
      workload: workload({
        materialViewId: "physical:stage-unknown", sourceKind: "physical",
        remainingAmount: 10, remainingUnit: "page", estimatedMinutes: null,
        workloadAuthority: "unknown", workloadConfidence: "none", plannerEligible: false,
        unresolvedWorkloadReason: "pace_evidence_unavailable",
      }),
      learningStage: "practice",
      learningStageAllowed: false,
      learningStageReason: "learn_prerequisite_unsatisfied",
    });
    const proposal = await buildCanonicalPlannerV2Proposal(input({ demands: [unknown] }));
    expect(proposal.blockedDemands[0]).toMatchObject({
      blockedReason: "pace_evidence_unavailable",
      unresolvedWorkloadReason: "pace_evidence_unavailable",
    });
  });

  it("holds mapping-blocked and boundary-less demand", async () => {
    const mapping = demand("mapping", {
      workload: workload({ plannerEligible: false, estimatedMinutes: null, workloadAuthority: "unknown", workloadConfidence: "none", unresolvedWorkloadReason: "mapping_missing" }),
    });
    const noBoundary = demand("no-boundary", { boundary: null });
    const proposal = await buildCanonicalPlannerV2Proposal(input({ demands: [mapping, noBoundary] }));
    expect(proposal.blockedDemands.map((item) => item.blockedReason).sort()).toEqual([
      "authoritative_material_boundary_unavailable", "mapping_missing",
    ]);
  });

  it("omits completed video demand", async () => {
    const complete = demand("complete", { workload: workload({ remainingAmount: 0, estimatedMinutes: 0 }) });
    const proposal = await buildCanonicalPlannerV2Proposal(input({ demands: [complete] }));
    expect(proposal.scheduledItems).toHaveLength(0);
    expect(proposal.blockedDemands).toHaveLength(0);
    expect(proposal.completedDemandIds).toEqual(["complete"]);
  });

  it("schedules whole remaining YouTube workload and never creates partial segments", async () => {
    const proposal = await buildCanonicalPlannerV2Proposal(input());
    expect(proposal.scheduledItems[0]?.boundary).toEqual({
      kind: "full_video", videoId: "video-1", durationSeconds: 1800, watchedSeconds: 0,
    });
    expect(proposal.explanationFacts).toContain("deterministic_whole_workload_first_fit");
  });

  it("deduplicates multiple topic views of one full video workload", async () => {
    const first = demand("map-a", { canonicalWorkloadIdentity: "youtube:video-1" });
    const second = demand("map-b", { canonicalWorkloadIdentity: "youtube:video-1", userPriority: 10 });
    const proposal = await buildCanonicalPlannerV2Proposal(input({ demands: [second, first] }));
    expect(proposal.scheduledItems).toHaveLength(1);
    expect(proposal.scheduledItems[0]?.demandId).toBe("map-a");
    expect(proposal.blockedDemands[0]?.blockedReason).toBe("duplicate_canonical_workload_identity");
  });

  it("respects explicit user priority with stable identity tie-breaks", async () => {
    const low = demand("z-low", { userPriority: 10 });
    const highB = demand("b-high", { userPriority: 90 });
    const highA = demand("a-high", { userPriority: 90 });
    const proposal = await buildCanonicalPlannerV2Proposal(input({
      dailyCapacities: [
        { date: "2026-08-25", configuredCapacityMinutes: 0, alreadyStudiedMinutes: 0 },
        { date: "2026-08-26", configuredCapacityMinutes: 60, alreadyStudiedMinutes: 0 },
        { date: "2026-08-27", configuredCapacityMinutes: 30, alreadyStudiedMinutes: 0 },
      ],
      demands: [low, highB, highA],
    }));
    expect(proposal.scheduledItems.map((item) => item.demandId)).toEqual(["a-high", "b-high", "z-low"]);
  });

  it("holds learning-stage blocked demand without equating completion to mastery", async () => {
    const proposal = await buildCanonicalPlannerV2Proposal(input({ demands: [
      demand("practice", { learningStage: "practice", learningStageAllowed: false, learningStageReason: "learn_prerequisite_unsatisfied" }),
    ] }));
    expect(proposal.blockedDemands[0]).toMatchObject({ blockedReason: "learning_stage_blocked" });
  });

  it("orders prerequisites before dependents and holds missing prerequisites", async () => {
    const prerequisite = demand("learn", { canonicalWorkloadIdentity: "learn", userPriority: 10 });
    const practice = demand("practice", { canonicalWorkloadIdentity: "practice", userPriority: 90, prerequisiteWorkloadIdentities: ["learn"] });
    const missing = demand("review", { prerequisiteWorkloadIdentities: ["not-present"] });
    const proposal = await buildCanonicalPlannerV2Proposal(input({ demands: [practice, missing, prerequisite] }));
    expect(proposal.scheduledItems.map((item) => item.canonicalWorkloadIdentity)).toEqual(["learn", "practice"]);
    expect(proposal.unmetEligibleDemand).toContainEqual(expect.objectContaining({ demandId: "review", reason: "prerequisite_unsatisfied" }));
  });

  it("protects the current day from new canonical scheduling", async () => {
    const proposal = await buildCanonicalPlannerV2Proposal(input({ demands: [
      demand("today", { earliestDate: "2026-08-25", latestDate: "2026-08-25" }),
    ] }));
    expect(proposal.scheduledItems).toHaveLength(0);
    expect(proposal.unmetEligibleDemand[0]?.reason).toBe("insufficient_contiguous_capacity");
  });

  it("does not double-plan an in-progress canonical workload", async () => {
    const proposal = await buildCanonicalPlannerV2Proposal(input({
      commitments: [{
        commitmentId: "active", date: "2026-08-26", minutes: 30,
        classification: "in_progress", occupiesCapacity: true,
        canonicalWorkloadIdentity: "video-1", materialViewId: "youtube:video-1", source: "task",
      }],
    }));
    expect(proposal.scheduledItems).toHaveLength(0);
    expect(proposal.blockedDemands[0]?.blockedReason).toBe("already_in_progress");
  });

  it("produces the same fingerprint and proposal regardless of input row order", async () => {
    const a = demand("a");
    const b = demand("b");
    const first = await buildCanonicalPlannerV2Proposal(input({ demands: [b, a] }));
    const second = await buildCanonicalPlannerV2Proposal(input({ demands: [a, b] }));
    expect(second.snapshotFingerprint).toBe(first.snapshotFingerprint);
    expect(second.proposalFingerprint).toBe(first.proposalFingerprint);
    expect(second).toEqual(first);
  });

  it("changes the snapshot fingerprint for capacity, workload, or progress changes", async () => {
    const base = input();
    const first = await buildCanonicalPlannerV2Proposal(base);
    const capacity = await buildCanonicalPlannerV2Proposal(input({ dailyCapacities: base.dailyCapacities.map((day, index) => index === 1 ? { ...day, configuredCapacityMinutes: 59 } : day) }));
    const workloadChanged = await buildCanonicalPlannerV2Proposal(input({ demands: [demand("video-1", { workload: workload({ estimatedMinutes: 31 }) })] }));
    const progress = await buildCanonicalPlannerV2Proposal(input({ progressVersion: "progress-v2" }));
    expect(new Set([first.snapshotFingerprint, capacity.snapshotFingerprint, workloadChanged.snapshotFingerprint, progress.snapshotFingerprint]).size).toBe(4);
  });

  it("rejects a runtime policy value outside the canonical contract", async () => {
    await expect(buildCanonicalPlannerV2Proposal(input({
      policy: { ...input().policy, orderingPolicy: "database_row_order" as any },
    }))).rejects.toThrow("unsupported canonical planner policy");
  });

  it("returns a reconciled read-only legacy comparison and zero V2 violations", async () => {
    const plannerInput = input();
    const proposal = await buildCanonicalPlannerV2Proposal(plannerInput);
    const comparison = compareCanonicalPlannerV2Shadow(plannerInput, proposal, [{
      taskId: "legacy-1", plannedDate: "2026-08-27", estimatedMinutes: 60,
      canonicalWorkloadIdentity: "video-1", completed: false,
    }]);
    expect(comparison.capacity).toMatchObject({ legacyPlannedMinutes: 60, v2PlannedMinutes: 30, v2OverflowMinutes: 0 });
    expect(comparison.safety).toEqual({
      currentDayProtectedDifferences: 0, capacityViolations: 0,
      staleOrUnknownViolations: 0, duplicateViolations: 0,
    });
  });

  it("compares legacy occupancy against post-study capacity without double-subtracting protected work", async () => {
    const plannerInput = input({
      commitments: [{
        commitmentId: "manual", date: "2026-08-26", minutes: 60,
        classification: "manual", occupiesCapacity: true,
        canonicalWorkloadIdentity: null, materialViewId: null, source: "manual",
      }],
      demands: [],
    });
    const proposal = await buildCanonicalPlannerV2Proposal(plannerInput);
    const comparison = compareCanonicalPlannerV2Shadow(plannerInput, proposal, [{
      taskId: "manual", plannedDate: "2026-08-26", estimatedMinutes: 60,
      canonicalWorkloadIdentity: null, completed: false,
    }]);
    expect(comparison.capacity).toMatchObject({
      exactCapacityMinutes: 180,
      legacyPlannedMinutes: 60,
      legacyOverflowMinutes: 0,
      v2OverflowMinutes: 0,
    });
  });
});
