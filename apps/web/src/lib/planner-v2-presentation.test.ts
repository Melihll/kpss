import { describe, expect, it } from "vitest";
import {
  plannerBlockedReasonLabel,
  plannerBoundaryLabel,
  plannerFactLabel,
  plannerMaterialLabel,
} from "./planner-v2-presentation";

describe("Planner V2 product language", () => {
  it("translates persisted material values without exposing storage vocabulary", () => {
    expect(plannerMaterialLabel("page_range")).toBe("Sayfa çalışması");
    expect(plannerMaterialLabel("video")).toBe("Video çalışması");
    expect(plannerMaterialLabel("unexpected_internal_value")).toBe("Çalışma");
    expect(plannerBoundaryLabel("physical_pages")).toBe("Sayfa kapsamı");
    expect(plannerBoundaryLabel("full_video")).toBe("Tam video");
    expect(plannerBoundaryLabel("unexpected_internal_value")).toBe("Materyal kapsamı");
  });

  it("never falls back to a raw planning reason or explanation kind", () => {
    expect(plannerBlockedReasonLabel("private_backend_reason")).toBe("Bu çalışma şu an güvenle planlanamıyor.");
    expect(plannerFactLabel({ kind: "private_backend_fact", secret: "do-not-render" }))
      .toBe("Planlama kararı güncel program ve kapasiteye göre hesaplandı.");
  });

  it("describes continuity without exposing the workload identity", () => {
    expect(plannerFactLabel({
      kind: "continuation_selected",
      canonicalWorkloadIdentity: "physical:internal-id",
    })).toBe("Yarım kalan çalışma devamlılık için öne alındı.");
  });
});
