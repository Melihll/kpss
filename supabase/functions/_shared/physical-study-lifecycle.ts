export const PHYSICAL_PACE_CAPTURE_PROFILE_ENV = "PHYSICAL_PACE_CAPTURE_V1_PROFILE_IDS";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPhysicalPaceCaptureEnabled(raw: string | undefined, examProfileId: string): boolean {
  const value = raw?.trim();
  if (!value) return false;
  if (value === "*") return true;
  return value
    .split(",")
    .map((candidate) => candidate.trim())
    .filter((candidate) => UUID.test(candidate))
    .includes(examProfileId);
}

function firstRelation(value: any): any {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export interface PhysicalStudyUnit {
  readonly id: string;
  readonly resourceId: string;
  readonly materialType: "page_range" | "test";
  readonly pageStart: number;
  readonly pageEnd: number;
}

export type PhysicalStudyUnitSelection =
  | { readonly status: "eligible"; readonly unit: PhysicalStudyUnit }
  | {
    readonly status: "ineligible";
    readonly reason:
      | "no_compatible_physical_unit"
      | "ambiguous_physical_units"
      | "selected_unit_not_eligible";
  };

function compatiblePhysicalUnit(task: any, link: any): PhysicalStudyUnit | null {
  if (link?.status !== "pending") return null;
  const unit = firstRelation(link.resource_units);
  const resource = firstRelation(unit?.resources);
  const id = String(unit?.id ?? link?.resource_unit_id ?? "");
  const resourceId = String(unit?.resource_id ?? "");
  const pageStart = Number(unit?.page_start);
  const pageEnd = Number(unit?.page_end);
  if (
    !UUID.test(id) ||
    !UUID.test(resourceId) ||
    unit?.is_active !== true ||
    unit?.unit_type === "video" ||
    resource?.resource_type === "video_course" ||
    String(task?.resource_id ?? "") !== resourceId ||
    !Number.isInteger(pageStart) ||
    !Number.isInteger(pageEnd) ||
    pageStart <= 0 ||
    pageEnd < pageStart
  ) return null;
  return Object.freeze({
    id,
    resourceId,
    materialType: unit.unit_type === "test" ? "test" : "page_range",
    pageStart,
    pageEnd,
  });
}

export function selectPhysicalStudyUnit(
  task: any,
  selectedResourceUnitId?: string | null,
): PhysicalStudyUnitSelection {
  const candidates = (task?.task_resource_units ?? [])
    .map((link: any) => compatiblePhysicalUnit(task, link))
    .filter(Boolean) as PhysicalStudyUnit[];

  if (selectedResourceUnitId) {
    const selected = candidates.find((unit) => unit.id === selectedResourceUnitId);
    return selected
      ? { status: "eligible", unit: selected }
      : { status: "ineligible", reason: "selected_unit_not_eligible" };
  }
  if (candidates.length === 1) return { status: "eligible", unit: candidates[0] };
  if (candidates.length > 1) return { status: "ineligible", reason: "ambiguous_physical_units" };
  return { status: "ineligible", reason: "no_compatible_physical_unit" };
}

export interface PhysicalCaptureState {
  readonly resourceUnitId: string;
  readonly materialType: "page_range" | "test";
  readonly pageStart: number;
  readonly pageEnd: number;
  readonly startPageBoundary: number;
}

type LifecycleOptions = { readonly captureEnabled: boolean };

function caughtMessage(caught: unknown): string {
  if (caught instanceof Error) return caught.message;
  if (caught && typeof caught === "object" && "message" in caught) return String(caught.message);
  return String(caught);
}

function throwResultError(error: unknown): never {
  throw new Error(caughtMessage(error));
}

function physicalCaptureFromSnapshot(snapshot: any): PhysicalCaptureState {
  return Object.freeze({
    resourceUnitId: String(snapshot.resource_unit_id),
    materialType: snapshot.material_type === "test" ? "test" : "page_range",
    pageStart: Number(snapshot.unit_page_start),
    pageEnd: Number(snapshot.unit_page_end),
    startPageBoundary: Number(snapshot.start_page_boundary),
  });
}

function physicalCaptureFromStart(data: any, unit: PhysicalStudyUnit): PhysicalCaptureState {
  return Object.freeze({
    resourceUnitId: unit.id,
    materialType: data?.materialType === "test" ? "test" : unit.materialType,
    pageStart: unit.pageStart,
    pageEnd: unit.pageEnd,
    startPageBoundary: Number(data?.startPageBoundary ?? unit.pageStart - 1),
  });
}

export class PhysicalStudyLifecycleService {
  readonly #client: any;
  readonly #captureEnabled: boolean;

  constructor(client: any, options: LifecycleOptions) {
    this.#client = client;
    this.#captureEnabled = options.captureEnabled;
  }

  async #rpc(name: string, args: Record<string, unknown>): Promise<any> {
    const result = await this.#client.rpc(name, args);
    if (result.error) throwResultError(result.error);
    return result.data;
  }

  async #loadTask(taskId: string): Promise<any> {
    const result = await this.#client
      .from("tasks")
      .select("id,resource_id,status,task_resource_units(resource_unit_id,status,resource_units(id,resource_id,unit_type,page_start,page_end,is_active,resources(id,resource_type)))")
      .eq("id", taskId)
      .maybeSingle();
    if (result.error) throwResultError(result.error);
    if (!result.data) throw new Error("TASK_NOT_FOUND");
    return result.data;
  }

  async #loadSnapshot(sessionId: string): Promise<any | null> {
    const result = await this.#client
      .from("physical_study_activity_snapshots")
      .select("study_session_id,task_id,resource_unit_id,material_type,unit_page_start,unit_page_end,start_page_boundary")
      .eq("study_session_id", sessionId)
      .maybeSingle();
    if (result.error) throwResultError(result.error);
    return result.data ?? null;
  }

  async #loadSession(sessionId: string): Promise<any> {
    const result = await this.#client
      .from("study_sessions")
      .select("id,task_id,resource_unit_id,status,exam_profile_id")
      .eq("id", sessionId)
      .maybeSingle();
    if (result.error) throwResultError(result.error);
    if (!result.data) throw new Error("SESSION_NOT_FOUND");
    return result.data;
  }

  async #ownership(sessionId: string): Promise<
    | { readonly lifecycle: "legacy"; readonly session: any }
    | { readonly lifecycle: "physical_v1"; readonly session: any; readonly snapshot: any }
  > {
    const session = await this.#loadSession(sessionId);
    if (!session.resource_unit_id) return { lifecycle: "legacy", session };
    const snapshot = await this.#loadSnapshot(sessionId);
    if (!snapshot || String(snapshot.resource_unit_id) !== String(session.resource_unit_id)) {
      throw new Error("PHYSICAL_SESSION_OWNERSHIP_CONFLICT");
    }
    return { lifecycle: "physical_v1", session, snapshot };
  }

  async #matchingActiveSession(taskId: string, unitId: string): Promise<{ session: any; snapshot: any } | null> {
    const result = await this.#client
      .from("study_sessions")
      .select("id,task_id,resource_unit_id,status,exam_profile_id")
      .eq("status", "active")
      .maybeSingle();
    if (result.error) throwResultError(result.error);
    const session = result.data;
    if (!session || String(session.task_id) !== taskId || String(session.resource_unit_id) !== unitId) return null;
    const snapshot = await this.#loadSnapshot(String(session.id));
    if (!snapshot || String(snapshot.task_id) !== taskId || String(snapshot.resource_unit_id) !== unitId) return null;
    return { session, snapshot };
  }

  async start(input: {
    readonly taskId: string;
    readonly entrySource?: string;
    readonly resourceUnitId?: string | null;
  }): Promise<any> {
    const entrySource = input.entrySource ?? "web";
    if (!this.#captureEnabled) {
      const data = await this.#rpc("start_study_session", {
        p_task_id: input.taskId,
        p_entry_source: entrySource,
      });
      return { ...data, lifecycle: "legacy", outcome: "legacy_started", session: data };
    }

    const task = await this.#loadTask(input.taskId);
    const selection = selectPhysicalStudyUnit(task, input.resourceUnitId);
    if (selection.status === "ineligible") {
      if (selection.reason === "selected_unit_not_eligible") {
        throw new Error("PHYSICAL_RESOURCE_UNIT_SELECTION_INVALID");
      }
      const data = await this.#rpc("start_study_session", {
        p_task_id: input.taskId,
        p_entry_source: entrySource,
      });
      return {
        ...data,
        lifecycle: "legacy",
        outcome: "legacy_started",
        w2UnavailableReason: selection.reason,
        session: data,
      };
    }

    try {
      const data = await this.#rpc("start_physical_study_session", {
        p_task_id: input.taskId,
        p_resource_unit_id: selection.unit.id,
        p_entry_source: entrySource,
      });
      return {
        ...data,
        lifecycle: "physical_v1",
        outcome: "started",
        idempotent: false,
        session: data,
        physicalCapture: physicalCaptureFromStart(data, selection.unit),
      };
    } catch (caught) {
      if (!caughtMessage(caught).includes("ACTIVE_SESSION_EXISTS")) throw caught;
      const replay = await this.#matchingActiveSession(input.taskId, selection.unit.id);
      if (!replay) throw caught;
      return {
        ...replay.session,
        lifecycle: "physical_v1",
        outcome: "started",
        idempotent: true,
        session: replay.session,
        physicalCapture: physicalCaptureFromSnapshot(replay.snapshot),
      };
    }
  }

  async describeSession(session: any): Promise<{ lifecycle: "legacy" | "physical_v1"; physicalCapture: PhysicalCaptureState | null }> {
    if (!session?.resource_unit_id) return { lifecycle: "legacy", physicalCapture: null };
    const snapshot = await this.#loadSnapshot(String(session.id));
    if (!snapshot || String(snapshot.resource_unit_id) !== String(session.resource_unit_id)) {
      throw new Error("PHYSICAL_SESSION_OWNERSHIP_CONFLICT");
    }
    return { lifecycle: "physical_v1", physicalCapture: physicalCaptureFromSnapshot(snapshot) };
  }

  async pause(sessionId: string): Promise<any> {
    const owner = await this.#ownership(sessionId);
    const rpc = owner.lifecycle === "physical_v1" ? "pause_physical_study_session" : "pause_study_session";
    const data = await this.#rpc(rpc, { p_session_id: sessionId });
    return { ...data, lifecycle: owner.lifecycle, outcome: "paused", session: data };
  }

  async resume(sessionId: string): Promise<any> {
    const owner = await this.#ownership(sessionId);
    const rpc = owner.lifecycle === "physical_v1" ? "resume_physical_study_session" : "resume_study_session";
    const data = await this.#rpc(rpc, { p_session_id: sessionId });
    return { ...data, lifecycle: owner.lifecycle, outcome: "resumed", session: data };
  }

  async finish(sessionId: string, completedThroughPage?: number): Promise<any> {
    const owner = await this.#ownership(sessionId);
    if (owner.lifecycle === "legacy") {
      const data = await this.#rpc("finish_study_session", { p_session_id: sessionId });
      return { ...data, lifecycle: "legacy", outcome: "legacy_completed", session: data };
    }

    if (!Number.isInteger(completedThroughPage)) throw new Error("PHYSICAL_PAGE_BOUNDARY_REQUIRED");
    const start = Number(owner.snapshot.start_page_boundary);
    const pageStart = Number(owner.snapshot.unit_page_start);
    const pageEnd = Number(owner.snapshot.unit_page_end);
    if (completedThroughPage! < start) throw new Error("PHYSICAL_PROGRESS_REVERSAL");
    if (completedThroughPage! < pageStart - 1 || completedThroughPage! > pageEnd) {
      throw new Error("PHYSICAL_PAGE_BOUNDARY_INVALID");
    }
    const data = await this.#rpc("finish_physical_study_session", {
      p_session_id: sessionId,
      p_end_page_boundary: completedThroughPage,
    });
    const evidence = data?.evidence ?? null;
    return {
      ...data,
      lifecycle: "physical_v1",
      outcome: evidence ? "completed_with_evidence" : "completed_without_evidence",
      zeroProgress: Boolean(data?.zeroProgress ?? !evidence),
      session: data,
      physicalCapture: physicalCaptureFromSnapshot(owner.snapshot),
    };
  }

  async cancel(sessionId: string): Promise<any> {
    const owner = await this.#ownership(sessionId);
    if (owner.lifecycle === "physical_v1") throw new Error("PHYSICAL_SESSION_CANCEL_UNAVAILABLE");
    const data = await this.#rpc("cancel_study_session", { p_session_id: sessionId });
    return { ...data, lifecycle: "legacy", outcome: "legacy_cancelled", session: data };
  }
}
