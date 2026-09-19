import { describe, expect, it } from "vitest";
import {
  buildProactiveCoachRuntimeStateV1,
  type BuildProactiveCoachRuntimeStateV1Input,
  type ProactiveCoachRuntimeCollectionV1,
} from "./proactive-coach-runtime-state-v1";

const NOW = "2026-09-19T09:00:00.000Z";

function knownCollection<T>(
  values: readonly T[],
  source: "proactive_presentation_store" | "proactive_user_control_store" | "proactive_clear_condition_store",
): ProactiveCoachRuntimeCollectionV1<T> {
  return { availability: "known", values, source, asOf: NOW, unavailableReason: null };
}

function input(
  overrides: Partial<BuildProactiveCoachRuntimeStateV1Input> = {},
): BuildProactiveCoachRuntimeStateV1Input {
  return {
    now: NOW,
    currentDate: "2026-09-19",
    surfaceSessionId: "surface-1",
    activeStudySession: {
      availability: "known",
      value: { active: false, sessionId: null, startedAt: null },
      source: "study_sessions_active_readonly",
      asOf: NOW,
      unavailableReason: null,
    },
    presentations: knownCollection([], "proactive_presentation_store"),
    dismissedFingerprints: knownCollection([], "proactive_user_control_store"),
    snoozes: knownCollection([], "proactive_user_control_store"),
    disabledCategories: knownCollection([], "proactive_user_control_store"),
    clearConditions: knownCollection([], "proactive_clear_condition_store"),
    ...overrides,
  };
}

describe("ProactiveCoachRuntimeStateV1", () => {
  it("builds deterministic server-owned state and deep-freezes only its output", () => {
    const source = input({
      presentations: knownCollection([{
        fingerprint: "fp-1",
        signalType: "repeated_task_miss",
        conditionKey: "repeated_task_miss:task-1",
        attentionCategory: "consistency",
        presentedAt: "2026-09-18T09:00:00.000Z",
        calendarDate: "2026-09-18",
        surfaceSessionId: "surface-old",
      }], "proactive_presentation_store"),
    });
    const before = structuredClone(source);
    const first = buildProactiveCoachRuntimeStateV1(source);
    const second = buildProactiveCoachRuntimeStateV1(source);

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(source).toEqual(before);
    expect(Object.isFrozen(source)).toBe(false);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.presentations)).toBe(true);
    expect(Object.isFrozen(first.presentations.values)).toBe(true);
  });

  it("represents an authoritative active session without accepting a loose boolean", () => {
    const result = buildProactiveCoachRuntimeStateV1(input({
      activeStudySession: {
        availability: "known",
        value: { active: true, sessionId: "session-1", startedAt: "2026-09-19T08:00:00.000Z" },
        source: "study_sessions_active_readonly",
        asOf: NOW,
        unavailableReason: null,
      },
    }));

    expect(result.activeStudySession.value).toEqual({
      active: true,
      sessionId: "session-1",
      startedAt: "2026-09-19T08:00:00.000Z",
    });
    expect(result.authority.clientActiveSessionOverrideAllowed).toBe(false);
  });

  it("keeps unavailable active-session authority explicit and fail-closed-capable", () => {
    const result = buildProactiveCoachRuntimeStateV1(input({
      activeStudySession: {
        availability: "unavailable",
        value: null,
        source: "study_sessions_active_readonly",
        asOf: NOW,
        unavailableReason: "active_session_read_failed",
      },
    }));

    expect(result.activeStudySession).toMatchObject({
      availability: "unavailable",
      value: null,
      unavailableReason: "active_session_read_failed",
    });
  });

  it("rejects unknown collections that smuggle values and known active sessions without identity", () => {
    expect(() => buildProactiveCoachRuntimeStateV1(input({
      presentations: {
        availability: "unavailable",
        values: [{
          fingerprint: "fp",
          signalType: "recent_recovery",
          conditionKey: "recovery:task-1:event-1",
          attentionCategory: "consistency",
          presentedAt: NOW,
          calendarDate: "2026-09-19",
          surfaceSessionId: "surface-1",
        }],
        source: "proactive_presentation_store",
        asOf: NOW,
        unavailableReason: "store_missing",
      },
    }))).toThrow("PROACTIVE_RUNTIME_PRESENTATIONS_UNAVAILABLE_INVALID");

    expect(() => buildProactiveCoachRuntimeStateV1(input({
      activeStudySession: {
        availability: "known",
        value: { active: true, sessionId: null, startedAt: null },
        source: "study_sessions_active_readonly",
        asOf: NOW,
        unavailableReason: null,
      },
    }))).toThrow("PROACTIVE_RUNTIME_ACTIVE_SESSION_IDENTITY_INVALID");
  });

  it("publishes zero model, provider, mutation, or Planner authority", () => {
    expect(buildProactiveCoachRuntimeStateV1(input()).authority).toEqual({
      mode: "server_owned_proactive_runtime_state",
      clientActiveSessionOverrideAllowed: false,
      deterministicDerivationOnly: true,
      dbWritesAllowed: false,
      llmCallsAllowed: false,
      providerCallsAllowed: false,
      plannerPreviewAllowed: false,
      plannerProposalAllowed: false,
      plannerConfirmationAllowed: false,
      plannerApplyAllowed: false,
    });
  });
});
