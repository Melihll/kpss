import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceRoleKey) throw new Error("Local Supabase env required");

const EDITION = "11000000-0000-0000-0000-000000000001";
const SUBJECT = "20000000-0000-0000-0000-000000000002";
const WEEK_START = "2026-08-17";
const WEEK_END = "2026-08-23";
const TARGET_DATE = "2026-08-22";

function client(key = anonKey): SupabaseClient {
  return createClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function register(api: SupabaseClient, label: string): Promise<User> {
  const suffix = randomUUID();
  const result = await api.auth.signUp({
    email: `r2-${label}-${suffix}@example.test`,
    password: `Safe-${suffix}`,
  });
  expect(result.error).toBeNull();
  return result.data.user!;
}

describe("R2 confirmed action RPC integration", () => {
  const owner = client();
  const other = client();
  const admin = client(serviceRoleKey);
  let ownerUser: User;
  let profileId: string;
  let planId: string;
  let quickProposalId: string;

  async function plan() {
    const result = await owner.from("weekly_plans")
      .select("*").eq("id", planId).single();
    expect(result.error).toBeNull();
    return result.data!;
  }

  async function createProposal(input: {
    kind: "quick_task" | "capacity_change";
    mutation: Record<string, unknown>;
    display?: Record<string, unknown>;
  }) {
    const current = await plan();
    const result = await admin.rpc("create_confirmed_action_proposal", {
      p_user_id: ownerUser.id,
      p_exam_profile_id: profileId,
      p_weekly_plan_id: planId,
      p_action_kind: input.kind,
      p_plan_generation_version: current.generation_version,
      p_mutation_payload: input.mutation,
      p_display_payload: input.display ?? {},
      p_idempotency_key: `r2:${input.kind}:${randomUUID()}`,
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
    expect((await owner.from("user_subjects").insert({
      user_id: ownerUser.id,
      exam_profile_id: profileId,
      subject_id: SUBJECT,
      status: "active",
    })).error).toBeNull();
    const weeklyPlan = await owner.from("weekly_plans").insert({
      user_id: ownerUser.id,
      exam_profile_id: profileId,
      week_start_date: WEEK_START,
      week_end_date: WEEK_END,
      available_minutes: 600,
      planning_budget_minutes: 510,
      planned_minutes: 0,
      status: "active",
      generation_version: 1,
    }).select("id").single();
    expect(weeklyPlan.error).toBeNull();
    planId = weeklyPlan.data!.id;
  });

  it("proposal creation and cancellation-by-dismissal create zero task rows", async () => {
    quickProposalId = await createProposal({
      kind: "quick_task",
      mutation: {
        candidate: {
          subjectId: SUBJECT,
          title: "R2 güvenli hızlı görev",
          plannedDate: TARGET_DATE,
          estimatedMinutes: 30,
        },
        capacity: { fits: true, remainingMinutes: 120 },
        taskDedupeKey: "r2-quick-task-once",
      },
    });
    const count = await owner.from("tasks").select("id", { count: "exact", head: true })
      .eq("weekly_plan_id", planId);
    expect(count.count).toBe(0);
  });

  it("rejects the same proposal for another authenticated user", async () => {
    const result = await other.rpc("apply_confirmed_action_proposal", {
      p_proposal_id: quickProposalId,
    });
    expect(result.error?.message).toContain("ACTION_PROPOSAL_NOT_FOUND");
  });

  it("applies exactly one quick task and makes repeat apply idempotent", async () => {
    const first = await owner.rpc("apply_confirmed_action_proposal", {
      p_proposal_id: quickProposalId,
    });
    expect(first.error).toBeNull();
    expect(first.data.created).toBe(true);
    const second = await owner.rpc("apply_confirmed_action_proposal", {
      p_proposal_id: quickProposalId,
    });
    expect(second.error).toBeNull();
    expect(second.data.idempotent).toBe(true);
    const rows = await owner.from("tasks").select("id,title")
      .eq("weekly_plan_id", planId).eq("dedupe_key", "r2-quick-task-once");
    expect(rows.data).toHaveLength(1);
  });

  it("rejects a proposal when task/progress snapshot state changes", async () => {
    const proposalId = await createProposal({
      kind: "quick_task",
      mutation: {
        candidate: {
          subjectId: SUBJECT,
          title: "Stale fingerprint",
          plannedDate: TARGET_DATE,
          estimatedMinutes: 15,
        },
        capacity: { fits: true, remainingMinutes: 90 },
        taskDedupeKey: "r2-stale-fingerprint",
      },
    });
    const task = await owner.from("tasks").select("id,title").eq("dedupe_key", "r2-quick-task-once").single();
    await owner.from("tasks").update({ title: `${task.data!.title} güncel` }).eq("id", task.data!.id);
    const applied = await owner.rpc("apply_confirmed_action_proposal", { p_proposal_id: proposalId });
    expect(applied.error?.message).toContain("ACTION_PROPOSAL_STALE");
  });

  it("rejects a proposal after weekly plan generation changes", async () => {
    const proposalId = await createProposal({
      kind: "quick_task",
      mutation: {
        candidate: {
          subjectId: SUBJECT,
          title: "Stale generation",
          plannedDate: TARGET_DATE,
          estimatedMinutes: 15,
        },
        capacity: { fits: true, remainingMinutes: 90 },
        taskDedupeKey: "r2-stale-generation",
      },
    });
    const current = await plan();
    await owner.from("weekly_plans").update({ generation_version: current.generation_version + 1 }).eq("id", planId);
    const applied = await owner.rpc("apply_confirmed_action_proposal", { p_proposal_id: proposalId });
    expect(applied.error?.message).toContain("ACTION_PROPOSAL_STALE");
  });

  it("applies one confirmed capacity event and revision transactionally", async () => {
    const current = await plan();
    const proposalId = await createProposal({
      kind: "capacity_change",
      mutation: {
        scheduleException: {
          date: TARGET_DATE,
          type: "extra_available",
          minutesDelta: 30,
          note: "R2 integration",
          dedupeKey: "r2-capacity-once",
        },
        planRevisionPayload: {
          weeklyPlanId: planId,
          revisionType: "automatic_informed",
          reasonCode: "capacity_change",
          afterPlannedMinutes: current.planned_minutes,
          changedTaskCount: 0,
          explanation: "Confirmed R2 capacity change.",
          dedupeKey: "r2-capacity-revision-once",
          availableMinutes: current.available_minutes + 30,
          planningBudgetMinutes: current.planning_budget_minutes + 30,
          tasksToBacklog: [], tasksToMove: [], tasksToCancel: [], tasksToCreate: [],
          backlog: {
            openTaskCount: 1, openCoreCount: 0, openImportantCount: 1,
            openOptionalCount: 0, estimatedRemainingMinutes: 30,
            remainingCapacityMinutes: 510, capacityRatio: 0.06, severity: "normal",
          },
          risks: [],
        },
      },
      display: {
        changes: [],
        capacityEvent: { effectiveDate: TARGET_DATE, deltaMinutes: 30 },
      },
    });
    const first = await owner.rpc("apply_confirmed_action_proposal", { p_proposal_id: proposalId });
    expect(first.error).toBeNull();
    expect(first.data.capacityEvent).toEqual({ effectiveDate: TARGET_DATE, deltaMinutes: 30 });
    const second = await owner.rpc("apply_confirmed_action_proposal", { p_proposal_id: proposalId });
    expect(second.error).toBeNull();
    expect(second.data.idempotent).toBe(true);
    const exceptions = await owner.from("schedule_exceptions").select("id")
      .eq("confirmation_dedupe_key", "r2-capacity-once");
    expect(exceptions.data).toHaveLength(1);
    const revisions = await owner.from("plan_revisions").select("id")
      .eq("dedupe_key", "r2-capacity-revision-once");
    expect(revisions.data).toHaveLength(1);
  });
});
