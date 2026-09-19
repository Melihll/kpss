import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("Evre 6E Planner Preview CTA safety", () => {
  it("navigates to the existing Planner panel without calling lifecycle endpoints", () => {
    const source = fs.readFileSync(
      "apps/web/src/components/PlannerCoachExplanationCard.tsx",
      "utf8",
    );
    expect(source).toContain("PLANNER_COACH_PREVIEW_HREF");
    expect(source).toContain("<Link");
    expect(source).not.toContain("callAppApi");
    expect(source).not.toContain("/planner-v2/preview");
    expect(source).not.toContain("/planner-v2/confirm");
    expect(source).not.toContain("/planner-v2/apply");
  });

  it("keeps the existing panel as the only browser owner of explicit Preview execution", () => {
    const source = fs.readFileSync(
      "apps/web/src/components/PlannerV2PreviewPanel.tsx",
      "utf8",
    );
    expect(source).toContain('id="planner-v2-preview"');
    expect(source).toContain('callAppApi<PreviewResponse>("/planner-v2/preview"');
    expect(source).toContain("onClick={() => void generate()}");
  });
});
