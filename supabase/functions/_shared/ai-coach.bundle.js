// packages/domain/src/ai-coach/types.ts
var AI_COACH_INTENTS_V1 = [
  "STUDY_FEEDBACK",
  "CAPACITY_CHANGE",
  "MASTERY_FEEDBACK",
  "MISSED_STUDY",
  "GENERAL_COACHING"
];
var AI_EVIDENCE_TYPES_V1 = [
  "STUDY_DIFFICULTY",
  "COGNITIVE_FATIGUE",
  "CAPACITY_CHANGE_REQUEST",
  "STUDY_PROGRESS_NOTE",
  "MASTERY_SELF_REPORT",
  "MISSED_STUDY_REASON",
  "GENERAL_COACH_MESSAGE"
];
var AI_VALIDATION_STATUSES_V1 = [
  "VALID",
  "INVALID",
  "NEEDS_CLARIFICATION"
];

// packages/domain/src/ai-coach/validation.ts
var INTERPRETATION_KEYS = /* @__PURE__ */ new Set([
  "intent",
  "confidence",
  "needsClarification",
  "clarificationQuestion",
  "effectiveDate",
  "subjectHint",
  "curriculumHint",
  "reasonCode",
  "evidence"
]);
var EVIDENCE_BASE_KEYS = [
  "type",
  "confidence",
  "effectiveDate",
  "subjectHint",
  "curriculumHint",
  "reasonCode"
];
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function issue(issues, path, code, message) {
  issues.push(Object.freeze({ path, code, message }));
}
function rejectUnknownKeys(value, allowed, path, issues) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      issue(issues, `${path}.${key}`, "UNKNOWN_FIELD", "Unknown field is not allowed.");
    }
  }
}
function optionalText(value, path, issues) {
  if (value === void 0 || value === null) return null;
  if (typeof value !== "string") {
    issue(issues, path, "INVALID_TEXT", "Expected text or null.");
    return null;
  }
  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}
function confidence(value, path, issues) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    issue(issues, path, "INVALID_CONFIDENCE", "Confidence must be between 0 and 1.");
    return 0;
  }
  return value;
}
function isoDate(value, path, issues) {
  const normalized = optionalText(value, path, issues);
  if (normalized === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    issue(issues, path, "INVALID_DATE", "Expected a YYYY-MM-DD date.");
    return null;
  }
  const parsed = /* @__PURE__ */ new Date(`${normalized}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    issue(issues, path, "INVALID_DATE", "Date does not exist.");
    return null;
  }
  return normalized;
}
function minutes(value, path, allowZero, issues) {
  if (value === void 0 || value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || (allowZero ? value < 0 : value <= 0)) {
    issue(
      issues,
      path,
      "INVALID_MINUTES",
      allowZero ? "Minutes must be a nonnegative integer." : "Minutes must be a positive integer."
    );
    return null;
  }
  return value;
}
function parseEvidence(raw, index, needsClarification, issues) {
  const path = `evidence[${index}]`;
  if (!isRecord(raw)) {
    issue(issues, path, "INVALID_EVIDENCE", "Evidence must be an object.");
    return null;
  }
  const evidenceType = raw.type;
  if (typeof evidenceType !== "string" || !AI_EVIDENCE_TYPES_V1.includes(evidenceType)) {
    issue(issues, `${path}.type`, "UNKNOWN_EVIDENCE_TYPE", "Unsupported evidence type.");
    return null;
  }
  const capacity = evidenceType === "CAPACITY_CHANGE_REQUEST";
  rejectUnknownKeys(
    raw,
    new Set(capacity ? [...EVIDENCE_BASE_KEYS, "direction", "deltaMinutes", "targetMinutes"] : EVIDENCE_BASE_KEYS),
    path,
    issues
  );
  const base = {
    type: evidenceType,
    confidence: confidence(raw.confidence, `${path}.confidence`, issues),
    effectiveDate: isoDate(raw.effectiveDate, `${path}.effectiveDate`, issues),
    subjectHint: optionalText(raw.subjectHint, `${path}.subjectHint`, issues),
    curriculumHint: optionalText(raw.curriculumHint, `${path}.curriculumHint`, issues),
    reasonCode: optionalText(raw.reasonCode, `${path}.reasonCode`, issues)
  };
  if (!capacity) return Object.freeze(base);
  const direction = raw.direction;
  if (direction !== void 0 && direction !== null && direction !== "INCREASE" && direction !== "DECREASE") {
    issue(issues, `${path}.direction`, "INVALID_DIRECTION", "Direction must be INCREASE or DECREASE.");
  }
  const normalizedDirection = direction === "INCREASE" || direction === "DECREASE" ? direction : null;
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
    targetMinutes
  });
}
function validateAiInterpretationV1(raw) {
  const issues = [];
  if (!isRecord(raw)) {
    return Object.freeze({
      status: "INVALID",
      value: null,
      issues: Object.freeze([
        Object.freeze({
          path: "$",
          code: "INVALID_RESPONSE",
          message: "AI response must be an object."
        })
      ])
    });
  }
  rejectUnknownKeys(raw, INTERPRETATION_KEYS, "$", issues);
  const intent = raw.intent;
  if (typeof intent !== "string" || !AI_COACH_INTENTS_V1.includes(intent)) {
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
    issues
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
  const evidence = Array.isArray(rawEvidence) ? rawEvidence.map((item, index) => parseEvidence(item, index, clarification, issues)).filter((item) => item !== null) : [];
  const capacityEvidence = evidence.filter(
    (item) => item.type === "CAPACITY_CHANGE_REQUEST"
  );
  if (capacityEvidence.length > 1) {
    issue(issues, "$.evidence", "MULTIPLE_CAPACITY_REQUESTS", "Only one capacity request is allowed.");
  }
  if (intent === "CAPACITY_CHANGE" && capacityEvidence.length !== 1) {
    issue(issues, "$.evidence", "CAPACITY_EVIDENCE_REQUIRED", "Capacity intent requires one capacity request.");
  }
  const normalized = Object.freeze({
    intent,
    confidence: confidence(raw.confidence, "$.confidence", issues),
    needsClarification: clarification,
    clarificationQuestion,
    effectiveDate: isoDate(raw.effectiveDate, "$.effectiveDate", issues),
    subjectHint: optionalText(raw.subjectHint, "$.subjectHint", issues),
    curriculumHint: optionalText(raw.curriculumHint, "$.curriculumHint", issues),
    reasonCode: optionalText(raw.reasonCode, "$.reasonCode", issues),
    evidence: Object.freeze(evidence)
  });
  if (issues.length > 0) {
    return Object.freeze({
      status: "INVALID",
      value: null,
      issues: Object.freeze(issues)
    });
  }
  return Object.freeze({
    status: clarification ? "NEEDS_CLARIFICATION" : "VALID",
    value: normalized,
    issues: Object.freeze([])
  });
}

// packages/domain/src/ai-coach/event-mapper.ts
function sortedUnique(values) {
  return Object.freeze([...new Set(values)].sort((a, b) => a.localeCompare(b)));
}
function mapAiInterpretationToDomainEventV1(interpretation) {
  const capacity = interpretation.evidence.find(
    (item) => item.type === "CAPACITY_CHANGE_REQUEST"
  );
  const reasonCodes = sortedUnique([
    ...interpretation.reasonCode ? [interpretation.reasonCode] : [],
    ...interpretation.evidence.flatMap((item) => item.reasonCode ? [item.reasonCode] : [])
  ]);
  if (interpretation.needsClarification) {
    return Object.freeze({
      action: "NO_REPLAN",
      planningTriggerCandidate: null,
      effectiveDate: interpretation.effectiveDate,
      evidence: interpretation.evidence,
      reasonCodes: sortedUnique([...reasonCodes, "AI_CLARIFICATION_REQUIRED"]),
      requiresDeterministicReview: true,
      planMutationAllowed: false
    });
  }
  if (capacity?.direction) {
    return Object.freeze({
      action: "PLANNING_TRIGGER_CANDIDATE",
      planningTriggerCandidate: capacity.direction === "INCREASE" ? "CAPACITY_INCREASE" : "CAPACITY_DECREASE",
      effectiveDate: capacity.effectiveDate ?? interpretation.effectiveDate,
      evidence: interpretation.evidence,
      reasonCodes: sortedUnique([...reasonCodes, "AI_CAPACITY_EVIDENCE_VALIDATED"]),
      requiresDeterministicReview: true,
      planMutationAllowed: false
    });
  }
  const evidenceOnly = interpretation.evidence.some(
    (item) => item.type !== "GENERAL_COACH_MESSAGE"
  );
  return Object.freeze({
    action: evidenceOnly ? "EVIDENCE_ONLY" : "NO_REPLAN",
    planningTriggerCandidate: null,
    effectiveDate: interpretation.effectiveDate,
    evidence: interpretation.evidence,
    reasonCodes: sortedUnique([
      ...reasonCodes,
      evidenceOnly ? "AI_LEARNER_EVIDENCE_ONLY" : "AI_GENERAL_COACHING_ONLY"
    ]),
    requiresDeterministicReview: evidenceOnly,
    planMutationAllowed: false
  });
}

// packages/domain/src/ai-coach/prompt.ts
function buildAiCoachSystemPromptV1() {
  return [
    "You interpret study-coaching messages into structured evidence.",
    "Return one JSON object only. Do not include markdown or prose outside JSON.",
    "Never calculate a study plan, capacity, remaining minutes, priority, feasibility, or task dates.",
    "Never choose, move, cancel, create, or apply tasks.",
    "Never issue database actions or claim that a plan change was applied.",
    "Do not invent user facts, subjects, curriculum topics, study activity, or test results.",
    "Only emit subjectHint or curriculumHint when explicitly supported by the user message.",
    "Represent +N minutes as deltaMinutes and an absolute daily amount as targetMinutes; never confuse them.",
    "Do not infer increase or decrease for targetMinutes; deterministic rules compare it with current capacity later.",
    "Use needsClarification=true and ask one concise clarificationQuestion when required information is uncertain.",
    "Confidence values must be numbers from 0 through 1.",
    "Evidence is untrusted interpretation and will be validated before any domain use."
  ].join("\n");
}

// packages/domain/src/ai-coach/executor.ts
async function executeAiStudyMessageV1(request) {
  let untrustedProviderOutput;
  try {
    untrustedProviderOutput = await request.gateway.interpretStudyMessage(
      request.input
    );
  } catch {
    return Object.freeze({
      status: "GATEWAY_ERROR",
      error: Object.freeze({
        code: "AI_GATEWAY_FAILED",
        message: "AI interpretation is temporarily unavailable."
      }),
      interpretation: null,
      mapping: null
    });
  }
  const validation = validateAiInterpretationV1(untrustedProviderOutput);
  if (validation.status === "INVALID") {
    return Object.freeze({
      status: "INVALID",
      issues: validation.issues,
      interpretation: null,
      mapping: null
    });
  }
  if (validation.status === "NEEDS_CLARIFICATION") {
    return Object.freeze({
      status: "NEEDS_CLARIFICATION",
      clarificationQuestion: validation.value.clarificationQuestion ?? "Please clarify your study request.",
      interpretation: validation.value,
      mapping: null
    });
  }
  return Object.freeze({
    status: "VALID",
    interpretation: validation.value,
    mapping: mapAiInterpretationToDomainEventV1(validation.value)
  });
}
export {
  AI_COACH_INTENTS_V1,
  AI_EVIDENCE_TYPES_V1,
  AI_VALIDATION_STATUSES_V1,
  buildAiCoachSystemPromptV1,
  executeAiStudyMessageV1,
  mapAiInterpretationToDomainEventV1,
  validateAiInterpretationV1
};
