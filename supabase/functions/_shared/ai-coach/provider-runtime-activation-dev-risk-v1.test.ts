import { describe, expect, it } from "vitest";

import {
  AI_PROVIDER_RUNTIME_SERVER_KEYS_V1,
  resolveAiProviderRuntimeActivationV1,
} from "./provider-runtime-activation-v1.ts";

const USER_ID = "dev-user-1";
const PROFILE_ID = "dev-profile-1";

function localDevServerConfig(
  riskAcceptance?: string,
): Readonly<Record<string, string | undefined>> {
  const keys = AI_PROVIDER_RUNTIME_SERVER_KEYS_V1;

  return Object.freeze({
    [keys.enabled]: "true",
    [keys.environment]: "local_dev",
    [keys.scope]: "one_controlled_dev_smoke_v1",
    [keys.allowedUserId]: USER_ID,
    [keys.allowedProfileId]: PROFILE_ID,
    ...(riskAcceptance === undefined
      ? {}
      : {
          [keys.acceptUnresolvedCountBillingRisk]: riskAcceptance,
        }),
  });
}

describe("6B.6B.2 explicit local DEV unresolved-billing risk acceptance", () => {
  it("remains blocked when unresolved billing risk is not explicitly accepted", () => {
    const result = resolveAiProviderRuntimeActivationV1({
      deploymentEnvironment: "local_dev",
      serverConfig: localDevServerConfig(),
      userId: USER_ID,
      examProfileId: PROFILE_ID,
    });

    expect(result.availability).toBe("unavailable");

    if (result.availability === "unavailable") {
      expect(result.reason).toBe("billing_gate_unavailable");
      expect(result.productionAllowed).toBe(false);
    }
  });

  it("allows exactly the controlled local DEV scope when explicit risk acceptance is true", () => {
    const result = resolveAiProviderRuntimeActivationV1({
      deploymentEnvironment: "local_dev",
      serverConfig: localDevServerConfig("true"),
      userId: USER_ID,
      examProfileId: PROFILE_ID,
    });

    expect(result.availability).toBe("available");

    if (result.availability === "available") {
      expect(result.deploymentEnvironment).toBe("local_dev");
      expect(result.scope).toBe("one_controlled_dev_smoke_v1");
      expect(result.userId).toBe(USER_ID);
      expect(result.examProfileId).toBe(PROFILE_ID);
      expect(result.serverOwned).toBe(true);
      expect(result.productionAllowed).toBe(false);
    }
  });

  it("keeps false and malformed risk acceptance fail-closed", () => {
    for (const riskAcceptance of ["false", "TRUE", "1", "yes"]) {
      const result = resolveAiProviderRuntimeActivationV1({
        deploymentEnvironment: "local_dev",
        serverConfig: localDevServerConfig(riskAcceptance),
        userId: USER_ID,
        examProfileId: PROFILE_ID,
      });

      expect(result.availability).toBe("unavailable");

      if (result.availability === "unavailable") {
        expect(result.reason).toBe("billing_gate_unavailable");
      }
    }
  });

  it("cannot use the DEV risk flag to authorize production", () => {
    const keys = AI_PROVIDER_RUNTIME_SERVER_KEYS_V1;

    const result = resolveAiProviderRuntimeActivationV1({
      deploymentEnvironment: "production",
      serverConfig: {
        [keys.enabled]: "true",
        [keys.environment]: "production",
        [keys.scope]: "one_controlled_dev_smoke_v1",
        [keys.allowedUserId]: USER_ID,
        [keys.allowedProfileId]: PROFILE_ID,
        [keys.acceptUnresolvedCountBillingRisk]: "true",
      },
      userId: USER_ID,
      examProfileId: PROFILE_ID,
    });

    expect(result.availability).toBe("unavailable");

    if (result.availability === "unavailable") {
      expect(result.reason).toBe("production_prohibited");
      expect(result.productionAllowed).toBe(false);
    }
  });
});