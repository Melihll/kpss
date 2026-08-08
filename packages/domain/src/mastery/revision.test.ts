import { describe, expect, it } from "vitest";
import {
  addRevisionCalendarDays,
  buildRevisionDecision,
  calculateWeeklyRevisionBudget,
  completeRevisionStatus,
  getRevisionUrgency,
} from "./revision";
import type { RevisionDecisionContext } from "./types";

const context = (overrides: Partial<RevisionDecisionContext> = {}): RevisionDecisionContext => ({
  masteryLevel: "strong",
  topicState: "learned",
  latestAssessment: { reason: "CONSISTENT_STRONG_RESULTS", accuracy: 0.9 },
  previousRevisionSchedules: [],
  lastPracticedAt: "2026-08-08T10:00:00Z",
  pendingWrongReview: false,
  today: "2026-08-08",
  ...overrides,
});

describe("Revision Engine V1", () => {
  it("uses the longest interval for strong", () => {
    expect(buildRevisionDecision(context()).intervalDays).toBe(7);
  });

  it("uses five days for sufficient", () => {
    expect(buildRevisionDecision(context({ masteryLevel: "sufficient" })).intervalDays).toBe(5);
  });

  it("schedules fragile closer", () => {
    expect(buildRevisionDecision(context({ masteryLevel: "fragile" })).intervalDays).toBe(3);
  });

  it("schedules weak closer", () => {
    expect(buildRevisionDecision(context({ masteryLevel: "weak" })).intervalDays).toBe(2);
  });

  it("uses the shortest interval for critical", () => {
    const decision = buildRevisionDecision(context({ masteryLevel: "critical" }));
    expect(decision.intervalDays).toBe(1);
    expect(decision.revisionType).toBe("intensive_review");
  });

  it("prefers wrong review while wrongs are pending", () => {
    const decision = buildRevisionDecision(context({ masteryLevel: "weak", pendingWrongReview: true }));
    expect(decision.revisionType).toBe("wrong_review");
    expect(decision.estimatedMinutes).toBe(20);
  });

  it("does not request a duplicate active revision", () => {
    const decision = buildRevisionDecision(context({
      previousRevisionSchedules: [{ id: "active", status: "scheduled", revisionNumber: 1, scheduledFor: "2026-08-15" }],
    }));
    expect(decision.shouldCreateNew).toBe(false);
    expect(decision.activeRevisionId).toBe("active");
  });

  it("completes active revisions idempotently", () => {
    expect(completeRevisionStatus("scheduled")).toBe("completed");
    expect(completeRevisionStatus("completed")).toBe("completed");
  });

  it("calculates the weekly revision budget", () => {
    expect(calculateWeeklyRevisionBudget(510)).toBe(102);
  });

  it("calculates due and overdue urgency boundaries", () => {
    expect(getRevisionUrgency("2026-08-09", "2026-08-08")).toBe("upcoming");
    expect(getRevisionUrgency("2026-08-08", "2026-08-08")).toBe("due");
    expect(getRevisionUrgency("2026-08-07", "2026-08-08")).toBe("overdue");
    expect(getRevisionUrgency("2026-08-05", "2026-08-08")).toBe("critical_overdue");
  });

  it("adds Istanbul calendar dates without timestamp arithmetic", () => {
    expect(addRevisionCalendarDays("2026-08-08", 1)).toBe("2026-08-09");
  });
});
