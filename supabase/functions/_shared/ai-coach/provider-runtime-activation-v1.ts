import {
  AI_OPENAI_BILLING_AUDIT_V1,
  AI_OPENAI_BILLING_AUDIT_V1_VERSION,
} from "./provider-openai-billing-audit-v1.ts";

export const AI_PROVIDER_RUNTIME_ACTIVATION_V1_VERSION =
  "ai-provider-runtime-activation-v1" as const;

export const AI_PROVIDER_RUNTIME_SERVER_KEYS_V1 = Object.freeze({
  enabled: "AI_PROVIDER_RUNTIME_ENABLED",
  environment: "AI_PROVIDER_RUNTIME_ENVIRONMENT",
  scope: "AI_PROVIDER_RUNTIME_SCOPE",
  allowedUserId: "AI_PROVIDER_RUNTIME_ALLOWED_USER_ID",
  allowedProfileId: "AI_PROVIDER_RUNTIME_ALLOWED_PROFILE_ID",
} as const);

export type AiProviderRuntimeActivationV1 =
  | Readonly<{
      version: typeof AI_PROVIDER_RUNTIME_ACTIVATION_V1_VERSION;
      availability: "available";
      deploymentEnvironment: "local_dev" | "test";
      scope: "one_controlled_dev_smoke_v1" | "mock_test_only";
      userId: string;
      examProfileId: string;
      billingAuditVersion: typeof AI_OPENAI_BILLING_AUDIT_V1_VERSION | "test_fixture";
      serverOwned: true;
      productionAllowed: false;
    }>
  | Readonly<{
      version: typeof AI_PROVIDER_RUNTIME_ACTIVATION_V1_VERSION;
      availability: "unavailable";
      reason:
        | "runtime_switch_off"
        | "runtime_switch_malformed"
        | "production_prohibited"
        | "environment_mismatch"
        | "scope_invalid"
        | "allowlist_missing"
        | "identity_not_allowlisted"
        | "billing_gate_unavailable";
      serverOwned: true;
      productionAllowed: false;
    }>;

export interface AiProviderRuntimeBillingGateV1 {
  readonly authority: "official_audit" | "test_fixture";
  readonly auditVersion: typeof AI_OPENAI_BILLING_AUDIT_V1_VERSION | "test_fixture";
  readonly inputCountEndpointBilling: "documented_no_charge" | "unresolved" | "test_fixture_no_charge";
}

export const AI_PROVIDER_RUNTIME_BILLING_GATE_V1: AiProviderRuntimeBillingGateV1 = Object.freeze({
  authority: "official_audit",
  auditVersion: AI_OPENAI_BILLING_AUDIT_V1.version,
  inputCountEndpointBilling: AI_OPENAI_BILLING_AUDIT_V1.inputCountEndpointBilling,
});

function unavailable(reason: Extract<AiProviderRuntimeActivationV1, { availability: "unavailable" }>["reason"]): AiProviderRuntimeActivationV1 {
  return Object.freeze({
    version: AI_PROVIDER_RUNTIME_ACTIVATION_V1_VERSION,
    availability: "unavailable",
    reason,
    serverOwned: true,
    productionAllowed: false,
  });
}

/**
 * The caller must supply server-owned configuration. No request/body field is
 * accepted by this contract, so user input cannot turn provider runtime on.
 */
export function resolveAiProviderRuntimeActivationV1(input: {
  readonly deploymentEnvironment: "local_dev" | "test" | "production";
  readonly serverConfig: Readonly<Record<string, string | undefined>>;
  readonly userId: string;
  readonly examProfileId: string;
  readonly billingGate?: AiProviderRuntimeBillingGateV1;
}): AiProviderRuntimeActivationV1 {
  if (input.deploymentEnvironment === "production") return unavailable("production_prohibited");
  const enabled = input.serverConfig[AI_PROVIDER_RUNTIME_SERVER_KEYS_V1.enabled];
  if (enabled === undefined || enabled === "false") return unavailable("runtime_switch_off");
  if (enabled !== "true") return unavailable("runtime_switch_malformed");

  const expectedEnvironment = input.deploymentEnvironment === "test" ? "test" : "local_dev";
  if (input.serverConfig[AI_PROVIDER_RUNTIME_SERVER_KEYS_V1.environment] !== expectedEnvironment) {
    return unavailable("environment_mismatch");
  }
  const expectedScope = input.deploymentEnvironment === "test"
    ? "mock_test_only"
    : "one_controlled_dev_smoke_v1";
  if (input.serverConfig[AI_PROVIDER_RUNTIME_SERVER_KEYS_V1.scope] !== expectedScope) {
    return unavailable("scope_invalid");
  }
  const allowedUserId = input.serverConfig[AI_PROVIDER_RUNTIME_SERVER_KEYS_V1.allowedUserId]?.trim();
  const allowedProfileId = input.serverConfig[AI_PROVIDER_RUNTIME_SERVER_KEYS_V1.allowedProfileId]?.trim();
  if (!allowedUserId || !allowedProfileId) return unavailable("allowlist_missing");
  if (input.userId !== allowedUserId || input.examProfileId !== allowedProfileId) {
    return unavailable("identity_not_allowlisted");
  }

  const billingGate = input.billingGate ?? AI_PROVIDER_RUNTIME_BILLING_GATE_V1;
  const billingAllowed = input.deploymentEnvironment === "test"
    ? billingGate.authority === "test_fixture" && billingGate.inputCountEndpointBilling === "test_fixture_no_charge"
    : billingGate.authority === "official_audit" && billingGate.inputCountEndpointBilling === "documented_no_charge";
  if (!billingAllowed) return unavailable("billing_gate_unavailable");

  return Object.freeze({
    version: AI_PROVIDER_RUNTIME_ACTIVATION_V1_VERSION,
    availability: "available",
    deploymentEnvironment: input.deploymentEnvironment,
    scope: expectedScope,
    userId: input.userId,
    examProfileId: input.examProfileId,
    billingAuditVersion: billingGate.auditVersion,
    serverOwned: true,
    productionAllowed: false,
  });
}

export function mockedProviderTransportAllowedV1(environment: "local" | "test" | "production"): boolean {
  return environment === "local" || environment === "test";
}
