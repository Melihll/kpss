import { describe, expect, it } from "vitest";
import { evaluateLearningStage } from "./learning-stage";
import { summarizeMaterialStageEvidence } from "./learning-stage-evidence";

function emptyStage(requiredUnits = 1) {
  return { requiredUnits, completedRequiredUnits: 0 };
}

describe("PLN-004 material evidence to learning-stage flow", () => {
  it("unlocks Practice when all required Learn material units are validly completed", () => {
    const learn = summarizeMaterialStageEvidence({
      targetId: "topic-1",
      stage: "learn",
      units: [
        {
          unitId: "video-1",
          targetId: "topic-1",
          stage: "learn",
          required: true,
          progress: "completed",
          topicMapping: "validated",
          provenance: "observed",
        },
        {
          unitId: "pages-10-20",
          targetId: "topic-1",
          stage: "learn",
          required: true,
          progress: "completed",
          topicMapping: "validated",
          provenance: "observed",
        },
      ],
    });

    const decision = evaluateLearningStage({
      learn,
      practice: emptyStage(),
      review: emptyStage(),
      reinforcement: emptyStage(),
    });

    expect(decision.stages.learn.state).toBe("satisfied");
    expect(decision.stages.practice.allowed).toBe(true);
  });

  it("keeps Practice blocked when a completed material unit has ambiguous topic mapping", () => {
    const learn = summarizeMaterialStageEvidence({
      targetId: "topic-2",
      stage: "learn",
      units: [{
        unitId: "video-7",
        targetId: "topic-2",
        stage: "learn",
        required: true,
        progress: "completed",
        topicMapping: "ambiguous",
        provenance: "observed",
      }],
    });

    const decision = evaluateLearningStage({
      learn,
      practice: emptyStage(),
      review: emptyStage(),
      reinforcement: emptyStage(),
    });

    expect(decision.stages.learn.state).toBe("unknown");
    expect(decision.stages.practice.allowed).toBe(false);
    expect(decision.stages.practice.blockedBy).toEqual(["learn"]);
  });

  it("preserves completed material history while reopening Learn after forgotten content", () => {
    const learn = summarizeMaterialStageEvidence({
      targetId: "topic-3",
      stage: "learn",
      units: [{
        unitId: "video-9",
        targetId: "topic-3",
        stage: "learn",
        required: true,
        progress: "completed",
        topicMapping: "validated",
        provenance: "user_confirmed",
        forgotten: true,
      }],
    });

    expect(learn.completedRequiredUnits).toBe(1);

    const decision = evaluateLearningStage({
      learn,
      practice: emptyStage(),
      review: emptyStage(),
      reinforcement: emptyStage(),
    });

    expect(decision.stages.learn.state).toBe("remediation_required");
    expect(decision.stages.practice.allowed).toBe(false);
  });

  it("preserves out-of-order Practice evidence without allowing it to satisfy Learn", () => {
    const practice = summarizeMaterialStageEvidence({
      targetId: "topic-4",
      stage: "practice",
      units: [{
        unitId: "test-4",
        targetId: "topic-4",
        stage: "practice",
        required: true,
        progress: "completed",
        topicMapping: "validated",
        provenance: "observed",
      }],
    });

    const decision = evaluateLearningStage({
      learn: emptyStage(),
      practice,
      review: emptyStage(),
      reinforcement: emptyStage(),
    });

    expect(decision.stages.learn.state).toBe("not_started");
    expect(decision.stages.practice.state).toBe("satisfied");
    expect(decision.stages.practice.allowed).toBe(false);
    expect(decision.stages.practice.blockedBy).toEqual(["learn"]);
  });
});
