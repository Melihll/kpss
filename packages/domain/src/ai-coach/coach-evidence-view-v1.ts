import type {
  CoachContextV1,
  CoachContextV1Availability,
  CoachContextV1CanonicalNextWork,
  CoachContextV1CanonicalWorkloadSummary,
  CoachContextV1Capacity,
  CoachContextV1Fact,
  CoachContextV1Identity,
  CoachContextV1MaterialProgress,
  CoachContextV1PlannerExplanationFact,
  CoachContextV1PlannerState,
  CoachContextV1Provenance,
  CoachContextV1ProgressPosition,
  CoachContextV1RecentProgress,
  CoachContextV1SessionProgress,
  CoachContextV1SignalInput,
  CoachContextV1StudyAccounting,
  CoachContextV1SubjectSummary,
  CoachContextV1Task,
  CoachContextV1TaskProgressEvent,
  CoachContextV1TaskSummary,
  CoachContextV1TruthSource,
  CoachContextV1Unknown,
} from "./coach-context-v1";

export const COACH_EVIDENCE_VIEW_V1_VERSION = "coach-evidence-view-v1" as const;
export const COACH_EVIDENCE_DETAIL_REQUEST_V1_VERSION = "coach-evidence-detail-request-v1" as const;
export const COACH_EVIDENCE_DETAIL_RESPONSE_V1_VERSION = "coach-evidence-detail-response-v1" as const;

export const COACH_EVIDENCE_SCOPES_V1 = [
  "today_explain",
  "week_progress",
  "subject_progress",
  "canonical_work",
  "capacity_status",
  "planner_explanation",
  "general_status",
  "proactive_candidate",
] as const;

export type CoachEvidenceScopeV1 = (typeof COACH_EVIDENCE_SCOPES_V1)[number];

export const COACH_EVIDENCE_CAPABILITIES_V1 = [
  "explain",
  "progress_analysis",
  "guide",
  "status_analysis",
  "planner_proposal_interpretation",
  "proactive_insight_candidate",
] as const;

export type CoachEvidenceCapabilityV1 =
  (typeof COACH_EVIDENCE_CAPABILITIES_V1)[number];

export const COACH_EVIDENCE_DETAIL_KINDS_V1 = [
  "today_tasks",
  "week_tasks",
  "subject_tasks",
  "recent_sessions",
  "subject_material_progress",
  "planner_explanation_detail",
] as const;

export type CoachEvidenceDetailKindV1 =
  (typeof COACH_EVIDENCE_DETAIL_KINDS_V1)[number];

export const COACH_EVIDENCE_SCOPE_CAPABILITY_V1 = Object.freeze({
  today_explain: "explain",
  week_progress: "progress_analysis",
  subject_progress: "progress_analysis",
  canonical_work: "guide",
  capacity_status: "status_analysis",
  planner_explanation: "planner_proposal_interpretation",
  general_status: "status_analysis",
  proactive_candidate: "proactive_insight_candidate",
} satisfies Readonly<Record<CoachEvidenceScopeV1, CoachEvidenceCapabilityV1>>);

type CoachEvidenceCollectionKeyV1 =
  | "today.tasks"
  | "subjects"
  | "canonicalWork.materials"
  | "capacity.days"
  | "recentProgress.taskEvents"
  | "recentProgress.sessions"
  | "recentProgress.transitions"
  | "planner.warnings"
  | "planner.explanationFacts"
  | "signalInputs";

interface CoachEvidenceScopeRuleV1 {
  readonly capability: CoachEvidenceCapabilityV1;
  readonly allowedContextPaths: readonly string[];
  readonly excludedContextPaths: readonly string[];
  readonly collectionLimits: Readonly<Partial<Record<CoachEvidenceCollectionKeyV1, number>>>;
  readonly detailKinds: readonly CoachEvidenceDetailKindV1[];
}

export const COACH_EVIDENCE_SCOPE_RULES_V1 = Object.freeze({
  today_explain: {
    capability: "explain",
    allowedContextPaths: ["identity", "today", "week.summary", "week.study", "week.studyIntentCoverage", "week.progressPosition", "nextWork"],
    excludedContextPaths: ["week.tasks", "subjects", "materials", "workload", "capacity", "recentProgress", "planner", "signalInputs"],
    collectionLimits: { "today.tasks": 8 },
    detailKinds: ["today_tasks", "recent_sessions"],
  },
  week_progress: {
    capability: "progress_analysis",
    allowedContextPaths: ["week", "subjects", "capacity", "recentProgress"],
    excludedContextPaths: ["identity", "today.tasks", "week.tasks", "nextWork", "materials", "workload", "planner", "signalInputs"],
    collectionLimits: { subjects: 12, "capacity.days": 7, "recentProgress.taskEvents": 8, "recentProgress.sessions": 6, "recentProgress.transitions": 4 },
    detailKinds: ["week_tasks", "subject_tasks", "recent_sessions"],
  },
  subject_progress: {
    capability: "progress_analysis",
    allowedContextPaths: ["subjects[selected]", "week", "materials[selected]", "recentProgress[selected]", "nextWork[selected]"],
    excludedContextPaths: ["identity", "today.tasks", "week.tasks", "workload.minutesByResource", "capacity", "planner", "signalInputs"],
    collectionLimits: { subjects: 1, "canonicalWork.materials": 6, "recentProgress.taskEvents": 6, "recentProgress.sessions": 6, "recentProgress.transitions": 4 },
    detailKinds: ["subject_tasks", "recent_sessions", "subject_material_progress"],
  },
  canonical_work: {
    capability: "guide",
    allowedContextPaths: ["nextWork", "workload", "materials"],
    excludedContextPaths: ["identity", "today", "week", "subjects", "capacity", "recentProgress", "planner", "signalInputs"],
    collectionLimits: { "canonicalWork.materials": 8 },
    detailKinds: ["subject_material_progress"],
  },
  capacity_status: {
    capability: "status_analysis",
    allowedContextPaths: ["today.summary", "today.study", "week.summary", "capacity"],
    excludedContextPaths: ["identity", "today.tasks", "week.tasks", "subjects", "nextWork", "materials", "workload", "recentProgress", "planner", "signalInputs"],
    collectionLimits: { "capacity.days": 7 },
    detailKinds: ["today_tasks", "week_tasks"],
  },
  planner_explanation: {
    capability: "planner_proposal_interpretation",
    allowedContextPaths: ["planner"],
    excludedContextPaths: ["identity", "today", "week", "subjects", "nextWork", "materials", "workload", "capacity", "recentProgress", "signalInputs"],
    collectionLimits: { "planner.warnings": 8, "planner.explanationFacts": 12 },
    detailKinds: ["planner_explanation_detail"],
  },
  general_status: {
    capability: "status_analysis",
    allowedContextPaths: ["identity", "today.summary", "today.study", "week", "subjects", "nextWork", "workload", "capacity"],
    excludedContextPaths: ["today.tasks", "week.tasks", "materials", "recentProgress", "planner", "signalInputs"],
    collectionLimits: { subjects: 8, "capacity.days": 7 },
    detailKinds: ["today_tasks", "week_tasks", "subject_tasks", "recent_sessions", "subject_material_progress"],
  },
  proactive_candidate: {
    capability: "proactive_insight_candidate",
    allowedContextPaths: ["today.summary", "week", "subjects", "workload", "capacity", "signalInputs"],
    excludedContextPaths: ["identity", "today.tasks", "week.tasks", "nextWork", "materials", "recentProgress", "planner"],
    collectionLimits: { subjects: 8, "capacity.days": 7, signalInputs: 12 },
    detailKinds: ["today_tasks", "week_tasks", "subject_tasks", "recent_sessions", "subject_material_progress"],
  },
} satisfies Readonly<Record<CoachEvidenceScopeV1, CoachEvidenceScopeRuleV1>>);

export const COACH_EVIDENCE_VIEW_V1_LIMITS = Object.freeze({
  serializedBytes: 32_768,
  provenanceRecordIds: 64,
  unknowns: 32,
  collections: 16,
});

export const COACH_EVIDENCE_DETAIL_V1_LIMITS = Object.freeze({
  today_tasks: 24,
  week_tasks: 24,
  subject_tasks: 16,
  recent_sessions: 12,
  subject_material_progress: 16,
  planner_explanation_detail: 24,
  serializedBytes: 16_384,
} satisfies Readonly<Record<CoachEvidenceDetailKindV1 | "serializedBytes", number>>);

export interface CoachEvidenceSelectionV1 {
  readonly scope: CoachEvidenceScopeV1;
  readonly capability: CoachEvidenceCapabilityV1;
  readonly subjectId?: string;
}

export interface CoachEvidenceTodayV1 {
  readonly date: string;
  readonly weeklyPlanId: string;
  readonly planGenerationVersion: number;
  readonly summary: CoachContextV1TaskSummary;
  readonly study: CoachContextV1StudyAccounting;
  readonly tasks: readonly CoachContextV1Task[];
}

export interface CoachEvidenceWeekV1 {
  readonly weeklyPlanId: string;
  readonly generationVersion: number;
  readonly startDate: string;
  readonly endDate: string;
  readonly status: "draft" | "active" | "completed" | "superseded" | "cancelled";
  readonly summary: CoachContextV1TaskSummary;
  readonly study: CoachContextV1StudyAccounting;
  readonly studyIntentCoverage: "sufficient" | "partial" | "unknown";
  readonly progressPosition: CoachContextV1Fact<CoachContextV1ProgressPosition>;
}

export interface CoachEvidenceWorkloadV1 {
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
}

export interface CoachEvidenceSubjectWorkloadV1 {
  readonly minutesBySubject: Readonly<Record<string, number>>;
}

export interface CoachEvidencePlannerV1 {
  readonly lifecycleVersion: string;
  readonly lifecycleState: CoachContextV1PlannerState["lifecycleState"];
  readonly weeklyPlanId: string;
  readonly proposalRecordId: string;
  readonly proposalId: string;
  readonly proposalFingerprint: string;
  readonly snapshotFingerprint: string;
  readonly plannerVersion: string;
  readonly expiresAt: string;
  readonly freshnessReasons: readonly string[];
  readonly summary: CoachContextV1PlannerState["summary"];
  readonly warnings: readonly string[];
  readonly explanationFacts: readonly CoachContextV1PlannerExplanationFact[];
  readonly explicitConfirmationRequired: true;
  readonly applyAvailable: false;
}

export interface CoachEvidenceCollectionStateV1 {
  readonly path: CoachEvidenceCollectionKeyV1;
  readonly availableCount: number;
  readonly returnedCount: number;
  readonly limit: number;
  readonly truncated: boolean;
}

export interface CoachEvidenceDetailReferenceV1 {
  readonly kind: CoachEvidenceDetailKindV1;
  readonly subjectIdRequired: boolean;
}

export interface CoachEvidenceSectionsV1 {
  readonly identity?: CoachContextV1Fact<CoachContextV1Identity>;
  readonly today?: CoachContextV1Fact<CoachEvidenceTodayV1>;
  readonly week?: CoachContextV1Fact<CoachEvidenceWeekV1>;
  readonly subjects?: readonly CoachContextV1SubjectSummary[];
  readonly canonicalWork?: {
    readonly next?: CoachContextV1Fact<CoachContextV1CanonicalNextWork>;
    readonly workload?: CoachContextV1Fact<CoachEvidenceWorkloadV1 | CoachEvidenceSubjectWorkloadV1>;
    readonly materials?: CoachContextV1Fact<readonly CoachContextV1MaterialProgress[]>;
  };
  readonly capacity?: CoachContextV1Fact<CoachContextV1Capacity>;
  readonly recentProgress?: CoachContextV1Fact<CoachContextV1RecentProgress>;
  readonly planner?: CoachContextV1Fact<CoachEvidencePlannerV1>;
  readonly signalInputs?: CoachContextV1Fact<readonly CoachContextV1SignalInput[]>;
}

export interface CoachEvidenceViewV1 {
  readonly version: typeof COACH_EVIDENCE_VIEW_V1_VERSION;
  readonly sourceContext: {
    readonly version: CoachContextV1["version"];
    readonly requestId: string;
  };
  readonly scope: CoachEvidenceScopeV1;
  readonly capability: CoachEvidenceCapabilityV1;
  readonly subjectId: string | null;
  readonly asOf: string;
  readonly timezone: string;
  readonly currentDate: string;
  readonly evidence: CoachEvidenceSectionsV1;
  readonly collections: readonly CoachEvidenceCollectionStateV1[];
  readonly unknowns: readonly CoachContextV1Unknown[];
  readonly provenance: readonly CoachContextV1Provenance[];
  readonly availableDetails: readonly CoachEvidenceDetailReferenceV1[];
  readonly authority: {
    readonly mode: "evidence_only_read_only";
    readonly dbWritesAllowed: false;
    readonly arbitraryQueryAllowed: false;
    readonly newTruthCalculationAllowed: false;
    readonly workloadRecalculationAllowed: false;
    readonly plannerPreviewRecomputationAllowed: false;
    readonly taskMutationAllowed: false;
    readonly capacityMutationAllowed: false;
    readonly plannerConfirmationAllowed: false;
    readonly plannerApplyAllowed: false;
    readonly llmCallsAllowed: false;
    readonly providerCallsAllowed: false;
  };
}

function mapFact<T, U>(fact: CoachContextV1Fact<T>, mapValue: (value: T) => U): CoachContextV1Fact<U> {
  const cloned = structuredClone(fact);
  if (cloned.availability === "known") return { ...cloned, value: mapValue(cloned.value) };
  if (cloned.availability === "stale") {
    return { ...cloned, value: cloned.value === null ? null : mapValue(cloned.value) };
  }
  return cloned as CoachContextV1Fact<U>;
}

function limitCollection<T>(
  items: readonly T[],
  path: CoachEvidenceCollectionKeyV1,
  limit: number,
  collections: CoachEvidenceCollectionStateV1[],
): readonly T[] {
  const selected = items.slice(0, limit);
  collections.push({
    path,
    availableCount: items.length,
    returnedCount: selected.length,
    limit,
    truncated: selected.length < items.length,
  });
  return selected;
}

function projectToday(
  context: CoachContextV1,
  taskLimit: number,
  collections: CoachEvidenceCollectionStateV1[],
): CoachContextV1Fact<CoachEvidenceTodayV1> {
  return mapFact(context.today, (today) => ({
    date: today.date,
    weeklyPlanId: today.weeklyPlanId,
    planGenerationVersion: today.planGenerationVersion,
    summary: structuredClone(today.summary),
    study: structuredClone(today.study),
    tasks: limitCollection(today.tasks, "today.tasks", taskLimit, collections),
  }));
}

function projectWeek(context: CoachContextV1): CoachContextV1Fact<CoachEvidenceWeekV1> {
  return mapFact(context.week, (week) => ({
    weeklyPlanId: week.weeklyPlanId,
    generationVersion: week.generationVersion,
    startDate: week.startDate,
    endDate: week.endDate,
    status: week.status,
    summary: structuredClone(week.summary),
    study: structuredClone(week.study),
    studyIntentCoverage: week.studyIntentCoverage,
    progressPosition: structuredClone(week.progressPosition),
  }));
}

function projectWorkload(context: CoachContextV1): CoachContextV1Fact<CoachEvidenceWorkloadV1> {
  return mapFact(context.workload, (workload: CoachContextV1CanonicalWorkloadSummary) => ({
    totalMaterialViews: workload.totalMaterialViews,
    exactWorkloadViews: workload.exactWorkloadViews,
    calibratedWorkloadViews: workload.calibratedWorkloadViews,
    unknownWorkloadViews: workload.unknownWorkloadViews,
    plannerEligibleViews: workload.plannerEligibleViews,
    exactYoutubeRemainingMinutes: workload.exactYoutubeRemainingMinutes,
    physicalPagesWithCalibratedWorkload: workload.physicalPagesWithCalibratedWorkload,
    physicalPagesWithUnknownWorkload: workload.physicalPagesWithUnknownWorkload,
    physicalEstimatedRemainingMinutes: workload.physicalEstimatedRemainingMinutes,
    blockedByReason: structuredClone(workload.blockedByReason),
    minutesBySubject: structuredClone(workload.minutesBySubject),
  }));
}

function projectCapacity(
  context: CoachContextV1,
  limit: number,
  collections: CoachEvidenceCollectionStateV1[],
): CoachContextV1Fact<CoachContextV1Capacity> {
  return mapFact(context.capacity, (capacity) => ({
    horizonStart: capacity.horizonStart,
    horizonEnd: capacity.horizonEnd,
    days: limitCollection(capacity.days, "capacity.days", limit, collections),
  }));
}

function projectRecent(
  context: CoachContextV1,
  limits: { taskEvents: number; sessions: number; transitions: number },
  collections: CoachEvidenceCollectionStateV1[],
  subjectId: string | null = null,
): CoachContextV1Fact<CoachContextV1RecentProgress> {
  return mapFact(context.recentProgress, (recent) => {
    const taskIds = subjectId === null
      ? null
      : new Set(context.week.value?.tasks.filter((task) => task.subjectId === subjectId).map((task) => task.taskId) ?? []);
    const taskEvents = subjectId === null ? recent.taskEvents : recent.taskEvents.filter((event) => taskIds?.has(event.taskId));
    const sessions = subjectId === null ? recent.sessions : recent.sessions.filter((session) => session.subjectId === subjectId);
    const transitions = subjectId === null ? recent.transitions : recent.transitions.filter((transition) => taskIds?.has(transition.sourceTaskId));
    return {
      windowStart: recent.windowStart,
      windowEnd: recent.windowEnd,
      taskEvents: limitCollection(taskEvents, "recentProgress.taskEvents", limits.taskEvents, collections),
      sessions: limitCollection(sessions, "recentProgress.sessions", limits.sessions, collections),
      transitions: limitCollection(transitions, "recentProgress.transitions", limits.transitions, collections),
    };
  });
}

function projectPlanner(
  context: CoachContextV1,
  warningLimit: number,
  explanationLimit: number,
  collections: CoachEvidenceCollectionStateV1[],
): CoachContextV1Fact<CoachEvidencePlannerV1> {
  return mapFact(context.planner, (planner) => ({
    lifecycleVersion: planner.lifecycleVersion,
    lifecycleState: planner.lifecycleState,
    weeklyPlanId: planner.weeklyPlanId,
    proposalRecordId: planner.proposalRecordId,
    proposalId: planner.proposalId,
    proposalFingerprint: planner.proposalFingerprint,
    snapshotFingerprint: planner.snapshotFingerprint,
    plannerVersion: planner.plannerVersion,
    expiresAt: planner.expiresAt,
    freshnessReasons: structuredClone(planner.freshnessReasons),
    summary: structuredClone(planner.summary),
    warnings: limitCollection(planner.warnings, "planner.warnings", warningLimit, collections),
    explanationFacts: limitCollection(planner.explanationFacts, "planner.explanationFacts", explanationLimit, collections),
    explicitConfirmationRequired: true,
    applyAvailable: false,
  }));
}

function normalizeProvenance(items: readonly CoachContextV1Provenance[]): readonly CoachContextV1Provenance[] {
  const unique = new Map<string, CoachContextV1Provenance>();
  for (const item of items) {
    const normalized = {
      source: item.source,
      recordIds: [...new Set(item.recordIds)].sort(),
      asOf: item.asOf,
    };
    unique.set(`${normalized.source}|${normalized.asOf ?? ""}|${normalized.recordIds.join("|")}`, normalized);
  }
  return [...unique.values()].sort((left, right) =>
    left.source.localeCompare(right.source) ||
    (left.asOf ?? "").localeCompare(right.asOf ?? "") ||
    left.recordIds.join("|").localeCompare(right.recordIds.join("|")));
}

function collectFactMetadata(value: unknown): {
  unknowns: CoachContextV1Unknown[];
  provenance: CoachContextV1Provenance[];
} {
  const unknowns: CoachContextV1Unknown[] = [];
  const provenance: CoachContextV1Provenance[] = [];
  const walk = (candidate: unknown, path: string): void => {
    if (!candidate || typeof candidate !== "object") return;
    const object = candidate as Record<string, unknown>;
    if (typeof object.availability === "string" && "freshness" in object && Array.isArray(object.provenance)) {
      const fact = candidate as CoachContextV1Fact<unknown>;
      provenance.push(...fact.provenance);
      if (fact.availability === "unknown" || fact.availability === "stale" || fact.availability === "blocked") {
        unknowns.push({
          path,
          availability: fact.availability as Exclude<CoachContextV1Availability, "known" | "not_applicable">,
          reason: fact.unknownReason,
          sources: [...new Set(fact.provenance.map((item) => item.source))].sort() as CoachContextV1TruthSource[],
        });
      }
      if (fact.value !== null) walk(fact.value, `${path}.value`);
      return;
    }
    if (Array.isArray(candidate)) {
      candidate.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }
    for (const key of Object.keys(object).sort()) walk(object[key], path ? `${path}.${key}` : key);
  };
  walk(value, "evidence");
  return {
    unknowns: unknowns.sort((left, right) => left.path.localeCompare(right.path)),
    provenance: [...normalizeProvenance(provenance)],
  };
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}

function assertSubjectSelection(context: CoachContextV1, selection: CoachEvidenceSelectionV1): string | null {
  if (selection.scope !== "subject_progress") {
    if (selection.subjectId !== undefined) throw new Error("COACH_EVIDENCE_SUBJECT_NOT_ALLOWED_FOR_SCOPE");
    return null;
  }
  if (!selection.subjectId?.trim()) throw new Error("COACH_EVIDENCE_SUBJECT_REQUIRED");
  if (!context.subjects.some((subject) => subject.subjectId === selection.subjectId)) {
    throw new Error("COACH_EVIDENCE_SUBJECT_OUT_OF_PROFILE");
  }
  return selection.subjectId;
}

export function projectCoachEvidenceViewV1(
  context: CoachContextV1,
  selection: CoachEvidenceSelectionV1,
): CoachEvidenceViewV1 {
  if (!COACH_EVIDENCE_SCOPES_V1.includes(selection.scope)) throw new Error("COACH_EVIDENCE_SCOPE_UNSUPPORTED");
  if (!COACH_EVIDENCE_CAPABILITIES_V1.includes(selection.capability)) throw new Error("COACH_EVIDENCE_CAPABILITY_UNSUPPORTED");
  const expectedCapability = COACH_EVIDENCE_SCOPE_CAPABILITY_V1[selection.scope];
  if (selection.capability !== expectedCapability) throw new Error("COACH_EVIDENCE_SCOPE_CAPABILITY_MISMATCH");
  const subjectId = assertSubjectSelection(context, selection);
  const rule: CoachEvidenceScopeRuleV1 = COACH_EVIDENCE_SCOPE_RULES_V1[selection.scope];
  const collections: CoachEvidenceCollectionStateV1[] = [];
  let evidence: CoachEvidenceSectionsV1;

  switch (selection.scope) {
    case "today_explain":
      evidence = {
        identity: structuredClone(context.identity),
        today: projectToday(context, rule.collectionLimits["today.tasks"]!, collections),
        week: projectWeek(context),
        canonicalWork: {
          next: structuredClone(context.nextWork),
        },
      };
      break;
    case "week_progress":
      evidence = {
        week: projectWeek(context),
        subjects: limitCollection(context.subjects, "subjects", rule.collectionLimits.subjects!, collections),
        capacity: projectCapacity(context, rule.collectionLimits["capacity.days"]!, collections),
        recentProgress: projectRecent(context, {
          taskEvents: rule.collectionLimits["recentProgress.taskEvents"]!,
          sessions: rule.collectionLimits["recentProgress.sessions"]!,
          transitions: rule.collectionLimits["recentProgress.transitions"]!,
        }, collections),
      };
      break;
    case "subject_progress": {
      const selectedSubjects = context.subjects.filter((subject) => subject.subjectId === subjectId);
      const selectedMaterials = mapFact(context.materials, (materials) => materials.filter((material) => material.subjectId === subjectId));
      evidence = {
        week: projectWeek(context),
        subjects: limitCollection(selectedSubjects, "subjects", 1, collections),
        canonicalWork: {
          ...(context.nextWork.availability !== "known" || context.nextWork.value.subjectId === subjectId
            ? { next: structuredClone(context.nextWork) }
            : {}),
          workload: mapFact(context.workload, (workload) => ({
            minutesBySubject: Object.fromEntries(Object.entries(workload.minutesBySubject).filter(([key]) => key === subjectId)),
          })),
          materials: mapFact(selectedMaterials, (materials) => limitCollection(materials, "canonicalWork.materials", rule.collectionLimits["canonicalWork.materials"]!, collections)),
        },
        recentProgress: projectRecent(context, {
          taskEvents: rule.collectionLimits["recentProgress.taskEvents"]!,
          sessions: rule.collectionLimits["recentProgress.sessions"]!,
          transitions: rule.collectionLimits["recentProgress.transitions"]!,
        }, collections, subjectId),
      };
      break;
    }
    case "canonical_work":
      evidence = {
        canonicalWork: {
          next: structuredClone(context.nextWork),
          workload: projectWorkload(context),
          materials: mapFact(context.materials, (materials) => limitCollection(materials, "canonicalWork.materials", rule.collectionLimits["canonicalWork.materials"]!, collections)),
        },
      };
      break;
    case "capacity_status":
      evidence = {
        today: projectToday(context, 0, collections),
        week: projectWeek(context),
        capacity: projectCapacity(context, rule.collectionLimits["capacity.days"]!, collections),
      };
      break;
    case "planner_explanation":
      evidence = {
        planner: projectPlanner(context, rule.collectionLimits["planner.warnings"]!, rule.collectionLimits["planner.explanationFacts"]!, collections),
      };
      break;
    case "general_status":
      evidence = {
        identity: structuredClone(context.identity),
        today: projectToday(context, 0, collections),
        week: projectWeek(context),
        subjects: limitCollection(context.subjects, "subjects", rule.collectionLimits.subjects!, collections),
        canonicalWork: {
          next: structuredClone(context.nextWork),
          workload: projectWorkload(context),
        },
        capacity: projectCapacity(context, rule.collectionLimits["capacity.days"]!, collections),
      };
      break;
    case "proactive_candidate":
      evidence = {
        today: projectToday(context, 0, collections),
        week: projectWeek(context),
        subjects: limitCollection(context.subjects, "subjects", rule.collectionLimits.subjects!, collections),
        canonicalWork: {
          workload: projectWorkload(context),
        },
        capacity: projectCapacity(context, rule.collectionLimits["capacity.days"]!, collections),
        signalInputs: mapFact(context.signalInputs, (signals) => limitCollection(signals, "signalInputs", rule.collectionLimits.signalInputs!, collections)),
      };
      break;
  }

  const metadata = collectFactMetadata(evidence);
  if (collections.length > COACH_EVIDENCE_VIEW_V1_LIMITS.collections) {
    throw new Error("COACH_EVIDENCE_TOO_MANY_COLLECTIONS");
  }
  if (metadata.unknowns.length > COACH_EVIDENCE_VIEW_V1_LIMITS.unknowns) {
    throw new Error("COACH_EVIDENCE_TOO_MANY_UNKNOWNS");
  }
  if (metadata.provenance.some((item) => item.recordIds.length > COACH_EVIDENCE_VIEW_V1_LIMITS.provenanceRecordIds)) {
    throw new Error("COACH_EVIDENCE_TOO_MANY_PROVENANCE_RECORDS");
  }
  const view: CoachEvidenceViewV1 = {
    version: COACH_EVIDENCE_VIEW_V1_VERSION,
    sourceContext: { version: context.version, requestId: context.requestId },
    scope: selection.scope,
    capability: selection.capability,
    subjectId,
    asOf: context.generatedAt,
    timezone: context.timezone,
    currentDate: context.currentDate,
    evidence,
    collections: collections.sort((left, right) => left.path.localeCompare(right.path)),
    unknowns: metadata.unknowns,
    provenance: metadata.provenance,
    availableDetails: rule.detailKinds.map((kind) => ({
      kind,
      subjectIdRequired: kind === "subject_tasks" || kind === "subject_material_progress",
    })),
    authority: {
      mode: "evidence_only_read_only",
      dbWritesAllowed: false,
      arbitraryQueryAllowed: false,
      newTruthCalculationAllowed: false,
      workloadRecalculationAllowed: false,
      plannerPreviewRecomputationAllowed: false,
      taskMutationAllowed: false,
      capacityMutationAllowed: false,
      plannerConfirmationAllowed: false,
      plannerApplyAllowed: false,
      llmCallsAllowed: false,
      providerCallsAllowed: false,
    },
  };
  const bytes = new TextEncoder().encode(JSON.stringify(view)).byteLength;
  if (bytes > COACH_EVIDENCE_VIEW_V1_LIMITS.serializedBytes) {
    throw new Error(`COACH_EVIDENCE_VIEW_V1_TOO_LARGE:${bytes}`);
  }
  return deepFreeze(view);
}

export interface CoachEvidenceDetailRequestV1 {
  readonly version: typeof COACH_EVIDENCE_DETAIL_REQUEST_V1_VERSION;
  readonly kind: CoachEvidenceDetailKindV1;
  readonly userId: string;
  readonly examProfileId: string;
  readonly subjectId?: string;
}

export interface CoachEvidencePlannerDetailV1 {
  readonly lifecycleState: CoachContextV1PlannerState["lifecycleState"];
  readonly weeklyPlanId: string;
  readonly proposalRecordId: string;
  readonly proposalId: string;
  readonly proposalFingerprint: string;
  readonly snapshotFingerprint: string;
  readonly plannerVersion: string;
  readonly expiresAt: string;
  readonly freshnessReasons: readonly string[];
  readonly summary: CoachContextV1PlannerState["summary"];
  readonly differences: CoachContextV1PlannerState["differences"];
  readonly warnings: readonly string[];
  readonly explanationFacts: readonly CoachContextV1PlannerExplanationFact[];
  readonly explicitConfirmationRequired: true;
  readonly applyAvailable: false;
}

export type CoachEvidenceDetailValueV1 =
  | readonly CoachContextV1Task[]
  | readonly CoachContextV1SessionProgress[]
  | readonly CoachContextV1MaterialProgress[]
  | CoachEvidencePlannerDetailV1;

export interface CoachEvidenceDetailResponseV1 {
  readonly version: typeof COACH_EVIDENCE_DETAIL_RESPONSE_V1_VERSION;
  readonly sourceContext: {
    readonly version: CoachContextV1["version"];
    readonly requestId: string;
  };
  readonly kind: CoachEvidenceDetailKindV1;
  readonly subjectId: string | null;
  readonly asOf: string;
  readonly timezone: string;
  readonly payload: CoachContextV1Fact<CoachEvidenceDetailValueV1>;
  readonly collection: {
    readonly availableCount: number;
    readonly returnedCount: number;
    readonly limit: number;
    readonly truncated: boolean;
  };
  readonly provenance: readonly CoachContextV1Provenance[];
  readonly authority: CoachEvidenceViewV1["authority"];
}

function assertDetailScope(context: CoachContextV1, request: CoachEvidenceDetailRequestV1): string | null {
  if (request.version !== COACH_EVIDENCE_DETAIL_REQUEST_V1_VERSION) throw new Error("COACH_EVIDENCE_DETAIL_VERSION_UNSUPPORTED");
  if (!COACH_EVIDENCE_DETAIL_KINDS_V1.includes(request.kind)) throw new Error("COACH_EVIDENCE_DETAIL_KIND_UNSUPPORTED");
  if (request.userId !== context.userId) throw new Error("COACH_EVIDENCE_DETAIL_USER_SCOPE_MISMATCH");
  if (request.examProfileId !== context.examProfileId) throw new Error("COACH_EVIDENCE_DETAIL_PROFILE_SCOPE_MISMATCH");
  const subjectRequired = request.kind === "subject_tasks" || request.kind === "subject_material_progress";
  if (subjectRequired) {
    if (!request.subjectId?.trim()) throw new Error("COACH_EVIDENCE_DETAIL_SUBJECT_REQUIRED");
    if (!context.subjects.some((subject) => subject.subjectId === request.subjectId)) {
      throw new Error("COACH_EVIDENCE_DETAIL_SUBJECT_OUT_OF_PROFILE");
    }
    return request.subjectId;
  }
  if (request.subjectId !== undefined) throw new Error("COACH_EVIDENCE_DETAIL_SUBJECT_NOT_ALLOWED");
  return null;
}

export function resolveCoachEvidenceDetailV1(
  context: CoachContextV1,
  request: CoachEvidenceDetailRequestV1,
): CoachEvidenceDetailResponseV1 {
  const subjectId = assertDetailScope(context, request);
  const limit = COACH_EVIDENCE_DETAIL_V1_LIMITS[request.kind];
  let availableCount = 0;
  let returnedCount = 0;
  let payload: CoachContextV1Fact<CoachEvidenceDetailValueV1>;

  switch (request.kind) {
    case "today_tasks":
      payload = mapFact(context.today, (today) => {
        availableCount = today.tasks.length;
        const selected = today.tasks.slice(0, limit);
        returnedCount = selected.length;
        return selected;
      });
      break;
    case "week_tasks":
      payload = mapFact(context.week, (week) => {
        availableCount = week.tasks.length;
        const selected = week.tasks.slice(0, limit);
        returnedCount = selected.length;
        return selected;
      });
      break;
    case "subject_tasks":
      payload = mapFact(context.week, (week) => {
        const tasks = week.tasks.filter((task) => task.subjectId === subjectId);
        availableCount = tasks.length;
        const selected = tasks.slice(0, limit);
        returnedCount = selected.length;
        return selected;
      });
      break;
    case "recent_sessions":
      payload = mapFact(context.recentProgress, (recent) => {
        availableCount = recent.sessions.length;
        const selected = recent.sessions.slice(0, limit);
        returnedCount = selected.length;
        return selected;
      });
      break;
    case "subject_material_progress":
      payload = mapFact(context.materials, (materials) => {
        const selected = materials.filter((material) => material.subjectId === subjectId);
        availableCount = selected.length;
        const limited = selected.slice(0, limit);
        returnedCount = limited.length;
        return limited;
      });
      break;
    case "planner_explanation_detail":
      payload = mapFact(context.planner, (planner) => {
        let remaining = limit;
        const take = <T>(items: readonly T[]): readonly T[] => {
          const selected = items.slice(0, remaining);
          remaining -= selected.length;
          return selected;
        };
        const warnings = take(planner.warnings);
        const explanationFacts = take(planner.explanationFacts);
        const createCanonicalWorkloadIdentities = take(planner.differences.createCanonicalWorkloadIdentities);
        const retainedTaskIds = take(planner.differences.retainedTaskIds);
        const replaceableTaskIds = take(planner.differences.replaceableTaskIds);
        const outsideScopeTaskIds = take(planner.differences.outsideScopeTaskIds);
        availableCount = planner.warnings.length + planner.explanationFacts.length +
          planner.differences.createCanonicalWorkloadIdentities.length +
          planner.differences.retainedTaskIds.length +
          planner.differences.replaceableTaskIds.length +
          planner.differences.outsideScopeTaskIds.length;
        returnedCount = limit - remaining;
        return {
          lifecycleState: planner.lifecycleState,
          weeklyPlanId: planner.weeklyPlanId,
          proposalRecordId: planner.proposalRecordId,
          proposalId: planner.proposalId,
          proposalFingerprint: planner.proposalFingerprint,
          snapshotFingerprint: planner.snapshotFingerprint,
          plannerVersion: planner.plannerVersion,
          expiresAt: planner.expiresAt,
          freshnessReasons: structuredClone(planner.freshnessReasons),
          summary: structuredClone(planner.summary),
          differences: { createCanonicalWorkloadIdentities, retainedTaskIds, replaceableTaskIds, outsideScopeTaskIds },
          warnings,
          explanationFacts,
          explicitConfirmationRequired: true,
          applyAvailable: false,
        };
      });
      break;
  }
  const response: CoachEvidenceDetailResponseV1 = {
    version: COACH_EVIDENCE_DETAIL_RESPONSE_V1_VERSION,
    sourceContext: { version: context.version, requestId: context.requestId },
    kind: request.kind,
    subjectId,
    asOf: context.generatedAt,
    timezone: context.timezone,
    payload,
    collection: {
      availableCount,
      returnedCount,
      limit,
      truncated: returnedCount < availableCount,
    },
    provenance: normalizeProvenance(payload.provenance),
    authority: {
      mode: "evidence_only_read_only",
      dbWritesAllowed: false,
      arbitraryQueryAllowed: false,
      newTruthCalculationAllowed: false,
      workloadRecalculationAllowed: false,
      plannerPreviewRecomputationAllowed: false,
      taskMutationAllowed: false,
      capacityMutationAllowed: false,
      plannerConfirmationAllowed: false,
      plannerApplyAllowed: false,
      llmCallsAllowed: false,
      providerCallsAllowed: false,
    },
  };
  const bytes = new TextEncoder().encode(JSON.stringify(response)).byteLength;
  if (bytes > COACH_EVIDENCE_DETAIL_V1_LIMITS.serializedBytes) {
    throw new Error(`COACH_EVIDENCE_DETAIL_V1_TOO_LARGE:${bytes}`);
  }
  return deepFreeze(response);
}
