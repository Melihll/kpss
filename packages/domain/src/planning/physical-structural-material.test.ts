import { describe, expect, it } from "vitest";
import {
  adaptPhysicalMaterialRow,
  adaptPhysicalStructuralSpan,
} from "./material-db-adapter";
import { derivePhysicalStructuralCoverage } from "./physical-structural-coverage";

describe("physical structural material projection", () => {
  it("projects an exact structural gap without granting planner authority", () => {
    const coverage = derivePhysicalStructuralCoverage(
      [
        {
          sectionId: "s1",
          resourceId: "r1",
          curriculumNodeId: "topic-1",
          pageStart: 10,
          pageEnd: 20,
          isActive: true,
        },
      ],
      [],
    );

    const span = coverage.spans[0];
    expect(span).toBeDefined();
    if (!span) throw new Error("Expected structural span");

    const view = adaptPhysicalStructuralSpan({
      span,
      section: {
        id: "s1",
        resource_id: "r1",
        curriculum_node_id: "topic-1",
        name: "Bölme ve Bölünebilme",
        sort_order: 2,
        page_start: 10,
        page_end: 20,
        source_unit_type: "konu",
        is_active: true,
      },
    });

    expect(view.sourceKind).toBe("physical");
    expect(view.pageStart).toBe(10);
    expect(view.pageEnd).toBe(20);
    expect(view.estimatedMinutes).toBeNull();
    expect(view.mappingStatus).toBe("validated");
    expect(view.mappingProvenance).toBe("reviewed_catalog");
    expect(view.plannerEligible).toBe(false);
  });

  it("keeps question-bank structural spans typed as tests but blocked", () => {
    const coverage = derivePhysicalStructuralCoverage(
      [
        {
          sectionId: "s1",
          resourceId: "r1",
          curriculumNodeId: "topic-1",
          pageStart: 1,
          pageEnd: 8,
          isActive: true,
        },
      ],
      [],
    );

    const span = coverage.spans[0];
    expect(span).toBeDefined();
    if (!span) throw new Error("Expected structural span");

    const view = adaptPhysicalStructuralSpan({
      span,
      section: {
        id: "s1",
        resource_id: "r1",
        curriculum_node_id: "topic-1",
        name: "Soru Bankası",
        sort_order: 1,
        page_start: 1,
        page_end: 8,
        source_unit_type: "soru_bankası_bloğu",
        is_active: true,
      },
    });

    expect(view.unitType).toBe("test");
    expect(view.plannerEligible).toBe(false);
    expect(view.estimatedMinutes).toBeNull();
  });

  it("does not globally block ordinary persisted physical units with unknown duration", () => {
    const view = adaptPhysicalMaterialRow({
      unit: {
        id: "u1",
        resource_id: "r1",
        resource_section_id: "s1",
        unit_type: "chapter",
        name: "Persisted unit",
        sort_order: 1,
        page_start: 1,
        page_end: 5,
        estimated_minutes: null,
        is_active: true,
      },
      section: {
        id: "s1",
        resource_id: "r1",
        curriculum_node_id: "topic-1",
        is_active: true,
      },
      progress: null,
      mappingProvenance: "reviewed_catalog",
    });

    expect(view.mappingStatus).toBe("validated");
    expect(view.estimatedMinutes).toBeNull();
    expect(view.plannerEligible).toBe(true);
  });
});
