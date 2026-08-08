import { describe, expect, it } from "vitest";
import {
  applyCompletedSessionMinutes, applyTestResultDelta, assertCanStartSession,
  calculateSessionDuration, calculateTestAccuracy, deriveInitialReviewStatus, validateTestResult,
} from "./execution";

describe("execution domain", () => {
  it("calculates floored session duration", () => expect(calculateSessionDuration("2026-08-08T10:00:00Z", "2026-08-08T10:52:59Z")).toBe(52));
  it("rejects invalid/negative dates", () => expect(() => calculateSessionDuration("bad", "2026-08-08T10:00:00Z")).toThrow(/INVALID_SESSION_DATES/));
  it("uses one minute minimum", () => expect(calculateSessionDuration("2026-08-08T10:00:00Z", "2026-08-08T10:00:20Z")).toBe(1));
  it("rejects a second active session", () => expect(() => assertCanStartSession(true)).toThrow(/ACTIVE_SESSION_EXISTS/));
  it("validates D+Y+B total", () => expect(validateTestResult({ correct: 31, wrong: 7, blank: 2, total: 40 }).total).toBe(40));
  it("rejects negative counts", () => expect(() => validateTestResult({ correct: -1, wrong: 1, blank: 0, total: 0 })).toThrow(/INVALID_TEST_RESULT/));
  it("calculates 0-1 accuracy", () => expect(calculateTestAccuracy({ correct: 31, wrong: 7, blank: 2, total: 40 })).toBeCloseTo(0.775));
  it("marks wrong answers pending", () => expect(deriveInitialReviewStatus({ correct: 9, wrong: 1, blank: 0, total: 10 })).toBe("pending"));
  it("marks perfect results reviewed", () => expect(deriveInitialReviewStatus({ correct: 10, wrong: 0, blank: 0, total: 10 })).toBe("reviewed"));
  it("calculates correction delta", () => expect(applyTestResultDelta({ correct: 20, wrong: 5, blank: 0, total: 25 }, { correct: 21, wrong: 4, blank: 0, total: 25 })).toEqual({ total: 0, correct: 1, wrong: -1, blank: 0 }));
  it("adds completed session actual minutes", () => expect(applyCompletedSessionMinutes({ currentMinutes: 10, durationMinutes: 52, status: "completed", alreadyApplied: false })).toBe(62));
  it("keeps repeated finish idempotent", () => expect(applyCompletedSessionMinutes({ currentMinutes: 62, durationMinutes: 52, status: "completed", alreadyApplied: true })).toBe(62));
  it("does not count cancelled sessions", () => expect(applyCompletedSessionMinutes({ currentMinutes: 10, durationMinutes: 52, status: "cancelled", alreadyApplied: false })).toBe(10));
});
