import { describe, expect, it } from "vitest";
import { evaluateTopicMastery } from "./engine";
import type { MasteryTestResult, TopicMasteryContext } from "./types";

const result = (correct: number, total = 20, completedAt = "2026-08-08T10:00:00Z"): MasteryTestResult => ({
  correct,
  wrong: total - correct,
  blank: 0,
  total,
  completedAt,
});
const context = (recentTestResults: MasteryTestResult[], overrides: Partial<TopicMasteryContext> = {}): TopicMasteryContext => ({
  recentTestResults,
  totalQuestionCount: recentTestResults.reduce((sum, item) => sum + item.total, 0),
  currentMasteryLevel: "unknown",
  topicState: "practicing",
  ...overrides,
});

describe("Mastery Engine V1", () => {
  it("does not assign definitive mastery with insufficient questions", () => {
    const assessment = evaluateTopicMastery(context([result(5, 5)]));
    expect(assessment.resultingMasteryLevel).toBe("unknown");
    expect(assessment.reason).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("classifies 85%+ evidence as strong", () => {
    expect(evaluateTopicMastery(context([result(18)])).resultingMasteryLevel).toBe("strong");
  });

  it("classifies 75-84% evidence as sufficient", () => {
    expect(evaluateTopicMastery(context([result(16)])).resultingMasteryLevel).toBe("sufficient");
  });

  it("classifies 65-74% evidence as fragile", () => {
    expect(evaluateTopicMastery(context([result(14)])).resultingMasteryLevel).toBe("fragile");
  });

  it("classifies 55-64% evidence as weak", () => {
    expect(evaluateTopicMastery(context([result(12)])).resultingMasteryLevel).toBe("weak");
  });

  it("classifies below 55% evidence as critical", () => {
    expect(evaluateTopicMastery(context([result(10)])).resultingMasteryLevel).toBe("critical");
  });

  it("does not drop strong directly to critical", () => {
    const assessment = evaluateTopicMastery(context([result(8)], { currentMasteryLevel: "strong", topicState: "learned" }));
    expect(assessment.candidateMasteryLevel).toBe("critical");
    expect(assessment.resultingMasteryLevel).toBe("sufficient");
    expect(assessment.hysteresisApplied).toBe(true);
  });

  it("does not raise critical directly to strong", () => {
    const assessment = evaluateTopicMastery(context([result(20)], { currentMasteryLevel: "critical", topicState: "remediation" }));
    expect(assessment.candidateMasteryLevel).toBe("strong");
    expect(assessment.resultingMasteryLevel).toBe("weak");
  });

  it("uses recent results instead of a strong lifetime aggregate", () => {
    const assessment = evaluateTopicMastery(context([result(8)], { totalQuestionCount: 1_000 }));
    expect(assessment.resultingMasteryLevel).toBe("critical");
  });

  it("returns the same deterministic assessment for the same input", () => {
    const input = context([result(9, 10, "2026-08-08T11:00:00Z"), result(7, 10, "2026-08-07T11:00:00Z")]);
    expect(evaluateTopicMastery(input)).toEqual(evaluateTopicMastery(input));
  });

  it("moves sufficient evidence to learned and weak evidence to remediation", () => {
    expect(evaluateTopicMastery(context([result(16)])).resultingTopicState).toBe("learned");
    expect(evaluateTopicMastery(context([result(12)])).resultingTopicState).toBe("remediation");
  });
});
