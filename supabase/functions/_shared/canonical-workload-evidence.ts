import type {
  MaterialUnitType,
  WorkloadEvidence,
  WorkloadEvidenceQuality,
} from "./planning.bundle.js";

type EvidenceRows = {
  readonly resources: readonly any[];
  readonly units: readonly any[];
  readonly studySessions: readonly any[];
  readonly testResults: readonly any[];
  readonly resourceProgress: readonly any[];
  readonly tasks: readonly any[];
  readonly taskResourceUnits: readonly any[];
  readonly youtubeProgress: readonly any[];
  readonly physicalPaceEvidence?: readonly any[];
};

function uniqueStrings(values: readonly unknown[]): string[] {
  return [...new Set(values.filter(Boolean).map(String))];
}

function positiveNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function sameInstant(left: unknown, right: unknown): boolean {
  if (!left || !right) return false;
  const leftTime = new Date(String(left)).getTime();
  const rightTime = new Date(String(right)).getTime();
  return Number.isFinite(leftTime) && leftTime === rightTime;
}

function sampleStart(end: unknown, minutes: number | null): string | null {
  if (!end || minutes === null) return null;
  const endTime = new Date(String(end)).getTime();
  return Number.isFinite(endTime)
    ? new Date(endTime - (minutes * 60_000)).toISOString()
    : null;
}

function materialType(unit: any): MaterialUnitType {
  if (unit?.unit_type === "test") return "test";
  if (unit?.page_start != null && unit?.page_end != null) return "page_range";
  if (unit?.unit_type === "video") return "video";
  if (unit?.unit_type === "chapter") return "chapter";
  if (unit?.unit_type === "reading") return "reading";
  if (unit?.unit_type === "mock") return "mock";
  return "other";
}

function validPageRange(unit: any): { start: number; end: number; count: number } | null {
  const start = Number(unit?.page_start);
  const end = Number(unit?.page_end);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start <= 0 || end < start) {
    return null;
  }
  return { start, end, count: end - start + 1 };
}

function qualities(...values: WorkloadEvidenceQuality[]): readonly WorkloadEvidenceQuality[] {
  return Object.freeze(values);
}

export function deriveCanonicalWorkloadEvidence(
  userId: string,
  examProfileId: string,
  rows: EvidenceRows,
): readonly WorkloadEvidence[] {
  const resourceById = new Map(rows.resources.map((row) => [String(row.id), row]));
  const unitById = new Map(rows.units.map((row) => [String(row.id), row]));
  const progressByUnit = new Map(
    rows.resourceProgress.map((row) => [String(row.resource_unit_id), row]),
  );
  const result: WorkloadEvidence[] = [];

  for (const row of rows.studySessions) {
    const actualMinutes = row.status === "completed"
      ? positiveNumber(row.duration_minutes)
      : null;
    const unit = row.resource_unit_id
      ? unitById.get(String(row.resource_unit_id))
      : null;
    result.push(Object.freeze({
      id: `study_session:${row.id}`,
      userId,
      examProfileId,
      sourceKind: "study_session" as const,
      resourceId: row.resource_id ? String(row.resource_id) : null,
      subjectId: row.subject_id ? String(row.subject_id) : null,
      curriculumNodeId: row.curriculum_node_id ? String(row.curriculum_node_id) : null,
      materialType: materialType(unit),
      actualMinutes,
      progressAmount: null,
      progressUnit: "page" as const,
      sampleStart: row.started_at ? String(row.started_at) : null,
      sampleEnd: row.ended_at ? String(row.ended_at) : null,
      evidenceQuality: actualMinutes === null
        ? qualities("unavailable")
        : qualities("actual_elapsed_time", "unavailable"),
      provenance: `study_sessions:${row.entry_source ?? "unknown"}:progress_delta_unavailable`,
    }));
  }

  for (const row of rows.testResults) {
    const actualMinutes = positiveNumber(row.duration_minutes);
    const unit = row.resource_unit_id
      ? unitById.get(String(row.resource_unit_id))
      : null;
    const progress = row.resource_unit_id
      ? progressByUnit.get(String(row.resource_unit_id))
      : null;
    const range = validPageRange(unit);
    const firstCompletion =
      unit?.unit_type === "test" &&
      progress?.status === "completed" &&
      sameInstant(row.completed_at, progress.completed_at);
    const authoritativePair = actualMinutes !== null && range !== null && firstCompletion;

    result.push(Object.freeze({
      id: `test_result:${row.id}`,
      userId,
      examProfileId,
      sourceKind: "test_result_completion" as const,
      resourceId: row.resource_id ? String(row.resource_id) : null,
      subjectId: row.subject_id ? String(row.subject_id) : null,
      curriculumNodeId: row.curriculum_node_id ? String(row.curriculum_node_id) : null,
      materialType: materialType(unit),
      actualMinutes,
      progressAmount: authoritativePair ? range.count : null,
      progressUnit: "page" as const,
      sampleStart: sampleStart(row.completed_at, actualMinutes),
      sampleEnd: row.completed_at ? String(row.completed_at) : null,
      evidenceQuality: authoritativePair
        ? qualities("actual_elapsed_time", "actual_progress_delta")
        : actualMinutes !== null
          ? qualities("actual_elapsed_time", "unreliable")
          : qualities("unavailable"),
      provenance: authoritativePair
        ? "record_test_result:first_completion"
        : "test_results:progress_delta_unreliable",
    }));
  }

  for (const row of rows.resourceProgress) {
    const unit = unitById.get(String(row.resource_unit_id));
    const range = validPageRange(unit);
    let progressAmount: number | null = null;
    let reliable = false;
    if (range && row.status === "completed") {
      progressAmount = range.count;
      reliable = true;
    } else if (range && row.status === "in_progress") {
      const through = Number(row.completed_through_page);
      if (Number.isInteger(through) && through >= range.start && through < range.end) {
        progressAmount = through - range.start + 1;
        reliable = true;
      }
    }
    const resource = unit ? resourceById.get(String(unit.resource_id)) : null;
    result.push(Object.freeze({
      id: `resource_unit_progress:${row.resource_unit_id}`,
      userId,
      examProfileId,
      sourceKind: "resource_unit_progress" as const,
      resourceId: unit?.resource_id ? String(unit.resource_id) : null,
      subjectId: resource?.subject_id ? String(resource.subject_id) : null,
      curriculumNodeId: null,
      materialType: materialType(unit),
      actualMinutes: null,
      progressAmount,
      progressUnit: "page" as const,
      sampleStart: null,
      sampleEnd: row.completed_at ?? row.updated_at ?? null,
      evidenceQuality: reliable
        ? qualities("actual_progress_delta", "unavailable")
        : qualities("unreliable", "unavailable"),
      provenance: "resource_unit_progress:elapsed_time_unavailable",
    }));
  }

  for (const row of rows.physicalPaceEvidence ?? []) {
    const actualSeconds = positiveNumber(row.actual_active_seconds);
    const progressedPages = positiveNumber(row.progressed_pages);
    const accepted =
      row.evidence_status === "accepted" &&
      actualSeconds !== null &&
      progressedPages !== null &&
      (row.material_type === "page_range" || row.material_type === "test");

    result.push(Object.freeze({
      id: `physical_pace_evidence:${row.id}`,
      userId,
      examProfileId,
      sourceKind: "physical_pace_evidence" as const,
      resourceId: row.resource_id ? String(row.resource_id) : null,
      subjectId: row.subject_id ? String(row.subject_id) : null,
      curriculumNodeId: row.curriculum_node_id ? String(row.curriculum_node_id) : null,
      materialType: row.material_type === "test" ? "test" as const : "page_range" as const,
      actualMinutes: accepted ? actualSeconds / 60 : null,
      progressAmount: accepted ? progressedPages : null,
      progressUnit: "page" as const,
      sampleStart: row.activity_started_at ? String(row.activity_started_at) : null,
      sampleEnd: row.activity_ended_at ? String(row.activity_ended_at) : null,
      evidenceQuality: accepted
        ? qualities("actual_elapsed_time", "actual_progress_delta")
        : qualities("unreliable"),
      provenance: accepted
        ? `physical_pace_evidence:${row.evidence_provenance ?? "atomic_physical_finish"}`
        : "physical_pace_evidence:invalid_persisted_row",
    }));
  }

  const linksByTask = new Map<string, any[]>();
  for (const link of rows.taskResourceUnits) {
    const taskId = String(link.task_id);
    const current = linksByTask.get(taskId) ?? [];
    current.push(link);
    linksByTask.set(taskId, current);
  }

  for (const row of rows.tasks) {
    const links = linksByTask.get(String(row.id)) ?? [];
    const unit = links.length === 1
      ? unitById.get(String(links[0].resource_unit_id))
      : null;
    result.push(Object.freeze({
      id: `task_plan:${row.id}`,
      userId,
      examProfileId,
      sourceKind: "task_plan" as const,
      resourceId: row.resource_id ? String(row.resource_id) : null,
      subjectId: row.subject_id ? String(row.subject_id) : null,
      curriculumNodeId: row.curriculum_node_id ? String(row.curriculum_node_id) : null,
      materialType: materialType(unit),
      actualMinutes: null,
      progressAmount: null,
      progressUnit: "page" as const,
      sampleStart: row.created_at ? String(row.created_at) : null,
      sampleEnd: row.completed_at ? String(row.completed_at) : null,
      evidenceQuality: qualities("planned_only"),
      provenance: "tasks:estimated_minutes:planned_only",
    }));
  }

  for (const row of rows.youtubeProgress) {
    const watchedSeconds = Math.max(0, Number(row.watched_seconds ?? 0));
    result.push(Object.freeze({
      id: `youtube_video_progress:${row.youtube_playlist_video_id}`,
      userId,
      examProfileId,
      sourceKind: "youtube_video_progress" as const,
      resourceId: null,
      subjectId: null,
      curriculumNodeId: null,
      materialType: "video" as const,
      actualMinutes: null,
      progressAmount: Number.isFinite(watchedSeconds) ? watchedSeconds : null,
      progressUnit: "video_second" as const,
      sampleStart: null,
      sampleEnd: row.updated_at ?? row.completed_at ?? null,
      evidenceQuality: Number.isFinite(watchedSeconds)
        ? qualities("actual_progress_delta", "unavailable")
        : qualities("unreliable", "unavailable"),
      provenance: "youtube_video_progress:watched_seconds",
    }));
  }

  return Object.freeze(result.sort((left, right) => left.id.localeCompare(right.id)));
}

export async function loadCanonicalWorkloadEvidence(
  client: any,
  userId: string,
  examProfileId: string,
  requestedResourceIds: readonly string[] = [],
  options: { readonly physicalPaceEvidenceAvailable?: boolean } = {},
): Promise<readonly WorkloadEvidence[]> {
  let resourceQuery = client
    .from("resources")
    .select("id,subject_id")
    .eq("user_id", userId)
    .eq("exam_profile_id", examProfileId);
  const requested = uniqueStrings(requestedResourceIds);
  if (requested.length) resourceQuery = resourceQuery.in("id", requested);

  const [resourceResult, studyResult, testResult, taskResult, youtubeResult] = await Promise.all([
    resourceQuery,
    client
      .from("study_sessions")
      .select("id,subject_id,curriculum_node_id,resource_id,resource_unit_id,duration_minutes,started_at,ended_at,status,entry_source")
      .eq("user_id", userId)
      .eq("exam_profile_id", examProfileId),
    client
      .from("test_results")
      .select("id,subject_id,curriculum_node_id,resource_id,resource_unit_id,duration_minutes,completed_at,entry_source")
      .eq("user_id", userId)
      .eq("exam_profile_id", examProfileId),
    client
      .from("tasks")
      .select("id,subject_id,curriculum_node_id,resource_id,estimated_minutes,status,created_at,completed_at")
      .eq("user_id", userId)
      .eq("exam_profile_id", examProfileId),
    client
      .from("youtube_video_progress")
      .select("youtube_playlist_video_id,watched_seconds,last_position_seconds,completed_at,updated_at")
      .eq("user_id", userId)
      .eq("exam_profile_id", examProfileId),
  ]);

  for (const queryResult of [resourceResult, studyResult, testResult, taskResult, youtubeResult]) {
    if (queryResult.error) throw queryResult.error;
  }

  const resources = resourceResult.data ?? [];
  const resourceIds = uniqueStrings(resources.map((row: any) => row.id));
  let units: any[] = [];
  if (resourceIds.length) {
    const unitResult = await client
      .from("resource_units")
      .select("id,resource_id,unit_type,page_start,page_end")
      .in("resource_id", resourceIds);
    if (unitResult.error) throw unitResult.error;
    units = unitResult.data ?? [];
  }

  const unitIds = uniqueStrings(units.map((row: any) => row.id));
  const taskIds = uniqueStrings((taskResult.data ?? []).map((row: any) => row.id));
  let resourceProgress: any[] = [];
  let taskResourceUnits: any[] = [];
  let physicalPaceEvidence: any[] = [];
  const followups: Promise<void>[] = [];

  if (unitIds.length) {
    followups.push((async () => {
      const result = await client
        .from("resource_unit_progress")
        .select("resource_unit_id,status,completed_at,completed_through_page,updated_at")
        .eq("user_id", userId)
        .in("resource_unit_id", unitIds);
      if (result.error) throw result.error;
      resourceProgress = result.data ?? [];
    })());
  }

  if (taskIds.length) {
    followups.push((async () => {
      const result = await client
        .from("task_resource_units")
        .select("task_id,resource_unit_id,status,completed_at")
        .eq("user_id", userId)
        .in("task_id", taskIds);
      if (result.error) throw result.error;
      taskResourceUnits = result.data ?? [];
    })());
  }

  if (options.physicalPaceEvidenceAvailable && resourceIds.length) {
    followups.push((async () => {
      const result = await client
        .from("physical_pace_evidence")
        .select("id,resource_id,resource_section_id,resource_unit_id,subject_id,curriculum_node_id,material_type,start_page_boundary,end_page_boundary,progressed_pages,actual_active_seconds,activity_started_at,activity_ended_at,evidence_status,evidence_provenance,created_at")
        .eq("user_id", userId)
        .eq("exam_profile_id", examProfileId)
        .eq("evidence_status", "accepted")
        .in("resource_id", resourceIds);
      if (result.error) throw result.error;
      physicalPaceEvidence = result.data ?? [];
    })());
  }

  await Promise.all(followups);

  const resourceSet = new Set(resourceIds);
  return deriveCanonicalWorkloadEvidence(userId, examProfileId, {
    resources,
    units,
    studySessions: (studyResult.data ?? []).filter((row: any) => !row.resource_id || resourceSet.has(String(row.resource_id))),
    testResults: (testResult.data ?? []).filter((row: any) => !row.resource_id || resourceSet.has(String(row.resource_id))),
    resourceProgress,
    tasks: (taskResult.data ?? []).filter((row: any) => !row.resource_id || resourceSet.has(String(row.resource_id))),
    taskResourceUnits,
    youtubeProgress: youtubeResult.data ?? [],
    physicalPaceEvidence,
  });
}
