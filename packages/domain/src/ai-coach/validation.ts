import {
  AI_COACH_INTENTS_V1,
  AI_EVIDENCE_TYPES_V1,
  type AiCoachIntentV1,
  type AiEvidenceV1,
  type AiInterpretationV1,
  type AiInterpretationValidationResultV1,
  type AiValidationIssueV1,
  type CapacityChangeDirectionV1,
} from "./types";

type UnknownRecord = Record<string, unknown>;

const INTERPRETATION_KEYS = new Set([
  "intent",
  "confidence",
  "needsClarification",
  "clarificationQuestion",
  "effectiveDate",
  "subjectHint",
  "curriculumHint",
  "reasonCode",
  "evidence",
  "materialCoachingSummary",
]);

const EVIDENCE_BASE_KEYS = [
  "type",
  "confidence",
  "effectiveDate",
  "subjectHint",
  "curriculumHint",
  "reasonCode",
] as const;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function issue(
  issues: AiValidationIssueV1[],
  path: string,
  code: string,
  message: string,
): void {
  issues.push(Object.freeze({ path, code, message }));
}

function rejectUnknownKeys(
  value: UnknownRecord,
  allowed: ReadonlySet<string>,
  path: string,
  issues: AiValidationIssueV1[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      issue(issues, `${path}.${key}`, "UNKNOWN_FIELD", "Unknown field is not allowed.");
    }
  }
}

function optionalText(
  value: unknown,
  path: string,
  issues: AiValidationIssueV1[],
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    issue(issues, path, "INVALID_TEXT", "Expected text or null.");
    return null;
  }
  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}

function confidence(
  value: unknown,
  path: string,
  issues: AiValidationIssueV1[],
): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    issue(issues, path, "INVALID_CONFIDENCE", "Confidence must be between 0 and 1.");
    return 0;
  }
  return value;
}

function isoDate(
  value: unknown,
  path: string,
  issues: AiValidationIssueV1[],
): string | null {
  const normalized = optionalText(value, path, issues);
  if (normalized === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    issue(issues, path, "INVALID_DATE", "Expected a YYYY-MM-DD date.");
    return null;
  }
  const parsed = new Date(`${normalized}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    issue(issues, path, "INVALID_DATE", "Date does not exist.");
    return null;
  }
  return normalized;
}

function minutes(
  value: unknown,
  path: string,
  allowZero: boolean,
  issues: AiValidationIssueV1[],
): number | null {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    (allowZero ? value < 0 : value <= 0)
  ) {
    issue(
      issues,
      path,
      "INVALID_MINUTES",
      allowZero ? "Minutes must be a nonnegative integer." : "Minutes must be a positive integer.",
    );
    return null;
  }
  return value;
}

function parseEvidence(
  raw: unknown,
  index: number,
  needsClarification: boolean,
  issues: AiValidationIssueV1[],
): AiEvidenceV1 | null {
  const path = `evidence[${index}]`;
  if (!isRecord(raw)) {
    issue(issues, path, "INVALID_EVIDENCE", "Evidence must be an object.");
    return null;
  }

  const evidenceType = raw.type;
  if (
    typeof evidenceType !== "string" ||
    !(AI_EVIDENCE_TYPES_V1 as readonly string[]).includes(evidenceType)
  ) {
    issue(issues, `${path}.type`, "UNKNOWN_EVIDENCE_TYPE", "Unsupported evidence type.");
    return null;
  }

  const capacity = evidenceType === "CAPACITY_CHANGE_REQUEST";
  rejectUnknownKeys(
    raw,
    new Set(capacity
      ? [...EVIDENCE_BASE_KEYS, "direction", "deltaMinutes", "targetMinutes"]
      : EVIDENCE_BASE_KEYS),
    path,
    issues,
  );

  const base = {
    type: evidenceType,
    confidence: confidence(raw.confidence, `${path}.confidence`, issues),
    effectiveDate: isoDate(raw.effectiveDate, `${path}.effectiveDate`, issues),
    subjectHint: optionalText(raw.subjectHint, `${path}.subjectHint`, issues),
    curriculumHint: optionalText(raw.curriculumHint, `${path}.curriculumHint`, issues),
    reasonCode: optionalText(raw.reasonCode, `${path}.reasonCode`, issues),
  } as const;

  if (!capacity) return Object.freeze(base) as AiEvidenceV1;

  const direction = raw.direction;
  if (
    direction !== undefined &&
    direction !== null &&
    direction !== "INCREASE" &&
    direction !== "DECREASE"
  ) {
    issue(issues, `${path}.direction`, "INVALID_DIRECTION", "Direction must be INCREASE or DECREASE.");
  }
  const normalizedDirection =
    direction === "INCREASE" || direction === "DECREASE"
      ? direction as CapacityChangeDirectionV1
      : null;
  const deltaMinutes = minutes(raw.deltaMinutes, `${path}.deltaMinutes`, false, issues);
  const targetMinutes = minutes(raw.targetMinutes, `${path}.targetMinutes`, true, issues);

  if (deltaMinutes !== null && normalizedDirection === null) {
    issue(issues, `${path}.direction`, "MISSING_DIRECTION", "A delta requires an explicit direction.");
  }
  if (deltaMinutes !== null && targetMinutes !== null) {
    issue(issues, path, "AMBIGUOUS_CAPACITY", "Use deltaMinutes or targetMinutes, not both.");
  }
  if (deltaMinutes === null && targetMinutes === null && !needsClarification) {
    issue(issues, path, "MISSING_CAPACITY_AMOUNT", "A capacity amount or clarification is required.");
  }

  return Object.freeze({
    ...base,
    type: "CAPACITY_CHANGE_REQUEST",
    direction: normalizedDirection,
    deltaMinutes,
    targetMinutes,
  });
}

export function validateAiInterpretationV1(
  raw: unknown,
): AiInterpretationValidationResultV1 {
  const issues: AiValidationIssueV1[] = [];
  if (!isRecord(raw)) {
    return Object.freeze({
      status: "INVALID",
      value: null,
      issues: Object.freeze([
        Object.freeze({
          path: "$",
          code: "INVALID_RESPONSE",
          message: "AI response must be an object.",
        }),
      ]),
    });
  }

  rejectUnknownKeys(raw, INTERPRETATION_KEYS, "$", issues);

  const intent = raw.intent;
  if (
    typeof intent !== "string" ||
    !(AI_COACH_INTENTS_V1 as readonly string[]).includes(intent)
  ) {
    issue(issues, "$.intent", "UNKNOWN_INTENT", "Unsupported AI intent.");
  }

  const needsClarification = raw.needsClarification;
  if (typeof needsClarification !== "boolean") {
    issue(issues, "$.needsClarification", "INVALID_BOOLEAN", "needsClarification must be boolean.");
  }
  const clarification = needsClarification === true;
  const clarificationQuestion = optionalText(
    raw.clarificationQuestion,
    "$.clarificationQuestion",
    issues,
  );
  if (clarification && clarificationQuestion === null) {
    issue(issues, "$.clarificationQuestion", "MISSING_CLARIFICATION", "A clarification question is required.");
  }
  if (!clarification && clarificationQuestion !== null) {
    issue(issues, "$.clarificationQuestion", "UNEXPECTED_CLARIFICATION", "Question requires needsClarification=true.");
  }

  const rawEvidence = raw.evidence;
  if (!Array.isArray(rawEvidence)) {
    issue(issues, "$.evidence", "INVALID_EVIDENCE", "Evidence must be an array.");
  }
  const evidence = Array.isArray(rawEvidence)
    ? rawEvidence
        .map((item, index) => parseEvidence(item, index, clarification, issues))
        .filter((item): item is AiEvidenceV1 => item !== null)
    : [];

  const capacityEvidence = evidence.filter(
    (item) => item.type === "CAPACITY_CHANGE_REQUEST",
  );
  if (capacityEvidence.length > 1) {
    issue(issues, "$.evidence", "MULTIPLE_CAPACITY_REQUESTS", "Only one capacity request is allowed.");
  }
  if (intent === "CAPACITY_CHANGE" && capacityEvidence.length !== 1) {
    issue(issues, "$.evidence", "CAPACITY_EVIDENCE_REQUIRED", "Capacity intent requires one capacity request.");
  }

  const materialCoachingSummary = raw.materialCoachingSummary === undefined
    ? undefined
    : optionalText(
        raw.materialCoachingSummary,
        "$.materialCoachingSummary",
        issues,
      );

  const normalized: AiInterpretationV1 = Object.freeze({
    intent: (intent as AiCoachIntentV1),
    confidence: confidence(raw.confidence, "$.confidence", issues),
    needsClarification: clarification,
    clarificationQuestion,
    effectiveDate: isoDate(raw.effectiveDate, "$.effectiveDate", issues),
    subjectHint: optionalText(raw.subjectHint, "$.subjectHint", issues),
    curriculumHint: optionalText(raw.curriculumHint, "$.curriculumHint", issues),
    reasonCode: optionalText(raw.reasonCode, "$.reasonCode", issues),
    evidence: Object.freeze(evidence),
    ...(materialCoachingSummary !== undefined ? { materialCoachingSummary } : {}),
  });

  if (issues.length > 0) {
    return Object.freeze({
      status: "INVALID",
      value: null,
      issues: Object.freeze(issues),
    });
  }

  return Object.freeze({
    status: clarification ? "NEEDS_CLARIFICATION" : "VALID",
    value: normalized,
    issues: Object.freeze([]) as readonly [],
  });
}
