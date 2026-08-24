import { describe, expect, it } from "vitest";
import { LEARNING_STAGE_POLICY_VERSION, evaluateLearningStage } from "./learning-stage";

function baseline() {
  return {
    learn: { requiredUnits: 2, completedRequiredUnits: 0 },
    practice: { requiredUnits: 1, completedRequiredUnits: 0 },
    review: { requiredUnits: 1, completedRequiredUnits: 0 },
    reinforcement: { requiredUnits: 1, completedRequiredUnits: 0 },
  };
}

describe("PLN-004 learning stage model", () => {
  it("allows Learn and blocks Practice for a fresh topic", () => {
    const decision = evaluateLearningStage(baseline());

    expect(decision.stages.learn).toMatchObject({
      state: "not_started",
      allowed: true,
      blockedBy: [],
    });
    expect(decision.stages.practice).toMatchObject({
      state: "not_started",
      allowed: false,
      blockedBy: ["learn"],
    });
  });

  it("keeps Learn in progress and Practice blocked when required Learn evidence is partial", () => {
    const input = baseline();
    input.learn.completedRequiredUnits = 1;

    const decision = evaluateLearningStage(input);

    expect(decision.stages.learn.state).toBe("in_progress");
    expect(decision.stages.learn.allowed).toBe(true);
    expect(decision.stages.practice.allowed).toBe(false);
    expect(decision.stages.practice.blockedBy).toEqual(["learn"]);
  });

  it("unlocks Practice only after required Learn evidence is satisfied", () => {
    const input = baseline();
    input.learn.completedRequiredUnits = 2;

    const decision = evaluateLearningStage(input);

    expect(decision.stages.learn.state).toBe("satisfied");
    expect(decision.stages.practice.allowed).toBe(true);
    expect(decision.stages.practice.blockedBy).toEqual([]);
  });

  it("preserves out-of-order Practice evidence without letting it prove Learn", () => {
    const input = baseline();
    input.practice.completedRequiredUnits = 1;

    const decision = evaluateLearningStage(input);

    expect(decision.stages.learn.state).toBe("not_started");
    expect(decision.stages.practice.state).toBe("satisfied");
    expect(decision.stages.practice.allowed).toBe(false);
    expect(decision.stages.practice.blockedBy).toEqual(["learn"]);
  });

  it("does not authorize advancement when prerequisite evidence is unknown", () => {
    const input = {
      ...baseline(),
      learn: {
        ...baseline().learn,
        unknown: true,
      },
    };

    const decision = evaluateLearningStage(input);

    expect(decision.stages.learn.state).toBe("unknown");
    expect(decision.stages.practice.allowed).toBe(false);
    expect(decision.stages.practice.blockedBy).toEqual(["learn"]);
  });

  it("reopens Learn remediation without erasing historical completion", () => {
    const input = {
      ...baseline(),
      learn: {
        requiredUnits: 2,
        completedRequiredUnits: 2,
        remediationRequired: true,
      },
    };

    const decision = evaluateLearningStage(input);

    expect(decision.stages.learn).toMatchObject({
      state: "remediation_required",
      allowed: true,
    });
    expect(decision.stages.practice.allowed).toBe(false);
    expect(decision.stages.practice.blockedBy).toEqual(["learn"]);
  });

  it("returns the same versioned deterministic decision for the same evidence", () => {
    const input = baseline();
    input.learn.completedRequiredUnits = 2;

    const first = evaluateLearningStage(input);
    const second = evaluateLearningStage(input);

    expect(first.policyVersion).toBe(LEARNING_STAGE_POLICY_VERSION);
    expect(first.policyVersion).toBe("pln-004-v1");
    expect(first).toEqual(second);
  });
});

describe("PLN-004 advanced evidence boundaries", () => {
  it("accepts explicit trusted prior-learning evidence without fabricating material-unit completion", () => {
    const input = {
      ...baseline(),
      learn: {
        ...baseline().learn,
        acceptedPriorEvidence: true,
      },
    };

    const decision = evaluateLearningStage(input);

    expect(input.learn.completedRequiredUnits).toBe(0);
    expect(decision.stages.learn.state).toBe("satisfied");
    expect(decision.stages.practice.allowed).toBe(true);
  });

  it("does not treat an explicit skip as stage satisfaction", () => {
    const input = {
      ...baseline(),
      learn: {
        ...baseline().learn,
        explicitlySkipped: true,
      },
    };

    const decision = evaluateLearningStage(input);

    expect(decision.stages.learn.state).toBe("not_started");
    expect(decision.stages.practice.allowed).toBe(false);
  });

  it("allows an explicitly justified non-advancing Review after Learn without unlocking Reinforcement", () => {
    const input = {
      ...baseline(),
      learn: { requiredUnits: 2, completedRequiredUnits: 2 },
      allowNonAdvancingReview: true,
    };

    const decision = evaluateLearningStage(input);

    expect(decision.stages.practice.allowed).toBe(true);
    expect(decision.stages.review).toMatchObject({
      allowed: true,
      blockedBy: [],
      reason: "explicit_non_advancing_review",
    });
    expect(decision.stages.reinforcement.allowed).toBe(false);
    expect(decision.stages.reinforcement.blockedBy).toEqual(["practice"]);
  });

  it("does not let task completion or credited minutes satisfy missing unit evidence", () => {
    const input = {
      ...baseline(),
      learn: {
        ...baseline().learn,
        taskCompleted: true,
        creditedMinutes: 75,
        estimatedMinutes: 75,
      },
    };

    const decision = evaluateLearningStage(input);

    expect(decision.stages.learn.state).toBe("not_started");
    expect(decision.stages.practice.allowed).toBe(false);
  });

  it("preserves completed evidence while reopening Learn for remediation", () => {
    const input = {
      ...baseline(),
      learn: {
        requiredUnits: 2,
        completedRequiredUnits: 2,
        remediationRequired: true,
      },
    };

    const decision = evaluateLearningStage(input);

    expect(input.learn.completedRequiredUnits).toBe(2);
    expect(decision.stages.learn.state).toBe("remediation_required");
    expect(decision.stages.practice.allowed).toBe(false);
  });
});
