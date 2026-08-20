export interface MaterialPageProgressInput {
  readonly currentPage: number;
  readonly totalPages: number;
}

export interface MaterialVideoProgressInput {
  readonly watchedSeconds: number;
  readonly durationSeconds: number;
}

export interface MaterialWorkloadProjectionInput {
  readonly plannedMinutes: number;
  readonly page?: MaterialPageProgressInput | null;
  readonly video?: MaterialVideoProgressInput | null;
}

export interface MaterialPageWorkload {
  readonly currentPage: number;
  readonly totalPages: number;
  readonly remainingPages: number;
  readonly remainingMinutes: number;
}

export interface MaterialVideoWorkload {
  readonly watchedSeconds: number;
  readonly durationSeconds: number;
  readonly remainingSeconds: number;
  readonly remainingMinutes: number;
}

export interface MaterialWorkloadProjection {
  readonly page: MaterialPageWorkload | null;
  readonly video: MaterialVideoWorkload | null;
  readonly totalRemainingMinutes: number;
}

interface ResourceTargetInput {
  readonly resourceId: string;
  readonly plannedMinutes: number;
}

function finiteNonNegative(value: unknown): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0
    ? numberValue
    : 0;
}

function normalizePlannedMinutes(value: unknown): number {
  return Math.max(0, Math.round(finiteNonNegative(value)));
}

export function projectMaterialWorkload(
  input: MaterialWorkloadProjectionInput,
): MaterialWorkloadProjection | null {
  const plannedMinutes = normalizePlannedMinutes(input.plannedMinutes);

  let page: MaterialPageWorkload | null = null;
  if (
    input.page &&
    Number.isFinite(input.page.totalPages) &&
    Number(input.page.totalPages) > 0
  ) {
    const totalPages = Math.max(1, Math.floor(Number(input.page.totalPages)));
    const currentPage = Math.min(
      totalPages,
      Math.max(0, Math.floor(finiteNonNegative(input.page.currentPage))),
    );
    const remainingPages = Math.max(0, totalPages - currentPage);

    /*
     * plannedMinutes is the existing per-resource workload budget.
     * We intentionally do not invent a global "minutes per page" constant.
     * Page workload is calibrated to that resource's own budget.
     */
    const remainingMinutes = remainingPages === 0
      ? 0
      : Math.ceil(plannedMinutes * (remainingPages / totalPages));

    page = Object.freeze({
      currentPage,
      totalPages,
      remainingPages,
      remainingMinutes,
    });
  }

  let video: MaterialVideoWorkload | null = null;
  if (
    input.video &&
    Number.isFinite(input.video.durationSeconds) &&
    Number(input.video.durationSeconds) > 0
  ) {
    const durationSeconds = Math.max(
      1,
      Math.floor(Number(input.video.durationSeconds)),
    );
    const watchedSeconds = Math.min(
      durationSeconds,
      Math.max(
        0,
        Math.floor(finiteNonNegative(input.video.watchedSeconds)),
      ),
    );
    const remainingSeconds = Math.max(0, durationSeconds - watchedSeconds);
    const remainingMinutes = remainingSeconds === 0
      ? 0
      : Math.ceil(remainingSeconds / 60);

    video = Object.freeze({
      watchedSeconds,
      durationSeconds,
      remainingSeconds,
      remainingMinutes,
    });
  }

  if (!page && !video) return null;

  return Object.freeze({
    page,
    video,
    totalRemainingMinutes:
      (page?.remainingMinutes ?? 0) +
      (video?.remainingMinutes ?? 0),
  });
}

function firstRelation(value: any): any {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export async function loadMaterialWorkloads(
  client: any,
  userId: string,
  examProfileId: string,
  targets: readonly ResourceTargetInput[],
): Promise<Record<string, MaterialWorkloadProjection>> {
  const normalizedTargets = targets
    .filter((target) => Boolean(target?.resourceId))
    .map((target) => ({
      resourceId: target.resourceId,
      plannedMinutes: normalizePlannedMinutes(target.plannedMinutes),
    }));

  if (!normalizedTargets.length) return {};

  const resourceIds = [...new Set(
    normalizedTargets.map((target) => target.resourceId),
  )];

  const [pageResult, linkResult] = await Promise.all([
    client
      .from("resource_progress")
      .select("resource_id,current_page,total_pages")
      .eq("user_id", userId)
      .eq("exam_profile_id", examProfileId)
      .in("resource_id", resourceIds),
    client
      .from("topic_resource_links")
      .select("resource_id,youtube_playlist_id")
      .eq("user_id", userId)
      .eq("exam_profile_id", examProfileId)
      .in("resource_id", resourceIds),
  ]);

  if (pageResult.error) throw pageResult.error;
  if (linkResult.error) throw linkResult.error;

  const pageByResource = new Map<
    string,
    MaterialPageProgressInput
  >();

  for (const row of pageResult.data ?? []) {
    pageByResource.set(String(row.resource_id), {
      currentPage: finiteNonNegative(row.current_page),
      totalPages: finiteNonNegative(row.total_pages),
    });
  }

  const playlistToResources = new Map<string, Set<string>>();
  for (const row of linkResult.data ?? []) {
    if (!row.youtube_playlist_id || !row.resource_id) continue;
    const playlistId = String(row.youtube_playlist_id);
    const set = playlistToResources.get(playlistId) ?? new Set<string>();
    set.add(String(row.resource_id));
    playlistToResources.set(playlistId, set);
  }

  const videoByResource = new Map<
    string,
    MaterialVideoProgressInput
  >();

  const playlistIds = [...playlistToResources.keys()];
  if (playlistIds.length) {
    const videosResult = await client
      .from("youtube_playlist_videos")
      .select("id,youtube_playlist_id,duration_seconds")
      .eq("user_id", userId)
      .eq("exam_profile_id", examProfileId)
      .eq("is_active", true)
      .in("youtube_playlist_id", playlistIds);

    if (videosResult.error) throw videosResult.error;

    const videos = videosResult.data ?? [];
    const videoIds = videos
      .map((row: any) => row.id)
      .filter(Boolean);

    let progressRows: any[] = [];
    if (videoIds.length) {
      const progressResult = await client
        .from("youtube_video_progress")
        .select("youtube_playlist_video_id,watched_seconds,completed_at")
        .eq("user_id", userId)
        .eq("exam_profile_id", examProfileId)
        .in("youtube_playlist_video_id", videoIds);

      if (progressResult.error) throw progressResult.error;
      progressRows = progressResult.data ?? [];
    }

    const progressByVideo = new Map(
      progressRows.map((row: any) => [
        String(row.youtube_playlist_video_id),
        row,
      ]),
    );

    for (const videoRow of videos) {
      const resourceSet = playlistToResources.get(
        String(videoRow.youtube_playlist_id),
      );
      if (!resourceSet?.size) continue;

      const durationSeconds = Math.max(
        0,
        Math.floor(finiteNonNegative(videoRow.duration_seconds)),
      );

      const progress = firstRelation(
        progressByVideo.get(String(videoRow.id)),
      );

      const watchedSeconds = progress?.completed_at
        ? durationSeconds
        : Math.min(
            durationSeconds,
            Math.max(
              0,
              Math.floor(
                finiteNonNegative(progress?.watched_seconds),
              ),
            ),
          );

      for (const resourceId of resourceSet) {
        const current = videoByResource.get(resourceId) ?? {
          watchedSeconds: 0,
          durationSeconds: 0,
        };

        videoByResource.set(resourceId, {
          watchedSeconds: current.watchedSeconds + watchedSeconds,
          durationSeconds: current.durationSeconds + durationSeconds,
        });
      }
    }
  }

  const result: Record<string, MaterialWorkloadProjection> = {};

  for (const target of normalizedTargets) {
    const projection = projectMaterialWorkload({
      plannedMinutes: target.plannedMinutes,
      page: pageByResource.get(target.resourceId) ?? null,
      video: videoByResource.get(target.resourceId) ?? null,
    });

    if (projection) result[target.resourceId] = projection;
  }

  return result;
}