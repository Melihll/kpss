import { routeAiCapabilityV1 } from "../ai-coach.bundle.js";
import type {
  AiCoachCapabilityV1,
  AiFxSnapshotV1,
  AiModelRouteDecisionV1,
  AiModelRouterInputV1,
  AiModelTierV1,
  AiPricingCatalogV1,
  AiRouteCatalogV1,
} from "../../../../packages/domain/src/ai-coach/ai-economics-v1.ts";

export const AI_PROVIDER_RUNTIME_CONFIG_V1_VERSION = "ai-provider-runtime-config-v1" as const;
export const AI_PROVIDER_BILLABLE_BOUND_V1_VERSION = "ai-provider-billable-bound-v1" as const;
export const AI_PROVIDER_COST_AUTHORIZATION_V1_VERSION = "ai-provider-cost-authorization-v1" as const;

export interface AiAuthoritativeConfigSourceV1 {
  readonly authority: "approved_server_config";
  readonly sourceId: string;
  readonly verificationId: string;
  readonly verifiedAt: string;
  readonly loadedAt: string;
}

export interface AiProviderBillableBoundV1 {
  readonly version: typeof AI_PROVIDER_BILLABLE_BOUND_V1_VERSION;
  readonly tier: Exclude<AiModelTierV1, "no_model">;
  readonly provider: string;
  readonly modelId: string;
  readonly pricingVersion: string;
  readonly effectiveFrom: string;
  readonly source: AiAuthoritativeConfigSourceV1;
  readonly inputTokenUpperBound: number;
  readonly outputTokenUpperBound: number;
  readonly requestPayloadCoverage: "complete";
  readonly inputBoundEnforcement: "server_rejects_above_bound";
  readonly providerOutputLimitEnforced: true;
  readonly reasoningTokensPricedAs: "output";
  readonly coveredBillableTokenClasses: readonly ["input", "cached_input", "output", "reasoning_output"];
  readonly uncoveredBillableTokenClasses: readonly string[];
}

export interface AiProviderCostAuthorizationV1 {
  readonly version: typeof AI_PROVIDER_COST_AUTHORIZATION_V1_VERSION;
  readonly authority: "production_runtime_config" | "test_fixture";
  readonly runtimeEnvironment: "production" | "test" | "local";
  readonly provider: string;
  readonly modelId: string;
  readonly modelTier: Exclude<AiModelTierV1, "no_model">;
  readonly routeCatalogVersion: string;
  readonly pricingVersion: string;
  readonly fxPolicyVersion: string;
  readonly fxSnapshotVersion: string;
  readonly billingBoundVersion: string;
  readonly inputTokenUpperBound: number;
  readonly outputTokenUpperBound: number;
  readonly tryMaximum: number;
}

export interface AiProductionRuntimeConfigCandidateV1 {
  readonly version: typeof AI_PROVIDER_RUNTIME_CONFIG_V1_VERSION;
  readonly environment: "production";
  readonly routeCatalog: AiRouteCatalogV1;
  readonly routeSource: AiAuthoritativeConfigSourceV1;
  readonly pricingCatalog: AiPricingCatalogV1;
  readonly pricingSource: AiAuthoritativeConfigSourceV1;
  readonly fxSnapshot: AiFxSnapshotV1;
  readonly capabilityRoutes: Readonly<Record<AiCoachCapabilityV1, readonly AiModelTierV1[]>>;
  readonly billingBounds: readonly AiProviderBillableBoundV1[];
}

export type AiProductionRuntimeConfigUnavailableReasonV1 =
  | "production_config_missing"
  | "production_config_invalid"
  | "production_route_catalog_unavailable"
  | "production_route_source_unverified"
  | "production_pricing_unavailable"
  | "production_pricing_source_unverified"
  | "production_fx_unavailable"
  | "production_fx_source_unverified"
  | "production_fx_stale"
  | "production_billing_bound_unavailable";

export type AiProductionRuntimeConfigResolutionV1 =
  | {
      readonly version: typeof AI_PROVIDER_RUNTIME_CONFIG_V1_VERSION;
      readonly availability: "available";
      readonly evaluatedAt: string;
      readonly config: AiProductionRuntimeConfigCandidateV1;
    }
  | {
      readonly version: typeof AI_PROVIDER_RUNTIME_CONFIG_V1_VERSION;
      readonly availability: "unavailable";
      readonly evaluatedAt: string;
      readonly reason: AiProductionRuntimeConfigUnavailableReasonV1;
      readonly config: null;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInstant(value: unknown): value is string {
  return typeof value === "string" && value.includes("T") && Number.isFinite(Date.parse(value));
}

function unavailable(reason: AiProductionRuntimeConfigUnavailableReasonV1, evaluatedAt: string): AiProductionRuntimeConfigResolutionV1 {
  return Object.freeze({ version: AI_PROVIDER_RUNTIME_CONFIG_V1_VERSION, availability: "unavailable", evaluatedAt, reason, config: null });
}

function sourceIsAuthoritative(value: unknown, evaluatedAt: string): value is AiAuthoritativeConfigSourceV1 {
  if (!isRecord(value)) return false;
  if (value.authority !== "approved_server_config") return false;
  if (typeof value.sourceId !== "string" || !value.sourceId.trim()) return false;
  if (typeof value.verificationId !== "string" || !value.verificationId.trim()) return false;
  if (!isInstant(value.verifiedAt) || !isInstant(value.loadedAt)) return false;
  return Date.parse(value.verifiedAt) <= Date.parse(value.loadedAt) && Date.parse(value.loadedAt) <= Date.parse(evaluatedAt);
}

function capabilityRoutesAreComplete(value: unknown): value is AiProductionRuntimeConfigCandidateV1["capabilityRoutes"] {
  if (!isRecord(value)) return false;
  const capabilities: readonly AiCoachCapabilityV1[] = [
    "deterministic_signal_evaluation", "intent_extraction", "short_explanation", "today_analysis", "week_analysis",
    "subject_analysis", "planner_explanation", "proactive_explanation", "conversation_summary", "complex_status_analysis",
  ];
  const tiers: readonly AiModelTierV1[] = ["no_model", "economy", "standard", "strong"];
  if (Object.keys(value).length !== capabilities.length) return false;
  return capabilities.every((capability) => Array.isArray(value[capability])
    && value[capability].length > 0
    && value[capability].every((tier) => tiers.includes(tier as AiModelTierV1)));
}

function billingBoundIsComplete(value: AiProviderBillableBoundV1, route: AiRouteCatalogV1["routes"][number], pricingVersion: string, evaluatedAt: string): boolean {
  return value.version === AI_PROVIDER_BILLABLE_BOUND_V1_VERSION
    && value.tier === route.tier
    && value.provider === route.provider
    && value.modelId === route.modelId
    && value.pricingVersion === pricingVersion
    && isInstant(value.effectiveFrom)
    && Date.parse(value.effectiveFrom) <= Date.parse(evaluatedAt)
    && sourceIsAuthoritative(value.source, evaluatedAt)
    && Number.isInteger(value.inputTokenUpperBound)
    && value.inputTokenUpperBound > 0
    && Number.isInteger(value.outputTokenUpperBound)
    && value.outputTokenUpperBound === route.maxOutputTokens
    && value.requestPayloadCoverage === "complete"
    && value.inputBoundEnforcement === "server_rejects_above_bound"
    && value.providerOutputLimitEnforced === true
    && value.reasoningTokensPricedAs === "output"
    && JSON.stringify(value.coveredBillableTokenClasses) === JSON.stringify(["input", "cached_input", "output", "reasoning_output"])
    && Array.isArray(value.uncoveredBillableTokenClasses)
    && value.uncoveredBillableTokenClasses.length === 0;
}

export function resolveProductionAiRuntimeConfigV1(candidate: unknown, evaluatedAt: string): AiProductionRuntimeConfigResolutionV1 {
  if (!isInstant(evaluatedAt)) throw new Error("AI_PRODUCTION_CONFIG_EVALUATED_AT_INVALID");
  if (candidate === null || candidate === undefined) return unavailable("production_config_missing", evaluatedAt);
  if (!isRecord(candidate) || candidate.version !== AI_PROVIDER_RUNTIME_CONFIG_V1_VERSION || candidate.environment !== "production") return unavailable("production_config_invalid", evaluatedAt);

  const routeCatalog = candidate.routeCatalog as AiRouteCatalogV1 | undefined;
  if (!routeCatalog || routeCatalog.environment !== "production" || routeCatalog.contractVersion !== "ai-model-router-v1" || routeCatalog.routes.length === 0 || !isInstant(routeCatalog.effectiveFrom) || Date.parse(routeCatalog.effectiveFrom) > Date.parse(evaluatedAt)) return unavailable("production_route_catalog_unavailable", evaluatedAt);
  if (!sourceIsAuthoritative(candidate.routeSource, evaluatedAt)) return unavailable("production_route_source_unverified", evaluatedAt);

  const pricingCatalog = candidate.pricingCatalog as AiPricingCatalogV1 | undefined;
  if (!pricingCatalog || pricingCatalog.environment !== "production" || pricingCatalog.contractVersion !== "ai-pricing-catalog-v1" || pricingCatalog.version !== routeCatalog.pricingVersion || pricingCatalog.entries.length === 0 || !isInstant(pricingCatalog.effectiveFrom) || Date.parse(pricingCatalog.effectiveFrom) > Date.parse(evaluatedAt)) return unavailable("production_pricing_unavailable", evaluatedAt);
  if (!sourceIsAuthoritative(candidate.pricingSource, evaluatedAt)) return unavailable("production_pricing_source_unverified", evaluatedAt);
  if (pricingCatalog.entries.some((entry) => entry.sourceKind !== "authoritative_config" || !entry.provider.trim() || !entry.modelId.trim() || !entry.billingCurrency.trim() || entry.inputPerMillionTokens <= 0 || entry.outputPerMillionTokens <= 0 || (entry.cachedInputPerMillionTokens !== null && entry.cachedInputPerMillionTokens < 0))) return unavailable("production_pricing_unavailable", evaluatedAt);
  const at = Date.parse(evaluatedAt);
  if (routeCatalog.routes.some((route) => !pricingCatalog.entries.some((entry) => entry.provider === route.provider && entry.modelId === route.modelId && Date.parse(entry.effectiveFrom) <= at && (entry.effectiveTo === null || at < Date.parse(entry.effectiveTo))))) return unavailable("production_pricing_unavailable", evaluatedAt);

  const fx = candidate.fxSnapshot as AiFxSnapshotV1 | undefined;
  if (!fx || fx.quoteCurrency !== "TRY" || !fx.baseCurrency.trim() || !Number.isFinite(fx.rate) || fx.rate <= 0 || !isInstant(fx.effectiveAt) || !isInstant(fx.loadedAt) || !Number.isInteger(fx.maxAgeSeconds) || fx.maxAgeSeconds <= 0) return unavailable("production_fx_unavailable", evaluatedAt);
  if (fx.sourceKind !== "authoritative_config" || !fx.source.trim()) return unavailable("production_fx_source_unverified", evaluatedAt);
  if (Date.parse(fx.loadedAt) < Date.parse(fx.effectiveAt) || Date.parse(fx.loadedAt) > at || at < Date.parse(fx.effectiveAt) || at - Date.parse(fx.effectiveAt) > fx.maxAgeSeconds * 1_000) return unavailable("production_fx_stale", evaluatedAt);
  if (!capabilityRoutesAreComplete(candidate.capabilityRoutes)) return unavailable("production_config_invalid", evaluatedAt);
  const billingBounds = candidate.billingBounds as readonly AiProviderBillableBoundV1[] | undefined;
  if (!Array.isArray(billingBounds) || billingBounds.length !== routeCatalog.routes.length || routeCatalog.routes.some((route) => {
    const matches = billingBounds.filter((bound) => bound.tier === route.tier && bound.provider === route.provider && bound.modelId === route.modelId);
    return matches.length !== 1 || !billingBoundIsComplete(matches[0], route, pricingCatalog.version, evaluatedAt);
  })) return unavailable("production_billing_bound_unavailable", evaluatedAt);

  const config = candidate as unknown as AiProductionRuntimeConfigCandidateV1;
  return Object.freeze({ version: AI_PROVIDER_RUNTIME_CONFIG_V1_VERSION, availability: "available", evaluatedAt, config });
}

export function authorizeProductionProviderCostMaximumV1(
  route: AiModelRouteDecisionV1,
  resolution: AiProductionRuntimeConfigResolutionV1,
): AiProviderCostAuthorizationV1 {
  if (resolution.availability !== "available") throw new Error(`AI_PRODUCTION_RUNTIME_UNAVAILABLE:${resolution.reason}`);
  if (route.runtimeEnvironment !== "production" || route.disposition !== "model" || route.provider === null || route.modelId === null || route.catalogVersion !== resolution.config.routeCatalog.version || route.pricingVersion !== resolution.config.pricingCatalog.version) throw new Error("AI_PRODUCTION_COST_ROUTE_INVALID");
  const bound = resolution.config.billingBounds.find((item) => item.tier === route.tier && item.provider === route.provider && item.modelId === route.modelId);
  const price = resolution.config.pricingCatalog.entries.find((item) => item.provider === route.provider && item.modelId === route.modelId && Date.parse(item.effectiveFrom) <= Date.parse(resolution.evaluatedAt) && (item.effectiveTo === null || Date.parse(resolution.evaluatedAt) < Date.parse(item.effectiveTo)));
  if (!bound || !price) throw new Error("AI_PRODUCTION_COST_BOUND_UNAVAILABLE");
  const maximumInputRate = Math.max(price.inputPerMillionTokens, price.cachedInputPerMillionTokens ?? price.inputPerMillionTokens);
  const nativeMaximum = bound.inputTokenUpperBound * maximumInputRate / 1_000_000 + bound.outputTokenUpperBound * price.outputPerMillionTokens / 1_000_000;
  const tryMaximum = Math.round(nativeMaximum * resolution.config.fxSnapshot.rate * 1_000_000) / 1_000_000;
  if (!Number.isFinite(tryMaximum) || tryMaximum <= 0 || tryMaximum > 300) throw new Error("AI_PRODUCTION_COST_MAXIMUM_NOT_RESERVABLE");
  return Object.freeze({
    version: AI_PROVIDER_COST_AUTHORIZATION_V1_VERSION,
    authority: "production_runtime_config",
    runtimeEnvironment: "production",
    provider: route.provider,
    modelId: route.modelId,
    modelTier: route.tier,
    routeCatalogVersion: route.catalogVersion,
    pricingVersion: route.pricingVersion,
    fxPolicyVersion: resolution.config.fxSnapshot.policyVersion,
    fxSnapshotVersion: resolution.config.fxSnapshot.snapshotVersion,
    billingBoundVersion: bound.version,
    inputTokenUpperBound: bound.inputTokenUpperBound,
    outputTokenUpperBound: bound.outputTokenUpperBound,
    tryMaximum,
  });
}

export function routeProductionAiCapabilityV1(
  input: Omit<AiModelRouterInputV1, "runtimeEnvironment">,
  resolution: AiProductionRuntimeConfigResolutionV1,
): AiModelRouteDecisionV1 {
  if (resolution.availability !== "available") throw new Error(`AI_PRODUCTION_RUNTIME_UNAVAILABLE:${resolution.reason}`);
  const decision = routeAiCapabilityV1({ ...input, runtimeEnvironment: "production" }, resolution.config.routeCatalog);
  if (!resolution.config.capabilityRoutes[input.capability].includes(decision.tier)) throw new Error("AI_PRODUCTION_CAPABILITY_ROUTE_UNAVAILABLE");
  return decision;
}
