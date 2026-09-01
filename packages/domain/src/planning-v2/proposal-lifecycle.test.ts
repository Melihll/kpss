import { describe, expect, it } from "vitest";
import type { PlannerV2WorkloadHandoff } from "../planning/canonical-workload";
import {
  CANONICAL_PLANNER_V2_VERSION,
  buildCanonicalPlannerV2Proposal,
  type CanonicalPlannerV2Demand,
  type CanonicalPlannerV2Input,
  type CanonicalPlannerV2Proposal,
} from "./canonical-shadow";
import {
  buildPlannerV2ApplyPlan,
  buildPlannerV2Preview,
  confirmPlannerV2Preview,
  fingerprintPlannerV2SnapshotComponents,
  transitionPlannerV2ProposalState,
  validatePlannerV2Freshness,
  type PlannerV2ExistingTaskScope,
} from "./proposal-lifecycle";

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

function demand(id = "video-1", overrides: Partial<CanonicalPlannerV2Demand> = {}): CanonicalPlannerV2Demand {
  return {
    demandId: id,
    canonicalWorkloadIdentity: `youtube:${id}`,
    workload: workload({ materialViewId: `youtube:${id}:mapping:map-1` }),
    curriculumNodeId: `node-${id}`,
    title: `Video ${id}`,
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

function plannerInput(overrides: Partial<CanonicalPlannerV2Input> = {}): CanonicalPlannerV2Input {
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
    demands: [demand()],
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

const tasks: readonly PlannerV2ExistingTaskScope[] = [
  { taskId: "today", plannedDate: "2026-08-25", classification: "protected_current_day", canonicalWorkloadIdentity: null, source: "manual" },
  { taskId: "locked", plannedDate: "2026-08-26", classification: "locked", canonicalWorkloadIdentity: null, source: "manual" },
  { taskId: "generated", plannedDate: "2026-08-27", classification: "future_replaceable_generated", canonicalWorkloadIdentity: "old", source: "planner" },
  { taskId: "outside", plannedDate: "2026-09-01", classification: "future_replaceable_generated", canonicalWorkloadIdentity: "outside", source: "planner" },
];

async function lifecycleFixture() {
  const input = plannerInput();
  const proposal = await buildCanonicalPlannerV2Proposal(input);
  const preview = buildPlannerV2Preview(proposal, tasks);
  const confirmation = confirmPlannerV2Preview({
    preview,
    userId: preview.userId,
    examProfileId: preview.examProfileId,
    proposalId: preview.proposalId,
    proposalFingerprint: preview.proposalFingerprint,
    snapshotFingerprint: preview.snapshotFingerprint,
    plannerVersion: preview.plannerVersion,
    confirmedAt: "2026-08-25T12:00:00.000Z",
  });
  return { input, proposal, preview, confirmation };
}

describe("W6 Planner V2 proposal lifecycle", () => {
  it("enforces the explicit happy-path state machine", () => {
    expect(transitionPlannerV2ProposalState("generated", "preview")).toBe("previewed");
    expect(transitionPlannerV2ProposalState("previewed", "confirm")).toBe("confirmed");
    expect(transitionPlannerV2ProposalState("confirmed", "apply")).toBe("applied");
    expect(transitionPlannerV2ProposalState("applied", "apply")).toBe("applied");
  });

  it.each([
    ["generated", "apply"], ["previewed", "apply"], ["stale", "confirm"],
    ["rejected", "preview"], ["expired", "confirm"], ["applied", "confirm"],
  ] as const)("rejects invalid state transition %s/%s", (state, event) => {
    expect(() => transitionPlannerV2ProposalState(state, event)).toThrow("PLANNER_V2_INVALID_LIFECYCLE_TRANSITION");
  });

  it("builds a deterministic preview with explicit apply inactivity", async () => {
    const { proposal } = await lifecycleFixture();
    const first = buildPlannerV2Preview(proposal, [...tasks].reverse());
    const second = buildPlannerV2Preview(proposal, tasks);
    expect(first).toEqual(second);
    expect(first).toMatchObject({ state: "previewed", explicitConfirmationRequired: true, applyAvailable: false });
  });

  it("reconciles preview capacity and exact whole-video semantics", async () => {
    const { preview } = await lifecycleFixture();
    expect(preview.summary.newlyPlannedMinutes).toBe(30);
    expect(preview.days.reduce((sum, day) => sum + day.proposedMinutes, 0)).toBe(30);
    expect(preview.days.flatMap((day) => day.items)[0]?.boundary).toEqual({
      kind: "full_video", videoId: "video-1", durationSeconds: 1800, watchedSeconds: 0,
    });
  });

  it("reports only future schedulable capacity in preview", async () => {
    const input = plannerInput({
      currentDate: "2026-08-26",
      demands: [
        demand("oversized", {
          earliestDate: "2026-08-25",
          latestDate: "2026-08-27",
          workload: workload({
            materialViewId: "youtube:oversized:mapping:map-1",
            remainingAmount: 5400,
            estimatedMinutes: 90,
          }),
          boundary: {
            kind: "full_video",
            videoId: "oversized",
            durationSeconds: 5400,
            watchedSeconds: 0,
          },
        }),
      ],
    });

    const proposal = await buildCanonicalPlannerV2Proposal(input);
    const preview = buildPlannerV2Preview(proposal, []);

    expect(preview.days.map((day) => ({
      date: day.date,
      availableMinutes: day.availableMinutes,
      unusedMinutes: day.unusedMinutes,
    }))).toEqual([
      { date: "2026-08-25", availableMinutes: 0, unusedMinutes: 0 },
      { date: "2026-08-26", availableMinutes: 0, unusedMinutes: 0 },
      { date: "2026-08-27", availableMinutes: 60, unusedMinutes: 60 },
    ]);

    expect(preview.summary).toMatchObject({
      totalAvailableMinutes: 60,
      newlyPlannedMinutes: 0,
      unusedMinutes: 60,
      unmetEligibleMinutes: 90,
    });

    expect(
      preview.explanationFacts.filter((fact) => fact.kind === "unused_capacity"),
    ).toEqual([
      {
        kind: "unused_capacity",
        date: "2026-08-27",
        unusedMinutes: 60,
        reason: "next_indivisible_workload_does_not_fit",
      },
    ]);

    expect(
      preview.explanationFacts
        .filter((fact) => fact.kind === "day_capacity")
        .map((fact) => fact.kind === "day_capacity"
          ? { date: fact.date, availableMinutes: fact.availableMinutes }
          : null),
    ).toEqual([
      { date: "2026-08-25", availableMinutes: 0 },
      { date: "2026-08-26", availableMinutes: 0 },
      { date: "2026-08-27", availableMinutes: 60 },
    ]);
  });

  it("protects current-day, locked, and outside-scope work from replacement", async () => {
    const { preview } = await lifecycleFixture();
    expect(preview.differences.replaceableTaskIds).toEqual(["generated"]);
    expect(preview.differences.retainedTaskIds).toEqual(["locked", "today"]);
    expect(preview.differences.outsideScopeTaskIds).toEqual(["outside"]);
  });

  it("emits structured continuation and unused-capacity explanation facts", async () => {
    const input = plannerInput({ demands: [demand("continued", { alreadyStarted: true })] });
    const proposal = await buildCanonicalPlannerV2Proposal(input);
    const preview = buildPlannerV2Preview(proposal, []);
    expect(preview.explanationFacts).toContainEqual({ kind: "continuation_selected", canonicalWorkloadIdentity: "youtube:continued" });
    expect(preview.explanationFacts).toContainEqual(expect.objectContaining({ kind: "day_capacity" }));
  });

  it("requires exact ownership and identity-bound confirmation", async () => {
    const { preview } = await lifecycleFixture();
    const exact = {
      preview, userId: preview.userId, examProfileId: preview.examProfileId,
      proposalId: preview.proposalId, proposalFingerprint: preview.proposalFingerprint,
      snapshotFingerprint: preview.snapshotFingerprint, plannerVersion: preview.plannerVersion,
      confirmedAt: "2026-08-25T12:00:00Z",
    };
    expect(confirmPlannerV2Preview(exact).state).toBe("confirmed");
    expect(() => confirmPlannerV2Preview({ ...exact, userId: "other" })).toThrow("OWNERSHIP_MISMATCH");
    expect(() => confirmPlannerV2Preview({ ...exact, proposalFingerprint: "generic-yes" })).toThrow("IDENTITY_MISMATCH");
    expect(() => confirmPlannerV2Preview({ ...exact, confirmedAt: "not-a-date" })).toThrow("TIMESTAMP_INVALID");
  });

  it("fingerprints components deterministically regardless of input ordering", async () => {
    const input = plannerInput({ demands: [demand("b"), demand("a")] });
    const proposal = await buildCanonicalPlannerV2Proposal(input);
    const first = await fingerprintPlannerV2SnapshotComponents(input, proposal.snapshotFingerprint);
    const second = await fingerprintPlannerV2SnapshotComponents({ ...input, demands: [...input.demands].reverse() }, proposal.snapshotFingerprint);
    expect(second).toEqual(first);
    expect(validatePlannerV2Freshness(first, second)).toEqual({ fresh: true, state: "confirmed", reasons: [] });
  });

  it.each([
    ["capacityFingerprint", "capacity_changed"],
    ["progressFingerprint", "progress_changed"],
    ["taskStateFingerprint", "task_state_changed"],
    ["workloadFingerprint", "workload_changed"],
    ["commitmentFingerprint", "commitment_changed"],
    ["policyFingerprint", "policy_changed"],
  ] as const)("classifies %s freshness changes", async (field, reason) => {
    const { input, proposal } = await lifecycleFixture();
    const expected = await fingerprintPlannerV2SnapshotComponents(input, proposal.snapshotFingerprint);
    const current = { ...expected, [field]: "changed" };
    expect(validatePlannerV2Freshness(expected, current)).toEqual({ fresh: false, state: "stale", reasons: [reason] });
  });

  it("classifies an otherwise unexplained aggregate snapshot change", async () => {
    const { input, proposal } = await lifecycleFixture();
    const expected = await fingerprintPlannerV2SnapshotComponents(input, proposal.snapshotFingerprint);
    expect(validatePlannerV2Freshness(expected, { ...expected, snapshotFingerprint: "changed" }).reasons).toEqual(["snapshot_changed"]);
  });

  it("builds a deterministic atomic apply candidate without apply authority", async () => {
    const { proposal, confirmation } = await lifecycleFixture();
    const first = buildPlannerV2ApplyPlan({ proposal, confirmation, tasks: [...tasks].reverse() });
    const second = buildPlannerV2ApplyPlan({ proposal, confirmation, tasks });
    expect(first).toEqual(second);
    expect(first).toMatchObject({ atomicRequired: true, applyCandidateOnly: true, expectedNewMinutes: 30 });
    expect(first.creates[0]).toMatchObject({ title: "Video video-1", workloadAuthority: "exact", workloadConfidence: "high", workMode: "video" });
  });

  it("rejects a mismatched confirmation at apply-plan construction", async () => {
    const { proposal, confirmation } = await lifecycleFixture();
    expect(() => buildPlannerV2ApplyPlan({
      proposal, confirmation: { ...confirmation, proposalFingerprint: "wrong" }, tasks,
    })).toThrow("CONFIRMATION_IDENTITY_MISMATCH");
  });

  it("rejects unknown workload from the apply candidate even under corrupted input", async () => {
    const { proposal, confirmation } = await lifecycleFixture();
    const corrupted = {
      ...proposal,
      scheduledItems: proposal.scheduledItems.map((item) => ({ ...item, workloadAuthority: "unknown" as const })),
    } as CanonicalPlannerV2Proposal;
    expect(() => buildPlannerV2ApplyPlan({ proposal: corrupted, confirmation, tasks })).toThrow("UNKNOWN_WORKLOAD");
  });

  it("rejects duplicate canonical identities from the apply candidate", async () => {
    const { proposal, confirmation } = await lifecycleFixture();
    const corrupted = { ...proposal, scheduledItems: [proposal.scheduledItems[0]!, proposal.scheduledItems[0]!] } as CanonicalPlannerV2Proposal;
    expect(() => buildPlannerV2ApplyPlan({ proposal: corrupted, confirmation, tasks })).toThrow("DUPLICATE_WORKLOAD");
  });
});
