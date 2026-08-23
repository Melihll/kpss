import { describe, expect, it } from "vitest";
import { aggregateCompletedStudySessions, aggregatePlannedCreditByDate } from "../supabase/functions/_shared/completed-study.ts";

describe("completed study aggregation", () => {
  it("aggregates actual study by date even when the completed session has no resource", () => {
    const result = aggregateCompletedStudySessions([
      { resource_id: null, duration_minutes: 60, started_at: "2026-08-16T09:00:00+03:00" },
    ]);
    expect(result.actualByDate.get("2026-08-16")).toBe(60);
    expect(result.actualByResource.size).toBe(0);
  });

  it("keeps date and resource totals independent", () => {
    const result = aggregateCompletedStudySessions([
      { resource_id: "resource", duration_minutes: 35, started_at: "2026-08-16T10:00:00+03:00" },
      { resource_id: null, duration_minutes: 25, started_at: "2026-08-16T11:00:00+03:00" },
    ]);
    expect(result.actualByDate.get("2026-08-16")).toBe(60);
    expect(result.actualByResource.get("resource")).toBe(35);
  });
});

describe("planned credit aggregation", () => {
  it("uses planned credit instead of total actual study for planner capacity consumption", () => {
    const result = aggregatePlannedCreditByDate([
      {
        planned_credit_minutes: 60,
        study_sessions: { started_at: "2026-08-16T09:00:00+03:00" },
      },
      {
        planned_credit_minutes: 0,
        study_sessions: { started_at: "2026-08-16T10:00:00+03:00" },
      },
    ]);

    expect(result.get("2026-08-16")).toBe(60);
  });
});
