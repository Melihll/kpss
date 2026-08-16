import { describe, expect, it } from "vitest";
import { persistTasksToBacklog } from "../supabase/functions/_shared/adaptive.ts";

function recordingClient(error: unknown = null) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const builder = {
    update(...args: unknown[]) { calls.push({ method: "update", args }); return builder; },
    eq(...args: unknown[]) { calls.push({ method: "eq", args }); return builder; },
    not(...args: unknown[]) { calls.push({ method: "not", args }); return builder; },
    in(...args: unknown[]) {
      calls.push({ method: "in", args });
      return args[0] === "status" ? Promise.resolve({ error }) : builder;
    },
  };
  return {
    calls,
    client: {
      from(table: string) { calls.push({ method: "from", args: [table] }); return builder; },
    },
  };
}

describe("stale daily overflow persistence", () => {
  it("unassigns overflow without deleting the task or touching progress", async () => {
    const recorder = recordingClient();
    await persistTasksToBacklog(recorder.client, "user", "plan", ["overflow"]);
    expect(recorder.calls).toContainEqual({ method: "from", args: ["tasks"] });
    expect(recorder.calls).toContainEqual({ method: "update", args: [{ planned_date: null, status: "rescheduled" }] });
    expect(recorder.calls).toContainEqual({ method: "eq", args: ["user_id", "user"] });
    expect(recorder.calls).toContainEqual({ method: "eq", args: ["weekly_plan_id", "plan"] });
    expect(recorder.calls).toContainEqual({ method: "in", args: ["id", ["overflow"]] });
    expect(recorder.calls).toContainEqual({ method: "not", args: ["planned_date", "is", null] });
    expect(recorder.calls.some((call) => call.method === "delete")).toBe(false);
    expect(JSON.stringify(recorder.calls)).not.toContain("task_progress");
  });

  it("does not write when replanning returns no newly scheduled overflow", async () => {
    const recorder = recordingClient();
    expect(await persistTasksToBacklog(recorder.client, "user", "plan", [])).toEqual({ applied: false, taskIds: [] });
    expect(recorder.calls).toEqual([]);
  });
});
