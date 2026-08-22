import type { StudyAccountingIntent } from "./types";

export interface StudyAllocationCalculation {
  readonly accountingIntent: StudyAccountingIntent;
  readonly actualMinutes: number;
  readonly plannedCreditMinutes: number;
  readonly overrunMinutes: number;
  readonly targetTaskId: string | null;
}

const minutes = (value: number) => Math.max(0, Math.floor(value));

export function calculateStudyAllocation(input: {
  readonly accountingIntent: StudyAccountingIntent;
  readonly actualMinutes: number;
  readonly remainingPlannedMinutes: number;
  readonly targetTaskId: string | null;
}): StudyAllocationCalculation {
  const actualMinutes = minutes(input.actualMinutes);
  if (actualMinutes <= 0) throw new Error("STUDY_ALLOCATION_ACTUAL_INVALID");

  if (input.accountingIntent === "planned") {
    if (!input.targetTaskId) throw new Error("STUDY_ALLOCATION_TARGET_REQUIRED");
    const plannedCreditMinutes = Math.min(actualMinutes, minutes(input.remainingPlannedMinutes));
    return {
      accountingIntent: "planned",
      actualMinutes,
      plannedCreditMinutes,
      overrunMinutes: actualMinutes - plannedCreditMinutes,
      targetTaskId: input.targetTaskId,
    };
  }

  return {
    accountingIntent: input.accountingIntent,
    actualMinutes,
    plannedCreditMinutes: 0,
    overrunMinutes: 0,
    targetTaskId: null,
  };
}

export function buildStudyCapacityAccounting(input: {
  readonly plannedCapacityMinutes: number;
  readonly approvedPlannedMinutes: number;
  readonly plannedActualMinutes: number;
  readonly plannedCreditMinutes: number;
  readonly extraActualMinutes: number;
  readonly unknownActualMinutes: number;
}) {
  const plannedCapacityMinutes = minutes(input.plannedCapacityMinutes);
  const approvedPlannedMinutes = minutes(input.approvedPlannedMinutes);
  const plannedActualMinutes = minutes(input.plannedActualMinutes);
  const plannedCreditMinutes = Math.min(approvedPlannedMinutes, minutes(input.plannedCreditMinutes));
  const extraActualMinutes = minutes(input.extraActualMinutes);
  const unknownActualMinutes = minutes(input.unknownActualMinutes);
  const totalActualMinutes = plannedActualMinutes + extraActualMinutes + unknownActualMinutes;
  return {
    plannedCapacityMinutes,
    approvedPlannedMinutes,
    plannedCreditMinutes,
    plannedRemainingMinutes: Math.max(0, approvedPlannedMinutes - plannedCreditMinutes),
    plannedActualMinutes,
    extraActualMinutes,
    unknownActualMinutes,
    totalActualMinutes,
    nominalActualOverageMinutes: Math.max(0, totalActualMinutes - plannedCapacityMinutes),
  };
}

export function validateSubstitution(input: {
  readonly confirmed: boolean;
  readonly sourceRemainingMinutes: number;
  readonly replacementActualMinutes: number;
  readonly requestedReplacementMinutes: number;
}) {
  if (!input.confirmed) throw new Error("SUBSTITUTION_CONFIRMATION_REQUIRED");
  const sourceRemainingMinutes = minutes(input.sourceRemainingMinutes);
  const replacementActualMinutes = minutes(input.replacementActualMinutes);
  const requestedReplacementMinutes = minutes(input.requestedReplacementMinutes);
  if (
    requestedReplacementMinutes <= 0 ||
    requestedReplacementMinutes > sourceRemainingMinutes ||
    requestedReplacementMinutes > replacementActualMinutes
  ) throw new Error("SUBSTITUTION_AMOUNT_INVALID");
  return {
    sourceMinutesRelieved: requestedReplacementMinutes,
    sourceMinutesRemaining: sourceRemainingMinutes - requestedReplacementMinutes,
  };
}

export function validateCarryoverTransition(input: {
  readonly sourceTaskId: string;
  readonly successorTaskId: string | null;
  readonly samePlan: boolean;
  readonly fromDate: string;
  readonly toDate: string;
  readonly remainingMinutes: number;
}) {
  if (!input.sourceTaskId || minutes(input.remainingMinutes) <= 0 || input.toDate <= input.fromDate) {
    throw new Error("CARRYOVER_TRANSITION_INVALID");
  }
  if (!input.samePlan && !input.successorTaskId) throw new Error("CARRYOVER_SUCCESSOR_REQUIRED");
  return {
    preservedTaskId: input.samePlan ? input.sourceTaskId : null,
    lineage: input.successorTaskId ? [input.sourceTaskId, input.successorTaskId] : [input.sourceTaskId],
    remainingMinutes: minutes(input.remainingMinutes),
  };
}
