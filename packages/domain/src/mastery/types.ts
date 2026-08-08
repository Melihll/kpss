import type { MasteryLevel, TopicProgressState } from "../types";

export interface MasteryTestResult {
  correct: number;
  wrong: number;
  blank: number;
  total: number;
  completedAt: string;
}

export type MasteryReason =
  | "INSUFFICIENT_EVIDENCE"
  | "CONSISTENT_STRONG_RESULTS"
  | "SUFFICIENT_RESULTS"
  | "FRAGILE_RESULTS"
  | "WEAK_RESULTS"
  | "CRITICAL_RESULTS";

export interface TopicMasteryContext {
  recentTestResults: MasteryTestResult[];
  totalQuestionCount: number;
  currentMasteryLevel: MasteryLevel;
  topicState: TopicProgressState;
}

export interface TopicMasteryAssessment {
  sampleQuestionCount: number;
  sampleCorrectCount: number;
  sampleWrongCount: number;
  sampleBlankCount: number;
  accuracy: number | null;
  previousMasteryLevel: MasteryLevel;
  candidateMasteryLevel: MasteryLevel;
  resultingMasteryLevel: MasteryLevel;
  resultingTopicState: TopicProgressState;
  reason: MasteryReason;
  hasSufficientEvidence: boolean;
  hysteresisApplied: boolean;
}

export type RevisionStatus = "scheduled" | "due" | "completed" | "cancelled" | "superseded";
export type RevisionUrgency = "upcoming" | "due" | "overdue" | "critical_overdue";
export type RevisionType = "short_review" | "wrong_review" | "topic_test" | "intensive_review";

export interface PreviousRevisionSchedule {
  id: string;
  status: RevisionStatus;
  revisionNumber: number;
  scheduledFor: string;
}

export interface RevisionDecisionContext {
  masteryLevel: MasteryLevel;
  topicState: TopicProgressState;
  latestAssessment: Pick<TopicMasteryAssessment, "reason" | "accuracy">;
  previousRevisionSchedules: PreviousRevisionSchedule[];
  lastPracticedAt: string | null;
  pendingWrongReview: boolean;
  today: string;
}

export interface RevisionDecision {
  shouldSchedule: boolean;
  shouldCreateNew: boolean;
  activeRevisionId: string | null;
  revisionType: RevisionType | null;
  intervalDays: number | null;
  scheduledFor: string | null;
  estimatedMinutes: number | null;
  reason: string;
}
