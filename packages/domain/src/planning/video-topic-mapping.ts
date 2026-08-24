export type VideoTopicMappingStatus = "validated" | "ambiguous" | "missing";

export type VideoTopicMappingProvenance =
  | "reviewed_mapping"
  | "trusted_import"
  | "corrected"
  | "ai_candidate";

export interface VideoTopicMappingInput {
  mappingId: string;
  playlistVideoId: string;
  curriculumNodeId: string;
  videoDurationSeconds: number;
  segmentStartSeconds: number | null;
  segmentEndSeconds: number | null;
  mappingStatus: VideoTopicMappingStatus;
  provenance: VideoTopicMappingProvenance;
  isActive: boolean;
}

export interface VideoTopicMappingValidation {
  mappingId: string;
  structurallyValid: boolean;
  plannerEligible: boolean;
  effectiveStartSeconds: number;
  effectiveEndSeconds: number;
  errors: string[];
}

function hasAuthoritativeProvenance(
  provenance: VideoTopicMappingProvenance,
): boolean {
  return (
    provenance === "reviewed_mapping" ||
    provenance === "trusted_import" ||
    provenance === "corrected"
  );
}

export function validateVideoTopicMapping(
  input: VideoTopicMappingInput,
): VideoTopicMappingValidation {
  const errors: string[] = [];

  if (input.videoDurationSeconds <= 0) {
    errors.push("invalid_video_duration");
  }

  const start = input.segmentStartSeconds ?? 0;
  const end = input.segmentEndSeconds ?? input.videoDurationSeconds;

  if (start < 0 || end < 0 || end <= start) {
    errors.push("invalid_segment_bounds");
  }

  if (
    start > input.videoDurationSeconds ||
    end > input.videoDurationSeconds
  ) {
    errors.push("segment_outside_video_duration");
  }

  const structurallyValid = errors.length === 0;

  const plannerEligible =
    structurallyValid &&
    input.isActive &&
    input.mappingStatus === "validated" &&
    hasAuthoritativeProvenance(input.provenance);

  return {
    mappingId: input.mappingId,
    structurallyValid,
    plannerEligible,
    effectiveStartSeconds: start,
    effectiveEndSeconds: end,
    errors,
  };
}
