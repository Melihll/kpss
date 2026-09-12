import { describe, expect, it } from "vitest";
import { AI_COACH_DEV_SMOKE_POLICY_V1, assertCoachDevSmokeRequestV1 } from "./dev-smoke-policy-v1.ts";
import { AI_OPENAI_BILLING_AUDIT_V1 } from "./provider-openai-billing-audit-v1.ts";
import { AI_PROVIDER_RECONCILIATION_CASES_V1 } from "./provider-reconciliation-policy-v1.ts";

describe("6B.6B.2 billing, reconciliation, and one-smoke policy", () => {
  it("records VERIFIED, UNRESOLVED, and NOT APPLICABLE audit outcomes", () => {
    expect(new Set(AI_OPENAI_BILLING_AUDIT_V1.decisions.map((item) => item.status))).toEqual(new Set(["verified", "unresolved", "not_applicable"]));
    expect(AI_OPENAI_BILLING_AUDIT_V1.productionBillingEligible).toBe(false);
    expect(AI_OPENAI_BILLING_AUDIT_V1.realDevSmokeBillingEligible).toBe(false);
  });

  it("classifies selected GPT-5.4 cache-write charging as not applicable", () => {
    expect(AI_OPENAI_BILLING_AUDIT_V1.decisions.find((item) => item.fact === "gpt54_distinct_cache_write_charge")).toMatchObject({ status: "not_applicable" });
    expect(AI_OPENAI_BILLING_AUDIT_V1.selectedRoutesCacheWriteTreatment).toBe("documented_no_additional_charge");
  });

  it("allows the bounded DEV smoke policy while preserving unresolved billing truth", () => {
    expect(AI_COACH_DEV_SMOKE_POLICY_V1).toMatchObject({ status: "ready_for_explicit_live_call_policy", readyForDevSmoke: true, providerAttemptCount: 1, automaticRetryCount: 0, fallbackAllowed: false, hardMonthlyUserCeilingTry: 300 });
    expect(() => assertCoachDevSmokeRequestV1({ environment: "local_dev", capability: "today_analysis", evidenceBytes: 1_000, maxOutputTokens: 900, providerAttemptCount: 1, fallbackAllowed: false })).not.toThrow();
  });

  it("rejects smoke scope widening before checking the remaining blocker", () => {
    expect(() => assertCoachDevSmokeRequestV1({ environment: "production", capability: "today_analysis", evidenceBytes: 1_000, maxOutputTokens: 900, providerAttemptCount: 1, fallbackAllowed: false })).toThrow("POLICY_VIOLATION");
    expect(() => assertCoachDevSmokeRequestV1({ environment: "local_dev", capability: "week_analysis", evidenceBytes: 1_000, maxOutputTokens: 900, providerAttemptCount: 1, fallbackAllowed: false })).toThrow("POLICY_VIOLATION");
    expect(() => assertCoachDevSmokeRequestV1({ environment: "local_dev", capability: "today_analysis", evidenceBytes: 16_385, maxOutputTokens: 900, providerAttemptCount: 1, fallbackAllowed: false })).toThrow("POLICY_VIOLATION");
  });

  it("blocks the affected user-month for every possible-execution ambiguity", () => {
    for (const [reason, policy] of Object.entries(AI_PROVIDER_RECONCILIATION_CASES_V1)) {
      if (reason === "definitively_not_started") continue;
      expect(policy).toMatchObject({ severity: "critical", blockUserMonth: true, automaticRetryAllowed: false, automaticReleaseAllowed: false });
    }
  });

  it("allows release only for a transport-proven not-started attempt", () => {
    expect(AI_PROVIDER_RECONCILIATION_CASES_V1.definitively_not_started).toMatchObject({ blockUserMonth: false, automaticRetryAllowed: false, automaticReleaseAllowed: true });
  });
});
