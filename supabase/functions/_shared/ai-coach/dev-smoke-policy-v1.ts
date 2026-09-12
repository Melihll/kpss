import { AI_OPENAI_BILLING_AUDIT_V1 } from "./provider-openai-billing-audit-v1.ts";

export const AI_COACH_DEV_SMOKE_POLICY_V1_VERSION =
  "ai-coach-dev-smoke-policy-v1" as const;

export const AI_COACH_DEV_SMOKE_POLICY_V1 = Object.freeze({
  version: AI_COACH_DEV_SMOKE_POLICY_V1_VERSION,
  status: "blocked_before_live_call" as const,
  environment: "local_dev" as const,
  capability: "today_analysis" as const,
  evidenceScope: "today_explain" as const,
  routeTier: "standard" as const,
  maximumEvidenceBytes: 16_384,
  maximumCompleteInputTokens: 200_000,
  maxOutputTokens: 900,
  authenticatedIdentityCount: 1,
  profileCount: 1,
  providerAttemptCount: 1,
  automaticRetryCount: 0,
  fallbackAllowed: false as const,
  killSwitchRequired: true as const,
  exactInputCountRequired: true as const,
  freshAuthoritativeFxRequired: true as const,
  atomicBudgetReservationRequired: true as const,
  rawPromptPersistenceAllowed: false as const,
  mutationAllowed: false as const,
  plannerOperationAllowed: false as const,
  productionDataAllowed: false as const,
  postAttemptLedgerInspectionRequired: true as const,
  hardMonthlyUserCeilingTry: 300,
  countEndpointBilling: AI_OPENAI_BILLING_AUDIT_V1.inputCountEndpointBilling,
  readyForDevSmoke: false as const,
  blockers: Object.freeze([
    "responses_input_token_count_endpoint_billing_unresolved",
  ]),
});

export function assertCoachDevSmokeRequestV1(input: {
  readonly environment: string;
  readonly capability: string;
  readonly evidenceBytes: number;
  readonly maxOutputTokens: number;
  readonly providerAttemptCount: number;
  readonly fallbackAllowed: boolean;
}): void {
  const policy = AI_COACH_DEV_SMOKE_POLICY_V1;
  if (
    input.environment !== policy.environment
    || input.capability !== policy.capability
    || !Number.isInteger(input.evidenceBytes)
    || input.evidenceBytes < 0
    || input.evidenceBytes > policy.maximumEvidenceBytes
    || input.maxOutputTokens !== policy.maxOutputTokens
    || input.providerAttemptCount !== 1
    || input.fallbackAllowed
  ) throw new Error("AI_COACH_DEV_SMOKE_POLICY_VIOLATION");
  if (!policy.readyForDevSmoke) throw new Error(`AI_COACH_DEV_SMOKE_BLOCKED:${policy.blockers.join(",")}`);
}
