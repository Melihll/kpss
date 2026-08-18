import {
  repairCurrentPlanLocallyV1,
  type LocalRepairResultV1,
} from "./local-repair";

import {
  buildLocalRepairProposalV1,
} from "./proposal-builder";

import {
  validatePlanProposalV1,
  type PlanValidationPolicyV1,
} from "./proposal-validator";

import type {
  PlanValidationResult,
  PlanningProposalV1,
} from "./proposal";

import type {
  PlanningSnapshotV2,
} from "./types";

export const PLANNING_DECISIONS_V2 = [
  "KEEP_PLAN",
  "READY_TO_APPLY",
  "BLOCKED",
] as const;

export type PlanningDecisionV2 =
  (typeof PLANNING_DECISIONS_V2)[number];

export interface DecidePlanningActionV2Input {
  readonly snapshot: PlanningSnapshotV2;

  readonly validationPolicy?:
    PlanValidationPolicyV1;
}

export interface PlanningDecisionResultV2 {
  readonly decision: PlanningDecisionV2;

  readonly snapshotId: string;

  readonly repair: LocalRepairResultV1;

  readonly proposal: PlanningProposalV1;

  readonly validation: PlanValidationResult;

  readonly applyRecommended: boolean;

  readonly reasonCodes: readonly string[];
}

function finalizeProposal(
  proposal: PlanningProposalV1,
  applyRecommended: boolean,
  additionalReasonCode: string,
): PlanningProposalV1 {
  return Object.freeze({
    ...proposal,

    applyRecommended,

    reasonCodes: Object.freeze([
      ...proposal.reasonCodes,
      additionalReasonCode,
    ]),
  });
}

export function decidePlanningActionV2(
  input: DecidePlanningActionV2Input,
): PlanningDecisionResultV2 {
  const { snapshot } = input;

  /*
   * repairCurrentPlanLocallyV1 starts by checking feasibility.
   *
   * Therefore this call represents:
   *
   * feasibility
   * → if required: minimum local repair
   */
  const repair =
    repairCurrentPlanLocallyV1(
      snapshot,
    );

  const preliminaryProposal =
    buildLocalRepairProposalV1({
      snapshot,
      repair,
    });

  const validation =
    validatePlanProposalV1({
      snapshot,

      proposal:
        preliminaryProposal,

      policy:
        input.validationPolicy,
    });

  /*
   * Stable valid plan always wins.
   */
  if (!repair.repairRequired) {
    const proposal =
      finalizeProposal(
        preliminaryProposal,
        false,
        "DECISION_KEEP_EXISTING_PLAN",
      );

    return Object.freeze({
      decision: "KEEP_PLAN",

      snapshotId:
        snapshot.meta.snapshotId,

      repair,

      proposal,

      validation,

      applyRecommended: false,

      reasonCodes: Object.freeze([
        "CURRENT_PLAN_FEASIBLE",
        "NO_MUTATION_REQUIRED",
      ]),
    });
  }

  /*
   * If local repair cannot restore validity,
   * never escalate silently into a global replan.
   */
  if (!repair.successful) {
    const proposal =
      finalizeProposal(
        preliminaryProposal,
        false,
        "DECISION_BLOCKED_REPAIR_UNRESOLVED",
      );

    return Object.freeze({
      decision: "BLOCKED",

      snapshotId:
        snapshot.meta.snapshotId,

      repair,

      proposal,

      validation,

      applyRecommended: false,

      reasonCodes: Object.freeze([
        "LOCAL_REPAIR_UNRESOLVED",
        "NO_AUTOMATIC_MUTATION",
      ]),
    });
  }

  /*
   * Validator has the final authority.
   */
  if (!validation.valid) {
    const proposal =
      finalizeProposal(
        preliminaryProposal,
        false,
        "DECISION_BLOCKED_VALIDATION_FAILED",
      );

    return Object.freeze({
      decision: "BLOCKED",

      snapshotId:
        snapshot.meta.snapshotId,

      repair,

      proposal,

      validation,

      applyRecommended: false,

      reasonCodes: Object.freeze([
        "PROPOSAL_VALIDATION_FAILED",
        "NO_AUTOMATIC_MUTATION",
      ]),
    });
  }

  if (
    preliminaryProposal.changedTaskCount === 0
  ) {
    const proposal =
      finalizeProposal(
        preliminaryProposal,
        false,
        "DECISION_KEEP_ZERO_CHANGE_PROPOSAL",
      );

    return Object.freeze({
      decision: "KEEP_PLAN",

      snapshotId:
        snapshot.meta.snapshotId,

      repair,

      proposal,

      validation,

      applyRecommended: false,

      reasonCodes: Object.freeze([
        "ZERO_CHANGE_PROPOSAL",
        "NO_MUTATION_REQUIRED",
      ]),
    });
  }

  const proposal =
    finalizeProposal(
      preliminaryProposal,
      true,
      "DECISION_VALIDATED_READY_TO_APPLY",
    );

  return Object.freeze({
    decision:
      "READY_TO_APPLY",

    snapshotId:
      snapshot.meta.snapshotId,

    repair,

    proposal,

    validation,

    applyRecommended: true,

    reasonCodes: Object.freeze([
      "LOCAL_REPAIR_SUCCESSFUL",
      "PROPOSAL_VALIDATED",
      "READY_FOR_ATOMIC_APPLY",
    ]),
  });
}
