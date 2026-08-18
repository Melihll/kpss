import { describe, expect, it } from "vitest";
import {
  buildFoundationWeekGoldenSnapshotV2,
  buildLocalRepairProposalV1,
  repairCurrentPlanLocallyV1,
  validatePlanProposalV1,
  type PlanningProposalV1,
} from "./index";

describe("Planning V2 Proposal + Validator", () => {
  it("builds deterministic NO_REPLAN proposal for a feasible plan", () => {
    const snapshot =
      buildFoundationWeekGoldenSnapshotV2();

    const repair =
      repairCurrentPlanLocallyV1(snapshot);

    const first =
      buildLocalRepairProposalV1({
        snapshot,
        repair,
      });

    const second =
      buildLocalRepairProposalV1({
        snapshot,
        repair,
      });

    expect(first).toEqual(second);
    expect(first.scope).toBe("NO_REPLAN");
    expect(first.changedTaskCount).toBe(0);
    expect(first.applyRecommended).toBe(false);

    const validation =
      validatePlanProposalV1({
        snapshot,
        proposal: first,
      });

    expect(validation.valid).toBe(true);
  });

  it("builds and validates a one-task local capacity move", () => {
    const snapshot =
      buildFoundationWeekGoldenSnapshotV2({
        trigger: "CAPACITY_DECREASE",

        capacityDeltaByDate: {
          "2026-08-18": -50,
          "2026-08-19": 50,
        },
      });

    const repair =
      repairCurrentPlanLocallyV1(snapshot);

    const proposal =
      buildLocalRepairProposalV1({
        snapshot,
        repair,
      });

    expect(proposal.scope).toBe(
      "LOCAL_CAPACITY_REPAIR",
    );

    expect(proposal.changedTaskCount).toBe(1);
    expect(proposal.moves).toHaveLength(1);
    expect(proposal.applyRecommended).toBe(false);

    const validation =
      validatePlanProposalV1({
        snapshot,
        proposal,
      });

    expect(validation.valid).toBe(true);
    expect(validation.violations).toEqual([]);
  });

  it("validates one-task backlog repair when no weekly spare capacity exists", () => {
    const snapshot =
      buildFoundationWeekGoldenSnapshotV2({
        trigger: "CAPACITY_DECREASE",

        capacityDeltaByDate: {
          "2026-08-18": -90,
        },
      });

    const repair =
      repairCurrentPlanLocallyV1(snapshot);

    const proposal =
      buildLocalRepairProposalV1({
        snapshot,
        repair,
      });

    expect(proposal.backlog).toHaveLength(1);
    expect(proposal.changedTaskCount).toBe(1);

    const validation =
      validatePlanProposalV1({
        snapshot,
        proposal,
      });

    expect(validation.valid).toBe(true);
  });

  it("rejects moving a completed task", () => {
    const snapshot =
      buildFoundationWeekGoldenSnapshotV2({
        completedMinutesByTaskId: {
          "task-05": 90,
        },

        completedTaskIds: [
          "task-05",
        ],
      });

    const proposal: PlanningProposalV1 = {
      proposalId: "tampered",

      snapshotId:
        snapshot.meta.snapshotId,

      userId:
        snapshot.userId,

      examProfileId:
        snapshot.examProfileId,

      trigger:
        "CAPACITY_DECREASE",

      scope:
        "LOCAL_CAPACITY_REPAIR",

      moves: [
        {
          taskId: "task-05",
          fromDate: "2026-08-18",
          toDate: "2026-08-19",
          reasonCodes: ["TAMPERED"],
        },
      ],

      creates: [],
      cancels: [],
      backlog: [],

      objectiveBefore: null,
      objectiveAfter: null,

      hardConstraintViolations: [],

      changedTaskCount: 1,

      versions:
        snapshot.meta.versions,

      applyRecommended: true,

      reasonCodes: ["TAMPERED"],
    };

    const validation =
      validatePlanProposalV1({
        snapshot,
        proposal,
      });

    expect(validation.valid).toBe(false);

    expect(
      validation.violations.some(
        (item) =>
          item.code ===
          "COMPLETED_TASK_MOVED",
      ),
    ).toBe(true);
  });

  it("rejects moving an active task", () => {
    const snapshot =
      buildFoundationWeekGoldenSnapshotV2({
        activeTaskIds: [
          "task-05",
        ],
      });

    const proposal: PlanningProposalV1 = {
      proposalId: "tampered-active",

      snapshotId:
        snapshot.meta.snapshotId,

      userId:
        snapshot.userId,

      examProfileId:
        snapshot.examProfileId,

      trigger:
        "CAPACITY_DECREASE",

      scope:
        "LOCAL_CAPACITY_REPAIR",

      moves: [
        {
          taskId: "task-05",
          fromDate: "2026-08-18",
          toDate: "2026-08-19",
          reasonCodes: ["TAMPERED"],
        },
      ],

      creates: [],
      cancels: [],
      backlog: [],

      objectiveBefore: null,
      objectiveAfter: null,

      hardConstraintViolations: [],

      changedTaskCount: 1,

      versions:
        snapshot.meta.versions,

      applyRecommended: true,

      reasonCodes: ["TAMPERED"],
    };

    const validation =
      validatePlanProposalV1({
        snapshot,
        proposal,
      });

    expect(validation.valid).toBe(false);

    expect(
      validation.violations.some(
        (item) =>
          item.code ===
          "ACTIVE_TASK_MOVED",
      ),
    ).toBe(true);
  });

  it("rejects a proposal produced from another snapshot", () => {
    const snapshot =
      buildFoundationWeekGoldenSnapshotV2();

    const repair =
      repairCurrentPlanLocallyV1(snapshot);

    const proposal =
      buildLocalRepairProposalV1({
        snapshot,
        repair,
      });

    const tampered = {
      ...proposal,
      snapshotId: "another-snapshot",
    };

    const validation =
      validatePlanProposalV1({
        snapshot,
        proposal: tampered,
      });

    expect(validation.valid).toBe(false);

    expect(
      validation.violations.some(
        (item) =>
          item.code ===
          "SNAPSHOT_STALE",
      ),
    ).toBe(true);
  });

  it("rejects two mutations targeting the same task", () => {
    const snapshot =
      buildFoundationWeekGoldenSnapshotV2();

    const proposal: PlanningProposalV1 = {
      proposalId: "duplicate",

      snapshotId:
        snapshot.meta.snapshotId,

      userId:
        snapshot.userId,

      examProfileId:
        snapshot.examProfileId,

      trigger:
        "CAPACITY_DECREASE",

      scope:
        "LOCAL_CAPACITY_REPAIR",

      moves: [
        {
          taskId: "task-05",
          fromDate: "2026-08-18",
          toDate: "2026-08-19",
          reasonCodes: [],
        },
      ],

      creates: [],
      cancels: [],

      backlog: [
        {
          taskId: "task-05",
          fromDate: "2026-08-18",
          reasonCodes: [],
        },
      ],

      objectiveBefore: null,
      objectiveAfter: null,

      hardConstraintViolations: [],

      changedTaskCount: 1,

      versions:
        snapshot.meta.versions,

      applyRecommended: true,

      reasonCodes: [],
    };

    const validation =
      validatePlanProposalV1({
        snapshot,
        proposal,
      });

    expect(validation.valid).toBe(false);

    expect(
      validation.violations.some(
        (item) =>
          item.code ===
          "DUPLICATE_ACTIVITY",
      ),
    ).toBe(true);
  });

  it("rejects a move that creates daily capacity overflow", () => {
    const snapshot =
      buildFoundationWeekGoldenSnapshotV2();

    const proposal: PlanningProposalV1 = {
      proposalId: "overflow",

      snapshotId:
        snapshot.meta.snapshotId,

      userId:
        snapshot.userId,

      examProfileId:
        snapshot.examProfileId,

      trigger:
        "CAPACITY_DECREASE",

      scope:
        "LOCAL_CAPACITY_REPAIR",

      moves: [
        {
          taskId: "task-05",
          fromDate: "2026-08-18",
          toDate: "2026-08-19",
          reasonCodes: [],
        },
      ],

      creates: [],
      cancels: [],
      backlog: [],

      objectiveBefore: null,
      objectiveAfter: null,

      hardConstraintViolations: [],

      changedTaskCount: 1,

      versions:
        snapshot.meta.versions,

      applyRecommended: true,

      reasonCodes: [],
    };

    const validation =
      validatePlanProposalV1({
        snapshot,
        proposal,
      });

    expect(validation.valid).toBe(false);

    expect(
      validation.violations.some(
        (item) =>
          item.code ===
          "DAILY_CAPACITY_EXCEEDED",
      ),
    ).toBe(true);
  });

  it("rejects a 22-task style automatic mass-change proposal", () => {
    const snapshot =
      buildFoundationWeekGoldenSnapshotV2();

    const moves =
      snapshot.existingTasks
        .slice(0, 22)
        .map((task) => ({
          taskId: task.taskId,

          fromDate:
            task.plannedDate!,

          toDate:
            task.plannedDate ===
            "2026-08-23"
              ? "2026-08-22"
              : "2026-08-23",

          reasonCodes: [
            "MASS_CHANGE_TEST",
          ],
        }));

    const proposal: PlanningProposalV1 = {
      proposalId: "mass-change",

      snapshotId:
        snapshot.meta.snapshotId,

      userId:
        snapshot.userId,

      examProfileId:
        snapshot.examProfileId,

      trigger:
        "STUDY_DEVIATION",

      scope:
        "LOCAL_TASK_REPAIR",

      moves,

      creates: [],
      cancels: [],
      backlog: [],

      objectiveBefore: null,
      objectiveAfter: null,

      hardConstraintViolations: [],

      changedTaskCount: 22,

      versions:
        snapshot.meta.versions,

      applyRecommended: true,

      reasonCodes: [
        "MASS_CHANGE_TEST",
      ],
    };

    const validation =
      validatePlanProposalV1({
        snapshot,
        proposal,
      });

    expect(validation.valid).toBe(false);

    expect(
      validation.violations.some(
        (item) =>
          item.code ===
          "MASS_CHANGE_GUARD",
      ),
    ).toBe(true);
  });
});

