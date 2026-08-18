import type {
  IsoDateTimeV2,
  LearnerUnitStateV1,
  LearningEvidenceType,
} from "./types";

export const LEARNER_STATE_V1_CONFIG = Object.freeze({
  retrievalWeight: 5,
  mockExamWeightMultiplier: 1.25,
  confidenceScale: 40,
  maxStudyMinutesForConfidence: 240,
  studyMinutesPerConfidenceUnit: 30,
});

export interface LearningEvidenceV1 {
  readonly evidenceId: string;

  readonly userId: string;
  readonly examProfileId: string;
  readonly curriculumUnitId: string;

  readonly type: LearningEvidenceType;
  readonly occurredAt: IsoDateTimeV2;

  readonly studyMinutes?: number;

  readonly questionsCorrect?: number;
  readonly questionsTotal?: number;
  readonly questionSecondsTotal?: number;

  /**
   * Normalized retrieval quality in [0, 1].
   * Required for RETRIEVAL evidence.
   */
  readonly retrievalScore?: number;

  readonly misconceptionTags?: readonly string[];
}

export interface DeriveLearnerUnitStateV1Input {
  readonly userId: string;
  readonly examProfileId: string;
  readonly curriculumUnitId: string;
  readonly evidence: readonly LearningEvidenceV1[];
}

function assertFiniteNonNegative(
  name: string,
  value: number,
): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a finite non-negative number`);
  }
}

function assertIntegerNonNegative(
  name: string,
  value: number,
): void {
  assertFiniteNonNegative(name, value);

  if (!Number.isInteger(value)) {
    throw new Error(`${name} must be an integer`);
  }
}

function assertProbability(
  name: string,
  value: number,
): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be between 0 and 1`);
  }
}

function assertTimestamp(
  name: string,
  value: string,
): void {
  if (!Number.isFinite(Date.parse(value))) {
    throw new Error(`${name} must be a valid timestamp`);
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function laterTimestamp(
  current: string | null,
  candidate: string,
): string {
  if (current === null) {
    return candidate;
  }

  return Date.parse(candidate) > Date.parse(current)
    ? candidate
    : current;
}

function normalizedQuestionResult(
  evidence: LearningEvidenceV1,
): {
  readonly correct: number;
  readonly total: number;
} | null {
  if (evidence.type === "WRONG_ANSWER") {
    const total = evidence.questionsTotal ?? 1;
    const correct = evidence.questionsCorrect ?? 0;

    return { correct, total };
  }

  if (
    evidence.type !== "QUESTION_RESULT" &&
    evidence.type !== "MOCK_EXAM"
  ) {
    return null;
  }

  if (
    evidence.questionsCorrect === undefined ||
    evidence.questionsTotal === undefined ||
    evidence.questionsTotal <= 0
  ) {
    throw new Error(
      `${evidence.type} evidence requires questionsCorrect and positive questionsTotal`,
    );
  }

  return {
    correct: evidence.questionsCorrect,
    total: evidence.questionsTotal,
  };
}

function validateEvidence(
  input: DeriveLearnerUnitStateV1Input,
  evidence: LearningEvidenceV1,
): void {
  if (!evidence.evidenceId.trim()) {
    throw new Error("evidenceId must not be empty");
  }

  if (evidence.userId !== input.userId) {
    throw new Error(
      `learner evidence ownership mismatch: ${evidence.evidenceId}`,
    );
  }

  if (evidence.examProfileId !== input.examProfileId) {
    throw new Error(
      `learner evidence exam profile mismatch: ${evidence.evidenceId}`,
    );
  }

  if (evidence.curriculumUnitId !== input.curriculumUnitId) {
    throw new Error(
      `learner evidence curriculum unit mismatch: ${evidence.evidenceId}`,
    );
  }

  assertTimestamp(
    `${evidence.evidenceId}.occurredAt`,
    evidence.occurredAt,
  );

  if (evidence.studyMinutes !== undefined) {
    assertFiniteNonNegative(
      `${evidence.evidenceId}.studyMinutes`,
      evidence.studyMinutes,
    );
  }

  if (evidence.questionsCorrect !== undefined) {
    assertIntegerNonNegative(
      `${evidence.evidenceId}.questionsCorrect`,
      evidence.questionsCorrect,
    );
  }

  if (evidence.questionsTotal !== undefined) {
    assertIntegerNonNegative(
      `${evidence.evidenceId}.questionsTotal`,
      evidence.questionsTotal,
    );
  }

  if (
    evidence.questionsCorrect !== undefined &&
    evidence.questionsTotal !== undefined &&
    evidence.questionsCorrect > evidence.questionsTotal
  ) {
    throw new Error(
      `${evidence.evidenceId}.questionsCorrect cannot exceed questionsTotal`,
    );
  }

  if (evidence.questionSecondsTotal !== undefined) {
    assertFiniteNonNegative(
      `${evidence.evidenceId}.questionSecondsTotal`,
      evidence.questionSecondsTotal,
    );
  }

  if (evidence.retrievalScore !== undefined) {
    assertProbability(
      `${evidence.evidenceId}.retrievalScore`,
      evidence.retrievalScore,
    );
  }

  if (
    evidence.type === "RETRIEVAL" &&
    evidence.retrievalScore === undefined
  ) {
    throw new Error(
      `RETRIEVAL evidence requires retrievalScore: ${evidence.evidenceId}`,
    );
  }

  normalizedQuestionResult(evidence);
}

export function deriveLearnerUnitStateV1(
  input: DeriveLearnerUnitStateV1Input,
): LearnerUnitStateV1 {
  const seenEvidenceIds = new Set<string>();

  for (const evidence of input.evidence) {
    if (seenEvidenceIds.has(evidence.evidenceId)) {
      throw new Error(
        `duplicate learner evidence id: ${evidence.evidenceId}`,
      );
    }

    seenEvidenceIds.add(evidence.evidenceId);
    validateEvidence(input, evidence);
  }

  const orderedEvidence = [...input.evidence].sort((a, b) => {
    const timeDifference =
      Date.parse(a.occurredAt) - Date.parse(b.occurredAt);

    if (timeDifference !== 0) {
      return timeDifference;
    }

    return a.evidenceId.localeCompare(b.evidenceId);
  });

  let studyMinutes = 0;
  let questionCorrect = 0;
  let questionCount = 0;
  let questionSecondsTotal = 0;
  let timedQuestionCount = 0;

  let masteryWeightedScore = 0;
  let masteryWeight = 0;

  let lastStudiedAt: string | null = null;
  let lastRetrievalAt: string | null = null;
  let updatedAt: string | null = null;

  const misconceptionTags = new Set<string>();

  for (const evidence of orderedEvidence) {
    updatedAt = laterTimestamp(updatedAt, evidence.occurredAt);

    const evidenceStudyMinutes = evidence.studyMinutes ?? 0;
    studyMinutes += evidenceStudyMinutes;

    if (evidence.type !== "SELF_REPORT") {
      lastStudiedAt = laterTimestamp(
        lastStudiedAt,
        evidence.occurredAt,
      );
    }

    if (evidence.type === "RETRIEVAL") {
      lastRetrievalAt = laterTimestamp(
        lastRetrievalAt,
        evidence.occurredAt,
      );

      const score = evidence.retrievalScore!;

      masteryWeightedScore +=
        score * LEARNER_STATE_V1_CONFIG.retrievalWeight;

      masteryWeight +=
        LEARNER_STATE_V1_CONFIG.retrievalWeight;
    }

    const questionResult = normalizedQuestionResult(evidence);

    if (questionResult !== null) {
      questionCorrect += questionResult.correct;
      questionCount += questionResult.total;

      if (
        evidence.questionSecondsTotal !== undefined &&
        questionResult.total > 0
      ) {
        questionSecondsTotal += evidence.questionSecondsTotal;
        timedQuestionCount += questionResult.total;
      }

      const accuracy =
        questionResult.total === 0
          ? 0
          : questionResult.correct / questionResult.total;

      const weightMultiplier =
        evidence.type === "MOCK_EXAM"
          ? LEARNER_STATE_V1_CONFIG.mockExamWeightMultiplier
          : 1;

      const weight =
        Math.max(questionResult.total, 1) * weightMultiplier;

      masteryWeightedScore += accuracy * weight;
      masteryWeight += weight;
    }

    for (const tag of evidence.misconceptionTags ?? []) {
      const normalizedTag = tag.trim();

      if (normalizedTag) {
        misconceptionTags.add(normalizedTag);
      }
    }
  }

  const masteryMean =
    masteryWeight > 0
      ? clamp01(masteryWeightedScore / masteryWeight)
      : null;

  const cappedStudyMinutes = Math.min(
    studyMinutes,
    LEARNER_STATE_V1_CONFIG.maxStudyMinutesForConfidence,
  );

  const evidenceStrength =
    masteryWeight +
    cappedStudyMinutes /
      LEARNER_STATE_V1_CONFIG.studyMinutesPerConfidenceUnit;

  const masteryConfidence =
    evidenceStrength === 0
      ? 0
      : clamp01(
          1 -
            Math.exp(
              -evidenceStrength /
                LEARNER_STATE_V1_CONFIG.confidenceScale,
            ),
        );

  const questionAccuracy =
    questionCount > 0
      ? clamp01(questionCorrect / questionCount)
      : null;

  const averageQuestionSeconds =
    timedQuestionCount > 0
      ? questionSecondsTotal / timedQuestionCount
      : null;

  return Object.freeze({
    userId: input.userId,
    examProfileId: input.examProfileId,
    curriculumUnitId: input.curriculumUnitId,

    masteryMean,
    masteryConfidence,

    questionAccuracy,
    questionCount,
    averageQuestionSeconds,

    studyMinutes,
    evidenceCount: orderedEvidence.length,

    difficultyEstimate:
      masteryMean === null
        ? null
        : clamp01(1 - masteryMean),

    lastStudiedAt,
    lastRetrievalAt,

    // Memory-model fields intentionally remain unset in this commit.
    // They will be introduced by the spaced-memory phase rather than
    // fabricated from insufficient evidence.
    memoryStability: null,
    memoryDifficulty: null,
    retrievability: null,

    misconceptionTags: Object.freeze(
      [...misconceptionTags].sort(),
    ),

    updatedAt,
  });
}
