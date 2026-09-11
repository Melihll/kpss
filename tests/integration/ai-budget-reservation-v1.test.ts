import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  AI_PROVIDER_BILLABLE_BOUND_V1_VERSION,
  AI_PROVIDER_COST_AUTHORIZATION_V1_VERSION,
  type AiProviderCostAuthorizationV1,
} from "../../supabase/functions/_shared/ai-coach/provider-runtime-config-v1.ts";
import {
  AI_FX_SNAPSHOT_V1_TEST_FIXTURE,
  AI_PRICING_CATALOG_V1_TEST_FIXTURE,
  AI_ROUTE_CATALOG_V1_TEST_FIXTURE,
  createAiUsageEventV1,
  estimateAiEvidenceV1,
  routeAiCapabilityV1,
  type AiUsageEventV1,
} from "../../packages/domain/src/ai-coach/index.ts";
import {
  expireAiProviderBudgetsV1,
  loadAiBudgetOperationalHealthV1,
  markAiProviderAttemptStartedV1,
  recordAiUsageAndSettleBudgetV1,
  releaseAiProviderBudgetV1,
  requireAiProviderBudgetReconciliationV1,
  reserveAiProviderBudgetV1,
} from "../../supabase/functions/_shared/ai-coach/ai-budget-reservation-v1.ts";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceRoleKey) throw new Error("Local Supabase credentials are required.");
if (!["127.0.0.1", "localhost", "::1"].includes(new URL(url).hostname)) throw new Error("AI_BUDGET_INTEGRATION_REQUIRES_LOOPBACK_SUPABASE");

const EDITION = "11000000-0000-0000-0000-000000000001";
const route = routeAiCapabilityV1({ runtimeEnvironment: "test", capability: "today_analysis", evidence: estimateAiEvidenceV1(10_000), expectedResponse: "medium", budgetState: "normal" }, AI_ROUTE_CATALOG_V1_TEST_FIXTURE);

function anonClient() {
  return createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

function serviceClient() {
  return createClient(url!, serviceRoleKey!, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

async function register(label: string): Promise<{ client: SupabaseClient; user: User }> {
  const client = anonClient();
  const suffix = randomUUID();
  const result = await client.auth.signUp({ email: `ai-budget-${label}-${suffix}@example.test`, password: `Safe-${suffix}` });
  expect(result.error).toBeNull();
  return { client, user: result.data.user! };
}

async function createProfile(client: SupabaseClient, userId: string, status: "active" | "paused" = "active"): Promise<string> {
  const result = await client.from("exam_profiles").insert({ user_id: userId, exam_edition_id: EDITION, preparation_start_date: "2026-09-01", target_exam_date: "2027-08-01", status }).select("id").single();
  expect(result.error).toBeNull();
  return result.data!.id;
}

function reservationInput(service: SupabaseClient, userId: string, profileId: string | null, amount: number, overrides: Partial<{ reservationId: string; requestId: string; correlationId: string; requestedAt: string; expiresAt: string }> = {}) {
  const costAuthorization: AiProviderCostAuthorizationV1 = {
    version: AI_PROVIDER_COST_AUTHORIZATION_V1_VERSION,
    authority: "test_fixture",
    runtimeEnvironment: "test",
    provider: route.provider!,
    modelId: route.modelId!,
    modelTier: "standard",
    routeCatalogVersion: route.catalogVersion,
    pricingVersion: route.pricingVersion,
    fxPolicyVersion: AI_FX_SNAPSHOT_V1_TEST_FIXTURE.policyVersion,
    fxSnapshotVersion: AI_FX_SNAPSHOT_V1_TEST_FIXTURE.snapshotVersion,
    billingBoundVersion: AI_PROVIDER_BILLABLE_BOUND_V1_VERSION,
    inputTokenUpperBound: 50_000,
    outputTokenUpperBound: route.maxOutputTokens,
    tryMaximum: amount,
  };
  return {
    serviceClient: service,
    reservationId: overrides.reservationId ?? randomUUID(),
    userId,
    examProfileId: profileId,
    route,
    costAuthorization,
    requestId: overrides.requestId ?? randomUUID(),
    correlationId: overrides.correlationId ?? randomUUID(),
    requestedAt: overrides.requestedAt ?? "2026-09-11T10:00:00.000Z",
    expiresAt: overrides.expiresAt ?? "2026-09-11T10:10:00.000Z",
  } as const;
}

function usageEvent(input: { userId: string; profileId: string; attemptId: string; requestId: string; correlationId: string; startedAt?: string; completedAt?: string; retryNumber?: number; fallbackFromAttemptId?: string | null }): AiUsageEventV1 {
  const startedAt = input.startedAt ?? "2026-09-11T10:00:05.000Z";
  const completedAt = input.completedAt ?? "2026-09-11T10:00:06.000Z";
  const base = createAiUsageEventV1({
    providerAttemptId: input.attemptId,
    identity: { userId: input.userId, examProfileId: input.profileId },
    feature: { capability: "today_analysis", requestId: input.requestId, correlationId: input.correlationId },
    route,
    usage: { availability: "reported", inputTokens: 1_000, cachedInputTokens: 200, outputTokens: 300, totalTokens: 1_300, source: "provider_response" },
    execution: { providerRequestId: `provider-${input.attemptId}`, providerRequestIdSource: "response_body", startedAt, completedAt, status: "succeeded", retryNumber: input.retryNumber ?? 0, fallbackFromAttemptId: input.fallbackFromAttemptId ?? null, errorCategory: "none" },
    pricingCatalog: AI_PRICING_CATALOG_V1_TEST_FIXTURE,
    fxSnapshot: AI_FX_SNAPSHOT_V1_TEST_FIXTURE,
  });
  return base;
}

function usageEventAt290Try(input: { userId: string; profileId: string; attemptId: string; requestId: string; correlationId: string }): AiUsageEventV1 {
  const pricingCatalog = {
    ...AI_PRICING_CATALOG_V1_TEST_FIXTURE,
    entries: AI_PRICING_CATALOG_V1_TEST_FIXTURE.entries.map((entry) => entry.provider === route.provider && entry.modelId === route.modelId
      ? { ...entry, inputPerMillionTokens: 7.25, cachedInputPerMillionTokens: 7.25, outputPerMillionTokens: 7.25 }
      : entry),
  };
  return createAiUsageEventV1({
    providerAttemptId: input.attemptId,
    identity: { userId: input.userId, examProfileId: input.profileId },
    feature: { capability: "today_analysis", requestId: input.requestId, correlationId: input.correlationId },
    route,
    usage: { availability: "reported", inputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 0, totalTokens: 1_000_000, source: "provider_response" },
    execution: { providerRequestId: `provider-${input.attemptId}`, providerRequestIdSource: "response_body", startedAt: "2026-09-11T10:00:05.000Z", completedAt: "2026-09-11T10:00:06.000Z", status: "succeeded", retryNumber: 0, fallbackFromAttemptId: null, errorCategory: "none" },
    pricingCatalog,
    fxSnapshot: AI_FX_SNAPSHOT_V1_TEST_FIXTURE,
  });
}

describe("6B.6A atomic user-month AI budget reservations", () => {
  it("allows only one of two concurrent reservations that would exceed the shared remainder", async () => {
    const { client, user } = await register("race");
    const profileA = await createProfile(client, user.id);
    const profileB = await createProfile(client, user.id, "paused");
    const attempts = await Promise.all([reservationInput(serviceClient(), user.id, profileA, 180), reservationInput(serviceClient(), user.id, profileB, 180)].map((input) => reserveAiProviderBudgetV1(input)));
    expect(attempts.filter((item) => item.allowed)).toHaveLength(1);
    expect(attempts.filter((item) => !item.allowed)).toMatchObject([{ reason: "hard_limit", committedTry: 180 }]);
  });

  it("serializes many concurrent reservations and never commits above 300 TRY", async () => {
    const { client, user } = await register("many");
    const profile = await createProfile(client, user.id);
    const decisions = await Promise.all(Array.from({ length: 20 }, () => reserveAiProviderBudgetV1(reservationInput(serviceClient(), user.id, profile, 20))));
    expect(decisions.filter((item) => item.allowed)).toHaveLength(15);
    const rows = await serviceClient().from("ai_budget_reservations").select("estimated_try_max").eq("user_id", user.id).eq("status", "reserved");
    expect(rows.error).toBeNull();
    expect(rows.data!.reduce((sum, row) => sum + Number(row.estimated_try_max), 0)).toBe(300);
  });

  it("allows exactly 290 + 10 TRY and rejects 290 + 10.01 TRY", async () => {
    for (const [label, finalAmount, allowed] of [["exact", 10, true], ["over", 10.01, false]] as const) {
      const { client, user } = await register(`boundary-${label}`);
      const profile = await createProfile(client, user.id);
      const first = reservationInput(serviceClient(), user.id, profile, 290);
      await reserveAiProviderBudgetV1(first);
      const attemptId = randomUUID();
      await markAiProviderAttemptStartedV1({ serviceClient: serviceClient(), reservationId: first.reservationId, providerAttemptId: attemptId, startedAt: "2026-09-11T10:00:05.000Z" });
      const event = usageEventAt290Try({ userId: user.id, profileId: profile, attemptId, requestId: first.requestId, correlationId: first.correlationId });
      expect(event.tryCost).toMatchObject({ state: "known", amount: 290 });
      await recordAiUsageAndSettleBudgetV1({ serviceClient: serviceClient(), reservationId: first.reservationId, event });
      const decision = await reserveAiProviderBudgetV1(reservationInput(serviceClient(), user.id, profile, finalAmount, { requestedAt: "2026-09-11T10:01:00.000Z", expiresAt: "2026-09-11T10:11:00.000Z" }));
      expect(decision.allowed).toBe(allowed);
      expect(decision).toMatchObject(allowed ? { reason: "reserved", committedTry: 300 } : { reason: "hard_limit", committedTry: 290 });
    }
  });

  it("makes an identical reservation request idempotent and conflicting reuse invalid", async () => {
    const { client, user } = await register("idempotent");
    const profile = await createProfile(client, user.id);
    const input = reservationInput(serviceClient(), user.id, profile, 25);
    expect(await reserveAiProviderBudgetV1(input)).toMatchObject({ allowed: true, reason: "reserved", idempotent: false });
    expect(await reserveAiProviderBudgetV1(input)).toMatchObject({ allowed: true, reason: "idempotent", idempotent: true });
    await expect(reserveAiProviderBudgetV1({ ...input, costAuthorization: { ...input.costAuthorization, tryMaximum: 26 } })).rejects.toThrow("AI_BUDGET_RESERVATION_FAILED");
  });

  it("expires an unstarted reservation and releases its commitment", async () => {
    const { client, user } = await register("expiry");
    const profile = await createProfile(client, user.id);
    const first = reservationInput(serviceClient(), user.id, profile, 300, { expiresAt: "2026-09-11T10:01:00.000Z" });
    await reserveAiProviderBudgetV1(first);
    await expireAiProviderBudgetsV1({ serviceClient: serviceClient(), asOf: "2026-09-11T10:02:00.000Z" });
    expect(await reserveAiProviderBudgetV1(reservationInput(serviceClient(), user.id, profile, 300, { requestedAt: "2026-09-11T10:03:00.000Z", expiresAt: "2026-09-11T10:10:00.000Z" }))).toMatchObject({ allowed: true, committedTry: 300 });
  });

  it("settles actual usage once and releases the unused reservation remainder", async () => {
    const { client, user } = await register("settle");
    const profile = await createProfile(client, user.id);
    const request = reservationInput(serviceClient(), user.id, profile, 10);
    await reserveAiProviderBudgetV1(request);
    const attemptId = randomUUID();
    await markAiProviderAttemptStartedV1({ serviceClient: serviceClient(), reservationId: request.reservationId, providerAttemptId: attemptId, startedAt: "2026-09-11T10:00:05.000Z" });
    const event = usageEvent({ userId: user.id, profileId: profile, attemptId, requestId: request.requestId, correlationId: request.correlationId });
    expect(await recordAiUsageAndSettleBudgetV1({ serviceClient: serviceClient(), reservationId: request.reservationId, event })).toMatchObject({ status: "settled", idempotent: false });
    expect(await recordAiUsageAndSettleBudgetV1({ serviceClient: serviceClient(), reservationId: request.reservationId, event })).toMatchObject({ status: "settled", idempotent: true });
    const month = await serviceClient().from("ai_monthly_user_cost_v1").select("settled_try,active_reserved_try,committed_try").eq("user_id", user.id).eq("accounting_month", "2026-09").single();
    expect(month.error).toBeNull();
    expect(month.data).toMatchObject({ settled_try: 0.246, active_reserved_try: 0, committed_try: 0.246 });
  });

  it("releases a pre-attempt provider failure without consuming budget", async () => {
    const { client, user } = await register("release");
    const profile = await createProfile(client, user.id);
    const request = reservationInput(serviceClient(), user.id, profile, 280);
    await reserveAiProviderBudgetV1(request);
    expect(await releaseAiProviderBudgetV1({ serviceClient: serviceClient(), reservationId: request.reservationId, releasedAt: "2026-09-11T10:00:03.000Z", reason: "provider_not_called" })).toMatchObject({ status: "released", idempotent: false });
    expect(await reserveAiProviderBudgetV1(reservationInput(serviceClient(), user.id, profile, 300, { requestedAt: "2026-09-11T10:00:04.000Z" }))).toMatchObject({ allowed: true });
  });

  it("retains an uncertain in-flight attempt as reconciliation-required commitment", async () => {
    const { client, user } = await register("reconcile");
    const profile = await createProfile(client, user.id);
    const request = reservationInput(serviceClient(), user.id, profile, 200);
    await reserveAiProviderBudgetV1(request);
    await markAiProviderAttemptStartedV1({ serviceClient: serviceClient(), reservationId: request.reservationId, providerAttemptId: randomUUID(), startedAt: "2026-09-11T10:00:05.000Z" });
    expect(await requireAiProviderBudgetReconciliationV1({ serviceClient: serviceClient(), reservationId: request.reservationId, markedAt: "2026-09-11T10:00:20.000Z", reason: "timeout_billing_unknown" })).toMatchObject({ status: "reconciliation_required" });
    expect(await reserveAiProviderBudgetV1(reservationInput(serviceClient(), user.id, profile, 101, { requestedAt: "2026-09-11T10:00:30.000Z" }))).toMatchObject({ allowed: false, reason: "hard_limit", committedTry: 200 });
    expect(await loadAiBudgetOperationalHealthV1({ serviceClient: serviceClient(), userId: user.id, accountingMonth: "2026-09" })).toEqual(expect.arrayContaining([expect.objectContaining({ reservation_id: request.reservationId, status: "reconciliation_required", issue: "timeout_billing_unknown" })]));
  });

  it("settles a late known provider result after an uncertain timeout", async () => {
    const { client, user } = await register("late-settlement");
    const profile = await createProfile(client, user.id);
    const request = reservationInput(serviceClient(), user.id, profile, 10);
    await reserveAiProviderBudgetV1(request);
    const attemptId = randomUUID();
    await markAiProviderAttemptStartedV1({ serviceClient: serviceClient(), reservationId: request.reservationId, providerAttemptId: attemptId, startedAt: "2026-09-11T10:00:05.000Z" });
    await requireAiProviderBudgetReconciliationV1({ serviceClient: serviceClient(), reservationId: request.reservationId, markedAt: "2026-09-11T10:00:20.000Z", reason: "timeout_billing_unknown" });
    const event = usageEvent({ userId: user.id, profileId: profile, attemptId, requestId: request.requestId, correlationId: request.correlationId, completedAt: "2026-09-11T10:00:30.000Z" });
    expect(await recordAiUsageAndSettleBudgetV1({ serviceClient: serviceClient(), reservationId: request.reservationId, event })).toMatchObject({ status: "settled", idempotent: false });
    const reservation = await serviceClient().from("ai_budget_reservations").select("status,provider_attempt_state,usage_event_id,actual_try_amount").eq("reservation_id", request.reservationId).single();
    expect(reservation.error).toBeNull();
    expect(reservation.data).toMatchObject({ status: "settled", provider_attempt_state: "completed", actual_try_amount: 0.246 });
    expect(reservation.data!.usage_event_id).not.toBeNull();
  });

  it("fails closed when actual cost exceeds the authorized maximum", async () => {
    const { client, user } = await register("estimate-breach");
    const profile = await createProfile(client, user.id);
    const request = reservationInput(serviceClient(), user.id, profile, 0.1);
    await reserveAiProviderBudgetV1(request);
    const attemptId = randomUUID();
    await markAiProviderAttemptStartedV1({ serviceClient: serviceClient(), reservationId: request.reservationId, providerAttemptId: attemptId, startedAt: "2026-09-11T10:00:05.000Z" });
    const event = usageEvent({ userId: user.id, profileId: profile, attemptId, requestId: request.requestId, correlationId: request.correlationId });
    expect(await recordAiUsageAndSettleBudgetV1({ serviceClient: serviceClient(), reservationId: request.reservationId, event })).toMatchObject({ status: "reconciliation_required" });
    expect(await loadAiBudgetOperationalHealthV1({ serviceClient: serviceClient(), userId: user.id, accountingMonth: "2026-09" })).toEqual(expect.arrayContaining([expect.objectContaining({ reservation_id: request.reservationId, status: "reconciliation_required", issue: "actual_cost_exceeds_reservation" })]));
    const reservation = await serviceClient().from("ai_budget_reservations").select("provider_attempt_state,actual_try_amount").eq("reservation_id", request.reservationId).single();
    expect(reservation.error).toBeNull();
    expect(reservation.data).toMatchObject({ provider_attempt_state: "completed", actual_try_amount: 0.246 });
    expect(await reserveAiProviderBudgetV1(reservationInput(serviceClient(), user.id, profile, 0.01, { requestedAt: "2026-09-11T10:01:00.000Z", expiresAt: "2026-09-11T10:11:00.000Z" }))).toMatchObject({ allowed: false, reason: "cost_bound_invariant_violation", committedTry: null });
  });

  it("meters retry and fallback as separate provider attempts", async () => {
    const { client, user } = await register("attempts");
    const profile = await createProfile(client, user.id);
    const firstRequest = reservationInput(serviceClient(), user.id, profile, 5);
    await reserveAiProviderBudgetV1(firstRequest);
    const firstAttempt = randomUUID();
    await markAiProviderAttemptStartedV1({ serviceClient: serviceClient(), reservationId: firstRequest.reservationId, providerAttemptId: firstAttempt, startedAt: "2026-09-11T10:00:05.000Z" });
    await recordAiUsageAndSettleBudgetV1({ serviceClient: serviceClient(), reservationId: firstRequest.reservationId, event: usageEvent({ userId: user.id, profileId: profile, attemptId: firstAttempt, requestId: firstRequest.requestId, correlationId: firstRequest.correlationId }) });
    const fallbackRequest = reservationInput(serviceClient(), user.id, profile, 5, { requestId: firstRequest.requestId, correlationId: firstRequest.correlationId, requestedAt: "2026-09-11T10:01:00.000Z", expiresAt: "2026-09-11T10:11:00.000Z" });
    await reserveAiProviderBudgetV1(fallbackRequest);
    const fallbackAttempt = randomUUID();
    await markAiProviderAttemptStartedV1({ serviceClient: serviceClient(), reservationId: fallbackRequest.reservationId, providerAttemptId: fallbackAttempt, startedAt: "2026-09-11T10:01:05.000Z" });
    await recordAiUsageAndSettleBudgetV1({ serviceClient: serviceClient(), reservationId: fallbackRequest.reservationId, event: usageEvent({ userId: user.id, profileId: profile, attemptId: fallbackAttempt, requestId: fallbackRequest.requestId, correlationId: fallbackRequest.correlationId, retryNumber: 1, fallbackFromAttemptId: firstAttempt, startedAt: "2026-09-11T10:01:05.000Z", completedAt: "2026-09-11T10:01:06.000Z" }) });
    const rows = await serviceClient().from("ai_usage_events").select("provider_attempt_id,retry_number,fallback_from_attempt_id").eq("user_id", user.id).order("completed_at");
    expect(rows.error).toBeNull();
    expect(rows.data).toHaveLength(2);
    expect(rows.data![1]).toMatchObject({ provider_attempt_id: fallbackAttempt, retry_number: 1, fallback_from_attempt_id: firstAttempt });
  });

  it("rolls back the ledger insert when reservation settlement fails", async () => {
    const { client, user } = await register("rollback");
    const profile = await createProfile(client, user.id);
    const request = reservationInput(serviceClient(), user.id, profile, 5);
    await reserveAiProviderBudgetV1(request);
    const attemptId = randomUUID();
    await markAiProviderAttemptStartedV1({ serviceClient: serviceClient(), reservationId: request.reservationId, providerAttemptId: attemptId, startedAt: "2026-09-11T10:00:05.000Z" });
    const event = usageEvent({ userId: user.id, profileId: profile, attemptId, requestId: request.requestId, correlationId: request.correlationId, startedAt: "2026-09-11T09:59:00.000Z", completedAt: "2026-09-11T09:59:01.000Z" });
    await expect(recordAiUsageAndSettleBudgetV1({ serviceClient: serviceClient(), reservationId: request.reservationId, event })).rejects.toThrow("AI_BUDGET_SETTLEMENT_FAILED");
    const ledger = await serviceClient().from("ai_usage_events").select("id", { count: "exact", head: true }).eq("provider_attempt_id", attemptId);
    expect(ledger.error).toBeNull();
    expect(ledger.count).toBe(0);
  });

  it("rejects settlement when route, provider, pricing, or FX identity differs from the reservation", async () => {
    const { client, user } = await register("settlement-scope");
    const profile = await createProfile(client, user.id);
    const request = reservationInput(serviceClient(), user.id, profile, 5);
    await reserveAiProviderBudgetV1(request);
    const attemptId = randomUUID();
    await markAiProviderAttemptStartedV1({ serviceClient: serviceClient(), reservationId: request.reservationId, providerAttemptId: attemptId, startedAt: "2026-09-11T10:00:05.000Z" });
    const event = usageEvent({ userId: user.id, profileId: profile, attemptId, requestId: request.requestId, correlationId: request.correlationId });
    const forged = { ...event, routeCatalogVersion: "forged-route-catalog" } as AiUsageEventV1;
    await expect(recordAiUsageAndSettleBudgetV1({ serviceClient: serviceClient(), reservationId: request.reservationId, event: forged })).rejects.toThrow("AI_BUDGET_SETTLEMENT_FAILED");
    const ledger = await serviceClient().from("ai_usage_events").select("id", { count: "exact", head: true }).eq("provider_attempt_id", attemptId);
    expect(ledger.error).toBeNull();
    expect(ledger.count).toBe(0);
  });

  it("uses exact Europe/Istanbul month boundaries", async () => {
    const { client, user } = await register("month");
    const profile = await createProfile(client, user.id);
    const august = await reserveAiProviderBudgetV1(reservationInput(serviceClient(), user.id, profile, 300, { requestedAt: "2026-08-31T20:59:59.999Z", expiresAt: "2026-08-31T21:09:59.999Z" }));
    const september = await reserveAiProviderBudgetV1(reservationInput(serviceClient(), user.id, profile, 300, { requestedAt: "2026-08-31T21:00:00.000Z", expiresAt: "2026-08-31T21:10:00.000Z" }));
    expect(august).toMatchObject({ allowed: true, accountingMonth: "2026-08" });
    expect(september).toMatchObject({ allowed: true, accountingMonth: "2026-09" });
  });

  it("isolates different users while sharing one ceiling across profiles of the same user", async () => {
    const a = await register("scope-a");
    const b = await register("scope-b");
    const profileA1 = await createProfile(a.client, a.user.id);
    const profileA2 = await createProfile(a.client, a.user.id, "paused");
    const profileB = await createProfile(b.client, b.user.id);
    expect(await reserveAiProviderBudgetV1(reservationInput(serviceClient(), a.user.id, profileA1, 200))).toMatchObject({ allowed: true });
    expect(await reserveAiProviderBudgetV1(reservationInput(serviceClient(), a.user.id, profileA2, 101))).toMatchObject({ allowed: false, reason: "hard_limit" });
    expect(await reserveAiProviderBudgetV1(reservationInput(serviceClient(), b.user.id, profileB, 300))).toMatchObject({ allowed: true });
  });

  it("denies authenticated clients all reservation mutations and raw-content fields", async () => {
    const { client, user } = await register("security");
    const profile = await createProfile(client, user.id);
    const direct = await client.from("ai_budget_reservations").insert({ reservation_id: randomUUID() });
    expect(direct.error).not.toBeNull();
    const forged = await client.rpc("reserve_ai_budget_v1", { p_request: { prompt: "must never persist" } });
    expect(forged.error).not.toBeNull();
    const service = serviceClient();
    const raw = { ...(reservationInput(service, user.id, profile, 1) as any), prompt: "must never persist" };
    const serviceForged = await service.rpc("reserve_ai_budget_v1", { p_request: raw });
    expect(serviceForged.error).not.toBeNull();
    const columns = await service.from("ai_budget_reservations").select("*").limit(1);
    expect(columns.error).toBeNull();
    for (const row of columns.data ?? []) for (const forbidden of ["prompt", "message", "evidence", "coach_context", "conversation"]) expect(Object.keys(row)).not.toContain(forbidden);
  });
});
