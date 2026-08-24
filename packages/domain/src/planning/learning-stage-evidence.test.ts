import { describe, expect, it } from "vitest";
import { summarizeMaterialStageEvidence } from "./learning-stage-evidence";

describe("PLN-004 canonical material evidence adapter", () => {
  it("counts only completed required units with validated topic mapping", () => {
    const result = summarizeMaterialStageEvidence({
      targetId: "topic-ebob-ekok",
      stage: "learn",
      units: [
        {
          unitId: "video-5",
          targetId: "topic-ebob-ekok",
          stage: "learn",
          required: true,
          progress: "completed",
          topicMapping: "validated",
          provenance: "observed",
        },
        {
          unitId: "video-6",
          targetId: "topic-ebob-ekok",
          stage: "learn",
          required: true,
          progress: "in_progress",
          topicMapping: "validated",
          provenance: "observed",
        },
      ],
    });

    expect(result).toMatchObject({
      requiredUnits: 2,
      completedRequiredUnits: 1,
      unknown: false,
      remediationRequired: false,
    });
  });

  it("does not count ambiguous or missing topic mappings as accepted completion", () => {
    const result = summarizeMaterialStageEvidence({
      targetId: "topic-history-1",
      stage: "learn",
      units: [
        {
          unitId: "video-18",
          targetId: "topic-history-1",
          stage: "learn",
          required: true,
          progress: "completed",
          topicMapping: "ambiguous",
          provenance: "observed",
        },
        {
          unitId: "pages-42-53",
          targetId: "topic-history-1",
          stage: "learn",
          required: true,
          progress: "completed",
          topicMapping: "missing",
          provenance: "observed",
        },
      ],
    });

    expect(result.requiredUnits).toBe(2);
    expect(result.completedRequiredUnits).toBe(0);
    expect(result.unknown).toBe(true);
  });

  it("preserves completed material evidence while marking forgotten content for remediation", () => {
    const result = summarizeMaterialStageEvidence({
      targetId: "topic-law-rights",
      stage: "learn",
      units: [
        {
          unitId: "video-8",
          targetId: "topic-law-rights",
          stage: "learn",
          required: true,
          progress: "completed",
          topicMapping: "validated",
          provenance: "user_confirmed",
          forgotten: true,
        },
      ],
    });

    expect(result.completedRequiredUnits).toBe(1);
    expect(result.remediationRequired).toBe(true);
  });

  it("does not accept AI recommendation alone as authoritative completion evidence", () => {
    const result = summarizeMaterialStageEvidence({
      targetId: "topic-geography-climate",
      stage: "learn",
      units: [
        {
          unitId: "video-11",
          targetId: "topic-geography-climate",
          stage: "learn",
          required: true,
          progress: "completed",
          topicMapping: "validated",
          provenance: "ai_recommendation",
        },
      ],
    });

    expect(result.requiredUnits).toBe(1);
    expect(result.completedRequiredUnits).toBe(0);
    expect(result.unknown).toBe(true);
  });

  it("ignores evidence belonging to another learning stage", () => {
    const result = summarizeMaterialStageEvidence({
      targetId: "topic-turkish-meaning",
      stage: "learn",
      units: [
        {
          unitId: "test-3",
          targetId: "topic-turkish-meaning",
          stage: "practice",
          required: true,
          progress: "completed",
          topicMapping: "validated",
          provenance: "observed",
        },
      ],
    });

    expect(result.requiredUnits).toBe(0);
    expect(result.completedRequiredUnits).toBe(0);
  });

  it("uses the same evidence rules independently of subject identity", () => {
    const mathematics = summarizeMaterialStageEvidence({
      targetId: "math-topic",
      stage: "learn",
      units: [{
        unitId: "math-video",
        targetId: "math-topic",
        stage: "learn",
        required: true,
        progress: "completed",
        topicMapping: "validated",
        provenance: "observed",
      }],
    });

    const history = summarizeMaterialStageEvidence({
      targetId: "history-topic",
      stage: "learn",
      units: [{
        unitId: "history-reading",
        targetId: "history-topic",
        stage: "learn",
        required: true,
        progress: "completed",
        topicMapping: "validated",
        provenance: "observed",
      }],
    });

    expect(mathematics).toEqual(history);
  });
});
