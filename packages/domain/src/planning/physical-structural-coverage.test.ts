import { describe, expect, it } from "vitest";
import { derivePhysicalStructuralCoverage } from "./physical-structural-coverage";

const section = {
  sectionId: "s1",
  resourceId: "r1",
  curriculumNodeId: "topic-1",
  pageStart: 1,
  pageEnd: 20,
  isActive: true,
};

describe("derivePhysicalStructuralCoverage", () => {
  it("represents a section with no persisted units as one structural gap", () => {
    const result = derivePhysicalStructuralCoverage([section], []);

    expect(result.spans).toEqual([
      expect.objectContaining({
        sectionId: "s1",
        pageStart: 1,
        pageEnd: 20,
        pageCount: 20,
        source: "section_gap",
        plannerEligible: false,
        blockedReason: "duration_unresolved",
      }),
    ]);
    expect(result.anomalies).toEqual([]);
  });

  it("creates only uncovered page spans around persisted execution slices", () => {
    const result = derivePhysicalStructuralCoverage(
      [section],
      [
        {
          unitId: "u1",
          sectionId: "s1",
          pageStart: 1,
          pageEnd: 5,
          isActive: true,
        },
        {
          unitId: "u2",
          sectionId: "s1",
          pageStart: 10,
          pageEnd: 12,
          isActive: true,
        },
      ],
    );

    expect(result.spans.map((span) => [span.pageStart, span.pageEnd])).toEqual([
      [6, 9],
      [13, 20],
    ]);
  });

  it("merges overlapping and touching persisted ranges before finding gaps", () => {
    const result = derivePhysicalStructuralCoverage(
      [section],
      [
        { unitId: "u1", sectionId: "s1", pageStart: 1, pageEnd: 5, isActive: true },
        { unitId: "u2", sectionId: "s1", pageStart: 4, pageEnd: 8, isActive: true },
        { unitId: "u3", sectionId: "s1", pageStart: 9, pageEnd: 12, isActive: true },
      ],
    );

    expect(result.spans.map((span) => [span.pageStart, span.pageEnd])).toEqual([
      [13, 20],
    ]);
  });

  it("produces no structural gap when persisted units cover the entire section", () => {
    const result = derivePhysicalStructuralCoverage(
      [section],
      [
        { unitId: "u1", sectionId: "s1", pageStart: 1, pageEnd: 20, isActive: true },
      ],
    );

    expect(result.spans).toEqual([]);
    expect(result.anomalies).toEqual([]);
  });

  it("keeps unmapped content visible but planner-ineligible", () => {
    const result = derivePhysicalStructuralCoverage(
      [{ ...section, curriculumNodeId: null }],
      [],
    );

    expect(result.spans[0]).toEqual(
      expect.objectContaining({
        blockedReason: "topic_unmapped",
        plannerEligible: false,
      }),
    );
  });

  it("does not invent a range when the section range is missing", () => {
    const result = derivePhysicalStructuralCoverage(
      [{ ...section, pageStart: null, pageEnd: null }],
      [],
    );

    expect(result.spans).toEqual([]);
    expect(result.anomalies).toEqual([
      {
        kind: "section_missing_range",
        sectionId: "s1",
        unitId: null,
      },
    ]);
  });

  it("clips partial overlap safely and records the persisted-unit anomaly", () => {
    const result = derivePhysicalStructuralCoverage(
      [section],
      [
        { unitId: "u1", sectionId: "s1", pageStart: -5, pageEnd: 5, isActive: true },
      ],
    );

    expect(result.spans.map((span) => [span.pageStart, span.pageEnd])).toEqual([
      [6, 20],
    ]);
    expect(result.anomalies).toContainEqual({
      kind: "unit_outside_section",
      sectionId: "s1",
      unitId: "u1",
    });
  });
});
