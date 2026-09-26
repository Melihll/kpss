import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const todaySource = readFileSync(
  new URL("../apps/web/src/components/StudyTodayPanel.tsx", import.meta.url),
  "utf8",
);

const coachSource = readFileSync(
  new URL("../apps/web/src/components/CoachDrawer.tsx", import.meta.url),
  "utf8",
);

describe("Evre 7A Coach web convergence", () => {
  it("routes both Today actions to one Coach surface", () => {
    expect(todaySource).toContain("today-capacity-trigger");
    expect(todaySource).toContain("today-coach-trigger");

    expect(todaySource).toContain(
      'setCoachEntryContext("capacity")',
    );

    expect(todaySource).toContain(
      'setCoachEntryContext("general")',
    );

    expect(todaySource).toContain(
      "entryContext={coachEntryContext}",
    );

    const coachSurfaces =
      todaySource.match(/<CoachDrawer /g) ?? [];

    expect(coachSurfaces).toHaveLength(1);

    expect(todaySource).not.toContain("CoachDrawerMode");
    expect(todaySource).not.toContain("setCoachMode");
    expect(todaySource).not.toContain("mode={coachMode}");
  });

  it("removes legacy capacity mode", () => {
    expect(coachSource).not.toContain('mode === "capacity"');
    expect(coachSource).not.toContain('mode === "default"');
    expect(coachSource).not.toContain("CoachDrawerMode");
    expect(coachSource).not.toContain("CAPACITY_QUICK_PROMPTS");
    expect(coachSource).not.toContain("callAiCoachPreview");
    expect(coachSource).not.toContain("AiCoachPlanPreviewResponse");
    expect(coachSource).not.toContain("presentAiCoachPreview");
  });

  it("removes legacy Coach Apply authority", () => {
    expect(coachSource).not.toContain("/plans/current/apply-confirmed");
    expect(coachSource).not.toContain("applyConfirmed");
    expect(coachSource).not.toContain("AiCoachApplyResponse");
    expect(coachSource).not.toContain("Onayla ve Plana Uygula");
    expect(coachSource).not.toContain("Planın güncellendi");
  });

  it("preserves bounded Reactive Coach and Planner navigation", () => {
    expect(coachSource).toContain("callReactiveCoach");
    expect(coachSource).toContain("buildReactiveConversationContext");
    expect(coachSource).toContain("reactiveHistory");
    expect(coachSource).toContain(".slice(-3)");
    expect(coachSource).toContain("PlannerCoachExplanationCard");
    expect(coachSource).toContain("onOpenPreview={onClose}");
  });
});