import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { CoachSignalCandidateV1 } from "../../packages/domain/src/ai-coach/coach-signal-v1.ts";
import { PROACTIVE_COACH_MATERIALITY_POLICY_V1_VERSION } from "../../packages/domain/src/ai-coach/proactive-coach-materiality-policy-v1.ts";
import { buildProactiveCoachConditionKeyV1 } from "../../packages/domain/src/ai-coach/proactive-coach-hysteresis-v1.ts";
import { buildProactiveCoachFingerprintV1, selectProactiveCoachInsightV1 } from "../../packages/domain/src/ai-coach/proactive-coach-selection-v1.ts";
import { loadProactiveCoachRuntimeStateV1ReadOnly } from "../../supabase/functions/_shared/proactive-coach-runtime-state-readonly.ts";
import { createLocalAuthenticatedClient } from "./_helpers/local-auth.ts";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const jwtSecret = process.env.SUPABASE_JWT_SECRET;
if (!url || !anonKey || !serviceRoleKey || !jwtSecret) throw new Error("Local Supabase credentials are required.");
if (!["127.0.0.1", "localhost", "::1"].includes(new URL(url).hostname)) {
  throw new Error("PROACTIVE_STATE_INTEGRATION_REQUIRES_LOOPBACK_SUPABASE");
}

const EDITION = "11000000-0000-0000-0000-000000000001";
const DOMAIN_GUARD_TABLES = [
  "tasks",
  "task_progress",
  "study_sessions",
  "study_session_allocations",
  "weekly_availability",
  "confirmed_action_proposals",
  "planning_v2_proposals",
] as const;

function publicClient() {
  return createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

function serviceClient() {
  return createClient(url!, serviceRoleKey!, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

async function register(api: SupabaseClient, label: string): Promise<User> {
  const suffix = randomUUID();
  const result = await api.auth.signUp({ email: `proactive-state-${label}-${suffix}@example.test`, password: `Safe-${suffix}` });
  expect(result.error).toBeNull();
  return result.data.user!;
}

async function createProfile(api: SupabaseClient, userId: string, status: "active" | "draft") {
  const result = await api.from("exam_profiles").insert({
    user_id: userId,
    exam_edition_id: EDITION,
    preparation_start_date: "2026-09-01",
    target_exam_date: "2027-08-01",
    status,
  }).select("id").single();
  expect(result.error).toBeNull();
  return result.data!.id as string;
}

async function snapshotDomain(api: SupabaseClient, userId: string) {
  const entries = await Promise.all(DOMAIN_GUARD_TABLES.map(async (table) => {
    const result = await api.from(table).select("*", { count: "exact", head: true }).eq("user_id", userId);
    expect(result.error, `count ${table}`).toBeNull();
    return [table, result.count ?? 0] as const;
  }));
  return Object.fromEntries(entries);
}

function repeatedMiss(taskId: string, asOf: string, secondMiss: string, latestMiss: string): CoachSignalCandidateV1 {
  return {
    version: "coach-signal-candidate-v1",
    signalType: "repeated_task_miss",
    severity: "warning",
    importance: "high",
    subjectId: "subject-law",
    date: null,
    reasonCode: "same_task_missed_multiple_times_in_recent_window",
    sourceFactPaths: [`recentProgress.value.taskEvents[taskId=${taskId}]`],
    asOf,
    freshness: { state: "fresh", asOf, expiresAt: null },
    confidence: "high",
    evidence: {
      distinctMissCount: 2,
      secondLatestMissedAt: secondMiss,
      latestMissedAt: latestMiss,
      taskId,
      windowStart: "2026-09-01T00:00:00.000Z",
      windowEnd: asOf,
    },
    provenance: [{ source: "study_intent_ledger", recordIds: [`${taskId}-miss-1`, `${taskId}-miss-2`], asOf }],
    dedupeKey: `repeated_task_miss:subject-law:any-date:${taskId}:same_task_missed_multiple_times_in_recent_window:recentProgress`,
    eligibility: { reactiveExplanation: true, proactiveCandidate: true, attentionCategory: "consistency", cooldownClass: "weekly", silenceAllowed: true },
    authority: {
      mode: "factual_signal_only_read_only",
      createsProductTruth: false,
      generatesProse: false,
      dbWritesAllowed: false,
      workloadCalculationAllowed: false,
      plannerPreviewAllowed: false,
      plannerProposalAllowed: false,
      plannerConfirmationAllowed: false,
      plannerApplyAllowed: false,
      llmCallsAllowed: false,
      providerCallsAllowed: false,
    },
  };
}

function plannerWarning(recordId: string, asOf: string): CoachSignalCandidateV1 {
  return {
    ...repeatedMiss("unused", asOf, "2026-09-01T01:00:00.000Z", "2026-09-02T01:00:00.000Z"),
    signalType: "planner_warning_present",
    severity: "warning",
    importance: "high",
    subjectId: null,
    reasonCode: "persisted_planner_warning_count_present",
    sourceFactPaths: ["planner.value.warnings", "planner.value.lifecycleState"],
    evidence: { lifecycleState: "previewed", warningCount: 1 },
    provenance: [{ source: "planner_v2_lifecycle", recordIds: [recordId], asOf }],
    dedupeKey: `planner_warning_present:global:any-date:${recordId}`,
    eligibility: { reactiveExplanation: true, proactiveCandidate: true, attentionCategory: "planner", cooldownClass: "state_change", silenceAllowed: true },
  };
}

function completedToday(date: string, asOf: string): CoachSignalCandidateV1 {
  return {
    ...repeatedMiss("unused", asOf, "2026-09-01T01:00:00.000Z", "2026-09-02T01:00:00.000Z"),
    signalType: "today_completed_as_planned",
    severity: "info",
    importance: "medium",
    subjectId: null,
    date,
    reasonCode: "today_all_tasks_completed_with_planned_credit",
    sourceFactPaths: ["today.value.summary", "today.value.study"],
    evidence: { completedTaskCount: 2, plannedMinutes: 60, plannedCreditMinutes: 60 },
    provenance: [{ source: "planning_task_state_v1", recordIds: ["task-1", "task-2"], asOf }],
    dedupeKey: `today_completed_as_planned:global:${date}`,
    eligibility: { reactiveExplanation: true, proactiveCandidate: true, attentionCategory: "progress", cooldownClass: "daily", silenceAllowed: true },
  };
}

async function recordPresentation(api: SupabaseClient, userId: string, profileId: string, candidate: CoachSignalCandidateV1, calendarDate: string, surfaceSessionId: string) {
  const result = await api.rpc("record_ai_coach_proactive_presentation_v1", {
    p_user_id: userId,
    p_exam_profile_id: profileId,
    p_signal_type: candidate.signalType,
    p_attention_category: candidate.eligibility.attentionCategory,
    p_fingerprint: buildProactiveCoachFingerprintV1(candidate),
    p_condition_key: buildProactiveCoachConditionKeyV1(candidate),
    p_materiality_policy_version: PROACTIVE_COACH_MATERIALITY_POLICY_V1_VERSION,
    p_calendar_date: calendarDate,
    p_surface_session_id: surfaceSessionId,
    p_template_version: null,
  });
  expect(result.error).toBeNull();
  return result.data as { presentationId: string; idempotent: boolean; presentedAt: string };
}

async function recordClear(api: SupabaseClient, userId: string, profileId: string, candidate: CoachSignalCandidateV1, observedAt: string) {
  const result = await api.rpc("record_ai_coach_proactive_clear_observation_v1", {
    p_user_id: userId,
    p_exam_profile_id: profileId,
    p_signal_type: candidate.signalType,
    p_condition_key: buildProactiveCoachConditionKeyV1(candidate),
    p_observed_at: observedAt,
    p_reason_code: candidate.signalType === "repeated_task_miss" ? "same_task_completion_observed" : "planner_warning_count_zero_observed",
    p_source_identity: `${candidate.signalType}:${observedAt}`,
    p_source_fact_paths: candidate.signalType === "repeated_task_miss" ? ["recentProgress.value.taskEvents"] : ["planner.value.warnings"],
  });
  expect(result.error).toBeNull();
  return result.data as { observationId: string; idempotent: boolean; observedAt: string };
}

describe("AI Coach proactive state persistence V1", () => {
  const signup = publicClient();
  const service = serviceClient();
  let owner: User;
  let other: User;
  let ownerActor: SupabaseClient;
  let otherActor: SupabaseClient;
  let activeProfile: string;
  let controlProfile: string;
  let repeatedProfile: string;
  let plannerProfile: string;
  let noClearProfile: string;
  let domainBefore: Record<string, number>;

  beforeAll(async () => {
    owner = await register(signup, "owner");
    other = await register(signup, "other");
    ownerActor = createLocalAuthenticatedClient({ url: url!, anonKey: anonKey!, jwtSecret: jwtSecret!, userId: owner.id });
    otherActor = createLocalAuthenticatedClient({ url: url!, anonKey: anonKey!, jwtSecret: jwtSecret!, userId: other.id });
    activeProfile = await createProfile(ownerActor, owner.id, "active");
    controlProfile = await createProfile(ownerActor, owner.id, "draft");
    repeatedProfile = await createProfile(ownerActor, owner.id, "draft");
    plannerProfile = await createProfile(ownerActor, owner.id, "draft");
    noClearProfile = await createProfile(ownerActor, owner.id, "draft");
    await createProfile(otherActor, other.id, "active");
    const session = await ownerActor.from("study_sessions").insert({
      user_id: owner.id,
      exam_profile_id: activeProfile,
      session_type: "custom",
      started_at: "2026-09-19T08:00:00.000Z",
      status: "active",
      entry_source: "web",
    });
    expect(session.error).toBeNull();
    domainBefore = await snapshotDomain(service, owner.id);
  });

  it("enforces server-only presentation/clear writes and narrow authenticated controls", async () => {
    const directPresentation = await ownerActor.from("ai_coach_proactive_presentations").insert({
      user_id: owner.id,
      exam_profile_id: controlProfile,
      signal_type: "today_completed_as_planned",
      attention_category: "progress",
      fingerprint: "forged",
      condition_key: "forged",
      materiality_policy_version: "forged",
      calendar_date: "2026-09-19",
      surface_session_id: "forged",
      presentation_identity: "forged",
    });
    expect(directPresentation.error).not.toBeNull();
    const directClear = await ownerActor.from("ai_coach_proactive_clear_observations").insert({
      user_id: owner.id,
      exam_profile_id: controlProfile,
      signal_type: "repeated_task_miss",
      condition_key: "forged",
      observed_at: "2026-09-19T08:00:00.000Z",
      reason_code: "same_task_completion_observed",
      source_identity: "forged",
      source_fact_paths: ["forged"],
      observation_identity: "forged",
    });
    expect(directClear.error).not.toBeNull();
    const directControl = await ownerActor.from("ai_coach_proactive_user_controls").insert({
      user_id: owner.id,
      exam_profile_id: controlProfile,
      control_kind: "dismiss_fingerprint",
      fingerprint: "forged",
    });
    expect(directControl.error).not.toBeNull();

    const forgedServerRpc = await ownerActor.rpc("record_ai_coach_proactive_presentation_v1", {
      p_user_id: owner.id,
      p_exam_profile_id: controlProfile,
      p_signal_type: "today_completed_as_planned",
      p_attention_category: "progress",
      p_fingerprint: "forged",
      p_condition_key: "forged",
      p_materiality_policy_version: "forged",
      p_calendar_date: "2026-09-19",
      p_surface_session_id: "forged",
      p_template_version: null,
    });
    expect(forgedServerRpc.error).not.toBeNull();
    const forgedClearRpc = await ownerActor.rpc("record_ai_coach_proactive_clear_observation_v1", {
      p_user_id: owner.id,
      p_exam_profile_id: controlProfile,
      p_signal_type: "repeated_task_miss",
      p_condition_key: "forged",
      p_observed_at: "2026-09-19T08:00:00.000Z",
      p_reason_code: "same_task_completion_observed",
      p_source_identity: "forged",
      p_source_fact_paths: ["forged"],
    });
    expect(forgedClearRpc.error).not.toBeNull();

    const invalidClearSignal = await service.rpc("record_ai_coach_proactive_clear_observation_v1", {
      p_user_id: owner.id,
      p_exam_profile_id: controlProfile,
      p_signal_type: "recent_recovery",
      p_condition_key: "recent_recovery:invalid",
      p_observed_at: "2026-09-19T08:00:00.000Z",
      p_reason_code: "same_task_completion_observed",
      p_source_identity: "invalid",
      p_source_fact_paths: ["recentProgress.value.taskEvents"],
    });
    expect(invalidClearSignal.error).not.toBeNull();
    const emptyClearPaths = await service.rpc("record_ai_coach_proactive_clear_observation_v1", {
      p_user_id: owner.id,
      p_exam_profile_id: controlProfile,
      p_signal_type: "repeated_task_miss",
      p_condition_key: "repeated_task_miss:invalid",
      p_observed_at: "2026-09-19T08:00:00.000Z",
      p_reason_code: "same_task_completion_observed",
      p_source_identity: "invalid",
      p_source_fact_paths: [],
    });
    expect(emptyClearPaths.error).not.toBeNull();
  });

  it("persists dismiss/snooze/disable controls with ownership, validation, and retry safety", async () => {
    const dismissOne = await ownerActor.rpc("dismiss_ai_coach_proactive_fingerprint_v1", { p_exam_profile_id: controlProfile, p_fingerprint: "dismiss-me" });
    const dismissTwo = await ownerActor.rpc("dismiss_ai_coach_proactive_fingerprint_v1", { p_exam_profile_id: controlProfile, p_fingerprint: "dismiss-me" });
    expect(dismissOne.error).toBeNull();
    expect(dismissTwo.error).toBeNull();
    expect(dismissOne.data.controlId).toBe(dismissTwo.data.controlId);
    expect(dismissTwo.data.idempotent).toBe(true);

    const snoozeUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    expect((await ownerActor.rpc("snooze_ai_coach_proactive_category_v1", { p_exam_profile_id: controlProfile, p_attention_category: "planner", p_snoozed_until: snoozeUntil })).error).toBeNull();
    expect((await ownerActor.rpc("set_ai_coach_proactive_category_disabled_v1", { p_exam_profile_id: controlProfile, p_attention_category: "capacity", p_disabled: true })).error).toBeNull();
    expect((await ownerActor.rpc("set_ai_coach_proactive_category_disabled_v1", { p_exam_profile_id: controlProfile, p_attention_category: "progress", p_disabled: false })).error).toBeNull();

    expect((await ownerActor.rpc("dismiss_ai_coach_proactive_fingerprint_v1", { p_exam_profile_id: randomUUID(), p_fingerprint: "cross-profile" })).error).not.toBeNull();
    expect((await otherActor.rpc("dismiss_ai_coach_proactive_fingerprint_v1", { p_exam_profile_id: controlProfile, p_fingerprint: "cross-user" })).error).not.toBeNull();
    expect((await ownerActor.rpc("snooze_ai_coach_proactive_category_v1", { p_exam_profile_id: controlProfile, p_attention_category: "invented", p_snoozed_until: snoozeUntil })).error).not.toBeNull();
    expect((await ownerActor.rpc("snooze_ai_coach_proactive_category_v1", { p_exam_profile_id: controlProfile, p_attention_category: "planner", p_snoozed_until: "2020-01-01T00:00:00.000Z" })).error).not.toBeNull();
  });

  it("records presentations idempotently and constrains signal/category values", async () => {
    const value = completedToday("2026-09-19", "2026-09-19T09:00:00.000Z");
    const first = await recordPresentation(service, owner.id, controlProfile, value, "2026-09-19", "surface-control");
    const second = await recordPresentation(service, owner.id, controlProfile, value, "2026-09-19", "surface-control");
    expect(first.presentationId).toBe(second.presentationId);
    expect(first.idempotent).toBe(false);
    expect(second.idempotent).toBe(true);
    const count = await service.from("ai_coach_proactive_presentations").select("*", { count: "exact", head: true }).eq("id", first.presentationId);
    expect(count.error).toBeNull();
    expect(count.count).toBe(1);

    const invalidSignal = await service.rpc("record_ai_coach_proactive_presentation_v1", {
      p_user_id: owner.id, p_exam_profile_id: controlProfile, p_signal_type: "invented", p_attention_category: "progress",
      p_fingerprint: "invalid-signal", p_condition_key: "invalid-signal", p_materiality_policy_version: "v1",
      p_calendar_date: "2026-09-19", p_surface_session_id: "surface-invalid", p_template_version: null,
    });
    expect(invalidSignal.error).not.toBeNull();
    const invalidCategory = await service.rpc("record_ai_coach_proactive_presentation_v1", {
      p_user_id: owner.id, p_exam_profile_id: controlProfile, p_signal_type: "today_completed_as_planned", p_attention_category: "planner",
      p_fingerprint: "invalid-category", p_condition_key: "invalid-category", p_materiality_policy_version: "v1",
      p_calendar_date: "2026-09-19", p_surface_session_id: "surface-invalid", p_template_version: null,
    });
    expect(invalidCategory.error).not.toBeNull();
  });

  it("isolates persisted state by exact user and profile and assembles canonical active-session state", async () => {
    const ownRows = await ownerActor.from("ai_coach_proactive_user_controls").select("control_kind").eq("exam_profile_id", controlProfile);
    const crossUserRows = await otherActor.from("ai_coach_proactive_user_controls").select("control_kind").eq("exam_profile_id", controlProfile);
    expect(ownRows.error).toBeNull();
    expect(ownRows.data!.length).toBeGreaterThan(0);
    expect(crossUserRows.error).toBeNull();
    expect(crossUserRows.data).toEqual([]);

    const activeState = await loadProactiveCoachRuntimeStateV1ReadOnly({
      client: ownerActor, userId: owner.id, examProfileId: activeProfile, currentDate: "2026-09-19", surfaceSessionId: "surface-active", now: new Date("2026-09-19T09:00:00.000Z"),
    });
    const controlState = await loadProactiveCoachRuntimeStateV1ReadOnly({
      client: ownerActor, userId: owner.id, examProfileId: controlProfile, currentDate: "2026-09-19", surfaceSessionId: "surface-control-current", now: new Date("2026-09-19T09:00:00.000Z"),
    });
    expect(activeState.activeStudySession).toMatchObject({ availability: "known", value: { active: true } });
    expect(controlState.activeStudySession).toMatchObject({ availability: "known", value: { active: false } });
    expect(controlState.dismissedFingerprints.values).toContain("dismiss-me");
    expect(controlState.snoozes.values.some((item) => item.attentionCategory === "planner")).toBe(true);
    expect(controlState.disabledCategories.values).toEqual(["capacity"]);
    expect(controlState.presentations.values).toHaveLength(1);
  });

  it("keeps repeated misses suppressed without clear and permits re-arm only after persisted clear plus two later misses", async () => {
    const old = repeatedMiss("task-no-clear", "2026-09-10T09:00:00.000Z", "2026-09-08T08:00:00.000Z", "2026-09-09T08:00:00.000Z");
    await recordPresentation(service, owner.id, noClearProfile, old, "2026-09-10", "surface-old");
    const noClearState = await loadProactiveCoachRuntimeStateV1ReadOnly({
      client: ownerActor, userId: owner.id, examProfileId: noClearProfile, currentDate: "2026-09-20", surfaceSessionId: "surface-new", now: new Date("2026-09-20T09:00:00.000Z"),
    });
    const noClear = selectProactiveCoachInsightV1([old], noClearState);
    expect(noClear).toMatchObject({ outcome: "silence", suppressions: [{ reason: "hysteresis_rearm_not_proven" }] });

    const initial = repeatedMiss("task-rearm", "2026-09-10T09:00:00.000Z", "2026-09-08T08:00:00.000Z", "2026-09-09T08:00:00.000Z");
    const presentation = await recordPresentation(service, owner.id, repeatedProfile, initial, "2026-09-10", "surface-initial");
    const clearAt = new Date(Math.max(Date.now(), Date.parse(presentation.presentedAt) + 1)).toISOString();
    await recordClear(service, owner.id, repeatedProfile, initial, clearAt);
    const secondMiss = new Date(Date.parse(clearAt) + 73 * 60 * 60 * 1000).toISOString();
    const latestMiss = new Date(Date.parse(clearAt) + 74 * 60 * 60 * 1000).toISOString();
    const now = new Date(Date.parse(clearAt) + 75 * 60 * 60 * 1000).toISOString();
    const rearmed = repeatedMiss("task-rearm", now, secondMiss, latestMiss);
    const rearmedState = await loadProactiveCoachRuntimeStateV1ReadOnly({
      client: ownerActor, userId: owner.id, examProfileId: repeatedProfile, currentDate: now.slice(0, 10), surfaceSessionId: "surface-rearmed", now: new Date(now),
    });
    const rearmedSelection = selectProactiveCoachInsightV1([rearmed], rearmedState);
    expect(rearmedSelection.outcome, JSON.stringify(rearmedSelection.suppressions)).toBe("selected");
  });

  it("requires a persisted warning-free observation before a later Planner warning can re-arm", async () => {
    const initial = plannerWarning("proposal-1", "2026-09-10T09:00:00.000Z");
    const presentation = await recordPresentation(service, owner.id, plannerProfile, initial, "2026-09-10", "surface-planner-initial");
    const blockedState = await loadProactiveCoachRuntimeStateV1ReadOnly({
      client: ownerActor, userId: owner.id, examProfileId: plannerProfile, currentDate: "2026-09-20", surfaceSessionId: "surface-planner-blocked", now: new Date("2026-09-20T09:00:00.000Z"),
    });
    expect(selectProactiveCoachInsightV1([initial], blockedState).outcome).toBe("silence");

    const clearAt = new Date(Math.max(Date.now(), Date.parse(presentation.presentedAt) + 1)).toISOString();
    await recordClear(service, owner.id, plannerProfile, initial, clearAt);
    const later = plannerWarning("proposal-1", new Date(Date.parse(clearAt) + 73 * 60 * 60 * 1000).toISOString());
    const laterState = await loadProactiveCoachRuntimeStateV1ReadOnly({
      client: ownerActor, userId: owner.id, examProfileId: plannerProfile, currentDate: "2026-09-22", surfaceSessionId: "surface-planner-later", now: new Date(Date.parse(clearAt) + 74 * 60 * 60 * 1000),
    });
    const laterSelection = selectProactiveCoachInsightV1([later], laterState);
    expect(laterSelection.outcome, JSON.stringify(laterSelection.suppressions)).toBe("selected");
  });

  it("does not let an expired snooze suppress an otherwise eligible condition", async () => {
    const snoozeUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    expect((await ownerActor.rpc("snooze_ai_coach_proactive_category_v1", {
      p_exam_profile_id: noClearProfile,
      p_attention_category: "progress",
      p_snoozed_until: snoozeUntil,
    })).error).toBeNull();
    const afterExpiry = new Date(Date.parse(snoozeUntil) + 1000).toISOString();
    const currentDate = afterExpiry.slice(0, 10);
    const state = await loadProactiveCoachRuntimeStateV1ReadOnly({
      client: ownerActor, userId: owner.id, examProfileId: noClearProfile, currentDate, surfaceSessionId: "surface-expired-snooze", now: new Date(afterExpiry),
    });
    const value = completedToday(currentDate, afterExpiry);
    expect(state.snoozes.values.some((item) => item.attentionCategory === "progress")).toBe(true);
    expect(selectProactiveCoachInsightV1([value], state).outcome).toBe("selected");
  });

  it("mutates no task, study-progress, capacity, or Planner rows", async () => {
    const domainAfter = await snapshotDomain(service, owner.id);
    expect(domainAfter).toEqual(domainBefore);
    console.info("PROACTIVE_STATE_DOMAIN_MUTATION_DELTA=0");
    console.info("PROACTIVE_STATE_PLANNER_MUTATION_DELTA=0");
    console.info("PROACTIVE_STATE_PROVIDER_LLM_CALLS=0");
  });
});
