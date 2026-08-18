import type {
  LearnerUnitStateV1,
  PlanningSnapshotV2,
} from "./types";

import type {
  PlanningProposalV1,
  PlanValidationResult,
} from "./proposal";

import type {
  PlanningDecisionV2,
} from "./planning-decision";

export type PlanningV2ProposalStatus =
  | "shadow"
  | "validated"
  | "blocked"
  | "approved"
  | "applied"
  | "superseded";

export interface PlanningV2PersistenceContext {
  readonly weeklyPlanId?: string | null;
  readonly sourcePlanGenerationVersion?: number | null;
}

export interface LearnerUnitStateV2Row {
  readonly user_id: string;
  readonly exam_profile_id: string;
  readonly curriculum_node_id: string;

  readonly mastery_mean: number | null;
  readonly mastery_confidence: number;

  readonly question_accuracy: number | null;
  readonly question_count: number;
  readonly average_question_seconds: number | null;

  readonly study_minutes: number;
  readonly evidence_count: number;

  readonly difficulty_estimate: number | null;

  readonly last_studied_at: string | null;
  readonly last_retrieval_at: string | null;

  readonly memory_stability: number | null;
  readonly memory_difficulty: number | null;
  readonly retrievability: number | null;

  readonly misconception_tags: readonly string[];

  readonly state_version: string;

  readonly evidence_fingerprint: string | null;
  readonly evidence_watermark: string | null;
}

export interface PlanningV2SnapshotRow {
  readonly user_id: string;
  readonly exam_profile_id: string;

  readonly weekly_plan_id: string | null;

  readonly external_snapshot_id: string;
  readonly snapshot_hash: string | null;
  readonly idempotency_key: string;

  readonly trigger_type: string;
  readonly requested_scope: string;

  readonly current_date: string;
  readonly week_start_date: string;
  readonly week_end_date: string;

  readonly available_minutes: number;
  readonly planning_budget_minutes: number;
  readonly reserve_minutes: number;

  readonly source_plan_generation_version: number | null;

  readonly planner_version: string;
  readonly scoring_version: string;
  readonly learner_state_version: string;
  readonly snapshot_schema_version: string;

  readonly snapshot_payload: PlanningSnapshotV2;
}

export interface PlanningV2ProposalRow {
  readonly user_id: string;
  readonly exam_profile_id: string;

  readonly weekly_plan_id: string | null;

  /**
   * Filled after the persisted snapshot row is returned by PostgreSQL.
   */
  readonly planning_snapshot_id: string;

  readonly external_proposal_id: string;
  readonly idempotency_key: string;

  readonly trigger_type: string;
  readonly scope: string;

  readonly decision: PlanningDecisionV2;
  readonly status: PlanningV2ProposalStatus;

  readonly changed_task_count: number;

  readonly apply_recommended: boolean;
  readonly validation_valid: boolean;

  readonly objective_before: number | null;
  readonly objective_after: number | null;

  readonly reason_codes: readonly string[];

  readonly proposal_payload: PlanningProposalV1;
  readonly validation_payload: PlanValidationResult;

  readonly planner_version: string;
  readonly scoring_version: string;
  readonly learner_state_version: string;

  readonly apply_dedupe_key: string | null;
}

function assertNonBlank(
  name: string,
  value: string,
): void {
  if (!value.trim()) {
    throw new Error(`${name} must not be blank`);
  }
}

function normalizeFingerprint(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed : null;
}

export function planningV2SnapshotIdempotencyKey(
  snapshot: PlanningSnapshotV2,
): string {
  return [
    "planning-v2-snapshot",
    snapshot.userId,
    snapshot.examProfileId,
    snapshot.meta.snapshotId,
    snapshot.meta.trigger,
    snapshot.meta.versions.plannerVersion,
  ].join(":");
}

export function planningV2ProposalIdempotencyKey(
  proposal: PlanningProposalV1,
): string {
  return [
    "planning-v2-proposal",
    proposal.userId,
    proposal.examProfileId,
    proposal.proposalId,
    proposal.versions.plannerVersion,
  ].join(":");
}

export function planningV2ApplyDedupeKey(
  proposal: PlanningProposalV1,
): string {
  return [
    "planning-v2-apply",
    proposal.userId,
    proposal.examProfileId,
    proposal.proposalId,
    proposal.versions.plannerVersion,
  ].join(":");
}

export function toLearnerUnitStateV2Row(
  state: LearnerUnitStateV1,
  options: {
    readonly stateVersion: string;
    readonly evidenceFingerprint?: string | null;
    readonly evidenceWatermark?: string | null;
  },
): LearnerUnitStateV2Row {
  assertNonBlank(
    "stateVersion",
    options.stateVersion,
  );

  return Object.freeze({
    user_id: state.userId,
    exam_profile_id: state.examProfileId,
    curriculum_node_id: state.curriculumUnitId,

    mastery_mean: state.masteryMean,
    mastery_confidence: state.masteryConfidence,

    question_accuracy: state.questionAccuracy,
    question_count: state.questionCount,
    average_question_seconds:
      state.averageQuestionSeconds,

    study_minutes: state.studyMinutes,
    evidence_count: state.evidenceCount,

    difficulty_estimate:
      state.difficultyEstimate,

    last_studied_at: state.lastStudiedAt,
    last_retrieval_at: state.lastRetrievalAt,

    memory_stability: state.memoryStability,
    memory_difficulty: state.memoryDifficulty,
    retrievability: state.retrievability,

    misconception_tags: Object.freeze([
      ...state.misconceptionTags,
    ]),

    state_version:
      options.stateVersion,

    evidence_fingerprint:
      normalizeFingerprint(
        options.evidenceFingerprint,
      ),

    evidence_watermark:
      options.evidenceWatermark ?? null,
  });
}

export function toPlanningV2SnapshotRow(
  snapshot: PlanningSnapshotV2,
  context: PlanningV2PersistenceContext = {},
  snapshotHash?: string | null,
): PlanningV2SnapshotRow {
  const idempotencyKey =
    planningV2SnapshotIdempotencyKey(
      snapshot,
    );

  return Object.freeze({
    user_id: snapshot.userId,
    exam_profile_id:
      snapshot.examProfileId,

    weekly_plan_id:
      context.weeklyPlanId ?? null,

    external_snapshot_id:
      snapshot.meta.snapshotId,

    snapshot_hash:
      normalizeFingerprint(
        snapshotHash,
      ),

    idempotency_key:
      idempotencyKey,

    trigger_type:
      snapshot.meta.trigger,

    requested_scope:
      snapshot.meta.requestedScope,

    current_date:
      snapshot.meta.currentDate,

    week_start_date:
      snapshot.meta.weekStart,

    week_end_date:
      snapshot.meta.weekEnd,

    available_minutes:
      snapshot.availableMinutes,

    planning_budget_minutes:
      snapshot.planningBudgetMinutes,

    reserve_minutes:
      snapshot.reserveMinutes,

    source_plan_generation_version:
      context.sourcePlanGenerationVersion ??
      null,

    planner_version:
      snapshot.meta.versions.plannerVersion,

    scoring_version:
      snapshot.meta.versions.scoringVersion,

    learner_state_version:
      snapshot.meta.versions.learnerStateVersion,

    snapshot_schema_version:
      snapshot.meta.versions.snapshotSchemaVersion,

    snapshot_payload:
      snapshot,
  });
}

function statusForDecision(
  decision: PlanningDecisionV2,
  validation: PlanValidationResult,
): PlanningV2ProposalStatus {
  if (
    decision === "BLOCKED" ||
    !validation.valid
  ) {
    return "blocked";
  }

  return "validated";
}

export function toPlanningV2ProposalRow(
  input: {
    readonly snapshot: PlanningSnapshotV2;
    readonly planningSnapshotDatabaseId: string;

    readonly proposal: PlanningProposalV1;
    readonly validation: PlanValidationResult;
    readonly decision: PlanningDecisionV2;

    readonly weeklyPlanId?: string | null;
  },
): PlanningV2ProposalRow {
  assertNonBlank(
    "planningSnapshotDatabaseId",
    input.planningSnapshotDatabaseId,
  );

  if (
    input.proposal.snapshotId !==
    input.snapshot.meta.snapshotId
  ) {
    throw new Error(
      "proposal snapshot does not match persistence snapshot",
    );
  }

  if (
    input.proposal.userId !==
      input.snapshot.userId ||
    input.proposal.examProfileId !==
      input.snapshot.examProfileId
  ) {
    throw new Error(
      "proposal ownership does not match persistence snapshot",
    );
  }

  const idempotencyKey =
    planningV2ProposalIdempotencyKey(
      input.proposal,
    );

  return Object.freeze({
    user_id:
      input.proposal.userId,

    exam_profile_id:
      input.proposal.examProfileId,

    weekly_plan_id:
      input.weeklyPlanId ?? null,

    planning_snapshot_id:
      input.planningSnapshotDatabaseId,

    external_proposal_id:
      input.proposal.proposalId,

    idempotency_key:
      idempotencyKey,

    trigger_type:
      input.proposal.trigger,

    scope:
      input.proposal.scope,

    decision:
      input.decision,

    status:
      statusForDecision(
        input.decision,
        input.validation,
      ),

    changed_task_count:
      input.proposal.changedTaskCount,

    apply_recommended:
      input.proposal.applyRecommended,

    validation_valid:
      input.validation.valid,

    objective_before:
      input.proposal.objectiveBefore,

    objective_after:
      input.proposal.objectiveAfter,

    reason_codes:
      Object.freeze([
        ...input.proposal.reasonCodes,
      ]),

    proposal_payload:
      input.proposal,

    validation_payload:
      input.validation,

    planner_version:
      input.proposal.versions.plannerVersion,

    scoring_version:
      input.proposal.versions.scoringVersion,

    learner_state_version:
      input.proposal.versions.learnerStateVersion,

    /*
     * Generated now but NOT executed in shadow mode.
     * Later this can be passed to existing apply_plan_revision().
     */
    apply_dedupe_key:
      input.decision === "READY_TO_APPLY" &&
      input.validation.valid
        ? planningV2ApplyDedupeKey(
            input.proposal,
          )
        : null,
  });
}
