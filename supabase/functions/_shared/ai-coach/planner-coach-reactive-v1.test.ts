import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  buildCoachContextV1,
  knownCoachContextV1Fact,
  staleCoachContextV1Fact,
  unknownCoachContextV1Fact,
} from "../ai-coach.bundle.js";
import type {
  CoachContextV1PlannerState,
} from "../../../../packages/domain/src/ai-coach/coach-context-v1.ts";
import { coachContextV1Fixture } from "../../../../packages/domain/src/ai-coach/fixtures/coach-context-v1.ts";
import { executeReactiveCoachRequestV1 } from "./reactive-coach-executor-v1.ts";
import { routeReactiveCoachRequestV1 } from "./reactive-coach-route-v1.ts";

const NOW = "2026-09-19T10:00:00.000Z";

function plannerState(warnings: readonly string[] = []): CoachContextV1PlannerState {
  return {
    lifecycleVersion: "planner-v2-lifecycle-v1",
    lifecycleState: "previewed",
    weeklyPlanId: "plan-2026-w37",
    proposalRecordId: "planner-record-6e",
    proposalId: "planner-proposal-6e",
    proposalFingerprint: "proposal-fingerprint-6e",
    snapshotFingerprint: "snapshot-fingerprint-6e",
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
    explanationFacts: [{ kind: "unused_capacity", date: "2026-09-21", unusedMinutes: 40, reason: "next_indivisible_workload_does_not_fit" }],
    explicitConfirmationRequired: true,
    applyAvailable: false,
  };
}

function contextWithPlanner(planner: ReturnType<typeof knownCoachContextV1Fact<CoachContextV1PlannerState>>) {
  return buildCoachContextV1({
    ...coachContextV1Fixture("healthy_normal_week"),
    generatedAt: NOW,
    planner,
  });
}

function knownPlanner(warnings: readonly string[] = []) {
  return knownCoachContextV1Fact(plannerState(warnings), {
    asOf: NOW,
    expiresAt: "2026-09-19T11:00:00.000Z",
    provenance: [{ source: "planner_v2_lifecycle", recordIds: ["planner-record-6e"], asOf: NOW }],
  });
}

function baseInput() {
  return {
    contextClient: {},
    userId: "user-esra",
    examProfileId: "profile-kpss-2027",
    requestId: "request-6e",
    requestedAt: NOW,
    plannerPreviewCapability: {
      availability: "known",
      previewEnabled: true,
      reasonCode: "canonical_preview_enabled",
    } as const,
  };
}

describe("Evre 6E Reactive Coach Planner integration", () => {
  it.each([
    "Planımda sorun var mı?",
    "Neden plan önizleme öneriyorsun?",
    "Planner ne görüyor?",
    "Bu hafta planı yenilemeli miyim?",
  ])("routes %s to deterministic canonical Planner interpretation", (message) => {
    expect(routeReactiveCoachRequestV1(message)).toMatchObject({
      executionTier: "T0_DETERMINISTIC",
      capability: "planner_explanation",
      deterministicKind: "planner_state_explanation",
      providerCallAllowed: false,
      requiresCanonicalContext: true,
      authority: {
        plannerMutationAllowed: false,
        taskMutationAllowed: false,
        capacityMutationAllowed: false,
        confirmationAllowed: false,
        applyAllowed: false,
      },
    });
  });

  it.each(["evet", "tamam", "uygula", "planı uygula"])(
    "treats chat agreement %s as no Planner authority",
    (message) => {
      expect(routeReactiveCoachRequestV1(message)).toMatchObject({
        executionTier: "T0_DETERMINISTIC",
        deterministicKind: "apply_unavailable",
        providerCallAllowed: false,
        requiresCanonicalContext: false,
        authority: { confirmationAllowed: false, applyAllowed: false },
      });
    },
  );

  it("reuses one CoachContext load and returns canonical warning evidence without provider use", async () => {
    const loadContext = vi.fn(async () => contextWithPlanner(knownPlanner(["canonical-warning-1"])));
    const runProvider = vi.fn();
    const result = await executeReactiveCoachRequestV1({
      ...baseInput(),
      rawMessage: "Planner ne görüyor?",
      dependencies: { loadContext, runProvider },
    });

    expect(loadContext).toHaveBeenCalledTimes(1);
    expect(runProvider).not.toHaveBeenCalled();
    expect(result.response).toMatchObject({
      state: "EXPLANATION",
      executionTier: "T0_DETERMINISTIC",
      providerAttempted: false,
      providerUsed: false,
      noMutationPerformed: true,
      plannerExplanation: {
        state: "CURRENT_PREVIEW",
        canonicalWarningCodes: ["canonical-warning-1"],
        previewAction: {
          availability: "available",
          href: "/week#planner-v2-preview",
          autoRunPreview: false,
          confirmsProposal: false,
          appliesProposal: false,
        },
      },
    });
  });

  it("fails closed for stale Planner evidence", async () => {
    const stale = staleCoachContextV1Fact(plannerState(["old-warning"]), "persisted_planner_v2_not_current", {
      asOf: "2026-09-19T08:00:00.000Z",
      expiresAt: "2026-09-19T09:00:00.000Z",
      provenance: [{ source: "planner_v2_lifecycle", recordIds: ["planner-record-6e"], asOf: NOW }],
    });
    const result = await executeReactiveCoachRequestV1({
      ...baseInput(),
      rawMessage: "Planımda sorun var mı?",
      dependencies: {
        loadContext: vi.fn(async () => buildCoachContextV1({ ...coachContextV1Fixture("healthy_normal_week"), generatedAt: NOW, planner: stale })),
        runProvider: vi.fn(),
      },
    });
    expect(result.response).toMatchObject({
      state: "STALE_OR_EXPIRED",
      plannerExplanation: {
        state: "STALE_OR_EXPIRED",
        canonicalWarningCodes: [],
        previewAction: { availability: "unavailable", reasonCode: "planner_evidence_stale" },
      },
    });
  });

  it("fails closed for missing Planner truth and disabled capability", async () => {
    const context = buildCoachContextV1({
      ...coachContextV1Fixture("healthy_normal_week"),
      generatedAt: NOW,
      planner: unknownCoachContextV1Fact("persisted_planner_v2_payload_invalid", ["planner_v2_lifecycle"]),
    });
    const result = await executeReactiveCoachRequestV1({
      ...baseInput(),
      plannerPreviewCapability: {
        availability: "known",
        previewEnabled: false,
        reasonCode: "canonical_preview_disabled",
      },
      rawMessage: "Planner ne görüyor?",
      dependencies: { loadContext: vi.fn(async () => context), runProvider: vi.fn() },
    });
    expect(result.response).toMatchObject({
      state: "UNKNOWN_OR_BLOCKED",
      plannerExplanation: {
        state: "UNKNOWN_OR_BLOCKED",
        currentPreviewExists: false,
        canonicalWarningCodes: [],
        previewAction: { availability: "unavailable" },
      },
    });
  });

  it("keeps ordinary reactive routing and proactive source untouched", () => {
    expect(routeReactiveCoachRequestV1("Bu hafta nasıl gidiyor?")).toMatchObject({
      executionTier: "PROVIDER_READ_ONLY",
      capability: "week_analysis",
    });
    const proactiveSource = fs.readFileSync(
      "supabase/functions/_shared/ai-coach/proactive-coach-runtime-v1.ts",
      "utf8",
    );
    expect(proactiveSource).not.toContain("planner-coach-explanation-v1");
  });
});
