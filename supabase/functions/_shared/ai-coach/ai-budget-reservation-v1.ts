import type { AiModelRouteDecisionV1, AiUsageEventV1 } from "../../../../packages/domain/src/ai-coach/ai-economics-v1.ts";
import { aiUsageEventToLedgerPayloadV1 } from "./ai-usage-ledger-v1.ts";
import { AI_PROVIDER_COST_AUTHORIZATION_V1_VERSION, type AiProviderCostAuthorizationV1 } from "./provider-runtime-config-v1.ts";

type Client = any;

export const AI_BUDGET_RESERVATION_RPC_V1 = "reserve_ai_budget_v1" as const;
export const AI_BUDGET_ATTEMPT_STARTED_RPC_V1 = "mark_ai_budget_attempt_started_v1" as const;
export const AI_BUDGET_RELEASE_RPC_V1 = "release_ai_budget_reservation_v1" as const;
export const AI_BUDGET_RECONCILIATION_RPC_V1 = "require_ai_budget_reconciliation_v1" as const;
export const AI_BUDGET_SETTLEMENT_RPC_V1 = "record_ai_usage_and_settle_reservation_v1" as const;
export const AI_BUDGET_EXPIRY_RPC_V1 = "expire_ai_budget_reservations_v1" as const;

export type AiPersistentBudgetReservationStatusV1 = "reserved" | "settled" | "released" | "expired" | "reconciliation_required";

export interface AiBudgetReservationDecisionV1 {
  readonly allowed: boolean;
  readonly reason: "reserved" | "idempotent" | "hard_limit" | "usage_cost_unknown" | "cost_bound_invariant_violation";
  readonly reservationId: string | null;
  readonly status: AiPersistentBudgetReservationStatusV1 | null;
  readonly accountingMonth: string;
  readonly committedTry: number | null;
  readonly idempotent: boolean;
}

function finiteNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error("AI_BUDGET_RPC_RESULT_INVALID");
  return parsed;
}

async function rpc(client: Client, name: string, args: Readonly<Record<string, unknown>>, errorCode: string): Promise<Record<string, unknown>> {
  const result = await client.rpc(name, args);
  if (result.error) throw new Error(`${errorCode}:${result.error.code ?? "unknown"}`);
  if (!result.data || typeof result.data !== "object" || Array.isArray(result.data)) throw new Error(`${errorCode}:invalid_result`);
  return result.data as Record<string, unknown>;
}

export async function reserveAiProviderBudgetV1(input: {
  readonly serviceClient: Client;
  readonly reservationId: string;
  readonly userId: string;
  readonly examProfileId: string | null;
  readonly route: AiModelRouteDecisionV1;
  readonly costAuthorization: AiProviderCostAuthorizationV1;
  readonly requestId: string;
  readonly correlationId: string;
  readonly requestedAt: string;
  readonly expiresAt: string;
}): Promise<AiBudgetReservationDecisionV1> {
  if (input.route.runtimeEnvironment !== "production" && input.route.runtimeEnvironment !== "local" && input.route.runtimeEnvironment !== "test") throw new Error("AI_BUDGET_ROUTE_INVALID");
  if (input.route.disposition !== "model" || input.route.provider === null || input.route.modelId === null) throw new Error("AI_BUDGET_ROUTE_NOT_CALLABLE");
  const authorization = input.costAuthorization;
  if (authorization.version !== AI_PROVIDER_COST_AUTHORIZATION_V1_VERSION || authorization.runtimeEnvironment !== input.route.runtimeEnvironment || authorization.provider !== input.route.provider || authorization.modelId !== input.route.modelId || authorization.modelTier !== input.route.tier || authorization.routeCatalogVersion !== input.route.catalogVersion || authorization.pricingVersion !== input.route.pricingVersion || !authorization.fxPolicyVersion.trim() || !authorization.fxSnapshotVersion.trim() || !authorization.billingBoundVersion.trim() || !Number.isInteger(authorization.inputTokenUpperBound) || authorization.inputTokenUpperBound <= 0 || !Number.isInteger(authorization.outputTokenUpperBound) || authorization.outputTokenUpperBound !== input.route.maxOutputTokens || !Number.isFinite(authorization.tryMaximum) || authorization.tryMaximum <= 0 || authorization.tryMaximum > 300) throw new Error("AI_BUDGET_COST_AUTHORIZATION_INVALID");
  if ((input.route.runtimeEnvironment === "production") !== (authorization.authority === "production_runtime_config")) throw new Error("AI_BUDGET_COST_AUTHORITY_INVALID");
  const data = await rpc(input.serviceClient, AI_BUDGET_RESERVATION_RPC_V1, { p_request: {
    reservation_id: input.reservationId,
    user_id: input.userId,
    exam_profile_id: input.examProfileId,
    route_version: input.route.version,
    route_catalog_version: input.route.catalogVersion,
    provider: input.route.provider,
    model_id: input.route.modelId,
    model_tier: input.route.tier,
    pricing_version: input.route.pricingVersion,
    fx_policy_version: authorization.fxPolicyVersion,
    fx_snapshot_version: authorization.fxSnapshotVersion,
    billing_bound_version: authorization.billingBoundVersion,
    estimated_try_max: authorization.tryMaximum,
    request_id: input.requestId,
    correlation_id: input.correlationId,
    requested_at: input.requestedAt,
    expires_at: input.expiresAt,
  } }, "AI_BUDGET_RESERVATION_FAILED");
  if (typeof data.allowed !== "boolean" || typeof data.reason !== "string" || typeof data.accountingMonth !== "string" || typeof data.idempotent !== "boolean") throw new Error("AI_BUDGET_RESERVATION_RESULT_INVALID");
  return Object.freeze({ allowed: data.allowed, reason: data.reason as AiBudgetReservationDecisionV1["reason"], reservationId: data.reservationId === null ? null : String(data.reservationId), status: data.status === null ? null : data.status as AiPersistentBudgetReservationStatusV1, accountingMonth: data.accountingMonth, committedTry: finiteNumberOrNull(data.committedTry), idempotent: data.idempotent });
}

export async function markAiProviderAttemptStartedV1(input: { readonly serviceClient: Client; readonly reservationId: string; readonly providerAttemptId: string; readonly startedAt: string }): Promise<Record<string, unknown>> {
  return rpc(input.serviceClient, AI_BUDGET_ATTEMPT_STARTED_RPC_V1, { p_request: { reservation_id: input.reservationId, provider_attempt_id: input.providerAttemptId, started_at: input.startedAt } }, "AI_BUDGET_ATTEMPT_START_FAILED");
}

export async function releaseAiProviderBudgetV1(input: { readonly serviceClient: Client; readonly reservationId: string; readonly releasedAt: string; readonly reason: string }): Promise<Record<string, unknown>> {
  return rpc(input.serviceClient, AI_BUDGET_RELEASE_RPC_V1, { p_request: { reservation_id: input.reservationId, released_at: input.releasedAt, reason: input.reason } }, "AI_BUDGET_RELEASE_FAILED");
}

export async function requireAiProviderBudgetReconciliationV1(input: { readonly serviceClient: Client; readonly reservationId: string; readonly markedAt: string; readonly reason: string }): Promise<Record<string, unknown>> {
  return rpc(input.serviceClient, AI_BUDGET_RECONCILIATION_RPC_V1, { p_request: { reservation_id: input.reservationId, marked_at: input.markedAt, reason: input.reason } }, "AI_BUDGET_RECONCILIATION_FAILED");
}

export async function recordAiUsageAndSettleBudgetV1(input: { readonly serviceClient: Client; readonly reservationId: string; readonly event: AiUsageEventV1 }): Promise<Record<string, unknown>> {
  return rpc(input.serviceClient, AI_BUDGET_SETTLEMENT_RPC_V1, { p_reservation_id: input.reservationId, p_event: aiUsageEventToLedgerPayloadV1(input.event) }, "AI_BUDGET_SETTLEMENT_FAILED");
}

export async function expireAiProviderBudgetsV1(input: { readonly serviceClient: Client; readonly asOf: string }): Promise<{ readonly expiredCount: number; readonly reconciliationRequiredCount: number }> {
  const data = await rpc(input.serviceClient, AI_BUDGET_EXPIRY_RPC_V1, { p_as_of: input.asOf }, "AI_BUDGET_EXPIRY_FAILED");
  return Object.freeze({ expiredCount: finiteNumberOrNull(data.expiredCount) ?? 0, reconciliationRequiredCount: finiteNumberOrNull(data.reconciliationRequiredCount) ?? 0 });
}

export async function loadAiBudgetOperationalHealthV1(input: { readonly serviceClient: Client; readonly userId: string; readonly accountingMonth: string }): Promise<readonly Readonly<Record<string, unknown>>[]> {
  const result = await input.serviceClient.from("ai_budget_reservation_health_v1").select("user_id,exam_profile_id,reservation_id,accounting_month,status,provider_attempt_state,provider_attempt_id,usage_event_id,estimated_try_max,actual_try_amount,issue,estimated_actual_delta,created_at,expires_at,updated_at").eq("user_id", input.userId).eq("accounting_month", input.accountingMonth).order("created_at", { ascending: true });
  if (result.error) throw new Error(`AI_BUDGET_HEALTH_READ_FAILED:${result.error.code ?? "unknown"}`);
  return Object.freeze((result.data ?? []).map((row: Record<string, unknown>) => Object.freeze({ ...row })));
}
