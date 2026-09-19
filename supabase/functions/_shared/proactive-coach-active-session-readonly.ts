import type {
  ProactiveCoachActiveStudySessionV1,
  ProactiveCoachRuntimeFactV1,
} from "../../../packages/domain/src/ai-coach/proactive-coach-runtime-state-v1.ts";

type Client = any;

export interface ProactiveCoachActiveSessionReadOnlyInput {
  readonly client: Client;
  /** Authenticated server-derived identity; never accepted from Coach prose/model output. */
  readonly userId: string;
  /** Authenticated server-derived active profile identity. */
  readonly examProfileId: string;
  readonly now?: Date;
}

export type ProactiveCoachActiveSessionReadOnlyResult =
  ProactiveCoachRuntimeFactV1<ProactiveCoachActiveStudySessionV1>;

function unavailable(
  availability: "unavailable" | "ambiguous",
  reason: string,
  asOf: string,
): ProactiveCoachActiveSessionReadOnlyResult {
  return {
    availability,
    value: null,
    source: "study_sessions_active_readonly",
    asOf,
    unavailableReason: reason,
  };
}

export async function loadProactiveCoachActiveSessionReadOnly(
  input: ProactiveCoachActiveSessionReadOnlyInput,
): Promise<ProactiveCoachActiveSessionReadOnlyResult> {
  if (!input.userId.trim() || !input.examProfileId.trim()) {
    throw new Error("PROACTIVE_ACTIVE_SESSION_IDENTITY_REQUIRED");
  }
  const now = input.now ?? new Date();
  if (Number.isNaN(now.getTime())) throw new Error("PROACTIVE_ACTIVE_SESSION_NOW_INVALID");
  const asOf = now.toISOString();

  let result: { readonly data: unknown; readonly error: unknown };
  try {
    result = await input.client
      .from("study_sessions")
      .select("id,user_id,exam_profile_id,status,started_at")
      .eq("user_id", input.userId)
      .eq("exam_profile_id", input.examProfileId)
      .eq("status", "active")
      .order("started_at", { ascending: false })
      .limit(2);
  } catch {
    return unavailable("unavailable", "active_session_read_failed", asOf);
  }

  if (result.error) return unavailable("unavailable", "active_session_read_failed", asOf);
  if (!Array.isArray(result.data)) return unavailable("ambiguous", "active_session_result_invalid", asOf);
  if (result.data.length > 1) return unavailable("ambiguous", "multiple_active_sessions_found", asOf);
  if (result.data.length === 0) {
    return {
      availability: "known",
      value: { active: false, sessionId: null, startedAt: null },
      source: "study_sessions_active_readonly",
      asOf,
      unavailableReason: null,
    };
  }

  const row = result.data[0];
  if (
    row?.user_id !== input.userId
    || row?.exam_profile_id !== input.examProfileId
    || row?.status !== "active"
    || typeof row?.id !== "string"
    || row.id.trim().length === 0
    || typeof row?.started_at !== "string"
    || !Number.isFinite(Date.parse(row.started_at))
  ) return unavailable("ambiguous", "active_session_row_invalid", asOf);

  return {
    availability: "known",
    value: { active: true, sessionId: row.id, startedAt: row.started_at },
    source: "study_sessions_active_readonly",
    asOf,
    unavailableReason: null,
  };
}
