import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { loadCoachContextV1ReadOnly } from "../../supabase/functions/_shared/coach-context-v1-readonly.ts";
import {
  COACH_EVIDENCE_DETAIL_REQUEST_V1_VERSION,
  projectCoachEvidenceViewV1,
  resolveCoachEvidenceDetailV1,
} from "../../packages/domain/src/ai-coach/index.ts";
import type { AiFxSnapshotV1, AiPricingCatalogV1, AiRouteCatalogV1 } from "../../packages/domain/src/ai-coach/ai-economics-v1.ts";
import {
  AI_OPENAI_PRICING_CATALOG_V1,
  AI_OPENAI_ROUTE_CATALOG_V1,
} from "../../supabase/functions/_shared/ai-coach/provider-runtime-catalog-v1.ts";
import { runReadOnlyCoachCapabilityV1 } from "../../supabase/functions/_shared/ai-coach/read-only-coach-orchestrator-v1.ts";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceRoleKey) throw new Error("Local Supabase credentials are required.");
if (!["127.0.0.1", "localhost", "::1"].includes(new URL(url).hostname)) throw new Error("COACH_ORCHESTRATOR_INTEGRATION_REQUIRES_LOOPBACK_SUPABASE");

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
  "planning_v2_proposals",
  "weekly_availability",
  "calendar_periods",
  "schedule_exceptions",
  "p48_daily_capacity_overrides",
  "resources",
] as const;

function client() {
  return createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

function serviceClient() {
  return createClient(url!, serviceRoleKey!, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

const LOCAL_ROUTES: AiRouteCatalogV1 = {
  ...AI_OPENAI_ROUTE_CATALOG_V1,
  version: "openai-local-orchestrator-routes-v1",
  pricingVersion: "openai-local-orchestrator-pricing-v1",
  environment: "test_fixture",
};
const LOCAL_PRICING: AiPricingCatalogV1 = {
  ...AI_OPENAI_PRICING_CATALOG_V1,
  version: "openai-local-orchestrator-pricing-v1",
  environment: "test_fixture",
  entries: AI_OPENAI_PRICING_CATALOG_V1.entries.map((entry) => ({
    ...entry,
    sourceKind: "test_fixture" as const,
    effectiveFrom: "2026-09-01T00:00:00.000Z",
  })),
};
const LOCAL_FX: AiFxSnapshotV1 = {
  policyVersion: "ai-fx-policy-v1",
  snapshotVersion: "fx-local-orchestrator-v1",
  source: "test-fixture-only",
  sourceKind: "test_fixture",
  baseCurrency: "USD",
  quoteCurrency: "TRY",
  rate: 40,
  effectiveAt: "2026-09-10T08:30:00.000Z",
  loadedAt: "2026-09-10T08:31:00.000Z",
  maxAgeSeconds: 86_400,
};

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

  it("runs the read-only Coach pipeline against real local data with only accounting writes", async () => {
    const service = serviceClient();
    const beforeCounts = await snapshotMutableRowCounts(actor, user.id);
    const reservationId = randomUUID();
    const providerAttemptId = randomUUID();
    let countCalls = 0;
    let providerCalls = 0;

    const result = await runReadOnlyCoachCapabilityV1({
      contextClient: actor,
      serviceClient: service,
      userId: user.id,
      examProfileId: profileId,
      capability: "today_analysis",
      requestId: randomUUID(),
      correlationId: randomUUID(),
      reservationId,
      providerAttemptId,
      requestedAt: NOW.toISOString(),
      reservationExpiresAt: "2026-09-10T09:10:00.000Z",
      runtimeEnvironment: "test",
      routingBudgetState: "normal",
      routeCatalog: LOCAL_ROUTES,
      pricingCatalog: LOCAL_PRICING,
      fxSnapshot: LOCAL_FX,
      dependencies: {
        inputCountTransport: {
          count: async ({ fingerprint }) => {
            countCalls += 1;
            return {
              object: "response.input_tokens",
              inputTokens: 1_000,
              countedAt: NOW.toISOString(),
              requestFingerprint: fingerprint.value,
              modelId: fingerprint.modelId,
              providerRequestId: "local-count-fixture",
            };
          },
        },
        generationTransport: {
          execute: async ({ fingerprint }) => {
            providerCalls += 1;
            return {
              outcome: "known",
              requestFingerprint: fingerprint.value,
              modelId: fingerprint.modelId,
              payload: {
                id: "local-response-fixture",
                status: "completed",
                output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({
                  answer: "Bugünkü çalışma durumu sağlanan kanıta göre özetlendi.",
                  sourceFactPaths: ["evidence.today"],
                  acknowledgedUnknowns: [],
                  staleOrBlockedWarnings: [],
                }) }] }],
                usage: {
                  input_tokens: 1_000,
                  input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
                  output_tokens: 100,
                  output_tokens_details: { reasoning_tokens: 0 },
                  total_tokens: 1_100,
                },
              },
              headers: null,
              httpStatus: 200,
              startedAt: "2026-09-10T09:00:01.000Z",
              completedAt: "2026-09-10T09:00:02.000Z",
            };
          },
        },
      },
    });

    const afterCounts = await snapshotMutableRowCounts(actor, user.id);
    const reservation = await service.from("ai_budget_reservations").select("status,provider_attempt_id,actual_try_amount").eq("reservation_id", reservationId).single();
    const reservationEvents = await service.from("ai_budget_reservation_events").select("id", { count: "exact", head: true }).eq("reservation_id", reservationId);
    const ledger = await service.from("ai_usage_events").select("provider_attempt_id,user_id,exam_profile_id").eq("provider_attempt_id", providerAttemptId).single();
    expect(reservation.error).toBeNull();
    expect(reservationEvents.error).toBeNull();
    expect(ledger.error).toBeNull();
    expect(afterCounts).toEqual(beforeCounts);
    expect(absoluteRowDelta(beforeCounts, afterCounts)).toBe(0);
    expect(afterCounts.confirmed_action_proposals - beforeCounts.confirmed_action_proposals).toBe(0);
    expect(afterCounts.planning_v2_proposals - beforeCounts.planning_v2_proposals).toBe(0);
    expect(reservation.data).toMatchObject({ status: "settled", provider_attempt_id: providerAttemptId });
    expect(reservationEvents.count).toBe(3);
    expect(ledger.data).toMatchObject({ provider_attempt_id: providerAttemptId, user_id: user.id, exam_profile_id: profileId });
    expect(result).toMatchObject({ noMutationPerformed: true, accounting: { reservationStatus: "settled", usageEventRecorded: true } });
    expect(countCalls).toBe(1);
    expect(providerCalls).toBe(1);
    console.info("READ_ONLY_COACH_REAL_DB_DOMAIN_MUTATION_DELTA=0");
    console.info("READ_ONLY_COACH_REAL_DB_PLANNER_LIFECYCLE_DELTA=0");
    console.info("READ_ONLY_COACH_REAL_PROVIDER_NETWORK_CALLS=0");
  });
});
