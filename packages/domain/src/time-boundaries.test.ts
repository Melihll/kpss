import { describe, expect, it } from "vitest";
import { getZonedWeekRange, isInstantInRange } from "./time-boundaries";

describe("Europe/Istanbul execution boundaries", () => {
  const range = getZonedWeekRange("2026-08-05");

  it("includes Monday 00:30 in Istanbul", () => {
    expect(isInstantInRange("2026-08-02T21:30:00.000Z", range)).toBe(true);
  });

  it("excludes next Monday 00:30 in Istanbul", () => {
    expect(isInstantInRange("2026-08-09T21:30:00.000Z", range)).toBe(false);
  });

  it("includes Sunday 23:59 in Istanbul", () => {
    expect(isInstantInRange("2026-08-09T20:59:00.000Z", range)).toBe(true);
  });
});
