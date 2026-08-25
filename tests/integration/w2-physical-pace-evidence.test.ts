import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceRoleKey) {
  throw new Error("Supabase integration env required");
}

const EDITION = "11000000-0000-0000-0000-000000000001";
const SUBJECT = "20000000-0000-0000-0000-000000000002";
const TOPIC = "30000000-0000-0000-0000-000000000001";

const client = (key = anonKey!) => createClient(url!, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

async function register(api: SupabaseClient): Promise<User> {
  const id = randomUUID();
  const result = await api.auth.signUp({
    email: `w2-${id}@example.test`,
    password: `Safe-${id}`,
  });
  expect(result.error).toBeNull();
  return result.data.user!;
}

describe.sequential("W2 atomic physical pace persistence", () => {
  const actor = client();
  const admin = client(serviceRoleKey);
  let user: User;
  let profileId: string;
  let resourceId: string;
  let sectionId: string;
  let serial = 0;

  async function createTaskUnit(pageStart: number, pageEnd: number, unitType = "reading") {
    serial += 1;
    const unit = await actor.from("resource_units").insert({
      resource_id: resourceId,
      resource_section_id: sectionId,
      unit_type: unitType,
      name: `W2 unit ${serial}`,
      sort_order: serial,
      page_start: pageStart,
      page_end: pageEnd,
      estimated_minutes: 999,
    }).select("id").single();
    expect(unit.error).toBeNull();

    const task = await actor.from("tasks").insert({
      user_id: user.id,
      exam_profile_id: profileId,
      subject_id: SUBJECT,
      curriculum_node_id: TOPIC,
      resource_id: resourceId,
      task_type: "solve_resource_units",
      title: `W2 task ${serial}`,
      planned_date: "2026-08-25",
      estimated_minutes: 120,
      importance: "core",
      priority_score: 80,
      status: "ready",
      source_reason: "manual",
      dedupe_key: `w2-${randomUUID()}`,
    }).select("id").single();
    expect(task.error).toBeNull();

    const link = await actor.from("task_resource_units").insert({
      user_id: user.id,
      task_id: task.data!.id,
      resource_unit_id: unit.data!.id,
    });
    expect(link.error).toBeNull();
    return { taskId: task.data!.id, unitId: unit.data!.id };
  }

  async function waitForObservedSecond() {
    await new Promise((resolve) => setTimeout(resolve, 1_100));
  }

  beforeAll(async () => {
    user = await register(actor);
    const profile = await actor.from("exam_profiles").insert({
      user_id: user.id,
      exam_edition_id: EDITION,
      preparation_start_date: "2026-08-25",
      status: "active",
    }).select("id").single();
    expect(profile.error).toBeNull();
    profileId = profile.data!.id;

    const resource = await actor.from("resources").insert({
      user_id: user.id,
      exam_profile_id: profileId,
      subject_id: SUBJECT,
      name: "W2 physical source",
      resource_type: "book",
      resource_role: "primary",
      difficulty: "normal",
      status: "active",
    }).select("id").single();
    expect(resource.error).toBeNull();
    resourceId = resource.data!.id;

    const section = await actor.from("resource_sections").insert({
      resource_id: resourceId,
      curriculum_node_id: TOPIC,
      name: "W2 section",
      sort_order: 1,
      page_start: 1,
      page_end: 200,
      is_active: true,
    }).select("id").single();
    expect(section.error).toBeNull();
    sectionId = section.data!.id;
  });

  it("atomically creates one exact evidence sample using active time, not planned minutes", async () => {
    const { taskId, unitId } = await createTaskUnit(10, 20);
    const start = await actor.rpc("start_physical_study_session", {
      p_task_id: taskId,
      p_resource_unit_id: unitId,
      p_entry_source: "web",
    });
    expect(start.error).toBeNull();
    expect(start.data.startPageBoundary).toBe(9);
    const tamper = await actor.from("physical_study_activity_snapshots")
      .update({ start_page_boundary: 10 })
      .eq("study_session_id", start.data.id);
    expect(tamper.error).not.toBeNull();

    const pause = await actor.rpc("pause_physical_study_session", {
      p_session_id: start.data.id,
    });
    expect(pause.error).toBeNull();
    await waitForObservedSecond();
    const resume = await actor.rpc("resume_physical_study_session", {
      p_session_id: start.data.id,
    });
    expect(resume.error).toBeNull();
    await waitForObservedSecond();

    const finish = await actor.rpc("finish_physical_study_session", {
      p_session_id: start.data.id,
      p_end_page_boundary: 12,
    });
    expect(finish.error).toBeNull();
    expect(finish.data.evidence).toMatchObject({
      study_session_id: start.data.id,
      resource_id: resourceId,
      resource_section_id: sectionId,
      resource_unit_id: unitId,
      curriculum_node_id: TOPIC,
      material_type: "page_range",
      start_page_boundary: 9,
      end_page_boundary: 12,
      progressed_pages: 3,
    });
    expect(finish.data.evidence.actual_active_seconds).toBeGreaterThanOrEqual(1);
    expect(finish.data.evidence.actual_active_seconds).toBeLessThanOrEqual(3);
    expect(finish.data.evidence.actual_active_seconds).not.toBe(120 * 60);

    const replay = await actor.rpc("finish_physical_study_session", {
      p_session_id: start.data.id,
      p_end_page_boundary: 12,
    });
    expect(replay.error).toBeNull();
    expect(replay.data.idempotent).toBe(true);
    const count = await actor.from("physical_pace_evidence")
      .select("id", { count: "exact", head: true })
      .eq("study_session_id", start.data.id);
    expect(count.count).toBe(1);
  });

  it("finishes zero progress without evidence or fabricated progress", async () => {
    const { taskId, unitId } = await createTaskUnit(30, 40);
    const start = await actor.rpc("start_physical_study_session", {
      p_task_id: taskId, p_resource_unit_id: unitId, p_entry_source: "web",
    });
    const finish = await actor.rpc("finish_physical_study_session", {
      p_session_id: start.data.id, p_end_page_boundary: 29,
    });
    expect(finish.error).toBeNull();
    expect(finish.data).toMatchObject({ evidence: null, zeroProgress: true });
    expect((await actor.from("physical_pace_evidence").select("id").eq("study_session_id", start.data.id)).data).toEqual([]);
    expect((await actor.from("resource_unit_progress").select("id").eq("resource_unit_id", unitId)).data).toEqual([]);
  });

  it("rejects a generic pause that bypasses the protected physical pause ledger", async () => {
    const { taskId, unitId } = await createTaskUnit(41, 49);
    const start = await actor.rpc("start_physical_study_session", {
      p_task_id: taskId, p_resource_unit_id: unitId, p_entry_source: "web",
    });
    expect(start.error).toBeNull();
    expect((await actor.rpc("pause_study_session", { p_session_id: start.data.id })).error).toBeNull();
    const finish = await actor.rpc("finish_physical_study_session", {
      p_session_id: start.data.id, p_end_page_boundary: 40,
    });
    expect(finish.error?.message).toContain("PHYSICAL_BREAK_STATE_MISMATCH");
    expect((await actor.from("study_sessions").select("status").eq("id", start.data.id).single()).data!.status).toBe("active");
    await actor.rpc("cancel_study_session", { p_session_id: start.data.id });
  });

  it("rejects reversal and invalid boundaries without completing the activity", async () => {
    const { taskId, unitId } = await createTaskUnit(50, 60);
    const seeded = await actor.from("resource_unit_progress").insert({
      user_id: user.id,
      resource_unit_id: unitId,
      status: "in_progress",
      completed_through_page: 52,
    });
    expect(seeded.error).toBeNull();
    const start = await actor.rpc("start_physical_study_session", {
      p_task_id: taskId, p_resource_unit_id: unitId, p_entry_source: "web",
    });
    const reversal = await actor.rpc("finish_physical_study_session", {
      p_session_id: start.data.id, p_end_page_boundary: 51,
    });
    expect(reversal.error?.message).toContain("PHYSICAL_PROGRESS_REVERSAL");
    const invalid = await actor.rpc("finish_physical_study_session", {
      p_session_id: start.data.id, p_end_page_boundary: 61,
    });
    expect(invalid.error?.message).toContain("PHYSICAL_PAGE_BOUNDARY_INVALID");
    expect((await actor.from("study_sessions").select("status").eq("id", start.data.id).single()).data!.status).toBe("active");
    expect((await actor.from("resource_unit_progress").select("completed_through_page").eq("resource_unit_id", unitId).single()).data!.completed_through_page).toBe(52);
    await actor.rpc("cancel_study_session", { p_session_id: start.data.id });
  });

  it("retains overlap safety for the new sanctioned start", async () => {
    const first = await createTaskUnit(70, 80);
    const second = await createTaskUnit(90, 100);
    const start = await actor.rpc("start_physical_study_session", {
      p_task_id: first.taskId, p_resource_unit_id: first.unitId, p_entry_source: "web",
    });
    expect(start.error).toBeNull();
    const overlap = await actor.rpc("start_physical_study_session", {
      p_task_id: second.taskId, p_resource_unit_id: second.unitId, p_entry_source: "web",
    });
    expect(overlap.error?.message).toContain("ACTIVE_SESSION_EXISTS");
    await actor.rpc("cancel_study_session", { p_session_id: start.data.id });
  });

  it("rolls back session, progress, and evidence when a late transactional step fails", async () => {
    const { taskId, unitId } = await createTaskUnit(110, 120);
    const start = await actor.rpc("start_physical_study_session", {
      p_task_id: taskId, p_resource_unit_id: unitId, p_entry_source: "web",
    });
    await waitForObservedSecond();
    const removed = await admin.from("task_resource_units")
      .delete()
      .eq("task_id", taskId)
      .eq("resource_unit_id", unitId);
    expect(removed.error).toBeNull();
    const finish = await actor.rpc("finish_physical_study_session", {
      p_session_id: start.data.id, p_end_page_boundary: 120,
    });
    expect(finish.error?.message).toContain("TASK_NOT_FOUND");
    expect((await actor.from("study_sessions").select("status").eq("id", start.data.id).single()).data!.status).toBe("active");
    expect((await actor.from("resource_unit_progress").select("id").eq("resource_unit_id", unitId)).data).toEqual([]);
    expect((await actor.from("physical_pace_evidence").select("id").eq("study_session_id", start.data.id)).data).toEqual([]);
    await actor.rpc("cancel_study_session", { p_session_id: start.data.id });
  });

  it("does not create evidence from task-unit completion alone", async () => {
    const { taskId, unitId } = await createTaskUnit(130, 140, "test");
    const completed = await actor.rpc("complete_task_unit", {
      p_task_id: taskId,
      p_resource_unit_id: unitId,
    });
    expect(completed.error).toBeNull();
    expect((await actor.from("physical_pace_evidence").select("id").eq("resource_unit_id", unitId)).data).toEqual([]);
  });
});
