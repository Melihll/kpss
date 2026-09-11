import { aggregateMonthlyAiUsageV1 } from "../ai-coach.bundle.js";
import type {
  AiMonthlyBudgetSummaryV1,
  AiNativeCostV1,
  AiTryCostV1,
  AiUsageEventV1,
} from "../../../../packages/domain/src/ai-coach/ai-economics-v1.ts";

type Client = any;

export const AI_USAGE_LEDGER_V1_RPC = "record_ai_usage_event_v1" as const;

export interface AiUsageLedgerWriteResultV1 {
  readonly eventId: string;
  readonly providerAttemptId: string;
  readonly idempotent: boolean;
}

export interface AiUsageLedgerMonthV1 {
  readonly events: readonly AiUsageEventV1[];
  readonly budget: AiMonthlyBudgetSummaryV1;
}

const AI_USAGE_LEDGER_SELECT_V1 = [
  "event_version", "provider_attempt_id", "provider_request_id", "provider_request_id_source", "user_id", "exam_profile_id", "capability", "request_id", "correlation_id",
  "route_version", "route_catalog_version", "route_reason_code", "provider", "model_id", "model_tier", "pricing_version",
  "usage_availability", "input_tokens", "cached_input_tokens", "output_tokens", "total_tokens", "usage_source",
  "started_at", "completed_at", "latency_ms", "status", "retry_number", "fallback_from_attempt_id", "error_category",
  "native_cost_state", "native_cost_amount", "native_currency", "native_cost_reason", "uncached_input_cost", "cached_input_cost", "output_cost",
  "try_cost_state", "try_estimated_cost", "try_cost_reason", "fx_policy_version", "fx_snapshot_version", "fx_source", "fx_source_kind",
  "fx_base_currency", "fx_quote_currency", "fx_rate", "fx_effective_at", "fx_loaded_at", "fx_max_age_seconds", "accounting_month",
].join(",");

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error("AI_USAGE_LEDGER_NUMERIC_VALUE_INVALID");
  return parsed;
}

function eventFromRow(row: Record<string, unknown>): AiUsageEventV1 {
  const nativeCost: AiNativeCostV1 = row.native_cost_state === "known"
    ? {
        state: "known",
        pricingVersion: String(row.pricing_version),
        nativeAmount: numberOrNull(row.native_cost_amount)!,
        nativeCurrency: String(row.native_currency),
        components: {
          uncachedInput: numberOrNull(row.uncached_input_cost)!,
          cachedInput: numberOrNull(row.cached_input_cost)!,
          output: numberOrNull(row.output_cost)!,
        },
      }
    : {
        state: "unpriced",
        pricingVersion: String(row.pricing_version),
        nativeAmount: null,
        nativeCurrency: row.native_currency === null ? null : String(row.native_currency),
        reason: String(row.native_cost_reason) as Extract<AiNativeCostV1, { state: "unpriced" }>["reason"],
      };
  const hasFx = row.fx_snapshot_version !== null;
  const fx = hasFx ? {
    policyVersion: String(row.fx_policy_version) as "ai-fx-policy-v1",
    snapshotVersion: String(row.fx_snapshot_version),
    source: String(row.fx_source),
    sourceKind: String(row.fx_source_kind) as "test_fixture" | "authoritative_config",
    baseCurrency: String(row.fx_base_currency),
    quoteCurrency: "TRY" as const,
    rate: numberOrNull(row.fx_rate)!,
    effectiveAt: String(row.fx_effective_at),
    loadedAt: String(row.fx_loaded_at),
    maxAgeSeconds: numberOrNull(row.fx_max_age_seconds)!,
  } : null;
  const tryCost: AiTryCostV1 = row.try_cost_state === "known"
    ? { state: "known", amount: numberOrNull(row.try_estimated_cost)!, currency: "TRY", fx: fx! }
    : { state: "unknown", amount: null, currency: "TRY", reason: String(row.try_cost_reason) as Extract<AiTryCostV1, { state: "unknown" }>["reason"], fx };
  return Object.freeze({
    version: "ai-usage-event-v1",
    providerAttemptId: String(row.provider_attempt_id),
    providerRequestId: row.provider_request_id === null ? null : String(row.provider_request_id),
    providerRequestIdSource: String(row.provider_request_id_source) as AiUsageEventV1["providerRequestIdSource"],
    userId: String(row.user_id),
    examProfileId: row.exam_profile_id === null ? null : String(row.exam_profile_id),
    capability: String(row.capability) as AiUsageEventV1["capability"],
    requestId: String(row.request_id),
    correlationId: String(row.correlation_id),
    routeVersion: "ai-model-router-v1",
    routeCatalogVersion: String(row.route_catalog_version),
    provider: String(row.provider),
    modelId: String(row.model_id),
    tier: String(row.model_tier) as AiUsageEventV1["tier"],
    routeReasonCode: String(row.route_reason_code) as AiUsageEventV1["routeReasonCode"],
    pricingVersion: String(row.pricing_version),
    usage: {
      availability: String(row.usage_availability) as AiUsageEventV1["usage"]["availability"],
      inputTokens: numberOrNull(row.input_tokens),
      cachedInputTokens: numberOrNull(row.cached_input_tokens),
      outputTokens: numberOrNull(row.output_tokens),
      totalTokens: numberOrNull(row.total_tokens),
      source: String(row.usage_source) as AiUsageEventV1["usage"]["source"],
    },
    startedAt: String(row.started_at),
    completedAt: String(row.completed_at),
    latencyMs: numberOrNull(row.latency_ms)!,
    status: String(row.status) as AiUsageEventV1["status"],
    retryNumber: numberOrNull(row.retry_number)!,
    fallbackFromAttemptId: row.fallback_from_attempt_id === null ? null : String(row.fallback_from_attempt_id),
    errorCategory: String(row.error_category) as AiUsageEventV1["errorCategory"],
    nativeCost,
    tryCost,
    accountingMonth: String(row.accounting_month),
    privacy: { rawPromptStored: false, rawConversationStored: false, fullCoachContextStored: false },
  });
}

export function aiUsageEventToLedgerPayloadV1(event: AiUsageEventV1): Readonly<Record<string, unknown>> {
  if (event.version !== "ai-usage-event-v1") throw new Error("AI_USAGE_EVENT_VERSION_UNSUPPORTED");
  if (event.nativeCost.state === "not_applicable" || event.tryCost.state === "not_applicable") throw new Error("AI_USAGE_LEDGER_PROVIDER_ATTEMPT_REQUIRED");
  const payload = {
    event_version: event.version,
    provider_attempt_id: event.providerAttemptId,
    provider_request_id: event.providerRequestId,
    provider_request_id_source: event.providerRequestIdSource,
    user_id: event.userId,
    exam_profile_id: event.examProfileId,
    capability: event.capability,
    request_id: event.requestId,
    correlation_id: event.correlationId,
    route_version: event.routeVersion,
    route_catalog_version: event.routeCatalogVersion,
    route_reason_code: event.routeReasonCode,
    provider: event.provider,
    model_id: event.modelId,
    model_tier: event.tier,
    pricing_version: event.pricingVersion,
    usage_availability: event.usage.availability,
    input_tokens: event.usage.inputTokens,
    cached_input_tokens: event.usage.cachedInputTokens,
    output_tokens: event.usage.outputTokens,
    total_tokens: event.usage.totalTokens,
    usage_source: event.usage.source,
    started_at: event.startedAt,
    completed_at: event.completedAt,
    latency_ms: event.latencyMs,
    status: event.status,
    retry_number: event.retryNumber,
    fallback_from_attempt_id: event.fallbackFromAttemptId,
    error_category: event.errorCategory,
    native_cost_state: event.nativeCost.state,
    native_cost_amount: event.nativeCost.nativeAmount,
    native_currency: event.nativeCost.nativeCurrency,
    native_cost_reason: event.nativeCost.state === "unpriced" ? event.nativeCost.reason : null,
    uncached_input_cost: event.nativeCost.state === "known" ? event.nativeCost.components.uncachedInput : null,
    cached_input_cost: event.nativeCost.state === "known" ? event.nativeCost.components.cachedInput : null,
    output_cost: event.nativeCost.state === "known" ? event.nativeCost.components.output : null,
    try_cost_state: event.tryCost.state,
    try_estimated_cost: event.tryCost.amount,
    try_cost_reason: event.tryCost.state === "unknown" ? event.tryCost.reason : null,
    fx_policy_version: event.tryCost.fx?.policyVersion ?? null,
    fx_snapshot_version: event.tryCost.fx?.snapshotVersion ?? null,
    fx_source: event.tryCost.fx?.source ?? null,
    fx_source_kind: event.tryCost.fx?.sourceKind ?? null,
    fx_base_currency: event.tryCost.fx?.baseCurrency ?? null,
    fx_quote_currency: event.tryCost.fx?.quoteCurrency ?? null,
    fx_rate: event.tryCost.fx?.rate ?? null,
    fx_effective_at: event.tryCost.fx?.effectiveAt ?? null,
    fx_loaded_at: event.tryCost.fx?.loadedAt ?? null,
    fx_max_age_seconds: event.tryCost.fx?.maxAgeSeconds ?? null,
    accounting_month: event.accountingMonth,
  } as const;
  const serialized = JSON.stringify(payload);
  if (/"(prompt|message|conversation|coach_context|api_key|secret)"\s*:/i.test(serialized)) throw new Error("AI_USAGE_LEDGER_FORBIDDEN_PAYLOAD_FIELD");
  return Object.freeze(payload);
}

export async function recordAiUsageEventV1(
  serviceClient: Client,
  event: AiUsageEventV1,
): Promise<AiUsageLedgerWriteResultV1> {
  const result = await serviceClient.rpc(AI_USAGE_LEDGER_V1_RPC, {
    p_event: aiUsageEventToLedgerPayloadV1(event),
  });
  if (result.error) throw new Error(`AI_USAGE_LEDGER_WRITE_FAILED:${result.error.code ?? "unknown"}`);
  const data = result.data as Record<string, unknown> | null;
  if (!data || typeof data.eventId !== "string" || typeof data.providerAttemptId !== "string" || typeof data.idempotent !== "boolean") throw new Error("AI_USAGE_LEDGER_WRITE_RESULT_INVALID");
  return Object.freeze({ eventId: data.eventId, providerAttemptId: data.providerAttemptId, idempotent: data.idempotent });
}

export async function loadAiUsageLedgerMonthV1(input: {
  readonly client: Client;
  readonly userId: string;
  readonly examProfileId: string | null;
  readonly accountingMonth: string;
}): Promise<AiUsageLedgerMonthV1> {
  let query = input.client.from("ai_usage_events")
    .select(AI_USAGE_LEDGER_SELECT_V1)
    .eq("user_id", input.userId)
    .eq("accounting_month", input.accountingMonth)
    .order("completed_at", { ascending: true })
    .order("id", { ascending: true });
  if (input.examProfileId !== null) query = query.eq("exam_profile_id", input.examProfileId);
  const result = await query;
  if (result.error) throw new Error(`AI_USAGE_LEDGER_READ_FAILED:${result.error.code ?? "unknown"}`);
  const events = Object.freeze((result.data ?? []).map((row: Record<string, unknown>) => eventFromRow(row)));
  if (events.some((event) => event.userId !== input.userId || (input.examProfileId !== null && event.examProfileId !== input.examProfileId))) throw new Error("AI_USAGE_LEDGER_SCOPE_VIOLATION");
  return Object.freeze({
    events,
    budget: aggregateMonthlyAiUsageV1({
      userId: input.userId,
      examProfileId: input.examProfileId,
      accountingMonth: input.accountingMonth,
      events,
    }),
  });
}
