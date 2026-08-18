import { describe, expect, it } from "vitest";
import {
  CANDIDATE_TYPES,
  DEFAULT_REPLAN_SCOPE_V2,
  PLAN_VALIDATION_VIOLATION_CODES,
  defaultReplanScopeV2,
} from "./index";

describe("Planning Engine V2 contracts", () => {
  it("keeps small study events non-replanning by default", () => {
    expect(defaultReplanScopeV2("STUDY_COMPLETED")).toBe("NO_REPLAN");
    expect(defaultReplanScopeV2("STUDY_DEVIATION")).toBe("NO_REPLAN");
    expect(defaultReplanScopeV2("CAPACITY_INCREASE")).toBe("NO_REPLAN");
  });

  it("maps repair and explicit planning triggers to bounded scopes", () => {
    expect(defaultReplanScopeV2("CAPACITY_DECREASE")).toBe(
      "LOCAL_CAPACITY_REPAIR",
    );
    expect(defaultReplanScopeV2("MISSED_DAY")).toBe("MISSED_DAY_REPAIR");
    expect(defaultReplanScopeV2("WEEKLY_REVIEW")).toBe(
      "WEEKLY_REOPTIMIZATION",
    );
    expect(defaultReplanScopeV2("MANUAL_REPLAN")).toBe("MANUAL_REPLAN");
  });

  it("keeps trigger defaults complete", () => {
    expect(Object.keys(DEFAULT_REPLAN_SCOPE_V2)).toHaveLength(8);
  });

  it("defines the required candidate families", () => {
    expect(CANDIDATE_TYPES).toContain("CONTINUATION");
    expect(CANDIDATE_TYPES).toContain("PREREQUISITE_REPAIR");
    expect(CANDIDATE_TYPES).toContain("SPACED_REVIEW");
  });

  it("defines critical validation guardrails", () => {
    expect(PLAN_VALIDATION_VIOLATION_CODES).toContain(
      "COMPLETED_TASK_MOVED",
    );
    expect(PLAN_VALIDATION_VIOLATION_CODES).toContain(
      "ACTIVE_TASK_MOVED",
    );
    expect(PLAN_VALIDATION_VIOLATION_CODES).toContain(
      "SNAPSHOT_STALE",
    );
  });
});
