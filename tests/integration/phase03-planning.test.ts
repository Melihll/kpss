import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import {
  buildWeeklyPlanV0,
  getNextBestTask,
  type RecommendationTask,
  type WeeklyPlanningContext,
} from "@kpss-coach/domain";
import { beforeAll, describe, expect, it } from "vitest";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
if (!url || !anonKey) throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required.");

const EDITION_ID = "11000000-0000-0000-0000-000000000001";
const MATH_ID = "20000000-0000-0000-0000-000000000002";
const HISTORY_ID = "20000000-0000-0000-0000-000000000003";
const MATH_TOPIC_ID = "30000000-0000-0000-0000-000000000001";
const HISTORY_TOPIC_ID = "30000000-0000-0000-0000-000000000101";
const WEEK_START = "2026-08-03";

function client(): SupabaseClient {
  return createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function register(api: SupabaseClient, label: string): Promise<User> {
  const unique = randomUUID();
  const { data, error } = await api.auth.signUp({
    email: `phase03-${unique}@example.test`, password: `Safe-${unique}`,
    options: { data: { display_name: label } },
  });
  expect(error).toBeNull();
  return data.user!;
}

describe("Phase 03 weekly plan, task lifecycle and RLS", () => {
  const userAClient = client();
  const userBClient = client();
  let userA: User;
  let userB: User;
  let profileAId: string;
  let profileBId: string;
  let resourceId: string;
  let sectionId: string;
  let unitIds: string[] = [];
  let planDraft: ReturnType<typeof buildWeeklyPlanV0>;
  let planId: string;
  let learnTaskId: string;
  let historyLearnTaskId: string;
  let solveTaskId: string;

  beforeAll(async () => {
    userA = await register(userAClient, "Planning User A");
    userB = await register(userBClient, "Planning User B");

    const [profileA, profileB] = await Promise.all([
      userAClient.from("exam_profiles").insert({
        user_id: userA.id, exam_edition_id: EDITION_ID,
        preparation_start_date: "2026-08-01", status: "active",
      }).select("id").single(),
      userBClient.from("exam_profiles").insert({
        user_id: userB.id, exam_edition_id: EDITION_ID,
        preparation_start_date: "2026-08-01", status: "active",
      }).select("id").single(),
    ]);
    expect(profileA.error).toBeNull();
    expect(profileB.error).toBeNull();
    profileAId = profileA.data!.id;
    profileBId = profileB.data!.id;

    const subjectResult = await userAClient.from("user_subjects").insert([
      { user_id: userA.id, exam_profile_id: profileAId, subject_id: MATH_ID, status: "active" },
      { user_id: userA.id, exam_profile_id: profileAId, subject_id: HISTORY_ID, status: "active" },
    ]);
    expect(subjectResult.error).toBeNull();
    for (const subjectId of [MATH_ID, HISTORY_ID]) {
      const initialized = await userAClient.rpc("initialize_subject_progress", {
        p_exam_profile_id: profileAId, p_subject_id: subjectId,
      });
      expect(initialized.error).toBeNull();
    }
    const availabilityResult = await userAClient.from("weekly_availability").insert(
      Array.from({ length: 5 }, (_, index) => ({
        user_id: userA.id, exam_profile_id: profileAId, weekday: index + 1,
        start_time: "14:00", end_time: "20:00", label: `Day ${index + 1}`,
      })),
    );
    expect(availabilityResult.error).toBeNull();
    const resourceResult = await userAClient.from("resources").insert({
      user_id: userA.id, exam_profile_id: profileAId, subject_id: MATH_ID,
      name: "Primary Matematik", resource_type: "question_bank", resource_role: "primary",
      difficulty: "normal", status: "active",
    }).select("id").single();
    expect(resourceResult.error).toBeNull();
    resourceId = resourceResult.data!.id;
    const sectionResult = await userAClient.from("resource_sections").insert({
      resource_id: resourceId, curriculum_node_id: MATH_TOPIC_ID,
      name: "Temel Kavramlar", sort_order: 1,
    }).select("id").single();
    expect(sectionResult.error).toBeNull();
    sectionId = sectionResult.data!.id;
    const unitsResult = await userAClient.from("resource_units").insert([
      { resource_id: resourceId, resource_section_id: sectionId, unit_type: "test", name: "Test 1", sort_order: 1, estimated_minutes: 30 },
      { resource_id: resourceId, resource_section_id: sectionId, unit_type: "test", name: "Test 2", sort_order: 2, estimated_minutes: 30 },
    ]).select("id").order("id");
    expect(unitsResult.error).toBeNull();
    unitIds = unitsResult.data!.map((unit) => unit.id);

    const context: WeeklyPlanningContext = {
      examProfileId: profileAId,
      weekStartDate: WEEK_START,
      subjects: [
        { id: MATH_ID, name: "Matematik", status: "active", sortOrder: 1 },
        { id: HISTORY_ID, name: "Tarih", status: "active", sortOrder: 2 },
      ],
      curriculum: [
        { id: MATH_TOPIC_ID, subjectId: MATH_ID, parentId: null, nodeType: "topic", name: "Temel Kavramlar", sortOrder: 1, isActive: true },
        { id: HISTORY_TOPIC_ID, subjectId: HISTORY_ID, parentId: null, nodeType: "topic", name: "İslamiyet Öncesi Türk Tarihi", sortOrder: 1, isActive: true },
      ],
      topicProgress: [
        { curriculumNodeId: MATH_TOPIC_ID, state: "not_started" },
        { curriculumNodeId: HISTORY_TOPIC_ID, state: "not_started" },
      ],
      weeklyAvailability: Array.from({ length: 5 }, (_, index) => ({
        weekday: index + 1, start_time: "14:00", end_time: "20:00",
      })),
      resources: [{ id: resourceId, subjectId: MATH_ID, name: "Primary Matematik", role: "primary", difficulty: "normal", status: "active" }],
      resourceSections: [{ id: sectionId, resourceId, curriculumNodeId: MATH_TOPIC_ID, name: "Temel Kavramlar", sortOrder: 1 }],
      resourceUnits: unitIds.map((id, index) => ({
        id, resourceId, sectionId, name: `Test ${index + 1}`, unitType: "test", sortOrder: index + 1, estimatedMinutes: 30,
      })),
      resourceUnitProgress: [],
      existingCarryoverTasks: [],
    };
    planDraft = buildWeeklyPlanV0(context);
  });

  it("builds and atomically persists User A's weekly plan", async () => {
    const result = await userAClient.rpc("persist_weekly_plan", { p_plan: planDraft });
    expect(result.error).toBeNull();
    expect(result.data.created).toBe(true);
    planId = result.data.weekly_plan_id;
    const { data: tasks, error } = await userAClient.from("tasks").select("id, task_type, subject_id").eq("weekly_plan_id", planId);
    expect(error).toBeNull();
    expect(tasks).toHaveLength(3);
    expect(tasks?.every((task) => task.subject_id === MATH_ID || task.subject_id === HISTORY_ID)).toBe(true);
    learnTaskId = tasks!.find((task) => task.task_type === "learn_topic" && task.subject_id === MATH_ID)!.id;
    historyLearnTaskId = tasks!.find((task) => task.task_type === "learn_topic" && task.subject_id === HISTORY_ID)!.id;
    solveTaskId = tasks!.find((task) => task.task_type === "solve_resource_units")!.id;
  });

  it("uses the exact 85 percent planning budget", async () => {
    const { data, error } = await userAClient.from("weekly_plans").select("*").eq("id", planId).single();
    expect(error).toBeNull();
    expect(data.available_minutes).toBe(1800);
    expect(data.planning_budget_minutes).toBe(1530);
    expect(data.planned_minutes).toBe(180);
  });

  it("returns the existing active plan on a repeated build without duplicate tasks", async () => {
    const second = await userAClient.rpc("persist_weekly_plan", { p_plan: planDraft });
    expect(second.error).toBeNull();
    expect(second.data).toEqual({ weekly_plan_id: planId, created: false });
    const { count } = await userAClient.from("tasks").select("id", { count: "exact", head: true }).eq("weekly_plan_id", planId);
    expect(count).toBe(3);
  });

  it("hides User A's plan and tasks from User B", async () => {
    const [plans, tasks] = await Promise.all([
      userBClient.from("weekly_plans").select("id").eq("id", planId),
      userBClient.from("tasks").select("id").eq("weekly_plan_id", planId),
    ]);
    expect(plans.error).toBeNull();
    expect(plans.data).toEqual([]);
    expect(tasks.error).toBeNull();
    expect(tasks.data).toEqual([]);
  });

  it("prevents User B from starting, progressing or completing User A's task/unit", async () => {
    const [start, progress, completeUnit] = await Promise.all([
      userBClient.rpc("start_task", { p_task_id: learnTaskId }),
      userBClient.rpc("update_task_progress", { p_task_id: learnTaskId, p_completed_minutes: 10 }),
      userBClient.rpc("complete_task_unit", { p_task_id: solveTaskId, p_resource_unit_id: unitIds[0] }),
    ]);
    expect(start.error).not.toBeNull();
    expect(progress.error).not.toBeNull();
    expect(completeUnit.error).not.toBeNull();
  });

  it("moves a 2-unit task through partial and completed states idempotently", async () => {
    const first = await userAClient.rpc("complete_task_unit", {
      p_task_id: solveTaskId, p_resource_unit_id: unitIds[0],
    });
    expect(first.error).toBeNull();
    expect(first.data.status).toBe("partially_completed");
    const repeated = await userAClient.rpc("complete_task_unit", {
      p_task_id: solveTaskId, p_resource_unit_id: unitIds[0],
    });
    expect(repeated.error).toBeNull();
    expect(repeated.data.changed).toBe(false);
    const second = await userAClient.rpc("complete_task_unit", {
      p_task_id: solveTaskId, p_resource_unit_id: unitIds[1],
    });
    expect(second.error).toBeNull();
    expect(second.data.status).toBe("completed");
  });

  it("synchronizes completed task units into resource_unit_progress", async () => {
    const { data, error } = await userAClient.from("resource_unit_progress")
      .select("resource_unit_id, status, attempt_count").in("resource_unit_id", unitIds).order("resource_unit_id");
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
    expect(data?.every((progress) => progress.status === "completed" && progress.attempt_count === 1)).toBe(true);
  });

  it("moves learn topic from not_started to learning on start", async () => {
    const start = await userAClient.rpc("start_task", { p_task_id: learnTaskId });
    expect(start.error).toBeNull();
    expect(start.data.status).toBe("in_progress");
    const { data } = await userAClient.from("topic_progress").select("state")
      .eq("exam_profile_id", profileAId).eq("curriculum_node_id", MATH_TOPIC_ID).single();
    expect(data?.state).toBe("learning");
  });

  it("moves learn topic to practicing on explicit completion", async () => {
    const completion = await userAClient.rpc("complete_task", { p_task_id: learnTaskId });
    expect(completion.error).toBeNull();
    expect(completion.data.status).toBe("completed");
    const { data } = await userAClient.from("topic_progress").select("state")
      .eq("exam_profile_id", profileAId).eq("curriculum_node_id", MATH_TOPIC_ID).single();
    expect(data?.state).toBe("practicing");
  });

  it("recommends only a visible User A task and never a User B task", async () => {
    const { data: tasks, error } = await userAClient.from("tasks")
      .select("id, status, importance, priority_score, planned_date, estimated_minutes, created_at, task_progress(completed_minutes)")
      .eq("weekly_plan_id", planId);
    expect(error).toBeNull();
    const recommendation = getNextBestTask((tasks ?? []).map((task: any): RecommendationTask => ({
      id: task.id, status: task.status, importance: task.importance, priorityScore: task.priority_score,
      plannedDate: task.planned_date, estimatedMinutes: task.estimated_minutes,
      completedMinutes: task.task_progress?.[0]?.completed_minutes ?? 0, createdAt: task.created_at,
    })), { today: WEEK_START, availableMinutes: 360 });
    expect(tasks?.some((task) => task.id === recommendation.recommendedTask.id)).toBe(true);

    const { data: userBTasks } = await userBClient.from("tasks").select("id").eq("weekly_plan_id", planId);
    expect(userBTasks).toEqual([]);
    expect(recommendation.recommendedTask.id).not.toBe(profileBId);
  });

  it("supports minute-based partial progress for a learn task", async () => {
    const start = await userAClient.rpc("start_task", { p_task_id: historyLearnTaskId });
    expect(start.error).toBeNull();
    const progress = await userAClient.rpc("update_task_progress", {
      p_task_id: historyLearnTaskId, p_completed_minutes: 30,
    });
    expect(progress.error).toBeNull();
    expect(progress.data.status).toBe("partially_completed");
  });

  it("completes a learn topic by minutes without regressing its lifecycle", async () => {
    const progress = await userAClient.rpc("update_task_progress", {
      p_task_id: historyLearnTaskId, p_completed_minutes: 60,
    });
    expect(progress.error).toBeNull();
    expect(progress.data.status).toBe("completed");
    const { data } = await userAClient.from("topic_progress").select("state")
      .eq("exam_profile_id", profileAId).eq("curriculum_node_id", HISTORY_TOPIC_ID).single();
    expect(data?.state).toBe("practicing");
  });
});
