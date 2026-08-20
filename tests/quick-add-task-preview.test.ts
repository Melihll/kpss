import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildQuickAddTaskPreview } from "../supabase/functions/_shared/quick-add-task-preview";

const base = {
  weeklyPlanId: "plan-1",
  subjectId: "subject-1",
  subjectName: "Vatandaşlık",
  title: "Anayasa kısa tekrar",
  plannedDate: "2026-08-20",
  estimatedMinutes: 30,
  remainingCapacityMinutes: 60,
};

describe("buildQuickAddTaskPreview", () => {
  it("produces one ready custom task candidate without plan replacement", () => {
    const result = buildQuickAddTaskPreview(base);

    expect(result.kind).toBe("QUICK_ADD_TASK_PREVIEW");
    expect(result.status).toBe("READY");
    expect(result.previewOnly).toBe(true);
    expect(result.replacesWeeklyPlan).toBe(false);
    expect(result.candidate).toEqual({
      taskType: "custom",
      subjectId: "subject-1",
      subjectName: "Vatandaşlık",
      title: "Anayasa kısa tekrar",
      plannedDate: "2026-08-20",
      estimatedMinutes: 30,
      sourceReason: "manual",
    });
    expect(result.mutations).toEqual([]);
  });

  it("returns a blocked preview instead of mutating when capacity is insufficient", () => {
    const result = buildQuickAddTaskPreview({
      ...base,
      estimatedMinutes: 90,
      remainingCapacityMinutes: 40,
    });

    expect(result.status).toBe("BLOCKED_CAPACITY");
    expect(result.capacity).toEqual({
      remainingMinutes: 40,
      afterCandidateMinutes: 0,
      fits: false,
    });
    expect(result.mutations).toEqual([]);
  });

  it("trims the candidate title", () => {
    expect(buildQuickAddTaskPreview({ ...base, title: "  Hızlı tekrar  " }).candidate.title)
      .toBe("Hızlı tekrar");
  });

  it("rejects a blank title", () => {
    expect(() => buildQuickAddTaskPreview({ ...base, title: "   " }))
      .toThrow("QUICK_ADD_INVALID_TITLE");
  });

  it("rejects non-positive or fractional minutes", () => {
    expect(() => buildQuickAddTaskPreview({ ...base, estimatedMinutes: 0 }))
      .toThrow("QUICK_ADD_INVALID_MINUTES");
    expect(() => buildQuickAddTaskPreview({ ...base, estimatedMinutes: 12.5 }))
      .toThrow("QUICK_ADD_INVALID_MINUTES");
  });
});

describe("P1-05A app-api safety contract", () => {
  const appApi = readFileSync(
    new URL("../supabase/functions/app-api/index.ts", import.meta.url),
    "utf8",
  );

  it("exposes a preview-only route with no task or weekly-plan mutation in its route body", () => {
    const start = appApi.indexOf('route === "/tasks/quick-add/preview"');
    const end = appApi.indexOf('route === "/tasks/next"', start);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const routeBody = appApi.slice(start, end);

    expect(routeBody).toContain("buildQuickAddTaskPreview");
    expect(routeBody).not.toContain('from("tasks").insert');
    expect(routeBody).not.toContain('from("tasks").update');
    expect(routeBody).not.toContain('from("tasks").upsert');
    expect(routeBody).not.toContain('from("tasks").delete');
    expect(routeBody).not.toContain("replace_manual_weekly_plan");
    expect(routeBody).not.toContain("persist_weekly_plan");
  });
});