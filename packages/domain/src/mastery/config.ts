import type { MasteryLevel } from "../types";

export const MASTERY_RECENT_RESULT_LIMIT = 3;
export const MIN_QUESTIONS_FOR_MASTERY = 20;
export const MAX_MASTERY_LEVEL_STEP = 1;

export const MASTERY_THRESHOLDS = {
  strong: 0.85,
  sufficient: 0.75,
  fragile: 0.65,
  weak: 0.55,
} as const;

export const MASTERY_LEVEL_ORDER: readonly Exclude<MasteryLevel, "unknown">[] = [
  "critical",
  "weak",
  "fragile",
  "sufficient",
  "strong",
];

export const REVISION_INTERVAL_DAYS: Readonly<Record<Exclude<MasteryLevel, "unknown">, number>> = {
  strong: 7,
  sufficient: 5,
  fragile: 3,
  weak: 2,
  critical: 1,
};

export const REVISION_TYPE_BY_MASTERY = {
  strong: "short_review",
  sufficient: "short_review",
  fragile: "topic_test",
  weak: "topic_test",
  critical: "intensive_review",
} as const;

export const REVISION_ESTIMATED_MINUTES = {
  short_review: 15,
  wrong_review: 20,
  topic_test: 30,
  intensive_review: 45,
} as const;

export const DEFAULT_WEEKLY_REVISION_BUDGET_RATIO = 0.2;
export const CRITICAL_OVERDUE_AFTER_DAYS = 3;
