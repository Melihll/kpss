import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readLocalSupabaseStatus } from "./supabase-status.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = resolve(scriptDirectory, "..");

const SUBJECT_IDS = Object.freeze({
  "Türkçe": "20000000-0000-0000-0000-000000000001",
  "Matematik": "20000000-0000-0000-0000-000000000002",
  "Tarih": "20000000-0000-0000-0000-000000000003",
  "Coğrafya": "20000000-0000-0000-0000-000000000004",
  "Hukuk": "20000000-0000-0000-0000-000000000006",
  "İktisat": "20000000-0000-0000-0000-000000000007",
  "Maliye": "20000000-0000-0000-0000-000000000008",
  "Muhasebe": "20000000-0000-0000-0000-000000000009",
});

const PREVIOUS_THREE_CURRICULUM = Object.freeze({
  "31000000-0000-0000-0000-000000000009": "30000000-0000-0000-0000-000000000201",
  "31000000-0000-0000-0000-000000000023": "30000000-0000-0000-0000-000000000601",
  "31000000-0000-0000-0000-000000000025": "30000000-0000-0000-0000-000000000801",
});

const UNIT_TYPES = Object.freeze({
  konu: "chapter",
  soru_bankası_bloğu: "test",
  test: "test",
  çözüm: "reading",
});

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export function canonicalUnitTypeToResourceUnitType(value) {
  const mapped = UNIT_TYPES[value];
  if (!mapped) throw new Error(`UNSUPPORTED_CANONICAL_UNIT_TYPE:${value}`);
  return mapped;
}

function sectionKey(referenceResourceId, sequence) {
  return `p48:${referenceResourceId}:section:${String(sequence).padStart(3, "0")}`;
}

function executionKey(sectionCanonicalKey, start, end) {
  return `${sectionCanonicalKey}:execution:pages:${start}-${end}`;
}

function mappingKey(resource, sequence) {
  return `${resource}|${Number(sequence)}`;
}

function parsePhysicalRange(value) {
  const match = /^s\.(\d+)[–-](\d+)$/.exec(String(value).trim());
  if (!match) throw new Error(`UNSUPPORTED_BASELINE_PHYSICAL_RANGE:${value}`);
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (start <= 0 || end < start) throw new Error(`INVALID_BASELINE_PHYSICAL_RANGE:${value}`);
  return { start, end };
}

function allocateMinutes(totalMinutes, slices) {
  if (slices.length === 1) return [totalMinutes];
  const totalPages = slices.reduce((sum, slice) => sum + slice.end - slice.start + 1, 0);
  const raw = slices.map((slice) => totalMinutes * (slice.end - slice.start + 1) / totalPages);
  const result = raw.map(Math.floor);
  let remainder = totalMinutes - result.reduce((sum, value) => sum + value, 0);
  const order = raw.map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  for (let index = 0; index < remainder; index += 1) result[order[index % order.length].index] += 1;
  return result;
}

function workModeForTask(taskType) {
  const normalized = String(taskType).toLocaleLowerCase("tr-TR");
  if (normalized.includes("soru")) return "questions";
  if (normalized.includes("not")) return "notes";
  if (normalized.includes("test")) return "book";
  if (normalized.includes("konu")) return "book";
  return "other";
}

export async function loadCanonicalInputs(root = repositoryRoot) {
  const docs = resolve(root, "docs");
  const [remaining, mapping, previousThree, baseline, aliases] = await Promise.all([
    readJson(resolve(docs, "kpss_p48_canonical_map_remaining_13.json")),
    readJson(resolve(docs, "p48_canonical_curriculum_mapping.v1.1.json")),
    readJson(resolve(docs, "kpss_p48_canonical_map_pilot_previous_3.json")),
    readJson(resolve(docs, "kpss_baseline_plan_2026-08-17.json")),
    readJson(resolve(docs, "p48_resource_aliases.v1.json")),
  ]);
  return { remaining, mapping, previousThree, baseline, aliases };
}

export function buildCanonicalModel(inputs) {
  const conflicts = [];
  const aliasByName = new Map();
  const aliasByReference = new Map();
  for (const entry of inputs.aliases.resources) {
    aliasByReference.set(entry.reference_resource_id, entry);
    for (const alias of entry.aliases) {
      const existing = aliasByName.get(alias);
      if (existing && existing !== entry.reference_resource_id) conflicts.push(`ALIAS_COLLISION:${alias}`);
      aliasByName.set(alias, entry.reference_resource_id);
    }
  }
  if (inputs.aliases.resources.length !== 26) conflicts.push("REFERENCE_RESOURCE_COUNT_NOT_26");

  const approvedMapping = new Map(inputs.mapping.mappings.map((row) => [mappingKey(row.resource, row.canonical_seq), row]));
  if (approvedMapping.size !== 231 || inputs.mapping.mappings.some((row) => !["exact", "approved", "not_applicable"].includes(row.mapping_status))) {
    conflicts.push("MAPPING_V1_1_NOT_FINAL");
  }

  const sections = [];
  const fullScopeReferences = new Set();
  for (const row of inputs.remaining.canonical_units) {
    const referenceResourceId = aliasByName.get(row.resource);
    const mapping = approvedMapping.get(mappingKey(row.resource, row.seq));
    if (!referenceResourceId) {
      conflicts.push(`MISSING_RESOURCE_ALIAS:${row.resource}`);
      continue;
    }
    if (!mapping) {
      conflicts.push(`MISSING_CURRICULUM_MAPPING:${row.resource}:${row.seq}`);
      continue;
    }
    fullScopeReferences.add(referenceResourceId);
    sections.push({
      referenceResourceId,
      resourceName: row.resource,
      subject: row.subject,
      subjectId: SUBJECT_IDS[row.subject],
      canonicalKey: sectionKey(referenceResourceId, row.seq),
      curriculumNodeId: mapping.candidate_curriculum_node_id,
      name: row.unit,
      sortOrder: Number(row.seq),
      pageStart: Number(row.page_start),
      pageEnd: row.page_end == null ? null : Number(row.page_end),
      physicalRange: row.physical_range,
      sourceUnitType: row.unit_type,
      basis: row.basis,
      confidence: row.confidence,
      evidence: row.evidence,
      sourceNotes: row.notes || null,
      planningRole: mapping.planning_role,
      sourceScope: "remaining_13_complete",
    });
  }

  const partialScopeReferences = new Set();
  for (const resource of inputs.previousThree.resources) {
    const referenceResourceId = aliasByName.get(resource.resource);
    if (!referenceResourceId) {
      conflicts.push(`MISSING_RESOURCE_ALIAS:${resource.resource}`);
      continue;
    }
    const curriculumNodeId = PREVIOUS_THREE_CURRICULUM[referenceResourceId];
    if (!curriculumNodeId) {
      conflicts.push(`MISSING_PREVIOUS_THREE_CURRICULUM:${referenceResourceId}`);
      continue;
    }
    partialScopeReferences.add(referenceResourceId);
    for (const row of resource.sections) {
      sections.push({
        referenceResourceId,
        resourceName: resource.resource,
        subject: resource.subject,
        subjectId: SUBJECT_IDS[resource.subject],
        canonicalKey: sectionKey(referenceResourceId, row.seq),
        curriculumNodeId,
        name: row.unit,
        sortOrder: Number(row.seq),
        pageStart: Number(row.page_start),
        pageEnd: row.page_end == null ? null : Number(row.page_end),
        physicalRange: row.physical_range,
        sourceUnitType: row.unit_type,
        basis: row.basis,
        confidence: row.confidence,
        evidence: row.evidence,
        sourceNotes: row.notes || null,
        planningRole: "curriculum",
        sourceScope: "pilot_previous_3_partial",
      });
    }
  }

  if (sections.length !== 237) conflicts.push(`SECTION_COUNT_NOT_237:${sections.length}`);
  if (new Set(sections.map((row) => row.canonicalKey)).size !== sections.length) conflicts.push("DUPLICATE_CANONICAL_SECTION_KEY");
  for (const section of sections) canonicalUnitTypeToResourceUnitType(section.sourceUnitType);

  const resources = [...new Set(sections.map((row) => row.referenceResourceId))].map((referenceResourceId) => ({
    referenceResourceId,
    canonicalName: aliasByReference.get(referenceResourceId)?.canonical_name ?? null,
    scope: fullScopeReferences.has(referenceResourceId) ? "complete" : "pilot_previous_3_partial",
  }));

  return { sections, resources, aliasByName, aliasByReference, fullScopeReferences, partialScopeReferences, conflicts };
}

export function buildBaselineExecutionPlan(model, baseline) {
  const academicRows = baseline.tasks.filter((task) => task.subject !== "Sistem");
  const reserveRows = baseline.tasks.filter((task) => task.subject === "Sistem");
  const unitsByKey = new Map();
  const tasks = [];
  const conflicts = [];

  for (const task of academicRows) {
    const referenceResourceId = model.aliasByName.get(task.resource);
    if (!referenceResourceId) {
      conflicts.push(`BASELINE_RESOURCE_ALIAS_MISSING:${task.resource}`);
      continue;
    }
    const range = parsePhysicalRange(task.physical_range);
    const intersecting = model.sections
      .filter((section) => section.referenceResourceId === referenceResourceId
        && section.pageStart <= range.end
        && (section.pageEnd ?? Number.POSITIVE_INFINITY) >= range.start)
      .sort((left, right) => left.sortOrder - right.sortOrder || left.canonicalKey.localeCompare(right.canonicalKey))
      .map((section) => ({
        section,
        start: Math.max(range.start, section.pageStart),
        end: Math.min(range.end, section.pageEnd ?? range.end),
      }));
    if (!intersecting.length) {
      conflicts.push(`BASELINE_SECTION_NOT_FOUND:${task.resource}:${task.physical_range}`);
      continue;
    }
    const coverage = new Set(intersecting.flatMap((slice) => Array.from({ length: slice.end - slice.start + 1 }, (_, index) => slice.start + index)));
    if (coverage.size !== range.end - range.start + 1) {
      conflicts.push(`BASELINE_RANGE_NOT_FULLY_COVERED:${task.resource}:${task.physical_range}`);
      continue;
    }
    const allocatedMinutes = allocateMinutes(Number(task.minutes), intersecting);
    const unitKeys = [];
    for (const [index, slice] of intersecting.entries()) {
      const externalKey = executionKey(slice.section.canonicalKey, slice.start, slice.end);
      unitKeys.push(externalKey);
      const proposed = {
        externalKey,
        referenceResourceId,
        sectionCanonicalKey: slice.section.canonicalKey,
        name: `${slice.section.name} · s.${slice.start}–${slice.end}`,
        unitType: canonicalUnitTypeToResourceUnitType(slice.section.sourceUnitType),
        sortOrder: slice.start,
        pageStart: slice.start,
        pageEnd: slice.end,
        physicalRange: `s.${slice.start}–${slice.end}`,
        sliceBasis: "baseline_plan_2026-08-17",
        estimatedMinutes: allocatedMinutes[index],
      };
      const existing = unitsByKey.get(externalKey);
      if (existing && JSON.stringify(existing) !== JSON.stringify(proposed)) conflicts.push(`EXECUTION_UNIT_CONFLICT:${externalKey}`);
      unitsByKey.set(externalKey, proposed);
    }
    // A task can span multiple sections, while the legacy task columns can hold
    // only one section/topic. Keep the first deterministic slice as the task's
    // primary section; task_resource_units remains the complete many-to-many truth.
    const primarySection = intersecting[0].section;
    tasks.push({
      subjectId: SUBJECT_IDS[task.subject],
      curriculumNodeId: primarySection.curriculumNodeId,
      referenceResourceId,
      resourceSectionCanonicalKey: primarySection.canonicalKey,
      resourceUnitExternalKeys: unitKeys,
      title: `${task.subject} · ${task.task} · ${task.physical_range}`,
      description: `Kaynak: ${task.resource} · Amaç: ${task.purpose}`,
      plannedDate: task.date,
      estimatedMinutes: Number(task.minutes),
      workMode: workModeForTask(task.task_type),
      dedupeKey: `baseline:2026-08-17:${task.date}:${String(task.order).padStart(2, "0")}:${referenceResourceId}`,
    });
  }

  const capacityMinutes = Number(baseline.weekly_capacity_minutes);
  const reserveMinutes = reserveRows.reduce((sum, task) => sum + Number(task.minutes), 0);
  const planningBudgetMinutes = academicRows.reduce((sum, task) => sum + Number(task.minutes), 0);
  const reserveByDate = new Map();
  for (const task of reserveRows) {
    reserveByDate.set(task.date, (reserveByDate.get(task.date) ?? 0) + Number(task.minutes));
  }
  const dailyCapacity = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${baseline.plan_start}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + index);
    const capacityDate = date.toISOString().slice(0, 10);
    return { date: capacityDate, capacityMinutes: 360, reserveMinutes: reserveByDate.get(capacityDate) ?? 0 };
  });
  if (academicRows.length !== 35 || reserveRows.length !== 7) conflicts.push("BASELINE_ACADEMIC_RESERVE_COUNT_MISMATCH");
  if (reserveByDate.size !== 7) conflicts.push("BASELINE_DAILY_RESERVE_DATE_MISMATCH");
  if (capacityMinutes !== 2520 || planningBudgetMinutes !== 2310 || reserveMinutes !== 210) conflicts.push("BASELINE_WEEKLY_CAPACITY_MISMATCH");
  if (dailyCapacity.reduce((sum, day) => sum + day.capacityMinutes, 0) !== capacityMinutes
    || dailyCapacity.reduce((sum, day) => sum + day.reserveMinutes, 0) !== reserveMinutes) conflicts.push("BASELINE_DAILY_CAPACITY_MISMATCH");
  if (tasks.length !== 35 || unitsByKey.size !== 45) conflicts.push(`BASELINE_OUTPUT_COUNT_MISMATCH:${tasks.length}:${unitsByKey.size}`);

  return {
    sourceKey: "baseline:2026-08-17:v1",
    weekStartDate: baseline.plan_start,
    capacityMinutes,
    planningBudgetMinutes,
    reserveMinutes,
    dailyCapacity,
    inputTaskCount: baseline.tasks.length,
    academicTaskCount: academicRows.length,
    reserveRowCount: reserveRows.length,
    reserveRowMinutes: reserveMinutes,
    units: [...unitsByKey.values()],
    tasks,
    conflicts,
  };
}

function comparableSection(row) {
  return {
    curriculum_node_id: row.curriculumNodeId,
    name: row.name,
    sort_order: row.sortOrder,
    page_start: row.pageStart,
    page_end: row.pageEnd,
    physical_range: row.physicalRange,
    source_unit_type: row.sourceUnitType,
    basis: row.basis,
    confidence: row.confidence,
    evidence: row.evidence,
    source_notes: row.sourceNotes,
    planning_role: row.planningRole,
    is_active: true,
  };
}

function comparableUnit(row) {
  return {
    name: row.name,
    unit_type: row.unitType,
    sort_order: row.sortOrder,
    estimated_minutes: row.estimatedMinutes,
    page_start: row.pageStart,
    page_end: row.pageEnd,
    physical_range: row.physicalRange,
    slice_basis: row.sliceBasis,
    is_active: true,
  };
}

function equalFields(existing, desired) {
  return Object.entries(desired).every(([key, value]) => existing?.[key] === value);
}

export function buildDataOnlyDryRun(model, baselinePlan) {
  const specialRoles = Object.fromEntries(["curriculum", "mixed_review", "review_only", "reference_only"]
    .map((role) => [role, model.sections.filter((section) => section.planningRole === role).length]));
  return {
    mode: "dry-run",
    databaseCompared: false,
    inputResources: model.resources.length,
    inputSections: model.sections.length,
    previousThreeScope: "Only baseline-required sections for Libertus Anayasa, Optimus Maliye and Reditus Muhasebe; not the complete previous-13 catalog.",
    executionUnits: baselinePlan.units.length,
    baselineInputRows: baselinePlan.inputTaskCount,
    baselineAcademicTasks: baselinePlan.academicTaskCount,
    baselineReserveRows: baselinePlan.reserveRowCount,
    capacity: {
      weeklyCapacityMinutes: baselinePlan.capacityMinutes,
      planningBudgetMinutes: baselinePlan.planningBudgetMinutes,
      reserveMinutes: baselinePlan.reserveMinutes,
      dailyCapacityMinutes: 360,
      dailyCapacity: baselinePlan.dailyCapacity.map((day) => ({
        ...day,
        planningCapacityMinutes: day.capacityMinutes - day.reserveMinutes,
      })),
    },
    create: { sections: model.sections.length, units: baselinePlan.units.length, tasks: baselinePlan.tasks.length, weekOverrides: 1, dailyOverrides: 7 },
    update: 0,
    unchanged: 0,
    conflict: [...model.conflicts, ...baselinePlan.conflicts],
    unresolved: 0,
    specialPlanningRoles: specialRoles,
    wouldWrite: false,
  };
}

export async function applyCanonicalImport({ client, userId, examProfileId, model, baselinePlan }) {
  const profile = await client.from("exam_profiles").select("id,user_id,status")
    .eq("id", examProfileId).eq("user_id", userId).maybeSingle();
  if (profile.error) throw profile.error;
  if (!profile.data || profile.data.status !== "active") throw new Error("INVALID_EXAM_PROFILE_OWNERSHIP");

  const requiredReferences = model.resources.map((resource) => resource.referenceResourceId);
  const targets = await client.from("p48_resource_targets")
    .select("resource_id,reference_resource_id,user_id,exam_profile_id,resources(id,user_id,exam_profile_id,subject_id,name)")
    .eq("user_id", userId).eq("exam_profile_id", examProfileId).in("reference_resource_id", requiredReferences);
  if (targets.error) throw targets.error;
  const resourceByReference = new Map((targets.data ?? []).map((target) => [target.reference_resource_id, target.resources]));
  const missingReferences = requiredReferences.filter((reference) => !resourceByReference.has(reference));
  if (missingReferences.length) throw new Error(`MISSING_P48_RESOURCE_TARGETS:${missingReferences.join(",")}`);
  for (const section of model.sections) {
    const resource = resourceByReference.get(section.referenceResourceId);
    if (!resource || resource.user_id !== userId || resource.exam_profile_id !== examProfileId || resource.subject_id !== section.subjectId) {
      throw new Error(`RESOURCE_OWNERSHIP_OR_SUBJECT_CONFLICT:${section.referenceResourceId}`);
    }
  }

  const resourceIds = [...new Set([...resourceByReference.values()].map((resource) => resource.id))];
  const existingSectionsResult = await client.from("resource_sections").select("*").in("resource_id", resourceIds);
  if (existingSectionsResult.error) throw existingSectionsResult.error;
  const existingSectionByKey = new Map((existingSectionsResult.data ?? []).filter((row) => row.canonical_key)
    .map((row) => [`${row.resource_id}|${row.canonical_key}`, row]));
  const sectionCreates = [];
  const sectionUpdates = [];
  for (const section of model.sections) {
    const resourceId = resourceByReference.get(section.referenceResourceId).id;
    const desired = comparableSection(section);
    const row = { resource_id: resourceId, canonical_key: section.canonicalKey, ...desired };
    const existing = existingSectionByKey.get(`${resourceId}|${section.canonicalKey}`);
    if (!existing) sectionCreates.push(row);
    else if (!equalFields(existing, desired)) sectionUpdates.push(row);
  }
  const changedSections = [...sectionCreates, ...sectionUpdates];
  if (changedSections.length) {
    const changed = await client.from("resource_sections").upsert(changedSections, { onConflict: "resource_id,canonical_key" });
    if (changed.error) throw changed.error;
  }

  let deactivatedSections = 0;
  for (const referenceResourceId of model.fullScopeReferences) {
    const resourceId = resourceByReference.get(referenceResourceId).id;
    const activeKeys = new Set(model.sections.filter((section) => section.referenceResourceId === referenceResourceId).map((section) => section.canonicalKey));
    const staleIds = (existingSectionsResult.data ?? []).filter((section) => section.resource_id === resourceId
      && section.canonical_key?.startsWith(`p48:${referenceResourceId}:section:`)
      && !activeKeys.has(section.canonical_key) && section.is_active).map((section) => section.id);
    if (staleIds.length) {
      const stale = await client.from("resource_sections").update({ is_active: false }).in("id", staleIds);
      if (stale.error) throw stale.error;
      deactivatedSections += staleIds.length;
    }
  }

  // Canonical keys deliberately carry stable resource and section identity. Sending
  // all 237 keys in a PostgREST `in` filter can exceed conservative URI limits, so
  // scope by the small resource-id set and perform the exact-key selection locally.
  const sectionRows = await client.from("resource_sections").select("id,resource_id,canonical_key")
    .in("resource_id", resourceIds);
  if (sectionRows.error) throw sectionRows.error;
  const requiredSectionKeys = new Set(model.sections.map((section) => section.canonicalKey));
  const sectionByKey = new Map((sectionRows.data ?? []).filter((section) => requiredSectionKeys.has(section.canonical_key))
    .map((section) => [section.canonical_key, section]));
  if (sectionByKey.size !== model.sections.length) throw new Error("CANONICAL_SECTION_PERSISTENCE_INCOMPLETE");

  const existingUnitsResult = await client.from("resource_units").select("*")
    .in("resource_id", resourceIds);
  if (existingUnitsResult.error) throw existingUnitsResult.error;
  const requiredUnitKeys = new Set(baselinePlan.units.map((unit) => unit.externalKey));
  const existingUnitByKey = new Map((existingUnitsResult.data ?? []).filter((unit) => requiredUnitKeys.has(unit.external_key))
    .map((unit) => [unit.external_key, unit]));
  const unitCreates = [];
  const unitUpdates = [];
  for (const unit of baselinePlan.units) {
    const section = sectionByKey.get(unit.sectionCanonicalKey);
    const desired = comparableUnit(unit);
    const row = { resource_id: section.resource_id, resource_section_id: section.id, external_key: unit.externalKey, ...desired };
    const existing = existingUnitByKey.get(unit.externalKey);
    if (!existing) unitCreates.push(row);
    else if (existing.resource_section_id !== section.id || !equalFields(existing, desired)) unitUpdates.push(row);
  }
  const changedUnits = [...unitCreates, ...unitUpdates];
  if (changedUnits.length) {
    const changed = await client.from("resource_units").upsert(changedUnits, { onConflict: "resource_section_id,external_key" });
    if (changed.error) throw changed.error;
  }

  const unitRows = await client.from("resource_units").select("id,resource_id,resource_section_id,external_key")
    .in("resource_id", resourceIds);
  if (unitRows.error) throw unitRows.error;
  const unitByKey = new Map((unitRows.data ?? []).filter((unit) => requiredUnitKeys.has(unit.external_key))
    .map((unit) => [unit.external_key, unit]));
  if (unitByKey.size !== baselinePlan.units.length) throw new Error("EXECUTION_UNIT_PERSISTENCE_INCOMPLETE");

  const payload = {
    sourceKey: baselinePlan.sourceKey,
    weekStartDate: baselinePlan.weekStartDate,
    capacityMinutes: baselinePlan.capacityMinutes,
    planningBudgetMinutes: baselinePlan.planningBudgetMinutes,
    reserveMinutes: baselinePlan.reserveMinutes,
    dailyCapacity: baselinePlan.dailyCapacity,
    tasks: baselinePlan.tasks.map((task) => ({
      subjectId: task.subjectId,
      curriculumNodeId: task.curriculumNodeId,
      resourceId: resourceByReference.get(task.referenceResourceId).id,
      resourceSectionId: task.resourceSectionCanonicalKey ? sectionByKey.get(task.resourceSectionCanonicalKey).id : null,
      resourceUnitIds: task.resourceUnitExternalKeys.map((key) => unitByKey.get(key).id),
      title: task.title,
      description: task.description,
      plannedDate: task.plannedDate,
      estimatedMinutes: task.estimatedMinutes,
      workMode: task.workMode,
      dedupeKey: task.dedupeKey,
    })),
  };
  const persisted = await client.rpc("service_persist_p48_baseline_plan", {
    p_user_id: userId, p_exam_profile_id: examProfileId, p_payload: payload,
  });
  if (persisted.error) throw persisted.error;

  return {
    mode: "apply",
    inputResources: model.resources.length,
    inputSections: model.sections.length,
    executionUnits: baselinePlan.units.length,
    create: { sections: sectionCreates.length, units: unitCreates.length, tasks: persisted.data.insertedTaskCount },
    update: { sections: sectionUpdates.length, units: unitUpdates.length, deactivatedSections },
    unchanged: {
      sections: model.sections.length - sectionCreates.length - sectionUpdates.length,
      units: baselinePlan.units.length - unitCreates.length - unitUpdates.length,
      tasks: persisted.data.taskCount - persisted.data.insertedTaskCount,
    },
    conflict: [],
    unresolved: 0,
    baseline: persisted.data,
    wouldWrite: true,
  };
}

function parseArguments(argv) {
  const result = { mode: null, userId: null, examProfileId: null };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--dry-run") result.mode = "dry-run";
    else if (value === "--apply") result.mode = "apply";
    else if (value === "--user-id") result.userId = argv[++index];
    else if (value === "--exam-profile-id") result.examProfileId = argv[++index];
    else throw new Error(`UNKNOWN_ARGUMENT:${value}`);
  }
  if (!result.mode) throw new Error("MODE_REQUIRED: use --dry-run or --apply");
  if (result.mode === "apply" && (!result.userId || !result.examProfileId)) {
    throw new Error("APPLY_REQUIRES_USER_ID_AND_EXAM_PROFILE_ID");
  }
  return result;
}

export async function runImporter(options) {
  const inputs = await loadCanonicalInputs(options.root ?? repositoryRoot);
  const model = buildCanonicalModel(inputs);
  const baselinePlan = buildBaselineExecutionPlan(model, inputs.baseline);
  const conflicts = [...model.conflicts, ...baselinePlan.conflicts];
  if (conflicts.length) throw new Error(`CANONICAL_INPUT_CONFLICTS:${conflicts.join("|")}`);
  if (options.mode === "dry-run") return buildDataOnlyDryRun(model, baselinePlan);

  let url = process.env.SUPABASE_URL;
  let serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    const local = readLocalSupabaseStatus();
    url ??= local.url;
    serviceRoleKey ??= local.serviceRoleKey;
  }
  if (!url || !serviceRoleKey) throw new Error("SUPABASE_URL_AND_SERVICE_ROLE_KEY_REQUIRED");
  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return applyCanonicalImport({ client, userId: options.userId, examProfileId: options.examProfileId, model, baselinePlan });
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    console.log(JSON.stringify(await runImporter(options), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
