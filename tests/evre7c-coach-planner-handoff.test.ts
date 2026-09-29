import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const panelSource = readFileSync(
  "apps/web/src/components/PlannerV2PreviewPanel.tsx",
  "utf8",
);

const cardSource = readFileSync(
  "apps/web/src/components/PlannerCoachExplanationCard.tsx",
  "utf8",
);

describe("Evre 7C Coach -> Planner handoff", () => {
  it("makes the Coach handoff explicit without auto-running Preview", () => {
    expect(panelSource).toContain(
      'window.location.hash === "#planner-v2-preview"',
    );

    expect(panelSource).toContain(
      "Presentation-only handoff context. This must never trigger Preview itself.",
    );

    expect(panelSource).toContain(
      "Koçtan Planner'a geçtin.",
    );

    expect(panelSource).toContain(
      'coachHandoffTarget && !payload',
    );

    expect(panelSource).toContain(
      "henüz yeni bir Planner önerisi oluşturulmadı.",
    );

    expect(panelSource).toContain(
      'coachHandoffTarget && payload',
    );

    expect(panelSource).toContain(
      "Planner'ın güncel canonical önizlemesi oluşturuldu.",
    );

    expect(panelSource).toContain(
      "Aşağıdaki sonuç Koç yorumundan değil, Planner'ın mevcut kanıtlardan yaptığı hesaptan gelir",
    );

    expect(panelSource).toContain(
      "planına uygulanmamıştır.",
    );

    expect(panelSource).toContain(
      'onClick={() => void generate()}',
    );

    const generateInvocations =
      panelSource.match(/void generate\(\)/g) ?? [];

    expect(generateInvocations).toHaveLength(1);
  });

  it("keeps Coach navigation-only and lifecycle-free", () => {
    expect(cardSource).toContain(
      "PLANNER_COACH_PREVIEW_HREF",
    );

    expect(cardSource).toContain(
      "action.autoRunPreview === false",
    );

    expect(cardSource).toContain(
      "action.confirmsProposal === false",
    );

    expect(cardSource).toContain(
      "action.appliesProposal === false",
    );

    expect(cardSource).not.toContain(
      "/planner-v2/preview",
    );

    expect(cardSource).not.toContain(
      "/planner-v2/confirm",
    );

    expect(cardSource).not.toContain(
      "/planner-v2/apply",
    );
  });

  it("keeps the canonical Preview endpoint owned by the Planner panel", () => {
    expect(panelSource).toContain(
      'callAppApi<PreviewResponse>("/planner-v2/preview"',
    );

    expect(panelSource).toContain(
      "async function generate()",
    );

    expect(panelSource).toContain(
      'id="planner-v2-preview"',
    );
  });
});