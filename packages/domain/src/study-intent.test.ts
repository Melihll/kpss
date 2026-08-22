import { describe, expect, it } from "vitest";
import {
  buildStudyCapacityAccounting,
  calculateStudyAllocation,
  validateCarryoverTransition,
  validateSubstitution,
} from "./study-intent";

describe("PLN-002 study intent accounting", () => {
  it("credits planned fulfillment only up to the remaining obligation", () => {
    expect(calculateStudyAllocation({
      accountingIntent: "planned",
      actualMinutes: 85,
      remainingPlannedMinutes: 60,
      targetTaskId: "task-planned",
    })).toEqual({
      accountingIntent: "planned",
      actualMinutes: 85,
      plannedCreditMinutes: 60,
      overrunMinutes: 25,
      targetTaskId: "task-planned",
    });
  });

  it("gives extra study zero planned credit even when task context exists", () => {
    expect(calculateStudyAllocation({
      accountingIntent: "extra",
      actualMinutes: 40,
      remainingPlannedMinutes: 60,
      targetTaskId: "task-context-only",
    })).toEqual({
      accountingIntent: "extra",
      actualMinutes: 40,
      plannedCreditMinutes: 0,
      overrunMinutes: 0,
      targetTaskId: null,
    });
  });

  it("keeps historical unknown activity factual without inventing credit", () => {
    expect(calculateStudyAllocation({
      accountingIntent: "unknown",
      actualMinutes: 30,
      remainingPlannedMinutes: 30,
      targetTaskId: null,
    }).plannedCreditMinutes).toBe(0);
  });

  it("keeps 180 planned plus 40 extra as 180 planned and 220 actual", () => {
    expect(buildStudyCapacityAccounting({
      plannedCapacityMinutes: 180,
      approvedPlannedMinutes: 180,
      plannedActualMinutes: 180,
      plannedCreditMinutes: 180,
      extraActualMinutes: 40,
      unknownActualMinutes: 0,
    })).toEqual({
      plannedCapacityMinutes: 180,
      approvedPlannedMinutes: 180,
      plannedCreditMinutes: 180,
      plannedRemainingMinutes: 0,
      plannedActualMinutes: 180,
      extraActualMinutes: 40,
      unknownActualMinutes: 0,
      totalActualMinutes: 220,
      nominalActualOverageMinutes: 40,
    });
  });

  it("does not let extra actual time consume the approved-plan denominator", () => {
    expect(buildStudyCapacityAccounting({
      plannedCapacityMinutes: 180,
      approvedPlannedMinutes: 180,
      plannedActualMinutes: 0,
      plannedCreditMinutes: 0,
      extraActualMinutes: 40,
      unknownActualMinutes: 0,
    }).plannedRemainingMinutes).toBe(180);
  });

  it("requires explicit confirmation and bounded amounts for substitution", () => {
    expect(() => validateSubstitution({
      confirmed: false,
      sourceRemainingMinutes: 60,
      replacementActualMinutes: 40,
      requestedReplacementMinutes: 40,
    })).toThrowError("SUBSTITUTION_CONFIRMATION_REQUIRED");
    expect(validateSubstitution({
      confirmed: true,
      sourceRemainingMinutes: 60,
      replacementActualMinutes: 40,
      requestedReplacementMinutes: 40,
    })).toEqual({ sourceMinutesRelieved: 40, sourceMinutesRemaining: 20 });
  });

  it("rejects substitution relief above source remaining or replacement actual", () => {
    expect(() => validateSubstitution({
      confirmed: true,
      sourceRemainingMinutes: 30,
      replacementActualMinutes: 40,
      requestedReplacementMinutes: 40,
    })).toThrowError("SUBSTITUTION_AMOUNT_INVALID");
    expect(() => validateSubstitution({
      confirmed: true,
      sourceRemainingMinutes: 60,
      replacementActualMinutes: 20,
      requestedReplacementMinutes: 40,
    })).toThrowError("SUBSTITUTION_AMOUNT_INVALID");
  });

  it("preserves identity for same-plan carryover and lineage across plans", () => {
    expect(validateCarryoverTransition({
      sourceTaskId: "task-a",
      successorTaskId: null,
      samePlan: true,
      fromDate: "2026-08-22",
      toDate: "2026-08-23",
      remainingMinutes: 45,
    }).preservedTaskId).toBe("task-a");
    expect(validateCarryoverTransition({
      sourceTaskId: "task-a",
      successorTaskId: "task-b",
      samePlan: false,
      fromDate: "2026-08-23",
      toDate: "2026-08-24",
      remainingMinutes: 45,
    }).lineage).toEqual(["task-a", "task-b"]);
  });
});
