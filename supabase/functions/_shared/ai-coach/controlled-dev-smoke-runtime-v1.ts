import type {
  AiFxSnapshotV1,
  AiPricingCatalogV1,
  AiRouteCatalogV1,
} from "../../../../packages/domain/src/ai-coach/ai-economics-v1.ts";

import {
  loadOpenAiServerCredentialV1,
  type OpenAiServerCredentialV1,
} from "./openai-server-secret-v1.ts";

import {
  acquireTcmbUsdTrySnapshotV1,
  type ParsedTcmbUsdTryPublicationV1,
} from "./provider-fx-acquisition-v1.ts";

import {
  validateApprovedTcmbUsdTryFxSnapshotV1,
} from "./provider-fx-policy-v1.ts";

import {
  AI_OPENAI_PRICING_CATALOG_V1,
  AI_OPENAI_ROUTE_CATALOG_V1,
} from "./provider-runtime-catalog-v1.ts";

import {
  resolveAiProviderRuntimeActivationV1,
  type AiProviderRuntimeActivationV1,
} from "./provider-runtime-activation-v1.ts";

export const CONTROLLED_DEV_SMOKE_RUNTIME_V1_VERSION =
  "controlled-dev-smoke-runtime-v1-2026-09-12" as const;

export const AI_OPENAI_CONTROLLED_DEV_ROUTE_CATALOG_V1:
  AiRouteCatalogV1 = Object.freeze({
    ...AI_OPENAI_ROUTE_CATALOG_V1,

    version:
      `${AI_OPENAI_ROUTE_CATALOG_V1.version}-controlled-dev-v1`,

    environment: "local",

    // The first controlled smoke is exactly one provider attempt.
    // No retry and no fallback authority is carried into this catalog.
    routes: Object.freeze(
      AI_OPENAI_ROUTE_CATALOG_V1.routes.map((route) =>
        Object.freeze({
          ...route,
          retryPolicy: Object.freeze({
            maxAttempts: 1,
            retryableCategories: Object.freeze([]),
          }),
          fallbackTier: null,
        })
      ),
    ),
  });

export const AI_OPENAI_CONTROLLED_DEV_PRICING_CATALOG_V1:
  AiPricingCatalogV1 = Object.freeze({
    ...AI_OPENAI_PRICING_CATALOG_V1,

    // Same authoritative OpenAI pricing evidence, local runtime envelope.
    environment: "local",

    entries: Object.freeze(
      AI_OPENAI_PRICING_CATALOG_V1.entries.map((entry) =>
        Object.freeze({
          ...entry,
          sourceKind: "authoritative_config" as const,
        })
      ),
    ),
  });

export interface ControlledDevSmokeRuntimePreparationV1 {
  readonly version: typeof CONTROLLED_DEV_SMOKE_RUNTIME_V1_VERSION;

  readonly activation: Extract<
    AiProviderRuntimeActivationV1,
    { availability: "available" }
  >;

  readonly credential: OpenAiServerCredentialV1;

  readonly routeCatalog: AiRouteCatalogV1;
  readonly pricingCatalog: AiPricingCatalogV1;
  readonly fxSnapshot: AiFxSnapshotV1;

  readonly providerCallMade: false;
  readonly productionAllowed: false;
}

export async function acquireControlledDevFxSnapshotForOperatorV1(input: {
  readonly fetchImpl: (
    url: string,
    init: RequestInit,
  ) => Promise<Response>;

  readonly loadedAt: string;
}): Promise<ParsedTcmbUsdTryPublicationV1> {
  const acquired = await acquireTcmbUsdTrySnapshotV1({
    fetchImpl: input.fetchImpl,
    loadedAt: input.loadedAt,
  });

  const validation =
    validateApprovedTcmbUsdTryFxSnapshotV1(
      acquired.snapshot,
      input.loadedAt,
    );

  if (!validation.valid) {
    throw new Error(
      `AI_CONTROLLED_DEV_FX_ACQUISITION_INVALID:${validation.reason}`,
    );
  }

  return acquired;
}

export function prepareControlledDevSmokeRuntimeV1(input: {
  readonly serverConfig:
    Readonly<Record<string, string | undefined>>;

  readonly serverSecrets:
    Readonly<Record<string, string | undefined>>;

  readonly userId: string;
  readonly examProfileId: string;

  /**
   * Must be acquired before the provider request path.
   * This function itself performs no FX network request.
   */
  readonly fxSnapshot: AiFxSnapshotV1;

  readonly evaluatedAt: string;
}): ControlledDevSmokeRuntimePreparationV1 {
  if (
    !input.userId.trim()
    || !input.examProfileId.trim()
    || !input.evaluatedAt.includes("T")
    || !Number.isFinite(Date.parse(input.evaluatedAt))
  ) {
    throw new Error("AI_CONTROLLED_DEV_PREPARATION_INPUT_INVALID");
  }

  const activation =
    resolveAiProviderRuntimeActivationV1({
      deploymentEnvironment: "local_dev",
      serverConfig: input.serverConfig,
      userId: input.userId,
      examProfileId: input.examProfileId,
    });

  if (activation.availability !== "available") {
    throw new Error(
      `AI_CONTROLLED_DEV_RUNTIME_ACTIVATION_UNAVAILABLE:${activation.reason}`,
    );
  }

  if (
    activation.scope !== "one_controlled_dev_smoke_v1"
    || activation.deploymentEnvironment !== "local_dev"
    || activation.inputCountBillingAuthority
      !== "explicitly_accepted_unresolved_dev"
    || activation.serverOwned !== true
    || activation.productionAllowed !== false
  ) {
    throw new Error("AI_CONTROLLED_DEV_RUNTIME_AUTHORITY_INVALID");
  }

  const fxValidation =
    validateApprovedTcmbUsdTryFxSnapshotV1(
      input.fxSnapshot,
      input.evaluatedAt,
    );

  if (!fxValidation.valid) {
    throw new Error(
      `AI_CONTROLLED_DEV_FX_INVALID:${fxValidation.reason}`,
    );
  }

  const credential =
    loadOpenAiServerCredentialV1(input.serverSecrets);

  if (
    AI_OPENAI_CONTROLLED_DEV_ROUTE_CATALOG_V1.environment !== "local"
    || AI_OPENAI_CONTROLLED_DEV_PRICING_CATALOG_V1.environment !== "local"
    || AI_OPENAI_CONTROLLED_DEV_ROUTE_CATALOG_V1.pricingVersion
      !== AI_OPENAI_CONTROLLED_DEV_PRICING_CATALOG_V1.version
    || AI_OPENAI_CONTROLLED_DEV_ROUTE_CATALOG_V1.routes.some(
      (route) =>
        route.provider !== "openai"
        || route.retryPolicy.maxAttempts !== 1
        || route.retryPolicy.retryableCategories.length !== 0
        || route.fallbackTier !== null,
    )
    || AI_OPENAI_CONTROLLED_DEV_PRICING_CATALOG_V1.entries.some(
      (entry) =>
        entry.provider !== "openai"
        || entry.sourceKind !== "authoritative_config",
    )
  ) {
    throw new Error("AI_CONTROLLED_DEV_CATALOG_INVALID");
  }

  return Object.freeze({
    version: CONTROLLED_DEV_SMOKE_RUNTIME_V1_VERSION,

    activation,
    credential,

    routeCatalog:
      AI_OPENAI_CONTROLLED_DEV_ROUTE_CATALOG_V1,

    pricingCatalog:
      AI_OPENAI_CONTROLLED_DEV_PRICING_CATALOG_V1,

    fxSnapshot: input.fxSnapshot,

    providerCallMade: false as const,
    productionAllowed: false as const,
  });
}
