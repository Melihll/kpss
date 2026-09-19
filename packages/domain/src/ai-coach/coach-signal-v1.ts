import type {
  CoachContextV1,
  CoachContextV1Confidence,
  CoachContextV1Fact,
  CoachContextV1Freshness,
  CoachContextV1Provenance,
  CoachContextV1SignalInput,
} from "./coach-context-v1";

export const COACH_SIGNAL_CANDIDATE_V1_VERSION = "coach-signal-candidate-v1" as const;
export const COACH_SIGNAL_SET_V1_VERSION = "coach-signal-set-v1" as const;

export const COACH_SIGNAL_TYPES_V1 = [
  "today_remaining_work",
  "today_completed_as_planned",
  "today_partial_completion",
  "repeated_task_miss",
  "subject_recent_completion_drop",
  "subject_workload_progress_available",
  "subject_workload_progress_unknown",
  "schedule_capacity_change",
  "weekly_completion_pattern",
  "recent_study_consistency",
  "recent_recovery",
  "planner_warning_present",
  "material_progress_stalled",
  "context_data_stale",
  "important_truth_unknown",
] as const;

export type CoachSignalTypeV1 = (typeof COACH_SIGNAL_TYPES_V1)[number];
export type CoachSignalSeverityV1 = "info" | "notice" | "warning";
export type CoachSignalImportanceV1 = "low" | "medium" | "high";
export type CoachSignalConfidenceV1 = "high" | "medium" | "low";
export type CoachSignalAttentionCategoryV1 =
  | "progress"
  | "consistency"
  | "capacity"
  | "material"
  | "planner"
  | "data_quality";
export type CoachSignalCooldownClassV1 =
  | "same_snapshot"
  | "daily"
  | "weekly"
  | "state_change";
export type CoachSignalFreshnessCategoryV1 =
  | "today_week_task"
  | "planner_lifecycle"
  | "capacity"
  | "material_workload"
  | "recent_progress"
  | "deterministic_signal_input"
  | "important_context";

export type CoachSignalReasonCodeV1 =
  | "today_open_minutes_present"
  | "today_all_tasks_completed_with_planned_credit"
  | "today_partial_task_count_present"
  | "same_task_missed_multiple_times_in_recent_window"
  | "canonical_completion_drop_input_present"
  | "canonical_subject_workload_is_available"
  | "canonical_subject_workload_is_incomplete"
  | "canonical_capacity_change_input_present"
  | "current_week_task_counts_available"
  | "canonical_consistency_input_present"
  | "completed_after_recent_miss"
  | "persisted_planner_warning_count_present"
  | "canonical_material_stall_input_present"
  | "source_fact_stale"
  | "freshness_policy_rejected"
  | "required_truth_unavailable";

export type CoachSignalEvidenceScalarV1 = string | number | boolean | null;

export interface CoachSignalCandidateV1 {
  readonly version: typeof COACH_SIGNAL_CANDIDATE_V1_VERSION;
  readonly signalType: CoachSignalTypeV1;
  readonly severity: CoachSignalSeverityV1;
  readonly importance: CoachSignalImportanceV1;
  readonly subjectId: string | null;
  readonly date: string | null;
  readonly reasonCode: CoachSignalReasonCodeV1;
  readonly sourceFactPaths: readonly string[];
  readonly asOf: string;
  readonly freshness: CoachContextV1Freshness;
  readonly confidence: CoachSignalConfidenceV1;
  readonly evidence: Readonly<Record<string, CoachSignalEvidenceScalarV1>>;
  readonly provenance: readonly CoachContextV1Provenance[];
  readonly dedupeKey: string;
  readonly eligibility: {
    readonly reactiveExplanation: boolean;
    readonly proactiveCandidate: boolean;
    readonly attentionCategory: CoachSignalAttentionCategoryV1;
    readonly cooldownClass: CoachSignalCooldownClassV1;
    readonly silenceAllowed: true;
  };
  readonly authority: {
    readonly mode: "factual_signal_only_read_only";
    readonly createsProductTruth: false;
    readonly generatesProse: false;
    readonly dbWritesAllowed: false;
    readonly workloadCalculationAllowed: false;
    readonly plannerPreviewAllowed: false;
    readonly plannerProposalAllowed: false;
    readonly plannerConfirmationAllowed: false;
    readonly plannerApplyAllowed: false;
    readonly llmCallsAllowed: false;
    readonly providerCallsAllowed: false;
  };
}

export interface CoachSignalSetV1 {
  readonly version: typeof COACH_SIGNAL_SET_V1_VERSION;
  readonly sourceContext: {
    readonly version: CoachContextV1["version"];
    readonly requestId: string;
  };
  readonly asOf: string;
  readonly candidates: readonly CoachSignalCandidateV1[];
  readonly collection: {
    readonly availableCount: number;
    readonly returnedCount: number;
    readonly limit: number;
    readonly truncated: boolean;
  };
  readonly silenceEligible: true;
  readonly authority: CoachSignalCandidateV1["authority"];
}

export interface CoachSignalSelectionV1 {
  readonly signalTypes?: readonly CoachSignalTypeV1[];
  readonly subjectId?: string;
  readonly proactiveOnly?: boolean;
}

export interface CoachSignalRegistryEntryV1 {
  readonly signalType: CoachSignalTypeV1;
  readonly freshnessCategory: CoachSignalFreshnessCategoryV1;
  readonly exactInputFactPaths: readonly string[];
  readonly emissionConditionCode: string;
  readonly suppressionConditionCodes: readonly string[];
  readonly unavailableBehavior: "suppress" | "emit_data_quality_signal";
  readonly dedupeIdentityFields: readonly ("signalType" | "subjectId" | "date" | "entityId" | "reasonCode" | "sourceFactPath")[];
  readonly attentionCategory: CoachSignalAttentionCategoryV1;
  readonly cooldownClass: CoachSignalCooldownClassV1;
  readonly reactiveExplanation: boolean;
  readonly proactiveCandidate: boolean;
}

export const COACH_SIGNAL_FRESHNESS_POLICY_V1 = Object.freeze({
  today_week_task: {
    factPaths: ["today", "week", "subjects[*].tasks"],
    acceptance: "source_declared_fresh_and_current_calendar_scope",
    sourceExpiryEnforced: true,
    independentMaxAgeMs: null,
    limitation: "no_independent_task_ttl_authority",
  },
  planner_lifecycle: {
    factPaths: ["planner"],
    acceptance: "source_declared_fresh_and_persisted_proposal_not_expired",
    sourceExpiryEnforced: true,
    independentMaxAgeMs: null,
    limitation: "persisted_lifecycle_expiry_is_authoritative",
  },
  capacity: {
    factPaths: ["capacity"],
    acceptance: "source_declared_fresh_and_current_date_in_horizon",
    sourceExpiryEnforced: true,
    independentMaxAgeMs: null,
    limitation: "no_coach_owned_capacity_ttl",
  },
  material_workload: {
    factPaths: ["materials", "workload", "subjects[*].material"],
    acceptance: "source_declared_fresh",
    sourceExpiryEnforced: true,
    independentMaxAgeMs: null,
    limitation: "canonical_owners_do_not_publish_independent_ttl",
  },
  recent_progress: {
    factPaths: ["recentProgress"],
    acceptance: "source_declared_fresh_with_declared_window",
    sourceExpiryEnforced: true,
    independentMaxAgeMs: null,
    limitation: "window_is_context_not_trajectory_authority",
  },
  deterministic_signal_input: {
    factPaths: ["signalInputs"],
    acceptance: "source_declared_fresh_and_allowlisted_key_and_source_path",
    sourceExpiryEnforced: true,
    independentMaxAgeMs: null,
    limitation: "missing_registry_input_suppresses_dependent_signal",
  },
  important_context: {
    factPaths: ["today", "week", "materials", "workload", "capacity", "recentProgress", "nextWork", "week.value.progressPosition", "planner"],
    acceptance: "category_policy_for_each_important_fact",
    sourceExpiryEnforced: true,
    independentMaxAgeMs: null,
    limitation: "no_cross_domain_coach_owned_ttl",
  },
} satisfies Readonly<Record<CoachSignalFreshnessCategoryV1, {
  readonly factPaths: readonly string[];
  readonly acceptance: string;
  readonly sourceExpiryEnforced: boolean;
  readonly independentMaxAgeMs: null;
  readonly limitation: string;
}>>);

const registry = [
  ["today_remaining_work", "today_week_task", ["today.value.summary"], "today_known_fresh_and_open_count_and_remaining_minutes_positive", ["today_unavailable", "today_stale_or_expired", "today_date_mismatch", "no_remaining_work"], "suppress", "progress", "same_snapshot", true, false],
  ["today_completed_as_planned", "today_week_task", ["today.value.summary", "today.value.study.plannedCreditMinutes"], "all_today_tasks_completed_and_remaining_zero_and_planned_credit_covers_planned_minutes", ["today_unavailable", "today_stale_or_expired", "today_date_mismatch", "empty_today", "planned_credit_incomplete"], "suppress", "progress", "daily", true, true],
  ["today_partial_completion", "today_week_task", ["today.value.summary.partiallyCompletedTaskCount"], "partial_task_count_positive", ["today_unavailable", "today_stale_or_expired", "today_date_mismatch", "no_partial_task"], "suppress", "progress", "state_change", true, true],
  ["repeated_task_miss", "recent_progress", ["recentProgress.value.taskEvents"], "same_task_has_two_or_more_distinct_missed_events", ["recent_progress_unavailable", "recent_progress_stale_or_expired", "fewer_than_two_distinct_misses"], "emit_data_quality_signal", "consistency", "weekly", true, true],
  ["subject_recent_completion_drop", "deterministic_signal_input", ["signalInputs[key=subject_recent_completion_drop:<subjectId>]"], "allowlisted_positive_canonical_drop_input", ["signal_inputs_unavailable", "signal_inputs_stale_or_expired", "invalid_key_or_source_path", "non_positive_value"], "suppress", "progress", "weekly", true, true],
  ["subject_workload_progress_available", "material_workload", ["workload", "subjects[*].material"], "subject_material_known_and_no_unknown_workload_and_subject_minutes_present", ["workload_unavailable", "material_unavailable", "unknown_workload_present", "subject_minutes_absent"], "emit_data_quality_signal", "material", "state_change", true, false],
  ["subject_workload_progress_unknown", "material_workload", ["workload", "subjects[*].material"], "required_subject_workload_fact_is_unavailable_or_incomplete", ["subject_has_no_material", "canonical_subject_workload_complete"], "suppress", "data_quality", "state_change", true, false],
  ["schedule_capacity_change", "deterministic_signal_input", ["signalInputs[key=schedule_capacity_change:<date>]"], "allowlisted_non_zero_canonical_capacity_delta_input", ["signal_inputs_unavailable", "signal_inputs_stale_or_expired", "invalid_key_or_source_path", "zero_delta"], "suppress", "capacity", "state_change", true, true],
  ["weekly_completion_pattern", "today_week_task", ["week.value.summary"], "current_week_known_fresh_and_non_empty", ["week_unavailable", "week_stale_or_expired", "week_outside_calendar_scope", "empty_week"], "emit_data_quality_signal", "progress", "weekly", true, false],
  ["recent_study_consistency", "deterministic_signal_input", ["signalInputs[key=recent_study_consistency_days]"], "allowlisted_non_negative_canonical_consistency_input", ["signal_inputs_unavailable", "signal_inputs_stale_or_expired", "invalid_source_path", "invalid_value"], "suppress", "consistency", "weekly", true, false],
  ["recent_recovery", "recent_progress", ["recentProgress.value.taskEvents"], "same_task_has_completed_event_after_distinct_missed_event", ["recent_progress_unavailable", "recent_progress_stale_or_expired", "no_miss_then_complete_sequence"], "emit_data_quality_signal", "consistency", "state_change", true, true],
  ["planner_warning_present", "planner_lifecycle", ["planner.value.warnings"], "persisted_current_planner_has_warning_count", ["planner_unavailable", "planner_stale_or_expired", "no_warning"], "emit_data_quality_signal", "planner", "state_change", true, true],
  ["material_progress_stalled", "deterministic_signal_input", ["signalInputs[key=material_progress_stalled:<materialViewId>]"], "allowlisted_true_canonical_stall_input", ["signal_inputs_unavailable", "signal_inputs_stale_or_expired", "invalid_key_or_source_path", "false_value", "material_not_in_context"], "suppress", "material", "weekly", true, true],
  ["context_data_stale", "important_context", ["important_context_facts"], "important_fact_stale_or_freshness_policy_rejected", ["no_stale_important_fact"], "suppress", "data_quality", "state_change", true, false],
  ["important_truth_unknown", "important_context", ["important_context_facts"], "important_fact_unknown_or_blocked", ["fact_known_or_not_applicable"], "suppress", "data_quality", "state_change", true, false],
] as const;

export const COACH_SIGNAL_REGISTRY_V1: readonly CoachSignalRegistryEntryV1[] = Object.freeze(
  registry.map(([signalType, freshnessCategory, exactInputFactPaths, emissionConditionCode, suppressionConditionCodes, unavailableBehavior, attentionCategory, cooldownClass, reactiveExplanation, proactiveCandidate]) => ({
    signalType,
    freshnessCategory,
    exactInputFactPaths,
    emissionConditionCode,
    suppressionConditionCodes,
    unavailableBehavior,
    dedupeIdentityFields: ["signalType", "subjectId", "date", "entityId", "reasonCode", "sourceFactPath"] as const,
    attentionCategory,
    cooldownClass,
    reactiveExplanation,
    proactiveCandidate,
  })),
);

export const COACH_SIGNAL_V1_LIMITS = Object.freeze({
  candidates: 32,
  sourceFactPathsPerCandidate: 8,
  evidenceValuesPerCandidate: 12,
  provenanceRecordsPerCandidate: 64,
  serializedBytes: 24_576,
});

type AnyFact = CoachContextV1Fact<unknown>;

interface CandidateDraft {
  readonly signalType: CoachSignalTypeV1;
  readonly severity: CoachSignalSeverityV1;
  readonly importance: CoachSignalImportanceV1;
  readonly subjectId?: string | null;
  readonly date?: string | null;
  readonly entityId?: string | null;
  readonly reasonCode: CoachSignalReasonCodeV1;
  readonly sourceFactPaths: readonly string[];
  readonly facts: readonly AnyFact[];
  readonly evidence: Readonly<Record<string, CoachSignalEvidenceScalarV1>>;
  readonly freshnessOverride?: CoachContextV1Freshness;
  readonly confidenceOverride?: CoachSignalConfidenceV1;
}

function registryEntry(signalType: CoachSignalTypeV1): CoachSignalRegistryEntryV1 {
  return COACH_SIGNAL_REGISTRY_V1.find((entry) => entry.signalType === signalType)!;
}

function isExpired(expiresAt: string | null, generatedAt: string): boolean {
  return expiresAt !== null && Date.parse(generatedAt) >= Date.parse(expiresAt);
}

function isKnownFresh<T>(
  fact: CoachContextV1Fact<T>,
  generatedAt: string,
): fact is Extract<CoachContextV1Fact<T>, { readonly availability: "known" }> {
  return fact.availability === "known" && fact.freshness.state === "fresh" && !isExpired(fact.freshness.expiresAt, generatedAt);
}

function confidenceFromFacts(facts: readonly AnyFact[]): CoachSignalConfidenceV1 {
  const values = facts.map((fact) => fact.confidence);
  if (values.includes("none") || values.includes("low")) return "low";
  if (values.includes("medium")) return "medium";
  return "high";
}

function freshnessFromFacts(facts: readonly AnyFact[], generatedAt: string): CoachContextV1Freshness {
  const stale = facts.find((fact) => fact.availability === "stale" || isExpired(fact.freshness.expiresAt, generatedAt));
  if (stale) return { ...stale.freshness, state: "stale" };
  const unknown = facts.find((fact) => fact.availability === "unknown" || fact.availability === "blocked");
  if (unknown) return structuredClone(unknown.freshness);
  return structuredClone(facts[0]?.freshness ?? { state: "unknown", asOf: null, expiresAt: null });
}

function normalizeProvenance(facts: readonly AnyFact[]): readonly CoachContextV1Provenance[] {
  const unique = new Map<string, CoachContextV1Provenance>();
  for (const fact of facts) {
    for (const item of fact.provenance) {
      const normalized = { source: item.source, recordIds: [...new Set(item.recordIds)].sort(), asOf: item.asOf };
      unique.set(`${normalized.source}|${normalized.asOf ?? ""}|${normalized.recordIds.join("|")}`, normalized);
    }
  }
  return [...unique.values()].sort((left, right) => left.source.localeCompare(right.source) || (left.asOf ?? "").localeCompare(right.asOf ?? "") || left.recordIds.join("|").localeCompare(right.recordIds.join("|")));
}

function sortedEvidence(evidence: Readonly<Record<string, CoachSignalEvidenceScalarV1>>): Readonly<Record<string, CoachSignalEvidenceScalarV1>> {
  return Object.fromEntries(Object.entries(evidence).sort(([left], [right]) => left.localeCompare(right)));
}

function authority(): CoachSignalCandidateV1["authority"] {
  return {
    mode: "factual_signal_only_read_only",
    createsProductTruth: false,
    generatesProse: false,
    dbWritesAllowed: false,
    workloadCalculationAllowed: false,
    plannerPreviewAllowed: false,
    plannerProposalAllowed: false,
    plannerConfirmationAllowed: false,
    plannerApplyAllowed: false,
    llmCallsAllowed: false,
    providerCallsAllowed: false,
  };
}

function materialize(context: CoachContextV1, draft: CandidateDraft): CoachSignalCandidateV1 {
  const entry = registryEntry(draft.signalType);
  const sourceFactPaths = [...new Set(draft.sourceFactPaths)].sort();
  if (sourceFactPaths.length > COACH_SIGNAL_V1_LIMITS.sourceFactPathsPerCandidate) throw new Error("COACH_SIGNAL_TOO_MANY_SOURCE_PATHS");
  const evidence = sortedEvidence(draft.evidence);
  if (Object.keys(evidence).length > COACH_SIGNAL_V1_LIMITS.evidenceValuesPerCandidate) throw new Error("COACH_SIGNAL_TOO_MANY_EVIDENCE_VALUES");
  const provenance = normalizeProvenance(draft.facts);
  if (provenance.some((item) => item.recordIds.length > COACH_SIGNAL_V1_LIMITS.provenanceRecordsPerCandidate)) throw new Error("COACH_SIGNAL_TOO_MANY_PROVENANCE_RECORDS");
  const subjectId = draft.subjectId ?? null;
  const date = draft.date ?? null;
  const entityId = draft.entityId ?? null;
  const dedupeKey = [draft.signalType, subjectId ?? "global", date ?? "any-date", entityId ?? "no-entity", draft.reasonCode, sourceFactPaths.join("+")].join(":");
  const freshness = draft.freshnessOverride ?? freshnessFromFacts(draft.facts, context.generatedAt);
  return {
    version: COACH_SIGNAL_CANDIDATE_V1_VERSION,
    signalType: draft.signalType,
    severity: draft.severity,
    importance: draft.importance,
    subjectId,
    date,
    reasonCode: draft.reasonCode,
    sourceFactPaths,
    asOf: freshness.asOf ?? context.generatedAt,
    freshness,
    confidence: draft.confidenceOverride ?? confidenceFromFacts(draft.facts),
    evidence,
    provenance,
    dedupeKey,
    eligibility: {
      reactiveExplanation: entry.reactiveExplanation,
      proactiveCandidate: entry.proactiveCandidate,
      attentionCategory: entry.attentionCategory,
      cooldownClass: entry.cooldownClass,
      silenceAllowed: true,
    },
    authority: authority(),
  };
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}

function validSignalSourcePath(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}.`) || path.startsWith(`${prefix}[`);
}

function usableSignalInputs(context: CoachContextV1): readonly CoachContextV1SignalInput[] {
  const signalInputs = context.signalInputs;
  return isKnownFresh(signalInputs, context.generatedAt) ? signalInputs.value : [];
}

function addTodaySignals(context: CoachContextV1, drafts: CandidateDraft[]): void {
  const today = context.today;
  if (!isKnownFresh(today, context.generatedAt) || today.value.date !== context.currentDate) return;
  const { summary, study } = today.value;
  const fact = today as AnyFact;
  if (summary.openTaskCount > 0 && summary.remainingMinutes > 0) drafts.push({
    signalType: "today_remaining_work", severity: "info", importance: "low", date: context.currentDate,
    reasonCode: "today_open_minutes_present", sourceFactPaths: ["today.value.summary.openTaskCount", "today.value.summary.remainingMinutes"], facts: [fact],
    evidence: { openTaskCount: summary.openTaskCount, remainingMinutes: summary.remainingMinutes },
  });
  if (summary.totalTaskCount > 0 && summary.completedTaskCount === summary.totalTaskCount && summary.openTaskCount === 0 && summary.remainingMinutes === 0 && study.plannedCreditMinutes >= summary.plannedMinutes) drafts.push({
    signalType: "today_completed_as_planned", severity: "info", importance: "medium", date: context.currentDate,
    reasonCode: "today_all_tasks_completed_with_planned_credit", sourceFactPaths: ["today.value.summary", "today.value.study.plannedCreditMinutes"], facts: [fact],
    evidence: { completedTaskCount: summary.completedTaskCount, plannedMinutes: summary.plannedMinutes, plannedCreditMinutes: study.plannedCreditMinutes },
  });
  if (summary.partiallyCompletedTaskCount > 0) drafts.push({
    signalType: "today_partial_completion", severity: "notice", importance: "medium", date: context.currentDate,
    reasonCode: "today_partial_task_count_present", sourceFactPaths: ["today.value.summary.partiallyCompletedTaskCount", "today.value.summary.remainingMinutes"], facts: [fact],
    evidence: { partiallyCompletedTaskCount: summary.partiallyCompletedTaskCount, remainingMinutes: summary.remainingMinutes },
  });
}

function taskSubject(context: CoachContextV1, taskId: string): string | null {
  return context.week.value?.tasks.find((task) => task.taskId === taskId)?.subjectId ?? null;
}

function addRecentProgressSignals(context: CoachContextV1, drafts: CandidateDraft[]): void {
  const recentProgress = context.recentProgress;
  if (!isKnownFresh(recentProgress, context.generatedAt)) return;
  const fact = recentProgress as AnyFact;
  const unique = new Map<string, (typeof recentProgress.value.taskEvents)[number]>();
  for (const event of recentProgress.value.taskEvents) unique.set(`${event.taskId}|${event.occurredAt}|${event.status}|${event.completedMinutes}`, event);
  const events = [...unique.values()].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.taskId.localeCompare(right.taskId));
  const byTask = new Map<string, typeof events>();
  for (const event of events) byTask.set(event.taskId, [...(byTask.get(event.taskId) ?? []), event]);
  for (const [taskId, taskEvents] of [...byTask.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const misses = taskEvents.filter((event) => event.status === "missed");
    if (misses.length >= 2) drafts.push({
      signalType: "repeated_task_miss", severity: "warning", importance: "high", subjectId: taskSubject(context, taskId), entityId: taskId,
      reasonCode: "same_task_missed_multiple_times_in_recent_window", sourceFactPaths: [`recentProgress.value.taskEvents[taskId=${taskId}]`], facts: [fact],
      evidence: {
        distinctMissCount: misses.length,
        latestMissedAt: misses.at(-1)!.occurredAt,
        secondLatestMissedAt: misses.at(-2)!.occurredAt,
        taskId,
        windowEnd: recentProgress.value.windowEnd,
        windowStart: recentProgress.value.windowStart,
      },
    });
    const recovery = taskEvents.at(-1)?.status === "completed" ? taskEvents.at(-1) : undefined;
    const lastMissBeforeRecovery = recovery ? [...misses].reverse().find((event) => event.occurredAt < recovery.occurredAt) : undefined;
    if (lastMissBeforeRecovery && recovery) drafts.push({
      signalType: "recent_recovery", severity: "info", importance: "medium", subjectId: taskSubject(context, taskId), entityId: taskId,
      reasonCode: "completed_after_recent_miss", sourceFactPaths: [`recentProgress.value.taskEvents[taskId=${taskId}]`], facts: [fact],
      evidence: { completedAt: recovery.occurredAt, missedAt: lastMissBeforeRecovery.occurredAt, taskId },
    });
  }
}

function addSubjectWorkloadSignals(context: CoachContextV1, drafts: CandidateDraft[]): void {
  const workload = context.workload;
  for (const subject of [...context.subjects].sort((left, right) => left.subjectId.localeCompare(right.subjectId))) {
    const material = subject.material;
    const facts: AnyFact[] = [workload as AnyFact, material as AnyFact];
    const materialKnown = isKnownFresh(material, context.generatedAt);
    const workloadKnown = isKnownFresh(workload, context.generatedAt);
    const totalMaterialViews = material.value?.totalMaterialViews ?? 0;
    if (totalMaterialViews === 0 && materialKnown) continue;
    const minutesPresent = workloadKnown && Object.prototype.hasOwnProperty.call(workload.value.minutesBySubject, subject.subjectId);
    const complete = materialKnown && workloadKnown && material.value.unknownWorkloadViews === 0 && minutesPresent;
    if (complete) {
      drafts.push({
        signalType: "subject_workload_progress_available", severity: "info", importance: "low", subjectId: subject.subjectId,
        reasonCode: "canonical_subject_workload_is_available", sourceFactPaths: ["workload.value.minutesBySubject", `subjects[subjectId=${subject.subjectId}].material`], facts,
        evidence: { completedMaterialViews: material.value.completedMaterialViews, remainingWorkloadMinutes: workload.value.minutesBySubject[subject.subjectId]!, subjectId: subject.subjectId, totalMaterialViews },
      });
    } else {
      drafts.push({
        signalType: "subject_workload_progress_unknown", severity: "notice", importance: "medium", subjectId: subject.subjectId,
        reasonCode: "canonical_subject_workload_is_incomplete", sourceFactPaths: ["workload", `subjects[subjectId=${subject.subjectId}].material`], facts,
        evidence: { subjectId: subject.subjectId, workloadAvailability: context.workload.availability, materialAvailability: subject.material.availability, unknownWorkloadViews: subject.material.value?.unknownWorkloadViews ?? null },
        confidenceOverride: "low",
      });
    }
  }
}

function addWeekSignal(context: CoachContextV1, drafts: CandidateDraft[]): void {
  const week = context.week;
  if (!isKnownFresh(week, context.generatedAt) || context.currentDate < week.value.startDate || context.currentDate > week.value.endDate || week.value.summary.totalTaskCount === 0) return;
  const summary = week.value.summary;
  drafts.push({
    signalType: "weekly_completion_pattern", severity: "info", importance: "low",
    reasonCode: "current_week_task_counts_available", sourceFactPaths: ["week.value.summary"], facts: [context.week as AnyFact],
    evidence: { completedTaskCount: summary.completedTaskCount, openTaskCount: summary.openTaskCount, partiallyCompletedTaskCount: summary.partiallyCompletedTaskCount, remainingMinutes: summary.remainingMinutes, totalTaskCount: summary.totalTaskCount },
  });
}

function addPlannerSignal(context: CoachContextV1, drafts: CandidateDraft[]): void {
  const planner = context.planner;
  if (!isKnownFresh(planner, context.generatedAt) || Date.parse(context.generatedAt) >= Date.parse(planner.value.expiresAt) || planner.value.warnings.length === 0) return;
  drafts.push({
    signalType: "planner_warning_present", severity: "warning", importance: "high",
    reasonCode: "persisted_planner_warning_count_present", sourceFactPaths: ["planner.value.warnings", "planner.value.lifecycleState"], facts: [context.planner as AnyFact],
    evidence: { lifecycleState: planner.value.lifecycleState, warningCount: planner.value.warnings.length },
  });
}

function addRegisteredInputSignals(context: CoachContextV1, drafts: CandidateDraft[]): void {
  const fact = context.signalInputs as AnyFact;
  const inputs = usableSignalInputs(context);
  for (const input of [...inputs].sort((left, right) => left.key.localeCompare(right.key) || left.sourceFactPath.localeCompare(right.sourceFactPath))) {
    const completionMatch = /^subject_recent_completion_drop:(.+)$/.exec(input.key);
    const completionSubject = completionMatch ? context.subjects.find((subject) => subject.subjectId === completionMatch[1]) : undefined;
    if (completionMatch && completionSubject && isKnownFresh(completionSubject.tasks, context.generatedAt) && input.category === "progress" && (input.unit === "count" || input.unit === "ratio") && typeof input.value === "number" && input.value > 0 && validSignalSourcePath(input.sourceFactPath, "subjects")) drafts.push({
      signalType: "subject_recent_completion_drop", severity: "warning", importance: "high", subjectId: completionMatch[1]!, entityId: input.key,
      reasonCode: "canonical_completion_drop_input_present", sourceFactPaths: [input.sourceFactPath, `signalInputs[key=${input.key}]`], facts: [fact, completionSubject.tasks as AnyFact], evidence: { dropValue: input.value, subjectId: completionMatch[1]! },
    });
    const capacityMatch = /^schedule_capacity_change:(\d{4}-\d{2}-\d{2})$/.exec(input.key);
    const capacity = context.capacity;
    const capacityDatePresent = capacityMatch && isKnownFresh(capacity, context.generatedAt) && capacity.value.days.some((day) => day.date === capacityMatch[1]);
    if (capacityMatch && capacityDatePresent && input.category === "capacity" && input.unit === "minutes" && typeof input.value === "number" && input.value !== 0 && validSignalSourcePath(input.sourceFactPath, "capacity")) drafts.push({
      signalType: "schedule_capacity_change", severity: "notice", importance: "medium", date: capacityMatch[1]!, entityId: input.key,
      reasonCode: "canonical_capacity_change_input_present", sourceFactPaths: [input.sourceFactPath, `signalInputs[key=${input.key}]`], facts: [fact, capacity as AnyFact], evidence: { capacityDeltaMinutes: input.value, date: capacityMatch[1]! },
    });
    const recentProgress = context.recentProgress;
    if (input.key === "recent_study_consistency_days" && isKnownFresh(recentProgress, context.generatedAt) && input.category === "consistency" && input.unit === "count" && typeof input.value === "number" && input.value >= 0 && validSignalSourcePath(input.sourceFactPath, "recentProgress")) drafts.push({
      signalType: "recent_study_consistency", severity: "info", importance: "low", entityId: input.key,
      reasonCode: "canonical_consistency_input_present", sourceFactPaths: [input.sourceFactPath, `signalInputs[key=${input.key}]`], facts: [fact, recentProgress as AnyFact], evidence: { studyDayCount: input.value },
    });
    const stalledMatch = /^material_progress_stalled:(.+)$/.exec(input.key);
    const materials = context.materials;
    const material = stalledMatch && isKnownFresh(materials, context.generatedAt) ? materials.value.find((item) => item.materialViewId === stalledMatch[1]) : undefined;
    if (stalledMatch && material && input.category === "material" && input.unit === "boolean" && input.value === true && validSignalSourcePath(input.sourceFactPath, "materials")) drafts.push({
      signalType: "material_progress_stalled", severity: "warning", importance: "high", subjectId: material.subjectId, entityId: stalledMatch[1]!,
      reasonCode: "canonical_material_stall_input_present", sourceFactPaths: [input.sourceFactPath, `signalInputs[key=${input.key}]`], facts: [fact, materials as AnyFact], evidence: { materialViewId: stalledMatch[1]!, progressState: material.progressState },
    });
  }
}

function importantFacts(context: CoachContextV1): readonly { path: string; fact: AnyFact; freshnessCategory: CoachSignalFreshnessCategoryV1; policyValid?: boolean }[] {
  return [
    { path: "today", fact: context.today as AnyFact, freshnessCategory: "today_week_task", policyValid: context.today.value === null || context.today.value.date === context.currentDate },
    { path: "week", fact: context.week as AnyFact, freshnessCategory: "today_week_task", policyValid: context.week.value === null || (context.currentDate >= context.week.value.startDate && context.currentDate <= context.week.value.endDate) },
    { path: "materials", fact: context.materials as AnyFact, freshnessCategory: "material_workload" },
    { path: "workload", fact: context.workload as AnyFact, freshnessCategory: "material_workload" },
    { path: "capacity", fact: context.capacity as AnyFact, freshnessCategory: "capacity", policyValid: context.capacity.value === null || (context.currentDate >= context.capacity.value.horizonStart && context.currentDate <= context.capacity.value.horizonEnd) },
    { path: "recentProgress", fact: context.recentProgress as AnyFact, freshnessCategory: "recent_progress" },
    { path: "nextWork", fact: context.nextWork as AnyFact, freshnessCategory: "material_workload" },
    ...(context.week.value ? [{ path: "week.value.progressPosition", fact: context.week.value.progressPosition as AnyFact, freshnessCategory: "today_week_task" as const }] : []),
    ...(context.planner.availability !== "not_applicable" ? [{ path: "planner", fact: context.planner as AnyFact, freshnessCategory: "planner_lifecycle" as const, policyValid: context.planner.value === null || Date.parse(context.generatedAt) < Date.parse(context.planner.value.expiresAt) }] : []),
  ];
}

function addDataQualitySignals(context: CoachContextV1, drafts: CandidateDraft[]): void {
  for (const item of importantFacts(context)) {
    const expired = isExpired(item.fact.freshness.expiresAt, context.generatedAt);
    if (item.fact.availability === "stale" || expired || item.policyValid === false) {
      drafts.push({
        signalType: "context_data_stale", severity: "warning", importance: "high", entityId: item.path,
        reasonCode: item.policyValid === false ? "freshness_policy_rejected" : "source_fact_stale", sourceFactPaths: [item.path], facts: [item.fact],
        evidence: { availability: item.fact.availability, freshnessCategory: item.freshnessCategory, sourceFactPath: item.path, unknownReason: item.fact.unknownReason },
        freshnessOverride: { ...item.fact.freshness, state: "stale" }, confidenceOverride: "low",
      });
    } else if (item.fact.availability === "unknown" || item.fact.availability === "blocked") {
      drafts.push({
        signalType: "important_truth_unknown", severity: "notice", importance: "medium", entityId: item.path,
        reasonCode: "required_truth_unavailable", sourceFactPaths: [item.path], facts: [item.fact],
        evidence: { availability: item.fact.availability, sourceFactPath: item.path, unknownReason: item.fact.unknownReason }, confidenceOverride: "low",
      });
    }
  }
}

export function buildCoachSignalSetV1(
  context: CoachContextV1,
  selection: CoachSignalSelectionV1 = {},
): CoachSignalSetV1 {
  if (selection.signalTypes?.some((type) => !COACH_SIGNAL_TYPES_V1.includes(type))) throw new Error("COACH_SIGNAL_TYPE_UNSUPPORTED");
  if (selection.subjectId !== undefined && !context.subjects.some((subject) => subject.subjectId === selection.subjectId)) throw new Error("COACH_SIGNAL_SUBJECT_OUT_OF_PROFILE");
  const drafts: CandidateDraft[] = [];
  addTodaySignals(context, drafts);
  addRecentProgressSignals(context, drafts);
  addSubjectWorkloadSignals(context, drafts);
  addWeekSignal(context, drafts);
  addPlannerSignal(context, drafts);
  addRegisteredInputSignals(context, drafts);
  addDataQualitySignals(context, drafts);
  const unique = new Map<string, CoachSignalCandidateV1>();
  for (const draft of drafts) {
    const candidate = materialize(context, draft);
    if (!unique.has(candidate.dedupeKey)) unique.set(candidate.dedupeKey, candidate);
  }
  const selectedTypes = selection.signalTypes ? new Set(selection.signalTypes) : null;
  const importanceOrder: Readonly<Record<CoachSignalImportanceV1, number>> = { high: 0, medium: 1, low: 2 };
  const all = [...unique.values()]
    .filter((candidate) => selectedTypes === null || selectedTypes.has(candidate.signalType))
    .filter((candidate) => selection.subjectId === undefined || candidate.subjectId === selection.subjectId)
    .filter((candidate) => selection.proactiveOnly !== true || candidate.eligibility.proactiveCandidate)
    .sort((left, right) => importanceOrder[left.importance] - importanceOrder[right.importance] || left.signalType.localeCompare(right.signalType) || left.dedupeKey.localeCompare(right.dedupeKey));
  const candidates = all.slice(0, COACH_SIGNAL_V1_LIMITS.candidates);
  const result: CoachSignalSetV1 = {
    version: COACH_SIGNAL_SET_V1_VERSION,
    sourceContext: { version: context.version, requestId: context.requestId },
    asOf: context.generatedAt,
    candidates,
    collection: { availableCount: all.length, returnedCount: candidates.length, limit: COACH_SIGNAL_V1_LIMITS.candidates, truncated: candidates.length < all.length },
    silenceEligible: true,
    authority: authority(),
  };
  const bytes = new TextEncoder().encode(JSON.stringify(result)).byteLength;
  if (bytes > COACH_SIGNAL_V1_LIMITS.serializedBytes) throw new Error(`COACH_SIGNAL_SET_V1_TOO_LARGE:${bytes}`);
  return deepFreeze(result);
}
