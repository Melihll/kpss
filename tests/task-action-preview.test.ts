import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildTaskActionPreview } from "../supabase/functions/_shared/task-action-preview";

const task = {
  id: "task-1",
  title: "Anayasa tekrar",
  subjectName: "Vatandaşlık",
  resourceName: "Kaynak",
  plannedDate: "2026-08-20",
  status: "planned",
  estimatedMinutes: 60,
  completedMinutes: 15,
  remainingMinutes: 45,
  active: false,
};

describe("buildTaskActionPreview", () => {
  it("builds one MOVE proposal for the nearest feasible future day", () => {
    const result = buildTaskActionPreview({
      action: "DEFER",
      task,
      currentDate: "2026-08-20",
      targetDate: "2026-08-21",
      targetRemainingCapacityMinutes: 90,
    });

    expect(result.status).toBe("READY");
    expect(result.previewOnly).toBe(true);
    expect(result.applyRecommended).toBe(false);
    expect(result.proposal.changedTaskCount).toBe(1);
    expect(result.proposal.moves).toHaveLength(1);
    expect(result.proposal.moves[0]).toMatchObject({
      changeType: "MOVE",
      taskId: "task-1",
      fromDate: "2026-08-20",
      toDate: "2026-08-21",
      remainingMinutes: 45,
    });
    expect(result.capacity).toEqual({
      targetRemainingMinutes: 90,
      afterMoveMinutes: 45,
    });
    expect(result.mutations).toEqual([]);
  });

  it("builds one BACKLOG proposal for remove-from-today", () => {
    const result = buildTaskActionPreview({
      action: "REMOVE_TODAY",
      task,
      currentDate: "2026-08-20",
    });

    expect(result.status).toBe("READY");
    expect(result.proposal.moves).toEqual([]);
    expect(result.proposal.backlog).toHaveLength(1);
    expect(result.proposal.backlog[0]).toMatchObject({
      changeType: "BACKLOG",
      fromDate: "2026-08-20",
      toDate: null,
      remainingMinutes: 45,
    });
    expect(result.mutations).toEqual([]);
  });

  it("returns duration details with zero plan changes", () => {
    const result = buildTaskActionPreview({
      action: "DURATION_DETAILS",
      task,
      currentDate: "2026-08-20",
    });

    expect(result.status).toBe("INFO");
    expect(result.duration).toEqual({
      estimatedMinutes: 60,
      completedMinutes: 15,
      remainingMinutes: 45,
    });
    expect(result.proposal.changedTaskCount).toBe(0);
    expect(result.changes).toEqual([]);
  });

  it("blocks active and completed tasks", () => {
    expect(buildTaskActionPreview({
      action: "DEFER",
      task: { ...task, active: true },
      currentDate: "2026-08-20",
      targetDate: "2026-08-21",
      targetRemainingCapacityMinutes: 90,
    }).reasonCodes).toContain("ACTIVE_TASK_CANNOT_MOVE");

    expect(buildTaskActionPreview({
      action: "REMOVE_TODAY",
      task: { ...task, status: "completed", remainingMinutes: 0 },
      currentDate: "2026-08-20",
    }).reasonCodes).toContain("COMPLETED_TASK_CANNOT_MOVE");
  });

  it("blocks defer when no feasible future day exists", () => {
    const result = buildTaskActionPreview({
      action: "DEFER",
      task,
      currentDate: "2026-08-20",
      targetDate: null,
      targetRemainingCapacityMinutes: null,
    });

    expect(result.status).toBe("BLOCKED");
    expect(result.reasonCodes).toContain("NO_FEASIBLE_FUTURE_DAY");
    expect(result.proposal.changedTaskCount).toBe(0);
  });
});

describe("P1-06A app-api safety contract", () => {
  const appApi = readFileSync(
    new URL("../supabase/functions/app-api/index.ts", import.meta.url),
    "utf8",
  );

  it("exposes a preview-only task action route without mutation calls", () => {
    const start = appApi.indexOf("const taskActionPreviewMatch");
    const end = appApi.indexOf('route === "/tasks/next"', start);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const routeBody = appApi.slice(start, end);
    expect(routeBody).toContain("buildTaskActionPreview");
    expect(routeBody).toContain("loadDailyCoachContext");
    expect(routeBody).not.toContain(".insert(");
    expect(routeBody).not.toContain(".update(");
    expect(routeBody).not.toContain(".upsert(");
    expect(routeBody).not.toContain(".delete(");
    expect(routeBody).not.toContain(".rpc(");
    expect(routeBody).not.toContain("replace_manual_weekly_plan");
    expect(routeBody).not.toContain("persist_weekly_plan");
  });
});