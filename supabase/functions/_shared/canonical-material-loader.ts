import {
  adaptPhysicalMaterialRow,
  adaptYoutubeMaterialRows,
} from "./planning.bundle.js";

function uniqueStrings(values: unknown[]): string[] {
  return [...new Set(
    values
      .filter(Boolean)
      .map((value) => String(value)),
  )];
}

export async function loadCanonicalMaterialUnits(
  client: any,
  userId: string,
  examProfileId: string,
  requestedResourceIds: readonly string[],
) {
  const resourceIds = uniqueStrings([...requestedResourceIds]);
  if (!resourceIds.length) return [];

  const [resourceResult, unitResult, linkResult] = await Promise.all([
    client
      .from("resources")
      .select("id,subject_id,status")
      .eq("user_id", userId)
      .eq("exam_profile_id", examProfileId)
      .in("id", resourceIds),
    client
      .from("resource_units")
      .select("id,resource_id,resource_section_id,unit_type,name,sort_order,page_start,page_end,estimated_minutes,is_active")
      .in("resource_id", resourceIds),
    client
      .from("topic_resource_links")
      .select("resource_id,youtube_playlist_id")
      .eq("user_id", userId)
      .eq("exam_profile_id", examProfileId)
      .in("resource_id", resourceIds),
  ]);

  if (resourceResult.error) throw resourceResult.error;
  if (unitResult.error) throw unitResult.error;
  if (linkResult.error) throw linkResult.error;

  const resources = (resourceResult.data ?? [])
    .filter((row: any) => row.status === "active");

  const resourceById = new Map(
    resources.map((row: any) => [String(row.id), row]),
  );

  const activeResourceIds = [...resourceById.keys()];
  if (!activeResourceIds.length) return [];

  const physicalRows = (unitResult.data ?? []).filter(
    (row: any) => resourceById.has(String(row.resource_id)),
  );

  const sectionIds = uniqueStrings(
    physicalRows.map((row: any) => row.resource_section_id),
  );
  const unitIds = uniqueStrings(
    physicalRows.map((row: any) => row.id),
  );

  let sectionRows: any[] = [];
  if (sectionIds.length) {
    const result = await client
      .from("resource_sections")
      .select("id,resource_id,curriculum_node_id,is_active")
      .in("id", sectionIds);
    if (result.error) throw result.error;
    sectionRows = result.data ?? [];
  }

  let physicalProgressRows: any[] = [];
  if (unitIds.length) {
    const result = await client
      .from("resource_unit_progress")
      .select("resource_unit_id,status,completed_at,completed_through_page")
      .eq("user_id", userId)
      .in("resource_unit_id", unitIds);
    if (result.error) throw result.error;
    physicalProgressRows = result.data ?? [];
  }

  const sectionById = new Map(
    sectionRows.map((row: any) => [String(row.id), row]),
  );
  const physicalProgressByUnit = new Map(
    physicalProgressRows.map((row: any) => [
      String(row.resource_unit_id),
      row,
    ]),
  );

  const units = physicalRows.map((row: any) =>
    adaptPhysicalMaterialRow({
      unit: row,
      section: row.resource_section_id
        ? sectionById.get(String(row.resource_section_id)) ?? null
        : null,
      progress: physicalProgressByUnit.get(String(row.id)) ?? null,
      mappingProvenance: "reviewed_catalog",
    }),
  );

  const playlistToResources = new Map<string, Set<string>>();
  for (const row of linkResult.data ?? []) {
    if (!row.youtube_playlist_id || !row.resource_id) continue;
    const resourceId = String(row.resource_id);
    if (!resourceById.has(resourceId)) continue;
    const playlistId = String(row.youtube_playlist_id);
    const set = playlistToResources.get(playlistId) ?? new Set<string>();
    set.add(resourceId);
    playlistToResources.set(playlistId, set);
  }

  const playlistIds = [...playlistToResources.keys()];
  if (!playlistIds.length) return units;

  const videoResult = await client
    .from("youtube_playlist_videos")
    .select("id,youtube_playlist_id,title,position,duration_seconds,is_active")
    .eq("user_id", userId)
    .eq("exam_profile_id", examProfileId)
    .eq("is_active", true)
    .in("youtube_playlist_id", playlistIds);

  if (videoResult.error) throw videoResult.error;

  const videos = videoResult.data ?? [];
  const videoIds = uniqueStrings(videos.map((row: any) => row.id));
  if (!videoIds.length) return units;

  const [videoProgressResult, mappingResult] = await Promise.all([
    client
      .from("youtube_video_progress")
      .select("youtube_playlist_video_id,last_position_seconds,watched_seconds,completed_at")
      .eq("user_id", userId)
      .eq("exam_profile_id", examProfileId)
      .in("youtube_playlist_video_id", videoIds),
    client
      .from("youtube_video_topic_links")
      .select("id,youtube_playlist_video_id,curriculum_node_id,mapping_status,mapping_provenance,segment_start_seconds,segment_end_seconds,is_active")
      .eq("user_id", userId)
      .eq("exam_profile_id", examProfileId)
      .eq("is_active", true)
      .in("youtube_playlist_video_id", videoIds),
  ]);

  if (videoProgressResult.error) throw videoProgressResult.error;
  if (mappingResult.error) throw mappingResult.error;

  const mappingRows = mappingResult.data ?? [];
  const curriculumNodeIds = uniqueStrings(
    mappingRows.map((row: any) => row.curriculum_node_id),
  );

  let curriculumRows: any[] = [];
  if (curriculumNodeIds.length) {
    const result = await client
      .from("curriculum_nodes")
      .select("id,subject_id,is_active")
      .in("id", curriculumNodeIds);
    if (result.error) throw result.error;
    curriculumRows = result.data ?? [];
  }

  const curriculumById = new Map(
    curriculumRows.map((row: any) => [String(row.id), row]),
  );
  const progressByVideo = new Map(
    (videoProgressResult.data ?? []).map((row: any) => [
      String(row.youtube_playlist_video_id),
      row,
    ]),
  );

  const mappingsByVideo = new Map<string, any[]>();
  for (const row of mappingRows) {
    const videoId = String(row.youtube_playlist_video_id);
    const list = mappingsByVideo.get(videoId) ?? [];
    list.push(row);
    mappingsByVideo.set(videoId, list);
  }

  for (const video of videos) {
    const resourceSet = playlistToResources.get(
      String(video.youtube_playlist_id),
    );
    if (!resourceSet?.size) continue;

    const rawMappings = mappingsByVideo.get(String(video.id)) ?? [];

    for (const resourceId of resourceSet) {
      const resource = resourceById.get(resourceId);
      if (!resource) continue;

      const safeMappings = rawMappings.map((mapping: any) => {
        const node = curriculumById.get(
          String(mapping.curriculum_node_id),
        );
        const subjectMatches =
          node?.is_active === true &&
          String(node.subject_id) === String(resource.subject_id);

        return subjectMatches
          ? mapping
          : { ...mapping, mapping_status: "ambiguous" };
      });

      units.push(...adaptYoutubeMaterialRows({
        video,
        progress: progressByVideo.get(String(video.id)) ?? null,
        resourceId,
        mappings: safeMappings,
      }));
    }
  }

  return units.sort((a: any, b: any) => {
    if (a.resourceId !== b.resourceId) {
      return a.resourceId.localeCompare(b.resourceId);
    }
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }
    return a.id.localeCompare(b.id);
  });
}
