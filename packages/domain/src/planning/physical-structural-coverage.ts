export type PhysicalSectionCoverageInput = {
  readonly sectionId: string;
  readonly resourceId: string;
  readonly curriculumNodeId: string | null;
  readonly pageStart: number | null;
  readonly pageEnd: number | null;
  readonly isActive: boolean;
};

export type PhysicalPersistedUnitCoverageInput = {
  readonly unitId: string;
  readonly sectionId: string | null;
  readonly pageStart: number | null;
  readonly pageEnd: number | null;
  readonly isActive: boolean;
};

export type PhysicalStructuralBlockedReason =
  | "duration_unresolved"
  | "topic_unmapped";

export type PhysicalStructuralSpan = {
  readonly spanId: string;
  readonly sectionId: string;
  readonly resourceId: string;
  readonly curriculumNodeId: string | null;
  readonly pageStart: number;
  readonly pageEnd: number;
  readonly pageCount: number;
  readonly source: "section_gap";
  readonly plannerEligible: false;
  readonly blockedReason: PhysicalStructuralBlockedReason;
};

export type PhysicalCoverageAnomaly = {
  readonly kind:
    | "section_missing_range"
    | "section_invalid_range"
    | "unit_invalid_range"
    | "unit_outside_section";
  readonly sectionId: string;
  readonly unitId: string | null;
};

type Range = {
  start: number;
  end: number;
};

function mergeRanges(ranges: readonly Range[]): Range[] {
  const ordered = [...ranges].sort(
    (left, right) => left.start - right.start || left.end - right.end,
  );

  const merged: Range[] = [];

  for (const range of ordered) {
    const last = merged[merged.length - 1];

    if (!last || range.start > last.end + 1) {
      merged.push({ ...range });
      continue;
    }

    last.end = Math.max(last.end, range.end);
  }

  return merged;
}

export function derivePhysicalStructuralCoverage(
  sections: readonly PhysicalSectionCoverageInput[],
  units: readonly PhysicalPersistedUnitCoverageInput[],
): {
  spans: PhysicalStructuralSpan[];
  anomalies: PhysicalCoverageAnomaly[];
} {
  const spans: PhysicalStructuralSpan[] = [];
  const anomalies: PhysicalCoverageAnomaly[] = [];

  const unitsBySection = new Map<
    string,
    PhysicalPersistedUnitCoverageInput[]
  >();

  for (const unit of units) {
    if (!unit.isActive || !unit.sectionId) continue;

    const current = unitsBySection.get(unit.sectionId) ?? [];
    current.push(unit);
    unitsBySection.set(unit.sectionId, current);
  }

  for (const section of sections) {
    if (!section.isActive) continue;

    if (section.pageStart == null || section.pageEnd == null) {
      anomalies.push({
        kind: "section_missing_range",
        sectionId: section.sectionId,
        unitId: null,
      });
      continue;
    }

    if (section.pageEnd < section.pageStart) {
      anomalies.push({
        kind: "section_invalid_range",
        sectionId: section.sectionId,
        unitId: null,
      });
      continue;
    }

    const coveredRanges: Range[] = [];

    for (const unit of unitsBySection.get(section.sectionId) ?? []) {
      if (unit.pageStart == null || unit.pageEnd == null) {
        anomalies.push({
          kind: "unit_invalid_range",
          sectionId: section.sectionId,
          unitId: unit.unitId,
        });
        continue;
      }

      if (unit.pageEnd < unit.pageStart) {
        anomalies.push({
          kind: "unit_invalid_range",
          sectionId: section.sectionId,
          unitId: unit.unitId,
        });
        continue;
      }

      if (
        unit.pageEnd < section.pageStart ||
        unit.pageStart > section.pageEnd
      ) {
        anomalies.push({
          kind: "unit_outside_section",
          sectionId: section.sectionId,
          unitId: unit.unitId,
        });
        continue;
      }

      if (
        unit.pageStart < section.pageStart ||
        unit.pageEnd > section.pageEnd
      ) {
        anomalies.push({
          kind: "unit_outside_section",
          sectionId: section.sectionId,
          unitId: unit.unitId,
        });
      }

      coveredRanges.push({
        start: Math.max(unit.pageStart, section.pageStart),
        end: Math.min(unit.pageEnd, section.pageEnd),
      });
    }

    const merged = mergeRanges(coveredRanges);
    let cursor = section.pageStart;

    const pushGap = (start: number, end: number) => {
      if (end < start) return;

      spans.push({
        spanId: `physical:section:${section.sectionId}:gap:${start}-${end}`,
        sectionId: section.sectionId,
        resourceId: section.resourceId,
        curriculumNodeId: section.curriculumNodeId,
        pageStart: start,
        pageEnd: end,
        pageCount: end - start + 1,
        source: "section_gap",
        plannerEligible: false,
        blockedReason: section.curriculumNodeId
          ? "duration_unresolved"
          : "topic_unmapped",
      });
    };

    for (const range of merged) {
      if (cursor < range.start) {
        pushGap(cursor, range.start - 1);
      }

      cursor = Math.max(cursor, range.end + 1);
    }

    if (cursor <= section.pageEnd) {
      pushGap(cursor, section.pageEnd);
    }
  }

  return { spans, anomalies };
}
