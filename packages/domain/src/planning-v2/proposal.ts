import type {
  CandidateType,
  IsoDateV2,
  PlannerVersions,
} from "./types";
import type {
  PlanningTriggerV2,
  ReplanScopeV2,
} from "./triggers";

export interface PlanningProposalMove {
  readonly taskId: string;
  readonly fromDate: IsoDateV2;
  readonly toDate: IsoDateV2;
  readonly reasonCodes: readonly string[];
}

export interface PlanningProposalCreate {
  readonly candidateId: string;
  readonly curriculumUnitId: string | null;
  readonly candidateType: CandidateType;
  readonly plannedDate: IsoDateV2;
  readonly estimatedMinutes: number;
  readonly reasonCodes: readonly string[];
}

export interface PlanningProposalCancel {
  readonly taskId: string;
  readonly reasonCodes: readonly string[];
}

export interface PlanningProposalBacklog {
  readonly taskId: string;
  readonly fromDate: IsoDateV2 | null;
  readonly reasonCodes: readonly string[];
}

export const PLAN_VALIDATION_VIOLATION_CODES = [
  "DAILY_CAPACITY_EXCEEDED",
  "WEEKLY_BUDGET_EXCEEDED",
  "COMPLETED_TASK_MOVED",
  "ACTIVE_TASK_MOVED",
  "PREREQUISITE_VIOLATION",
  "INVALID_DATE",
  "DUPLICATE_ACTIVITY",
  "OWNERSHIP_MISMATCH",
  "MASS_CHANGE_GUARD",
  "SNAPSHOT_STALE",
] as const;

export type PlanValidationViolationCode =
  (typeof PLAN_VALIDATION_VIOLATION_CODES)[number];

export interface PlanValidationViolation {
  readonly code: PlanValidationViolationCode;
  readonly message: string;
  readonly taskIds: readonly string[];
  readonly date: IsoDateV2 | null;
  readonly blocking: boolean;
}

export interface PlanValidationResult {
  readonly valid: boolean;
  readonly violations: readonly PlanValidationViolation[];
}

export interface PlanningProposalV1 {
  readonly proposalId: string;
  readonly snapshotId: string;

  readonly userId: string;
  readonly examProfileId: string;

  readonly trigger: PlanningTriggerV2;
  readonly scope: ReplanScopeV2;

  readonly moves: readonly PlanningProposalMove[];
  readonly creates: readonly PlanningProposalCreate[];
  readonly cancels: readonly PlanningProposalCancel[];
  readonly backlog: readonly PlanningProposalBacklog[];

  readonly objectiveBefore: number | null;
  readonly objectiveAfter: number | null;

  readonly hardConstraintViolations: readonly PlanValidationViolation[];

  readonly changedTaskCount: number;

  readonly versions: PlannerVersions;

  readonly applyRecommended: boolean;
  readonly reasonCodes: readonly string[];
}
