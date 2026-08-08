export class ExecutionDomainError extends Error {
  override readonly name = "ExecutionDomainError";
  constructor(readonly code: "INVALID_SESSION_DATES" | "ACTIVE_SESSION_EXISTS" | "INVALID_TEST_RESULT") {
    super(code);
  }
}

export interface TestCounts { correct: number; wrong: number; blank: number; total: number }
export interface TestResultDelta { total: number; correct: number; wrong: number; blank: number }

export function calculateSessionDuration(startedAt: string | Date, endedAt: string | Date): number {
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    throw new ExecutionDomainError("INVALID_SESSION_DATES");
  }
  return Math.max(1, Math.floor((end - start) / 60_000));
}

export function assertCanStartSession(hasActiveSession: boolean): void {
  if (hasActiveSession) throw new ExecutionDomainError("ACTIVE_SESSION_EXISTS");
}

export function validateTestResult(input: TestCounts): TestCounts {
  const values = [input.correct, input.wrong, input.blank, input.total];
  if (values.some((value) => !Number.isInteger(value) || value < 0)
    || input.total <= 0
    || input.correct + input.wrong + input.blank !== input.total) {
    throw new ExecutionDomainError("INVALID_TEST_RESULT");
  }
  return input;
}

export function calculateTestAccuracy(input: TestCounts): number {
  const valid = validateTestResult(input);
  return valid.correct / valid.total;
}

export function deriveInitialReviewStatus(input: TestCounts): "pending" | "reviewed" {
  validateTestResult(input);
  return input.wrong > 0 || input.blank > 0 ? "pending" : "reviewed";
}

export function applyTestResultDelta(previous: TestCounts, next: TestCounts): TestResultDelta {
  validateTestResult(previous);
  validateTestResult(next);
  return {
    total: next.total - previous.total,
    correct: next.correct - previous.correct,
    wrong: next.wrong - previous.wrong,
    blank: next.blank - previous.blank,
  };
}

export function applyCompletedSessionMinutes(input: {
  currentMinutes: number;
  durationMinutes: number;
  status: "completed" | "cancelled";
  alreadyApplied: boolean;
}): number {
  if (input.currentMinutes < 0 || input.durationMinutes < 0) throw new ExecutionDomainError("INVALID_SESSION_DATES");
  if (input.status === "cancelled" || input.alreadyApplied) return input.currentMinutes;
  return input.currentMinutes + input.durationMinutes;
}
