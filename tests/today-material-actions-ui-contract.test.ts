import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("P1-13 Today material actions UI contract", () => {
  const today = readFileSync(
    new URL("../apps/web/src/components/StudyTodayPanel.tsx", import.meta.url),
    "utf8",
  );
  const materialSummary = readFileSync(
    new URL("../apps/web/src/components/TaskMaterialSummary.tsx", import.meta.url),
    "utf8",
  );
  const materialDrawerHook = readFileSync(
    new URL("../apps/web/src/hooks/useTaskMaterialDrawer.tsx", import.meta.url),
    "utf8",
  );

  it("exposes the three required material actions", () => {
    expect(materialSummary).toContain("Kaynakla çalış");
    expect(materialSummary).toContain("Video izle");
    expect(materialSummary).toContain("Sayfa gir");
    expect(today).toContain("TaskMaterialActions");
  });

  it("opens the existing unified ResourceDetailDrawer on deterministic tabs", () => {
    expect(materialDrawerHook).toContain("<ResourceDetailDrawer");
    expect(materialSummary).toContain('onOpen(task, "video")');
    expect(materialSummary).toContain('onOpen(task, "page")');
    expect(materialDrawerHook).toContain("defaultTaskMaterialTab(task)");
    expect(materialDrawerHook).toContain("taskMaterialResource(task)");
  });

  it("uses existing resource progress read/save flow instead of a new task mutation", () => {
    expect(materialDrawerHook).toContain('`/resources/${resource.resourceId}/progress`');
    expect(materialDrawerHook).not.toContain("/material/apply");
    expect(materialDrawerHook).not.toContain("/material/start");
    expect(materialDrawerHook).not.toContain("resource_unit_progress");
  });

  it("supports focus, active-session and continuation-task entry points", () => {
    expect(today).toContain("const workTask = active ? activeTask : focusTask");
    expect(today).toMatch(/<StudyMaterialWorkspace\b[^>]*\bkey=\{workTask\.id\}\s+task=\{workTask\}/);
    expect(today).toContain("<TaskMaterialActions task={task}");
  });
});
