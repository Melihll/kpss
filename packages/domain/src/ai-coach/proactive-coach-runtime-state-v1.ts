import type { CoachSignalAttentionCategoryV1, CoachSignalTypeV1 } from "./coach-signal-v1";

export const PROACTIVE_COACH_RUNTIME_STATE_V1_VERSION =
  "proactive-coach-runtime-state-v1" as const;

export type ProactiveCoachRuntimeAvailabilityV1 =
  | "known"
  | "unavailable"
  | "ambiguous";

export type ProactiveCoachRuntimeSourceV1 =
  | "server_clock"
  | "server_timezone"
  | "server_surface_session"
  | "study_sessions_active_readonly"
  | "proactive_presentation_store"
  | "proactive_user_control_store"
  | "proactive_clear_condition_store";

export interface ProactiveCoachRuntimeFactV1<T> {
  readonly availability: ProactiveCoachRuntimeAvailabilityV1;
  readonly value: T | null;
  readonly source: ProactiveCoachRuntimeSourceV1;
  readonly asOf: string;
  readonly unavailableReason: string | null;
}

export interface ProactiveCoachRuntimeCollectionV1<T> {
  readonly availability: ProactiveCoachRuntimeAvailabilityV1;
  readonly values: readonly T[];
  readonly source: ProactiveCoachRuntimeSourceV1;
  readonly asOf: string;
  readonly unavailableReason: string | null;
}

export interface ProactiveCoachActiveStudySessionV1 {
  readonly active: boolean;
  readonly sessionId: string | null;
  readonly startedAt: string | null;
}

export interface ProactiveCoachRuntimePresentationV1 {
  readonly fingerprint: string;
  readonly signalType: CoachSignalTypeV1;
  readonly conditionKey: string;
  readonly attentionCategory: CoachSignalAttentionCategoryV1;
  readonly presentedAt: string;
  readonly calendarDate: string;
  readonly surfaceSessionId: string;
}

export interface ProactiveCoachRuntimeCategorySnoozeV1 {
  readonly attentionCategory: CoachSignalAttentionCategoryV1;
  readonly until: string;
}

export type ProactiveCoachClearConditionSignalTypeV1 =
  | "today_completed_as_planned"
  | "repeated_task_miss"
  | "recent_recovery"
  | "planner_warning_present";

export interface ProactiveCoachClearConditionObservationV1 {
  readonly signalType: ProactiveCoachClearConditionSignalTypeV1;
  readonly conditionKey: string;
  readonly state: "cleared" | "not_cleared";
  readonly observedAt: string;
  readonly reasonCode: string;
  readonly sourceFactPaths: readonly string[];
}

export interface ProactiveCoachRuntimeStateV1 {
  readonly version: typeof PROACTIVE_COACH_RUNTIME_STATE_V1_VERSION;
  readonly now: string;
  readonly currentDate: string;
  readonly surfaceSessionId: string;
  readonly activeStudySession: ProactiveCoachRuntimeFactV1<ProactiveCoachActiveStudySessionV1>;
  readonly presentations: ProactiveCoachRuntimeCollectionV1<ProactiveCoachRuntimePresentationV1>;
  readonly dismissedFingerprints: ProactiveCoachRuntimeCollectionV1<string>;
  readonly snoozes: ProactiveCoachRuntimeCollectionV1<ProactiveCoachRuntimeCategorySnoozeV1>;
  readonly disabledCategories: ProactiveCoachRuntimeCollectionV1<CoachSignalAttentionCategoryV1>;
  readonly clearConditions: ProactiveCoachRuntimeCollectionV1<ProactiveCoachClearConditionObservationV1>;
  readonly authority: {
    readonly mode: "server_owned_proactive_runtime_state";
    readonly clientActiveSessionOverrideAllowed: false;
    readonly deterministicDerivationOnly: true;
    readonly dbWritesAllowed: false;
    readonly llmCallsAllowed: false;
    readonly providerCallsAllowed: false;
    readonly plannerPreviewAllowed: false;
    readonly plannerProposalAllowed: false;
    readonly plannerConfirmationAllowed: false;
    readonly plannerApplyAllowed: false;
  };
}

export interface BuildProactiveCoachRuntimeStateV1Input {
  readonly now: string;
  readonly currentDate: string;
  readonly surfaceSessionId: string;
  readonly activeStudySession: ProactiveCoachRuntimeFactV1<ProactiveCoachActiveStudySessionV1>;
  readonly presentations: ProactiveCoachRuntimeCollectionV1<ProactiveCoachRuntimePresentationV1>;
  readonly dismissedFingerprints: ProactiveCoachRuntimeCollectionV1<string>;
  readonly snoozes: ProactiveCoachRuntimeCollectionV1<ProactiveCoachRuntimeCategorySnoozeV1>;
  readonly disabledCategories: ProactiveCoachRuntimeCollectionV1<CoachSignalAttentionCategoryV1>;
  readonly clearConditions: ProactiveCoachRuntimeCollectionV1<ProactiveCoachClearConditionObservationV1>;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}

function validTimestamp(value: string): boolean {
  return value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

function assertRuntimeFact<T>(
  fact: ProactiveCoachRuntimeFactV1<T>,
  label: string,
): void {
  if (!validTimestamp(fact.asOf)) throw new Error(`PROACTIVE_RUNTIME_${label}_AS_OF_INVALID`);
  if (fact.availability === "known") {
    if (fact.value === null || fact.unavailableReason !== null) {
      throw new Error(`PROACTIVE_RUNTIME_${label}_KNOWN_INVALID`);
    }
    return;
  }
  if (fact.value !== null || !fact.unavailableReason?.trim()) {
    throw new Error(`PROACTIVE_RUNTIME_${label}_UNAVAILABLE_INVALID`);
  }
}

function assertRuntimeCollection<T>(
  collection: ProactiveCoachRuntimeCollectionV1<T>,
  label: string,
): void {
  if (!validTimestamp(collection.asOf)) throw new Error(`PROACTIVE_RUNTIME_${label}_AS_OF_INVALID`);
  if (collection.availability === "known") {
    if (collection.unavailableReason !== null) {
      throw new Error(`PROACTIVE_RUNTIME_${label}_KNOWN_INVALID`);
    }
    return;
  }
  if (collection.values.length !== 0 || !collection.unavailableReason?.trim()) {
    throw new Error(`PROACTIVE_RUNTIME_${label}_UNAVAILABLE_INVALID`);
  }
}

function assertActiveSession(
  fact: ProactiveCoachRuntimeFactV1<ProactiveCoachActiveStudySessionV1>,
): void {
  assertRuntimeFact(fact, "ACTIVE_SESSION");
  if (fact.availability !== "known" || fact.value === null) return;
  const value = fact.value;
  if (value.active) {
    if (!value.sessionId?.trim() || !value.startedAt || !validTimestamp(value.startedAt)) {
      throw new Error("PROACTIVE_RUNTIME_ACTIVE_SESSION_IDENTITY_INVALID");
    }
  } else if (value.sessionId !== null || value.startedAt !== null) {
    throw new Error("PROACTIVE_RUNTIME_INACTIVE_SESSION_IDENTITY_INVALID");
  }
}

function cloneAndSortPresentations(
  values: readonly ProactiveCoachRuntimePresentationV1[],
): ProactiveCoachRuntimePresentationV1[] {
  return [...structuredClone(values)].sort(
    (left, right) => left.presentedAt.localeCompare(right.presentedAt)
      || left.fingerprint.localeCompare(right.fingerprint),
  );
}

function cloneAndSortSnoozes(
  values: readonly ProactiveCoachRuntimeCategorySnoozeV1[],
): ProactiveCoachRuntimeCategorySnoozeV1[] {
  return [...structuredClone(values)].sort(
    (left, right) => left.attentionCategory.localeCompare(right.attentionCategory)
      || left.until.localeCompare(right.until),
  );
}

function authority(): ProactiveCoachRuntimeStateV1["authority"] {
  return {
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
  };
}

export function buildProactiveCoachRuntimeStateV1(
  input: BuildProactiveCoachRuntimeStateV1Input,
): ProactiveCoachRuntimeStateV1 {
  if (!validTimestamp(input.now)) throw new Error("PROACTIVE_RUNTIME_NOW_INVALID");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.currentDate)) {
    throw new Error("PROACTIVE_RUNTIME_CURRENT_DATE_INVALID");
  }
  if (!input.surfaceSessionId.trim()) throw new Error("PROACTIVE_RUNTIME_SURFACE_SESSION_ID_INVALID");

  assertActiveSession(input.activeStudySession);
  assertRuntimeCollection(input.presentations, "PRESENTATIONS");
  assertRuntimeCollection(input.dismissedFingerprints, "DISMISSED_FINGERPRINTS");
  assertRuntimeCollection(input.snoozes, "SNOOZES");
  assertRuntimeCollection(input.disabledCategories, "DISABLED_CATEGORIES");
  assertRuntimeCollection(input.clearConditions, "CLEAR_CONDITIONS");

  for (const presentation of input.presentations.values) {
    if (
      !presentation.fingerprint.trim()
      || !presentation.conditionKey.trim()
      || !presentation.surfaceSessionId.trim()
      || !validTimestamp(presentation.presentedAt)
      || !/^\d{4}-\d{2}-\d{2}$/.test(presentation.calendarDate)
    ) throw new Error("PROACTIVE_RUNTIME_PRESENTATION_INVALID");
  }
  for (const snooze of input.snoozes.values) {
    if (!validTimestamp(snooze.until)) throw new Error("PROACTIVE_RUNTIME_SNOOZE_INVALID");
  }
  if (input.dismissedFingerprints.values.some((value) => !value.trim())) {
    throw new Error("PROACTIVE_RUNTIME_DISMISSED_FINGERPRINT_INVALID");
  }
  for (const observation of input.clearConditions.values) {
    if (
      !observation.conditionKey.trim()
      || !observation.reasonCode.trim()
      || !validTimestamp(observation.observedAt)
      || observation.sourceFactPaths.length === 0
      || observation.sourceFactPaths.some((path) => !path.trim())
    ) throw new Error("PROACTIVE_RUNTIME_CLEAR_CONDITION_INVALID");
  }

  return deepFreeze({
    version: PROACTIVE_COACH_RUNTIME_STATE_V1_VERSION,
    now: input.now,
    currentDate: input.currentDate,
    surfaceSessionId: input.surfaceSessionId,
    activeStudySession: structuredClone(input.activeStudySession),
    presentations: {
      ...structuredClone(input.presentations),
      values: cloneAndSortPresentations(input.presentations.values),
    },
    dismissedFingerprints: {
      ...structuredClone(input.dismissedFingerprints),
      values: [...new Set(input.dismissedFingerprints.values)].sort(),
    },
    snoozes: {
      ...structuredClone(input.snoozes),
      values: cloneAndSortSnoozes(input.snoozes.values),
    },
    disabledCategories: {
      ...structuredClone(input.disabledCategories),
      values: [...new Set(input.disabledCategories.values)].sort(),
    },
    clearConditions: {
      ...structuredClone(input.clearConditions),
      values: [...structuredClone(input.clearConditions.values)].sort(
        (left, right) => left.observedAt.localeCompare(right.observedAt)
          || left.conditionKey.localeCompare(right.conditionKey),
      ),
    },
    authority: authority(),
  });
}
