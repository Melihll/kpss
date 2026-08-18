import type {
  PlanningProposalV1,
} from "./proposal";

import type {
  LocalRepairResultV1,
} from "./local-repair";

import type {
  PlanningSnapshotV2,
} from "./types";

import type {
  ReplanScopeV2,
} from "./triggers";

export interface BuildLocalRepairProposalV1Input {
  readonly snapshot: PlanningSnapshotV2;
  readonly repair: LocalRepairResultV1;
  readonly scope?: ReplanScopeV2;
}

function defaultRepairScope(
  snapshot: PlanningSnapshotV2,
  repair: LocalRepairResultV1,
): ReplanScopeV2 {
  if (!repair.repairRequired) {
    return "NO_REPLAN";
  }

  if (
    snapshot.meta.trigger === "CAPACITY_INCREASE" ||
    snapshot.meta.trigger === "CAPACITY_DECREASE"
  ) {
    return "LOCAL_CAPACITY_REPAIR";
  }

  if (snapshot.meta.trigger === "MISSED_DAY") {
    return "MISSED_DAY_REPAIR";
  }

  return "LOCAL_TASK_REPAIR";
}

function deterministicProposalId(
  snapshot: PlanningSnapshotV2,
  scope: ReplanScopeV2,
): string {
  return [
    "proposal-v1",
    snapshot.meta.snapshotId,
    snapshot.meta.trigger,
    scope,
  ].join(":");
}

export function buildLocalRepairProposalV1(
  input: BuildLocalRepairProposalV1Input,
): PlanningProposalV1 {
  const { snapshot, repair } = input;

  const scope =
    input.scope ??
    defaultRepairScope(
      snapshot,
      repair,
    );

  const moves = Object.freeze(
    repair.moves.map((move) =>
      Object.freeze({
        taskId: move.taskId,
        fromDate: move.fromDate,
        toDate: move.toDate,
        reasonCodes: Object.freeze([
          ...move.reasonCodes,
        ]),
      }),
    ),
  );

  const backlog = Object.freeze(
    repair.backlog.map((item) =>
      Object.freeze({
        taskId: item.taskId,
        fromDate: item.fromDate,
        reasonCodes: Object.freeze([
          ...item.reasonCodes,
        ]),
      }),
    ),
  );

  const changedTaskIds = new Set([
    ...moves.map((move) => move.taskId),
    ...backlog.map((item) => item.taskId),
  ]);

  const reasonCodes =
    !repair.repairRequired
      ? [
          "CURRENT_PLAN_ALREADY_FEASIBLE",
          "NO_REPLAN_REQUIRED",
        ]
      : repair.successful
        ? [
            "LOCAL_REPAIR_PROPOSAL",
            ...repair.reasonCodes,
          ]
        : [
            "LOCAL_REPAIR_UNRESOLVED",
            ...repair.reasonCodes,
          ];

  return Object.freeze({
    proposalId:
      deterministicProposalId(
        snapshot,
        scope,
      ),

    snapshotId:
      snapshot.meta.snapshotId,

    userId:
      snapshot.userId,

    examProfileId:
      snapshot.examProfileId,

    trigger:
      snapshot.meta.trigger,

    scope,

    moves,
    creates: Object.freeze([]),
    cancels: Object.freeze([]),
    backlog,

    objectiveBefore: null,
    objectiveAfter: null,

    hardConstraintViolations:
      Object.freeze([]),

    changedTaskCount:
      changedTaskIds.size,

    versions: Object.freeze({
      ...snapshot.meta.versions,
    }),

    /*
     * Builder never authorizes application.
     *
     * Only the orchestration pipeline may turn this true
     * after deterministic validation succeeds.
     */
    applyRecommended: false,

    reasonCodes:
      Object.freeze(reasonCodes),
  });
}
