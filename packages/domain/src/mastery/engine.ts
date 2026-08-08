import type { MasteryLevel, TopicProgressState } from "../types";
import {
  MASTERY_LEVEL_ORDER,
  MASTERY_RECENT_RESULT_LIMIT,
  MASTERY_THRESHOLDS,
  MAX_MASTERY_LEVEL_STEP,
  MIN_QUESTIONS_FOR_MASTERY,
} from "./config";
import type { MasteryReason, TopicMasteryAssessment, TopicMasteryContext } from "./types";

function candidateForAccuracy(accuracy: number): Exclude<MasteryLevel, "unknown"> {
  if (accuracy >= MASTERY_THRESHOLDS.strong) return "strong";
  if (accuracy >= MASTERY_THRESHOLDS.sufficient) return "sufficient";
  if (accuracy >= MASTERY_THRESHOLDS.fragile) return "fragile";
  if (accuracy >= MASTERY_THRESHOLDS.weak) return "weak";
  return "critical";
}

function reasonFor(level: MasteryLevel): MasteryReason {
  if (level === "strong") return "CONSISTENT_STRONG_RESULTS";
  if (level === "sufficient") return "SUFFICIENT_RESULTS";
  if (level === "fragile") return "FRAGILE_RESULTS";
  if (level === "weak") return "WEAK_RESULTS";
  return "CRITICAL_RESULTS";
}

function applyHysteresis(current: MasteryLevel, candidate: MasteryLevel) {
  if (current === "unknown" || candidate === "unknown") return candidate;
  const currentIndex = MASTERY_LEVEL_ORDER.indexOf(current);
  const candidateIndex = MASTERY_LEVEL_ORDER.indexOf(candidate);
  const distance = candidateIndex - currentIndex;
  if (Math.abs(distance) <= MAX_MASTERY_LEVEL_STEP) return candidate;
  return MASTERY_LEVEL_ORDER[currentIndex + Math.sign(distance) * MAX_MASTERY_LEVEL_STEP]!;
}

function topicStateFor(
  mastery: MasteryLevel,
  currentState: TopicProgressState,
  hasSufficientEvidence: boolean,
): TopicProgressState {
  if (!hasSufficientEvidence || mastery === "unknown") return currentState;
  if (mastery === "strong" || mastery === "sufficient") {
    return currentState === "maintenance" ? "maintenance" : "learned";
  }
  if (mastery === "fragile") return "practicing";
  return "remediation";
}

export function evaluateTopicMastery(context: TopicMasteryContext): TopicMasteryAssessment {
  const recent = [...context.recentTestResults]
    .sort((left, right) => new Date(right.completedAt).getTime() - new Date(left.completedAt).getTime())
    .slice(0, MASTERY_RECENT_RESULT_LIMIT);
  for (const result of recent) {
    if (![result.correct, result.wrong, result.blank, result.total].every(Number.isInteger)
      || result.correct < 0 || result.wrong < 0 || result.blank < 0
      || result.total <= 0 || result.correct + result.wrong + result.blank !== result.total) {
      throw new Error("INVALID_MASTERY_TEST_RESULT");
    }
  }
  const sampleQuestionCount = recent.reduce((sum, result) => sum + result.total, 0);
  const sampleCorrectCount = recent.reduce((sum, result) => sum + result.correct, 0);
  const sampleWrongCount = recent.reduce((sum, result) => sum + result.wrong, 0);
  const sampleBlankCount = recent.reduce((sum, result) => sum + result.blank, 0);
  const hasSufficientEvidence = sampleQuestionCount >= MIN_QUESTIONS_FOR_MASTERY;
  const accuracy = sampleQuestionCount ? sampleCorrectCount / sampleQuestionCount : null;
  const candidateMasteryLevel: MasteryLevel = hasSufficientEvidence && accuracy !== null
    ? candidateForAccuracy(accuracy)
    : "unknown";
  const resultingMasteryLevel = hasSufficientEvidence
    ? applyHysteresis(context.currentMasteryLevel, candidateMasteryLevel)
    : context.currentMasteryLevel;

  return {
    sampleQuestionCount,
    sampleCorrectCount,
    sampleWrongCount,
    sampleBlankCount,
    accuracy,
    previousMasteryLevel: context.currentMasteryLevel,
    candidateMasteryLevel,
    resultingMasteryLevel,
    resultingTopicState: topicStateFor(resultingMasteryLevel, context.topicState, hasSufficientEvidence),
    reason: hasSufficientEvidence ? reasonFor(candidateMasteryLevel) : "INSUFFICIENT_EVIDENCE",
    hasSufficientEvidence,
    hysteresisApplied: hasSufficientEvidence && resultingMasteryLevel !== candidateMasteryLevel,
  };
}
