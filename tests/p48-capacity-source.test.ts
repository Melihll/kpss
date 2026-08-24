import { describe, expect, it } from "vitest";
import { classifyP48CapacitySource } from "../supabase/functions/_shared/p48-capacity-source.ts";

describe("P48 weekly capacity source", () => {
  it("rejects a positive strategy target with no recurring or week-specific capacity", () => {
    expect(classifyP48CapacitySource({
      weeklyTargetMinutes: 1800,
      activeAvailabilityCount: 0,
      dailyOverrideCount: 0,
    })).toBe("missing_capacity_source");
  });

  it("accepts recurring weekly availability", () => {
    expect(classifyP48CapacitySource({
      weeklyTargetMinutes: 1800,
      activeAvailabilityCount: 7,
      dailyOverrideCount: 0,
    })).toBe("configured");
  });

  it("accepts an explicit current-week capacity model", () => {
    expect(classifyP48CapacitySource({
      weeklyTargetMinutes: 1800,
      activeAvailabilityCount: 0,
      dailyOverrideCount: 7,
    })).toBe("configured");
  });

  it("does not manufacture a missing-capacity error when the strategy target is zero", () => {
    expect(classifyP48CapacitySource({
      weeklyTargetMinutes: 0,
      activeAvailabilityCount: 0,
      dailyOverrideCount: 0,
    })).toBe("configured");
  });
});
