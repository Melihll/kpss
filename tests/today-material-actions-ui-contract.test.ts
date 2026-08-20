import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("P1-13 Today material actions UI contract", () => {
  const today = readFileSync(
    new URL("../apps/web/src/components/StudyTodayPanel.tsx", import.meta.url),
    "utf8",
  );

  it("exposes the three required material actions", () => {
    expect(today).toContain("Kaynakla çalış");
    expect(today).toContain("Video izle");
    expect(today).toContain("Sayfa gir");
    expect(today).toContain("TaskMaterialActions");
  });

  it("opens the existing unified ResourceDetailDrawer on deterministic tabs", () => {
    expect(today).toContain("<ResourceDetailDrawer");
    expect(today).toContain('onOpen(task, "video")');
    expect(today).toContain('onOpen(task, "page")');
    expect(today).toContain("defaultTaskMaterialTab(task)");
    expect(today).toContain("taskMaterialResource(task)");
  });

  it("uses existing resource progress read/save flow instead of a new task mutation", () => {
    expect(today).toContain('`/resources/${resource.resourceId}/progress`');
    expect(today).not.toContain("/material/apply");
    expect(today).not.toContain("/material/start");
    expect(today).not.toContain("resource_unit_progress");
  });

  it("supports focus, active-session and continuation-task entry points", () => {
    expect(today).toContain("activeTask && <TaskMaterialActions");
    expect(today).toContain("<TaskMaterialActions task={focusTask}");
    expect(today).toContain("<TaskMaterialActions task={task}");
  });
});