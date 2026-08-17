import { describe, expect, it } from "vitest";
import { planningCapacityForDate } from "../supabase/functions/_shared/capacity-overrides.ts";

const overrides = new Map([
  ["2026-08-17", { capacity_date: "2026-08-17", capacity_minutes: 240, reserve_minutes: 0 }],
  ["2026-08-18", { capacity_date: "2026-08-18", capacity_minutes: 240, reserve_minutes: 0 }],
  ["2026-08-23", { capacity_date: "2026-08-23", capacity_minutes: 300, reserve_minutes: 15 }],
]);

describe("daily capacity override and schedule-exception layering", () => {
  it("adds a +60 Monday exception on top of the imported 240-minute override", () => {
    expect(planningCapacityForDate("2026-08-17", 300, overrides, 240)).toBe(300);
  });

  it("does not reduce or change other overridden days", () => {
    expect(planningCapacityForDate("2026-08-18", 240, overrides, 240)).toBe(240);
    expect(planningCapacityForDate("2026-08-23", 300, overrides, 300)).toBe(285);
  });

  it("applies a negative exception to an imported override without going below zero", () => {
    expect(planningCapacityForDate("2026-08-17", 180, overrides, 240)).toBe(180);
    expect(planningCapacityForDate("2026-08-17", -60, overrides, 240)).toBe(0);
  });
});
