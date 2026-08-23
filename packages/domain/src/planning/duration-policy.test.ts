import { describe, expect, it } from "vitest";
import { STUDY_BLOCK_DURATION_POLICY_VERSION, resolveStudyBlockDuration } from "./duration-policy";

describe("PLN-003 study block duration policy", () => {
  it("uses the deterministic preferred duration when AI has no recommendation", () => {
    expect(resolveStudyBlockDuration({ blockClass: "new_learning" })).toMatchObject({
      minutes: 75,
      source: "deterministic_default",
    });
  });

  it("normalizes an AI recommendation below the class minimum", () => {
    expect(resolveStudyBlockDuration({ blockClass: "new_learning", aiRecommendedMinutes: 10 })).toMatchObject({
      minutes: 60,
      source: "ai_normalized",
    });
  });

  it("normalizes an AI recommendation above the single-block maximum", () => {
    expect(resolveStudyBlockDuration({ blockClass: "new_learning", aiRecommendedMinutes: 140 })).toMatchObject({
      minutes: 90,
      source: "ai_normalized",
    });
  });

  it("preserves a genuine short remainder instead of inflating it to the class minimum", () => {
    expect(resolveStudyBlockDuration({ blockClass: "new_learning", remainderMinutes: 16 })).toMatchObject({
      minutes: 16,
      source: "remainder",
    });
  });

  it("preserves an explicit user duration even when it violates the normal class range", () => {
    expect(resolveStudyBlockDuration({ blockClass: "new_learning", userOverrideMinutes: 25 })).toMatchObject({
      minutes: 25,
      source: "user_override",
      policyDeviation: true,
    });
  });

  it("falls back to the deterministic preferred duration when AI confidence is low", () => {
    expect(resolveStudyBlockDuration({
      blockClass: "new_learning",
      aiRecommendedMinutes: 82,
      aiConfidence: 0.3,
    })).toMatchObject({
      minutes: 75,
      source: "deterministic_default",
    });
  });

  it("normalizes an accepted AI recommendation to a deterministic five-minute step", () => {
    expect(resolveStudyBlockDuration({
      blockClass: "new_learning",
      aiRecommendedMinutes: 82,
      aiConfidence: 0.9,
    })).toMatchObject({
      minutes: 80,
      source: "ai_normalized",
    });
  });

  it("returns the same versioned decision for the same authoritative input", () => {
    const input = {
      blockClass: "primary_practice" as const,
      aiRecommendedMinutes: 53,
      aiConfidence: 0.9,
    };
    const first = resolveStudyBlockDuration(input);
    const second = resolveStudyBlockDuration(input);

    expect(first.policyVersion).toBe(STUDY_BLOCK_DURATION_POLICY_VERSION);
    expect(first.policyVersion).toBe("pln-003-v1");
    expect(first).toEqual(second);
  });
});
