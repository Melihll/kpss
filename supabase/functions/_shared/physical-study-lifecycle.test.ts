import { describe, expect, it } from "vitest";
import {
  isPhysicalPaceCaptureEnabled,
  PhysicalStudyLifecycleService,
  selectPhysicalStudyUnit,
} from "./physical-study-lifecycle";

const PROFILE = "10000000-0000-4000-8000-000000000001";
const TASK = "20000000-0000-4000-8000-000000000001";
const UNIT = "30000000-0000-4000-8000-000000000001";
const SESSION = "40000000-0000-4000-8000-000000000001";

function physicalLink(id = UNIT, overrides: Record<string, unknown> = {}) {
  return {
    resource_unit_id: id,
    status: "pending",
    resource_units: {
      id,
      resource_id: "50000000-0000-4000-8000-000000000001",
      unit_type: "reading",
      page_start: 10,
      page_end: 20,
      is_active: true,
      resources: { id: "50000000-0000-4000-8000-000000000001", resource_type: "book" },
      ...overrides,
    },
  };
}

function task(links = [physicalLink()]) {
  return {
    id: TASK,
    resource_id: "50000000-0000-4000-8000-000000000001",
    task_resource_units: links,
  };
}

class FakeClient {
  readonly calls: Array<{ kind: "from" | "rpc"; name: string; args?: unknown }> = [];
  readonly rows = new Map<string, any>();
  readonly rpcResults = new Map<string, any>();

  from(name: string) {
    this.calls.push({ kind: "from", name });
    const filters: Array<[string, unknown]> = [];
    const builder: any = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        filters.push([column, value]);
        return builder;
      },
      maybeSingle: async () => {
        let value = this.rows.get(name) ?? null;
        if (Array.isArray(value)) {
          value = value.find((row) => filters.every(([column, expected]) => row[column] === expected)) ?? null;
        }
        return { data: value, error: null };
      },
    };
    return builder;
  }

  async rpc(name: string, args: unknown) {
    this.calls.push({ kind: "rpc", name, args });
    return this.rpcResults.get(name) ?? { data: { id: SESSION }, error: null };
  }
}

describe("physical pace capture capability", () => {
  it("defaults off and only enables an explicit profile or development wildcard", () => {
    expect(isPhysicalPaceCaptureEnabled(undefined, PROFILE)).toBe(false);
    expect(isPhysicalPaceCaptureEnabled("", PROFILE)).toBe(false);
    expect(isPhysicalPaceCaptureEnabled("true", PROFILE)).toBe(false);
    expect(isPhysicalPaceCaptureEnabled("not-a-uuid", PROFILE)).toBe(false);
    expect(isPhysicalPaceCaptureEnabled(PROFILE, PROFILE)).toBe(true);
    expect(isPhysicalPaceCaptureEnabled(`00000000-0000-4000-8000-000000000000, ${PROFILE}`, PROFILE)).toBe(true);
    expect(isPhysicalPaceCaptureEnabled("*", PROFILE)).toBe(true);
  });
});

describe("exact physical unit selection", () => {
  it("selects one persisted compatible pending unit", () => {
    expect(selectPhysicalStudyUnit(task())).toMatchObject({
      status: "eligible",
      unit: { id: UNIT, pageStart: 10, pageEnd: 20 },
    });
  });

  it("does not silently choose ambiguous, YouTube, missing, or synthetic work", () => {
    expect(selectPhysicalStudyUnit(task([physicalLink(), physicalLink("30000000-0000-4000-8000-000000000002")]))).toMatchObject({ status: "ineligible", reason: "ambiguous_physical_units" });
    expect(selectPhysicalStudyUnit(task([physicalLink(UNIT, { unit_type: "video" })]))).toMatchObject({ status: "ineligible", reason: "no_compatible_physical_unit" });
    expect(selectPhysicalStudyUnit(task([physicalLink(UNIT, { resources: { resource_type: "video_course" } })]))).toMatchObject({ status: "ineligible", reason: "no_compatible_physical_unit" });
    expect(selectPhysicalStudyUnit(task([]))).toMatchObject({ status: "ineligible", reason: "no_compatible_physical_unit" });
    expect(selectPhysicalStudyUnit({ ...task([]), structuralSpan: { pageStart: 10, pageEnd: 20 } } as any)).toMatchObject({ status: "ineligible" });
  });

  it("accepts an explicit eligible unit when multiple physical units are pending", () => {
    const second = "30000000-0000-4000-8000-000000000002";
    expect(selectPhysicalStudyUnit(task([physicalLink(), physicalLink(second)]), second)).toMatchObject({
      status: "eligible",
      unit: { id: second },
    });
    expect(selectPhysicalStudyUnit(task([physicalLink()]), "30000000-0000-4000-8000-000000000099")).toMatchObject({
      status: "ineligible",
      reason: "selected_unit_not_eligible",
    });
  });
});

describe("PhysicalStudyLifecycleService", () => {
  it("keeps feature-OFF start exactly on legacy and has no W2 table dependency", async () => {
    const client = new FakeClient();
    const service = new PhysicalStudyLifecycleService(client as any, { captureEnabled: false });
    const result = await service.start({ taskId: TASK, entrySource: "web" });
    expect(result).toMatchObject({ lifecycle: "legacy", outcome: "legacy_started" });
    expect(client.calls).toEqual([{ kind: "rpc", name: "start_study_session", args: { p_task_id: TASK, p_entry_source: "web" } }]);
  });

  it("uses the exact W2 start RPC once when enabled and eligible", async () => {
    const client = new FakeClient();
    client.rows.set("tasks", task());
    client.rpcResults.set("start_physical_study_session", { data: { id: SESSION, startPageBoundary: 9, materialType: "page_range" }, error: null });
    const service = new PhysicalStudyLifecycleService(client as any, { captureEnabled: true });
    const result = await service.start({ taskId: TASK, entrySource: "web" });
    expect(result).toMatchObject({
      lifecycle: "physical_v1",
      outcome: "started",
      session: { id: SESSION },
      physicalCapture: { resourceUnitId: UNIT, pageStart: 10, pageEnd: 20, startPageBoundary: 9 },
    });
    expect(client.calls.filter((call) => call.kind === "rpc")).toEqual([{
      kind: "rpc",
      name: "start_physical_study_session",
      args: { p_task_id: TASK, p_resource_unit_id: UNIT, p_entry_source: "web" },
    }]);
  });

  it("falls back once to legacy for incompatible and ambiguous tasks", async () => {
    for (const links of [[], [physicalLink(), physicalLink("30000000-0000-4000-8000-000000000002")], [physicalLink(UNIT, { unit_type: "video" })]]) {
      const client = new FakeClient();
      client.rows.set("tasks", task(links));
      const service = new PhysicalStudyLifecycleService(client as any, { captureEnabled: true });
      expect(await service.start({ taskId: TASK, entrySource: "web" })).toMatchObject({ lifecycle: "legacy" });
      expect(client.calls.filter((call) => call.kind === "rpc").map((call) => call.name)).toEqual(["start_study_session"]);
    }
  });

  it("treats a same-session ACTIVE_SESSION_EXISTS retry as idempotent", async () => {
    const client = new FakeClient();
    client.rows.set("tasks", task());
    client.rows.set("study_sessions", { id: SESSION, task_id: TASK, resource_unit_id: UNIT, status: "active" });
    client.rows.set("physical_study_activity_snapshots", {
      study_session_id: SESSION, task_id: TASK, resource_unit_id: UNIT,
      material_type: "page_range", unit_page_start: 10, unit_page_end: 20, start_page_boundary: 9,
    });
    client.rpcResults.set("start_physical_study_session", { data: null, error: { message: "ACTIVE_SESSION_EXISTS" } });
    const result = await new PhysicalStudyLifecycleService(client as any, { captureEnabled: true }).start({ taskId: TASK, entrySource: "web" });
    expect(result).toMatchObject({ lifecycle: "physical_v1", outcome: "started", idempotent: true, session: { id: SESSION } });
    expect(client.calls.filter((call) => call.kind === "rpc")).toHaveLength(1);
  });

  it("routes pause and resume by protected ownership and rejects mixed state", async () => {
    const client = new FakeClient();
    client.rows.set("study_sessions", { id: SESSION, task_id: TASK, resource_unit_id: UNIT, status: "active" });
    client.rows.set("physical_study_activity_snapshots", { study_session_id: SESSION, resource_unit_id: UNIT });
    const service = new PhysicalStudyLifecycleService(client as any, { captureEnabled: false });
    await service.pause(SESSION);
    await service.resume(SESSION);
    expect(client.calls.filter((call) => call.kind === "rpc").map((call) => call.name)).toEqual([
      "pause_physical_study_session", "resume_physical_study_session",
    ]);

    const mixed = new FakeClient();
    mixed.rows.set("study_sessions", { id: SESSION, resource_unit_id: UNIT, status: "active" });
    await expect(new PhysicalStudyLifecycleService(mixed as any, { captureEnabled: true }).pause(SESSION)).rejects.toThrow("PHYSICAL_SESSION_OWNERSHIP_CONFLICT");
    expect(mixed.calls.some((call) => call.kind === "rpc")).toBe(false);
  });

  it("requires and validates the W2 page boundary before one atomic finish", async () => {
    const client = new FakeClient();
    client.rows.set("study_sessions", { id: SESSION, resource_unit_id: UNIT, status: "active" });
    client.rows.set("physical_study_activity_snapshots", {
      study_session_id: SESSION, resource_unit_id: UNIT, material_type: "page_range",
      unit_page_start: 10, unit_page_end: 20, start_page_boundary: 12,
    });
    const service = new PhysicalStudyLifecycleService(client as any, { captureEnabled: true });
    await expect(service.finish(SESSION)).rejects.toThrow("PHYSICAL_PAGE_BOUNDARY_REQUIRED");
    await expect(service.finish(SESSION, 11)).rejects.toThrow("PHYSICAL_PROGRESS_REVERSAL");
    await expect(service.finish(SESSION, 21)).rejects.toThrow("PHYSICAL_PAGE_BOUNDARY_INVALID");
    expect(client.calls.some((call) => call.kind === "rpc")).toBe(false);

    client.rpcResults.set("finish_physical_study_session", { data: { id: SESSION, evidence: { id: "evidence" }, zeroProgress: false, idempotent: false }, error: null });
    expect(await service.finish(SESSION, 15)).toMatchObject({ lifecycle: "physical_v1", outcome: "completed_with_evidence" });
    expect(client.calls.filter((call) => call.kind === "rpc")).toEqual([{
      kind: "rpc", name: "finish_physical_study_session", args: { p_session_id: SESSION, p_end_page_boundary: 15 },
    }]);
  });

  it("surfaces zero-progress, replay, stale-progress, ownership, and W2 cancel safely", async () => {
    const client = new FakeClient();
    client.rows.set("study_sessions", { id: SESSION, resource_unit_id: UNIT, status: "active" });
    client.rows.set("physical_study_activity_snapshots", {
      study_session_id: SESSION, resource_unit_id: UNIT, material_type: "page_range",
      unit_page_start: 10, unit_page_end: 20, start_page_boundary: 12,
    });
    const service = new PhysicalStudyLifecycleService(client as any, { captureEnabled: true });
    client.rpcResults.set("finish_physical_study_session", { data: { id: SESSION, evidence: null, zeroProgress: true, idempotent: false }, error: null });
    expect(await service.finish(SESSION, 12)).toMatchObject({ outcome: "completed_without_evidence", zeroProgress: true });
    await expect(service.cancel(SESSION)).rejects.toThrow("PHYSICAL_SESSION_CANCEL_UNAVAILABLE");

    const stale = new FakeClient();
    stale.rows.set("study_sessions", { id: SESSION, resource_unit_id: UNIT, status: "active" });
    stale.rows.set("physical_study_activity_snapshots", client.rows.get("physical_study_activity_snapshots"));
    stale.rpcResults.set("finish_physical_study_session", { data: null, error: { message: "PHYSICAL_PROGRESS_CHANGED_DURING_SESSION" } });
    await expect(new PhysicalStudyLifecycleService(stale as any, { captureEnabled: true }).finish(SESSION, 15)).rejects.toThrow("PHYSICAL_PROGRESS_CHANGED_DURING_SESSION");
  });

  it("propagates ownership and overlap failures without a second mutation", async () => {
    const missing = new FakeClient();
    await expect(new PhysicalStudyLifecycleService(missing as any, { captureEnabled: true }).finish(SESSION, 10)).rejects.toThrow("SESSION_NOT_FOUND");
    expect(missing.calls.some((call) => call.kind === "rpc")).toBe(false);

    const overlap = new FakeClient();
    overlap.rows.set("tasks", task());
    overlap.rpcResults.set("start_physical_study_session", { data: null, error: { message: "ACTIVE_SESSION_EXISTS" } });
    await expect(new PhysicalStudyLifecycleService(overlap as any, { captureEnabled: true }).start({ taskId: TASK })).rejects.toThrow("ACTIVE_SESSION_EXISTS");
    expect(overlap.calls.filter((call) => call.kind === "rpc")).toHaveLength(1);
  });
});
