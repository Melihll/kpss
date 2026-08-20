import { describe, expect, it } from "vitest";
import { grossCapacityForDate } from "../supabase/functions/_shared/capacity-overrides";
import { buildWeeklyCapacitySummary } from "../supabase/functions/_shared/capacity-summary";

describe("P0-07 weekly capacity summary", () => {
  it("keeps all four capacity concepts distinct", () => {
    expect(buildWeeklyCapacitySummary({
      normalWeeklyMinutes: 1800,
      planningTargetMinutes: 1500,
      effectiveDayCapacities: {
        "2026-08-17": 180,
        "2026-08-18": 240,
        "2026-08-19": 240,
      },
      planningBudgetMinutes: 561,
    })).toEqual({
      normalWeeklyMinutes: 1800,
      planningTargetMinutes: 1500,
      effectiveWeeklyMinutes: 660,
      planningBudgetMinutes: 561,
    });
  });

  it("preserves legitimate zero-minute values", () => {
    expect(buildWeeklyCapacitySummary({
      normalWeeklyMinutes: 0,
      planningTargetMinutes: 0,
      effectiveDayCapacities: { "2026-08-20": 0 },
      planningBudgetMinutes: 0,
    })).toEqual({
      normalWeeklyMinutes: 0,
      planningTargetMinutes: 0,
      effectiveWeeklyMinutes: 0,
      planningBudgetMinutes: 0,
    });
  });

  it("keeps missing planning budget distinct from zero", () => {
    expect(buildWeeklyCapacitySummary({
      normalWeeklyMinutes: 600,
      planningTargetMinutes: 500,
      effectiveDayCapacities: {},
      planningBudgetMinutes: null,
    }).planningBudgetMinutes).toBeNull();
  });

  it("applies calendar/exception delta on top of a gross daily override", () => {
    const overrides = new Map([
      ["2026-08-20", {
        capacity_date: "2026-08-20",
        capacity_minutes: 180,
        reserve_minutes: 15,
      }],
    ]);

    expect(
      grossCapacityForDate("2026-08-20", 210, overrides, 240),
    ).toBe(150);

    expect(
      grossCapacityForDate("2026-08-21", 210, overrides, 240),
    ).toBe(210);
  });
});