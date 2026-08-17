import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { replanWeeklyPlanV1 } from "./replan";
import type { AdaptiveRevision, AdaptiveTask, ReplanContext } from "./types";

const t = (id: string, overrides: Partial<AdaptiveTask> = {}): AdaptiveTask => ({
  id,
  subjectId: "s",
  curriculumNodeId: "n",
  title: id,
  plannedDate: "2026-08-03",
  estimatedMinutes: 60,
  completedMinutes: 0,
  importance: "important",
  priorityScore: 50,
  status: "ready",
  createdAt: id,
  postponementCount: 0,
  ...overrides,
});
const rev = (id: string, overrides: Partial<AdaptiveRevision> = {}): AdaptiveRevision => ({
  id,
  subjectId: "s",
  curriculumNodeId: "n",
  title: id,
  scheduledFor: "2026-08-03",
  estimatedMinutes: 30,
  revisionType: "topic_test",
  urgency: "due",
  masteryLevel: "fragile",
  ...overrides,
});
const ctx = (tasks: AdaptiveTask[], revisions: AdaptiveRevision[] = [], overrides: Partial<ReplanContext> = {}): ReplanContext => ({
  profileId: "p",
  planId: "w",
  weekStart: "2026-08-03",
  weekEnd: "2026-08-09",
  currentDate: "2026-08-03",
  planningBudgetMinutes: 300,
  dailyCapacities: { "2026-08-03": 120, "2026-08-04": 120, "2026-08-05": 120 },
  tasks,
  revisions,
  trigger: "manual_request",
  ...overrides,
});

function foundationIncidentFixture() {
  const plan = JSON.parse(readFileSync(new URL("../../../../docs/esra_kpss_p48_foundation_week1_v2_canonical_2026-08-17.json", import.meta.url), "utf8"));
  const tasks: AdaptiveTask[] = plan.days.flatMap((day: any) => day.tasks
    .filter((task: any) => task.kind !== "reserve")
    .map((task: any) => t(`${day.date}-${task.order}`, {
      title: `${task.subject} · ${task.topic}`,
      plannedDate: day.date,
      estimatedMinutes: task.minutes,
      priorityScore: 60,
      createdAt: `${day.date}T00:00:00Z`,
    })));
  const dailyCapacities = Object.fromEntries(plan.days.map((day: any) => [
    day.date,
    day.capacity_minutes - (day.date === plan.plan_end ? plan.reserve_minutes : 0),
  ]));
  return { plan, tasks, dailyCapacities };
}

describe("Priority and Dynamic Replanning V1", () => {
  it("keeps core before optional and preserves overflow as backlog", () => {
    const result = replanWeeklyPlanV1(ctx([t("o", { importance: "optional" }), t("c", { importance: "core" })], [], {
      planningBudgetMinutes: 60,
      dailyCapacities: { "2026-08-03": 60 },
    }));
    expect(result.tasksToKeep).toContain("c");
    expect(result.tasksToBacklog).toContain("o");
    expect(result.tasksToCancel).toEqual([]);
  });

  it("prioritizes overdue revision", () => {
    const result = replanWeeklyPlanV1(ctx([], [rev("normal"), rev("critical", { urgency: "critical_overdue", masteryLevel: "critical" })], { planningBudgetMinutes: 150 }));
    expect(result.tasksToCreate[0]?.revisionScheduleId).toBe("critical");
  });

  it("prioritizes weak remediation task", () => {
    const result = replanWeeklyPlanV1(ctx([t("normal"), t("weak", { topicState: "remediation", masteryLevel: "weak" })], [], {
      planningBudgetMinutes: 60,
      dailyCapacities: { "2026-08-03": 60 },
    }));
    expect(result.tasksToKeep[0]).toBe("weak");
  });

  it("does not exceed revision budget", () => {
    const result = replanWeeklyPlanV1(ctx([], Array.from({ length: 5 }, (_, index) => rev(String(index), { estimatedMinutes: 30 })), { planningBudgetMinutes: 300 }));
    expect(result.revisionMinutes).toBeLessThanOrEqual(result.revisionBudgetMinutes);
  });

  it("never moves, backlogs, or cancels completed tasks", () => {
    const result = replanWeeklyPlanV1(ctx([t("done", { status: "completed" })]));
    expect(result.tasksToMove).toEqual([]);
    expect(result.tasksToBacklog).toEqual([]);
    expect(result.tasksToCancel).toEqual([]);
  });

  it("preserves an in-progress task", () => {
    expect(replanWeeklyPlanV1(ctx([t("active", { status: "in_progress" })], [], {
      planningBudgetMinutes: 10,
      dailyCapacities: { "2026-08-03": 10 },
    })).tasksToKeep).toContain("active");
  });

  it("stays within the ordinary replan budget", () => {
    const result = replanWeeklyPlanV1(ctx([t("one"), t("two")], [], { planningBudgetMinutes: 120 }));
    expect(result.afterPlannedMinutes).toBeLessThanOrEqual(120);
  });

  it("spreads a large Today backlog across capacity-valid future days", () => {
    const tasks = Array.from({ length: 21 }, (_, index) => t(String(index), { estimatedMinutes: 60 }));
    const result = replanWeeklyPlanV1(ctx(tasks, [], {
      planningBudgetMinutes: 1260,
      dailyCapacities: {
        "2026-08-03": 180,
        "2026-08-04": 180,
        "2026-08-05": 180,
        "2026-08-06": 180,
        "2026-08-07": 180,
      },
      trigger: "capacity_change",
    }));
    const todayKept = tasks.filter((task) => !result.tasksToMove.some((move) => move.taskId === task.id) && !result.tasksToBacklog.includes(task.id));
    expect(todayKept.reduce((sum, task) => sum + task.estimatedMinutes, 0)).toBe(180);
    expect(result.tasksToMove.length).toBe(12);
    expect(result.tasksToBacklog.length).toBe(6);
    expect(result.revisionType).toBe("automatic_informed");
  });

  it("unassigns newly unplaceable work once and keeps existing backlog stable", () => {
    const first = replanWeeklyPlanV1(ctx([t("overflow")], [], {
      planningBudgetMinutes: 0,
      dailyCapacities: { "2026-08-03": 0 },
      trigger: "capacity_change",
    }));
    expect(first.tasksToBacklog).toEqual(["overflow"]);

    const repeated = replanWeeklyPlanV1(ctx([t("overflow", { plannedDate: null })], [], {
      planningBudgetMinutes: 0,
      dailyCapacities: { "2026-08-03": 0 },
      trigger: "capacity_change",
    }));
    expect(repeated.tasksToBacklog).toEqual([]);
    expect(repeated.tasksToMove).toEqual([]);
    expect(repeated.changedTaskCount).toBe(0);
  });

  it("keeps the real 1785-minute foundation plan stable after a Monday +60 increase", () => {
    const { plan, tasks, dailyCapacities } = foundationIncidentFixture();
    const increased = { ...dailyCapacities, [plan.plan_start]: dailyCapacities[plan.plan_start] + 60 };
    const result = replanWeeklyPlanV1(ctx(tasks, [], {
      weekStart: plan.plan_start,
      weekEnd: plan.plan_end,
      currentDate: plan.plan_start,
      planningBudgetMinutes: plan.academic_minutes,
      dailyCapacities: increased,
      trigger: "capacity_change",
    }));

    expect(tasks).toHaveLength(30);
    expect(tasks.reduce((sum, task) => sum + task.estimatedMinutes, 0)).toBe(1785);
    expect(result.availableMinutes).toBe(1845);
    expect(result.afterPlannedMinutes).toBe(1785);
    expect(result.tasksToMove).toEqual([]);
    expect(result.tasksToBacklog).toEqual([]);
    expect(result.tasksToKeep).toHaveLength(30);
  });

  it("repairs only capacity-invalid work after a decrease and leaves other dates stable", () => {
    const { plan, tasks, dailyCapacities } = foundationIncidentFixture();
    const decreased = { ...dailyCapacities, [plan.plan_start]: dailyCapacities[plan.plan_start] - 30 };
    const result = replanWeeklyPlanV1(ctx(tasks, [], {
      weekStart: plan.plan_start,
      weekEnd: plan.plan_end,
      currentDate: plan.plan_start,
      planningBudgetMinutes: plan.academic_minutes,
      dailyCapacities: decreased,
      trigger: "capacity_change",
    }));

    expect(result.availableMinutes).toBe(1755);
    expect(result.tasksToMove).toEqual([]);
    expect(result.tasksToBacklog).toEqual(["2026-08-17-4"]);
    expect(result.tasksToKeep).toHaveLength(29);
    expect(result.tasksToKeep.filter((id) => !id.startsWith(plan.plan_start))).toHaveLength(26);
  });

  it("uses actual study time without pulling future work forward after overspending", () => {
    const result = replanWeeklyPlanV1(ctx([
      t("done", { plannedDate: "2026-08-03", estimatedMinutes: 60, status: "completed" }),
      t("long", { plannedDate: "2026-08-03", estimatedMinutes: 90 }),
      t("later", { plannedDate: "2026-08-04", estimatedMinutes: 60 }),
    ], [], {
      planningBudgetMinutes: 210,
      dailyCapacities: { "2026-08-03": 120, "2026-08-04": 120 },
      actualMinutesByDate: { "2026-08-03": 90 },
      plannedConsumedMinutesByDate: { "2026-08-03": 60 },
      trigger: "study_deviation",
    }));
    expect(result.tasksToMove).toContainEqual({ taskId: "long", fromDate: "2026-08-03", toDate: "2026-08-04", reason: "replanning" });
    expect(result.tasksToMove.some((move) => move.taskId === "later" && move.toDate === "2026-08-03")).toBe(false);
    expect(result.availableMinutes).toBe(240);
  });

  it("pulls future work forward after a task finishes faster than planned", () => {
    const result = replanWeeklyPlanV1(ctx([
      t("done", { plannedDate: "2026-08-03", estimatedMinutes: 60, status: "completed" }),
      t("later", { plannedDate: "2026-08-04", estimatedMinutes: 60 }),
    ], [], {
      planningBudgetMinutes: 120,
      dailyCapacities: { "2026-08-03": 120, "2026-08-04": 120 },
      actualMinutesByDate: { "2026-08-03": 35 },
      plannedConsumedMinutesByDate: { "2026-08-03": 60 },
      trigger: "study_deviation",
    }));
    expect(result.tasksToMove).toContainEqual({ taskId: "later", fromDate: "2026-08-04", toDate: "2026-08-03", reason: "replanning" });
  });

  it("is deterministic", () => {
    const input = ctx([t("a"), t("b")], [rev("r")]);
    expect(replanWeeklyPlanV1(input)).toEqual(replanWeeklyPlanV1(input));
  });

  it("uses stable revision dedupe keys", () => {
    const input = ctx([], [rev("r")]);
    expect(replanWeeklyPlanV1(input).tasksToCreate[0]?.dedupeKey).toBe(replanWeeklyPlanV1(input).tasksToCreate[0]?.dedupeKey);
  });
});
