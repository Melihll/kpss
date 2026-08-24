import {
  normalizeMaterialUnit,
  type MaterialMappingProvenance,
  type MaterialMappingStatus,
  type MaterialUnitView,
  type PlannerMaterialProgressState,
} from "./material-unit-view";

export interface PhysicalResourceUnitRow {
  id: string;
  resource_id: string;
  resource_section_id: string | null;
  unit_type: string;
  name: string;
  sort_order: number;
  page_start: number | null;
  page_end: number | null;
  estimated_minutes: number | null;
  is_active: boolean;
}

export interface PhysicalResourceSectionRow {
  id: string;
  resource_id: string;
  curriculum_node_id: string | null;
  is_active: boolean;
}

export interface PhysicalResourceUnitProgressRow {
  resource_unit_id: string;
  status: string;
  completed_at: string | null;
  completed_through_page?: number | null;
}

export interface YoutubePlaylistVideoRow {
  id: string;
  youtube_playlist_id: string;
  title: string;
  position: number;
  duration_seconds: number;
  is_active: boolean;
}

export interface YoutubeVideoProgressRow {
  youtube_playlist_video_id: string;
  watched_seconds: number;
  last_position_seconds: number;
  completed_at: string | null;
}

export interface YoutubeVideoTopicMappingProjection {
  curriculum_node_id: string;
  mapping_status: MaterialMappingStatus;
  mapping_provenance: MaterialMappingProvenance;
  is_active: boolean;
}

function normalizeProgressStatus(
  status: string | null | undefined,
): PlannerMaterialProgressState {
  if (status === "in_progress") return "in_progress";
  if (status === "completed") return "completed";
  if (status === "skipped") return "skipped";
  return "not_started";
}

function normalizePhysicalUnitType(
  unitType: string,
): "test" | "video" | "chapter" | "reading" | "mock" | "other" {
  if (unitType === "test") return "test";
  if (unitType === "video") return "video";
  if (unitType === "chapter") return "chapter";
  if (unitType === "reading") return "reading";
  if (unitType === "mock") return "mock";
  return "other";
}

export function adaptPhysicalMaterialRow(request: {
  unit: PhysicalResourceUnitRow;
  section: PhysicalResourceSectionRow | null;
  progress: PhysicalResourceUnitProgressRow | null;
  mappingProvenance: MaterialMappingProvenance;
}): MaterialUnitView {
  const sectionMatchesResource =
    request.section !== null &&
    request.section.resource_id === request.unit.resource_id;

  const curriculumNodeId =
    sectionMatchesResource
      ? request.section?.curriculum_node_id ?? null
      : null;

  const mappingStatus: MaterialMappingStatus =
    curriculumNodeId !== null ? "validated" : "missing";

  const sectionActive = request.section?.is_active ?? true;

  return normalizeMaterialUnit({
    sourceKind: "physical",
    id: request.unit.id,
    resourceId: request.unit.resource_id,
    curriculumNodeId,
    sourceUnitType: normalizePhysicalUnitType(request.unit.unit_type),
    title: request.unit.name,
    sortOrder: request.unit.sort_order,
    pageStart: request.unit.page_start,
    pageEnd: request.unit.page_end,
    estimatedMinutes: request.unit.estimated_minutes,
    progressState: normalizeProgressStatus(request.progress?.status),
    completedThroughPage:
      request.progress?.completed_through_page ?? null,
    completedAt: request.progress?.completed_at ?? null,
    mappingStatus,
    mappingProvenance: request.mappingProvenance,
    isActive: request.unit.is_active && sectionActive,
  });
}

export function adaptYoutubeMaterialRow(request: {
  video: YoutubePlaylistVideoRow;
  progress: YoutubeVideoProgressRow | null;
  resourceId: string;
  mapping: YoutubeVideoTopicMappingProjection | null;
}): MaterialUnitView {
  const mappingStatus: MaterialMappingStatus =
    request.mapping?.mapping_status ?? "missing";

  const mappingProvenance: MaterialMappingProvenance =
    request.mapping?.mapping_provenance ?? "ai_candidate";

  return normalizeMaterialUnit({
    sourceKind: "youtube",
    id: request.video.id,
    resourceId: request.resourceId,
    curriculumNodeId: request.mapping?.curriculum_node_id ?? null,
    title: request.video.title,
    sortOrder: request.video.position,
    durationSeconds: request.video.duration_seconds,
    watchedSeconds: request.progress?.watched_seconds ?? 0,
    completedAt: request.progress?.completed_at ?? null,
    mappingStatus,
    mappingProvenance,
    isActive:
      request.video.is_active &&
      (request.mapping?.is_active ?? true),
  });
}
