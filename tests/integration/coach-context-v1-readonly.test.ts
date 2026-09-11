import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { loadCoachContextV1ReadOnly } from "../../supabase/functions/_shared/coach-context-v1-readonly.ts";
import {
  COACH_EVIDENCE_DETAIL_REQUEST_V1_VERSION,
  projectCoachEvidenceViewV1,
  resolveCoachEvidenceDetailV1,
} from "../../packages/domain/src/ai-coach/index.ts";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
if (!url || !anonKey) throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required.");

const EDITION = "11000000-0000-0000-0000-000000000001";
const SUBJECT = "20000000-0000-0000-0000-000000000002";
const TOPIC = "30000000-0000-0000-0000-000000000001";
const NOW = new Date("2026-09-10T09:00:00.000Z");
const MUTATION_GUARD_TABLES = [
  "weekly_plans",
  "tasks",
  "task_progress",
  "study_sessions",
  "study_session_allocations",
  "study_substitutions",
  "task_carryovers",
  "confirmed_action_proposals",
  "weekly_availability",
  "calendar_periods",
  "schedule_exceptions",
  "p48_daily_capacity_overrides",
  "resources",
] as const;

function client() {
  return createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

async function register(api: SupabaseClient): Promise<User> {
  const suffix = randomUUID();
  const result = await api.auth.signUp({ email: `coach-context-${suffix}@example.test`, password: `Safe-${suffix}` });
  expect(result.error).toBeNull();
  return result.data.user!;
}

async function snapshotMutableRowCounts(api: SupabaseClient, userId: string) {
  const entries = await Promise.all(MUTATION_GUARD_TABLES.map(async (table) => {
    const result = await api.from(table).select("*", { count: "exact", head: true }).eq("user_id", userId);
    expect(result.error, `count ${table}`).toBeNull();
    return [table, result.count ?? 0] as const;
  }));
  return Object.fromEntries(entries) as Record<(typeof MUTATION_GUARD_TABLES)[number], number>;
}

function absoluteRowDelta(before: Record<string, number>, after: Record<string, number>) {
  return Object.keys(before).reduce((total, table) => total + Math.abs(after[table] - before[table]), 0);
}

describe("CoachContextV1 local database read adapter", () => {
  const actor = client();
  let user: User;
  let profileId: string;
  let planId: string;

  beforeAll(async () => {
    user = await register(actor);
    expect((await actor.from("user_profiles").update({ display_name: "Context Test", timezone: "Europe/Istanbul" }).eq("id", user.id)).error).toBeNull();
    const profile = await actor.from("exam_profiles").insert({ user_id: user.id, exam_edition_id: EDITION, preparation_start_date: "2026-09-01", target_exam_date: "2027-08-01", status: "active" }).select("id").single();
    expect(profile.error).toBeNull();
    profileId = profile.data!.id;
    expect((await actor.from("user_subjects").insert({ user_id: user.id, exam_profile_id: profileId, subject_id: SUBJECT, status: "active" })).error).toBeNull();
    expect((await actor.from("weekly_availability").insert({ user_id: user.id, exam_profile_id: profileId, weekday: 4, start_time: "09:00", end_time: "11:00", is_active: true })).error).toBeNull();
    const plan = await actor.from("weekly_plans").insert({ user_id: user.id, exam_profile_id: profileId, week_start_date: "2026-09-07", week_end_date: "2026-09-13", available_minutes: 120, planning_budget_minutes: 105, planned_minutes: 60, status: "active", generation_version: 1 }).select("id").single();
    expect(plan.error).toBeNull();
    planId = plan.data!.id;
    const tasks = await actor.from("tasks").insert([
      { user_id: user.id, exam_profile_id: profileId, weekly_plan_id: planId, subject_id: SUBJECT, curriculum_node_id: TOPIC, task_type: "learn_topic", title: "Bugün", planned_date: "2026-09-10", estimated_minutes: 30, importance: "core", priority_score: 90, status: "ready", source_reason: "manual", dedupe_key: `coach-context-today-${randomUUID()}` },
      { user_id: user.id, exam_profile_id: profileId, weekly_plan_id: planId, subject_id: SUBJECT, curriculum_node_id: TOPIC, task_type: "learn_topic", title: "Yarın", planned_date: "2026-09-11", estimated_minutes: 30, importance: "important", priority_score: 80, status: "ready", source_reason: "manual", dedupe_key: `coach-context-future-${randomUUID()}` },
    ]).select("id");
    expect(tasks.error).toBeNull();
    expect((await actor.from("task_progress").insert(tasks.data!.map((task) => ({ task_id: task.id, user_id: user.id, completed_minutes: 0 })))).error).toBeNull();
  });

  it("reads real local rows deterministically and leaves task/proposal state unchanged", async () => {
    const beforeCounts = await snapshotMutableRowCounts(actor, user.id);
    const beforeTasks = await actor.from("tasks").select("id,status,planned_date,estimated_minutes").eq("user_id", user.id).eq("weekly_plan_id", planId).order("id");
    const beforeProposals = await actor.from("confirmed_action_proposals").select("id,status").eq("user_id", user.id).eq("weekly_plan_id", planId).order("id");
    expect(beforeTasks.error).toBeNull();
    expect(beforeProposals.error).toBeNull();

    const first = await loadCoachContextV1ReadOnly({ client: actor, userId: user.id, requestId: "integration-context", now: NOW });
    const second = await loadCoachContextV1ReadOnly({ client: actor, userId: user.id, requestId: "integration-context", now: NOW });
    const firstView = projectCoachEvidenceViewV1(first, {
      scope: "week_progress",
      capability: "progress_analysis",
    });
    const secondView = projectCoachEvidenceViewV1(second, {
      scope: "week_progress",
      capability: "progress_analysis",
    });
    const firstDetail = resolveCoachEvidenceDetailV1(first, {
      version: COACH_EVIDENCE_DETAIL_REQUEST_V1_VERSION,
      kind: "week_tasks",
      userId: user.id,
      examProfileId: profileId,
    });
    const secondDetail = resolveCoachEvidenceDetailV1(second, {
      version: COACH_EVIDENCE_DETAIL_REQUEST_V1_VERSION,
      kind: "week_tasks",
      userId: user.id,
      examProfileId: profileId,
    });
    expect(() => resolveCoachEvidenceDetailV1(first, {
      version: COACH_EVIDENCE_DETAIL_REQUEST_V1_VERSION,
      kind: "week_tasks",
      userId: randomUUID(),
      examProfileId: profileId,
    })).toThrow("COACH_EVIDENCE_DETAIL_USER_SCOPE_MISMATCH");
    expect(() => resolveCoachEvidenceDetailV1(first, {
      version: COACH_EVIDENCE_DETAIL_REQUEST_V1_VERSION,
      kind: "week_tasks",
      userId: user.id,
      examProfileId: randomUUID(),
    })).toThrow("COACH_EVIDENCE_DETAIL_PROFILE_SCOPE_MISMATCH");

    const afterTasks = await actor.from("tasks").select("id,status,planned_date,estimated_minutes").eq("user_id", user.id).eq("weekly_plan_id", planId).order("id");
    const afterProposals = await actor.from("confirmed_action_proposals").select("id,status").eq("user_id", user.id).eq("weekly_plan_id", planId).order("id");
    const afterCounts = await snapshotMutableRowCounts(actor, user.id);
    expect(afterTasks.error).toBeNull();
    expect(afterProposals.error).toBeNull();

    const mutationDelta = absoluteRowDelta(beforeCounts, afterCounts);
    const plannerLifecycleDelta = Math.abs(
      afterCounts.confirmed_action_proposals - beforeCounts.confirmed_action_proposals,
    );
    expect(second).toEqual(first);
    expect(secondView).toEqual(firstView);
    expect(secondDetail).toEqual(firstDetail);
    expect(afterCounts).toEqual(beforeCounts);
    expect(mutationDelta).toBe(0);
    expect(plannerLifecycleDelta).toBe(0);
    expect(afterTasks.data).toEqual(beforeTasks.data);
    expect(afterProposals.data).toEqual(beforeProposals.data);
    expect(first.today.value?.tasks).toHaveLength(1);
    expect(first.week.value?.tasks).toHaveLength(2);
    expect(first.nextWork).toMatchObject({ availability: "unknown", unknownReason: "canonical_selector_unavailable" });
    expect(first.week.value?.progressPosition).toMatchObject({ availability: "blocked", value: null, unknownReason: "pln002_completeness_unresolved" });
    expect(first.week.value?.studyIntentCoverage).toBe("partial");
    expect(first.capacity.value?.days.every((day) => day.protectedMinutes.availability === "unknown" && day.availableMinutes.availability === "unknown")).toBe(true);
    expect(first.planner.availability).toBe("not_applicable");
    expect(first.signalInputs).toMatchObject({ availability: "unknown", unknownReason: "deterministic_signal_registry_unavailable" });
    expect(first.authority).toMatchObject({ dbWritesAllowed: false, plannerConfirmationAllowed: false, plannerApplyAllowed: false });
    console.info(`COACH_CONTEXT_V1_REAL_DB_MUTATION_DELTA=${mutationDelta}`);
    console.info(`COACH_CONTEXT_V1_REAL_DB_PLANNER_LIFECYCLE_DELTA=${plannerLifecycleDelta}`);
  });
});
