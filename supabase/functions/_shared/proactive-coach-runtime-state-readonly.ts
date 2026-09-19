import {
  buildProactiveCoachRuntimeStateV1,
  type ProactiveCoachClearConditionObservationV1,
  type ProactiveCoachRuntimeCollectionV1,
  type ProactiveCoachRuntimePresentationV1,
  type ProactiveCoachRuntimeSourceV1,
  type ProactiveCoachRuntimeStateV1,
} from "../../../packages/domain/src/ai-coach/proactive-coach-runtime-state-v1.ts";
import type { CoachSignalAttentionCategoryV1, CoachSignalTypeV1 } from "../../../packages/domain/src/ai-coach/coach-signal-v1.ts";
import { loadProactiveCoachActiveSessionReadOnly } from "./proactive-coach-active-session-readonly.ts";

type Client = any;

export const PROACTIVE_COACH_RUNTIME_READ_LIMITS_V1 = Object.freeze({
  presentations: 256,
  userControls: 256,
  clearObservations: 256,
});

const SIGNAL_TYPES = new Set<CoachSignalTypeV1>([
  "today_completed_as_planned",
  "repeated_task_miss",
  "recent_recovery",
  "planner_warning_present",
]);
const CATEGORIES = new Set<CoachSignalAttentionCategoryV1>([
  "progress",
  "consistency",
  "capacity",
  "material",
  "planner",
  "data_quality",
]);

export interface LoadProactiveCoachRuntimeStateV1ReadOnlyInput {
  readonly client: Client;
  /** Authenticated server-derived user identity. */
  readonly userId: string;
  /** Authenticated server-derived active exam profile identity. */
  readonly examProfileId: string;
  /** User-local date derived by the server from the canonical timezone. */
  readonly currentDate: string;
  /** Server-issued in-app surface/session identity. */
  readonly surfaceSessionId: string;
  readonly now?: Date;
}

function collection<T>(
  values: readonly T[],
  source: ProactiveCoachRuntimeSourceV1,
  asOf: string,
): ProactiveCoachRuntimeCollectionV1<T> {
  return { availability: "known", values, source, asOf, unavailableReason: null };
}

function unavailable<T>(
  availability: "unavailable" | "ambiguous",
  source: ProactiveCoachRuntimeSourceV1,
  asOf: string,
  unavailableReason: string,
): ProactiveCoachRuntimeCollectionV1<T> {
  return { availability, values: [], source, asOf, unavailableReason };
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function timestamp(value: unknown): value is string {
  return text(value) && Number.isFinite(Date.parse(value));
}

function date(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parsePresentations(
  rows: readonly any[],
  asOf: string,
  userId: string,
  examProfileId: string,
): ProactiveCoachRuntimeCollectionV1<ProactiveCoachRuntimePresentationV1> {
  if (rows.length > PROACTIVE_COACH_RUNTIME_READ_LIMITS_V1.presentations) {
    return unavailable("ambiguous", "proactive_presentation_store", asOf, "presentation_history_bound_exceeded");
  }
  const values: ProactiveCoachRuntimePresentationV1[] = [];
  for (const row of rows) {
    if (
      row?.user_id !== userId
      || row?.exam_profile_id !== examProfileId
      || !text(row?.fingerprint)
      || !SIGNAL_TYPES.has(row?.signal_type)
      || !text(row?.condition_key)
      || !CATEGORIES.has(row?.attention_category)
      || !timestamp(row?.presented_at)
      || !date(row?.calendar_date)
      || !text(row?.surface_session_id)
    ) return unavailable("ambiguous", "proactive_presentation_store", asOf, "presentation_history_row_invalid");
    values.push({
      fingerprint: row.fingerprint,
      signalType: row.signal_type,
      conditionKey: row.condition_key,
      attentionCategory: row.attention_category,
      presentedAt: row.presented_at,
      calendarDate: row.calendar_date,
      surfaceSessionId: row.surface_session_id,
    });
  }
  return collection(values, "proactive_presentation_store", asOf);
}

function parseControls(rows: readonly any[], asOf: string, userId: string, examProfileId: string): {
  readonly dismissedFingerprints: ProactiveCoachRuntimeCollectionV1<string>;
  readonly snoozes: ProactiveCoachRuntimeCollectionV1<{ readonly attentionCategory: CoachSignalAttentionCategoryV1; readonly until: string }>;
  readonly disabledCategories: ProactiveCoachRuntimeCollectionV1<CoachSignalAttentionCategoryV1>;
} {
  const source = "proactive_user_control_store" as const;
  const failed = (reason: string) => ({
    dismissedFingerprints: unavailable<string>("ambiguous", source, asOf, reason),
    snoozes: unavailable<{ readonly attentionCategory: CoachSignalAttentionCategoryV1; readonly until: string }>("ambiguous", source, asOf, reason),
    disabledCategories: unavailable<CoachSignalAttentionCategoryV1>("ambiguous", source, asOf, reason),
  });
  if (rows.length > PROACTIVE_COACH_RUNTIME_READ_LIMITS_V1.userControls) return failed("user_control_bound_exceeded");

  const dismissed: string[] = [];
  const snoozes: Array<{ attentionCategory: CoachSignalAttentionCategoryV1; until: string }> = [];
  const disabled: CoachSignalAttentionCategoryV1[] = [];
  for (const row of rows) {
    if (row?.user_id !== userId || row?.exam_profile_id !== examProfileId) return failed("user_control_row_invalid");
    if (row?.control_kind === "dismiss_fingerprint") {
      if (!text(row.fingerprint) || row.attention_category !== null || row.snoozed_until !== null || row.disabled !== null) {
        return failed("user_control_row_invalid");
      }
      dismissed.push(row.fingerprint);
    } else if (row?.control_kind === "snooze_category") {
      if (!CATEGORIES.has(row.attention_category) || !timestamp(row.snoozed_until) || row.fingerprint !== null || row.disabled !== null) {
        return failed("user_control_row_invalid");
      }
      snoozes.push({ attentionCategory: row.attention_category, until: row.snoozed_until });
    } else if (row?.control_kind === "disable_category") {
      if (!CATEGORIES.has(row.attention_category) || typeof row.disabled !== "boolean" || row.fingerprint !== null || row.snoozed_until !== null) {
        return failed("user_control_row_invalid");
      }
      if (row.disabled) disabled.push(row.attention_category);
    } else return failed("user_control_row_invalid");
  }
  return {
    dismissedFingerprints: collection(dismissed, source, asOf),
    snoozes: collection(snoozes, source, asOf),
    disabledCategories: collection(disabled, source, asOf),
  };
}

function parseClearObservations(
  rows: readonly any[],
  asOf: string,
  userId: string,
  examProfileId: string,
): ProactiveCoachRuntimeCollectionV1<ProactiveCoachClearConditionObservationV1> {
  const source = "proactive_clear_condition_store" as const;
  if (rows.length > PROACTIVE_COACH_RUNTIME_READ_LIMITS_V1.clearObservations) {
    return unavailable("ambiguous", source, asOf, "clear_observation_bound_exceeded");
  }
  const values: ProactiveCoachClearConditionObservationV1[] = [];
  for (const row of rows) {
    if (
      row?.user_id !== userId
      || row?.exam_profile_id !== examProfileId
      || !["repeated_task_miss", "planner_warning_present"].includes(row?.signal_type)
      || !text(row?.condition_key)
      || !timestamp(row?.observed_at)
      || !text(row?.reason_code)
      || !Array.isArray(row?.source_fact_paths)
      || row.source_fact_paths.length === 0
      || row.source_fact_paths.some((path: unknown) => !text(path))
    ) return unavailable("ambiguous", source, asOf, "clear_observation_row_invalid");
    values.push({
      signalType: row.signal_type,
      conditionKey: row.condition_key,
      state: "cleared",
      observedAt: row.observed_at,
      reasonCode: row.reason_code,
      sourceFactPaths: row.source_fact_paths,
    });
  }
  return collection(values, source, asOf);
}

async function readRows(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<readonly any[]> {
  const result = await query;
  if (result.error) throw result.error;
  if (!Array.isArray(result.data)) throw new Error("PROACTIVE_RUNTIME_READ_RESULT_INVALID");
  return result.data;
}

export async function loadProactiveCoachRuntimeStateV1ReadOnly(
  input: LoadProactiveCoachRuntimeStateV1ReadOnlyInput,
): Promise<ProactiveCoachRuntimeStateV1> {
  if (!text(input.userId) || !text(input.examProfileId)) throw new Error("PROACTIVE_RUNTIME_IDENTITY_REQUIRED");
  const now = input.now ?? new Date();
  if (Number.isNaN(now.getTime())) throw new Error("PROACTIVE_RUNTIME_NOW_INVALID");
  const asOf = now.toISOString();

  const activePromise = loadProactiveCoachActiveSessionReadOnly({
    client: input.client,
    userId: input.userId,
    examProfileId: input.examProfileId,
    now,
  });
  const presentationPromise = readRows(input.client
    .from("ai_coach_proactive_presentations")
    .select("user_id,exam_profile_id,fingerprint,signal_type,condition_key,attention_category,presented_at,calendar_date,surface_session_id")
    .eq("user_id", input.userId)
    .eq("exam_profile_id", input.examProfileId)
    .order("presented_at", { ascending: false })
    .limit(PROACTIVE_COACH_RUNTIME_READ_LIMITS_V1.presentations + 1));
  const controlPromise = readRows(input.client
    .from("ai_coach_proactive_user_controls")
    .select("user_id,exam_profile_id,control_kind,fingerprint,attention_category,snoozed_until,disabled")
    .eq("user_id", input.userId)
    .eq("exam_profile_id", input.examProfileId)
    .order("updated_at", { ascending: false })
    .limit(PROACTIVE_COACH_RUNTIME_READ_LIMITS_V1.userControls + 1));
  const clearPromise = readRows(input.client
    .from("ai_coach_proactive_clear_observations")
    .select("user_id,exam_profile_id,signal_type,condition_key,observed_at,reason_code,source_fact_paths")
    .eq("user_id", input.userId)
    .eq("exam_profile_id", input.examProfileId)
    .order("observed_at", { ascending: false })
    .limit(PROACTIVE_COACH_RUNTIME_READ_LIMITS_V1.clearObservations + 1));

  const [active, presentationsRead, controlsRead, clearRead] = await Promise.allSettled([
    activePromise,
    presentationPromise,
    controlPromise,
    clearPromise,
  ]);
  const presentations = presentationsRead.status === "fulfilled"
    ? parsePresentations(presentationsRead.value, asOf, input.userId, input.examProfileId)
    : unavailable<ProactiveCoachRuntimePresentationV1>("unavailable", "proactive_presentation_store", asOf, "presentation_history_read_failed");
  const controls = controlsRead.status === "fulfilled"
    ? parseControls(controlsRead.value, asOf, input.userId, input.examProfileId)
    : {
        dismissedFingerprints: unavailable<string>("unavailable", "proactive_user_control_store", asOf, "user_control_read_failed"),
        snoozes: unavailable<{ readonly attentionCategory: CoachSignalAttentionCategoryV1; readonly until: string }>("unavailable", "proactive_user_control_store", asOf, "user_control_read_failed"),
        disabledCategories: unavailable<CoachSignalAttentionCategoryV1>("unavailable", "proactive_user_control_store", asOf, "user_control_read_failed"),
      };
  const clearConditions = clearRead.status === "fulfilled"
    ? parseClearObservations(clearRead.value, asOf, input.userId, input.examProfileId)
    : unavailable<ProactiveCoachClearConditionObservationV1>("unavailable", "proactive_clear_condition_store", asOf, "clear_observation_read_failed");

  return buildProactiveCoachRuntimeStateV1({
    now: asOf,
    currentDate: input.currentDate,
    surfaceSessionId: input.surfaceSessionId,
    activeStudySession: active.status === "fulfilled" ? active.value : {
      availability: "unavailable",
      value: null,
      source: "study_sessions_active_readonly",
      asOf,
      unavailableReason: "active_session_read_failed",
    },
    presentations,
    dismissedFingerprints: controls.dismissedFingerprints,
    snoozes: controls.snoozes,
    disabledCategories: controls.disabledCategories,
    clearConditions,
  });
}
