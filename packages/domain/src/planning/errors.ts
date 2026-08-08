export type PlanningErrorCode =
  | "NO_ACTIVE_EXAM_PROFILE"
  | "NO_WEEKLY_AVAILABILITY"
  | "ACTIVE_PLAN_ALREADY_EXISTS"
  | "TASK_NOT_FOUND"
  | "TASK_HAS_PENDING_UNITS"
  | "INVALID_TASK_PROGRESS"
  | "NO_RECOMMENDABLE_TASK";

export class PlanningDomainError extends Error {
  override readonly name = "PlanningDomainError";
  constructor(readonly code: PlanningErrorCode, message = code) {
    super(message);
  }
}
