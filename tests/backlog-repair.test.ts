import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyScheduleExceptionWithCompensation,
  resolveNextPlanningBudget,
} from "../supabase/functions/_shared/adaptive.ts";

function scheduleExceptionClient(compensationError: unknown = null) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  let equalityCount = 0;
  const deleteBuilder = {
    eq(...args: unknown[]) {
      calls.push({ method: "eq", args });
      equalityCount += 1;
      return equalityCount === 3 ? Promise.resolve({ error: compensationError }) : deleteBuilder;
    },
  };
  const table = {
    insert(...args: unknown[]) {
      calls.push({ method: "insert", args });
      return {
        select(...selectArgs: unknown[]) {
          calls.push({ method: "select", args: selectArgs });
          return {
            single() {
              calls.push({ method: "single", args: [] });
              return Promise.resolve({ data: { id: "exception-id" }, error: null });
            },
          };
        },
      };
    },
    delete() {
      calls.push({ method: "delete", args: [] });
      return deleteBuilder;
    },
  };
  return {
    calls,
    client: {
      from(name: string) {
        calls.push({ method: "from", args: [name] });
        return table;
      },
    },
  };
}

const exception = {
  user_id: "user",
  exam_profile_id: "profile",
  exception_date: "2026-08-17",
  exception_type: "custom",
  minutes_delta: 60,
  note: "Telegram: sınırlı zaman",
};

describe("atomic adaptive-plan persistence", () => {
  it("does not compensate a successful schedule-exception replan", async () => {
    const recorder = scheduleExceptionClient();
    await expect(applyScheduleExceptionWithCompensation(recorder.client, exception, async () => "ok")).resolves.toBe("ok");
    expect(recorder.calls.some((call) => call.method === "delete")).toBe(false);
  });

  it("removes only the newly inserted owned exception when replanning fails", async () => {
    const recorder = scheduleExceptionClient();
    const failure = new Error("REVISION_FAILED");
    await expect(applyScheduleExceptionWithCompensation(recorder.client, exception, async () => { throw failure; })).rejects.toBe(failure);
    expect(recorder.calls).toContainEqual({ method: "delete", args: [] });
    expect(recorder.calls).toContainEqual({ method: "eq", args: ["id", "exception-id"] });
    expect(recorder.calls).toContainEqual({ method: "eq", args: ["user_id", "user"] });
    expect(recorder.calls).toContainEqual({ method: "eq", args: ["exam_profile_id", "profile"] });
  });

  it("keeps the imported 1785-minute planning budget after a positive capacity change", () => {
    expect(resolveNextPlanningBudget({
      planAvailableMinutes: 1800,
      planPlanningBudgetMinutes: 1785,
      outputAvailableMinutes: 1845,
      hasDailyCapacityOverrides: true,
    })).toBe(1785);
  });

  it("has no standalone task backlog write before the revision RPC", () => {
    const source = readFileSync(resolve("supabase/functions/_shared/adaptive.ts"), "utf8");
    expect(source).not.toContain("persistTasksToBacklog");
    expect(source).not.toMatch(/from\(["']tasks["']\)\.update\(\{planned_date:null,status:["']rescheduled["']/);
  });

  it("puts backlog mutation inside the additive plan-revision transaction", () => {
    const sql = readFileSync(resolve("supabase/migrations/20260817130000_make_plan_revision_atomic.sql"), "utf8");
    expect(sql).toContain("create or replace function public.apply_plan_revision");
    expect(sql).toContain("p_payload->'tasksToBacklog'");
    expect(sql).toContain("set planned_date=null,status='rescheduled'");
    expect(sql.indexOf("p_payload->'tasksToBacklog'")).toBeLessThan(sql.indexOf("p_payload->'tasksToMove'"));
    expect(sql).toContain("and user_id=v_user and weekly_plan_id=v_plan.id");
  });
});
