import { describe, expect, it } from "vitest";
import {
  canApplyPlannerV2Proposal,
  confirmationFailureMessage,
  deriveConfirmedPlannerV2State,
  exactPlannerV2ProposalIdentity,
} from "./planner-v2-lifecycle-ui";

const exact = {
  recordId: "19ade727-e534-4be1-bdb0-3c7b6e505af0",
  proposalId: "proposal-1",
  proposalFingerprint: "proposal-fingerprint",
  snapshotFingerprint: "snapshot-fingerprint",
  plannerVersion: "planner-v2",
};

describe("Planner V2 authoritative lifecycle UI", () => {
  it("projects preview metadata into the exact five-field request identity", () => {
    expect(exactPlannerV2ProposalIdentity({ ...exact, state: "previewed", expiresAt: "later" })).toEqual(exact);
  });

  it("does not treat an expired HTTP-success-shaped payload as confirmation", () => {
    expect(() => deriveConfirmedPlannerV2State({
      confirmation: { recordId: exact.recordId, state: "expired", confirmed: false },
    }, exact)).toThrow("ACTION_PROPOSAL_EXPIRED");
    expect(confirmationFailureMessage("ACTION_PROPOSAL_EXPIRED"))
      .toBe("Önerinin süresi doldu. Yeni önizleme oluştur.");
  });

  it.each([
    ["ACTION_PROPOSAL_STALE", "Plan koşulları değişti. Yeni önizleme oluştur."],
    ["PLANNER_V2_CONFIRMATION_IDENTITY_MISMATCH", "Öneri kimliği değişti. Yeni önizleme oluştur."],
    ["ACTION_PROPOSAL_NOT_PENDING", "Öneri artık onaylanabilir değil. Yeni önizleme oluştur."],
  ])("renders deterministic failure for %s", (code, message) => {
    expect(confirmationFailureMessage(code)).toBe(message);
  });

  it("requires exact persisted confirmation identity and confirmedAt", () => {
    const response = { confirmation: { ...exact, state: "confirmed", confirmedAt: "2026-09-01T12:00:00.000Z" } };
    expect(deriveConfirmedPlannerV2State(response, exact)).toEqual(response.confirmation);
    expect(() => deriveConfirmedPlannerV2State({
      confirmation: { ...response.confirmation, proposalId: "wrong" },
    }, exact)).toThrow("PLANNER_V2_CONFIRMATION_IDENTITY_MISMATCH");
    expect(() => deriveConfirmedPlannerV2State({
      confirmation: { ...response.confirmation, confirmedAt: null },
    }, exact)).toThrow("PLANNER_V2_CONFIRMATION_NOT_PERSISTED");
  });

  it("never fabricates confirmed state on refresh and gates Apply on capability", () => {
    expect(canApplyPlannerV2Proposal({ applyEnabled: true }, null)).toBe(false);
    expect(canApplyPlannerV2Proposal(
      { applyEnabled: false },
      { ...exact, state: "confirmed", confirmedAt: "2026-09-01T12:00:00.000Z" },
    )).toBe(false);
    expect(canApplyPlannerV2Proposal(
      { applyEnabled: true },
      { ...exact, state: "confirmed", confirmedAt: "2026-09-01T12:00:00.000Z" },
    )).toBe(true);
  });
});
