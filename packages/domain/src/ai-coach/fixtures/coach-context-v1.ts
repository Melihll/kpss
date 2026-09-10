import {
  knownCoachContextV1Fact,
  notApplicableCoachContextV1Fact,
  staleCoachContextV1Fact,
  unknownCoachContextV1Fact,
  type CoachContextV1Fact,
  type CoachContextV1Input,
  type CoachContextV1MaterialProgress,
  type CoachContextV1MaterialWorkload,
  type CoachContextV1Task,
  type CoachContextV1TruthSource,
} from "../coach-context-v1";

export const COACH_CONTEXT_V1_FIXTURE_KINDS = [
  "healthy_normal_week",
  "today_partially_completed",
  "canonical_next_work_available",
  "missing_material_workload",
  "stale_partial_fact",
  "pln002_ambiguity",
  "no_tasks_today",
  "mixed_completed_ready_future_tasks",
] as const;

export type CoachContextV1FixtureKind =
  (typeof COACH_CONTEXT_V1_FIXTURE_KINDS)[number];

type MutableCoachContextV1Input = {
  -readonly [Key in keyof CoachContextV1Input]: CoachContextV1Input[Key];
};

const GENERATED_AT = "2026-09-10T09:00:00.000Z";
const CURRENT_DATE = "2026-09-10";
const USER_ID = "user-esra";
const PROFILE_ID = "profile-kpss-2027";
const PLAN_ID = "plan-2026-w37";

function provenance(
  source: CoachContextV1TruthSource,
  recordIds: readonly string[] = [],
  asOf = GENERATED_AT,
) {
  return [{ source, recordIds, asOf }] as const;
}

function known<T>(
  value: T,
  source: CoachContextV1TruthSource | readonly CoachContextV1TruthSource[],
  recordIds: readonly string[] = [],
  confidence: "authoritative" | "high" | "medium" | "low" = "authoritative",
): CoachContextV1Fact<T> {
  return knownCoachContextV1Fact(value, {
    provenance: (Array.isArray(source) ? source : [source]).flatMap((item) =>
      provenance(item as CoachContextV1TruthSource, recordIds)),
    asOf: GENERATED_AT,
    confidence,
  });
}

const mondayCompleted: CoachContextV1Task = {
  taskId: "task-monday-history",
  title: "Türkçe paragraf çalışması",
  subjectId: "subject-turkish",
  curriculumNodeId: "topic-paragraph",
  resourceId: "resource-question-bank",
  canonicalWorkloadIdentity: "physical:unit-paragraph-test-1",
  plannedDate: "2026-09-07",
  status: "completed",
  estimatedMinutes: 60,
  completedMinutes: 60,
  remainingMinutes: 0,
};

const todayReady: CoachContextV1Task = {
  taskId: "task-today-video",
  title: "Anayasa temel kavramlar videosu",
  subjectId: "subject-law",
  curriculumNodeId: "topic-constitution",
  resourceId: "resource-law-video",
  canonicalWorkloadIdentity: "youtube:video-constitution-1",
  plannedDate: CURRENT_DATE,
  status: "ready",
  estimatedMinutes: 45,
  completedMinutes: 0,
  remainingMinutes: 45,
};

const fridayReady: CoachContextV1Task = {
  taskId: "task-friday-finance",
  title: "Maliye soru seti",
  subjectId: "subject-finance",
  curriculumNodeId: "topic-public-finance",
  resourceId: "resource-finance-bank",
  canonicalWorkloadIdentity: "physical:unit-finance-test-2",
  plannedDate: "2026-09-11",
  status: "ready",
  estimatedMinutes: 50,
  completedMinutes: 0,
  remainingMinutes: 50,
};

const youtubeMaterial: CoachContextV1MaterialProgress = {
  materialViewId: "youtube:video-constitution-1",
  sourceKind: "youtube",
  resourceId: "resource-law-video",
  subjectId: "subject-law",
  curriculumNodeId: "topic-constitution",
  title: "Anayasa temel kavramlar",
  unitType: "video",
  progressState: "in_progress",
  completedThroughPage: null,
  durationSeconds: 2_700,
  watchedSeconds: 900,
  mappingStatus: "validated",
  mappingProvenance: "reviewed_mapping",
  workload: known({
    remainingAmount: 1_800,
    remainingUnit: "video_second",
    estimatedMinutes: 30,
    authority: "exact",
    confidence: "high",
    plannerEligible: true,
    unresolvedReason: null,
  }, "canonical_workload_engine_v1", ["youtube:video-constitution-1"]),
};

const physicalMaterial: CoachContextV1MaterialProgress = {
  materialViewId: "physical:unit-finance-test-2",
  sourceKind: "physical",
  resourceId: "resource-finance-bank",
  subjectId: "subject-finance",
  curriculumNodeId: "topic-public-finance",
  title: "Kamu maliyesi test 2",
  unitType: "test",
  progressState: "not_started",
  completedThroughPage: null,
  durationSeconds: null,
  watchedSeconds: null,
  mappingStatus: "validated",
  mappingProvenance: "reviewed_catalog",
  workload: known({
    remainingAmount: 10,
    remainingUnit: "page",
    estimatedMinutes: 50,
    authority: "calibrated",
    confidence: "medium",
    plannerEligible: true,
    unresolvedReason: null,
  }, "canonical_workload_engine_v1", ["physical:unit-finance-test-2"], "medium"),
};

function baseInput(): CoachContextV1Input {
  const weekTasks = [fridayReady, mondayCompleted, todayReady];
  return {
    generatedAt: GENERATED_AT,
    requestId: "request-coach-context-fixture",
    userId: USER_ID,
    examProfileId: PROFILE_ID,
    locale: "tr-TR",
    timezone: "Europe/Istanbul",
    currentDate: CURRENT_DATE,
    identity: known({
      displayName: "Esra",
      examEditionId: "edition-kpss-2027",
      targetExamDate: "2027-07-18",
      profileStatus: "active",
    }, ["user_profiles", "exam_profiles"], [USER_ID, PROFILE_ID]),
    today: known({
      date: CURRENT_DATE,
      weeklyPlanId: PLAN_ID,
      planGenerationVersion: 4,
      summary: {
        totalTaskCount: 1,
        openTaskCount: 1,
        completedTaskCount: 0,
        partiallyCompletedTaskCount: 0,
        plannedMinutes: 45,
        completedMinutes: 0,
        remainingMinutes: 45,
      },
      study: {
        actualMinutes: 0,
        plannedActualMinutes: 0,
        plannedCreditMinutes: 0,
        extraActualMinutes: 0,
        unknownIntentMinutes: 0,
      },
      tasks: [todayReady],
    }, ["weekly_plans", "planning_task_state_v1", "study_intent_ledger"], [PLAN_ID, todayReady.taskId]),
    week: known({
      weeklyPlanId: PLAN_ID,
      generationVersion: 4,
      startDate: "2026-09-07",
      endDate: "2026-09-13",
      status: "active",
      summary: {
        totalTaskCount: 3,
        openTaskCount: 2,
        completedTaskCount: 1,
        partiallyCompletedTaskCount: 0,
        plannedMinutes: 155,
        completedMinutes: 60,
        remainingMinutes: 95,
      },
      study: {
        actualMinutes: 60,
        plannedActualMinutes: 60,
        plannedCreditMinutes: 60,
        extraActualMinutes: 0,
        unknownIntentMinutes: 0,
      },
      tasks: weekTasks,
      studyIntentCoverage: "sufficient",
      progressPosition: known("on_track" as const, "study_intent_ledger", ["allocation-monday"]),
    }, ["weekly_plans", "planning_task_state_v1", "study_intent_ledger"], [PLAN_ID]),
    subjects: [
      {
        subjectId: "subject-law",
        subjectName: "Hukuk",
        status: "active",
        tasks: known({
          totalTaskCount: 1,
          openTaskCount: 1,
          completedTaskCount: 0,
          partiallyCompletedTaskCount: 0,
          plannedMinutes: 45,
          completedMinutes: 0,
          remainingMinutes: 45,
        }, "planning_task_state_v1", [todayReady.taskId]),
        study: known({
          actualMinutes: 0,
          plannedActualMinutes: 0,
          plannedCreditMinutes: 0,
          extraActualMinutes: 0,
          unknownIntentMinutes: 0,
        }, "study_intent_ledger"),
        material: known({
          totalMaterialViews: 1,
          completedMaterialViews: 0,
          inProgressMaterialViews: 1,
          unknownWorkloadViews: 0,
        }, "canonical_material_truth_v1", [youtubeMaterial.materialViewId]),
      },
      {
        subjectId: "subject-finance",
        subjectName: "Maliye",
        status: "active",
        tasks: known({
          totalTaskCount: 1,
          openTaskCount: 1,
          completedTaskCount: 0,
          partiallyCompletedTaskCount: 0,
          plannedMinutes: 50,
          completedMinutes: 0,
          remainingMinutes: 50,
        }, "planning_task_state_v1", [fridayReady.taskId]),
        study: known({
          actualMinutes: 0,
          plannedActualMinutes: 0,
          plannedCreditMinutes: 0,
          extraActualMinutes: 0,
          unknownIntentMinutes: 0,
        }, "study_intent_ledger"),
        material: known({
          totalMaterialViews: 1,
          completedMaterialViews: 0,
          inProgressMaterialViews: 0,
          unknownWorkloadViews: 0,
        }, "canonical_material_truth_v1", [physicalMaterial.materialViewId]),
      },
    ],
    nextWork: known({
      basis: "approved_current_plan",
      canonicalWorkloadIdentity: todayReady.canonicalWorkloadIdentity!,
      materialViewId: youtubeMaterial.materialViewId,
      taskId: todayReady.taskId,
      title: todayReady.title,
      subjectId: todayReady.subjectId,
      resourceId: todayReady.resourceId!,
      plannedDate: todayReady.plannedDate,
      workloadMinutes: 30,
    }, ["planning_task_state_v1", "canonical_material_truth_v1", "canonical_workload_engine_v1"], [todayReady.taskId, youtubeMaterial.materialViewId]),
    materials: known([physicalMaterial, youtubeMaterial], "canonical_material_truth_v1", [
      physicalMaterial.materialViewId,
      youtubeMaterial.materialViewId,
    ]),
    workload: known({
      totalMaterialViews: 2,
      exactWorkloadViews: 1,
      calibratedWorkloadViews: 1,
      unknownWorkloadViews: 0,
      plannerEligibleViews: 2,
      exactYoutubeRemainingMinutes: 30,
      physicalPagesWithCalibratedWorkload: 10,
      physicalPagesWithUnknownWorkload: 0,
      physicalEstimatedRemainingMinutes: 50,
      blockedByReason: {},
      minutesBySubject: { "subject-finance": 50, "subject-law": 30 },
      minutesByResource: { "resource-finance-bank": 50, "resource-law-video": 30 },
    }, "canonical_workload_engine_v1", [physicalMaterial.materialViewId, youtubeMaterial.materialViewId]),
    capacity: known({
      horizonStart: "2026-09-07",
      horizonEnd: "2026-09-13",
      days: [
        { date: "2026-09-11", grossMinutes: 120, reserveMinutes: 15, planningMinutes: 105, alreadyStudiedMinutes: 0, protectedMinutes: known(0, "planner_v2_snapshot", []), availableMinutes: known(105, "planner_v2_snapshot", []) },
        { date: "2026-09-10", grossMinutes: 120, reserveMinutes: 15, planningMinutes: 105, alreadyStudiedMinutes: 0, protectedMinutes: known(45, "planner_v2_snapshot", [todayReady.taskId]), availableMinutes: known(60, "planner_v2_snapshot", [todayReady.taskId]) },
      ],
    }, "capacity_projection_v1", ["capacity:2026-09-10", "capacity:2026-09-11"]),
    recentProgress: known({
      windowStart: "2026-09-07T00:00:00.000+03:00",
      windowEnd: "2026-09-11T00:00:00.000+03:00",
      taskEvents: [{
        taskId: mondayCompleted.taskId,
        occurredAt: "2026-09-07T17:00:00.000Z",
        status: "completed",
        completedMinutes: 60,
      }],
      sessions: [{
        sessionId: "session-monday",
        allocationId: "allocation-monday",
        startedAt: "2026-09-07T16:00:00.000Z",
        endedAt: "2026-09-07T17:00:00.000Z",
        actualMinutes: 60,
        accountingIntent: "planned",
        plannedCreditMinutes: 60,
        taskId: mondayCompleted.taskId,
        subjectId: mondayCompleted.subjectId,
        resourceId: mondayCompleted.resourceId,
        entrySource: "live",
      }],
      transitions: [],
    }, ["planning_task_state_v1", "study_intent_ledger"], ["session-monday", "allocation-monday"]),
    planner: notApplicableCoachContextV1Fact(
      "no_current_planner_v2_proposal",
      ["planner_v2_lifecycle"],
    ),
    signalInputs: known([
      { key: "week_open_tasks", category: "progress", value: 2, unit: "count", sourceFactPath: "week.value.summary.openTaskCount" },
      { key: "unknown_workload_views", category: "data_quality", value: 0, unit: "count", sourceFactPath: "workload.value.unknownWorkloadViews" },
    ], "deterministic_signal_input_v1"),
  };
}

export function coachContextV1Fixture(kind: CoachContextV1FixtureKind): CoachContextV1Input {
  const input = structuredClone(baseInput()) as MutableCoachContextV1Input;

  if (kind === "today_partially_completed") {
    const partial = {
      ...todayReady,
      status: "partially_completed" as const,
      completedMinutes: 20,
      remainingMinutes: 25,
    };
    input.today = known({
      ...input.today.value!,
      summary: {
        ...input.today.value!.summary,
        partiallyCompletedTaskCount: 1,
        completedMinutes: 20,
        remainingMinutes: 25,
      },
      study: {
        actualMinutes: 20,
        plannedActualMinutes: 20,
        plannedCreditMinutes: 20,
        extraActualMinutes: 0,
        unknownIntentMinutes: 0,
      },
      tasks: [partial],
    }, ["weekly_plans", "planning_task_state_v1", "study_intent_ledger"], [PLAN_ID, partial.taskId]);
  }

  if (kind === "canonical_next_work_available") {
    input.nextWork = known({
      basis: "canonical_material_continuation",
      canonicalWorkloadIdentity: youtubeMaterial.materialViewId,
      materialViewId: youtubeMaterial.materialViewId,
      taskId: null,
      title: youtubeMaterial.title,
      subjectId: youtubeMaterial.subjectId!,
      resourceId: youtubeMaterial.resourceId,
      plannedDate: null,
      workloadMinutes: 30,
    }, ["canonical_material_truth_v1", "canonical_workload_engine_v1"], [youtubeMaterial.materialViewId]);
  }

  if (kind === "missing_material_workload") {
    const material = {
      ...structuredClone(physicalMaterial),
      workload: unknownCoachContextV1Fact<CoachContextV1MaterialWorkload>(
        "pace_evidence_unavailable",
        ["canonical_workload_engine_v1"],
      ),
    };
    input.materials = known([material, youtubeMaterial], "canonical_material_truth_v1", [
      material.materialViewId,
      youtubeMaterial.materialViewId,
    ]);
    input.workload = unknownCoachContextV1Fact(
      "canonical_workload_summary_partial",
      ["canonical_workload_engine_v1"],
    );
    input.nextWork = unknownCoachContextV1Fact(
      "canonical_next_work_requires_known_workload",
      ["canonical_material_truth_v1", "canonical_workload_engine_v1"],
    );
  }

  if (kind === "stale_partial_fact") {
    input.capacity = staleCoachContextV1Fact(
      input.capacity.value,
      "capacity_snapshot_expired",
      {
        provenance: provenance("capacity_projection_v1", ["capacity:2026-09-10"], "2026-09-09T09:00:00.000Z"),
        asOf: "2026-09-09T09:00:00.000Z",
        expiresAt: "2026-09-10T00:00:00.000Z",
      },
    );
    input.signalInputs = unknownCoachContextV1Fact(
      "current_capacity_signal_input_unavailable",
      ["deterministic_signal_input_v1", "capacity_projection_v1"],
    );
  }

  if (kind === "pln002_ambiguity") {
    const week = input.week.value!;
    input.week = known({
      ...week,
      study: { ...week.study, unknownIntentMinutes: 35 },
      studyIntentCoverage: "partial",
      progressPosition: unknownCoachContextV1Fact(
        "pln002_intent_coverage_insufficient",
        ["study_intent_ledger", "planning_task_state_v1"],
      ),
    }, ["weekly_plans", "planning_task_state_v1", "study_intent_ledger"], [PLAN_ID]);
  }

  if (kind === "no_tasks_today") {
    input.today = known({
      ...input.today.value!,
      summary: {
        totalTaskCount: 0,
        openTaskCount: 0,
        completedTaskCount: 0,
        partiallyCompletedTaskCount: 0,
        plannedMinutes: 0,
        completedMinutes: 0,
        remainingMinutes: 0,
      },
      tasks: [],
    }, ["weekly_plans", "planning_task_state_v1", "study_intent_ledger"], [PLAN_ID]);
    input.nextWork = notApplicableCoachContextV1Fact(
      "no_eligible_canonical_work_for_today",
      ["planning_task_state_v1", "canonical_material_truth_v1"],
    );
  }

  if (kind === "mixed_completed_ready_future_tasks") {
    input.week = known({
      ...input.week.value!,
      tasks: [fridayReady, todayReady, mondayCompleted],
    }, ["weekly_plans", "planning_task_state_v1", "study_intent_ledger"], [PLAN_ID]);
  }

  return input;
}
