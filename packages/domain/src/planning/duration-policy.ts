export type StudyBlockClass =
  | "new_learning"
  | "guided_practice"
  | "primary_practice"
  | "reinforcement"
  | "error_review"
  | "spaced_review";

export const STUDY_BLOCK_DURATION_POLICY_VERSION = "pln-003-v1";

export interface StudyBlockDurationPolicy {
  minMinutes: number;
  preferredMinutes: number;
  maxMinutes: number;
}

export const STUDY_BLOCK_DURATION_POLICIES: Readonly<Record<StudyBlockClass, StudyBlockDurationPolicy>> = {
  new_learning: { minMinutes: 60, preferredMinutes: 75, maxMinutes: 90 },
  guided_practice: { minMinutes: 45, preferredMinutes: 60, maxMinutes: 75 },
  primary_practice: { minMinutes: 40, preferredMinutes: 50, maxMinutes: 60 },
  reinforcement: { minMinutes: 40, preferredMinutes: 50, maxMinutes: 60 },
  error_review: { minMinutes: 20, preferredMinutes: 30, maxMinutes: 40 },
  spaced_review: { minMinutes: 15, preferredMinutes: 25, maxMinutes: 30 },
};

export interface ResolveStudyBlockDurationInput {
  blockClass: StudyBlockClass;
  aiRecommendedMinutes?: number | null;
  aiConfidence?: number | null;
  remainderMinutes?: number | null;
  userOverrideMinutes?: number | null;
}

export interface StudyBlockDurationDecision {
  blockClass: StudyBlockClass;
  policyVersion: string;
  minutes: number;
  source: "deterministic_default" | "ai_normalized" | "remainder" | "user_override";
  policyDeviation: boolean;
  minMinutes: number;
  preferredMinutes: number;
  maxMinutes: number;
}

const AI_CONFIDENCE_THRESHOLD = 0.6;

function positiveMinutes(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return Math.max(1, Math.round(value));
}

function roundToFive(minutes: number): number {
  return Math.max(5, Math.round(minutes / 5) * 5);
}

export function resolveStudyBlockDuration(input: ResolveStudyBlockDurationInput): StudyBlockDurationDecision {
  const policy = STUDY_BLOCK_DURATION_POLICIES[input.blockClass];
  const base = {
    blockClass: input.blockClass,
    policyVersion: STUDY_BLOCK_DURATION_POLICY_VERSION,
    minMinutes: policy.minMinutes,
    preferredMinutes: policy.preferredMinutes,
    maxMinutes: policy.maxMinutes,
  };

  const userOverride = positiveMinutes(input.userOverrideMinutes);
  if (userOverride != null) {
    return {
      ...base,
      minutes: userOverride,
      source: "user_override",
      policyDeviation: userOverride < policy.minMinutes || userOverride > policy.maxMinutes,
    };
  }

  const remainder = positiveMinutes(input.remainderMinutes);
  if (remainder != null) {
    return { ...base, minutes: remainder, source: "remainder", policyDeviation: false };
  }

  const aiMinutes = positiveMinutes(input.aiRecommendedMinutes);
  const aiConfidence = input.aiConfidence;
  const aiAllowed = aiMinutes != null
    && (aiConfidence == null || (Number.isFinite(aiConfidence) && aiConfidence >= AI_CONFIDENCE_THRESHOLD));

  if (aiAllowed) {
    const normalized = Math.min(
      policy.maxMinutes,
      Math.max(policy.minMinutes, roundToFive(aiMinutes)),
    );
    return { ...base, minutes: normalized, source: "ai_normalized", policyDeviation: false };
  }

  return {
    ...base,
    minutes: policy.preferredMinutes,
    source: "deterministic_default",
    policyDeviation: false,
  };
}
