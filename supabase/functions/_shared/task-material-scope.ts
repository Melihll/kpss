export type TaskMaterialScope =
  | {
      readonly kind: "page_range";
      readonly resourceId: string;
      readonly resourceUnitId: string;
      readonly pageStart: number;
      readonly pageEnd: number;
      readonly completedThroughPage: number | null;
      readonly completed: boolean;
    }
  | {
      readonly kind: "full_video";
      readonly resourceId: string;
      readonly youtubePlaylistVideoId: string;
      readonly title: string;
      readonly position: number;
      readonly durationSeconds: number;
      readonly watchedSeconds: number;
      readonly completed: boolean;
    }
  | {
      readonly kind: "resource";
      readonly resourceId: string;
    };

export interface TaskMaterialScopeEvidence {
  readonly unitProgressById: ReadonlyMap<string, any>;
  readonly videoById: ReadonlyMap<string, any>;
  readonly videoProgressById: ReadonlyMap<string, any>;
}

function firstRelation(value: any): any {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function positiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function nonNegativeInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function pageUnitCandidates(task: any, resourceId: string) {
  return (task?.task_resource_units ?? []).flatMap((link: any) => {
    const unit = firstRelation(link?.resource_units);
    const pageStart = positiveInteger(unit?.page_start);
    const pageEnd = positiveInteger(unit?.page_end);
    if (
      !unit ||
      typeof unit.id !== "string" ||
      String(unit.resource_id) !== resourceId ||
      pageStart === null ||
      pageEnd === null ||
      pageEnd < pageStart
    ) return [];
    return [{ link, unit, pageStart, pageEnd }];
  });
}

function pageScope(
  resourceId: string,
  candidate: ReturnType<typeof pageUnitCandidates>[number],
  pageStart: number,
  pageEnd: number,
  evidence: TaskMaterialScopeEvidence,
): TaskMaterialScope {
  const progress = evidence.unitProgressById.get(String(candidate.unit.id));
  const completedThroughPage = positiveInteger(progress?.completed_through_page);
  return Object.freeze({
    kind: "page_range" as const,
    resourceId,
    resourceUnitId: String(candidate.unit.id),
    pageStart,
    pageEnd,
    completedThroughPage: completedThroughPage === null
      ? null
      : Math.min(candidate.pageEnd, Math.max(candidate.pageStart, completedThroughPage)),
    completed:
      candidate.link?.status === "completed" ||
      progress?.status === "completed",
  });
}

/**
 * Projects persisted task/material evidence into a read-only product contract.
 * Opaque workload identities and display text are deliberately not interpreted.
 */
export function projectTaskMaterialScope(
  task: any,
  resourceId: string | null,
  evidence: TaskMaterialScopeEvidence,
): TaskMaterialScope | null {
  if (!resourceId) return null;

  const boundary = task?.canonical_boundary;
  const candidates = pageUnitCandidates(task, resourceId);

  if (boundary?.kind === "physical_pages") {
    const unitPageStart = positiveInteger(boundary.pageStart);
    const unitPageEnd = positiveInteger(boundary.pageEnd);
    const remainingPageStart = positiveInteger(boundary.remainingPageStart);
    const remainingPageEnd = positiveInteger(boundary.remainingPageEnd);
    const candidate = candidates.find((item) => (
      item.pageStart === unitPageStart && item.pageEnd === unitPageEnd
    ));

    if (
      candidate &&
      unitPageStart !== null &&
      unitPageEnd !== null &&
      remainingPageStart !== null &&
      remainingPageEnd !== null &&
      remainingPageStart >= unitPageStart &&
      remainingPageEnd >= remainingPageStart &&
      remainingPageEnd <= unitPageEnd
    ) {
      return pageScope(
        resourceId,
        candidate,
        remainingPageStart,
        remainingPageEnd,
        evidence,
      );
    }
  }

  if (boundary?.kind === "full_video" && typeof boundary.videoId === "string") {
    const video = evidence.videoById.get(boundary.videoId);
    const durationSeconds = positiveInteger(video?.duration_seconds);
    const boundaryDuration = positiveInteger(boundary.durationSeconds);
    if (video && durationSeconds !== null && durationSeconds === boundaryDuration) {
      const progress = evidence.videoProgressById.get(boundary.videoId);
      const persistedWatched = nonNegativeInteger(boundary.watchedSeconds) ?? 0;
      const currentWatched = nonNegativeInteger(progress?.watched_seconds) ?? persistedWatched;
      const watchedSeconds = Math.min(durationSeconds, currentWatched);
      return Object.freeze({
        kind: "full_video" as const,
        resourceId,
        youtubePlaylistVideoId: boundary.videoId,
        title: typeof video.title === "string" && video.title.trim()
          ? video.title.trim()
          : "Video",
        position: nonNegativeInteger(video.position) ?? 0,
        durationSeconds,
        watchedSeconds,
        completed: progress?.completed_at != null || watchedSeconds >= Math.ceil(durationSeconds * 0.95),
      });
    }
  }

  // A single linked page unit is an authoritative exact scope for legacy/manual
  // tasks. Multiple units deliberately fall back to resource-level presentation.
  if (!boundary && candidates.length === 1) {
    const candidate = candidates[0]!;
    return pageScope(
      resourceId,
      candidate,
      candidate.pageStart,
      candidate.pageEnd,
      evidence,
    );
  }

  return Object.freeze({ kind: "resource" as const, resourceId });
}
