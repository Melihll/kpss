import { describe, expect, it } from "vitest";
import { loadOpenAiServerCredentialV1 } from "./openai-server-secret-v1.ts";
import {
  mockedProviderTransportAllowedV1,
  resolveAiProviderRuntimeActivationV1,
  type AiProviderRuntimeBillingGateV1,
} from "./provider-runtime-activation-v1.ts";

const IDENTITY = { userId: "user-dev", examProfileId: "profile-dev" } as const;
const TEST_GATE: AiProviderRuntimeBillingGateV1 = {
  authority: "test_fixture",
  auditVersion: "test_fixture",
  inputCountEndpointBilling: "test_fixture_no_charge",
};
const TEST_CONFIG = {
  AI_PROVIDER_RUNTIME_ENABLED: "true",
  AI_PROVIDER_RUNTIME_ENVIRONMENT: "test",
  AI_PROVIDER_RUNTIME_SCOPE: "mock_test_only",
  AI_PROVIDER_RUNTIME_ALLOWED_USER_ID: IDENTITY.userId,
  AI_PROVIDER_RUNTIME_ALLOWED_PROFILE_ID: IDENTITY.examProfileId,
};

describe("6B.6B.2 centralized provider activation and secret authority", () => {
  it("defaults the runtime switch to OFF", () => {
    expect(resolveAiProviderRuntimeActivationV1({ deploymentEnvironment: "local_dev", serverConfig: {}, ...IDENTITY }))
      .toMatchObject({ availability: "unavailable", reason: "runtime_switch_off" });
  });

  it("keeps explicit false OFF and malformed values fail-closed", () => {
    expect(resolveAiProviderRuntimeActivationV1({ deploymentEnvironment: "local_dev", serverConfig: { AI_PROVIDER_RUNTIME_ENABLED: "false" }, ...IDENTITY }))
      .toMatchObject({ reason: "runtime_switch_off" });
    expect(resolveAiProviderRuntimeActivationV1({ deploymentEnvironment: "local_dev", serverConfig: { AI_PROVIDER_RUNTIME_ENABLED: "TRUE" }, ...IDENTITY }))
      .toMatchObject({ reason: "runtime_switch_malformed" });
  });

  it("keeps production prohibited unless the server explicitly approves the exact-profile pilot", () => {
    expect(
      resolveAiProviderRuntimeActivationV1({
        deploymentEnvironment:
          "production",

        serverConfig:
          TEST_CONFIG,

        ...IDENTITY,

        billingGate:
          TEST_GATE,
      }),
    ).toMatchObject({
      availability:
        "unavailable",

      reason:
        "production_prohibited",

      productionAllowed:
        false,
    });
  });

  it("requires static-bound readiness plus exact production environment, scope and identity", () => {
    const productionConfig = {
      ...TEST_CONFIG,

      AI_PROVIDER_RUNTIME_ENVIRONMENT:
        "production",

      AI_PROVIDER_RUNTIME_SCOPE:
        "reactive_coach_production_pilot_v1",
    };

    const notReadyGate:
      AiProviderRuntimeBillingGateV1 = {
        ...TEST_GATE,

        authority:
          "official_audit",

        productionStaticBoundReady:
          false,
      };

    expect(
      resolveAiProviderRuntimeActivationV1({
        deploymentEnvironment:
          "production",

        productionPilotApproved:
          true,

        serverConfig:
          productionConfig,

        ...IDENTITY,

        billingGate:
          notReadyGate,
      }),
    ).toMatchObject({
      availability:
        "unavailable",

      reason:
        "billing_gate_unavailable",

      productionAllowed:
        false,
    });

    const readyGate:
      AiProviderRuntimeBillingGateV1 = {
        ...notReadyGate,

        productionStaticBoundReady:
          true,
      };

    expect(
      resolveAiProviderRuntimeActivationV1({
        deploymentEnvironment:
          "production",

        productionPilotApproved:
          true,

        serverConfig:
          productionConfig,

        ...IDENTITY,

        billingGate:
          readyGate,
      }),
    ).toMatchObject({
      availability:
        "available",

      deploymentEnvironment:
        "production",

      scope:
        "reactive_coach_production_pilot_v1",

      userId:
        IDENTITY.userId,

      examProfileId:
        IDENTITY.examProfileId,

      inputCountBillingAuthority:
        "not_applicable_static_bound",

      serverOwned:
        true,

      productionAllowed:
        true,
    });

    expect(
      resolveAiProviderRuntimeActivationV1({
        deploymentEnvironment:
          "production",

        productionPilotApproved:
          true,

        serverConfig: {
          ...productionConfig,

          AI_PROVIDER_RUNTIME_ALLOWED_PROFILE_ID:
            "another-profile",
        },

        ...IDENTITY,

        billingGate:
          readyGate,
      }),
    ).toMatchObject({
      availability:
        "unavailable",

      reason:
        "identity_not_allowlisted",

      productionAllowed:
        false,
    });
  });

  it("requires exact server-owned environment, scope, and identity allowlist", () => {
    expect(resolveAiProviderRuntimeActivationV1({ deploymentEnvironment: "test", serverConfig: { ...TEST_CONFIG, AI_PROVIDER_RUNTIME_ENVIRONMENT: "local_dev" }, ...IDENTITY, billingGate: TEST_GATE })).toMatchObject({ reason: "environment_mismatch" });
    expect(resolveAiProviderRuntimeActivationV1({ deploymentEnvironment: "test", serverConfig: { ...TEST_CONFIG, AI_PROVIDER_RUNTIME_SCOPE: "anything" }, ...IDENTITY, billingGate: TEST_GATE })).toMatchObject({ reason: "scope_invalid" });
    expect(resolveAiProviderRuntimeActivationV1({ deploymentEnvironment: "test", serverConfig: { ...TEST_CONFIG, AI_PROVIDER_RUNTIME_ALLOWED_USER_ID: "another" }, ...IDENTITY, billingGate: TEST_GATE })).toMatchObject({ reason: "identity_not_allowlisted" });
  });

  it("does not accept a user request field as an activation input", () => {
    const input = { deploymentEnvironment: "local_dev", serverConfig: {}, ...IDENTITY, runtimeEnabled: true } as any;
    expect(resolveAiProviderRuntimeActivationV1(input)).toMatchObject({ reason: "runtime_switch_off" });
  });

  it("keeps controlled DEV blocked while input-count billing is unresolved", () => {
    const serverConfig = {
      ...TEST_CONFIG,
      AI_PROVIDER_RUNTIME_ENVIRONMENT: "local_dev",
      AI_PROVIDER_RUNTIME_SCOPE: "one_controlled_dev_smoke_v1",
    };
    expect(resolveAiProviderRuntimeActivationV1({ deploymentEnvironment: "local_dev", serverConfig, ...IDENTITY }))
      .toMatchObject({ availability: "unavailable", reason: "billing_gate_unavailable" });
  });

  it("allows only the explicitly labeled mocked test path", () => {
    expect(resolveAiProviderRuntimeActivationV1({ deploymentEnvironment: "test", serverConfig: TEST_CONFIG, ...IDENTITY, billingGate: TEST_GATE }))
      .toMatchObject({ availability: "available", scope: "mock_test_only", productionAllowed: false });
    expect(mockedProviderTransportAllowedV1("test")).toBe(true);
    expect(mockedProviderTransportAllowedV1("local")).toBe(true);
    expect(mockedProviderTransportAllowedV1("production")).toBe(false);
  });

  it("fails closed on a missing or malformed OPENAI_API_KEY", () => {
    expect(() => loadOpenAiServerCredentialV1({})).toThrow("OPENAI_SERVER_API_KEY_MISSING");
    expect(() => loadOpenAiServerCredentialV1({ OPENAI_API_KEY: " short " })).toThrow("OPENAI_SERVER_API_KEY_MALFORMED");
  });

  it("keeps the server credential redacted during serialization", () => {
    const secret = "sk-test-only-12345678901234567890";
    const credential = loadOpenAiServerCredentialV1({ OPENAI_API_KEY: secret });
    expect(JSON.stringify(credential)).toBe('{"version":"openai-server-secret-v1","authority":"server_secret","redacted":true}');
    expect(JSON.stringify(credential)).not.toContain(secret);
  });
});
