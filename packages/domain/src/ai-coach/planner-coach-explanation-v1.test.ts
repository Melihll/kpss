import { describe, expect, it } from "vitest";
import {
  knownCoachContextV1Fact,
  notApplicableCoachContextV1Fact,
  staleCoachContextV1Fact,
  unknownCoachContextV1Fact,
  type CoachContextV1Fact,
  type CoachContextV1PlannerState,
} from "./coach-context-v1";
import {
  buildPlannerCoachExplanationV1,
  PLANNER_COACH_PREVIEW_HREF,
  type PlannerCoachPreviewCapabilityV1,
} from "./planner-coach-explanation-v1";

const NOW = "2026-09-19T10:00:00.000Z";
const CAPABILITY_ENABLED: PlannerCoachPreviewCapabilityV1 = {
  availability: "known",
  previewEnabled: true,
  reasonCode: "canonical_preview_enabled",
};
const CAPABILITY_DISABLED: PlannerCoachPreviewCapabilityV1 = {
  availability: "known",
  previewEnabled: false,
  reasonCode: "canonical_preview_disabled",
};

function state(warnings: readonly string[] = []): CoachContextV1PlannerState {
  return {
    lifecycleVersion: "planner-v2-lifecycle-v1",
    lifecycleState: "previewed",
    weeklyPlanId: "week-1",
    proposalRecordId: "record-1",
    proposalId: "proposal-1",
    proposalFingerprint: "proposal-fingerprint-1",
    snapshotFingerprint: "snapshot-fingerprint-1",
    plannerVersion: "planner-v2",
    expiresAt: "2026-09-19T11:00:00.000Z",
    freshnessReasons: [],
    summary: {
      totalAvailableMinutes: 300,
      protectedMinutes: 100,
      newlyPlannedMinutes: 160,
      unusedMinutes: 40,
      unmetEligibleMinutes: 0,
      blockedDemandCount: 0,
    },
    differences: {
      createCanonicalWorkloadIdentities: ["work-1"],
      retainedTaskIds: ["task-1"],
      replaceableTaskIds: [],
      outsideScopeTaskIds: [],
    },
    warnings,
    explanationFacts: [{ kind: "day_capacity", date: "2026-09-21", availableMinutes: 120 }],
    explicitConfirmationRequired: true,
    applyAvailable: false,
  };
}

function knownPlanner(warnings: readonly string[] = []): CoachContextV1Fact<CoachContextV1PlannerState> {
  return knownCoachContextV1Fact(state(warnings), {
    asOf: NOW,
    expiresAt: "2026-09-19T11:00:00.000Z",
    provenance: [{ source: "planner_v2_lifecycle", recordIds: ["record-1"], asOf: NOW }],
  });
}

describe("Evre 6E deterministic Planner Coach explanation", () => {
  it("presents a fresh warning only from canonical Planner evidence", () => {
    const explanation = buildPlannerCoachExplanationV1({
      planner: knownPlanner(["blocked_workload:missing_mapping"]),
      previewCapability: CAPABILITY_ENABLED,
      now: NOW,
    });

    expect(explanation).toMatchObject({
      state: "CURRENT_PREVIEW",
      currentPreviewExists: true,
      canonicalWarningCodes: ["blocked_workload:missing_mapping"],
      previewAction: {
        availability: "available",
        action: "open_existing_planner_v2_preview",
        href: PLANNER_COACH_PREVIEW_HREF,
        autoRunPreview: false,
        confirmsProposal: false,
        appliesProposal: false,
      },
      authority: {
        plannerMutationAllowed: false,
        proposalCreationAllowed: false,
        confirmationAllowed: false,
        applyAllowed: false,
      },
    });
    expect(explanation.answer).toContain("1 canonical uyarı");
    expect(explanation.answer).not.toContain("missing_mapping");
  });

  it("does not invent a warning for a warning-free fresh preview", () => {
    const explanation = buildPlannerCoachExplanationV1({
      planner: knownPlanner(),
      previewCapability: CAPABILITY_ENABLED,
      now: NOW,
    });
    expect(explanation.canonicalWarningCodes).toEqual([]);
    expect(explanation.answer).toContain("uyarı bulunmuyor");
  });

  it("fails closed for stale Planner evidence and offers no Preview promise", () => {
    const stale = staleCoachContextV1Fact(state(["old-warning"]), "persisted_planner_v2_not_current", {
      asOf: "2026-09-19T08:00:00.000Z",
      expiresAt: "2026-09-19T09:00:00.000Z",
      provenance: [{ source: "planner_v2_lifecycle", recordIds: ["record-1"], asOf: NOW }],
    });
    const explanation = buildPlannerCoachExplanationV1({
      planner: stale,
      previewCapability: CAPABILITY_ENABLED,
      now: NOW,
    });
    expect(explanation.state).toBe("STALE_OR_EXPIRED");
    expect(explanation.canonicalWarningCodes).toEqual([]);
    expect(explanation.previewAction).toMatchObject({
      availability: "unavailable",
      reasonCode: "planner_evidence_stale",
    });
  });

  it("does not invent a conclusion when Planner truth is missing or ambiguous", () => {
    const missing = buildPlannerCoachExplanationV1({
      planner: unknownCoachContextV1Fact("persisted_planner_v2_payload_invalid", ["planner_v2_lifecycle"]),
      previewCapability: CAPABILITY_ENABLED,
      now: NOW,
    });
    expect(missing).toMatchObject({
      state: "UNKNOWN_OR_BLOCKED",
      currentPreviewExists: false,
      canonicalWarningCodes: [],
      explanationFacts: [],
      previewAction: { availability: "unavailable", reasonCode: "planner_evidence_unknown" },
    });
  });

  it("offers the existing flow for an authoritative no-current-preview state", () => {
    const explanation = buildPlannerCoachExplanationV1({
      planner: notApplicableCoachContextV1Fact("no_current_planner_v2_proposal", ["planner_v2_lifecycle"]),
      previewCapability: CAPABILITY_ENABLED,
      now: NOW,
    });
    expect(explanation).toMatchObject({
      state: "NO_CURRENT_PREVIEW",
      currentPreviewExists: false,
      previewAction: {
        availability: "available",
        reasonCode: "new_preview_available",
        href: PLANNER_COACH_PREVIEW_HREF,
      },
    });
  });

  it("keeps the CTA unavailable when canonical capability is disabled", () => {
    const explanation = buildPlannerCoachExplanationV1({
      planner: knownPlanner(),
      previewCapability: CAPABILITY_DISABLED,
      now: NOW,
    });
    expect(explanation.previewAction).toMatchObject({
      availability: "unavailable",
      reasonCode: "canonical_preview_disabled",
    });
  });

  it("is byte-deterministic for the same facts and time", () => {
    const input = {
      planner: knownPlanner(["warning-b", "warning-a", "warning-a"]),
      previewCapability: CAPABILITY_ENABLED,
      now: NOW,
    } as const;
    expect(JSON.stringify(buildPlannerCoachExplanationV1(input)))
      .toBe(JSON.stringify(buildPlannerCoachExplanationV1(input)));
  });
});
