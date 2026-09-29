import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), "utf8");

describe("Evre 7E product-language contract", () => {
  const previewPanel = read("../apps/web/src/components/PlannerV2PreviewPanel.tsx");
  const coachDrawer = read("../apps/web/src/components/CoachDrawer.tsx");
  const coachExplanation = read("../apps/web/src/components/PlannerCoachExplanationCard.tsx");

  it("does not render opaque workload identity, storage values or raw explanation kinds", () => {
    expect(previewPanel).not.toContain("<b>{item.canonicalWorkloadIdentity}</b>");
    expect(previewPanel).not.toContain("{item.materialType}");
    expect(previewPanel).not.toContain("{item.boundary.kind}");
    expect(previewPanel).not.toContain("} · {item.blockedReason}");
    expect(previewPanel).not.toContain("return fact.kind");
    expect(previewPanel).toContain("plannerMaterialLabel(item.materialType)");
    expect(previewPanel).toContain("plannerBlockedReasonLabel(item.blockedReason)");
  });

  it("keeps internal planning vocabulary out of student-facing copy", () => {
    const visibleSurfaces = `${previewPanel}\n${coachDrawer}\n${coachExplanation}`;
    expect(visibleSurfaces).not.toContain("canonical Planner");
    expect(visibleSurfaces).not.toContain("kanonik işler");
    expect(visibleSurfaces).not.toContain("Apply yetkisi");
    expect(visibleSurfaces).not.toContain("tam öneri kimliği");
    expect(visibleSurfaces).not.toContain("Planner kanıtı");
  });
});
