import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL(
    "../apps/web/src/components/StudyTodayPanel.tsx",
    import.meta.url,
  ),
  "utf8",
);

describe("Evre 7B Today daily-home hierarchy", () => {
  it("keeps the primary focus before proactive coaching", () => {
    const focusIndex =
      source.indexOf('className={`focus-now-card');

    const proactiveIndex =
      source.indexOf("<ProactiveCoachSurface />");

    const remainingIndex =
      source.indexOf('className="today-remaining"');

    expect(focusIndex).toBeGreaterThan(-1);
    expect(proactiveIndex).toBeGreaterThan(-1);
    expect(remainingIndex).toBeGreaterThan(-1);

    expect(focusIndex).toBeLessThan(proactiveIndex);
    expect(proactiveIndex).toBeLessThan(remainingIndex);
  });

  it("preserves the four existing daily-home action surfaces", () => {
    expect(source).toContain("today-quick-add-trigger");
    expect(source).toContain("today-capacity-trigger");
    expect(source).toContain("today-coach-trigger");
    expect(source).toContain("TaskActionPreviewDrawer");
  });

  it("does not add Planner authority to Today", () => {
    expect(source).not.toContain("/planner-v2/confirm");
    expect(source).not.toContain("/planner-v2/apply");
    expect(source).not.toContain("callAiCoachPreview");
  });
});