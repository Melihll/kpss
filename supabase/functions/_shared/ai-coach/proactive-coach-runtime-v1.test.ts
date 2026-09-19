import { describe, expect, it, vi } from "vitest";
import {
  buildCoachContextV1,
  knownCoachContextV1Fact,
  type CoachContextV1,
  type CoachContextV1Input,
} from "../../../../packages/domain/src/ai-coach/coach-context-v1.ts";
import {
  buildCoachSignalSetV1,
  type CoachSignalCandidateV1,
} from "../../../../packages/domain/src/ai-coach/coach-signal-v1.ts";
import { coachContextV1Fixture } from "../../../../packages/domain/src/ai-coach/fixtures/coach-context-v1.ts";
import {
  buildProactiveCoachFingerprintV1,
  selectProactiveCoachInsightV1,
} from "../../../../packages/domain/src/ai-coach/proactive-coach-selection-v1.ts";
import { buildProactiveCoachConditionKeyV1 } from "../../../../packages/domain/src/ai-coach/proactive-coach-hysteresis-v1.ts";
import {
  buildProactiveCoachRuntimeStateV1,
  type ProactiveCoachRuntimePresentationV1,
} from "../../../../packages/domain/src/ai-coach/proactive-coach-runtime-state-v1.ts";
import { runProactiveCoachRuntimeV1 } from "./proactive-coach-runtime-v1.ts";

const USER = "user-esra";
const PROFILE = "profile-kpss-2027";
const NOW = "2026-09-10T09:00:00.000Z";
const DATE = "2026-09-10";

function context(kind: Parameters<typeof coachContextV1Fixture>[0] = "healthy_normal_week", mutate?: (value: any) => void): CoachContextV1 {
  const input = structuredClone(coachContextV1Fixture(kind)) as any;
  input.generatedAt = NOW;
  input.requestId = "request-proactive-runtime";
  input.userId = USER;
  input.examProfileId = PROFILE;
  mutate?.(input);
  return buildCoachContextV1(input as CoachContextV1Input);
}

function completedTodayContext(): CoachContextV1 {
  return context("healthy_normal_week", (input) => {
    const task = {
      ...input.today.value.tasks[0],
      status: "completed",
      completedMinutes: 45,
      remainingMinutes: 0,
    };
    input.today.value = {
      ...input.today.value,
      summary: {
        totalTaskCount: 1,
        openTaskCount: 0,
        completedTaskCount: 1,
        partiallyCompletedTaskCount: 0,
        plannedMinutes: 45,
        completedMinutes: 45,
        remainingMinutes: 0,
      },
      study: {
        actualMinutes: 45,
        plannedActualMinutes: 45,
        plannedCreditMinutes: 45,
        extraActualMinutes: 0,
        unknownIntentMinutes: 0,
      },
      tasks: [task],
    };
  });
}

function repeatedMissContext(): CoachContextV1 {
  return context("healthy_normal_week", (input) => {
    input.recentProgress.value = {
      ...input.recentProgress.value,
      windowStart: "2026-09-07T00:00:00.000Z",
      windowEnd: "2026-09-14T00:00:00.000Z",
      taskEvents: [
        { taskId: "task-today-video", occurredAt: "2026-09-08T09:00:00.000Z", status: "missed", completedMinutes: 0 },
        { taskId: "task-today-video", occurredAt: "2026-09-09T09:00:00.000Z", status: "missed", completedMinutes: 0 },
      ],
    };
  });
}

function plannerWarningContext(): CoachContextV1 {
  return context("healthy_normal_week", (input) => {
    input.planner = knownCoachContextV1Fact({
      lifecycleVersion: "planner-v2-lifecycle-v1",
      lifecycleState: "previewed",
      weeklyPlanId: "plan-2026-w37",
      proposalRecordId: "proposal-record",
      proposalId: "proposal-id",
      proposalFingerprint: "proposal-fingerprint",
      snapshotFingerprint: "snapshot-fingerprint",
      plannerVersion: "planner-v2",
      expiresAt: "2026-09-11T09:00:00.000Z",
      freshnessReasons: [],
      summary: { totalAvailableMinutes: 300, protectedMinutes: 45, newlyPlannedMinutes: 120, unusedMinutes: 135, unmetEligibleMinutes: 0, blockedDemandCount: 0 },
      differences: { createCanonicalWorkloadIdentities: [], retainedTaskIds: [], replaceableTaskIds: [], outsideScopeTaskIds: [] },
      warnings: ["persisted-warning"],
      explanationFacts: [],
      explicitConfirmationRequired: true,
      applyAvailable: false,
    }, {
      provenance: [{ source: "planner_v2_lifecycle", recordIds: ["proposal-record"], asOf: NOW }],
      asOf: NOW,
      expiresAt: "2026-09-11T09:00:00.000Z",
    });
  });
}

function collection<T>(values: readonly T[], source: "proactive_presentation_store" | "proactive_user_control_store" | "proactive_clear_condition_store", availability: "known" | "unavailable" | "ambiguous" = "known") {
  return availability === "known"
    ? { availability, values, source, asOf: NOW, unavailableReason: null } as const
    : { availability, values: [], source, asOf: NOW, unavailableReason: "test_authority_unavailable" } as const;
}

function runtimeState(options: {
  active?: boolean;
  presentations?: readonly ProactiveCoachRuntimePresentationV1[];
  dismissed?: readonly string[];
  snoozes?: readonly { readonly attentionCategory: "progress"; readonly until: string }[];
  disabled?: readonly "progress"[];
  controlsUnavailable?: boolean;
  presentationsUnavailable?: boolean;
  clearConditionsUnavailable?: boolean;
  clearConditions?: readonly any[];
} = {}) {
  return buildProactiveCoachRuntimeStateV1({
    now: NOW,
    currentDate: DATE,
    surfaceSessionId: "surface-main",
    activeStudySession: {
      availability: "known",
      value: options.active
        ? { active: true, sessionId: "session-active", startedAt: "2026-09-10T08:00:00.000Z" }
        : { active: false, sessionId: null, startedAt: null },
      source: "study_sessions_active_readonly",
      asOf: NOW,
      unavailableReason: null,
    },
    presentations: collection(options.presentations ?? [], "proactive_presentation_store", options.presentationsUnavailable ? "ambiguous" : "known"),
    dismissedFingerprints: collection(options.dismissed ?? [], "proactive_user_control_store", options.controlsUnavailable ? "unavailable" : "known"),
    snoozes: collection(options.snoozes ?? [], "proactive_user_control_store"),
    disabledCategories: collection(options.disabled ?? [], "proactive_user_control_store"),
    clearConditions: collection(options.clearConditions ?? [], "proactive_clear_condition_store", options.clearConditionsUnavailable ? "unavailable" : "known"),
  });
}

function presentation(candidate: CoachSignalCandidateV1, overrides: Partial<ProactiveCoachRuntimePresentationV1> = {}): ProactiveCoachRuntimePresentationV1 {
  return {
    fingerprint: buildProactiveCoachFingerprintV1(candidate),
    signalType: candidate.signalType,
    conditionKey: buildProactiveCoachConditionKeyV1(candidate)!,
    attentionCategory: candidate.eligibility.attentionCategory,
    presentedAt: "2026-09-10T08:30:00.000Z",
    calendarDate: DATE,
    surfaceSessionId: "surface-main",
    ...overrides,
  };
}

function setup(value: CoachContextV1, state = runtimeState()) {
  const loadContext = vi.fn(async () => value);
  const buildSignals = vi.fn(buildCoachSignalSetV1);
  const loadRuntimeState = vi.fn(async () => state);
  const select = vi.fn(selectProactiveCoachInsightV1);
  return { loadContext, buildSignals, loadRuntimeState, select };
}

function input(dependencies: ReturnType<typeof setup>) {
  return {
    contextClient: Object.freeze({}),
    userId: USER,
    examProfileId: PROFILE,
    currentDate: DATE,
    requestedAt: NOW,
    requestId: "request-proactive-runtime",
    surfaceSessionId: "  surface-main  ",
    dependencies,
  };
}

describe("Proactive Coach server runtime V1", () => {
  it("A. selects a deterministic launch-enabled signal created from canonical context", async () => {
    const dependencies = setup(completedTodayContext());
    const first = await runProactiveCoachRuntimeV1(input(dependencies));
    const second = await runProactiveCoachRuntimeV1(input(dependencies));
    expect(first.selection).toMatchObject({ outcome: "selected", selectedCandidate: { signalType: "today_completed_as_planned" } });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(dependencies.buildSignals).toHaveBeenCalledWith(expect.anything(), { proactiveOnly: true });
    expect(dependencies.loadRuntimeState).toHaveBeenCalledWith(expect.objectContaining({ surfaceSessionId: "surface-main" }));
    expect(first.presentationRecorded).toBe(false);
  });

  it("B-C. returns silence for healthy context and unresolved materiality", async () => {
    const healthy = await runProactiveCoachRuntimeV1(input(setup(context())));
    const unresolved = await runProactiveCoachRuntimeV1(input(setup(context("today_partially_completed"))));
    expect(healthy.selection.outcome).toBe("silence");
    expect(unresolved.selection).toMatchObject({ outcome: "silence", suppressions: [expect.objectContaining({ reason: "materiality_threshold_unresolved" })] });
  });

  it("D-G. preserves active-session, dismiss, snooze and disable suppression", async () => {
    const value = completedTodayContext();
    const candidate = buildCoachSignalSetV1(value, { proactiveOnly: true }).candidates[0]!;
    const states = [
      runtimeState({ active: true }),
      runtimeState({ dismissed: [buildProactiveCoachFingerprintV1(candidate)] }),
      runtimeState({ snoozes: [{ attentionCategory: "progress", until: "2026-09-11T09:00:00.000Z" }] }),
      runtimeState({ disabled: ["progress"] }),
    ];
    const reasons = ["active_study_session", "fingerprint_dismissed", "category_snoozed", "category_disabled"];
    for (let index = 0; index < states.length; index += 1) {
      const result = await runProactiveCoachRuntimeV1(input(setup(value, states[index])));
      expect(result.selection).toMatchObject({ outcome: "silence", suppressions: [expect.objectContaining({ reason: reasons[index] })] });
    }
  });

  it("H. preserves category cooldown and daily/surface attention-budget suppression", async () => {
    const missValue = repeatedMissContext();
    const recentRecoveryPresentation: ProactiveCoachRuntimePresentationV1 = {
      fingerprint: "other-recovery-fingerprint",
      signalType: "recent_recovery",
      conditionKey: "recent_recovery:other-task",
      attentionCategory: "consistency",
      presentedAt: "2026-09-10T08:30:00.000Z",
      calendarDate: DATE,
      surfaceSessionId: "other-surface",
    };
    const cooldown = await runProactiveCoachRuntimeV1(input(setup(missValue, runtimeState({ presentations: [recentRecoveryPresentation] }))));
    expect(cooldown.selection.suppressions[0]?.reason).toBe("category_cooldown");

    const completed = completedTodayContext();
    const daily = await runProactiveCoachRuntimeV1(input(setup(completed, runtimeState({ presentations: [recentRecoveryPresentation] }))));
    expect(daily.selection.suppressions[0]?.reason).toBe("daily_attention_budget");

    const priorSurface = { ...recentRecoveryPresentation, presentedAt: "2026-09-09T08:30:00.000Z", calendarDate: "2026-09-09", surfaceSessionId: "surface-main" };
    const surface = await runProactiveCoachRuntimeV1(input(setup(completed, runtimeState({ presentations: [priorSurface] }))));
    expect(surface.selection.suppressions[0]?.reason).toBe("surface_session_attention_budget");
  });

  it("I. does not re-arm repeated-miss or Planner-warning conditions without accepted clear evidence", async () => {
    for (const value of [repeatedMissContext(), plannerWarningContext()]) {
      const candidate = buildCoachSignalSetV1(value, { proactiveOnly: true }).candidates.find((item) => ["repeated_task_miss", "planner_warning_present"].includes(item.signalType))!;
      const prior = presentation(candidate, { presentedAt: "2026-09-01T08:30:00.000Z", calendarDate: "2026-09-01", surfaceSessionId: "old-surface" });
      const result = await runProactiveCoachRuntimeV1(input(setup(value, runtimeState({ presentations: [prior] }))));
      expect(result.selection).toMatchObject({ outcome: "silence", suppressions: [expect.objectContaining({ reason: "hysteresis_rearm_not_proven" })] });
    }
  });

  it("J. treats unavailable or ambiguous runtime authority as fail-closed silence", async () => {
    const value = completedTodayContext();
    const controls = await runProactiveCoachRuntimeV1(input(setup(value, runtimeState({ controlsUnavailable: true }))));
    expect(controls.selection.suppressions[0]?.reason).toBe("user_controls_authority_unavailable");

    const history = await runProactiveCoachRuntimeV1(input(setup(value, runtimeState({ presentationsUnavailable: true }))));
    expect(history.selection.suppressions[0]?.reason).toBe("presentation_history_authority_unavailable");

    const repeated = repeatedMissContext();
    const repeatedCandidate = buildCoachSignalSetV1(repeated, { proactiveOnly: true }).candidates.find((item) => item.signalType === "repeated_task_miss")!;
    const prior = presentation(repeatedCandidate, { presentedAt: "2026-09-01T08:30:00.000Z", calendarDate: "2026-09-01", surfaceSessionId: "old-surface" });
    const clear = await runProactiveCoachRuntimeV1(input(setup(repeated, runtimeState({ presentations: [prior], clearConditionsUnavailable: true }))));
    expect(clear.selection.suppressions[0]?.reason).toBe("hysteresis_clear_condition_unavailable");
  });

  it("rejects context identity/date authority mismatch and exposes no mutation authority", async () => {
    const mismatched = context("healthy_normal_week", (value) => { value.examProfileId = "other-profile"; });
    await expect(runProactiveCoachRuntimeV1(input(setup(mismatched)))).rejects.toThrow("PROACTIVE_COACH_CONTEXT_AUTHORITY_MISMATCH");
    const result = await runProactiveCoachRuntimeV1(input(setup(completedTodayContext())));
    expect(result.authority).toMatchObject({ dbWritesAllowed: false, providerCallsAllowed: false, llmCallsAllowed: false, plannerPreviewAllowed: false, plannerProposalAllowed: false, plannerConfirmationAllowed: false, plannerApplyAllowed: false });
  });
});
