export const COACH_CONTEXT_V1_VERSION = "coach-context-v1" as const;

export const COACH_CONTEXT_V1_TRUTH_SOURCES = [
  "authenticated_user",
  "coach_context_builder_v1",
  "request_context",
  "server_clock",
  "user_profiles",
  "exam_profiles",
  "subjects_catalog",
  "weekly_plans",
  "planning_task_state_v1",
  "study_intent_ledger",
  "capacity_projection_v1",
  "canonical_material_truth_v1",
  "canonical_workload_engine_v1",
  "planner_v2_snapshot",
  "planner_v2_lifecycle",
  "deterministic_signal_input_v1",
] as const;

export type CoachContextV1TruthSource =
  (typeof COACH_CONTEXT_V1_TRUTH_SOURCES)[number];

export type CoachContextV1Availability =
  | "known"
  | "unknown"
  | "stale"
  | "blocked"
  | "not_applicable";

export type CoachContextV1Confidence =
  | "authoritative"
  | "high"
  | "medium"
  | "low"
  | "none";

export interface CoachContextV1Provenance {
  readonly source: CoachContextV1TruthSource;
  readonly recordIds: readonly string[];
  readonly asOf: string | null;
}

export interface CoachContextV1Freshness {
  readonly state: "fresh" | "stale" | "unknown" | "not_applicable";
  readonly asOf: string | null;
  readonly expiresAt: string | null;
}

interface CoachContextV1FactBase {
  readonly confidence: CoachContextV1Confidence;
  readonly provenance: readonly CoachContextV1Provenance[];
}

export type CoachContextV1Fact<T> =
  | (CoachContextV1FactBase & {
      readonly availability: "known";
      readonly value: T;
      readonly freshness: CoachContextV1Freshness & { readonly state: "fresh" };
      readonly unknownReason: null;
    })
  | (CoachContextV1FactBase & {
      readonly availability: "stale";
      readonly value: T | null;
      readonly freshness: CoachContextV1Freshness & { readonly state: "stale" };
      readonly unknownReason: string;
    })
  | (CoachContextV1FactBase & {
      readonly availability: "unknown";
      readonly value: null;
      readonly freshness: CoachContextV1Freshness & { readonly state: "unknown" };
      readonly unknownReason: string;
    })
  | (CoachContextV1FactBase & {
      readonly availability: "blocked";
      readonly value: null;
      readonly freshness: CoachContextV1Freshness & { readonly state: "fresh" | "unknown" };
      readonly unknownReason: string;
    })
  | (CoachContextV1FactBase & {
      readonly availability: "not_applicable";
      readonly value: null;
      readonly freshness: CoachContextV1Freshness & { readonly state: "not_applicable" };
      readonly unknownReason: string;
    });

export interface CoachContextV1Identity {
  readonly displayName: string | null;
  readonly examEditionId: string;
  readonly targetExamDate: string | null;
  readonly profileStatus: "active";
}

export type CoachContextV1TaskStatus =
  | "planned"
  | "ready"
  | "in_progress"
  | "partially_completed"
  | "completed"
  | "rescheduled"
  | "missed"
  | "cancelled";

export interface CoachContextV1Task {
  readonly taskId: string;
  readonly title: string;
  readonly subjectId: string;
  readonly curriculumNodeId: string | null;
  readonly resourceId: string | null;
  readonly canonicalWorkloadIdentity: string | null;
  readonly plannedDate: string | null;
  readonly status: CoachContextV1TaskStatus;
  readonly estimatedMinutes: number;
  readonly completedMinutes: number;
  readonly remainingMinutes: number;
  readonly protected: boolean;
}

export interface CoachContextV1TaskSummary {
  readonly totalTaskCount: number;
  readonly openTaskCount: number;
  readonly completedTaskCount: number;
  readonly partiallyCompletedTaskCount: number;
  readonly plannedMinutes: number;
  readonly completedMinutes: number;
  readonly remainingMinutes: number;
}

export interface CoachContextV1StudyAccounting {
  readonly actualMinutes: number;
  readonly plannedActualMinutes: number;
  readonly plannedCreditMinutes: number;
  readonly extraActualMinutes: number;
  readonly unknownIntentMinutes: number;
}

export interface CoachContextV1Today {
  readonly date: string;
  readonly weeklyPlanId: string;
  readonly planGenerationVersion: number;
  readonly summary: CoachContextV1TaskSummary;
  readonly study: CoachContextV1StudyAccounting;
  readonly tasks: readonly CoachContextV1Task[];
}

export type CoachContextV1ProgressPosition =
  | "ahead"
  | "on_track"
  | "behind";

export type CoachContextV1StudyIntentCoverage =
  | "sufficient"
  | "partial"
  | "unknown";

export interface CoachContextV1Week {
  readonly weeklyPlanId: string;
  readonly generationVersion: number;
  readonly startDate: string;
  readonly endDate: string;
  readonly status: "draft" | "active" | "completed" | "superseded" | "cancelled";
  readonly summary: CoachContextV1TaskSummary;
  readonly study: CoachContextV1StudyAccounting;
  readonly tasks: readonly CoachContextV1Task[];
  readonly studyIntentCoverage: CoachContextV1StudyIntentCoverage;
  readonly progressPosition: CoachContextV1Fact<CoachContextV1ProgressPosition>;
}

export interface CoachContextV1SubjectTaskSummary extends CoachContextV1TaskSummary {}

export interface CoachContextV1SubjectMaterialSummary {
  readonly totalMaterialViews: number;
  readonly completedMaterialViews: number;
  readonly inProgressMaterialViews: number;
  readonly unknownWorkloadViews: number;
}

export interface CoachContextV1SubjectSummary {
  readonly subjectId: string;
  readonly subjectName: string;
  readonly status: "active" | "paused" | "completed";
  readonly tasks: CoachContextV1Fact<CoachContextV1SubjectTaskSummary>;
  readonly study: CoachContextV1Fact<CoachContextV1StudyAccounting>;
  readonly material: CoachContextV1Fact<CoachContextV1SubjectMaterialSummary>;
}

export interface CoachContextV1CanonicalNextWork {
  readonly basis:
    | "approved_current_plan"
    | "canonical_material_continuation"
    | "planner_v2_preview";
  readonly canonicalWorkloadIdentity: string;
  readonly materialViewId: string;
  readonly taskId: string | null;
  readonly title: string;
  readonly subjectId: string;
  readonly resourceId: string;
  readonly plannedDate: string | null;
  readonly workloadMinutes: number;
}

export type CoachContextV1WorkloadAuthority =
  | "exact"
  | "calibrated"
  | "unknown";

export type CoachContextV1WorkloadConfidence =
  | "none"
  | "low"
  | "medium"
  | "high";

export interface CoachContextV1MaterialWorkload {
  readonly remainingAmount: number | null;
  readonly remainingUnit: "page" | "video_second";
  readonly estimatedMinutes: number | null;
  readonly authority: CoachContextV1WorkloadAuthority;
  readonly confidence: CoachContextV1WorkloadConfidence;
  readonly plannerEligible: boolean;
  readonly unresolvedReason: string | null;
}

export interface CoachContextV1MaterialProgress {
  readonly materialViewId: string;
  readonly sourceKind: "physical" | "youtube";
  readonly resourceId: string;
  readonly subjectId: string | null;
  readonly curriculumNodeId: string | null;
  readonly title: string;
  readonly unitType:
    | "video"
    | "page_range"
    | "test"
    | "question_set"
    | "chapter"
    | "reading"
    | "mock"
    | "other";
  readonly progressState: "not_started" | "in_progress" | "completed" | "skipped";
  readonly completedThroughPage: number | null;
  readonly durationSeconds: number | null;
  readonly watchedSeconds: number | null;
  readonly mappingStatus: "validated" | "ambiguous" | "missing";
  readonly mappingProvenance:
    | "reviewed_catalog"
    | "reviewed_mapping"
    | "trusted_import"
    | "user_confirmed"
    | "corrected"
    | "ai_candidate";
  readonly workload: CoachContextV1Fact<CoachContextV1MaterialWorkload>;
}

export interface CoachContextV1CanonicalWorkloadSummary {
  readonly totalMaterialViews: number;
  readonly exactWorkloadViews: number;
  readonly calibratedWorkloadViews: number;
  readonly unknownWorkloadViews: number;
  readonly plannerEligibleViews: number;
  readonly exactYoutubeRemainingMinutes: number;
  readonly physicalPagesWithCalibratedWorkload: number;
  readonly physicalPagesWithUnknownWorkload: number;
  readonly physicalEstimatedRemainingMinutes: number;
  readonly blockedByReason: Readonly<Record<string, number>>;
  readonly minutesBySubject: Readonly<Record<string, number>>;
  readonly minutesByResource: Readonly<Record<string, number>>;
}

export interface CoachContextV1CapacityDay {
  readonly date: string;
  readonly grossMinutes: number;
  readonly reserveMinutes: number;
  readonly planningMinutes: number;
  readonly alreadyStudiedMinutes: number;
  readonly protectedMinutes: number;
  readonly availableMinutes: number;
}

export interface CoachContextV1Capacity {
  readonly horizonStart: string;
  readonly horizonEnd: string;
  readonly days: readonly CoachContextV1CapacityDay[];
}

export interface CoachContextV1TaskProgressEvent {
  readonly taskId: string;
  readonly occurredAt: string;
  readonly status: CoachContextV1TaskStatus;
  readonly completedMinutes: number;
}

export interface CoachContextV1SessionProgress {
  readonly sessionId: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly actualMinutes: number;
  readonly accountingIntent: "planned" | "extra" | "unknown";
  readonly plannedCreditMinutes: number;
  readonly taskId: string | null;
  readonly subjectId: string | null;
  readonly resourceId: string | null;
  readonly entrySource: "live" | "retroactive" | "manual" | "telegram" | "web";
}

export interface CoachContextV1RecentProgress {
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly taskEvents: readonly CoachContextV1TaskProgressEvent[];
  readonly sessions: readonly CoachContextV1SessionProgress[];
  readonly transitions: readonly CoachContextV1StudyTransition[];
}

export type CoachContextV1StudyTransition =
  | {
      readonly kind: "substitution";
      readonly transitionId: string;
      readonly status: "proposed" | "applied" | "rejected" | "expired";
      readonly sourceTaskId: string;
      readonly replacementTaskId: string | null;
      readonly replacementSessionId: string | null;
      readonly sourceMinutesRelieved: number;
      readonly occurredAt: string;
    }
  | {
      readonly kind: "carryover";
      readonly transitionId: string;
      readonly status: "proposed" | "applied" | "rejected" | "expired";
      readonly sourceTaskId: string;
      readonly successorTaskId: string | null;
      readonly fromDate: string;
      readonly toDate: string;
      readonly remainingMinutes: number;
      readonly occurredAt: string;
    };

export type CoachContextV1PlannerExplanationFact =
  | { readonly kind: "day_capacity"; readonly date: string; readonly availableMinutes: number }
  | { readonly kind: "continuation_selected"; readonly canonicalWorkloadIdentity: string }
  | { readonly kind: "blocked_workload"; readonly canonicalWorkloadIdentity: string; readonly reason: string }
  | { readonly kind: "current_day_protected"; readonly date: string; readonly commitmentIds: readonly string[] }
  | { readonly kind: "unused_capacity"; readonly date: string; readonly unusedMinutes: number; readonly reason: "next_indivisible_workload_does_not_fit" }
  | { readonly kind: "replacement_scope"; readonly replaceableTaskIds: readonly string[]; readonly retainedTaskIds: readonly string[] };

export interface CoachContextV1PlannerState {
  readonly lifecycleVersion: string;
  readonly lifecycleState:
    | "generated"
    | "previewed"
    | "confirmed"
    | "applied"
    | "stale"
    | "rejected"
    | "expired";
  readonly weeklyPlanId: string;
  readonly proposalRecordId: string;
  readonly proposalId: string;
  readonly proposalFingerprint: string;
  readonly snapshotFingerprint: string;
  readonly plannerVersion: string;
  readonly expiresAt: string;
  readonly freshnessReasons: readonly string[];
  readonly summary: {
    readonly totalAvailableMinutes: number;
    readonly protectedMinutes: number;
    readonly newlyPlannedMinutes: number;
    readonly unusedMinutes: number;
    readonly unmetEligibleMinutes: number;
    readonly blockedDemandCount: number;
  };
  readonly differences: {
    readonly createCanonicalWorkloadIdentities: readonly string[];
    readonly retainedTaskIds: readonly string[];
    readonly replaceableTaskIds: readonly string[];
    readonly outsideScopeTaskIds: readonly string[];
  };
  readonly warnings: readonly string[];
  readonly explanationFacts: readonly CoachContextV1PlannerExplanationFact[];
  readonly explicitConfirmationRequired: true;
  readonly applyAvailable: false;
}

export interface CoachContextV1SignalInput {
  readonly key: string;
  readonly category:
    | "progress"
    | "plan_risk"
    | "capacity"
    | "material"
    | "consistency"
    | "data_quality";
  readonly value: number | boolean | string;
  readonly unit: "count" | "minutes" | "ratio" | "boolean" | "code";
  readonly sourceFactPath: string;
}

export interface CoachContextV1Unknown {
  readonly path: string;
  readonly availability: "unknown" | "stale" | "blocked";
  readonly reason: string;
  readonly sources: readonly CoachContextV1TruthSource[];
}

export interface CoachContextV1Input {
  readonly generatedAt: string;
  readonly requestId: string;
  readonly userId: string;
  readonly examProfileId: string;
  readonly locale: string;
  readonly timezone: string;
  readonly currentDate: string;
  readonly identity: CoachContextV1Fact<CoachContextV1Identity>;
  readonly today: CoachContextV1Fact<CoachContextV1Today>;
  readonly week: CoachContextV1Fact<CoachContextV1Week>;
  readonly subjects: readonly CoachContextV1SubjectSummary[];
  readonly nextWork: CoachContextV1Fact<CoachContextV1CanonicalNextWork>;
  readonly materials: CoachContextV1Fact<readonly CoachContextV1MaterialProgress[]>;
  readonly workload: CoachContextV1Fact<CoachContextV1CanonicalWorkloadSummary>;
  readonly capacity: CoachContextV1Fact<CoachContextV1Capacity>;
  readonly recentProgress: CoachContextV1Fact<CoachContextV1RecentProgress>;
  readonly planner: CoachContextV1Fact<CoachContextV1PlannerState>;
  readonly signalInputs: CoachContextV1Fact<readonly CoachContextV1SignalInput[]>;
}

export interface CoachContextV1 extends CoachContextV1Input {
  readonly version: typeof COACH_CONTEXT_V1_VERSION;
  readonly authority: {
    readonly mode: "read_only";
    readonly llmCallsAllowed: false;
    readonly dbWritesAllowed: false;
    readonly planningCalculationsAllowed: false;
    readonly workloadRecalculationAllowed: false;
    readonly taskMutationAllowed: false;
    readonly capacityMutationAllowed: false;
    readonly plannerConfirmationAllowed: false;
    readonly plannerApplyAllowed: false;
  };
  readonly unknowns: readonly CoachContextV1Unknown[];
  readonly provenance: readonly CoachContextV1Provenance[];
}

export const COACH_CONTEXT_V1_LIMITS = Object.freeze({
  todayTasks: 24,
  weekTasks: 64,
  subjects: 24,
  materials: 48,
  recentTaskEvents: 32,
  recentSessions: 24,
  recentTransitions: 16,
  signalInputs: 32,
  provenanceRecordIdsPerFact: 64,
  serializedBytes: 65_536,
});

export interface KnownCoachContextV1FactOptions {
  readonly provenance: readonly CoachContextV1Provenance[];
  readonly asOf: string;
  readonly expiresAt?: string | null;
  readonly confidence?: Exclude<CoachContextV1Confidence, "none">;
}

export function knownCoachContextV1Fact<T>(
  value: T,
  options: KnownCoachContextV1FactOptions,
): CoachContextV1Fact<T> {
  return {
    availability: "known",
    value,
    freshness: {
      state: "fresh",
      asOf: options.asOf,
      expiresAt: options.expiresAt ?? null,
    },
    confidence: options.confidence ?? "authoritative",
    provenance: options.provenance,
    unknownReason: null,
  };
}

export function unknownCoachContextV1Fact<T>(
  reason: string,
  sources: readonly CoachContextV1TruthSource[],
): CoachContextV1Fact<T> {
  return {
    availability: "unknown",
    value: null,
    freshness: { state: "unknown", asOf: null, expiresAt: null },
    confidence: "none",
    provenance: sources.map((source) => ({ source, recordIds: [], asOf: null })),
    unknownReason: reason,
  };
}

export function staleCoachContextV1Fact<T>(
  value: T | null,
  reason: string,
  options: Omit<KnownCoachContextV1FactOptions, "confidence"> & {
    readonly confidence?: CoachContextV1Confidence;
  },
): CoachContextV1Fact<T> {
  return {
    availability: "stale",
    value,
    freshness: {
      state: "stale",
      asOf: options.asOf,
      expiresAt: options.expiresAt ?? null,
    },
    confidence: options.confidence ?? "none",
    provenance: options.provenance,
    unknownReason: reason,
  };
}

export function blockedCoachContextV1Fact<T>(
  reason: string,
  sources: readonly CoachContextV1TruthSource[],
  asOf: string | null = null,
): CoachContextV1Fact<T> {
  return {
    availability: "blocked",
    value: null,
    freshness: {
      state: asOf === null ? "unknown" : "fresh",
      asOf,
      expiresAt: null,
    },
    confidence: "none",
    provenance: sources.map((source) => ({ source, recordIds: [], asOf })),
    unknownReason: reason,
  };
}

export function notApplicableCoachContextV1Fact<T>(
  reason: string,
  sources: readonly CoachContextV1TruthSource[],
): CoachContextV1Fact<T> {
  return {
    availability: "not_applicable",
    value: null,
    freshness: { state: "not_applicable", asOf: null, expiresAt: null },
    confidence: "none",
    provenance: sources.map((source) => ({ source, recordIds: [], asOf: null })),
    unknownReason: reason,
  };
}

function compareNullable(left: string | null, right: string | null): number {
  return (left ?? "~").localeCompare(right ?? "~");
}

function sortTasks(tasks: readonly CoachContextV1Task[]): readonly CoachContextV1Task[] {
  return [...tasks].sort((left, right) =>
    compareNullable(left.plannedDate, right.plannedDate) ||
    left.taskId.localeCompare(right.taskId));
}

function sortNumberRecord(record: Readonly<Record<string, number>>): Readonly<Record<string, number>> {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)));
}

function normalizeProvenance(
  provenance: readonly CoachContextV1Provenance[],
): readonly CoachContextV1Provenance[] {
  const normalized = [...provenance]
    .map((item) => ({
      ...item,
      recordIds: [...new Set(item.recordIds)].sort(),
    }))
    .sort((left, right) =>
      left.source.localeCompare(right.source) ||
      (left.asOf ?? "").localeCompare(right.asOf ?? "") ||
      left.recordIds.join("|").localeCompare(right.recordIds.join("|")));
  const unique = new Map<string, CoachContextV1Provenance>();
  for (const item of normalized) {
    unique.set(`${item.source}|${item.asOf ?? ""}|${item.recordIds.join("|")}`, item);
  }
  return [...unique.values()];
}

function normalizeFact<T>(
  fact: CoachContextV1Fact<T>,
  mapValue?: (value: T) => T,
): CoachContextV1Fact<T> {
  const copy = structuredClone(fact) as CoachContextV1Fact<T>;
  const value = copy.value !== null && mapValue ? mapValue(copy.value) : copy.value;
  return {
    ...copy,
    value,
    provenance: normalizeProvenance(copy.provenance),
  } as CoachContextV1Fact<T>;
}

function assertNonBlank(name: string, value: string): void {
  if (!value.trim()) throw new Error(`COACH_CONTEXT_V1_BLANK:${name}`);
}

function assertIsoDate(name: string, value: string): void {
  const parsed = new Date(`${value}T12:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`COACH_CONTEXT_V1_INVALID_DATE:${name}`);
  }
}

function assertTimestamp(name: string, value: string | null): void {
  if (value !== null && Number.isNaN(new Date(value).getTime())) {
    throw new Error(`COACH_CONTEXT_V1_INVALID_TIMESTAMP:${name}`);
  }
}

function assertFact(path: string, fact: CoachContextV1Fact<unknown>): void {
  if (!fact.provenance.length) throw new Error(`COACH_CONTEXT_V1_PROVENANCE_REQUIRED:${path}`);
  if (fact.provenance.some((item) => item.recordIds.length > COACH_CONTEXT_V1_LIMITS.provenanceRecordIdsPerFact)) {
    throw new Error(`COACH_CONTEXT_V1_TOO_MANY_PROVENANCE_RECORDS:${path}`);
  }
  for (const item of fact.provenance) assertTimestamp(`${path}.provenance.asOf`, item.asOf);
  assertTimestamp(`${path}.freshness.asOf`, fact.freshness.asOf);
  assertTimestamp(`${path}.freshness.expiresAt`, fact.freshness.expiresAt);
  if ((fact.availability === "unknown" || fact.availability === "stale" || fact.availability === "blocked" || fact.availability === "not_applicable") && !fact.unknownReason.trim()) {
    throw new Error(`COACH_CONTEXT_V1_UNKNOWN_REASON_REQUIRED:${path}`);
  }
  if (fact.availability === "known" && fact.value === null) {
    throw new Error(`COACH_CONTEXT_V1_KNOWN_VALUE_REQUIRED:${path}`);
  }
  if (fact.availability === "known" && (fact.freshness.asOf === null || fact.confidence === "none")) {
    throw new Error(`COACH_CONTEXT_V1_KNOWN_METADATA_REQUIRED:${path}`);
  }
}

function walkFacts(
  value: unknown,
  path: string,
  visit: (path: string, fact: CoachContextV1Fact<unknown>) => void,
): void {
  if (!value || typeof value !== "object") return;
  const object = value as Record<string, unknown>;
  if (
    typeof object.availability === "string" &&
    "freshness" in object &&
    "provenance" in object &&
    "unknownReason" in object
  ) {
    const fact = value as CoachContextV1Fact<unknown>;
    visit(path, fact);
    if (fact.value !== null) walkFacts(fact.value, `${path}.value`, visit);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkFacts(item, `${path}[${index}]`, visit));
    return;
  }
  for (const key of Object.keys(object).sort()) {
    walkFacts(object[key], path ? `${path}.${key}` : key, visit);
  }
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}

function assertCompact(input: {
  readonly today: CoachContextV1Fact<CoachContextV1Today>;
  readonly week: CoachContextV1Fact<CoachContextV1Week>;
  readonly subjects: readonly CoachContextV1SubjectSummary[];
  readonly materials: CoachContextV1Fact<readonly CoachContextV1MaterialProgress[]>;
  readonly recentProgress: CoachContextV1Fact<CoachContextV1RecentProgress>;
  readonly signalInputs: CoachContextV1Fact<readonly CoachContextV1SignalInput[]>;
}): void {
  const count = <T>(fact: CoachContextV1Fact<readonly T[]>): number => fact.value?.length ?? 0;
  if ((input.today.value?.tasks.length ?? 0) > COACH_CONTEXT_V1_LIMITS.todayTasks) throw new Error("COACH_CONTEXT_V1_TOO_MANY_TODAY_TASKS");
  if ((input.week.value?.tasks.length ?? 0) > COACH_CONTEXT_V1_LIMITS.weekTasks) throw new Error("COACH_CONTEXT_V1_TOO_MANY_WEEK_TASKS");
  if (input.subjects.length > COACH_CONTEXT_V1_LIMITS.subjects) throw new Error("COACH_CONTEXT_V1_TOO_MANY_SUBJECTS");
  if (count(input.materials) > COACH_CONTEXT_V1_LIMITS.materials) throw new Error("COACH_CONTEXT_V1_TOO_MANY_MATERIALS");
  if ((input.recentProgress.value?.taskEvents.length ?? 0) > COACH_CONTEXT_V1_LIMITS.recentTaskEvents) throw new Error("COACH_CONTEXT_V1_TOO_MANY_TASK_EVENTS");
  if ((input.recentProgress.value?.sessions.length ?? 0) > COACH_CONTEXT_V1_LIMITS.recentSessions) throw new Error("COACH_CONTEXT_V1_TOO_MANY_SESSIONS");
  if ((input.recentProgress.value?.transitions.length ?? 0) > COACH_CONTEXT_V1_LIMITS.recentTransitions) throw new Error("COACH_CONTEXT_V1_TOO_MANY_TRANSITIONS");
  if (count(input.signalInputs) > COACH_CONTEXT_V1_LIMITS.signalInputs) throw new Error("COACH_CONTEXT_V1_TOO_MANY_SIGNAL_INPUTS");
}

function assertPln002Boundary(week: CoachContextV1Fact<CoachContextV1Week>): void {
  if (
    week.value !== null &&
    week.value.studyIntentCoverage !== "sufficient" &&
    week.value.progressPosition.availability === "known"
  ) {
    throw new Error("COACH_CONTEXT_V1_PLN002_PROGRESS_POSITION_UNSUPPORTED");
  }
}

function assertNoInventedWorkloadFallback(
  materials: CoachContextV1Fact<readonly CoachContextV1MaterialProgress[]>,
): void {
  for (const material of materials.value ?? []) {
    if (
      material.workload.value !== null &&
      !["exact", "calibrated", "unknown"].includes(material.workload.value.authority)
    ) {
      throw new Error("COACH_CONTEXT_V1_WORKLOAD_FALLBACK_FORBIDDEN");
    }
    if (
      material.workload.value?.authority === "unknown" &&
      material.workload.value.estimatedMinutes !== null
    ) {
      throw new Error("COACH_CONTEXT_V1_UNKNOWN_WORKLOAD_MINUTES_FORBIDDEN");
    }
  }
}

export function buildCoachContextV1(input: CoachContextV1Input): CoachContextV1 {
  assertTimestamp("generatedAt", input.generatedAt);
  assertNonBlank("requestId", input.requestId);
  assertNonBlank("userId", input.userId);
  assertNonBlank("examProfileId", input.examProfileId);
  assertNonBlank("locale", input.locale);
  assertNonBlank("timezone", input.timezone);
  assertIsoDate("currentDate", input.currentDate);

  const normalized = {
    ...structuredClone(input),
    identity: normalizeFact(input.identity),
    today: normalizeFact(input.today, (today) => ({ ...today, tasks: sortTasks(today.tasks) })),
    week: normalizeFact(input.week, (week) => ({
      ...week,
      tasks: sortTasks(week.tasks),
      progressPosition: normalizeFact(week.progressPosition),
    })),
    subjects: [...input.subjects]
      .map((subject) => ({
        ...structuredClone(subject),
        tasks: normalizeFact(subject.tasks),
        study: normalizeFact(subject.study),
        material: normalizeFact(subject.material),
      }))
      .sort((left, right) => left.subjectName.localeCompare(right.subjectName, "tr") || left.subjectId.localeCompare(right.subjectId)),
    nextWork: normalizeFact(input.nextWork),
    materials: normalizeFact(input.materials, (materials) => [...materials]
      .map((material) => ({ ...material, workload: normalizeFact(material.workload) }))
      .sort((left, right) => left.resourceId.localeCompare(right.resourceId) || left.materialViewId.localeCompare(right.materialViewId))),
    workload: normalizeFact(input.workload, (workload) => ({
      ...workload,
      blockedByReason: sortNumberRecord(workload.blockedByReason),
      minutesBySubject: sortNumberRecord(workload.minutesBySubject),
      minutesByResource: sortNumberRecord(workload.minutesByResource),
    })),
    capacity: normalizeFact(input.capacity, (capacity) => ({
      ...capacity,
      days: [...capacity.days].sort((left, right) => left.date.localeCompare(right.date)),
    })),
    recentProgress: normalizeFact(input.recentProgress, (recent) => ({
      ...recent,
      taskEvents: [...recent.taskEvents].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.taskId.localeCompare(right.taskId)),
      sessions: [...recent.sessions].sort((left, right) => left.startedAt.localeCompare(right.startedAt) || left.sessionId.localeCompare(right.sessionId)),
      transitions: [...recent.transitions].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.transitionId.localeCompare(right.transitionId)),
    })),
    planner: normalizeFact(input.planner, (planner) => ({
      ...planner,
      freshnessReasons: [...planner.freshnessReasons].sort(),
      differences: {
        createCanonicalWorkloadIdentities: [...planner.differences.createCanonicalWorkloadIdentities].sort(),
        retainedTaskIds: [...planner.differences.retainedTaskIds].sort(),
        replaceableTaskIds: [...planner.differences.replaceableTaskIds].sort(),
        outsideScopeTaskIds: [...planner.differences.outsideScopeTaskIds].sort(),
      },
      warnings: [...planner.warnings].sort(),
      explanationFacts: [...planner.explanationFacts].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
    })),
    signalInputs: normalizeFact(input.signalInputs, (signals) => [...signals]
      .sort((left, right) => left.key.localeCompare(right.key) || left.sourceFactPath.localeCompare(right.sourceFactPath))),
  } satisfies CoachContextV1Input;

  assertCompact(normalized);
  assertPln002Boundary(normalized.week);
  assertNoInventedWorkloadFallback(normalized.materials);

  const unknowns: CoachContextV1Unknown[] = [];
  const provenance: CoachContextV1Provenance[] = [];
  walkFacts(normalized, "", (path, fact) => {
    assertFact(path, fact);
    provenance.push(...fact.provenance);
    if (fact.availability === "unknown" || fact.availability === "stale" || fact.availability === "blocked") {
      unknowns.push({
        path,
        availability: fact.availability,
        reason: fact.unknownReason,
        sources: [...new Set(fact.provenance.map((item) => item.source))].sort(),
      });
    }
  });

  const context: CoachContextV1 = {
    version: COACH_CONTEXT_V1_VERSION,
    ...normalized,
    authority: {
      mode: "read_only",
      llmCallsAllowed: false,
      dbWritesAllowed: false,
      planningCalculationsAllowed: false,
      workloadRecalculationAllowed: false,
      taskMutationAllowed: false,
      capacityMutationAllowed: false,
      plannerConfirmationAllowed: false,
      plannerApplyAllowed: false,
    },
    unknowns: unknowns.sort((left, right) => left.path.localeCompare(right.path)),
    provenance: normalizeProvenance(provenance),
  };

  const bytes = new TextEncoder().encode(JSON.stringify(context)).byteLength;
  if (bytes > COACH_CONTEXT_V1_LIMITS.serializedBytes) {
    throw new Error(`COACH_CONTEXT_V1_TOO_LARGE:${bytes}`);
  }
  return deepFreeze(context);
}
