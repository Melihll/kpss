import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import {
  AI_FX_SNAPSHOT_V1_TEST_FIXTURE,
  AI_PRICING_CATALOG_V1_TEST_FIXTURE,
  AI_ROUTE_CATALOG_V1_TEST_FIXTURE,
  aggregateMonthlyAiUsageV1,
  createAiUsageEventV1,
  estimateAiEvidenceV1,
  routeAiCapabilityV1,
  type AiUsageEventV1,
} from "../../packages/domain/src/ai-coach/index.ts";
import {
  aiUsageEventToLedgerPayloadV1,
  loadAiUsageLedgerMonthV1,
  recordAiUsageEventV1,
} from "../../supabase/functions/_shared/ai-coach/ai-usage-ledger-v1.ts";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceRoleKey) throw new Error("Local Supabase credentials are required.");
const parsedUrl = new URL(url);
if (!["127.0.0.1", "localhost", "::1"].includes(parsedUrl.hostname)) throw new Error("AI_USAGE_LEDGER_INTEGRATION_REQUIRES_LOOPBACK_SUPABASE");

const EDITION = "11000000-0000-0000-0000-000000000001";
const STARTED_AT = "2026-09-11T09:00:00.000Z";
const COMPLETED_AT = "2026-09-11T09:00:01.000Z";

function anonClient() {
  return createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

function serviceClient() {
  return createClient(url!, serviceRoleKey!, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

async function register(api: SupabaseClient, label: string): Promise<User> {
  const suffix = randomUUID();
  const result = await api.auth.signUp({ email: `ai-usage-${label}-${suffix}@example.test`, password: `Safe-${suffix}` });
  expect(result.error).toBeNull();
  return result.data.user!;
}

async function createProfile(api: SupabaseClient, userId: string): Promise<string> {
  const result = await api.from("exam_profiles").insert({
    user_id: userId,
    exam_edition_id: EDITION,
    preparation_start_date: "2026-09-01",
    target_exam_date: "2027-08-01",
    status: "active",
  }).select("id").single();
  expect(result.error).toBeNull();
  return result.data!.id;
}

async function countRows(api: SupabaseClient, table: string, userId: string): Promise<number> {
  const result = await api.from(table).select("id", { count: "exact", head: true }).eq("user_id", userId);
  expect(result.error).toBeNull();
  return result.count ?? 0;
}

function providerEvent(userId: string, profileId: string, attemptId: string, retryNumber = 0, fallbackFromAttemptId: string | null = null): AiUsageEventV1 {
  const route = routeAiCapabilityV1({
    runtimeEnvironment: "test",
    capability: "today_analysis",
    evidence: estimateAiEvidenceV1(12_252),
    expectedResponse: "medium",
    budgetState: "normal",
  }, AI_ROUTE_CATALOG_V1_TEST_FIXTURE);
  return createAiUsageEventV1({
    providerAttemptId: attemptId,
    identity: { userId, examProfileId: profileId },
    feature: { capability: "today_analysis", requestId: randomUUID(), correlationId: randomUUID() },
    route,
    usage: { availability: "reported", inputTokens: 1_000, cachedInputTokens: 200, outputTokens: 300, totalTokens: 1_300, source: "provider_response" },
    execution: { startedAt: STARTED_AT, completedAt: COMPLETED_AT, status: "succeeded", retryNumber, fallbackFromAttemptId, errorCategory: "none" },
    pricingCatalog: AI_PRICING_CATALOG_V1_TEST_FIXTURE,
    fxSnapshot: AI_FX_SNAPSHOT_V1_TEST_FIXTURE,
  });
}

describe("AiUsageEventV1 local append-only ledger", () => {
  const actorA = anonClient();
  const actorB = anonClient();
  const service = serviceClient();
  let userA: User;
  let userB: User;
  let profileA: string;
  let profileB: string;
  let initial: AiUsageEventV1;
  let retry: AiUsageEventV1;
  let fallback: AiUsageEventV1;
  let otherUser: AiUsageEventV1;

  beforeAll(async () => {
    userA = await register(actorA, "a");
    userB = await register(actorB, "b");
    profileA = await createProfile(actorA, userA.id);
    profileB = await createProfile(actorB, userB.id);
    initial = providerEvent(userA.id, profileA, randomUUID());
    retry = providerEvent(userA.id, profileA, randomUUID(), 1);
    fallback = providerEvent(userA.id, profileA, randomUUID(), 0, initial.providerAttemptId);
    otherUser = providerEvent(userB.id, profileB, randomUUID());
  });

  it("persists every provider attempt separately and idempotently", async () => {
    const before = await service.from("ai_usage_events").select("id", { count: "exact", head: true }).in("user_id", [userA.id, userB.id]);
    expect(before.error).toBeNull();
    const plannerBefore = {
      tasks: await countRows(service, "tasks", userA.id),
      lifecycle: await countRows(service, "confirmed_action_proposals", userA.id),
      proposals: await countRows(service, "planning_v2_proposals", userA.id),
    };
    const first = await recordAiUsageEventV1(service, initial);
    const duplicate = await recordAiUsageEventV1(service, initial);
    await recordAiUsageEventV1(service, retry);
    await recordAiUsageEventV1(service, fallback);
    await recordAiUsageEventV1(service, otherUser);
    const after = await service.from("ai_usage_events").select("id", { count: "exact", head: true }).in("user_id", [userA.id, userB.id]);
    expect(after.error).toBeNull();
    expect(first.idempotent).toBe(false);
    expect(duplicate).toMatchObject({ eventId: first.eventId, providerAttemptId: initial.providerAttemptId, idempotent: true });
    expect((after.count ?? 0) - (before.count ?? 0)).toBe(4);
    const monthly = aggregateMonthlyAiUsageV1({ userId: userA.id, examProfileId: profileA, accountingMonth: "2026-09", events: [initial, retry, fallback, initial] });
    expect(monthly).toMatchObject({ availability: "known", uniqueAttemptCount: 3, duplicateAttemptCount: 1 });
    const persisted = await loadAiUsageLedgerMonthV1({ client: actorA, userId: userA.id, examProfileId: null, accountingMonth: "2026-09" });
    expect(persisted.events).toHaveLength(3);
    expect(persisted.budget).toMatchObject({ scope: "user", availability: "known", uniqueAttemptCount: 3, spentTry: 0.738 });
    const plannerAfter = {
      tasks: await countRows(service, "tasks", userA.id),
      lifecycle: await countRows(service, "confirmed_action_proposals", userA.id),
      proposals: await countRows(service, "planning_v2_proposals", userA.id),
    };
    expect(plannerAfter).toEqual(plannerBefore);
    console.info("AI_USAGE_LEDGER_LOCAL_INSERT_DELTA=4");
    console.info("AI_USAGE_LEDGER_PLANNER_MUTATION_DELTA=0");
  });

  it("rejects conflicting reuse of a provider attempt identity", async () => {
    const conflicting = { ...initial, retryNumber: 3 } as AiUsageEventV1;
    await expect(recordAiUsageEventV1(service, conflicting)).rejects.toThrow("AI_USAGE_LEDGER_WRITE_FAILED");
    const count = await service.from("ai_usage_events").select("id", { count: "exact", head: true }).eq("provider_attempt_id", initial.providerAttemptId);
    expect(count.error).toBeNull();
    expect(count.count).toBe(1);
  });

  it("enforces user/profile isolation through RLS", async () => {
    const ownA = await actorA.from("ai_usage_events").select("user_id,exam_profile_id,provider_attempt_id");
    const ownB = await actorB.from("ai_usage_events").select("user_id,exam_profile_id,provider_attempt_id");
    expect(ownA.error).toBeNull();
    expect(ownB.error).toBeNull();
    expect(ownA.data).toHaveLength(3);
    expect(ownB.data).toHaveLength(1);
    expect(ownA.data!.every((row) => row.user_id === userA.id && row.exam_profile_id === profileA)).toBe(true);
    expect(ownB.data!.every((row) => row.user_id === userB.id && row.exam_profile_id === profileB)).toBe(true);
  });

  it("rejects authenticated client inserts and RPC cost forgery", async () => {
    const direct = await actorA.from("ai_usage_events").insert({ provider_attempt_id: "forged-client-attempt" });
    expect(direct.error).not.toBeNull();
    const forgedRpc = await actorA.rpc("record_ai_usage_event_v1", { p_event: aiUsageEventToLedgerPayloadV1(initial) });
    expect(forgedRpc.error).not.toBeNull();
    const rawPayload = { ...aiUsageEventToLedgerPayloadV1(providerEvent(userA.id, profileA, randomUUID())), prompt: "raw text must not persist" };
    const rawRpc = await service.rpc("record_ai_usage_event_v1", { p_event: rawPayload });
    expect(rawRpc.error).not.toBeNull();
  });

  it("rejects a mismatched user/profile pair at the server boundary", async () => {
    const mismatched = providerEvent(userA.id, profileB, randomUUID());
    await expect(recordAiUsageEventV1(service, mismatched)).rejects.toThrow("AI_USAGE_LEDGER_WRITE_FAILED");
  });

  it("makes core ledger rows immutable even to the service write path", async () => {
    const update = await service.from("ai_usage_events").update({ retry_number: 99 }).eq("provider_attempt_id", initial.providerAttemptId);
    const remove = await service.from("ai_usage_events").delete().eq("provider_attempt_id", initial.providerAttemptId);
    expect(update.error).not.toBeNull();
    expect(remove.error).not.toBeNull();
    const row = await service.from("ai_usage_events").select("retry_number").eq("provider_attempt_id", initial.providerAttemptId).single();
    expect(row.error).toBeNull();
    expect(row.data!.retry_number).toBe(0);
  });

  it("stores only the allowlisted privacy-preserving operational schema", async () => {
    const result = await service.from("ai_usage_events").select("*").eq("provider_attempt_id", initial.providerAttemptId).single();
    expect(result.error).toBeNull();
    const keys = Object.keys(result.data!);
    for (const forbidden of ["prompt", "message", "conversation", "coach_context", "api_key", "secret"]) expect(keys).not.toContain(forbidden);
    expect(result.data).toMatchObject({ pricing_version: "ai-pricing-test-fixture-v1", fx_snapshot_version: "usd-try-test-fixture-2026-09-01", try_estimated_cost: 0.246 });
  });
});
