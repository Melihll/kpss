import { describe, expect, it } from "vitest";
import {
  assembleCanonicalPlannerV2ReadOnlyInput,
  type CanonicalPlannerV2ReadModel,
} from "./canonical-planner-v2-readonly";
import { buildCanonicalPlannerV2Proposal } from "./planning-v2.bundle.js";

function readModel(overrides: Partial<CanonicalPlannerV2ReadModel> = {}): CanonicalPlannerV2ReadModel {
  const materials = [
    {
      id: "youtube:video-1:mapping:map-1", sourceId: "video-1", sourceKind: "youtube",
      resourceId: "resource-video", curriculumNodeId: "topic-learn", unitType: "video",
      title: "Exact video", sortOrder: 2, pageStart: null, pageEnd: null,
      durationSeconds: 725, watchedSeconds: 600, segmentStartSeconds: null,
      segmentEndSeconds: null, progressState: "in_progress", completedAt: null,
      mappingProvenance: "reviewed_mapping",
    },
    {
      id: "physical:unit-1", sourceId: "unit-1", sourceKind: "physical",
      resourceId: "resource-book", curriculumNodeId: "topic-learn", unitType: "page_range",
      title: "Unknown pages", sortOrder: 1, pageStart: 10, pageEnd: 20,
      completedThroughPage: 12, progressState: "in_progress", completedAt: null,
      mappingProvenance: "reviewed_catalog",
    },
  ];
  return {
    userId: "user-1",
    examProfileId: "profile-1",
    currentDate: "2026-08-26",
    weeklyPlan: { id: "plan-1", week_start_date: "2026-08-25", week_end_date: "2026-08-31" },
    adaptive: {
      dayCapacities: {
        "2026-08-25": 0, "2026-08-26": 60, "2026-08-27": 3,
        "2026-08-28": 0, "2026-08-29": 0, "2026-08-30": 0, "2026-08-31": 0,
      },
      actualMinutesByDate: {},
      tasks: [{
        id: "today-task", status: "planned", planned_date: "2026-08-26",
        estimated_minutes: 20, source_reason: "baseline_import", task_progress: [],
      }],
    },
    resourceTargets: [
      { resource_id: "resource-video", sequence_order: 2, work_mode: "video" },
      { resource_id: "resource-book", sequence_order: 1, work_mode: "book" },
    ],
    materialUnits: materials,
    plannerHandoffs: [
      {
        materialViewId: materials[0].id, sourceKind: "youtube", resourceId: "resource-video",
        subjectId: "subject-1", materialType: "video", remainingAmount: 125,
        remainingUnit: "video_second", estimatedMinutes: 3, workloadAuthority: "exact",
        workloadConfidence: "high", plannerEligible: true, unresolvedWorkloadReason: null,
        evidence: { scope: "intrinsic", sampleCount: 0, totalObservedMinutes: 0, provenance: ["duration_seconds"] },
      },
      {
        materialViewId: materials[1].id, sourceKind: "physical", resourceId: "resource-book",
        subjectId: "subject-1", materialType: "page_range", remainingAmount: 8,
        remainingUnit: "page", estimatedMinutes: null, workloadAuthority: "unknown",
        workloadConfidence: "none", plannerEligible: false,
        unresolvedWorkloadReason: "accepted_w2_evidence_unavailable",
        evidence: { scope: "none", sampleCount: 0, totalObservedMinutes: 0, provenance: [] },
      },
    ],
    topicProgress: [{ curriculum_node_id: "topic-learn", state: "learning", mastery_level: "new" }],
    taskResourceLinks: [],
    taskPreferences: [],
    ...overrides,
  };
}

describe("W5 canonical Planner V2 strictly read-only adapter", () => {
  it("maps exact full-video boundaries and preserves unknown physical blockers", async () => {
    const input = assembleCanonicalPlannerV2ReadOnlyInput(readModel());
    const proposal = await buildCanonicalPlannerV2Proposal(input);
    expect(proposal.scheduledItems).toEqual([
      expect.objectContaining({
        canonicalWorkloadIdentity: "youtube:video-1",
        estimatedMinutes: 3,
        plannedDate: "2026-08-27",
        boundary: { kind: "full_video", videoId: "video-1", durationSeconds: 725, watchedSeconds: 600 },
      }),
    ]);
    expect(proposal.blockedDemands).toEqual([
      expect.objectContaining({
        canonicalWorkloadIdentity: "physical:unit-1",
        blockedReason: "accepted_w2_evidence_unavailable",
      }),
    ]);
  });

  it("classifies and occupies current-day, pinned, and manual commitments only", () => {
    const base = readModel();
    const input = assembleCanonicalPlannerV2ReadOnlyInput(readModel({
      adaptive: {
        ...base.adaptive,
        tasks: [
          ...base.adaptive.tasks,
          { id: "pinned", status: "planned", planned_date: "2026-08-28", estimated_minutes: 10, source_reason: "baseline_import", task_progress: [] },
          { id: "manual", status: "planned", planned_date: "2026-08-29", estimated_minutes: 15, source_reason: "manual", task_progress: [] },
          { id: "carryover", status: "planned", planned_date: "2026-08-29", estimated_minutes: 25, source_reason: "carryover", task_progress: [] },
          { id: "generated", status: "planned", planned_date: "2026-08-30", estimated_minutes: 25, source_reason: "dynamic_replan", task_progress: [] },
          { id: "replaceable", status: "planned", planned_date: "2026-08-30", estimated_minutes: 30, source_reason: "baseline_import", task_progress: [] },
        ],
      },
      taskPreferences: [{ task_id: "pinned", pinned: true }],
    }));
    expect(input.commitments.map((item: any) => [item.commitmentId, item.classification, item.occupiesCapacity])).toEqual([
      ["today-task", "protected_current_day", true],
      ["pinned", "locked", true],
      ["manual", "manual", true],
      ["carryover", "legacy", false],
      ["generated", "future_replaceable_generated", false],
      ["replaceable", "legacy", false],
    ]);
  });

  it("uses one exact task-unit identity to prevent in-progress double planning", async () => {
    const base = readModel();
    const input = assembleCanonicalPlannerV2ReadOnlyInput(readModel({
      adaptive: {
        ...base.adaptive,
        tasks: [{
          id: "active-unit", status: "in_progress", planned_date: "2026-08-27",
          estimated_minutes: 20, source_reason: "baseline_import", task_progress: [{ completed_minutes: 5 }],
        }],
      },
      taskResourceLinks: [{ task_id: "active-unit", resource_unit_id: "unit-1", status: "pending" }],
    }));
    const proposal = await buildCanonicalPlannerV2Proposal(input);
    expect(proposal.blockedDemands).toContainEqual(expect.objectContaining({
      canonicalWorkloadIdentity: "physical:unit-1", blockedReason: "already_in_progress",
    }));
  });

  it("creates a stable progress identity independent of read row order", () => {
    const base = readModel();
    const reversed = readModel({
      materialUnits: [...base.materialUnits].reverse(),
      plannerHandoffs: [...base.plannerHandoffs].reverse(),
    });
    const first = assembleCanonicalPlannerV2ReadOnlyInput(base);
    const second = assembleCanonicalPlannerV2ReadOnlyInput(reversed);
    expect(second.progressVersion).toBe(first.progressVersion);
  });

  it("keeps active canonical material without a P48 target subject-neutral and schedulable", async () => {
    const model = readModel({ resourceTargets: [] });
    const input = assembleCanonicalPlannerV2ReadOnlyInput(model);
    const video = input.demands.find((item: any) => item.canonicalWorkloadIdentity === "youtube:video-1");
    expect(video).toMatchObject({
      learningStage: null,
      learningStageAllowed: true,
      learningStageReason: "no_authoritative_stage_binding",
      userPriority: 0,
    });
    const proposal = await buildCanonicalPlannerV2Proposal(input);
    expect(proposal.scheduledItems).toContainEqual(expect.objectContaining({
      canonicalWorkloadIdentity: "youtube:video-1",
    }));
  });
});
