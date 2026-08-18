import type {
  CandidateScoreBreakdown,
  IsoDateV2,
  LearnerUnitStateV1,
  PlanningCandidateV1,
  PlanningSnapshotV2,
} from "./types";

export interface CandidateScoringWeightsV1 {
  readonly examImportance: number;
  readonly masteryGap: number;
  readonly prerequisiteUnlockValue: number;
  readonly forgettingRisk: number;
  readonly deadlineUrgency: number;
  readonly continuityValue: number;
  readonly learnerPreference: number;
}

export const CANDIDATE_SCORING_WEIGHTS_V1:
  Readonly<CandidateScoringWeightsV1> = Object.freeze({
    examImportance: 25,
    masteryGap: 20,
    prerequisiteUnlockValue: 15,
    forgettingRisk: 15,
    deadlineUrgency: 10,
    continuityValue: 10,
    learnerPreference: 5,
  });

export interface CandidateScoringPolicyV1 {
  readonly weights: CandidateScoringWeightsV1;

  /**
   * Neutral fallback until canonical KPSS importance metadata
   * is supplied by the caller.
   */
  readonly defaultExamImportance: number;

  /**
   * Number of directly unlocked curriculum units that represents
   * maximum prerequisite-unlock value.
   */
  readonly maxUnlockCount: number;

  readonly forgettingHorizonDays: number;
  readonly freshContinuityDays: number;
}

export const DEFAULT_CANDIDATE_SCORING_POLICY_V1:
  Readonly<CandidateScoringPolicyV1> = Object.freeze({
    weights: CANDIDATE_SCORING_WEIGHTS_V1,
    defaultExamImportance: 0.5,
    maxUnlockCount: 3,
    forgettingHorizonDays: 7,
    freshContinuityDays: 1,
  });

export interface CandidateScoringSignalsV1 {
  readonly examImportanceByCurriculumUnit?: Readonly<
    Record<string, number>
  >;

  readonly examImportanceBySubject?: Readonly<
    Record<string, number>
  >;

  readonly learnerPreferenceBySubject?: Readonly<
    Record<string, number>
  >;
}

export interface ScorePlanningCandidatesV1Input {
  readonly snapshot: PlanningSnapshotV2;
  readonly candidates: readonly PlanningCandidateV1[];

  readonly signals?: CandidateScoringSignalsV1;
  readonly policy?: CandidateScoringPolicyV1;
}

export interface ScorePlanningCandidatesV1Result {
  readonly candidates: readonly PlanningCandidateV1[];

  readonly eligibleCandidates: readonly PlanningCandidateV1[];
  readonly blockedCandidates: readonly PlanningCandidateV1[];

  readonly topEligibleCandidateId: string | null;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function roundScore(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function validateProbability(
  name: string,
  value: number,
): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be between 0 and 1`);
  }

  return value;
}

function validatePolicy(
  policy: CandidateScoringPolicyV1,
): void {
  const entries = Object.entries(policy.weights);

  for (const [name, weight] of entries) {
    if (!Number.isFinite(weight) || weight < 0) {
      throw new Error(
        `candidate scoring weight ${name} must be non-negative`,
      );
    }
  }

  const totalWeight = entries.reduce(
    (sum, [, value]) => sum + value,
    0,
  );

  if (Math.abs(totalWeight - 100) > 0.0001) {
    throw new Error(
      `candidate scoring weights must sum to 100; received ${totalWeight}`,
    );
  }

  validateProbability(
    "defaultExamImportance",
    policy.defaultExamImportance,
  );

  if (
    !Number.isFinite(policy.maxUnlockCount) ||
    policy.maxUnlockCount <= 0
  ) {
    throw new Error("maxUnlockCount must be positive");
  }

  if (
    !Number.isFinite(policy.forgettingHorizonDays) ||
    policy.forgettingHorizonDays <= 0
  ) {
    throw new Error("forgettingHorizonDays must be positive");
  }

  if (
    !Number.isFinite(policy.freshContinuityDays) ||
    policy.freshContinuityDays < 0
  ) {
    throw new Error(
      "freshContinuityDays must be non-negative",
    );
  }
}

function parseIsoDateUtc(date: IsoDateV2): number {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);

  if (!match) {
    throw new Error(`invalid ISO date: ${date}`);
  }

  return Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
}

function daysBetween(
  earlier: IsoDateV2,
  later: IsoDateV2,
): number {
  const milliseconds =
    parseIsoDateUtc(later) - parseIsoDateUtc(earlier);

  return Math.floor(milliseconds / 86_400_000);
}

function datePart(timestamp: string): IsoDateV2 {
  return timestamp.slice(0, 10);
}

function learnerStateFor(
  snapshot: PlanningSnapshotV2,
  curriculumUnitId: string | null,
): LearnerUnitStateV1 | undefined {
  if (curriculumUnitId === null) {
    return undefined;
  }

  return snapshot.learnerStates.find(
    (state) =>
      state.curriculumUnitId === curriculumUnitId,
  );
}

function unitCompleted(
  snapshot: PlanningSnapshotV2,
  curriculumUnitId: string,
): boolean {
  return snapshot.existingTasks.some(
    (task) =>
      task.curriculumUnitId === curriculumUnitId &&
      task.isCompleted,
  );
}

function examImportanceSignal(
  candidate: PlanningCandidateV1,
  signals: CandidateScoringSignalsV1,
  policy: CandidateScoringPolicyV1,
): number {
  if (candidate.curriculumUnitId !== null) {
    const unitValue =
      signals.examImportanceByCurriculumUnit?.[
        candidate.curriculumUnitId
      ];

    if (unitValue !== undefined) {
      return validateProbability(
        `examImportance:${candidate.curriculumUnitId}`,
        unitValue,
      );
    }
  }

  if (candidate.subjectId !== null) {
    const subjectValue =
      signals.examImportanceBySubject?.[
        candidate.subjectId
      ];

    if (subjectValue !== undefined) {
      return validateProbability(
        `examImportance:${candidate.subjectId}`,
        subjectValue,
      );
    }
  }

  return policy.defaultExamImportance;
}

function masteryGapSignal(
  state: LearnerUnitStateV1 | undefined,
): number {
  if (
    !state ||
    state.masteryMean === null
  ) {
    // Unknown is not weak.
    return 0;
  }

  return clamp01(
    (1 - state.masteryMean) *
      state.masteryConfidence,
  );
}

function prerequisiteUnlockSignal(
  snapshot: PlanningSnapshotV2,
  candidate: PlanningCandidateV1,
  policy: CandidateScoringPolicyV1,
): number {
  if (candidate.curriculumUnitId === null) {
    return 0;
  }

  const directLockedDependents =
    snapshot.prerequisites.filter(
      (edge) =>
        edge.relation === "HARD" &&
        edge.prerequisiteUnitId ===
          candidate.curriculumUnitId &&
        !unitCompleted(
          snapshot,
          edge.curriculumUnitId,
        ),
    );

  return clamp01(
    directLockedDependents.length /
      policy.maxUnlockCount,
  );
}

function forgettingRiskSignal(
  snapshot: PlanningSnapshotV2,
  state: LearnerUnitStateV1 | undefined,
  policy: CandidateScoringPolicyV1,
): number {
  if (!state) {
    return 0;
  }

  if (state.retrievability !== null) {
    return clamp01(1 - state.retrievability);
  }

  if (state.lastStudiedAt === null) {
    return 0;
  }

  const studiedDate = datePart(
    state.lastStudiedAt,
  );

  const elapsedDays = Math.max(
    daysBetween(
      studiedDate,
      snapshot.meta.currentDate,
    ),
    0,
  );

  return clamp01(
    elapsedDays /
      policy.forgettingHorizonDays,
  );
}

function deadlineUrgencySignal(
  snapshot: PlanningSnapshotV2,
  candidate: PlanningCandidateV1,
): number {
  const daysUntilLatest = daysBetween(
    snapshot.meta.currentDate,
    candidate.latestDate,
  );

  if (daysUntilLatest <= 0) {
    return 1;
  }

  return clamp01(
    1 - Math.min(daysUntilLatest / 7, 1),
  );
}

function continuitySignal(
  snapshot: PlanningSnapshotV2,
  candidate: PlanningCandidateV1,
  state: LearnerUnitStateV1 | undefined,
  policy: CandidateScoringPolicyV1,
): number {
  if (candidate.candidateType === "CONTINUATION") {
    return 1;
  }

  if (candidate.curriculumUnitId !== null) {
    const partialExists =
      snapshot.existingTasks.some(
        (task) =>
          task.curriculumUnitId ===
            candidate.curriculumUnitId &&
          task.isPartiallyCompleted &&
          !task.isCompleted &&
          task.remainingMinutes > 0,
      );

    if (partialExists) {
      return 0.85;
    }
  }

  if (
    state?.lastStudiedAt !== null &&
    state?.lastStudiedAt !== undefined &&
    (
      candidate.candidateType ===
        "QUESTION_PRACTICE" ||
      candidate.candidateType ===
        "WRONG_REVIEW" ||
      candidate.candidateType ===
        "RETRIEVAL"
    )
  ) {
    const elapsedDays = Math.max(
      daysBetween(
        datePart(state.lastStudiedAt),
        snapshot.meta.currentDate,
      ),
      0,
    );

    if (
      elapsedDays <=
      policy.freshContinuityDays
    ) {
      return 0.6;
    }
  }

  return 0;
}

function learnerPreferenceSignal(
  candidate: PlanningCandidateV1,
  signals: CandidateScoringSignalsV1,
): number {
  if (candidate.subjectId === null) {
    return 0;
  }

  const value =
    signals.learnerPreferenceBySubject?.[
      candidate.subjectId
    ];

  if (value === undefined) {
    return 0;
  }

  return validateProbability(
    `learnerPreference:${candidate.subjectId}`,
    value,
  );
}

export function scorePlanningCandidateV1(
  snapshot: PlanningSnapshotV2,
  candidate: PlanningCandidateV1,
  signals: CandidateScoringSignalsV1 = {},
  policy: CandidateScoringPolicyV1 =
    DEFAULT_CANDIDATE_SCORING_POLICY_V1,
): PlanningCandidateV1 {
  validatePolicy(policy);

  const state = learnerStateFor(
    snapshot,
    candidate.curriculumUnitId,
  );

  const examImportance =
    examImportanceSignal(
      candidate,
      signals,
      policy,
    );

  const masteryGap =
    masteryGapSignal(state);

  const prerequisiteUnlockValue =
    prerequisiteUnlockSignal(
      snapshot,
      candidate,
      policy,
    );

  const forgettingRisk =
    forgettingRiskSignal(
      snapshot,
      state,
      policy,
    );

  const deadlineUrgency =
    deadlineUrgencySignal(
      snapshot,
      candidate,
    );

  const continuityValue =
    continuitySignal(
      snapshot,
      candidate,
      state,
      policy,
    );

  const learnerPreference =
    learnerPreferenceSignal(
      candidate,
      signals,
    );

  const breakdown: CandidateScoreBreakdown =
    Object.freeze({
      examImportance: roundScore(
        examImportance *
          policy.weights.examImportance,
      ),

      masteryGap: roundScore(
        masteryGap *
          policy.weights.masteryGap,
      ),

      prerequisiteUnlockValue: roundScore(
        prerequisiteUnlockValue *
          policy.weights.prerequisiteUnlockValue,
      ),

      forgettingRisk: roundScore(
        forgettingRisk *
          policy.weights.forgettingRisk,
      ),

      deadlineUrgency: roundScore(
        deadlineUrgency *
          policy.weights.deadlineUrgency,
      ),

      continuityValue: roundScore(
        continuityValue *
          policy.weights.continuityValue,
      ),

      learnerPreference: roundScore(
        learnerPreference *
          policy.weights.learnerPreference,
      ),

      total: 0,
    });

  const total = roundScore(
    breakdown.examImportance +
      breakdown.masteryGap +
      breakdown.prerequisiteUnlockValue +
      breakdown.forgettingRisk +
      breakdown.deadlineUrgency +
      breakdown.continuityValue +
      breakdown.learnerPreference,
  );

  const finalBreakdown:
    CandidateScoreBreakdown =
    Object.freeze({
      ...breakdown,
      total,
    });

  return Object.freeze({
    ...candidate,
    score: total,
    scoreBreakdown: finalBreakdown,
  });
}

export function scorePlanningCandidatesV1(
  input: ScorePlanningCandidatesV1Input,
): ScorePlanningCandidatesV1Result {
  const policy =
    input.policy ??
    DEFAULT_CANDIDATE_SCORING_POLICY_V1;

  validatePolicy(policy);

  const scored = input.candidates.map(
    (candidate) =>
      scorePlanningCandidateV1(
        input.snapshot,
        candidate,
        input.signals ?? {},
        policy,
      ),
  );

  scored.sort((a, b) => {
    if (a.hardEligible !== b.hardEligible) {
      return a.hardEligible ? -1 : 1;
    }

    if (a.score !== b.score) {
      return b.score - a.score;
    }

    return a.candidateId.localeCompare(
      b.candidateId,
    );
  });

  const candidates = Object.freeze(scored);

  const eligibleCandidates = Object.freeze(
    candidates.filter(
      (candidate) => candidate.hardEligible,
    ),
  );

  const blockedCandidates = Object.freeze(
    candidates.filter(
      (candidate) => !candidate.hardEligible,
    ),
  );

  return Object.freeze({
    candidates,
    eligibleCandidates,
    blockedCandidates,

    topEligibleCandidateId:
      eligibleCandidates[0]?.candidateId ??
      null,
  });
}
