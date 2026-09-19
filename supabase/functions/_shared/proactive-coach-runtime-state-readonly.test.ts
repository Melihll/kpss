import { describe, expect, it } from "vitest";
import { loadProactiveCoachRuntimeStateV1ReadOnly, PROACTIVE_COACH_RUNTIME_READ_LIMITS_V1 } from "./proactive-coach-runtime-state-readonly.ts";

const USER = "00000000-0000-4000-8000-000000000001";
const PROFILE = "00000000-0000-4000-8000-000000000002";
const NOW = new Date("2026-09-19T09:00:00.000Z");

class Query implements PromiseLike<{ data: unknown; error: unknown }> {
  readonly filters: Array<readonly [string, unknown]> = [];
  maximum: number | null = null;
  constructor(private readonly rows: readonly Record<string, unknown>[], private readonly error: unknown) {}
  select() { return this; }
  eq(column: string, value: unknown) { this.filters.push([column, value]); return this; }
  order() { return this; }
  limit(value: number) { this.maximum = value; return this; }
  then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
    resolve?: ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
    reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    let data = this.rows.filter((row) => this.filters.every(([key, value]) => row[key] === value));
    if (this.maximum !== null) data = data.slice(0, this.maximum);
    return Promise.resolve({ data, error: this.error }).then(resolve, reject);
  }
}

class Client {
  readonly calls: Array<{ readonly table: string; readonly query: Query }> = [];
  constructor(
    private readonly tables: Readonly<Record<string, readonly Record<string, unknown>[]>>,
    private readonly failures: ReadonlySet<string> = new Set(),
  ) {}
  from(table: string) {
    const query = new Query(this.tables[table] ?? [], this.failures.has(table) ? new Error("read failed") : null);
    this.calls.push({ table, query });
    return query;
  }
  insert() { throw new Error("MUTATION_FORBIDDEN"); }
  update() { throw new Error("MUTATION_FORBIDDEN"); }
  upsert() { throw new Error("MUTATION_FORBIDDEN"); }
  delete() { throw new Error("MUTATION_FORBIDDEN"); }
  rpc() { throw new Error("RPC_FORBIDDEN"); }
}

function rows() {
  return {
    study_sessions: [{ id: "session-1", user_id: USER, exam_profile_id: PROFILE, status: "active", started_at: "2026-09-19T08:00:00.000Z" }],
    ai_coach_proactive_presentations: [{
      user_id: USER,
      exam_profile_id: PROFILE,
      fingerprint: "fingerprint-1",
      signal_type: "today_completed_as_planned",
      condition_key: "today_completed_as_planned:2026-09-19",
      attention_category: "progress",
      presented_at: "2026-09-19T08:30:00.000Z",
      calendar_date: "2026-09-19",
      surface_session_id: "surface-1",
    }],
    ai_coach_proactive_user_controls: [
      { user_id: USER, exam_profile_id: PROFILE, control_kind: "dismiss_fingerprint", fingerprint: "dismissed-1", attention_category: null, snoozed_until: null, disabled: null },
      { user_id: USER, exam_profile_id: PROFILE, control_kind: "snooze_category", fingerprint: null, attention_category: "planner", snoozed_until: "2026-09-20T09:00:00.000Z", disabled: null },
      { user_id: USER, exam_profile_id: PROFILE, control_kind: "snooze_category", fingerprint: null, attention_category: "material", snoozed_until: "2026-09-18T09:00:00.000Z", disabled: null },
      { user_id: USER, exam_profile_id: PROFILE, control_kind: "disable_category", fingerprint: null, attention_category: "capacity", snoozed_until: null, disabled: true },
      { user_id: USER, exam_profile_id: PROFILE, control_kind: "disable_category", fingerprint: null, attention_category: "progress", snoozed_until: null, disabled: false },
    ],
    ai_coach_proactive_clear_observations: [{
      user_id: USER,
      exam_profile_id: PROFILE,
      signal_type: "repeated_task_miss",
      condition_key: "repeated_task_miss:task-1",
      observed_at: "2026-09-18T09:00:00.000Z",
      reason_code: "same_task_completion_observed",
      source_fact_paths: ["recentProgress.value.taskEvents"],
    }],
  };
}

describe("Proactive Coach persisted runtime-state read adapter", () => {
  it("loads exact user/profile state deterministically and keeps canonical active-session authority", async () => {
    const client = new Client(rows());
    const input = { client, userId: USER, examProfileId: PROFILE, currentDate: "2026-09-19", surfaceSessionId: "surface-current", now: NOW };
    const first = await loadProactiveCoachRuntimeStateV1ReadOnly(input);
    const second = await loadProactiveCoachRuntimeStateV1ReadOnly(input);

    expect(second).toEqual(first);
    expect(first.activeStudySession).toMatchObject({ availability: "known", value: { active: true, sessionId: "session-1" } });
    expect(first.presentations.values).toHaveLength(1);
    expect(first.dismissedFingerprints.values).toEqual(["dismissed-1"]);
    expect(first.snoozes.values).toEqual([
      { attentionCategory: "material", until: "2026-09-18T09:00:00.000Z" },
      { attentionCategory: "planner", until: "2026-09-20T09:00:00.000Z" },
    ]);
    expect(first.disabledCategories.values).toEqual(["capacity"]);
    expect(first.clearConditions.values).toHaveLength(1);
    expect(new Set(client.calls.map((call) => call.table))).toEqual(new Set([
      "study_sessions",
      "ai_coach_proactive_presentations",
      "ai_coach_proactive_user_controls",
      "ai_coach_proactive_clear_observations",
    ]));
    for (const { query } of client.calls) {
      expect(query.filters).toContainEqual(["user_id", USER]);
      expect(query.filters).toContainEqual(["exam_profile_id", PROFILE]);
    }
  });

  it("propagates field-level read failures instead of treating them as empty state", async () => {
    const result = await loadProactiveCoachRuntimeStateV1ReadOnly({
      client: new Client(rows(), new Set(["ai_coach_proactive_user_controls", "ai_coach_proactive_clear_observations"])),
      userId: USER,
      examProfileId: PROFILE,
      currentDate: "2026-09-19",
      surfaceSessionId: "surface-current",
      now: NOW,
    });
    expect(result.presentations.availability).toBe("known");
    expect(result.dismissedFingerprints).toMatchObject({ availability: "unavailable", values: [], unavailableReason: "user_control_read_failed" });
    expect(result.snoozes.availability).toBe("unavailable");
    expect(result.disabledCategories.availability).toBe("unavailable");
    expect(result.clearConditions).toMatchObject({ availability: "unavailable", values: [], unavailableReason: "clear_observation_read_failed" });
  });

  it("fails malformed or over-limit state closed as ambiguous", async () => {
    const malformed = rows();
    malformed.ai_coach_proactive_presentations[0] = { ...malformed.ai_coach_proactive_presentations[0], calendar_date: "invalid" };
    const malformedResult = await loadProactiveCoachRuntimeStateV1ReadOnly({ client: new Client(malformed), userId: USER, examProfileId: PROFILE, currentDate: "2026-09-19", surfaceSessionId: "surface-current", now: NOW });
    expect(malformedResult.presentations).toMatchObject({ availability: "ambiguous", unavailableReason: "presentation_history_row_invalid" });

    const excessive = rows();
    excessive.ai_coach_proactive_presentations = Array.from(
      { length: PROACTIVE_COACH_RUNTIME_READ_LIMITS_V1.presentations + 1 },
      (_, index) => ({ ...rows().ai_coach_proactive_presentations[0], fingerprint: `fingerprint-${index}` }),
    );
    const excessiveResult = await loadProactiveCoachRuntimeStateV1ReadOnly({ client: new Client(excessive), userId: USER, examProfileId: PROFILE, currentDate: "2026-09-19", surfaceSessionId: "surface-current", now: NOW });
    expect(excessiveResult.presentations).toMatchObject({ availability: "ambiguous", unavailableReason: "presentation_history_bound_exceeded" });
  });

  it("uses bounded select-only reads and exposes no client active-session override", async () => {
    const client = new Client(rows());
    await loadProactiveCoachRuntimeStateV1ReadOnly({ client, userId: USER, examProfileId: PROFILE, currentDate: "2026-09-19", surfaceSessionId: "surface-current", now: NOW });
    expect(client.calls.find((call) => call.table === "study_sessions")?.query.maximum).toBe(2);
    expect(client.calls.find((call) => call.table === "ai_coach_proactive_presentations")?.query.maximum).toBe(PROACTIVE_COACH_RUNTIME_READ_LIMITS_V1.presentations + 1);
    expect(client.calls.find((call) => call.table === "ai_coach_proactive_user_controls")?.query.maximum).toBe(PROACTIVE_COACH_RUNTIME_READ_LIMITS_V1.userControls + 1);
    expect(client.calls.find((call) => call.table === "ai_coach_proactive_clear_observations")?.query.maximum).toBe(PROACTIVE_COACH_RUNTIME_READ_LIMITS_V1.clearObservations + 1);
  });
});
