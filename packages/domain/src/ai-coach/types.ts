export const AI_COACH_INTENTS_V1 = [
  "STUDY_FEEDBACK",
  "CAPACITY_CHANGE",
  "MASTERY_FEEDBACK",
  "MISSED_STUDY",
  "GENERAL_COACHING",
] as const;

export type AiCoachIntentV1 =
  (typeof AI_COACH_INTENTS_V1)[number];

export const AI_EVIDENCE_TYPES_V1 = [
  "STUDY_DIFFICULTY",
  "COGNITIVE_FATIGUE",
  "CAPACITY_CHANGE_REQUEST",
  "STUDY_PROGRESS_NOTE",
  "MASTERY_SELF_REPORT",
  "MISSED_STUDY_REASON",
  "GENERAL_COACH_MESSAGE",
] as const;

export type AiEvidenceTypeV1 =
  (typeof AI_EVIDENCE_TYPES_V1)[number];

export type CapacityChangeDirectionV1 = "INCREASE" | "DECREASE";

export interface AiEvidenceBaseV1 {
  readonly type: AiEvidenceTypeV1;
  readonly confidence: number;
  readonly effectiveDate: string | null;
  readonly subjectHint: string | null;
  readonly curriculumHint: string | null;
  readonly reasonCode: string | null;
}

export interface CapacityChangeRequestEvidenceV1
  extends AiEvidenceBaseV1 {
  readonly type: "CAPACITY_CHANGE_REQUEST";
  readonly direction: CapacityChangeDirectionV1 | null;
  readonly deltaMinutes: number | null;
  readonly targetMinutes: number | null;
}

export interface NonCapacityAiEvidenceV1 extends AiEvidenceBaseV1 {
  readonly type: Exclude<AiEvidenceTypeV1, "CAPACITY_CHANGE_REQUEST">;
}

export type AiEvidenceV1 =
  | CapacityChangeRequestEvidenceV1
  | NonCapacityAiEvidenceV1;

export type AiMaterialCoachingFocusV1 =
  | "PAGE"
  | "VIDEO"
  | "MIXED"
  | "COMPLETE";

export interface AiMaterialCoachingContextV1 {
  readonly resourceName: string;
  readonly remainingPages: number | null;
  readonly remainingVideoMinutes: number | null;
  readonly totalRemainingMinutes: number;
  readonly focus: AiMaterialCoachingFocusV1;
}

export interface AiInterpretationV1 {
  readonly intent: AiCoachIntentV1;
  readonly confidence: number;
  readonly needsClarification: boolean;
  readonly clarificationQuestion: string | null;
  readonly effectiveDate: string | null;
  readonly subjectHint: string | null;
  readonly curriculumHint: string | null;
  readonly reasonCode: string | null;
  readonly evidence: readonly AiEvidenceV1[];
  readonly materialCoachingSummary?: string | null;
}

export interface StudyMessageInputV1 {
  readonly message: string;
  readonly currentDate: string;
  readonly locale?: string;
  readonly knownSubjects?: readonly string[];
  readonly knownCurriculumLabels?: readonly string[];
  readonly materialContext?: readonly AiMaterialCoachingContextV1[];
}

export interface AiGatewayV1 {
  /** Provider output stays unknown until the validation boundary accepts it. */
  interpretStudyMessage(input: StudyMessageInputV1): Promise<unknown>;
}

export const AI_VALIDATION_STATUSES_V1 = [
  "VALID",
  "INVALID",
  "NEEDS_CLARIFICATION",
] as const;

export type AiValidationStatusV1 =
  (typeof AI_VALIDATION_STATUSES_V1)[number];

export interface AiValidationIssueV1 {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export type AiInterpretationValidationResultV1 =
  | {
      readonly status: "INVALID";
      readonly value: null;
      readonly issues: readonly AiValidationIssueV1[];
    }
  | {
      readonly status: "VALID" | "NEEDS_CLARIFICATION";
      readonly value: AiInterpretationV1;
      readonly issues: readonly [];
    };
