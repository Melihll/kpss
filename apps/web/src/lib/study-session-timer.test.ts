import { describe, expect, it } from "vitest";
import { activeStudyElapsedMinutes } from "./study-session-timer";

const startedAt = "2026-08-20T06:00:00.000Z";

describe("activeStudyElapsedMinutes", () => {
  it("uses wall clock time when there are no breaks", () => {
    expect(
      activeStudyElapsedMinutes({
        startedAt,
        nowMs: Date.parse("2026-08-20T06:30:00.000Z"),
      }),
    ).toBe(30);
  });

  it("subtracts completed break time", () => {
    expect(
      activeStudyElapsedMinutes({
        startedAt,
        nowMs: Date.parse("2026-08-20T06:30:00.000Z"),
        closedBreakSeconds: 10 * 60,
      }),
    ).toBe(20);
  });

  it("freezes effective study time during an open break", () => {
    expect(
      activeStudyElapsedMinutes({
        startedAt,
        nowMs: Date.parse("2026-08-20T06:30:00.000Z"),
        openBreakStartedAt: "2026-08-20T06:10:00.000Z",
      }),
    ).toBe(10);
  });

  it("subtracts previous and current breaks together", () => {
    expect(
      activeStudyElapsedMinutes({
        startedAt,
        nowMs: Date.parse("2026-08-20T06:30:00.000Z"),
        closedBreakSeconds: 5 * 60,
        openBreakStartedAt: "2026-08-20T06:20:00.000Z",
      }),
    ).toBe(15);
  });

  it("fails closed for an invalid start timestamp", () => {
    expect(
      activeStudyElapsedMinutes({
        startedAt: "invalid",
        nowMs: Date.parse("2026-08-20T06:30:00.000Z"),
      }),
    ).toBe(0);
  });
});