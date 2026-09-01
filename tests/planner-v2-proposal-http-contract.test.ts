import { describe, expect, it } from "vitest";
import {
  assertAuthoritativePlannerV2Apply,
  assertAuthoritativePlannerV2Confirmation,
  parseExactPlannerV2ProposalIdentity,
  plannerV2LifecycleErrorCode,
} from "../supabase/functions/_shared/planner-v2-proposal-http";

const exact = {
  recordId: "19ade727-e534-4be1-bdb0-3c7b6e505af0",
  proposalId: "proposal-1",
  proposalFingerprint: "proposal-fingerprint",
  snapshotFingerprint: "snapshot-fingerprint",
  plannerVersion: "planner-v2",
};

const confirmedRow = {
  id: exact.recordId,
  user_id: "10000000-0000-4000-8000-000000000001",
  exam_profile_id: "73f9b34c-da73-43d9-a05c-2026409cf290",
  action_kind: "planner_v2_week",
  status: "confirmed",
  confirmed_at: "2026-09-01T12:00:00.000Z",
  expires_at: "2026-09-01T12:20:00.000Z",
  planner_proposal_id: exact.proposalId,
  proposal_fingerprint: exact.proposalFingerprint,
  planner_snapshot_fingerprint: exact.snapshotFingerprint,
  planner_version: exact.plannerVersion,
};

describe("Planner V2 proposal HTTP contracts", () => {
  it("accepts only the exact identity and rejects client-supplied actor authority", () => {
    expect(parseExactPlannerV2ProposalIdentity(exact)).toEqual(exact);
    for (const field of ["userId", "actorUserId", "examProfileId", "actorExamProfileId", "serviceRoleKey"]) {
      expect(() => parseExactPlannerV2ProposalIdentity({ ...exact, [field]: "attacker" })).toThrow(
        "PLANNER_V2_CLIENT_AUTHORITY_REFUSED",
      );
    }
  });

  it.each([
    ["expired", "ACTION_PROPOSAL_EXPIRED"],
    ["stale", "ACTION_PROPOSAL_STALE"],
    ["rejected", "ACTION_PROPOSAL_NOT_APPLYABLE"],
    ["cancelled", "ACTION_PROPOSAL_NOT_APPLYABLE"],
    ["previewed", "PLANNER_V2_EXPLICIT_CONFIRMATION_REQUIRED"],
  ])("maps %s to a deterministic lifecycle error", (state, code) => {
    expect(plannerV2LifecycleErrorCode(state)).toBe(code);
  });

  it("rejects the production incident: expired persistence cannot become confirmed", () => {
    expect(() => assertAuthoritativePlannerV2Confirmation(
      { ...confirmedRow, status: "expired", confirmed_at: null },
      exact,
    )).toThrow("ACTION_PROPOSAL_EXPIRED");
  });

  it("rejects stale and wrong-fingerprint persistence", () => {
    expect(() => assertAuthoritativePlannerV2Confirmation(
      { ...confirmedRow, status: "stale", confirmed_at: null },
      exact,
    )).toThrow("ACTION_PROPOSAL_STALE");
    expect(() => assertAuthoritativePlannerV2Confirmation(
      { ...confirmedRow, proposal_fingerprint: "wrong" },
      exact,
    )).toThrow("PLANNER_V2_CONFIRMATION_IDENTITY_MISMATCH");
  });

  it("returns confirmation only from the exact persisted confirmed row", () => {
    expect(assertAuthoritativePlannerV2Confirmation(confirmedRow, exact)).toEqual({
      ...exact,
      state: "confirmed",
      confirmedAt: confirmedRow.confirmed_at,
    });
  });

  it("accepts only exact authoritative applied results", () => {
    expect(assertAuthoritativePlannerV2Apply({
      recordId: exact.recordId,
      proposalId: exact.proposalId,
      state: "applied",
      applied: true,
      createdTaskIds: [],
      replacedTaskIds: [],
      plannedMinutes: 0,
      idempotent: false,
    }, exact)).toMatchObject({ state: "applied", applied: true });
    expect(() => assertAuthoritativePlannerV2Apply({
      recordId: exact.recordId,
      proposalId: "wrong",
      state: "applied",
      applied: true,
    }, exact)).toThrow("PLANNER_V2_APPLY_IDENTITY_MISMATCH");
  });
});
