import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("P0-07 capacity consistency contract", () => {
  const appApi = readFileSync(
    new URL("../supabase/functions/app-api/index.ts", import.meta.url),
    "utf8",
  );

  const settings = readFileSync(
    new URL("../apps/web/src/pages/SettingsPage.tsx", import.meta.url),
    "utf8",
  );

  const week = readFileSync(
    new URL("../apps/web/src/pages/WeekPage.tsx", import.meta.url),
    "utf8",
  );

  const p48Week = readFileSync(
    new URL("../supabase/functions/_shared/p48-week.ts", import.meta.url),
    "utf8",
  );

  it("publishes one roadmap capacity contract with four distinct metrics", () => {
    const start = appApi.indexOf("async function loadP48Roadmap");
    const end = appApi.indexOf("async function generateP48Week", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const body = appApi.slice(start, end);

    expect(body).toContain("buildWeeklyCapacitySummary");
    expect(body).toContain("normalWeeklyMinutes");
    expect(body).toContain("planningTargetMinutes");
    expect(body).toContain("effectiveDayCapacities: grossDayCapacities");
    expect(body).toContain("planningBudgetMinutes");
    expect(body).toContain("capacity,");
  });

  it("keeps roadmap capacity enrichment read-only", () => {
    const start = appApi.indexOf("async function loadP48Roadmap");
    const end = appApi.indexOf("async function generateP48Week", start);
    const body = appApi.slice(start, end);

    expect(body).not.toContain(".insert(");
    expect(body).not.toContain(".update(");
    expect(body).not.toContain(".upsert(");
    expect(body).not.toContain(".delete(");
    expect(body).not.toContain(".rpc(");
  });

  it("Settings does not calculate/query weekly availability independently", () => {
    expect(settings).not.toContain("calculateWeeklyAvailableMinutes");
    expect(settings).not.toContain('from("weekly_availability")');

    expect(settings).toContain("roadmap?.capacity");
    expect(settings).toContain("normalWeeklyMinutes");
    expect(settings).toContain("planningTargetMinutes");
    expect(settings).toContain("effectiveWeeklyMinutes");
    expect(settings).toContain("planningBudgetMinutes");
  });

  it("Week never aliases plan availability as planning target", () => {
    expect(week).toContain(
      "data?.capacity?.planningTargetMinutes ?? 0",
    );
    expect(week).not.toContain(
      "plan?.available_minutes ?? 0",
    );
    expect(week).toContain("effectiveWeeklyMinutes");
    expect(week).toContain("planningBudgetMinutes");
  });

  it("uses planned credit rather than total actual study for P48 planner capacity", () => {
    const start = appApi.indexOf("async function generateP48Week");
    const end = appApi.indexOf("async function nextTask", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const generateBody = appApi.slice(start, end);

    for (const body of [generateBody, p48Week]) {
      expect(body).toContain("aggregatePlannedCreditByDate");
      expect(body).toContain("plannedCreditByDate");
      expect(body).toContain("actualByResource");
      expect(body).not.toContain("planningCapacity - (actualByDate.get(date) ?? 0)");
      expect(body).toContain("planningCapacity - (plannedCreditByDate.get(date) ?? 0)");
    }
  });
});
