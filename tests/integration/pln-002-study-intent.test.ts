import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceRoleKey) throw new Error("Local Supabase env required");

const EDITION = "11000000-0000-0000-0000-000000000001";
const TURKISH = "20000000-0000-0000-0000-000000000001";
const MATH = "20000000-0000-0000-0000-000000000002";
const GEOGRAPHY = "20000000-0000-0000-0000-000000000004";
const MATH_TOPIC = "30000000-0000-0000-0000-000000000001";
const WEEK_START = "2026-08-17";
const WEEK_END = "2026-08-23";
const TODAY = "2026-08-22";
const TOMORROW = "2026-08-23";

function client(key = anonKey): SupabaseClient {
  return createClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function register(api: SupabaseClient, label: string): Promise<User> {
  const suffix = randomUUID();
  const result = await api.auth.signUp({
    email: `pln002-${label}-${suffix}@example.test`,
    password: `Safe-${suffix}`,
  });
  expect(result.error).toBeNull();
  return result.data.user!;
}

describe("PLN-002 intent ledger and confirmed transitions", () => {
  const owner = client();
  const other = client();
  const admin = client(serviceRoleKey);
  let ownerUser: User;
  let profileId: string;
  let planId: string;
  let turkishTaskId: string;
  let geographyTaskId: string;
  let mathTaskId: string;
  let extraSessionId: string;

  async function currentPlan() {
    const result = await owner.from("weekly_plans").select("*").eq("id", planId).single();
    expect(result.error).toBeNull();
    return result.data!;
  }

  async function createProposal(kind: "substitution" | "carryover", mutation: Record<string, unknown>) {
    const plan = await currentPlan();
    const result = await admin.rpc("create_confirmed_action_proposal", {
      p_user_id: ownerUser.id,
      p_exam_profile_id: profileId,
      p_weekly_plan_id: planId,
      p_action_kind: kind,
      p_plan_generation_version: plan.generation_version,
      p_mutation_payload: mutation,
      p_display_payload: { explanation: `PLN-002 ${kind} preview` },
      p_idempotency_key: `pln002:${kind}:${randomUUID()}`,
    });
    expect(result.error).toBeNull();
    return result.data.proposalId as string;
  }

  beforeAll(async () => {
    ownerUser = await register(owner, "owner");
    await register(other, "other");
    const profile = await owner.from("exam_profiles").insert({
      user_id: ownerUser.id,
      exam_edition_id: EDITION,
      preparation_start_date: "2026-08-01",
      status: "active",
    }).select("id").single();
    expect(profile.error).toBeNull();
    profileId = profile.data!.id;
    expect((await owner.from("user_subjects").insert([TURKISH, MATH, GEOGRAPHY].map((subjectId) => ({
      user_id: ownerUser.id,
      exam_profile_id: profileId,
      subject_id: subjectId,
      status: "active",
    })))).error).toBeNull();
    await owner.rpc("initialize_subject_progress", { p_exam_profile_id: profileId, p_subject_id: MATH });
    const plan = await owner.from("weekly_plans").insert({
      user_id: ownerUser.id,
      exam_profile_id: profileId,
      week_start_date: WEEK_START,
      week_end_date: WEEK_END,
      available_minutes: 180,
      planning_budget_minutes: 180,
      planned_minutes: 180,
      status: "active",
      generation_version: 1,
    }).select("id").single();
    expect(plan.error).toBeNull();
    planId = plan.data!.id;
    const tasks = await owner.from("tasks").insert([
      { user_id: ownerUser.id, exam_profile_id: profileId, weekly_plan_id: planId, subject_id: TURKISH, task_type: "custom", title: "Turkish planned", planned_date: TODAY, estimated_minutes: 60, importance: "important", priority_score: 60, status: "ready", source_reason: "manual", dedupe_key: "pln002-turkish" },
      { user_id: ownerUser.id, exam_profile_id: profileId, weekly_plan_id: planId, subject_id: GEOGRAPHY, task_type: "custom", title: "Geography planned", planned_date: TODAY, estimated_minutes: 60, importance: "important", priority_score: 50, status: "ready", source_reason: "manual", dedupe_key: "pln002-geography" },
      { user_id: ownerUser.id, exam_profile_id: profileId, weekly_plan_id: planId, subject_id: MATH, curriculum_node_id: MATH_TOPIC, task_type: "learn_topic", title: "Math planned", planned_date: TODAY, estimated_minutes: 60, importance: "important", priority_score: 40, status: "ready", source_reason: "manual", dedupe_key: "pln002-math" },
    ]).select("id,dedupe_key");
    expect(tasks.error).toBeNull();
    turkishTaskId = tasks.data!.find((task) => task.dedupe_key === "pln002-turkish")!.id;
    geographyTaskId = tasks.data!.find((task) => task.dedupe_key === "pln002-geography")!.id;
    mathTaskId = tasks.data!.find((task) => task.dedupe_key === "pln002-math")!.id;
    expect((await owner.from("task_progress").insert([turkishTaskId, geographyTaskId, mathTaskId].map((taskId) => ({ task_id: taskId, user_id: ownerUser.id })))).error).toBeNull();
  });

  it("records +40 Turkish as idempotent Extra Study without changing Geography", async () => {
    const payload = {
      examProfileId: profileId,
      subjectId: TURKISH,
      durationMinutes: 40,
      endedAt: "2026-08-22T07:40:00Z",
      accountingIntent: "extra",
      idempotencyKey: `pln002-extra-${randomUUID()}`,
      entrySource: "retroactive",
    };
    const before = await owner.from("tasks").select("planned_date,status,estimated_minutes").eq("id", geographyTaskId).single();
    const first = await owner.rpc("record_retroactive_session", { p_payload: payload });
    expect(first.error).toBeNull();
    extraSessionId = first.data.id;
    expect(first.data.allocation.accounting_intent).toBe("extra");
    expect(first.data.allocation.actual_minutes).toBe(40);
    expect(first.data.allocation.planned_credit_minutes).toBe(0);
    const second = await owner.rpc("record_retroactive_session", { p_payload: payload });
    expect(second.error).toBeNull();
    expect(second.data.id).toBe(extraSessionId);
    const after = await owner.from("tasks").select("planned_date,status,estimated_minutes").eq("id", geographyTaskId).single();
    expect(after.data).toEqual(before.data);
    expect((await owner.from("study_session_allocations").select("id", { count: "exact", head: true }).eq("idempotency_key", payload.idempotencyKey)).count).toBe(1);
  });

  it("credits unplanned extra topic evidence but leaves all planned tasks unchanged", async () => {
    const beforeTasks = await owner.from("tasks").select("id,planned_date,status,estimated_minutes").eq("weekly_plan_id", planId).order("id");
    const beforeTopic = await owner.from("topic_progress").select("total_study_minutes").eq("exam_profile_id", profileId).eq("curriculum_node_id", MATH_TOPIC).single();
    const recorded = await owner.rpc("record_retroactive_session", { p_payload: {
      examProfileId: profileId,
      subjectId: MATH,
      curriculumNodeId: MATH_TOPIC,
      durationMinutes: 20,
      endedAt: "2026-08-22T08:20:00Z",
      accountingIntent: "extra",
      idempotencyKey: `pln002-topic-extra-${randomUUID()}`,
    } });
    expect(recorded.error).toBeNull();
    const afterTasks = await owner.from("tasks").select("id,planned_date,status,estimated_minutes").eq("weekly_plan_id", planId).order("id");
    const afterTopic = await owner.from("topic_progress").select("total_study_minutes").eq("exam_profile_id", profileId).eq("curriculum_node_id", MATH_TOPIC).single();
    expect(afterTasks.data).toEqual(beforeTasks.data);
    expect(afterTopic.data!.total_study_minutes).toBe(beforeTopic.data!.total_study_minutes + 20);
  });

  it("keeps an 85-minute planned session planned while capping credit at 60", async () => {
    const geographyBefore = await owner.from("tasks").select("planned_date,status,estimated_minutes").eq("id", geographyTaskId).single();
    const recorded = await owner.rpc("record_retroactive_session", { p_payload: {
      examProfileId: profileId,
      taskId: turkishTaskId,
      durationMinutes: 85,
      endedAt: "2026-08-22T10:25:00Z",
      idempotencyKey: `pln002-overrun-${randomUUID()}`,
    } });
    expect(recorded.error).toBeNull();
    expect(recorded.data.allocation.accounting_intent).toBe("planned");
    expect(recorded.data.allocation.actual_minutes).toBe(85);
    expect(recorded.data.allocation.planned_credit_minutes).toBe(60);
    const progress = await owner.from("task_progress").select("completed_minutes,actual_study_minutes").eq("task_id", turkishTaskId).single();
    expect(progress.data).toEqual({ completed_minutes: 60, actual_study_minutes: 85 });
    expect((await owner.from("tasks").select("planned_date,status,estimated_minutes").eq("id", geographyTaskId).single()).data).toEqual(geographyBefore.data);
  });

  it("rejects cross-user allocation access", async () => {
    expect((await other.from("study_session_allocations").select("id").eq("session_id", extraSessionId)).data).toEqual([]);
  });

  it("applies explicit partial substitution once and only changes its named relationship", async () => {
    const mathBefore = await owner.from("tasks").select("planned_date,status,estimated_minutes").eq("id", mathTaskId).single();
    const proposalId = await createProposal("substitution", {
      sourceTaskId: geographyTaskId,
      replacementSessionId: extraSessionId,
      sourceMinutes: 40,
      replacementTitle: "Turkish instead of Geography",
      reason: "user_replacement",
      initiatedBy: "user",
    });
    const first = await owner.rpc("apply_confirmed_action_proposal", { p_proposal_id: proposalId });
    expect(first.error).toBeNull();
    expect(first.data.actionKind).toBe("substitution");
    expect(first.data.sourceMinutesRelieved).toBe(40);
    const second = await owner.rpc("apply_confirmed_action_proposal", { p_proposal_id: proposalId });
    expect(second.error).toBeNull();
    expect(second.data.idempotent).toBe(true);
    const geography = await owner.from("tasks").select("estimated_minutes,status").eq("id", geographyTaskId).single();
    expect(geography.data).toEqual({ estimated_minutes: 20, status: "ready" });
    expect((await owner.from("tasks").select("planned_date,status,estimated_minutes").eq("id", mathTaskId).single()).data).toEqual(mathBefore.data);
    expect((await owner.from("study_substitutions").select("id", { count: "exact", head: true }).eq("proposal_id", proposalId)).count).toBe(1);
  });

  it("rejects a stale substitution and creates no relief", async () => {
    const extra = await owner.rpc("record_retroactive_session", { p_payload: {
      examProfileId: profileId,
      subjectId: MATH,
      durationMinutes: 10,
      endedAt: "2026-08-22T11:10:00Z",
      accountingIntent: "extra",
      idempotencyKey: `pln002-stale-extra-${randomUUID()}`,
    } });
    expect(extra.error).toBeNull();
    const proposalId = await createProposal("substitution", {
      sourceTaskId: mathTaskId,
      replacementSessionId: extra.data.id,
      sourceMinutes: 10,
      replacementTitle: "Stale replacement",
      reason: "user_replacement",
      initiatedBy: "user",
    });
    await owner.from("tasks").update({ title: "Math planned changed" }).eq("id", mathTaskId);
    const applied = await owner.rpc("apply_confirmed_action_proposal", { p_proposal_id: proposalId });
    expect(applied.error?.message).toContain("ACTION_PROPOSAL_STALE");
  });

  it("carries the same task identity forward once and preserves an audit record", async () => {
    const proposalId = await createProposal("carryover", {
      taskId: mathTaskId,
      fromDate: TODAY,
      toDate: TOMORROW,
      remainingMinutes: 60,
      reason: "user_could_not_finish",
      initiatedBy: "user",
    });
    const [first, concurrent] = await Promise.all([
      owner.rpc("apply_confirmed_action_proposal", { p_proposal_id: proposalId }),
      owner.rpc("apply_confirmed_action_proposal", { p_proposal_id: proposalId }),
    ]);
    expect(first.error).toBeNull();
    expect(concurrent.error).toBeNull();
    expect((await owner.from("tasks").select("id,planned_date").eq("id", mathTaskId).single()).data).toEqual({ id: mathTaskId, planned_date: TOMORROW });
    const rows = await owner.from("task_carryovers").select("source_task_id,to_date,status").eq("proposal_id", proposalId);
    expect(rows.data).toEqual([{ source_task_id: mathTaskId, to_date: TOMORROW, status: "applied" }]);
  });
});
