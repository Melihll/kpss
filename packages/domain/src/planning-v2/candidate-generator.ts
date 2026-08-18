import type {
  CandidateScoreBreakdown,
  CandidateType,
  IsoDateV2,
  LearnerUnitStateV1,
  PlanningCandidateV1,
  PlanningSnapshotV2,
} from "./types";

export interface CurriculumCandidateSourceV1 {
  readonly curriculumUnitId: string;
  readonly subjectId: string | null;
  readonly title: string;
  readonly resourceId: string | null;

  readonly estimatedMinutes: number;

  readonly earliestDate?: IsoDateV2 | null;
  readonly latestDate?: IsoDateV2 | null;

  readonly allowsNewLearning?: boolean;
  readonly supportsQuestionPractice?: boolean;
  readonly supportsMockExam?: boolean;

  readonly questionPracticeMinutes?: number;
  readonly reviewMinutes?: number;
  readonly retrievalMinutes?: number;
  readonly mockExamMinutes?: number;
}

export interface CandidateGenerationPolicyV1 {
  readonly weaknessMasteryThreshold: number;
  readonly weaknessConfidenceThreshold: number;
  readonly spacedReviewRetrievabilityThreshold: number;
}

export const DEFAULT_CANDIDATE_GENERATION_POLICY_V1:
  Readonly<CandidateGenerationPolicyV1> = Object.freeze({
    weaknessMasteryThreshold: 0.6,
    weaknessConfidenceThreshold: 0.35,
    spacedReviewRetrievabilityThreshold: 0.75,
  });

export interface GeneratePlanningCandidatesV1Input {
  readonly snapshot: PlanningSnapshotV2;
  readonly curriculumUnits: readonly CurriculumCandidateSourceV1[];
  readonly policy?: CandidateGenerationPolicyV1;
}

export interface CandidateGenerationResultV1 {
  readonly candidates: readonly PlanningCandidateV1[];
  readonly generatedCount: number;
  readonly eligibleCount: number;
  readonly blockedCount: number;
}

const ZERO_SCORE_BREAKDOWN: Readonly<CandidateScoreBreakdown> =
  Object.freeze({
    examImportance: 0,
    masteryGap: 0,
    prerequisiteUnlockValue: 0,
    forgettingRisk: 0,
    deadlineUrgency: 0,
    continuityValue: 0,
    learnerPreference: 0,
    total: 0,
  });

function maxDate(...values: readonly IsoDateV2[]): IsoDateV2 {
  return [...values].sort().at(-1)!;
}

function minDate(...values: readonly IsoDateV2[]): IsoDateV2 {
  return [...values].sort()[0]!;
}

function duration(
  preferred: number | undefined,
  fallback: number,
): number {
  const value = preferred ?? fallback;

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("candidate duration must be a positive finite number");
  }

  return value;
}

function learnerStateFor(
  snapshot: PlanningSnapshotV2,
  curriculumUnitId: string,
): LearnerUnitStateV1 | undefined {
  return snapshot.learnerStates.find(
    (state) => state.curriculumUnitId === curriculumUnitId,
  );
}

function isCurriculumUnitCompleted(
  snapshot: PlanningSnapshotV2,
  curriculumUnitId: string,
): boolean {
  return snapshot.existingTasks.some(
    (task) =>
      task.curriculumUnitId === curriculumUnitId &&
      task.isCompleted,
  );
}

function hasExistingTaskForUnit(
  snapshot: PlanningSnapshotV2,
  curriculumUnitId: string,
): boolean {
  return snapshot.existingTasks.some(
    (task) => task.curriculumUnitId === curriculumUnitId,
  );
}

function hardPrerequisiteIds(
  snapshot: PlanningSnapshotV2,
  curriculumUnitId: string,
): readonly string[] {
  return snapshot.prerequisites
    .filter(
      (edge) =>
        edge.curriculumUnitId === curriculumUnitId &&
        edge.relation === "HARD",
    )
    .map((edge) => edge.prerequisiteUnitId);
}

function unmetHardPrerequisiteIds(
  snapshot: PlanningSnapshotV2,
  curriculumUnitId: string,
): readonly string[] {
  return hardPrerequisiteIds(snapshot, curriculumUnitId).filter(
    (prerequisiteUnitId) =>
      !isCurriculumUnitCompleted(snapshot, prerequisiteUnitId),
  );
}

function candidateDateWindow(
  snapshot: PlanningSnapshotV2,
  source?: CurriculumCandidateSourceV1,
  existingPlannedDate?: IsoDateV2 | null,
): {
  readonly earliestDate: IsoDateV2;
  readonly latestDate: IsoDateV2;
  readonly valid: boolean;
} {
  const earliestCandidates: IsoDateV2[] = [
    snapshot.meta.currentDate,
    snapshot.meta.weekStart,
  ];

  if (source?.earliestDate) {
    earliestCandidates.push(source.earliestDate);
  }

  if (existingPlannedDate) {
    // Continuation candidates must not be pulled earlier merely because
    // today's capacity happens to be free.
    earliestCandidates.push(existingPlannedDate);
  }

  const latestCandidates: IsoDateV2[] = [
    snapshot.meta.weekEnd,
  ];

  if (source?.latestDate) {
    latestCandidates.push(source.latestDate);
  }

  if (snapshot.examDate) {
    latestCandidates.push(snapshot.examDate);
  }

  const earliestDate = maxDate(...earliestCandidates);
  const latestDate = minDate(...latestCandidates);

  return {
    earliestDate,
    latestDate,
    valid: earliestDate <= latestDate,
  };
}

function buildCandidate(
  input: {
    readonly snapshot: PlanningSnapshotV2;
    readonly source?: CurriculumCandidateSourceV1;
    readonly candidateType: CandidateType;
    readonly curriculumUnitId: string | null;
    readonly subjectId: string | null;
    readonly title: string;
    readonly estimatedMinutes: number;
    readonly sourceTaskId?: string | null;
    readonly sourceResourceId?: string | null;
    readonly explanationCodes: readonly string[];
    readonly ineligibilityCodes?: readonly string[];
    readonly existingPlannedDate?: IsoDateV2 | null;
  },
): PlanningCandidateV1 {
  const window = candidateDateWindow(
    input.snapshot,
    input.source,
    input.existingPlannedDate,
  );

  const ineligibilityCodes = [
    ...(input.ineligibilityCodes ?? []),
    ...(window.valid ? [] : ["DATE_WINDOW_EMPTY"]),
  ];

  const sourceIdentity =
    input.sourceTaskId ??
    input.curriculumUnitId ??
    "general";

  return Object.freeze({
    candidateId:
      `candidate:${input.candidateType}:${sourceIdentity}`,

    userId: input.snapshot.userId,
    curriculumUnitId: input.curriculumUnitId,
    subjectId: input.subjectId,

    candidateType: input.candidateType,
    title: input.title,

    estimatedMinutes: input.estimatedMinutes,

    earliestDate: window.earliestDate,
    latestDate: window.latestDate,

    hardEligible: ineligibilityCodes.length === 0,
    ineligibilityCodes: Object.freeze(ineligibilityCodes),

    // Candidate generation and scoring are intentionally separate.
    score: 0,
    scoreBreakdown: ZERO_SCORE_BREAKDOWN,

    explanationCodes: Object.freeze([
      ...input.explanationCodes,
    ]),

    sourceTaskId: input.sourceTaskId ?? null,
    sourceResourceId:
      input.sourceResourceId ??
      input.source?.resourceId ??
      null,
  });
}

function addCandidate(
  candidates: Map<string, PlanningCandidateV1>,
  candidate: PlanningCandidateV1,
): void {
  if (!candidates.has(candidate.candidateId)) {
    candidates.set(candidate.candidateId, candidate);
  }
}

export function generatePlanningCandidatesV1(
  input: GeneratePlanningCandidatesV1Input,
): CandidateGenerationResultV1 {
  const { snapshot } = input;

  const policy =
    input.policy ?? DEFAULT_CANDIDATE_GENERATION_POLICY_V1;

  const sourceByUnitId = new Map<
    string,
    CurriculumCandidateSourceV1
  >();

  for (const source of input.curriculumUnits) {
    if (sourceByUnitId.has(source.curriculumUnitId)) {
      throw new Error(
        `duplicate curriculum candidate source: ${source.curriculumUnitId}`,
      );
    }

    sourceByUnitId.set(source.curriculumUnitId, source);
  }

  const candidates = new Map<string, PlanningCandidateV1>();

  /*
   * 1. Existing partial work → CONTINUATION
   *
   * Active work is not turned into a scheduling candidate because it is
   * already executing and must remain frozen.
   */
  for (const task of snapshot.existingTasks) {
    if (
      task.isCompleted ||
      task.isActive ||
      !task.isPartiallyCompleted ||
      task.remainingMinutes <= 0
    ) {
      continue;
    }

    const source =
      task.curriculumUnitId === null
        ? undefined
        : sourceByUnitId.get(task.curriculumUnitId);

    addCandidate(
      candidates,
      buildCandidate({
        snapshot,
        source,

        candidateType: "CONTINUATION",

        curriculumUnitId: task.curriculumUnitId,
        subjectId: task.subjectId,

        title: task.title,
        estimatedMinutes: task.remainingMinutes,

        sourceTaskId: task.taskId,
        sourceResourceId: task.resourceId,

        existingPlannedDate: task.plannedDate,

        explanationCodes: [
          "PARTIAL_TASK_HAS_REMAINING_WORK",
          "PRESERVE_EXISTING_CONTINUITY",
        ],
      }),
    );
  }

  /*
   * 2. Curriculum-driven candidate families
   */
  for (const source of input.curriculumUnits) {
    const learnerState = learnerStateFor(
      snapshot,
      source.curriculumUnitId,
    );

    const unmetPrerequisites = unmetHardPrerequisiteIds(
      snapshot,
      source.curriculumUnitId,
    );

    const prerequisiteCodes = unmetPrerequisites.map(
      (id) => `PREREQUISITE_INCOMPLETE:${id}`,
    );

    /*
     * NEW_LEARNING
     *
     * Do not duplicate an already represented curriculum unit.
     */
    if (
      source.allowsNewLearning !== false &&
      !hasExistingTaskForUnit(
        snapshot,
        source.curriculumUnitId,
      )
    ) {
      addCandidate(
        candidates,
        buildCandidate({
          snapshot,
          source,

          candidateType: "NEW_LEARNING",

          curriculumUnitId: source.curriculumUnitId,
          subjectId: source.subjectId,

          title: source.title,
          estimatedMinutes: duration(
            source.estimatedMinutes,
            45,
          ),

          explanationCodes: [
            "CURRICULUM_UNIT_NOT_YET_SCHEDULED",
          ],

          ineligibilityCodes: prerequisiteCodes,
        }),
      );
    }

    /*
     * If a target unit is blocked, expose the missing prerequisite itself
     * as a repair candidate when its source exists.
     */
    for (const prerequisiteUnitId of unmetPrerequisites) {
      const prerequisiteSource =
        sourceByUnitId.get(prerequisiteUnitId);

      if (!prerequisiteSource) {
        continue;
      }

      const prerequisiteOwnUnmet =
        unmetHardPrerequisiteIds(
          snapshot,
          prerequisiteUnitId,
        );

      addCandidate(
        candidates,
        buildCandidate({
          snapshot,
          source: prerequisiteSource,

          candidateType: "PREREQUISITE_REPAIR",

          curriculumUnitId: prerequisiteUnitId,
          subjectId: prerequisiteSource.subjectId,

          title: prerequisiteSource.title,

          estimatedMinutes: duration(
            prerequisiteSource.reviewMinutes,
            prerequisiteSource.estimatedMinutes,
          ),

          explanationCodes: [
            `UNLOCKS:${source.curriculumUnitId}`,
          ],

          ineligibilityCodes:
            prerequisiteOwnUnmet.map(
              (id) => `PREREQUISITE_INCOMPLETE:${id}`,
            ),
        }),
      );
    }

    if (!learnerState) {
      continue;
    }

    /*
     * QUESTION_PRACTICE
     */
    if (
      source.supportsQuestionPractice &&
      (
        learnerState.studyMinutes > 0 ||
        learnerState.masteryMean !== null
      )
    ) {
      addCandidate(
        candidates,
        buildCandidate({
          snapshot,
          source,

          candidateType: "QUESTION_PRACTICE",

          curriculumUnitId: source.curriculumUnitId,
          subjectId: source.subjectId,

          title: `${source.title} — soru pratiği`,

          estimatedMinutes: duration(
            source.questionPracticeMinutes,
            Math.min(source.estimatedMinutes, 30),
          ),

          explanationCodes: [
            "HAS_LEARNING_EVIDENCE",
            "QUESTION_PRACTICE_AVAILABLE",
          ],

          ineligibilityCodes: prerequisiteCodes,
        }),
      );
    }

    /*
     * WRONG_REVIEW
     */
    if (learnerState.misconceptionTags.length > 0) {
      addCandidate(
        candidates,
        buildCandidate({
          snapshot,
          source,

          candidateType: "WRONG_REVIEW",

          curriculumUnitId: source.curriculumUnitId,
          subjectId: source.subjectId,

          title: `${source.title} — yanlış analizi`,

          estimatedMinutes: duration(
            source.reviewMinutes,
            Math.min(source.estimatedMinutes, 20),
          ),

          explanationCodes: [
            "MISCONCEPTION_EVIDENCE_PRESENT",
          ],

          ineligibilityCodes: prerequisiteCodes,
        }),
      );
    }

    /*
     * RETRIEVAL
     *
     * Retrieval is due when the unit has been studied but no retrieval
     * exists after the most recent study evidence.
     */
    if (
      learnerState.lastStudiedAt !== null &&
      (
        learnerState.lastRetrievalAt === null ||
        Date.parse(learnerState.lastRetrievalAt) <
          Date.parse(learnerState.lastStudiedAt)
      )
    ) {
      addCandidate(
        candidates,
        buildCandidate({
          snapshot,
          source,

          candidateType: "RETRIEVAL",

          curriculumUnitId: source.curriculumUnitId,
          subjectId: source.subjectId,

          title: `${source.title} — hatırlama`,

          estimatedMinutes: duration(
            source.retrievalMinutes,
            Math.min(source.estimatedMinutes, 15),
          ),

          explanationCodes: [
            "RETRIEVAL_AFTER_LATEST_STUDY_MISSING",
          ],

          ineligibilityCodes: prerequisiteCodes,
        }),
      );
    }

    /*
     * WEAKNESS_REPAIR
     *
     * Weakness is asserted only when mastery evidence is sufficiently
     * confident. Unknown state is not treated as weak.
     */
    if (
      learnerState.masteryMean !== null &&
      learnerState.masteryConfidence >=
        policy.weaknessConfidenceThreshold &&
      learnerState.masteryMean <
        policy.weaknessMasteryThreshold
    ) {
      addCandidate(
        candidates,
        buildCandidate({
          snapshot,
          source,

          candidateType: "WEAKNESS_REPAIR",

          curriculumUnitId: source.curriculumUnitId,
          subjectId: source.subjectId,

          title: `${source.title} — zayıf alan onarımı`,

          estimatedMinutes: duration(
            source.reviewMinutes,
            Math.min(source.estimatedMinutes, 30),
          ),

          explanationCodes: [
            "CONFIDENT_MASTERY_GAP",
          ],

          ineligibilityCodes: prerequisiteCodes,
        }),
      );
    }

    /*
     * SPACED_REVIEW
     *
     * Memory values are currently null until the dedicated memory-model
     * phase. We intentionally do not invent them here.
     */
    if (
      learnerState.retrievability !== null &&
      learnerState.retrievability <=
        policy.spacedReviewRetrievabilityThreshold
    ) {
      addCandidate(
        candidates,
        buildCandidate({
          snapshot,
          source,

          candidateType: "SPACED_REVIEW",

          curriculumUnitId: source.curriculumUnitId,
          subjectId: source.subjectId,

          title: `${source.title} — aralıklı tekrar`,

          estimatedMinutes: duration(
            source.reviewMinutes,
            Math.min(source.estimatedMinutes, 20),
          ),

          explanationCodes: [
            "LOW_RETRIEVABILITY",
          ],

          ineligibilityCodes: prerequisiteCodes,
        }),
      );
    }

    if (source.supportsMockExam) {
      addCandidate(
        candidates,
        buildCandidate({
          snapshot,
          source,

          candidateType: "MOCK_EXAM",

          curriculumUnitId: source.curriculumUnitId,
          subjectId: source.subjectId,

          title: `${source.title} — deneme`,

          estimatedMinutes: duration(
            source.mockExamMinutes,
            source.estimatedMinutes,
          ),

          explanationCodes: [
            "MOCK_EXAM_AVAILABLE",
          ],

          ineligibilityCodes: prerequisiteCodes,
        }),
      );
    }
  }

  const ordered = [...candidates.values()].sort((a, b) => {
    return (
      (a.curriculumUnitId ?? "").localeCompare(
        b.curriculumUnitId ?? "",
      ) ||
      a.candidateType.localeCompare(b.candidateType) ||
      a.candidateId.localeCompare(b.candidateId)
    );
  });

  const frozenCandidates = Object.freeze(ordered);

  return Object.freeze({
    candidates: frozenCandidates,
    generatedCount: frozenCandidates.length,
    eligibleCount: frozenCandidates.filter(
      (candidate) => candidate.hardEligible,
    ).length,
    blockedCount: frozenCandidates.filter(
      (candidate) => !candidate.hardEligible,
    ).length,
  });
}
