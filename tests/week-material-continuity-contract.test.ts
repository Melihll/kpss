import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Evre 7D Week material continuity contract", () => {
  const week = readFileSync(
    new URL("../apps/web/src/pages/WeekPage.tsx", import.meta.url),
    "utf8",
  );
  const today = readFileSync(
    new URL("../apps/web/src/components/StudyTodayPanel.tsx", import.meta.url),
    "utf8",
  );
  const drawer = readFileSync(
    new URL("../apps/web/src/hooks/useTaskMaterialDrawer.tsx", import.meta.url),
    "utf8",
  );

  it("uses the same exact material presenter on Today and read-only Week", () => {
    for (const source of [today, week]) {
      expect(source).toContain("TaskMaterialSummary");

    }
    expect(today).toContain("useTaskMaterialDrawer");
    expect(week).not.toContain("useTaskMaterialDrawer");
    expect(week).toContain("Bugün’de aç");
    expect(drawer).toContain("ResourceDetailDrawer");
  });

  it("keeps material interaction read-only with respect to plan authority", () => {
    const combined = `${week}\n${drawer}`;
    expect(combined).not.toContain("/planner-v2/confirm");
    expect(combined).not.toContain("/planner-v2/apply");
    expect(combined).not.toContain("/plans/current/recalculate");
    expect(combined).not.toContain("/schedule-exceptions");
  });

  it("expands tasks explicitly and exposes exact scope only from the API task contract", () => {
    expect(week).toContain("<details className=\"wv-task\"");
    expect(week).toContain("<TaskMaterialSummary task={task}");
    expect(week).not.toContain("canonical_workload_identity");
    expect(week).not.toMatch(/title.*page|title.*sayfa/i);
  });
});
