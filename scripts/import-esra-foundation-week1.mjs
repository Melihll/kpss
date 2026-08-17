import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  applyCanonicalImport,
  buildCanonicalModel,
  canonicalUnitTypeToResourceUnitType,
  loadCanonicalInputs,
  repositoryRoot,
} from "./import-p48-canonical.mjs";
import { readLocalSupabaseStatus } from "./supabase-status.mjs";

export const ESRA_USER_ID = "181052f2-84b1-4d4f-b786-5c15a31f66c9";
export const ESRA_EXAM_PROFILE_ID = "73f9b34c-da73-43d9-a05c-2026409cf290";
export const ESRA_EMAIL = "miridliyarse4@gmail.com";
export const FOUNDATION_SOURCE_KEY = "esra-foundation-w1-v2-canonical-sliced";
const TARGET_EXAM_DATE = "2027-09-06";
const SUBJECT_IDS = Object.freeze([
  "20000000-0000-0000-0000-000000000001",
  "20000000-0000-0000-0000-000000000002",
  "20000000-0000-0000-0000-000000000003",
  "20000000-0000-0000-0000-000000000004",
  "20000000-0000-0000-0000-000000000005",
  "20000000-0000-0000-0000-000000000006",
  "20000000-0000-0000-0000-000000000007",
  "20000000-0000-0000-0000-000000000008",
  "20000000-0000-0000-0000-000000000009",
]);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function allocateMinutes(totalMinutes, slices) {
  if (slices.length === 1) return [totalMinutes];
  const pages = slices.map((slice) => slice.end - slice.start + 1);
  const totalPages = pages.reduce((sum, value) => sum + value, 0);
  const raw = pages.map((value) => totalMinutes * value / totalPages);
  const result = raw.map(Math.floor);
  let remainder = totalMinutes - result.reduce((sum, value) => sum + value, 0);
  const order = raw.map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  for (let index = 0; index < remainder; index += 1) result[order[index % order.length].index] += 1;
  return result;
}

function assertInteger(value, code) {
  if (!Number.isInteger(value)) throw new Error(code);
}

function executionUnitKey(sectionKey, start, end) {
  return `${sectionKey}:execution:foundation:2026-08-17:pages:${start}-${end}`;
}

function planPath(root, value) {
  return isAbsolute(value) ? value : resolve(root, value);
}

export function buildFoundationExecutionPlan(model, plan) {
  const conflicts = [];
  if (plan.plan_version !== FOUNDATION_SOURCE_KEY) conflicts.push("UNEXPECTED_PLAN_VERSION");
  if (plan.target_score_type !== "KPSSP48" || plan.target_exam_year !== 2027) conflicts.push("UNEXPECTED_PLAN_TARGET");
  if (plan.plan_start !== "2026-08-17" || plan.plan_end !== "2026-08-23") conflicts.push("UNEXPECTED_PLAN_DATES");
  if (!Array.isArray(plan.days) || plan.days.length !== 7) conflicts.push("INVALID_PLAN_DAY_COUNT");
  if (Number(plan.capacity_model?.weekly_minutes) !== 1800 || Number(plan.academic_minutes) !== 1785 || Number(plan.reserve_minutes) !== 15) {
    conflicts.push("INVALID_PLAN_DECLARED_TOTALS");
  }

  const unitsByKey = new Map();
  const tasks = [];
  const dailyCapacity = [];
  let inputTaskCount = 0;
  let reserveRowCount = 0;
  let reserveRowMinutes = 0;

  for (let dayIndex = 0; dayIndex < (plan.days ?? []).length; dayIndex += 1) {
    const day = plan.days[dayIndex];
    const expectedDate = addDays(plan.plan_start, dayIndex);
    const expectedCapacity = dayIndex < 5 ? 240 : 300;
    if (day.date !== expectedDate) conflicts.push(`INVALID_PLAN_DAY_DATE:${day.date}`);
    assertInteger(day.capacity_minutes, `INVALID_DAY_CAPACITY:${day.date}`);
    if (day.capacity_minutes !== expectedCapacity) conflicts.push(`INVALID_DAY_CAPACITY:${day.date}`);
    const rows = Array.isArray(day.tasks) ? day.tasks : [];
    inputTaskCount += rows.length;
    const reserveRows = rows.filter((task) => task.kind === "reserve");
    const academicRows = rows.filter((task) => task.kind !== "reserve");
    const reserveMinutes = reserveRows.reduce((sum, task) => sum + Number(task.minutes ?? 0), 0);
    reserveRowCount += reserveRows.length;
    reserveRowMinutes += reserveMinutes;
    if (rows.reduce((sum, task) => sum + Number(task.minutes ?? 0), 0) !== day.capacity_minutes) {
      conflicts.push(`DAY_TOTAL_MISMATCH:${day.date}`);
    }
    if (new Set(academicRows.map((task) => task.order)).size !== academicRows.length
      || academicRows.some((task, index) => task.order !== index + 1)) conflicts.push(`INVALID_DAILY_ORDER:${day.date}`);
    dailyCapacity.push({ date: day.date, capacityMinutes: day.capacity_minutes, reserveMinutes });

    for (const task of academicRows) {
      assertInteger(task.minutes, `INVALID_TASK_MINUTES:${day.date}:${task.order}`);
      assertInteger(task.page_start, `INVALID_TASK_PAGE_START:${day.date}:${task.order}`);
      assertInteger(task.page_end, `INVALID_TASK_PAGE_END:${day.date}:${task.order}`);
      if (task.minutes <= 0 || task.page_start <= 0 || task.page_end < task.page_start) {
        conflicts.push(`INVALID_TASK_VALUES:${day.date}:${task.order}`);
        continue;
      }
      if (!task.subject || !task.topic || !task.resource || !task.canonical_section || !task.canonical_range
        || !task.execution_slice || !task.instruction) {
        conflicts.push(`INCOMPLETE_TASK:${day.date}:${task.order}`);
        continue;
      }
      if (task.execution_slice !== `s.${task.page_start}–${task.page_end}`) {
        conflicts.push(`EXECUTION_SLICE_PAGE_MISMATCH:${day.date}:${task.order}`);
        continue;
      }
      const referenceResourceId = model.aliasByName.get(task.resource);
      if (!referenceResourceId) {
        conflicts.push(`PLAN_RESOURCE_ALIAS_MISSING:${task.resource}`);
        continue;
      }
      const intersecting = model.sections
        .filter((section) => section.referenceResourceId === referenceResourceId
          && section.pageStart <= task.page_end
          && (section.pageEnd ?? Number.POSITIVE_INFINITY) >= task.page_start)
        .sort((left, right) => left.sortOrder - right.sortOrder || left.canonicalKey.localeCompare(right.canonicalKey))
        .map((section) => ({
          section,
          start: Math.max(task.page_start, section.pageStart),
          end: Math.min(task.page_end, section.pageEnd ?? task.page_end),
        }));
      const coveredPages = new Set(intersecting.flatMap((slice) => Array.from(
        { length: slice.end - slice.start + 1 },
        (_, index) => slice.start + index,
      )));
      if (!intersecting.length || coveredPages.size !== task.page_end - task.page_start + 1) {
        conflicts.push(`PLAN_SLICE_OUTSIDE_CANONICAL_PARENT:${task.resource}:${task.execution_slice}`);
        continue;
      }
      if (intersecting.some((slice) => slice.section.subject !== task.subject)) {
        conflicts.push(`PLAN_SUBJECT_SECTION_MISMATCH:${day.date}:${task.order}`);
        continue;
      }

      const allocatedMinutes = allocateMinutes(task.minutes, intersecting);
      const unitKeys = [];
      const unitTypes = [];
      for (const [sliceIndex, slice] of intersecting.entries()) {
        const externalKey = executionUnitKey(slice.section.canonicalKey, slice.start, slice.end);
        const unitType = canonicalUnitTypeToResourceUnitType(slice.section.sourceUnitType);
        const proposed = {
          externalKey,
          referenceResourceId,
          sectionCanonicalKey: slice.section.canonicalKey,
          name: `${slice.section.name} · s.${slice.start}–${slice.end} uygulama dilimi`,
          unitType,
          sortOrder: slice.start,
          pageStart: slice.start,
          pageEnd: slice.end,
          physicalRange: `s.${slice.start}–${slice.end}`,
          sliceBasis: plan.learning_model?.slice_basis ?? "execution_slice_from_verified_canonical_range",
          estimatedMinutes: allocatedMinutes[sliceIndex],
        };
        const existing = unitsByKey.get(externalKey);
        if (existing && JSON.stringify(existing) !== JSON.stringify(proposed)) conflicts.push(`EXECUTION_UNIT_CONFLICT:${externalKey}`);
        unitsByKey.set(externalKey, proposed);
        unitKeys.push(externalKey);
        unitTypes.push(unitType);
      }

      const taskType = unitTypes.some((unitType) => unitType === "test" || unitType === "mock")
        ? "solve_resource_units"
        : "learn_topic";
      const videoGuidance = /video/i.test(task.instruction) ? plan.video_guidance?.[task.subject] : null;
      tasks.push({
        subjectId: intersecting[0].section.subjectId,
        curriculumNodeId: intersecting[0].section.curriculumNodeId,
        referenceResourceId,
        resourceSectionCanonicalKey: intersecting[0].section.canonicalKey,
        resourceUnitExternalKeys: unitKeys,
        title: `${task.subject} · ${task.topic}`,
        description: [task.instruction, videoGuidance ? `Video rehberi: ${videoGuidance}` : null].filter(Boolean).join(" "),
        plannedDate: day.date,
        estimatedMinutes: task.minutes,
        workMode: taskType === "solve_resource_units"
          ? "questions"
          : task.resource.includes("Notları") ? "notes" : "book",
        taskType,
        dedupeKey: `baseline:2026-08-17:${day.date}:${String(task.order).padStart(2, "0")}:${referenceResourceId}`,
      });
    }
  }

  const capacityMinutes = dailyCapacity.reduce((sum, day) => sum + day.capacityMinutes, 0);
  const reserveMinutes = dailyCapacity.reduce((sum, day) => sum + day.reserveMinutes, 0);
  const planningBudgetMinutes = tasks.reduce((sum, task) => sum + task.estimatedMinutes, 0);
  if (capacityMinutes !== 1800 || planningBudgetMinutes !== 1785 || reserveMinutes !== 15) conflicts.push("FOUNDATION_TOTAL_MISMATCH");
  if (reserveRowCount !== 1 || reserveRowMinutes !== 15) conflicts.push("FOUNDATION_RESERVE_ROW_MISMATCH");
  if (tasks.length !== 30) conflicts.push(`FOUNDATION_TASK_COUNT_MISMATCH:${tasks.length}`);
  if (new Set(tasks.map((task) => task.dedupeKey)).size !== tasks.length) conflicts.push("FOUNDATION_TASK_DEDUPE_COLLISION");

  return {
    sourceKey: FOUNDATION_SOURCE_KEY,
    weekStartDate: plan.plan_start,
    capacityMinutes,
    planningBudgetMinutes,
    reserveMinutes,
    dailyCapacity,
    inputTaskCount,
    academicTaskCount: tasks.length,
    reserveRowCount,
    reserveRowMinutes,
    units: [...unitsByKey.values()],
    tasks,
    conflicts,
  };
}

export function buildFoundationDryRun(model, executionPlan) {
  return {
    mode: "dry-run",
    target: { userId: ESRA_USER_ID, examProfileId: ESRA_EXAM_PROFILE_ID, email: ESRA_EMAIL },
    plan: {
      sourceKey: executionPlan.sourceKey,
      weekStartDate: executionPlan.weekStartDate,
      capacityMinutes: executionPlan.capacityMinutes,
      planningBudgetMinutes: executionPlan.planningBudgetMinutes,
      reserveMinutes: executionPlan.reserveMinutes,
      academicTaskCount: executionPlan.tasks.length,
      reserveTaskCount: 0,
      executionUnitCount: executionPlan.units.length,
      taskUnitLinkCount: executionPlan.tasks.reduce((sum, task) => sum + task.resourceUnitExternalKeys.length, 0),
      dailyCapacity: executionPlan.dailyCapacity,
      firstTask: executionPlan.tasks[0],
      taskTypes: Object.fromEntries(["learn_topic", "solve_resource_units"].map((type) => [
        type,
        executionPlan.tasks.filter((task) => task.taskType === type).length,
      ])),
    },
    canonical: { referenceResources: 26, modelResources: model.resources.length, sections: model.sections.length },
    wouldWrite: false,
  };
}

export function validateTargetArguments(userId, examProfileId) {
  if (userId !== ESRA_USER_ID || examProfileId !== ESRA_EXAM_PROFILE_ID) throw new Error("TARGET_ALLOWLIST_MISMATCH");
}

export function validateApplyPreflight(state, executionPlan) {
  if (!state.authUser || state.authUser.id !== ESRA_USER_ID || state.authUser.email?.toLowerCase() !== ESRA_EMAIL) {
    throw new Error("AUTH_USER_IDENTITY_MISMATCH");
  }
  if (!state.profile || state.profile.id !== ESRA_EXAM_PROFILE_ID || state.profile.user_id !== ESRA_USER_ID) {
    throw new Error("INVALID_EXAM_PROFILE_OWNERSHIP");
  }
  if (!['draft', 'active'].includes(state.profile.status)) throw new Error("INVALID_EXAM_PROFILE_STATUS");
  const scriptOwned = state.strategy?.source_note === FOUNDATION_SOURCE_KEY;
  if (state.profile.status === "active" && !scriptOwned) throw new Error("ACTIVE_PROFILE_NOT_OWNED_BY_IMPORTER");
  if (state.strategy && !scriptOwned) throw new Error("P48_STRATEGY_CONFLICT");
  if (state.profile.status === "draft" && state.otherActiveProfileIds.length) throw new Error("OTHER_ACTIVE_PROFILE_EXISTS");
  if (state.weekPlans.length > 1) throw new Error("MULTIPLE_WEEK_PLANS_REQUIRE_REVIEW");
  const expectedDedupe = new Set(executionPlan.tasks.map((task) => task.dedupeKey));
  for (const plan of state.weekPlans) {
    if (plan.status !== "active") throw new Error("FOREIGN_EXISTING_WEEK_PLAN");
    const tasks = state.weekTasksByPlan.get(plan.id) ?? [];
    const expectedByDedupe = new Map(executionPlan.tasks.map((task) => [task.dedupeKey, task]));
    const importerOwned = state.weekOverride?.source_key === FOUNDATION_SOURCE_KEY
      && tasks.every((task) => {
        const expected = expectedByDedupe.get(task.dedupe_key);
        return expected && task.source_reason === "baseline_import"
          && expectedDedupe.has(task.dedupe_key)
          && task.planned_date === expected.plannedDate
          && Number(task.estimated_minutes) === expected.estimatedMinutes
          && task.title === expected.title;
      });
    if (!importerOwned) throw new Error("FOREIGN_EXISTING_WEEK_PLAN");
  }
}

async function inspectTarget(client, userId, examProfileId, weekStartDate) {
  const [auth, profile, strategies, activeProfiles, weekPlans, weekOverride] = await Promise.all([
    client.auth.admin.getUserById(userId),
    client.from("exam_profiles").select("id,user_id,status,target_exam_date").eq("id", examProfileId).maybeSingle(),
    client.from("p48_strategy_profiles").select("*").eq("exam_profile_id", examProfileId),
    client.from("exam_profiles").select("id").eq("user_id", userId).eq("status", "active"),
    client.from("weekly_plans").select("id,status,available_minutes,planning_budget_minutes,planned_minutes")
      .eq("user_id", userId).eq("exam_profile_id", examProfileId).eq("week_start_date", weekStartDate),
    client.from("p48_week_capacity_overrides").select("source_key").eq("user_id", userId)
      .eq("exam_profile_id", examProfileId).eq("week_start_date", weekStartDate).maybeSingle(),
  ]);
  if (auth.error) throw auth.error;
  for (const result of [profile, strategies, activeProfiles, weekPlans, weekOverride]) if (result.error) throw result.error;
  const weekTasksByPlan = new Map();
  for (const plan of weekPlans.data ?? []) {
    const tasks = await client.from("tasks").select("id,source_reason,dedupe_key,status,planned_date,estimated_minutes,title")
      .eq("user_id", userId).eq("exam_profile_id", examProfileId).eq("weekly_plan_id", plan.id);
    if (tasks.error) throw tasks.error;
    weekTasksByPlan.set(plan.id, tasks.data ?? []);
  }
  return {
    authUser: auth.data.user,
    profile: profile.data,
    strategy: (strategies.data ?? [])[0] ?? null,
    otherActiveProfileIds: (activeProfiles.data ?? []).map((row) => row.id).filter((id) => id !== examProfileId),
    weekPlans: weekPlans.data ?? [],
    weekTasksByPlan,
    weekOverride: weekOverride.data,
  };
}

function differs(row, desired) {
  return Object.entries(desired).some(([key, value]) => row?.[key] !== value);
}

async function bootstrapProfile(client, userId, examProfileId, state, model) {
  const counts = { subjects: 0, topicProgress: 0, resources: 0, resourceTargets: 0, strategies: 0, profileActivations: 0, updates: 0 };
  if (!state.strategy) {
    const inserted = await client.from("p48_strategy_profiles").insert({
      user_id: userId, exam_profile_id: examProfileId, score_type: "KPSSP48", target_exam_date: TARGET_EXAM_DATE,
      weekly_target_minutes: 1800, monthly_target_minutes: 7200, status: "active", source_note: FOUNDATION_SOURCE_KEY,
    });
    if (inserted.error) throw inserted.error;
    counts.strategies += 1;
  } else {
    const desired = { score_type: "KPSSP48", weekly_target_minutes: 1800, monthly_target_minutes: 7200, status: "active", source_note: FOUNDATION_SOURCE_KEY };
    if (differs(state.strategy, desired)) {
      const updated = await client.from("p48_strategy_profiles").update(desired).eq("id", state.strategy.id).eq("user_id", userId);
      if (updated.error) throw updated.error;
      counts.updates += 1;
    }
  }
  if (state.profile.status === "draft") {
    const patch = { status: "active", ...(state.profile.target_exam_date ? {} : { target_exam_date: TARGET_EXAM_DATE }) };
    const activated = await client.from("exam_profiles").update(patch).eq("id", examProfileId).eq("user_id", userId).eq("status", "draft");
    if (activated.error) throw activated.error;
    counts.profileActivations += 1;
  }

  const subjects = await client.from("user_subjects").select("id,subject_id,status").eq("user_id", userId).eq("exam_profile_id", examProfileId);
  if (subjects.error) throw subjects.error;
  const subjectById = new Map((subjects.data ?? []).map((row) => [row.subject_id, row]));
  const conflictingSubject = [...subjectById.values()].find((row) => SUBJECT_IDS.includes(row.subject_id) && row.status !== "active");
  if (conflictingSubject) throw new Error(`EXISTING_SUBJECT_STATUS_CONFLICT:${conflictingSubject.subject_id}`);
  const missingSubjects = SUBJECT_IDS.filter((subjectId) => !subjectById.has(subjectId));
  if (missingSubjects.length) {
    const inserted = await client.from("user_subjects").insert(missingSubjects.map((subjectId) => ({
      user_id: userId, exam_profile_id: examProfileId, subject_id: subjectId, status: "active",
    })));
    if (inserted.error) throw inserted.error;
    counts.subjects += missingSubjects.length;
  }

  const [nodes, progress] = await Promise.all([
    client.from("curriculum_nodes").select("id").eq("is_active", true).eq("node_type", "topic").in("subject_id", SUBJECT_IDS),
    client.from("topic_progress").select("curriculum_node_id").eq("user_id", userId).eq("exam_profile_id", examProfileId),
  ]);
  if (nodes.error) throw nodes.error;
  if (progress.error) throw progress.error;
  const progressIds = new Set((progress.data ?? []).map((row) => row.curriculum_node_id));
  const missingProgress = (nodes.data ?? []).filter((node) => !progressIds.has(node.id));
  if (missingProgress.length) {
    const inserted = await client.from("topic_progress").insert(missingProgress.map((node) => ({
      user_id: userId, exam_profile_id: examProfileId, curriculum_node_id: node.id,
    })));
    if (inserted.error) throw inserted.error;
    counts.topicProgress += missingProgress.length;
  }

  const [references, resources, targets] = await Promise.all([
    client.from("p48_reference_resources").select("*").eq("is_active", true).order("subject_id").order("sequence_order"),
    client.from("resources").select("*").eq("user_id", userId).eq("exam_profile_id", examProfileId),
    client.from("p48_resource_targets").select("*").eq("user_id", userId).eq("exam_profile_id", examProfileId),
  ]);
  for (const result of [references, resources, targets]) if (result.error) throw result.error;
  if ((references.data ?? []).length !== 26) throw new Error(`REFERENCE_RESOURCE_COUNT_NOT_26:${references.data?.length ?? 0}`);
  const resourceRows = resources.data ?? [];
  const resourceByReference = new Map();
  const missingResourceRows = [];
  for (const reference of references.data) {
    const aliases = model.aliasByReference.get(reference.id);
    const acceptedNames = new Set([reference.name, aliases?.canonical_name, ...(aliases?.aliases ?? [])].filter(Boolean));
    const matches = resourceRows.filter((resource) => resource.subject_id === reference.subject_id && acceptedNames.has(resource.name));
    if (matches.length > 1) throw new Error(`DUPLICATE_PHYSICAL_RESOURCE:${reference.id}`);
    if (matches.length === 1) {
      const resource = matches[0];
      if (resource.status !== "active") throw new Error(`EXISTING_RESOURCE_STATUS_CONFLICT:${reference.id}`);
      const desired = { publisher: reference.publisher, resource_type: reference.resource_type, resource_role: reference.resource_role, difficulty: "normal" };
      if (differs(resource, desired)) {
        const updated = await client.from("resources").update(desired).eq("id", resource.id).eq("user_id", userId).eq("exam_profile_id", examProfileId);
        if (updated.error) throw updated.error;
        counts.updates += 1;
      }
      resourceByReference.set(reference.id, resource);
    } else {
      missingResourceRows.push({
        reference,
        row: {
          user_id: userId, exam_profile_id: examProfileId, subject_id: reference.subject_id, name: reference.name,
          publisher: reference.publisher, resource_type: reference.resource_type, resource_role: reference.resource_role,
          difficulty: "normal", status: "active",
        },
      });
    }
  }
  if (missingResourceRows.length) {
    const inserted = await client.from("resources").insert(missingResourceRows.map((entry) => entry.row)).select("*");
    if (inserted.error) throw inserted.error;
    for (const resource of inserted.data ?? []) {
      const entry = missingResourceRows.find((candidate) => candidate.row.subject_id === resource.subject_id && candidate.row.name === resource.name);
      if (!entry) throw new Error("CREATED_RESOURCE_MATCH_FAILED");
      resourceByReference.set(entry.reference.id, resource);
    }
    counts.resources += missingResourceRows.length;
  }
  if (resourceByReference.size !== 26) throw new Error("P48_RESOURCE_BOOTSTRAP_INCOMPLETE");

  const targetByReference = new Map((targets.data ?? []).filter((target) => target.reference_resource_id).map((target) => [target.reference_resource_id, target]));
  const targetByResource = new Map((targets.data ?? []).map((target) => [target.resource_id, target]));
  for (const reference of references.data) {
    const resource = resourceByReference.get(reference.id);
    const target = targetByReference.get(reference.id);
    const desired = {
      reference_resource_id: reference.id,
      planned_minutes: reference.planned_minutes,
      sequence_order: reference.sequence_order,
      work_mode: reference.work_mode,
    };
    if (target) {
      if (target.resource_id !== resource.id) throw new Error(`REFERENCE_TARGET_RESOURCE_CONFLICT:${reference.id}`);
      if (differs(target, desired)) {
        const updated = await client.from("p48_resource_targets").update(desired).eq("id", target.id).eq("user_id", userId).eq("exam_profile_id", examProfileId);
        if (updated.error) throw updated.error;
        counts.updates += 1;
      }
    } else {
      const resourceTarget = targetByResource.get(resource.id);
      if (resourceTarget) throw new Error(`RESOURCE_TARGET_REFERENCE_CONFLICT:${resource.id}`);
      const inserted = await client.from("p48_resource_targets").insert({
        user_id: userId, exam_profile_id: examProfileId, resource_id: resource.id, ...desired,
      });
      if (inserted.error) throw inserted.error;
      counts.resourceTargets += 1;
    }
  }
  return counts;
}

async function applyTaskTypes(client, userId, examProfileId, weeklyPlanId, executionPlan) {
  const result = await client.from("tasks").select("id,dedupe_key,task_type,source_reason")
    .eq("user_id", userId).eq("exam_profile_id", examProfileId).eq("weekly_plan_id", weeklyPlanId);
  if (result.error) throw result.error;
  const desiredByKey = new Map(executionPlan.tasks.map((task) => [task.dedupeKey, task.taskType]));
  if ((result.data ?? []).length !== executionPlan.tasks.length) throw new Error("FOUNDATION_TASK_PERSISTENCE_INCOMPLETE");
  let updatedCount = 0;
  for (const task of result.data ?? []) {
    const desired = desiredByKey.get(task.dedupe_key);
    if (!desired || task.source_reason !== "baseline_import") throw new Error("FOUNDATION_TASK_SCOPE_CONFLICT");
    if (task.task_type !== desired) {
      const updated = await client.from("tasks").update({ task_type: desired }).eq("id", task.id)
        .eq("user_id", userId).eq("exam_profile_id", examProfileId).eq("source_reason", "baseline_import");
      if (updated.error) throw updated.error;
      updatedCount += 1;
    }
  }
  return updatedCount;
}

export function createProductionAdapter(client) {
  return {
    inspect: ({ userId, examProfileId, executionPlan }) => inspectTarget(client, userId, examProfileId, executionPlan.weekStartDate),
    bootstrap: ({ userId, examProfileId, state, model }) => bootstrapProfile(client, userId, examProfileId, state, model),
    persist: async ({ userId, examProfileId, model, executionPlan }) => {
      const result = await applyCanonicalImport({ client, userId, examProfileId, model, baselinePlan: executionPlan });
      const taskTypeUpdates = await applyTaskTypes(client, userId, examProfileId, result.baseline.weeklyPlanId, executionPlan);
      return { ...result, taskTypeUpdates };
    },
  };
}

export async function applyFoundationWeek({ adapter, userId, examProfileId, model, executionPlan }) {
  validateTargetArguments(userId, examProfileId);
  const state = await adapter.inspect({ userId, examProfileId, executionPlan });
  validateApplyPreflight(state, executionPlan);
  const bootstrap = await adapter.bootstrap({ userId, examProfileId, state, model, executionPlan });
  const canonical = await adapter.persist({ userId, examProfileId, model, executionPlan });
  return {
    mode: "apply",
    target: { userId, examProfileId, email: ESRA_EMAIL },
    bootstrap,
    canonical,
    destructiveChanges: 0,
    wouldWrite: true,
  };
}

export function parseArguments(argv) {
  const options = { userId: null, examProfileId: null, plan: null, mode: "dry-run" };
  let modeFlagCount = 0;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--user-id") options.userId = argv[++index];
    else if (value === "--exam-profile-id") options.examProfileId = argv[++index];
    else if (value === "--plan") options.plan = argv[++index];
    else if (value === "--apply") { options.mode = "apply"; modeFlagCount += 1; }
    else if (value === "--preflight") { options.mode = "preflight"; modeFlagCount += 1; }
    else if (value === "--dry-run") { options.mode = "dry-run"; modeFlagCount += 1; }
    else throw new Error(`UNKNOWN_ARGUMENT:${value}`);
  }
  if (modeFlagCount > 1) throw new Error("MODE_FLAGS_ARE_MUTUALLY_EXCLUSIVE");
  if (!options.userId || !options.examProfileId || !options.plan) throw new Error("USER_PROFILE_AND_PLAN_REQUIRED");
  validateTargetArguments(options.userId, options.examProfileId);
  return options;
}

export async function runEsraImporter(options) {
  validateTargetArguments(options.userId, options.examProfileId);
  const root = options.root ?? repositoryRoot;
  const [inputs, plan] = await Promise.all([
    loadCanonicalInputs(root),
    readJson(planPath(root, options.plan)),
  ]);
  const model = buildCanonicalModel(inputs);
  const executionPlan = buildFoundationExecutionPlan(model, plan);
  const conflicts = [...model.conflicts, ...executionPlan.conflicts];
  if (conflicts.length) throw new Error(`FOUNDATION_INPUT_CONFLICTS:${conflicts.join("|")}`);
  const mode = options.mode ?? (options.apply ? "apply" : "dry-run");
  if (mode === "dry-run") return buildFoundationDryRun(model, executionPlan);

  let adapter = options.adapter;
  if (!adapter) {
    let url = process.env.SUPABASE_URL;
    let serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceRoleKey) {
      const local = readLocalSupabaseStatus();
      url ??= local.url;
      serviceRoleKey ??= local.serviceRoleKey;
    }
    if (!url || !serviceRoleKey) throw new Error("SUPABASE_URL_AND_SERVICE_ROLE_KEY_REQUIRED");
    const client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    adapter = createProductionAdapter(client);
  }
  if (mode === "preflight") {
    const state = await adapter.inspect({ userId: options.userId, examProfileId: options.examProfileId, executionPlan });
    validateApplyPreflight(state, executionPlan);
    return {
      mode: "preflight",
      target: { userId: options.userId, examProfileId: options.examProfileId, email: ESRA_EMAIL },
      authUserVerified: true,
      profileStatus: state.profile.status,
      importerOwnedActiveProfile: state.profile.status === "active",
      otherActiveProfileCount: state.otherActiveProfileIds.length,
      existingWeekPlanCount: state.weekPlans.length,
      existingWeekIsImporterOwned: state.weekPlans.length > 0,
      safeToApply: true,
      wouldWrite: false,
    };
  }
  if (mode !== "apply") throw new Error(`UNKNOWN_MODE:${mode}`);
  return applyFoundationWeek({ adapter, userId: options.userId, examProfileId: options.examProfileId, model, executionPlan });
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    console.log(JSON.stringify(await runEsraImporter(options), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
