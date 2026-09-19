import { describe, expect, it } from "vitest";
import { loadProactiveCoachActiveSessionReadOnly } from "./proactive-coach-active-session-readonly.ts";

const USER = "00000000-0000-4000-8000-000000000001";
const PROFILE = "00000000-0000-4000-8000-000000000002";
const NOW = new Date("2026-09-19T09:00:00.000Z");

class Query implements PromiseLike<{ data: unknown; error: unknown }> {
  readonly filters: Array<readonly [string, unknown]> = [];
  readonly orders: Array<readonly [string, { readonly ascending: boolean }]> = [];
  maximum: number | null = null;

  constructor(
    private readonly rows: readonly Record<string, unknown>[],
    private readonly error: unknown,
  ) {}

  select() { return this; }
  eq(column: string, value: unknown) { this.filters.push([column, value]); return this; }
  order(column: string, options: { readonly ascending: boolean }) { this.orders.push([column, options]); return this; }
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

class ReadOnlyClient {
  readonly calls: string[] = [];
  query: Query | null = null;
  constructor(
    private readonly rows: readonly Record<string, unknown>[],
    private readonly error: unknown = null,
  ) {}
  from(table: string) {
    this.calls.push(`select:${table}`);
    this.query = new Query(this.rows, this.error);
    return this.query;
  }
  insert() { throw new Error("MUTATION_FORBIDDEN"); }
  update() { throw new Error("MUTATION_FORBIDDEN"); }
  upsert() { throw new Error("MUTATION_FORBIDDEN"); }
  delete() { throw new Error("MUTATION_FORBIDDEN"); }
  rpc() { throw new Error("RPC_FORBIDDEN"); }
}

function active(overrides: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000003",
    user_id: USER,
    exam_profile_id: PROFILE,
    status: "active",
    started_at: "2026-09-19T08:00:00.000Z",
    ...overrides,
  };
}

describe("Proactive Coach active-session read-only resolver", () => {
  it("reads exactly the authenticated user/profile active session with a bound of two", async () => {
    const client = new ReadOnlyClient([active(), active({ status: "completed" }), active({ user_id: "other" })]);
    const result = await loadProactiveCoachActiveSessionReadOnly({ client, userId: USER, examProfileId: PROFILE, now: NOW });

    expect(result).toMatchObject({ availability: "known", value: { active: true, sessionId: active().id } });
    expect(client.calls).toEqual(["select:study_sessions"]);
    expect(client.query?.filters).toEqual([
      ["user_id", USER],
      ["exam_profile_id", PROFILE],
      ["status", "active"],
    ]);
    expect(client.query?.maximum).toBe(2);
  });

  it("returns authoritative inactive only after a successful empty read", async () => {
    const result = await loadProactiveCoachActiveSessionReadOnly({ client: new ReadOnlyClient([]), userId: USER, examProfileId: PROFILE, now: NOW });
    expect(result).toMatchObject({ availability: "known", value: { active: false, sessionId: null, startedAt: null } });
  });

  it("fails closed on read failure, ambiguity, or malformed ownership", async () => {
    await expect(loadProactiveCoachActiveSessionReadOnly({ client: new ReadOnlyClient([], new Error("db unavailable")), userId: USER, examProfileId: PROFILE, now: NOW }))
      .resolves.toMatchObject({ availability: "unavailable", value: null, unavailableReason: "active_session_read_failed" });
    await expect(loadProactiveCoachActiveSessionReadOnly({ client: new ReadOnlyClient([active(), active({ id: "session-2" })]), userId: USER, examProfileId: PROFILE, now: NOW }))
      .resolves.toMatchObject({ availability: "ambiguous", value: null, unavailableReason: "multiple_active_sessions_found" });
    await expect(loadProactiveCoachActiveSessionReadOnly({ client: new ReadOnlyClient([active({ started_at: "invalid" })]), userId: USER, examProfileId: PROFILE, now: NOW }))
      .resolves.toMatchObject({ availability: "ambiguous", value: null, unavailableReason: "active_session_row_invalid" });
  });

  it("fails closed when the database client throws", async () => {
    const throwingClient = {
      from() {
        throw new Error("network unavailable");
      },
    };
    await expect(loadProactiveCoachActiveSessionReadOnly({ client: throwingClient, userId: USER, examProfileId: PROFILE, now: NOW }))
      .resolves.toMatchObject({ availability: "unavailable", value: null, unavailableReason: "active_session_read_failed" });
  });

  it("performs no mutation, RPC, Planner, or provider operation", async () => {
    const client = new ReadOnlyClient([active()]);
    await loadProactiveCoachActiveSessionReadOnly({ client, userId: USER, examProfileId: PROFILE, now: NOW });
    expect(client.calls).toEqual(["select:study_sessions"]);
  });
});
