import type { CoachContextV1TruthSource } from "./coach-context-v1";

export type CoachContextV1SourceReadiness =
  | "reusable_now"
  | "adapter_extraction_required"
  | "truth_gap";

export interface CoachContextV1SourceMapEntry {
  readonly fieldPattern: string;
  readonly truthSources: readonly CoachContextV1TruthSource[];
  readonly existingReaderOrContract: readonly string[];
  readonly readiness: CoachContextV1SourceReadiness;
  readonly rule: string;
}

/**
 * This registry is documentation executable as TypeScript. It names the
 * current source of every CoachContextV1 field group without wiring a DB read.
 */
export const COACH_CONTEXT_V1_SOURCE_MAP: readonly CoachContextV1SourceMapEntry[] = Object.freeze([
  {
    fieldPattern: "version",
    truthSources: ["coach_context_builder_v1"],
    existingReaderOrContract: ["packages/domain/src/ai-coach/coach-context-v1.ts::COACH_CONTEXT_V1_VERSION"],
    readiness: "reusable_now",
    rule: "Builder-owned literal; callers cannot select another version.",
  },
  {
    fieldPattern: "generatedAt",
    truthSources: ["server_clock"],
    existingReaderOrContract: ["server runtime instant (Date)"],
    readiness: "reusable_now",
    rule: "Server-supplied ISO instant; never supplied by the model.",
  },
  {
    fieldPattern: "requestId, locale",
    truthSources: ["request_context"],
    existingReaderOrContract: ["authenticated HTTP request context"],
    readiness: "reusable_now",
    rule: "6B.2 adapter accepts authenticated request-scoped metadata only; no conversation-history authority.",
  },
  {
    fieldPattern: "userId",
    truthSources: ["authenticated_user"],
    existingReaderOrContract: ["supabase/functions/app-api/index.ts::client.auth.getUser"],
    readiness: "reusable_now",
    rule: "Authenticated server identity; never accepted from model output.",
  },
  {
    fieldPattern: "examProfileId, identity.value.examEditionId, identity.value.targetExamDate, identity.value.profileStatus",
    truthSources: ["exam_profiles"],
    existingReaderOrContract: [
      "supabase/functions/app-api/index.ts::activeProfile",
      "supabase/functions/_shared/canonical-planner-v2-readonly.ts::runCanonicalPlannerV2ReadOnlyShadow active-profile projection",
    ],
    readiness: "reusable_now",
    rule: "6B.2 reads the user-owned active profile directly with a compact allowlist.",
  },
  {
    fieldPattern: "timezone, identity.value.displayName",
    truthSources: ["user_profiles"],
    existingReaderOrContract: [
      "apps/web/src/auth/AuthContext.tsx::loadProfile",
      "packages/domain/src/types.ts::UserProfile",
    ],
    readiness: "reusable_now",
    rule: "6B.2 reads the server-side user profile; missing timezone fails closed rather than defaulting a fact.",
  },
  {
    fieldPattern: "currentDate",
    truthSources: ["server_clock", "user_profiles"],
    existingReaderOrContract: [
      "packages/domain/src/time-boundaries.ts::DEFAULT_TIMEZONE/getZonedDayRange",
      "supabase/functions/_shared/adaptive.ts::calendarToday",
    ],
    readiness: "reusable_now",
    rule: "6B.2 resolves the date and bounded query windows server-side from the persisted timezone.",
  },
  {
    fieldPattern: "identity",
    truthSources: ["authenticated_user", "user_profiles", "exam_profiles"],
    existingReaderOrContract: ["packages/domain/src/types.ts::UserProfile/ExamProfile"],
    readiness: "reusable_now",
    rule: "6B.2 emits a compact identity projection; no raw auth, profile, or edition row.",
  },
  {
    fieldPattern: "today.value.weeklyPlanId, today.value.planGenerationVersion",
    truthSources: ["weekly_plans"],
    existingReaderOrContract: [
      "packages/domain/src/planning-v2/db-snapshot-contract.ts::WeeklyPlanDbRowV1",
      "supabase/functions/_shared/canonical-planner-v2-readonly.ts::runCanonicalPlannerV2ReadOnlyShadow active-plan query",
    ],
    readiness: "reusable_now",
    rule: "Active current-week plan selected by ownership, date horizon, status, and latest generation.",
  },
  {
    fieldPattern: "today.value.tasks[*]",
    truthSources: ["planning_task_state_v1"],
    existingReaderOrContract: [
      "packages/domain/src/planning-v2/db-snapshot-contract.ts::normalizePlanningSnapshotDbBundleV1",
      "packages/domain/src/planning-v2/db-snapshot-contract.ts::mergePlanningTaskProgressV1",
    ],
    readiness: "reusable_now",
    rule: "Filter the canonical normalized weekly task state by currentDate; lifecycle is tasks.status, never inferred from minutes.",
  },
  {
    fieldPattern: "today.value.summary",
    truthSources: ["planning_task_state_v1"],
    existingReaderOrContract: ["packages/domain/src/planning-v2/db-snapshot-contract.ts::NormalizedPlanningSnapshotDbBundleV1"],
    readiness: "reusable_now",
    rule: "6B.2 deterministically projects Today over normalized task state; no planning arithmetic.",
  },
  {
    fieldPattern: "today.value.study",
    truthSources: ["study_intent_ledger"],
    existingReaderOrContract: [
      "packages/domain/src/study-intent.ts::buildStudyCapacityAccounting",
      "supabase/functions/_shared/completed-study.ts::aggregateCompletedStudySessions/aggregatePlannedCreditByDate",
      "study_sessions + current non-superseded study_session_allocations",
    ],
    readiness: "reusable_now",
    rule: "6B.2 keeps actual, planned actual, planned credit, Extra Study, and unknown intent separate over timezone-bounded ledger reads.",
  },
  {
    fieldPattern: "week.value.weeklyPlanId, week.value.generationVersion, week.value.startDate, week.value.endDate, week.value.status",
    truthSources: ["weekly_plans"],
    existingReaderOrContract: ["packages/domain/src/planning-v2/db-snapshot-contract.ts::WeeklyPlanDbRowV1"],
    readiness: "reusable_now",
    rule: "Copied from the selected active canonical weekly-plan row.",
  },
  {
    fieldPattern: "week.value.tasks[*], week.value.summary",
    truthSources: ["planning_task_state_v1"],
    existingReaderOrContract: ["packages/domain/src/planning-v2/db-snapshot-contract.ts::normalizePlanningSnapshotDbBundleV1"],
    readiness: "reusable_now",
    rule: "Canonical normalized task/progress state only; no legacy recommendation ordering.",
  },
  {
    fieldPattern: "week.value.study, week.value.studyIntentCoverage",
    truthSources: ["study_intent_ledger"],
    existingReaderOrContract: [
      "packages/domain/src/study-intent.ts::buildStudyCapacityAccounting",
      "study_sessions + current non-superseded study_session_allocations",
    ],
    readiness: "reusable_now",
    rule: "6B.2 reads current non-superseded allocations but holds coverage at partial while PLN-002 completeness is unresolved.",
  },
  {
    fieldPattern: "week.value.progressPosition",
    truthSources: ["study_intent_ledger", "planning_task_state_v1"],
    existingReaderOrContract: ["docs/product/specs/PLN-002_STUDY_INTENT_SEMANTICS.md"],
    readiness: "truth_gap",
    rule: "Must be unknown unless PLN-002 coverage for the window is sufficient; 6B.1 rejects a known ahead/on-track/behind value otherwise.",
  },
  {
    fieldPattern: "subjects[*].subjectId, subjects[*].subjectName, subjects[*].status",
    truthSources: ["subjects_catalog"],
    existingReaderOrContract: ["app-api weekly context: user_subjects joined to subjects"],
    readiness: "reusable_now",
    rule: "6B.2 reads user-profile subject selection joined to canonical subject identity.",
  },
  {
    fieldPattern: "subjects[*].tasks",
    truthSources: ["planning_task_state_v1"],
    existingReaderOrContract: ["packages/domain/src/planning-v2/db-snapshot-contract.ts::normalizePlanningSnapshotDbBundleV1"],
    readiness: "reusable_now",
    rule: "6B.2 deterministically groups normalized canonical tasks by subjectId.",
  },
  {
    fieldPattern: "subjects[*].study",
    truthSources: ["study_intent_ledger"],
    existingReaderOrContract: ["study_sessions + current non-superseded study_session_allocations subject_id"],
    readiness: "reusable_now",
    rule: "6B.2 groups current allocations by explicit subject identity; title inference is forbidden.",
  },
  {
    fieldPattern: "subjects[*].material",
    truthSources: ["canonical_material_truth_v1", "canonical_workload_engine_v1"],
    existingReaderOrContract: [
      "supabase/functions/_shared/canonical-material-loader.ts::loadCanonicalMaterialUnits",
      "supabase/functions/_shared/canonical-material-shadow.ts::loadCanonicalWorkloadReadiness",
    ],
    readiness: "reusable_now",
    rule: "6B.2 groups canonical material/workload outputs through resource.subject_id; never by title or legacy top-three summaries.",
  },
  {
    fieldPattern: "nextWork",
    truthSources: ["planning_task_state_v1", "canonical_material_truth_v1", "canonical_workload_engine_v1", "planner_v2_lifecycle"],
    existingReaderOrContract: [
      "packages/domain/src/planning/material-remaining-scope.ts::calculateRemainingMaterialScope (scoped material continuation only)",
      "packages/domain/src/planning-v2/proposal-lifecycle.ts::PlannerV2Preview.days[*].items (preview only)",
    ],
    readiness: "truth_gap",
    rule: "No global production-authoritative next-work selector exists. Known is allowed only for an exact approved-task binding, scoped canonical continuation, or exact Planner V2 preview item; otherwise unknown/not_applicable.",
  },
  {
    fieldPattern: "materials.value[*] except workload",
    truthSources: ["canonical_material_truth_v1"],
    existingReaderOrContract: [
      "supabase/functions/_shared/canonical-material-loader.ts::loadCanonicalMaterialUnits",
      "packages/domain/src/planning/material-unit-view.ts::MaterialUnitView",
    ],
    readiness: "reusable_now",
    rule: "Canonical material identity, mapping, boundary, and progress only; no resource_progress percentage fallback.",
  },
  {
    fieldPattern: "materials.value[*].workload",
    truthSources: ["canonical_workload_engine_v1"],
    existingReaderOrContract: [
      "supabase/functions/_shared/canonical-material-shadow.ts::loadCanonicalWorkloadReadiness.estimates",
      "packages/domain/src/planning/canonical-workload.ts::MaterialWorkloadEstimate",
    ],
    readiness: "reusable_now",
    rule: "Copy engine authority/confidence/reason. Unknown has null minutes; legacy or invented fallback is forbidden.",
  },
  {
    fieldPattern: "workload",
    truthSources: ["canonical_workload_engine_v1"],
    existingReaderOrContract: [
      "supabase/functions/_shared/canonical-material-shadow.ts::loadCanonicalWorkloadReadiness.summary",
      "packages/domain/src/planning/canonical-workload.ts::CanonicalWorkloadSummary",
    ],
    readiness: "reusable_now",
    rule: "Copy the canonical engine summary; CoachContext never recalculates workload totals.",
  },
  {
    fieldPattern: "capacity",
    truthSources: ["capacity_projection_v1"],
    existingReaderOrContract: [
      "packages/domain/src/capacity.ts::calculateDayAvailableMinutes/calculateWeeklyAvailableMinutes",
      "supabase/functions/_shared/capacity-overrides.ts::loadP48DailyCapacityOverrides/grossCapacityForDate/planningCapacityForDate",
      "weekly_availability + calendar_periods + schedule_exceptions + p48_daily_capacity_overrides",
    ],
    readiness: "reusable_now",
    rule: "6B.2 extracts canonical-capacity-readonly with identical adaptive inputs; Coach does not import legacy target-capacity or mutate capacity.",
  },
  {
    fieldPattern: "recentProgress.value.taskEvents",
    truthSources: ["planning_task_state_v1"],
    existingReaderOrContract: ["tasks + task_progress canonical lifecycle projection"],
    readiness: "reusable_now",
    rule: "6B.2 emits a bounded deterministic compact event projection; no raw task rows.",
  },
  {
    fieldPattern: "recentProgress.value.sessions",
    truthSources: ["study_intent_ledger"],
    existingReaderOrContract: ["study_sessions + current non-superseded study_session_allocations"],
    readiness: "reusable_now",
    rule: "6B.2 emits bounded completed sessions with current allocation identity, explicit intent and recording channel; no notes or raw rows.",
  },
  {
    fieldPattern: "recentProgress.value.transitions",
    truthSources: ["study_intent_ledger"],
    existingReaderOrContract: ["study_substitutions + task_carryovers user-scoped lifecycle rows"],
    readiness: "reusable_now",
    rule: "6B.2 carries exact typed lifecycle/identity/minute/date rows only; no transition is inferred from task movement.",
  },
  {
    fieldPattern: "planner.value identity/lifecycle/freshness",
    truthSources: ["planner_v2_snapshot", "planner_v2_lifecycle"],
    existingReaderOrContract: [
      "packages/domain/src/planning-v2/proposal-lifecycle.ts::PlannerV2Preview/validatePlannerV2Freshness",
      "supabase/functions/_shared/planner-v2-persisted-readonly.ts::loadCurrentPlannerV2PersistedStateReadOnly",
    ],
    readiness: "reusable_now",
    rule: "6B.2 reads the newest persisted lifecycle row and exact proposal identity only; no preview recomputation, confirmation, or Apply authority.",
  },
  {
    fieldPattern: "planner.value.explanationFacts",
    truthSources: ["planner_v2_lifecycle"],
    existingReaderOrContract: ["confirmed_action_proposals.display_payload persisted PlannerV2Preview facts"],
    readiness: "reusable_now",
    rule: "6B.2 copies and validates already-persisted structured preview facts; it never calls buildPlannerV2Preview.",
  },
  {
    fieldPattern: "signalInputs",
    truthSources: ["deterministic_signal_input_v1"],
    existingReaderOrContract: ["upstream known CoachContextV1 facts identified by sourceFactPath"],
    readiness: "adapter_extraction_required",
    rule: "Only deterministic scalar inputs are carried. No final insight, severity, ranking, cooldown, or AI prose is created in 6B.1.",
  },
  {
    fieldPattern: "unknowns",
    truthSources: ["coach_context_builder_v1"],
    existingReaderOrContract: ["packages/domain/src/ai-coach/coach-context-v1.ts::buildCoachContextV1"],
    readiness: "reusable_now",
    rule: "Deterministically collected from unknown/stale fact envelopes; not model-generated.",
  },
  {
    fieldPattern: "provenance",
    truthSources: ["coach_context_builder_v1"],
    existingReaderOrContract: ["packages/domain/src/ai-coach/coach-context-v1.ts::buildCoachContextV1"],
    readiness: "reusable_now",
    rule: "Deterministic compact union of field-level provenance supplied by source adapters.",
  },
  {
    fieldPattern: "authority",
    truthSources: ["coach_context_builder_v1"],
    existingReaderOrContract: ["packages/domain/src/ai-coach/coach-context-v1.ts::buildCoachContextV1"],
    readiness: "reusable_now",
    rule: "Builder-owned immutable false-authority flags; callers and models cannot elevate them.",
  },
]);

export interface CoachContextV1LegacyExclusion {
  readonly legacySource: string;
  readonly excludedFrom: readonly string[];
  readonly reason: string;
}

export const COACH_CONTEXT_V1_LEGACY_EXCLUSIONS: readonly CoachContextV1LegacyExclusion[] = Object.freeze([
  {
    legacySource: "supabase/functions/_shared/ai-coach/material-context.ts::loadAiCoachMaterialContext",
    excludedFrom: ["materials", "workload", "nextWork"],
    reason: "Top-three legacy projection is not canonical Material Truth and may hide unknown workload.",
  },
  {
    legacySource: "supabase/functions/_shared/material-workload.ts::loadMaterialWorkloads",
    excludedFrom: ["materials", "workload", "nextWork"],
    reason: "Legacy material/workload arithmetic is not the MAT-001 Canonical Workload Engine.",
  },
  {
    legacySource: "supabase/functions/_shared/ai-coach/target-capacity.ts::loadCurrentGrossCapacityForDate",
    excludedFrom: ["capacity"],
    reason: "Legacy Coach-specific capacity comparison is not a standalone canonical capacity read model.",
  },
  {
    legacySource: "supabase/functions/_shared/pilot.ts::loadDailyCoachContext/generateWeeklyReport",
    excludedFrom: ["today", "week", "nextWork", "signalInputs"],
    reason: "The legacy projection mixes task ranking, recommendation, default unit minutes, and older report semantics.",
  },
  {
    legacySource: "planning recommendation getNextBestTask / buildDailyPlanProjection",
    excludedFrom: ["nextWork"],
    reason: "No legacy ranking result is promoted to global canonical next-work truth.",
  },
  {
    legacySource: "supabase/functions/_shared/adaptive.ts::previewCurrentPlan/recalculateCurrentPlan/applyCurrentPlanRevision",
    excludedFrom: ["planner", "nextWork"],
    reason: "Older planner lifecycle cannot compete with canonical Planner V2 scenario/preview/confirm/apply.",
  },
  {
    legacySource: "supabase/functions/ai-coach-plan-preview",
    excludedFrom: ["planner"],
    reason: "Legacy Coach capacity-preview path is compatibility debt and is not an Evre 6 authority.",
  },
  {
    legacySource: "public.apply_confirmed_action_proposal",
    excludedFrom: ["authority", "planner"],
    reason: "Every future Coach planning mutation must converge on canonical Planner V2; 6B.1 has no mutation path.",
  },
]);
