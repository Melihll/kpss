export interface TelegramMaterialPageProgress {
  readonly currentPage: number;
  readonly totalPages: number;
}

export interface TelegramMaterialVideoProgress {
  readonly watchedSeconds: number;
  readonly durationSeconds: number;
}

export interface TelegramMaterialProgress {
  readonly page?: TelegramMaterialPageProgress | null;
  readonly video?: TelegramMaterialVideoProgress | null;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function formatTelegramMaterialDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  if (seconds < 60) return `${seconds} sn`;

  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) return minutes > 0 ? `${hours}sa ${minutes}dk` : `${hours}sa`;
  return `${totalMinutes}dk`;
}

export function formatTelegramMaterialSummary(
  progress: TelegramMaterialProgress,
): string | null {
  const parts: string[] = [];

  if (
    progress.page &&
    Number.isFinite(progress.page.totalPages) &&
    progress.page.totalPages > 0
  ) {
    const totalPages = Math.max(1, Math.floor(progress.page.totalPages));
    const currentPage = Math.min(
      totalPages,
      Math.max(0, Math.floor(progress.page.currentPage)),
    );
    const percent = clampPercent((currentPage / totalPages) * 100);
    parts.push(`Sayfa ${currentPage}/${totalPages} (%${percent})`);
  }

  if (
    progress.video &&
    Number.isFinite(progress.video.durationSeconds) &&
    progress.video.durationSeconds > 0
  ) {
    const durationSeconds = Math.max(1, Math.floor(progress.video.durationSeconds));
    const watchedSeconds = Math.min(
      durationSeconds,
      Math.max(0, Math.floor(progress.video.watchedSeconds)),
    );
    const percent = clampPercent((watchedSeconds / durationSeconds) * 100);
    parts.push(
      `Video ${formatTelegramMaterialDuration(watchedSeconds)}/${formatTelegramMaterialDuration(durationSeconds)} (%${percent})`,
    );
  }

  return parts.length ? parts.join(" · ") : null;
}

function firstRelation(value: any): any {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function canonicalResourceId(task: any): string | null {
  if (typeof task?.resource_id === "string" && task.resource_id) {
    return task.resource_id;
  }

  const section = firstRelation(task?.resource_sections);
  if (typeof section?.resource_id === "string" && section.resource_id) {
    return section.resource_id;
  }

  for (const link of task?.task_resource_units ?? []) {
    const unit = firstRelation(link?.resource_units);
    if (typeof unit?.resource_id === "string" && unit.resource_id) {
      return unit.resource_id;
    }
  }

  return null;
}

export async function loadTelegramTaskMaterialSummaries(
  admin: any,
  userId: string,
  examProfileId: string,
  taskIds: readonly string[],
): Promise<Record<string, string>> {
  const uniqueTaskIds = [...new Set(taskIds.filter(Boolean))];
  if (!uniqueTaskIds.length) return {};

  const tasksResult = await admin
    .from("tasks")
    .select("id,resource_id,resource_sections(resource_id),task_resource_units(resource_units(resource_id))")
    .eq("user_id", userId)
    .eq("exam_profile_id", examProfileId)
    .in("id", uniqueTaskIds);
  if (tasksResult.error) throw tasksResult.error;

  const taskToResource = new Map<string, string>();
  for (const task of tasksResult.data ?? []) {
    const resourceId = canonicalResourceId(task);
    if (resourceId) taskToResource.set(task.id, resourceId);
  }

  const resourceIds = [...new Set(taskToResource.values())];
  if (!resourceIds.length) return {};

  const [pageResult, linkResult] = await Promise.all([
    admin
      .from("resource_progress")
      .select("resource_id,current_page,total_pages")
      .eq("user_id", userId)
      .eq("exam_profile_id", examProfileId)
      .in("resource_id", resourceIds),
    admin
      .from("topic_resource_links")
      .select("resource_id,youtube_playlist_id")
      .eq("user_id", userId)
      .eq("exam_profile_id", examProfileId)
      .in("resource_id", resourceIds),
  ]);
  if (pageResult.error) throw pageResult.error;
  if (linkResult.error) throw linkResult.error;

  const pageByResource = new Map<string, TelegramMaterialPageProgress>();
  for (const row of pageResult.data ?? []) {
    pageByResource.set(row.resource_id, {
      currentPage: Number(row.current_page ?? 0),
      totalPages: Number(row.total_pages ?? 0),
    });
  }

  const playlistToResources = new Map<string, Set<string>>();
  for (const row of linkResult.data ?? []) {
    if (!row.youtube_playlist_id) continue;
    const set = playlistToResources.get(row.youtube_playlist_id) ?? new Set<string>();
    set.add(row.resource_id);
    playlistToResources.set(row.youtube_playlist_id, set);
  }

  const playlistIds = [...playlistToResources.keys()];
  const videoAggregateByResource = new Map<
    string,
    { watchedSeconds: number; durationSeconds: number }
  >();

  if (playlistIds.length) {
    const videosResult = await admin
      .from("youtube_playlist_videos")
      .select("id,youtube_playlist_id,duration_seconds")
      .eq("user_id", userId)
      .eq("exam_profile_id", examProfileId)
      .eq("is_active", true)
      .in("youtube_playlist_id", playlistIds);
    if (videosResult.error) throw videosResult.error;

    const videoRows = videosResult.data ?? [];
    const videoIds = videoRows.map((row: any) => row.id);

    let progressRows: any[] = [];
    if (videoIds.length) {
      const progressResult = await admin
        .from("youtube_video_progress")
        .select("youtube_playlist_video_id,watched_seconds")
        .eq("user_id", userId)
        .eq("exam_profile_id", examProfileId)
        .in("youtube_playlist_video_id", videoIds);
      if (progressResult.error) throw progressResult.error;
      progressRows = progressResult.data ?? [];
    }

    const watchedByVideo = new Map(
      progressRows.map((row: any) => [
        row.youtube_playlist_video_id,
        Number(row.watched_seconds ?? 0),
      ]),
    );

    for (const video of videoRows) {
      const resourceSet = playlistToResources.get(video.youtube_playlist_id);
      if (!resourceSet?.size) continue;
      const durationSeconds = Math.max(0, Number(video.duration_seconds ?? 0));
      const watchedSeconds = Math.min(
        durationSeconds,
        Math.max(0, Number(watchedByVideo.get(video.id) ?? 0)),
      );

      for (const resourceId of resourceSet) {
        const current = videoAggregateByResource.get(resourceId) ?? {
          watchedSeconds: 0,
          durationSeconds: 0,
        };
        current.watchedSeconds += watchedSeconds;
        current.durationSeconds += durationSeconds;
        videoAggregateByResource.set(resourceId, current);
      }
    }
  }

  const summaries: Record<string, string> = {};
  for (const [taskId, resourceId] of taskToResource) {
    const summary = formatTelegramMaterialSummary({
      page: pageByResource.get(resourceId) ?? null,
      video: videoAggregateByResource.get(resourceId) ?? null,
    });
    if (summary) summaries[taskId] = summary;
  }

  return summaries;
}