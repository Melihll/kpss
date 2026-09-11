import { describe, expect, it } from "vitest";

import {
  AI_T_C_M_B_USD_TRY_FX_POLICY_V1,
  AI_T_C_M_B_USD_TRY_MAX_AGE_SECONDS_V1,
  AI_T_C_M_B_USD_TRY_SOURCE_ID_V1,
  createApprovedTcmbUsdTryFxSnapshotV1,
  validateApprovedTcmbUsdTryFxSnapshotV1,
} from "./provider-fx-policy-v1.ts";

describe("TCMB USD/TRY FX policy V1", () => {
  it("defines an official server-side fail-closed FX policy", () => {
    expect(AI_T_C_M_B_USD_TRY_FX_POLICY_V1.authority).toBe(
      "tcmb_official_exchange_rates",
    );

    expect(AI_T_C_M_B_USD_TRY_FX_POLICY_V1.sourceUrl).toContain(
      "tcmb.gov.tr",
    );

    expect(
      AI_T_C_M_B_USD_TRY_FX_POLICY_V1.requestTimeNetworkFetchAllowed,
    ).toBe(false);

    expect(
      AI_T_C_M_B_USD_TRY_FX_POLICY_V1.fixtureAllowedInProduction,
    ).toBe(false);

    expect(AI_T_C_M_B_USD_TRY_FX_POLICY_V1.staleBehavior).toBe(
      "fail_closed",
    );
  });

  it("creates an authoritative versioned USD/TRY snapshot", () => {
    const snapshot = createApprovedTcmbUsdTryFxSnapshotV1({
      snapshotVersion: "tcmb-usd-try-test-1",
      rate: 50,
      effectiveAt: "2026-09-11T12:00:00.000Z",
      loadedAt: "2026-09-11T12:05:00.000Z",
    });

    expect(snapshot).toEqual({
      policyVersion: "ai-fx-policy-v1",
      snapshotVersion: "tcmb-usd-try-test-1",
      source: AI_T_C_M_B_USD_TRY_SOURCE_ID_V1,
      sourceKind: "authoritative_config",
      baseCurrency: "USD",
      quoteCurrency: "TRY",
      rate: 50,
      effectiveAt: "2026-09-11T12:00:00.000Z",
      loadedAt: "2026-09-11T12:05:00.000Z",
      maxAgeSeconds: AI_T_C_M_B_USD_TRY_MAX_AGE_SECONDS_V1,
    });
  });

  it("accepts a fresh approved snapshot", () => {
    const snapshot = createApprovedTcmbUsdTryFxSnapshotV1({
      snapshotVersion: "fresh",
      rate: 50,
      effectiveAt: "2026-09-11T12:00:00.000Z",
      loadedAt: "2026-09-11T12:05:00.000Z",
    });

    expect(
      validateApprovedTcmbUsdTryFxSnapshotV1(
        snapshot,
        "2026-09-12T12:00:00.000Z",
      ),
    ).toEqual({
      valid: true,
      reason: null,
    });
  });

  it("fails closed when the snapshot is stale", () => {
    const snapshot = createApprovedTcmbUsdTryFxSnapshotV1({
      snapshotVersion: "stale",
      rate: 50,
      effectiveAt: "2026-09-01T12:00:00.000Z",
      loadedAt: "2026-09-01T12:05:00.000Z",
    });

    expect(
      validateApprovedTcmbUsdTryFxSnapshotV1(
        snapshot,
        "2026-09-11T12:00:00.000Z",
      ),
    ).toEqual({
      valid: false,
      reason: "stale_snapshot",
    });
  });

  it("rejects future snapshots", () => {
    const snapshot = createApprovedTcmbUsdTryFxSnapshotV1({
      snapshotVersion: "future",
      rate: 50,
      effectiveAt: "2026-09-12T12:00:00.000Z",
      loadedAt: "2026-09-12T12:05:00.000Z",
    });

    expect(
      validateApprovedTcmbUsdTryFxSnapshotV1(
        snapshot,
        "2026-09-11T12:00:00.000Z",
      ),
    ).toEqual({
      valid: false,
      reason: "future_snapshot",
    });
  });

  it("rejects invalid rates and load-before-effective timestamps", () => {
    expect(() =>
      createApprovedTcmbUsdTryFxSnapshotV1({
        snapshotVersion: "invalid-rate",
        rate: 0,
        effectiveAt: "2026-09-11T12:00:00.000Z",
        loadedAt: "2026-09-11T12:05:00.000Z",
      }),
    ).toThrow("AI_TCMB_FX_RATE_INVALID");

    expect(() =>
      createApprovedTcmbUsdTryFxSnapshotV1({
        snapshotVersion: "invalid-time",
        rate: 50,
        effectiveAt: "2026-09-11T12:05:00.000Z",
        loadedAt: "2026-09-11T12:00:00.000Z",
      }),
    ).toThrow("AI_TCMB_FX_LOAD_BEFORE_EFFECTIVE");
  });
});