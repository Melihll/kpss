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
  it("orders daily focus, factual progress, proactive coaching, then remaining work", () => {
    const focusIndex =
      source.indexOf('className={`focus-now-card');

    const progressIndex =
      source.indexOf('className="today-progress-summary"');

    const proactiveIndex =
      source.indexOf("<ProactiveCoachSurface />");

    const remainingIndex =
      source.indexOf('className="today-remaining"');

    expect(focusIndex).toBeGreaterThan(-1);
    expect(progressIndex).toBeGreaterThan(-1);
    expect(proactiveIndex).toBeGreaterThan(-1);
    expect(remainingIndex).toBeGreaterThan(-1);

    expect(focusIndex).toBeLessThan(progressIndex);
    expect(progressIndex).toBeLessThan(proactiveIndex);
    expect(proactiveIndex).toBeLessThan(remainingIndex);
  });

  it("uses existing canonical daily facts without inventing a progress score", () => {
    expect(source).toContain(
      "summary.dailyPlan.totalCommittedMinutes",
    );

    expect(source).toContain(
      "summary.dailyPlan.completedTaskIds.length",
    );

    expect(source).toContain(
      "compactMinutesLabel(summary.todayStudyMinutes)",
    );

    expect(source).toContain(
      "todayTaskCount = dailyTaskIds.size",
    );

    expect(source).not.toContain(
      "todayProgressPercent",
    );

    expect(source).not.toContain(
      "progressScore",
    );
  });

  it("preserves the existing daily-home action surfaces", () => {
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