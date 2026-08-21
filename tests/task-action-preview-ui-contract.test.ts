import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("P1-06B Today task action UI safety contract", () => {
  const today = readFileSync(
    new URL("../apps/web/src/components/StudyTodayPanel.tsx", import.meta.url),
    "utf8",
  );
  const drawer = readFileSync(
    new URL("../apps/web/src/components/TaskActionPreviewDrawer.tsx", import.meta.url),
    "utf8",
  );

  it("renders the three required task actions from the Today card menu", () => {
    expect(today).toContain("task-action-menu-trigger");
    expect(today).toContain('previewTaskAction(task, "DEFER")');
    expect(today).toContain('previewTaskAction(task, "REMOVE_TODAY")');
    expect(today).toContain('previewTaskAction(task, "DURATION_DETAILS")');
    expect(today).toContain("Ertelemeyi önizle");
    expect(today).toContain("Çıkarmayı önizle");
    expect(today).toContain("Süre detayları");
  });

  it("calls only the preview endpoint and exposes no apply/create mutation", () => {
    expect(drawer).toContain("action-preview");
    expect(drawer).toContain("Yalnızca önizleme");
    expect(drawer).not.toContain("action-apply");
    expect(drawer).not.toContain("action-create");
    expect(drawer).not.toContain("daily-order");
    expect(drawer).not.toContain("weekly-plan/manual");
    expect(drawer).not.toContain("plans/current/recalculate");
  });

  it("does not silently recalculate the plan while Today loads", () => {
    const loadStart = today.indexOf("const load = useCallback");
    const loadEnd = today.indexOf("useEffect(() => { void load();", loadStart);
    expect(loadStart).toBeGreaterThan(-1);
    expect(loadEnd).toBeGreaterThan(loadStart);
    expect(today.slice(loadStart, loadEnd)).not.toContain("plans/current/recalculate");
  });
});
