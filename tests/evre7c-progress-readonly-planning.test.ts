import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const adaptiveSource = readFileSync(
  "apps/web/src/components/AdaptivePlanningPanel.tsx",
  "utf8",
);

const progressSource = readFileSync(
  "apps/web/src/pages/ProgressPage.tsx",
  "utf8",
);

const todaySource = readFileSync(
  "apps/web/src/components/StudyTodayPanel.tsx",
  "utf8",
);

const plannerSource = readFileSync(
  "apps/web/src/components/PlannerV2PreviewPanel.tsx",
  "utf8",
);

describe("Evre 7C Progress planning authority", () => {
  it("keeps Progress planning analysis read-only", () => {
    expect(adaptiveSource).toContain('"/progress/projection"');
    expect(adaptiveSource).toContain('"/backlog/current"');
    expect(adaptiveSource).toContain('"/plans/risks"');
    expect(adaptiveSource).toContain('"/plans/minimum-day"');

    expect(adaptiveSource).toContain("Sınava yetişme durumu");
    expect(adaptiveSource).toContain("Mevcut tempon");
    expect(adaptiveSource).toContain("Kalan iş yükü");
    expect(adaptiveSource).toContain("Minimum çalışma hedefi");
  });

  it("removes the legacy user-facing capacity mutation lifecycle from Progress", () => {
    expect(adaptiveSource).not.toContain('"/schedule-exceptions"');
    expect(adaptiveSource).not.toContain('"/plans/current/recalculate"');

    expect(adaptiveSource).not.toContain("async function replan");
    expect(adaptiveSource).not.toContain("async function special");
    expect(adaptiveSource).not.toContain("projection-capacity-form");

    expect(adaptiveSource).not.toContain("Kaydet ve Güncelle");
    expect(adaptiveSource).not.toContain("Planı yeniden hesapla");

    expect(adaptiveSource).toContain(
      "Vaktin değiştiyse Bugün ekranındaki “Vaktim Değişti” ile Koç üzerinden Planner önizlemesine geç.",
    );
  });

  it("keeps the Progress analysis surface mounted", () => {
    expect(progressSource).toContain(
      'import { AdaptivePlanningPanel } from "../components/AdaptivePlanningPanel"',
    );

    expect(progressSource).toContain(
      "<AdaptivePlanningPanel />",
    );
  });

  it("keeps capacity-change UX on Today -> Coach -> canonical Planner Preview", () => {
    expect(todaySource).toContain(
      "Vaktim Değişti",
    );

    expect(todaySource).toContain(
      'onCoach("capacity")',
    );

    expect(plannerSource).toContain(
      'callAppApi<PreviewResponse>("/planner-v2/preview"',
    );
  });
});
