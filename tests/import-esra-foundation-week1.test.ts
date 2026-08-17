import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { baselineExecutionOrder } from "../supabase/functions/_shared/task-context.ts";
// Exercise the checked-in recommendation bundle used by app-api.
// @ts-expect-error generated edge bundle intentionally has no declaration file.
import { getNextBestTask } from "../supabase/functions/_shared/planning.bundle.js";
// Standalone importers intentionally remain plain ESM CLIs.
// @ts-expect-error no declaration file is needed by the test harness.
import { buildCanonicalModel, loadCanonicalInputs, repositoryRoot } from "../scripts/import-p48-canonical.mjs";
// @ts-expect-error no declaration file is needed by the test harness.
import {
  applyFoundationWeek,
  buildFoundationExecutionPlan,
  ESRA_EMAIL,
  ESRA_EXAM_PROFILE_ID,
  ESRA_USER_ID,
  FOUNDATION_SOURCE_KEY,
  runEsraImporter,
} from "../scripts/import-esra-foundation-week1.mjs";

const PLAN_PATH = "docs/esra_kpss_p48_foundation_week1_v2_canonical_2026-08-17.json";
let plan: any;
let model: any;
let executionPlan: any;

function cleanState() {
  return {
    authUser: { id: ESRA_USER_ID, email: ESRA_EMAIL },
    profile: { id: ESRA_EXAM_PROFILE_ID, user_id: ESRA_USER_ID, status: "draft", target_exam_date: null },
    strategy: null,
    otherActiveProfileIds: [],
    weekPlans: [],
    weekTasksByPlan: new Map(),
    weekOverride: null,
  };
}

function memoryAdapter(initial = cleanState()) {
  const state = structuredClone(initial);
  state.weekTasksByPlan = new Map(initial.weekTasksByPlan);
  const stored = {
    sections: new Set<string>(),
    units: new Set<string>(),
    tasks: new Map<string, any>(),
    resources: new Set<string>(),
    targets: new Set<string>(),
    subjects: new Set<string>(),
  };
  const writes: Array<{ table: string; userId: string }> = [];
  return {
    state,
    stored,
    writes,
    adapter: {
      inspect: async () => state,
      bootstrap: async ({ userId }: any) => {
        const first = state.profile.status === "draft";
        if (first) {
          state.profile.status = "active";
          state.strategy = { source_note: FOUNDATION_SOURCE_KEY };
          for (let index = 0; index < 9; index += 1) stored.subjects.add(String(index));
          for (let index = 0; index < 26; index += 1) {
            stored.resources.add(String(index));
            stored.targets.add(String(index));
          }
          for (const table of ["p48_strategy_profiles", "exam_profiles", "user_subjects", "resources", "p48_resource_targets"]) {
            writes.push({ table, userId });
          }
        }
        return {
          subjects: first ? 9 : 0,
          topicProgress: first ? 1 : 0,
          resources: first ? 26 : 0,
          resourceTargets: first ? 26 : 0,
          strategies: first ? 1 : 0,
          profileActivations: first ? 1 : 0,
          updates: 0,
        };
      },
      persist: async ({ userId, model: canonical, executionPlan: desired }: any) => {
        const sectionCreates = canonical.sections.filter((section: any) => !stored.sections.has(section.canonicalKey));
        const unitCreates = desired.units.filter((unit: any) => !stored.units.has(unit.externalKey));
        const taskCreates = desired.tasks.filter((task: any) => !stored.tasks.has(task.dedupeKey));
        for (const section of sectionCreates) stored.sections.add(section.canonicalKey);
        for (const unit of unitCreates) stored.units.add(unit.externalKey);
        for (const task of taskCreates) stored.tasks.set(task.dedupeKey, task);
        if (sectionCreates.length) writes.push({ table: "resource_sections", userId });
        if (unitCreates.length) writes.push({ table: "resource_units", userId });
        if (taskCreates.length) writes.push({ table: "tasks", userId });
        const weeklyPlanId = "esra-week-1";
        state.weekPlans = [{ id: weeklyPlanId, status: "active", available_minutes: 1800, planning_budget_minutes: 1785, planned_minutes: 1785 }];
        state.weekTasksByPlan = new Map([[weeklyPlanId, [...stored.tasks.values()].map((task: any) => ({
          source_reason: "baseline_import", dedupe_key: task.dedupeKey, status: "ready", planned_date: task.plannedDate,
          estimated_minutes: task.estimatedMinutes, title: task.title,
        }))]]);
        state.weekOverride = { source_key: FOUNDATION_SOURCE_KEY };
        return {
          create: { sections: sectionCreates.length, units: unitCreates.length, tasks: taskCreates.length },
          update: { sections: 0, units: 0, deactivatedSections: 0 },
          unchanged: {
            sections: canonical.sections.length - sectionCreates.length,
            units: desired.units.length - unitCreates.length,
            tasks: desired.tasks.length - taskCreates.length,
          },
          baseline: {
            weeklyPlanId,
            taskCount: desired.tasks.length,
            insertedTaskCount: taskCreates.length,
            insertedTaskUnitLinks: taskCreates.reduce((sum: number, task: any) => sum + task.resourceUnitExternalKeys.length, 0),
            capacityMinutes: 1800,
            planningBudgetMinutes: 1785,
            reserveMinutes: 15,
          },
          taskTypeUpdates: taskCreates.filter((task: any) => task.taskType === "learn_topic").length,
        };
      },
    },
  };
}

beforeAll(async () => {
  plan = JSON.parse(await readFile(resolve(repositoryRoot, PLAN_PATH), "utf8"));
  model = buildCanonicalModel(await loadCanonicalInputs(repositoryRoot));
  executionPlan = buildFoundationExecutionPlan(model, plan);
});

describe("Esra foundation week importer", () => {
  it("validates the supplied JSON totals, dates, reserve, and canonical slices", () => {
    expect(executionPlan.conflicts).toEqual([]);
    expect(executionPlan.capacityMinutes).toBe(1800);
    expect(executionPlan.planningBudgetMinutes).toBe(1785);
    expect(executionPlan.reserveMinutes).toBe(15);
    expect(executionPlan.tasks).toHaveLength(30);
    expect(executionPlan.units).toHaveLength(33);
    expect(executionPlan.dailyCapacity.map((day: any) => day.date)).toEqual([
      "2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20", "2026-08-21", "2026-08-22", "2026-08-23",
    ]);
    const broken = structuredClone(plan);
    broken.academic_minutes = 1800;
    expect(buildFoundationExecutionPlan(model, broken).conflicts).toContain("INVALID_PLAN_DECLARED_TOTALS");
  });

  it("fails closed for a wrong user or wrong profile before adapter access", async () => {
    const memory = memoryAdapter();
    await expect(applyFoundationWeek({
      adapter: memory.adapter, userId: "00000000-0000-0000-0000-000000000001",
      examProfileId: ESRA_EXAM_PROFILE_ID, model, executionPlan,
    })).rejects.toThrow("TARGET_ALLOWLIST_MISMATCH");
    await expect(applyFoundationWeek({
      adapter: memory.adapter, userId: ESRA_USER_ID,
      examProfileId: "00000000-0000-0000-0000-000000000002", model, executionPlan,
    })).rejects.toThrow("TARGET_ALLOWLIST_MISMATCH");
    const wrongOwnerState = cleanState();
    wrongOwnerState.profile.user_id = "00000000-0000-0000-0000-000000000003";
    const wrongOwner = memoryAdapter(wrongOwnerState);
    await expect(applyFoundationWeek({
      adapter: wrongOwner.adapter, userId: ESRA_USER_ID,
      examProfileId: ESRA_EXAM_PROFILE_ID, model, executionPlan,
    })).rejects.toThrow("INVALID_EXAM_PROFILE_OWNERSHIP");
    expect(memory.writes).toEqual([]);
    expect(wrongOwner.writes).toEqual([]);
  });

  it("fails closed before writes when the target week contains a foreign/manual plan", async () => {
    const state = cleanState();
    state.weekPlans = [{ id: "foreign", status: "active" }];
    state.weekTasksByPlan = new Map([["foreign", [{ source_reason: "manual", dedupe_key: "manual:x" }]]]);
    const memory = memoryAdapter(state);
    await expect(applyFoundationWeek({
      adapter: memory.adapter, userId: ESRA_USER_ID, examProfileId: ESRA_EXAM_PROFILE_ID, model, executionPlan,
    })).rejects.toThrow("FOREIGN_EXISTING_WEEK_PLAN");
    expect(memory.writes).toEqual([]);
  });

  it("keeps dry-run data-only and performs no adapter/database write", async () => {
    let touched = false;
    const result = await runEsraImporter({
      userId: ESRA_USER_ID,
      examProfileId: ESRA_EXAM_PROFILE_ID,
      plan: PLAN_PATH,
      root: repositoryRoot,
      apply: false,
      adapter: { inspect: async () => { touched = true; throw new Error("SHOULD_NOT_RUN"); } },
    });
    expect(result.wouldWrite).toBe(false);
    expect(result.plan.academicTaskCount).toBe(30);
    expect(touched).toBe(false);
  });

  it("runs ownership/week preflight without writes before an explicit apply", async () => {
    const memory = memoryAdapter();
    const result = await runEsraImporter({
      userId: ESRA_USER_ID,
      examProfileId: ESRA_EXAM_PROFILE_ID,
      plan: PLAN_PATH,
      root: repositoryRoot,
      mode: "preflight",
      adapter: memory.adapter,
    });
    expect(result).toMatchObject({ mode: "preflight", authUserVerified: true, profileStatus: "draft", safeToApply: true, wouldWrite: false });
    expect(memory.writes).toEqual([]);
  });

  it("creates the expected clean-state rows on first apply", async () => {
    const memory = memoryAdapter();
    const result = await applyFoundationWeek({
      adapter: memory.adapter, userId: ESRA_USER_ID, examProfileId: ESRA_EXAM_PROFILE_ID, model, executionPlan,
    });
    expect(result.bootstrap).toMatchObject({ subjects: 9, resources: 26, resourceTargets: 26, strategies: 1, profileActivations: 1 });
    expect(result.canonical.create).toEqual({ sections: 237, units: 33, tasks: 30 });
    expect(result.canonical.baseline).toMatchObject({ taskCount: 30, insertedTaskCount: 30, insertedTaskUnitLinks: 33 });
    expect(result.canonical.taskTypeUpdates).toBe(15);
    expect(result.destructiveChanges).toBe(0);
  });

  it("makes the second apply idempotent with create=0 and destructive change=0", async () => {
    const memory = memoryAdapter();
    await applyFoundationWeek({ adapter: memory.adapter, userId: ESRA_USER_ID, examProfileId: ESRA_EXAM_PROFILE_ID, model, executionPlan });
    const second = await applyFoundationWeek({ adapter: memory.adapter, userId: ESRA_USER_ID, examProfileId: ESRA_EXAM_PROFILE_ID, model, executionPlan });
    expect(second.bootstrap).toMatchObject({ subjects: 0, resources: 0, resourceTargets: 0, strategies: 0, profileActivations: 0 });
    expect(second.canonical.create).toEqual({ sections: 0, units: 0, tasks: 0 });
    expect(second.canonical.taskTypeUpdates).toBe(0);
    expect(second.destructiveChanges).toBe(0);
  });

  it("does not create a fake reserve task", () => {
    expect(executionPlan.reserveRowCount).toBe(1);
    expect(executionPlan.reserveRowMinutes).toBe(15);
    expect(executionPlan.tasks.some((task: any) => task.title.includes("Hafta sonu kalibrasyon rezervi") || task.estimatedMinutes === 15)).toBe(false);
    expect(executionPlan.dailyCapacity.at(-1)).toMatchObject({ reserveMinutes: 15 });
  });

  it("keeps every execution unit inside its canonical parent and isolates child completion", () => {
    const sectionByKey = new Map(model.sections.map((section: any) => [section.canonicalKey, section]));
    for (const unit of executionPlan.units) {
      const parent: any = sectionByKey.get(unit.sectionCanonicalKey);
      expect(parent).toBeTruthy();
      expect(unit.pageStart).toBeGreaterThanOrEqual(parent.pageStart);
      expect(unit.pageEnd).toBeLessThanOrEqual(parent.pageEnd);
      expect(unit.sliceBasis).toBe("execution_slice_from_verified_canonical_range");
    }
    const first = executionPlan.tasks[0];
    const laterSameParent = executionPlan.tasks.find((task: any) => task !== first
      && task.resourceSectionCanonicalKey === first.resourceSectionCanonicalKey);
    expect(laterSameParent).toBeTruthy();
    expect(new Set(first.resourceUnitExternalKeys)).not.toEqual(new Set(laterSameParent.resourceUnitExternalKeys));
  });

  it("reuses 26 reference resources without duplicate physical resources", async () => {
    const memory = memoryAdapter();
    await applyFoundationWeek({ adapter: memory.adapter, userId: ESRA_USER_ID, examProfileId: ESRA_EXAM_PROFILE_ID, model, executionPlan });
    expect(memory.stored.resources.size).toBe(26);
    expect(memory.stored.targets.size).toBe(26);
    const second = await applyFoundationWeek({ adapter: memory.adapter, userId: ESRA_USER_ID, examProfileId: ESRA_EXAM_PROFILE_ID, model, executionPlan });
    expect(second.bootstrap.resources).toBe(0);
    expect(memory.stored.resources.size).toBe(26);
  });

  it("recommends Matematik order 1 for 90 minutes with the physical resource", () => {
    const monday = executionPlan.tasks.filter((task: any) => task.plannedDate === "2026-08-17").map((task: any, index: number) => ({
      id: `task-${index}`,
      status: "ready",
      importance: "important",
      priorityScore: 60,
      plannedDate: task.plannedDate,
      estimatedMinutes: task.estimatedMinutes,
      completedMinutes: 0,
      executionOrder: baselineExecutionOrder({ source_reason: "baseline_import", dedupe_key: task.dedupeKey }),
      createdAt: "2026-08-17T00:00:00Z",
      source: task,
    }));
    const recommendation = getNextBestTask(monday, { today: "2026-08-17", availableMinutes: 240 });
    const first = recommendation.recommendedTask as any;
    expect(first.source.title).toBe("Matematik · Temel Kavramlar I");
    expect(recommendation.remainingMinutes).toBe(90);
    expect(model.aliasByReference.get(first.source.referenceResourceId).canonical_name).toBe("2026 KPSS Matematik Soru Bankası");
  });

  it("preserves the first task's explicit learning instruction", () => {
    expect(executionPlan.tasks[0].description).toContain("60 dk Temel Kavramlar video");
    expect(executionPlan.tasks[0].description).toContain("10 dk kendi notun");
    expect(executionPlan.tasks[0].description).toContain("s.1–8");
  });

  it("records zero writes for a non-allowlisted Melih/other-user attempt", async () => {
    const memory = memoryAdapter();
    const melihOrOtherUserId = "00000000-0000-0000-0000-000000000099";
    await expect(applyFoundationWeek({
      adapter: memory.adapter, userId: melihOrOtherUserId, examProfileId: ESRA_EXAM_PROFILE_ID, model, executionPlan,
    })).rejects.toThrow("TARGET_ALLOWLIST_MISMATCH");
    expect(memory.writes.filter((write) => write.userId === melihOrOtherUserId)).toEqual([]);
    expect(memory.writes).toEqual([]);
  });

  it("contains no destructive delete or fabricated history write path", async () => {
    const source = await readFile(resolve(repositoryRoot, "scripts/import-esra-foundation-week1.mjs"), "utf8");
    expect(source).not.toContain(".delete(");
    expect(source).not.toContain('from("study_sessions")');
    expect(source).not.toContain('from("test_results")');
    expect(source).not.toContain('rpc("bootstrap_p48_strategy")');
    expect(source).not.toContain('from("weekly_availability")');
    expect(source).not.toContain('from("calendar_periods")');
  });
});
