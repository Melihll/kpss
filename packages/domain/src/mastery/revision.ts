import {
  CRITICAL_OVERDUE_AFTER_DAYS,
  DEFAULT_WEEKLY_REVISION_BUDGET_RATIO,
  REVISION_ESTIMATED_MINUTES,
  REVISION_INTERVAL_DAYS,
  REVISION_TYPE_BY_MASTERY,
} from "./config";
import type {
  RevisionDecision,
  RevisionDecisionContext,
  RevisionStatus,
  RevisionType,
  RevisionUrgency,
} from "./types";

function parseDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("INVALID_REVISION_DATE");
  const value = new Date(`${date}T12:00:00Z`);
  if (value.toISOString().slice(0, 10) !== date) throw new Error("INVALID_REVISION_DATE");
  return value;
}

export function addRevisionCalendarDays(date: string, days: number) {
  const value = parseDate(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function getRevisionUrgency(scheduledFor: string, today: string): RevisionUrgency {
  const scheduled = parseDate(scheduledFor).getTime();
  const current = parseDate(today).getTime();
  const daysLate = Math.floor((current - scheduled) / 86_400_000);
  if (daysLate < 0) return "upcoming";
  if (daysLate === 0) return "due";
  if (daysLate >= CRITICAL_OVERDUE_AFTER_DAYS) return "critical_overdue";
  return "overdue";
}

export function buildRevisionDecision(context: RevisionDecisionContext): RevisionDecision {
  if (context.masteryLevel === "unknown") {
    return {
      shouldSchedule: false,
      shouldCreateNew: false,
      activeRevisionId: null,
      revisionType: null,
      intervalDays: null,
      scheduledFor: null,
      estimatedMinutes: null,
      reason: "INSUFFICIENT_EVIDENCE",
    };
  }
  const active = context.previousRevisionSchedules.find((schedule) =>
    schedule.status === "scheduled" || schedule.status === "due");
  const revisionType: RevisionType = context.pendingWrongReview
    ? "wrong_review"
    : REVISION_TYPE_BY_MASTERY[context.masteryLevel];
  const intervalDays = REVISION_INTERVAL_DAYS[context.masteryLevel];
  return {
    shouldSchedule: true,
    shouldCreateNew: !active,
    activeRevisionId: active?.id ?? null,
    revisionType,
    intervalDays,
    scheduledFor: addRevisionCalendarDays(context.today, intervalDays),
    estimatedMinutes: REVISION_ESTIMATED_MINUTES[revisionType],
    reason: context.pendingWrongReview ? "PENDING_WRONG_REVIEW" : `MASTERY_${context.masteryLevel.toUpperCase()}`,
  };
}

export function calculateWeeklyRevisionBudget(planningBudgetMinutes: number, ratio = DEFAULT_WEEKLY_REVISION_BUDGET_RATIO) {
  if (!Number.isFinite(planningBudgetMinutes) || planningBudgetMinutes < 0 || ratio < 0 || ratio > 1) {
    throw new Error("INVALID_REVISION_BUDGET");
  }
  return Math.floor(planningBudgetMinutes * ratio);
}

export function completeRevisionStatus(status: RevisionStatus): "completed" {
  if (status === "completed") return "completed";
  if (status !== "scheduled" && status !== "due") throw new Error("REVISION_NOT_ACTIVE");
  return "completed";
}
