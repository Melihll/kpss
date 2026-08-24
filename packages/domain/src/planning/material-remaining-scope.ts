import type { MaterialUnitView } from "./material-unit-view";

export interface RemainingMaterialScopeRequest {
  units: MaterialUnitView[];
  resourceId: string;
  curriculumNodeId: string;
}

export interface RemainingMaterialUnit extends MaterialUnitView {
  remainingSeconds: number | null;
  remainingPageStart: number | null;
  remainingPageEnd: number | null;
}

function isEffectivelyCompleted(unit: MaterialUnitView): boolean {
  if (unit.progressState === "completed") return true;

  if (
    unit.unitType === "page_range" &&
    unit.pageEnd != null &&
    unit.completedThroughPage != null &&
    unit.completedThroughPage >= unit.pageEnd
  ) {
    return true;
  }

  return false;
}

function remainingSeconds(unit: MaterialUnitView): number | null {
  if (unit.sourceKind !== "youtube") return null;
  if (unit.durationSeconds == null) return null;

  return Math.max(
    0,
    unit.durationSeconds - (unit.watchedSeconds ?? 0),
  );
}

function remainingPageStart(unit: MaterialUnitView): number | null {
  if (unit.unitType !== "page_range") return null;
  if (unit.pageStart == null || unit.pageEnd == null) return null;

  if (unit.completedThroughPage == null) return unit.pageStart;

  return Math.min(
    unit.pageEnd,
    Math.max(unit.pageStart, unit.completedThroughPage + 1),
  );
}

export function calculateRemainingMaterialScope(
  request: RemainingMaterialScopeRequest,
): RemainingMaterialUnit[] {
  return request.units
    .filter((unit) => unit.resourceId === request.resourceId)
    .filter((unit) => unit.curriculumNodeId === request.curriculumNodeId)
    .filter((unit) => unit.isActive)
    .filter((unit) => unit.plannerEligible)
    .filter((unit) => unit.progressState !== "skipped")
    .filter((unit) => !isEffectivelyCompleted(unit))
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.id.localeCompare(b.id);
    })
    .map((unit) => ({
      ...unit,
      remainingSeconds: remainingSeconds(unit),
      remainingPageStart: remainingPageStart(unit),
      remainingPageEnd:
        unit.unitType === "page_range"
          ? unit.pageEnd
          : null,
    }));
}
