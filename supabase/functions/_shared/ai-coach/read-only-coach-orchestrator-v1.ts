import {
  createAiUsageEventV1,
  estimateAiEvidenceV1,
  projectCoachEvidenceViewV1,
  routeAiCapabilityV1,
} from "../ai-coach.bundle.js";
import type {
  AiBudgetStateV1,
  AiComplexityClassV1,
  AiExpectedResponseClassV1,
  AiFxSnapshotV1,
  AiPricingCatalogV1,
  AiRouteCatalogV1,
  AiRuntimeEnvironmentV1,
  AiUsageEventV1,
} from "../../../../packages/domain/src/ai-coach/ai-economics-v1.ts";
import type { CoachContextV1 } from "../../../../packages/domain/src/ai-coach/coach-context-v1.ts";
import type { CoachEvidenceViewV1 } from "../../../../packages/domain/src/ai-coach/coach-evidence-view-v1.ts";
import { loadCoachContextV1ReadOnly } from "../coach-context-v1-readonly.ts";
import {
  markAiProviderAttemptStartedV1,
  recordAiUsageAndSettleBudgetV1,
  releaseAiProviderBudgetV1,
  requireAiProviderBudgetReconciliationV1,
  reserveAiProviderBudgetV1,
  type AiBudgetReservationDecisionV1,
} from "./ai-budget-reservation-v1.ts";
import {
  createOpenAiInputTokenCountResultV1,
  type AiOpenAiInputTokenCountResultV1,
} from "./openai-input-token-count-v1.ts";
import {
  createOpenAiRequestBillingBoundV1,
} from "./provider-openai-billing-bound-v1.ts";
import {
  authorizeControlledDevObservedProviderCostV1,
  authorizeRequestProviderCostMaximumV1,
} from "./provider-runtime-config-v1.ts";
import type { AiProviderRuntimeActivationV1 } from "./provider-runtime-activation-v1.ts";
import {
  extractOpenAiProviderAttemptObservationV1,
  providerObservationToUsageEventAttemptV1,
} from "./provider-attempt-v1.ts";
import {
  buildOpenAiCoachRequestV1,
  extractOpenAiStructuredResponseValueV1,
  fingerprintOpenAiCoachRequestV1,
  validateGroundedCoachResponseV1,
  type GroundedCoachResponseV1,
  type OpenAiCoachRequestFingerprintV1,
  type OpenAiCoachRequestV1,
  type OpenAiCoachSupportedCapabilityV1,
} from "./openai-coach-request-v1.ts";

export const READ_ONLY_COACH_ORCHESTRATOR_V1_VERSION = "read-only-coach-orchestrator-v1" as const;

type Client = any;

const CAPABILITY_EVIDENCE = Object.freeze({
  today_analysis: { scope: "today_explain", capability: "explain", expectedResponse: "medium", complexity: "medium" },
  subject_analysis: { scope: "subject_progress", capability: "progress_analysis", expectedResponse: "medium", complexity: "medium" },
  week_analysis: { scope: "week_progress", capability: "progress_analysis", expectedResponse: "medium", complexity: "high" },
  planner_explanation: { scope: "planner_explanation", capability: "planner_proposal_interpretation", expectedResponse: "medium", complexity: "medium" },
  complex_status_analysis: { scope: "general_status", capability: "status_analysis", expectedResponse: "long", complexity: "high" },
} as const);

export interface OpenAiInputCountTransportV1 {
  readonly authority: "test_fixture" | "openai_dev_gateway";
  readonly count: (input: {
    readonly request: OpenAiCoachRequestV1;
    readonly fingerprint: OpenAiCoachRequestFingerprintV1;
    readonly clientRequestId: string;
  }) => Promise<{
    readonly object: "response.input_tokens";
    readonly inputTokens: number;
    readonly countedAt: string;
    readonly requestFingerprint: string;
    readonly modelId: string;
    readonly clientRequestId: string;
    readonly providerRequestId: string | null;
  }>;
}

export interface OpenAiGenerationTransportV1 {
  readonly authority: "test_fixture" | "openai_dev_gateway";
  readonly execute: (input: {
    readonly request: OpenAiCoachRequestV1;
    readonly fingerprint: OpenAiCoachRequestFingerprintV1;
    readonly providerAttemptId: string;
    readonly clientRequestId: string;
  }) => Promise<
    | {
        readonly outcome: "known";
        readonly requestFingerprint: string;
        readonly modelId: string;
        readonly clientRequestId: string;
        readonly providerRequestId: string | null;
        readonly payload: unknown;
        readonly headers: Headers | Readonly<Record<string, string>> | null;
        readonly httpStatus: number;
        readonly startedAt: string;
        readonly completedAt: string;
      }
    | {
        readonly outcome: "unknown";
        readonly startedAt: string;
        readonly observedAt: string;
        readonly clientRequestId: string;
        readonly reason: "timeout_billing_unknown" | "connection_outcome_unknown";
      }
  >;
}

export interface ReadOnlyCoachAccountingGatewayV1 {
  readonly reserve: typeof reserveAiProviderBudgetV1;
  readonly markStarted: typeof markAiProviderAttemptStartedV1;
  readonly settle: typeof recordAiUsageAndSettleBudgetV1;
  readonly release: typeof releaseAiProviderBudgetV1;
  readonly reconcile: typeof requireAiProviderBudgetReconciliationV1;
}

export interface ReadOnlyCoachOrchestratorDependenciesV1 {
  readonly loadContext: typeof loadCoachContextV1ReadOnly;
  readonly inputCountTransport: OpenAiInputCountTransportV1;
  readonly generationTransport: OpenAiGenerationTransportV1;
  readonly accounting: ReadOnlyCoachAccountingGatewayV1;
}

export interface RunReadOnlyCoachCapabilityInputV1 {
  readonly contextClient: Client;
  readonly serviceClient: Client;
  readonly userId: string;
  readonly examProfileId: string;
  readonly capability: OpenAiCoachSupportedCapabilityV1;
  readonly subjectId?: string;
  readonly requestId: string;
  readonly correlationId: string;
  readonly reservationId: string;
  readonly providerAttemptId: string;
  readonly requestedAt: string;
  readonly reservationExpiresAt: string;
  readonly retryNumber?: number;
  readonly fallbackFromAttemptId?: string | null;
  readonly runtimeEnvironment: AiRuntimeEnvironmentV1;

  /**
   * Required only for the real controlled local DEV path.
   * Mock test execution does not need provider activation.
   */
  readonly providerRuntimeActivation?: AiProviderRuntimeActivationV1;
  readonly routingBudgetState: AiBudgetStateV1;
  readonly routeCatalog: AiRouteCatalogV1;
  readonly pricingCatalog: AiPricingCatalogV1;
  readonly fxSnapshot: AiFxSnapshotV1;
  readonly dependencies: Pick<ReadOnlyCoachOrchestratorDependenciesV1, "inputCountTransport" | "generationTransport"> & Partial<Pick<ReadOnlyCoachOrchestratorDependenciesV1, "loadContext" | "accounting">>;
}

export interface ReadOnlyCoachCapabilityResultV1 {
  readonly version: typeof READ_ONLY_COACH_ORCHESTRATOR_V1_VERSION;
  readonly response: GroundedCoachResponseV1;
  readonly accounting: Readonly<{
    readonly reservationId: string;
    readonly reservationStatus: "settled";
    readonly usageEventRecorded: true;
  }>;
  readonly observability: Readonly<{
    readonly requestId: string;
    readonly correlationId: string;
    readonly capability: OpenAiCoachSupportedCapabilityV1;
    readonly routeTier: string;
    readonly modelId: string;
    readonly requestFingerprint: string;
    readonly countClientRequestId: string;
    readonly countProviderRequestId: string | null;
    readonly reservationId: string;
    readonly providerAttemptId: string;
    readonly providerClientRequestId: string;
    readonly providerRequestId: string | null;
    readonly providerResponseId: string | null;
    readonly routeCatalogVersion: string;
    readonly pricingVersion: string;
    readonly fxPolicyVersion: string;
    readonly fxSnapshotVersion: string;
  }>;
  readonly noMutationPerformed: true;
}

const DEFAULT_ACCOUNTING: ReadOnlyCoachAccountingGatewayV1 = {
  reserve: reserveAiProviderBudgetV1,
  markStarted: markAiProviderAttemptStartedV1,
  settle: recordAiUsageAndSettleBudgetV1,
  release: releaseAiProviderBudgetV1,
  reconcile: requireAiProviderBudgetReconciliationV1,
};

function evidenceSelection(input: RunReadOnlyCoachCapabilityInputV1) {
  const selection = CAPABILITY_EVIDENCE[input.capability];
  return {
    scope: selection.scope,
    capability: selection.capability,
    ...(selection.scope === "subject_progress" ? { subjectId: input.subjectId } : {}),
  } as const;
}

function assertIdentity(context: CoachContextV1, input: RunReadOnlyCoachCapabilityInputV1): void {
  if (context.userId !== input.userId || context.examProfileId !== input.examProfileId) {
    throw new Error("READ_ONLY_COACH_CONTEXT_SCOPE_MISMATCH");
  }
}

function proofSource(
  at: string,
  transportAuthority: OpenAiInputCountTransportV1["authority"],
) {
  const isFixture = transportAuthority === "test_fixture";

  return Object.freeze({
    authority: "approved_server_config" as const,
    sourceId: isFixture
      ? "test-fixture:/responses/input_tokens"
      : "openai:/v1/responses/input_tokens",
    verificationId: isFixture
      ? "read-only-coach-orchestrator-mocked-transport-v1"
      : "controlled-dev-openai-input-count-v1",
    verifiedAt: at,
    loadedAt: at,
  });
}

async function assertRequestStillIdentical(
  request: OpenAiCoachRequestV1,
  expected: OpenAiCoachRequestFingerprintV1,
): Promise<void> {
  const actual = await fingerprintOpenAiCoachRequestV1(request);
  if (actual.value !== expected.value || actual.modelId !== expected.modelId) {
    throw new Error("OPENAI_COACH_REQUEST_CHANGED_AFTER_COUNT");
  }
}

function assertReservationAllowed(decision: AiBudgetReservationDecisionV1): void {
  if (!decision.allowed || decision.reservationId === null) {
    throw new Error(`READ_ONLY_COACH_BUDGET_DENIED:${decision.reason}`);
  }
}

export async function runReadOnlyCoachCapabilityV1(
  input: RunReadOnlyCoachCapabilityInputV1,
): Promise<ReadOnlyCoachCapabilityResultV1> {
  if (input.runtimeEnvironment === "production") {
    throw new Error("READ_ONLY_COACH_PRODUCTION_RUNTIME_DISABLED");
  }
  if (!input.userId.trim() || !input.examProfileId.trim() || !input.requestId.trim() || !input.correlationId.trim()) {
    throw new Error("READ_ONLY_COACH_IDENTITY_REQUIRED");
  }

  const isTestRuntime = input.runtimeEnvironment === "test";
  const isControlledLocalDev = input.runtimeEnvironment === "local";

  if (isTestRuntime) {
    if (
      input.dependencies.inputCountTransport.authority !== "test_fixture"
      || input.dependencies.generationTransport.authority !== "test_fixture"
    ) {
      throw new Error("READ_ONLY_COACH_TEST_TRANSPORT_AUTHORITY_INVALID");
    }
  }

  if (isControlledLocalDev) {
    const activation = input.providerRuntimeActivation;

    if (
      !activation
      || activation.availability !== "available"
      || activation.deploymentEnvironment !== "local_dev"
      || activation.scope !== "one_controlled_dev_smoke_v1"
      || activation.userId !== input.userId
      || activation.examProfileId !== input.examProfileId
      || activation.serverOwned !== true
      || activation.productionAllowed !== false
      || activation.inputCountBillingAuthority !== "explicitly_accepted_unresolved_dev"
      || input.dependencies.inputCountTransport.authority !== "openai_dev_gateway"
      || input.dependencies.generationTransport.authority !== "openai_dev_gateway"
      || input.routeCatalog.environment !== "local"
      || input.pricingCatalog.environment !== "local"
      || input.pricingCatalog.entries.some((entry) => entry.sourceKind !== "authoritative_config")
      || input.fxSnapshot.sourceKind !== "authoritative_config"
    ) {
      throw new Error("READ_ONLY_COACH_CONTROLLED_DEV_AUTHORITY_INVALID");
    }

    const evaluatedAt = Date.parse(input.requestedAt);
    const fxEffectiveAt = Date.parse(input.fxSnapshot.effectiveAt);
    const fxLoadedAt = Date.parse(input.fxSnapshot.loadedAt);

    if (
      !Number.isFinite(evaluatedAt)
      || !Number.isFinite(fxEffectiveAt)
      || !Number.isFinite(fxLoadedAt)
      || !Number.isInteger(input.fxSnapshot.maxAgeSeconds)
      || input.fxSnapshot.maxAgeSeconds <= 0
      || fxLoadedAt < fxEffectiveAt
      || fxLoadedAt > evaluatedAt
      || evaluatedAt < fxEffectiveAt
      || evaluatedAt - fxEffectiveAt > input.fxSnapshot.maxAgeSeconds * 1_000
    ) {
      throw new Error("READ_ONLY_COACH_CONTROLLED_DEV_FX_INVALID");
    }
  }
  const loadContext = input.dependencies.loadContext ?? loadCoachContextV1ReadOnly;
  const accounting = input.dependencies.accounting ?? DEFAULT_ACCOUNTING;
  const context = await loadContext({
    client: input.contextClient,
    userId: input.userId,
    requestId: input.requestId,
    now: new Date(input.requestedAt),
  });
  assertIdentity(context, input);

  const evidence = projectCoachEvidenceViewV1(context, evidenceSelection(input)) as CoachEvidenceViewV1;
  const evidenceBytes = new TextEncoder().encode(JSON.stringify(evidence)).byteLength;
  const routeShape = CAPABILITY_EVIDENCE[input.capability];
  const route = routeAiCapabilityV1({
    runtimeEnvironment: input.runtimeEnvironment,
    capability: input.capability,
    evidence: estimateAiEvidenceV1(evidenceBytes),
    expectedResponse: routeShape.expectedResponse as AiExpectedResponseClassV1,
    complexity: routeShape.complexity as AiComplexityClassV1,
    budgetState: input.routingBudgetState,
  }, input.routeCatalog);
  const request = buildOpenAiCoachRequestV1({ route, capability: input.capability, evidence, locale: context.locale });
  const fingerprint = await fingerprintOpenAiCoachRequestV1(request);
  const countClientRequestId = `count:${input.requestId}`;
  const providerClientRequestId = `attempt:${input.providerAttemptId}`;

  const counted = await input.dependencies.inputCountTransport.count({ request, fingerprint, clientRequestId: countClientRequestId });
  if (counted.object !== "response.input_tokens" || counted.clientRequestId !== countClientRequestId) throw new Error("OPENAI_INPUT_COUNT_RESPONSE_INVALID");
  const countIsTestFixture =
    input.dependencies.inputCountTransport.authority === "test_fixture";

  const countResult: AiOpenAiInputTokenCountResultV1 =
    createOpenAiInputTokenCountResultV1({
      request: {
        requestFingerprint: counted.requestFingerprint,
        modelId: counted.modelId,
        coverage: "complete_generation_request",
      },
      inputTokens: counted.inputTokens,
      countedAt: counted.countedAt,
      providerRequestId: counted.providerRequestId,
      authority: countIsTestFixture
        ? "test_fixture"
        : "openai_responses_input_token_count",
      billingTreatment: countIsTestFixture
        ? "test_fixture_no_charge"
        : "production_billing_status_unverified",
    });

  const bound = createOpenAiRequestBillingBoundV1(route, {
    authority: countIsTestFixture
      ? "test_fixture"
      : "approved_server_config",
    routeCatalogVersion: route.catalogVersion,
    pricingVersion: route.pricingVersion,
    provider: "openai",
    modelId: route.modelId as any,
    requestPayloadCoverage: "complete",
    tokenBoundMethod: "openai_responses_input_tokens_exact",
    enforcement: "server_rejects_above_bound",
    request: { requestFingerprint: fingerprint.value, modelId: fingerprint.modelId, coverage: "complete_generation_request" },
    count: countResult,
    source: proofSource(counted.countedAt, input.dependencies.inputCountTransport.authority),
  }, counted.countedAt);
  const authorization = isControlledLocalDev
    ? authorizeControlledDevObservedProviderCostV1({
        route,
        bound,
        pricingCatalog: input.pricingCatalog,
        fxSnapshot: input.fxSnapshot,
        evaluatedAt: input.requestedAt,
        activation: input.providerRuntimeActivation!,
        userId: input.userId,
        examProfileId: input.examProfileId,
      })
    : authorizeRequestProviderCostMaximumV1({
        route,
        bound,
        pricingCatalog: input.pricingCatalog,
        fxSnapshot: input.fxSnapshot,
        evaluatedAt: input.requestedAt,
      });
  await assertRequestStillIdentical(request, fingerprint);

  const reservation = await accounting.reserve({
    serviceClient: input.serviceClient,
    reservationId: input.reservationId,
    userId: input.userId,
    examProfileId: input.examProfileId,
    route,
    costAuthorization: authorization,
    requestId: input.requestId,
    correlationId: input.correlationId,
    requestedAt: input.requestedAt,
    expiresAt: input.reservationExpiresAt,
  });
  assertReservationAllowed(reservation);

  try {
    await accounting.markStarted({
      serviceClient: input.serviceClient,
      reservationId: input.reservationId,
      providerAttemptId: input.providerAttemptId,
      startedAt: input.requestedAt,
    });
  } catch (error) {
    await accounting.release({
      serviceClient: input.serviceClient,
      reservationId: input.reservationId,
      releasedAt: input.requestedAt,
      reason: "provider_attempt_not_started",
    });
    throw error;
  }

  await assertRequestStillIdentical(request, fingerprint);
  let execution: Awaited<ReturnType<OpenAiGenerationTransportV1["execute"]>>;
  try {
    execution = await input.dependencies.generationTransport.execute({ request, fingerprint, providerAttemptId: input.providerAttemptId, clientRequestId: providerClientRequestId });
  } catch (error) {
    await accounting.reconcile({
      serviceClient: input.serviceClient,
      reservationId: input.reservationId,
      markedAt: input.requestedAt,
      reason: "connection_outcome_unknown",
    });
    throw error;
  }
  if (execution.outcome === "unknown") {
    await accounting.reconcile({
      serviceClient: input.serviceClient,
      reservationId: input.reservationId,
      markedAt: execution.observedAt,
      reason: execution.reason,
    });
    throw new Error(`READ_ONLY_COACH_PROVIDER_OUTCOME_UNKNOWN:${execution.reason}`);
  }
  if (
    execution.requestFingerprint !== fingerprint.value
    || execution.modelId !== fingerprint.modelId
    || execution.clientRequestId !== providerClientRequestId
  ) {
    await accounting.reconcile({
      serviceClient: input.serviceClient,
      reservationId: input.reservationId,
      markedAt: execution.completedAt,
      reason: "provider_request_identity_mismatch",
    });
    throw new Error("OPENAI_COACH_SENT_REQUEST_MISMATCH");
  }

  let settlement: Awaited<ReturnType<ReadOnlyCoachAccountingGatewayV1["settle"]>>;
  let providerResponseId: string | null = null;
  try {
    const observation = extractOpenAiProviderAttemptObservationV1({
      payload: execution.payload,
      headers: execution.headers,
      httpStatus: execution.httpStatus,
      startedAt: execution.startedAt,
      completedAt: execution.completedAt,
      attemptNumber: (input.retryNumber ?? 0) + 1,
      retryNumber: input.retryNumber ?? 0,
      fallbackFromAttemptId: input.fallbackFromAttemptId ?? null,
    });
    if (observation.providerRequestId !== execution.providerRequestId) {
      throw new Error("OPENAI_COACH_PROVIDER_REQUEST_ID_MISMATCH");
    }
    providerResponseId = observation.providerResponseId;
    const attempt = providerObservationToUsageEventAttemptV1(observation);
    const inputBoundViolated = attempt.usage.availability === "reported"
      && attempt.usage.inputTokens !== bound.inputTokenUpperBound;
    const outputBoundViolated = attempt.usage.availability === "reported"
      && attempt.usage.outputTokens! > bound.outputTokenUpperBound;
    const usageForLedger = inputBoundViolated || outputBoundViolated
      ? { availability: "unavailable", inputTokens: null, cachedInputTokens: null, outputTokens: null, totalTokens: null, source: "provider_usage_unavailable" } as const
      : attempt.usage;
    const event: AiUsageEventV1 = createAiUsageEventV1({
      providerAttemptId: input.providerAttemptId,
      identity: { userId: input.userId, examProfileId: input.examProfileId },
      feature: { capability: input.capability, requestId: input.requestId, correlationId: input.correlationId },
      route,
      usage: usageForLedger,
      execution: attempt.execution,
      pricingCatalog: input.pricingCatalog,
      fxSnapshot: input.fxSnapshot,
    });
    settlement = await accounting.settle({ serviceClient: input.serviceClient, reservationId: input.reservationId, event });
  } catch (error) {
    await accounting.reconcile({
      serviceClient: input.serviceClient,
      reservationId: input.reservationId,
      markedAt: execution.completedAt,
      reason: "provider_usage_or_settlement_invalid",
    });
    throw error;
  }
  if (settlement.status !== "settled") throw new Error("READ_ONLY_COACH_ACCOUNTING_RECONCILIATION_REQUIRED");

  const response = validateGroundedCoachResponseV1({
    capability: input.capability,
    evidence,
    providerValue: extractOpenAiStructuredResponseValueV1(execution.payload),
  });
  return Object.freeze({
    version: READ_ONLY_COACH_ORCHESTRATOR_V1_VERSION,
    response,
    accounting: {
      reservationId: input.reservationId,
      reservationStatus: "settled" as const,
      usageEventRecorded: true as const,
    },
    observability: {
      requestId: input.requestId,
      correlationId: input.correlationId,
      capability: input.capability,
      routeTier: route.tier,
      modelId: route.modelId,
      requestFingerprint: fingerprint.value,
      countClientRequestId,
      countProviderRequestId: counted.providerRequestId,
      reservationId: input.reservationId,
      providerAttemptId: input.providerAttemptId,
      providerClientRequestId,
      providerRequestId: execution.providerRequestId,
      providerResponseId,
      routeCatalogVersion: route.catalogVersion,
      pricingVersion: route.pricingVersion,
      fxPolicyVersion: input.fxSnapshot.policyVersion,
      fxSnapshotVersion: input.fxSnapshot.snapshotVersion,
    },
    noMutationPerformed: true,
  });
}
