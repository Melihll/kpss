import type { SubjectForecast } from "./roadmap";

export const DISPLAYABLE_RESOURCE_TYPES = [
  "question_bank",
  "video_course",
  "book",
  "notes",
  "mock_book",
  "other",
] as const;

export interface DiscoveredResource {
  resourceId: string;
  subjectId: string;
  resourceName: string;
  publisher: string | null;
  resourceType: string;
  status: string;
}

const displayableTypes = new Set<string>(DISPLAYABLE_RESOURCE_TYPES);

export function mergeDiscoveredResources(
  subjectForecasts: readonly SubjectForecast[],
  discoveredResources: readonly DiscoveredResource[],
): SubjectForecast[] {
  const activeResources = discoveredResources.filter((resource) =>
    resource.status === "active" && displayableTypes.has(resource.resourceType)
  );

  return subjectForecasts.map((subject) => {
    const existingIds = new Set(subject.resources.map((resource) => resource.resourceId));
    const additions = activeResources
      .filter((resource) => resource.subjectId === subject.subjectId && !existingIds.has(resource.resourceId))
      .map((resource) => ({
        resourceId: resource.resourceId,
        resourceName: resource.resourceName,
        plannedMinutes: 0,
        actualMinutes: 0,
        progressPercent: 0,
        remainingMinutes: 0,
        forecastStartDate: null,
        forecastFinishDate: null,
        completed: false,
        publisher: resource.publisher,
        resourceType: resource.resourceType,
      }));

    return additions.length
      ? { ...subject, resources: [...subject.resources, ...additions] }
      : subject;
  });
}
