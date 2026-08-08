import { describe, expect, it } from "vitest";
import { calculateDayAvailableMinutes, calculateWeeklyAvailableMinutes } from "./capacity";

describe("availability capacity", () => {
  it("sums separate windows", () => {
    const windows = [
      { weekday: 1, start_time: "14:00", end_time: "18:00" },
      { weekday: 1, start_time: "20:00", end_time: "22:00" },
    ];
    expect(calculateDayAvailableMinutes(windows, 1)).toBe(360);
    expect(calculateWeeklyAvailableMinutes(windows)).toBe(360);
  });

  it("merges overlapping and touching windows without double counting", () => {
    const windows = [
      { weekday: 2, start_time: "09:00", end_time: "12:00" },
      { weekday: 2, start_time: "11:00", end_time: "13:00" },
      { weekday: 2, start_time: "13:00", end_time: "14:00" },
    ];
    expect(calculateDayAvailableMinutes(windows, 2)).toBe(300);
  });

  it("rejects invalid weekdays and time ranges", () => {
    expect(() => calculateWeeklyAvailableMinutes([{ weekday: 0, start_time: "10:00", end_time: "11:00" }])).toThrow();
    expect(() => calculateWeeklyAvailableMinutes([{ weekday: 1, start_time: "11:00", end_time: "10:00" }])).toThrow();
  });
});
