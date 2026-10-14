// Eligibility for the existing P48 planner; this does not initialize profiles.
export function p48GenerationReadiness(input: {
  targetExamDate: string | null;
  availableMinutes: number;
  selectedSubjectIds: readonly string[];
  resources: readonly { subject_id: string; status: string }[];
}): { ready: boolean; reason: string | null } {
  if (!input.targetExamDate) return { ready: false, reason: "P48_EXAM_DATE_REQUIRED" };
  if (!input.selectedSubjectIds.length) return { ready: false, reason: "P48_SUBJECTS_REQUIRED" };
  if (input.availableMinutes <= 0) return { ready: false, reason: "P48_CAPACITY_SOURCE_MISSING" };
  if (!input.resources.some(resource => resource.status === "active" && input.selectedSubjectIds.includes(resource.subject_id))) {
    return { ready: false, reason: "P48_RESOURCES_REQUIRED" };
  }
  return { ready: true, reason: null };
}
