export type MaterialSourceKind = "physical" | "youtube";

export type PlannerMaterialProgressState =
  | "not_started"
  | "in_progress"
  | "completed"
  | "skipped";

export type MaterialMappingStatus =
  | "validated"
  | "ambiguous"
  | "missing";

export type MaterialUnitType =
  | "video"
  | "page_range"
  | "test"
  | "question_set"
  | "chapter"
  | "reading"
  | "mock"
  | "other";

export type PhysicalSourceUnitType =
  | "test"
  | "video"
  | "chapter"
  | "reading"
  | "mock"
  | "other";

export interface PhysicalMaterialUnitInput {
  sourceKind: "physical";
  id: string;
  resourceId: string;
  curriculumNodeId: string | null;
  sourceUnitType: PhysicalSourceUnitType;
  title: string;
  sortOrder: number;
  pageStart?: number | null;
  pageEnd?: number | null;
  estimatedMinutes?: number | null;
  progressState: PlannerMaterialProgressState;
  completedThroughPage?: number | null;
  completedAt?: string | null;
  mappingStatus: MaterialMappingStatus;
  mappingProvenance: string;
  isActive: boolean;
}

export interface YoutubeMaterialUnitInput {
  sourceKind: "youtube";
  id: string;
  resourceId: string;
  curriculumNodeId: string | null;
  title: string;
  sortOrder: number;
  durationSeconds: number;
  watchedSeconds: number;
  completedAt: string | null;
  mappingStatus: MaterialMappingStatus;
  mappingProvenance: string;
  isActive: boolean;
}

export type MaterialUnitInput =
  | PhysicalMaterialUnitInput
  | YoutubeMaterialUnitInput;

export interface MaterialUnitView {
  id: string;
  sourceId: string;
  sourceKind: MaterialSourceKind;
  resourceId: string;
  curriculumNodeId: string | null;
  unitType: MaterialUnitType;
  title: string;
  sortOrder: number;
  pageStart: number | null;
  pageEnd: number | null;
  durationSeconds: number | null;
  watchedSeconds: number | null;
  estimatedMinutes: number | null;
  progressState: PlannerMaterialProgressState;
  completedThroughPage?: number | null;
  completedAt: string | null;
  mappingStatus: MaterialMappingStatus;
  mappingProvenance: string;
  isActive: boolean;
  plannerEligible: boolean;
}

function normalizePhysicalUnitType(
  input: PhysicalMaterialUnitInput,
): MaterialUnitType {
  if (input.pageStart != null && input.pageEnd != null) {
    return input.sourceUnitType === "test" ? "test" : "page_range";
  }

  if (input.sourceUnitType === "test") return "test";
  if (input.sourceUnitType === "chapter") return "chapter";
  if (input.sourceUnitType === "reading") return "reading";
  if (input.sourceUnitType === "mock") return "mock";
  if (input.sourceUnitType === "video") return "video";

  return "other";
}

function resolveYoutubeProgress(
  input: YoutubeMaterialUnitInput,
): PlannerMaterialProgressState {
  if (input.completedAt) return "completed";

  if (
    input.durationSeconds > 0 &&
    input.watchedSeconds >= input.durationSeconds
  ) {
    return "completed";
  }

  if (input.watchedSeconds > 0) return "in_progress";

  return "not_started";
}

function isPlannerEligible(
  input: MaterialUnitInput,
): boolean {
  return (
    input.isActive &&
    input.mappingStatus === "validated" &&
    input.curriculumNodeId !== null
  );
}

export function normalizeMaterialUnit(
  input: MaterialUnitInput,
): MaterialUnitView {
  if (input.sourceKind === "youtube") {
    return {
      id: `youtube:${input.id}`,
      sourceId: input.id,
      sourceKind: "youtube",
      resourceId: input.resourceId,
      curriculumNodeId: input.curriculumNodeId,
      unitType: "video",
      title: input.title,
      sortOrder: input.sortOrder,
      pageStart: null,
      pageEnd: null,
      durationSeconds: input.durationSeconds,
      watchedSeconds: input.watchedSeconds,
      estimatedMinutes: null,
      progressState: resolveYoutubeProgress(input),
      completedThroughPage: null,
      completedAt: input.completedAt,
      mappingStatus: input.mappingStatus,
      mappingProvenance: input.mappingProvenance,
      isActive: input.isActive,
      plannerEligible: isPlannerEligible(input),
    };
  }

  return {
    id: `physical:${input.id}`,
    sourceId: input.id,
    sourceKind: "physical",
    resourceId: input.resourceId,
    curriculumNodeId: input.curriculumNodeId,
    unitType: normalizePhysicalUnitType(input),
    title: input.title,
    sortOrder: input.sortOrder,
    pageStart: input.pageStart ?? null,
    pageEnd: input.pageEnd ?? null,
    durationSeconds: null,
    watchedSeconds: null,
    estimatedMinutes: input.estimatedMinutes ?? null,
    progressState: input.progressState,
    completedThroughPage: input.completedThroughPage ?? null,
    completedAt: input.completedAt ?? null,
    mappingStatus: input.mappingStatus,
    mappingProvenance: input.mappingProvenance,
    isActive: input.isActive,
    plannerEligible: isPlannerEligible(input),
  };
}
