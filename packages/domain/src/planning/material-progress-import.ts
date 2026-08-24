import type { MaterialUnitView } from "./material-unit-view";

export type MaterialProgressImportConflictReason =
  | "skipped_unit"
  | "inactive_unit"
  | "mapping_not_validated";

export interface MaterialProgressImportConflict {
  unitId: string;
  reason: MaterialProgressImportConflictReason;
}

export interface CompletedUpToHereRequest {
  units: MaterialUnitView[];
  resourceId: string;
  boundaryUnitId: string;
}

export interface CompletedUpToHereProposal {
  boundaryFound: boolean;
  canApplyWithoutReview: boolean;
  proposedUnitIds: string[];
  unchangedCompletedUnitIds: string[];
  conflicts: MaterialProgressImportConflict[];
}

export function proposeCompletedUpToHere(
  request: CompletedUpToHereRequest,
): CompletedUpToHereProposal {
  const ordered = request.units
    .filter((unit) => unit.resourceId === request.resourceId)
    .slice()
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.id.localeCompare(b.id);
    });

  const boundaryIndex = ordered.findIndex(
    (unit) => unit.id === request.boundaryUnitId,
  );

  if (boundaryIndex < 0) {
    return {
      boundaryFound: false,
      canApplyWithoutReview: false,
      proposedUnitIds: [],
      unchangedCompletedUnitIds: [],
      conflicts: [],
    };
  }

  const proposedUnitIds: string[] = [];
  const unchangedCompletedUnitIds: string[] = [];
  const conflicts: MaterialProgressImportConflict[] = [];

  for (const unit of ordered.slice(0, boundaryIndex + 1)) {
    if (unit.progressState === "completed") {
      unchangedCompletedUnitIds.push(unit.id);
      continue;
    }

    if (unit.progressState === "skipped") {
      conflicts.push({ unitId: unit.id, reason: "skipped_unit" });
      continue;
    }

    if (!unit.isActive) {
      conflicts.push({ unitId: unit.id, reason: "inactive_unit" });
      continue;
    }

    if (
      unit.mappingStatus !== "validated" ||
      unit.curriculumNodeId === null
    ) {
      conflicts.push({
        unitId: unit.id,
        reason: "mapping_not_validated",
      });
      continue;
    }

    proposedUnitIds.push(unit.id);
  }

  return {
    boundaryFound: true,
    canApplyWithoutReview: conflicts.length === 0,
    proposedUnitIds,
    unchangedCompletedUnitIds,
    conflicts,
  };
}
