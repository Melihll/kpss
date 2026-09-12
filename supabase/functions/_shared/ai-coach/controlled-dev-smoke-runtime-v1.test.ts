import { describe, expect, it, vi } from "vitest";

import {
  AI_FX_SNAPSHOT_V1_TEST_FIXTURE,
} from "../../../../packages/domain/src/ai-coach/ai-economics-v1.ts";

import {
  AI_PROVIDER_RUNTIME_SERVER_KEYS_V1,
} from "./provider-runtime-activation-v1.ts";

import {
  createApprovedTcmbUsdTryFxSnapshotV1,
} from "./provider-fx-policy-v1.ts";

import {
  AI_TCMB_DAILY_RATES_XML_URL_V1,
} from "./provider-fx-acquisition-v1.ts";

import {
  AI_OPENAI_CONTROLLED_DEV_PRICING_CATALOG_V1,
  AI_OPENAI_CONTROLLED_DEV_ROUTE_CATALOG_V1,
  acquireControlledDevFxSnapshotForOperatorV1,
  prepareControlledDevSmokeRuntimeV1,
} from "./controlled-dev-smoke-runtime-v1.ts";

const USER_ID = "controlled-dev-user";
const PROFILE_ID = "controlled-dev-profile";

const EVALUATED_AT = "2026-09-12T10:00:00.000Z";

const FAKE_SECRET =
  "sk-controlled-dev-dry-run-only-1234567890";

const TCMB_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<Tarih_Date Tarih="11.09.2026" Date="09/11/2026" Bulten_No="2026/177">
  <Currency CrossOrder="0" Kod="USD" CurrencyCode="USD">
    <Unit>1</Unit>
    <Isim>ABD DOLARI</Isim>
    <CurrencyName>US DOLLAR</CurrencyName>
    <ForexBuying>41.1000</ForexBuying>
    <ForexSelling>41.2500</ForexSelling>
  </Currency>
</Tarih_Date>`;

function serverConfig(
  riskAcceptance: string | null = "true",
) {
  const keys = AI_PROVIDER_RUNTIME_SERVER_KEYS_V1;

  return {
    [keys.enabled]: "true",
    [keys.environment]: "local_dev",
    [keys.scope]: "one_controlled_dev_smoke_v1",
    [keys.allowedUserId]: USER_ID,
    [keys.allowedProfileId]: PROFILE_ID,
    ...(riskAcceptance === null
      ? {}
      : {
          [keys.acceptUnresolvedCountBillingRisk]:
            riskAcceptance,
        }),
  };
}

function freshFx() {
  return createApprovedTcmbUsdTryFxSnapshotV1({
    snapshotVersion: "tcmb-usd-try-2026-09-11-41.2500",
    rate: 41.25,
    effectiveAt: "2026-09-11T12:30:00.000Z",
    loadedAt: "2026-09-11T12:35:00.000Z",
  });
}

describe("6B.6B.2 controlled DEV smoke runtime preparation", () => {
  it("builds a local authoritative one-attempt/no-fallback runtime", () => {
    const result =
      prepareControlledDevSmokeRuntimeV1({
        serverConfig: serverConfig(),
        serverSecrets: {
          OPENAI_API_KEY: FAKE_SECRET,
        },
        userId: USER_ID,
        examProfileId: PROFILE_ID,
        fxSnapshot: freshFx(),
        evaluatedAt: EVALUATED_AT,
      });

    expect(result).toMatchObject({
      providerCallMade: false,
      productionAllowed: false,
    });

    expect(result.activation).toMatchObject({
      availability: "available",
      deploymentEnvironment: "local_dev",
      scope: "one_controlled_dev_smoke_v1",
      inputCountBillingAuthority:
        "explicitly_accepted_unresolved_dev",
      productionAllowed: false,
    });

    expect(
      AI_OPENAI_CONTROLLED_DEV_ROUTE_CATALOG_V1.environment,
    ).toBe("local");

    expect(
      AI_OPENAI_CONTROLLED_DEV_PRICING_CATALOG_V1.environment,
    ).toBe("local");

    for (
      const route
      of AI_OPENAI_CONTROLLED_DEV_ROUTE_CATALOG_V1.routes
    ) {
      expect(route.retryPolicy).toEqual({
        maxAttempts: 1,
        retryableCategories: [],
      });

      expect(route.fallbackTier).toBeNull();
    }

    expect(
      AI_OPENAI_CONTROLLED_DEV_PRICING_CATALOG_V1.entries.every(
        (entry) =>
          entry.sourceKind === "authoritative_config",
      ),
    ).toBe(true);
  });

  it("keeps the server credential redacted when serialized", () => {
    const prepared =
      prepareControlledDevSmokeRuntimeV1({
        serverConfig: serverConfig(),
        serverSecrets: {
          OPENAI_API_KEY: FAKE_SECRET,
        },
        userId: USER_ID,
        examProfileId: PROFILE_ID,
        fxSnapshot: freshFx(),
        evaluatedAt: EVALUATED_AT,
      });

    const serialized = JSON.stringify(prepared);

    expect(serialized).not.toContain(FAKE_SECRET);
    expect(serialized).not.toContain("Bearer ");
    expect(JSON.parse(JSON.stringify(prepared.credential)))
      .toEqual({
        version: "openai-server-secret-v1",
        authority: "server_secret",
        redacted: true,
      });
  });

  it("requires explicit unresolved-billing risk acceptance", () => {
    expect(() =>
      prepareControlledDevSmokeRuntimeV1({
        serverConfig: serverConfig(null),
        serverSecrets: {
          OPENAI_API_KEY: FAKE_SECRET,
        },
        userId: USER_ID,
        examProfileId: PROFILE_ID,
        fxSnapshot: freshFx(),
        evaluatedAt: EVALUATED_AT,
      })
    ).toThrow(
      "AI_CONTROLLED_DEV_RUNTIME_ACTIVATION_UNAVAILABLE:billing_gate_unavailable",
    );
  });

  it("rejects stale authoritative FX", () => {
    const stale =
      createApprovedTcmbUsdTryFxSnapshotV1({
        snapshotVersion: "stale",
        rate: 41.25,
        effectiveAt: "2026-09-01T12:30:00.000Z",
        loadedAt: "2026-09-01T12:35:00.000Z",
      });

    expect(() =>
      prepareControlledDevSmokeRuntimeV1({
        serverConfig: serverConfig(),
        serverSecrets: {
          OPENAI_API_KEY: FAKE_SECRET,
        },
        userId: USER_ID,
        examProfileId: PROFILE_ID,
        fxSnapshot: stale,
        evaluatedAt: EVALUATED_AT,
      })
    ).toThrow("AI_CONTROLLED_DEV_FX_INVALID:stale_snapshot");
  });

  it("rejects fixture FX", () => {
    expect(() =>
      prepareControlledDevSmokeRuntimeV1({
        serverConfig: serverConfig(),
        serverSecrets: {
          OPENAI_API_KEY: FAKE_SECRET,
        },
        userId: USER_ID,
        examProfileId: PROFILE_ID,
        fxSnapshot: AI_FX_SNAPSHOT_V1_TEST_FIXTURE,
        evaluatedAt: EVALUATED_AT,
      })
    ).toThrow("AI_CONTROLLED_DEV_FX_INVALID:invalid_source");
  });

  it("acquires TCMB only through the fixed injected URL", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(TCMB_FIXTURE, {
          status: 200,
          headers: {
            "Content-Type": "application/xml",
          },
        }),
    );

    const result =
      await acquireControlledDevFxSnapshotForOperatorV1({
        fetchImpl,
        loadedAt: EVALUATED_AT,
      });

    expect(fetchImpl).toHaveBeenCalledTimes(1);

    expect(fetchImpl.mock.calls[0][0])
      .toBe(AI_TCMB_DAILY_RATES_XML_URL_V1);

    expect(result).toMatchObject({
      publicationDate: "2026-09-11",
      rate: 41.25,
      rateBasis: "ForexSelling",
    });

    expect(result.snapshot.sourceKind)
      .toBe("authoritative_config");
  });
});
