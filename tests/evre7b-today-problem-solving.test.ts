import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const today = readFileSync(
  new URL(
    "../apps/web/src/components/StudyTodayPanel.tsx",
    import.meta.url,
  ),
  "utf8",
);

const coach = readFileSync(
  new URL(
    "../apps/web/src/components/CoachDrawer.tsx",
    import.meta.url,
  ),
  "utf8",
);

describe("Evre 7B Today problem-solving entry contract", () => {
  it("keeps general and capacity entry context distinct in presentation", () => {
    expect(today).toContain(
      'setCoachEntryContext("capacity")',
    );

    expect(today).toContain(
      'setCoachEntryContext("general")',
    );

    expect(today).toContain(
      "entryContext={coachEntryContext}",
    );

    expect(coach).toContain(
      'export type CoachDrawerEntryContext = "general" | "capacity"',
    );

    expect(coach).toContain(
      'entryContext === "capacity"',
    );
  });

  it("keeps both entry contexts on one Reactive Coach authority", () => {
    const reactiveCalls =
      coach.match(/callReactiveCoach\(/g) ?? [];

    expect(reactiveCalls).toHaveLength(1);

    expect(coach).not.toContain(
      "callAiCoachPreview",
    );

    expect(coach).not.toContain(
      "/plans/current/apply-confirmed",
    );

    expect(coach).not.toContain(
      "/planner-v2/confirm",
    );

    expect(coach).not.toContain(
      "/planner-v2/apply",
    );
  });

  it("does not convert presentation context into an authority branch", () => {
    expect(coach).toContain(
      "Presentation-only entry intent",
    );

    expect(coach).not.toContain(
      'if (entryContext === "capacity")',
    );

    expect(coach).not.toContain(
      "switch (entryContext)",
    );
  });

  it("preserves task-specific problem-solving surfaces", () => {
    expect(today).toContain(
      "TaskActionPreviewDrawer",
    );

    expect(today).toContain(
      "QuickAddTaskDrawer",
    );

    expect(today).toContain(
      'previewTaskAction(task, "DEFER")',
    );

    expect(today).toContain(
      'previewTaskAction(task, "REMOVE_TODAY")',
    );
  });
});