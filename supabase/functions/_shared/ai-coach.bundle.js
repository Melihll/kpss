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
  "evidence",
  "materialCoachingSummary"
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
  const materialCoachingSummary = raw.materialCoachingSummary === void 0 ? void 0 : optionalText(
    raw.materialCoachingSummary,
    "$.materialCoachingSummary",
    issues
  );
  const normalized = Object.freeze({
    intent,
    confidence: confidence(raw.confidence, "$.confidence", issues),
    needsClarification: clarification,
    clarificationQuestion,
    effectiveDate: isoDate(raw.effectiveDate, "$.effectiveDate", issues),
    subjectHint: optionalText(raw.subjectHint, "$.subjectHint", issues),
    curriculumHint: optionalText(raw.curriculumHint, "$.curriculumHint", issues),
    reasonCode: optionalText(raw.reasonCode, "$.reasonCode", issues),
    evidence: Object.freeze(evidence),
    ...materialCoachingSummary !== void 0 ? { materialCoachingSummary } : {}
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
    "materialContext, when present, contains deterministic facts already calculated by the application.",
    "Never derive new material numbers, percentages, dates, workload totals, or comparisons from materialContext.",
    "Use the supplied focus value as authoritative; do not recompute which material side is heavier.",
    "Return materialCoachingSummary only when the user asks about materials, resources, progress, what to focus on, or general coaching where material progress is directly relevant; otherwise return null.",
    "materialCoachingSummary must be one concise Turkish coaching sentence grounded only in relevant supplied materialContext facts.",
    "Do not invent a resource, page count, video duration, progress percentage, finish date, or study claim in materialCoachingSummary.",
    "Never choose, move, cancel, create, or apply tasks.",
    "Never issue database actions or claim that a plan change was applied.",
    "Do not invent user facts, subjects, curriculum topics, study activity, or test results.",
    "Only emit subjectHint or curriculumHint when explicitly supported by the user message.",
    "Represent +N minutes as deltaMinutes and an absolute daily amount as targetMinutes; never confuse them.",
    "For relative capacity changes, always pair deltaMinutes with an explicit direction: use INCREASE for explicit more, extra, additional, add, or increase language (including Turkish: daha, ek, fazladan, art\u0131rabilirim); use DECREASE for explicit less, reduce, decrease, or subtract language (including Turkish: daha az, azalt, eksilt). Never emit deltaMinutes with direction=null.",
    "Do not infer increase or decrease for targetMinutes; deterministic rules compare it with current capacity later.",
    "Use needsClarification=true and ask one concise clarificationQuestion when required information is uncertain.",
    "Confidence values must be numbers from 0 through 1.",
    "Evidence is untrusted interpretation and will be validated before any domain use."
  ].join("\n");
}

// packages/domain/src/ai-coach/executor.ts
function materialSummaryIssue(interpretation, context) {
  const summary = interpretation.materialCoachingSummary?.trim() ?? "";
  if (!summary) return null;
  if (!context?.length) {
    return Object.freeze({
      path: "$.materialCoachingSummary",
      code: "MATERIAL_CONTEXT_REQUIRED",
      message: "Material coaching requires deterministic material context."
    });
  }
  if (summary.includes("%")) {
    return Object.freeze({
      path: "$.materialCoachingSummary",
      code: "UNSUPPORTED_MATERIAL_PERCENT",
      message: "Material coaching must not invent progress percentages."
    });
  }
  const allowedNumbers = /* @__PURE__ */ new Set();
  for (const item of context) {
    for (const value of [
      item.remainingPages,
      item.remainingVideoMinutes,
      item.totalRemainingMinutes
    ]) {
      if (typeof value === "number" && Number.isFinite(value)) {
        allowedNumbers.add(String(Math.max(0, Math.round(value))));
      }
    }
    for (const token of item.resourceName.match(/\d+/g) ?? []) {
      allowedNumbers.add(String(Number(token)));
    }
  }
  for (const token of summary.match(/\d+/g) ?? []) {
    if (!allowedNumbers.has(String(Number(token)))) {
      return Object.freeze({
        path: "$.materialCoachingSummary",
        code: "UNSUPPORTED_MATERIAL_NUMBER",
        message: "Material coaching may only repeat deterministic material numbers."
      });
    }
  }
  return null;
}
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
  const materialIssue = materialSummaryIssue(
    validation.value,
    request.input.materialContext
  );
  if (materialIssue) {
    return Object.freeze({
      status: "INVALID",
      issues: Object.freeze([materialIssue]),
      interpretation: null,
      mapping: null
    });
  }
  return Object.freeze({
    status: "VALID",
    interpretation: validation.value,
    mapping: mapAiInterpretationToDomainEventV1(validation.value)
  });
}

// packages/domain/src/ai-coach/coach-context-v1.ts
var COACH_CONTEXT_V1_VERSION = "coach-context-v1";
var COACH_CONTEXT_V1_TRUTH_SOURCES = [
  "authenticated_user",
  "coach_context_builder_v1",
  "request_context",
  "server_clock",
  "user_profiles",
  "exam_profiles",
  "subjects_catalog",
  "weekly_plans",
  "planning_task_state_v1",
  "study_intent_ledger",
  "capacity_projection_v1",
  "canonical_material_truth_v1",
  "canonical_workload_engine_v1",
  "planner_v2_snapshot",
  "planner_v2_lifecycle",
  "deterministic_signal_input_v1"
];
var COACH_CONTEXT_V1_LIMITS = Object.freeze({
  todayTasks: 24,
  weekTasks: 64,
  subjects: 24,
  materials: 48,
  recentTaskEvents: 32,
  recentSessions: 24,
  recentTransitions: 16,
  signalInputs: 32,
  provenanceRecordIdsPerFact: 64,
  serializedBytes: 65536
});
function knownCoachContextV1Fact(value, options) {
  return {
    availability: "known",
    value,
    freshness: {
      state: "fresh",
      asOf: options.asOf,
      expiresAt: options.expiresAt ?? null
    },
    confidence: options.confidence ?? "authoritative",
    provenance: options.provenance,
    unknownReason: null
  };
}
function unknownCoachContextV1Fact(reason, sources) {
  return {
    availability: "unknown",
    value: null,
    freshness: { state: "unknown", asOf: null, expiresAt: null },
    confidence: "none",
    provenance: sources.map((source) => ({ source, recordIds: [], asOf: null })),
    unknownReason: reason
  };
}
function staleCoachContextV1Fact(value, reason, options) {
  return {
    availability: "stale",
    value,
    freshness: {
      state: "stale",
      asOf: options.asOf,
      expiresAt: options.expiresAt ?? null
    },
    confidence: options.confidence ?? "none",
    provenance: options.provenance,
    unknownReason: reason
  };
}
function blockedCoachContextV1Fact(reason, sources, asOf = null) {
  return {
    availability: "blocked",
    value: null,
    freshness: {
      state: asOf === null ? "unknown" : "fresh",
      asOf,
      expiresAt: null
    },
    confidence: "none",
    provenance: sources.map((source) => ({ source, recordIds: [], asOf })),
    unknownReason: reason
  };
}
function notApplicableCoachContextV1Fact(reason, sources) {
  return {
    availability: "not_applicable",
    value: null,
    freshness: { state: "not_applicable", asOf: null, expiresAt: null },
    confidence: "none",
    provenance: sources.map((source) => ({ source, recordIds: [], asOf: null })),
    unknownReason: reason
  };
}
function compareNullable(left, right) {
  return (left ?? "~").localeCompare(right ?? "~");
}
function sortTasks(tasks) {
  return [...tasks].sort((left, right) => compareNullable(left.plannedDate, right.plannedDate) || left.taskId.localeCompare(right.taskId));
}
function sortNumberRecord(record) {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)));
}
function normalizeProvenance(provenance) {
  const normalized = [...provenance].map((item) => ({
    ...item,
    recordIds: [...new Set(item.recordIds)].sort()
  })).sort((left, right) => left.source.localeCompare(right.source) || (left.asOf ?? "").localeCompare(right.asOf ?? "") || left.recordIds.join("|").localeCompare(right.recordIds.join("|")));
  const unique = /* @__PURE__ */ new Map();
  for (const item of normalized) {
    unique.set(`${item.source}|${item.asOf ?? ""}|${item.recordIds.join("|")}`, item);
  }
  return [...unique.values()];
}
function normalizeFact(fact, mapValue) {
  const copy = structuredClone(fact);
  const value = copy.value !== null && mapValue ? mapValue(copy.value) : copy.value;
  return {
    ...copy,
    value,
    provenance: normalizeProvenance(copy.provenance)
  };
}
function assertNonBlank(name, value) {
  if (!value.trim()) throw new Error(`COACH_CONTEXT_V1_BLANK:${name}`);
}
function assertIsoDate(name, value) {
  const parsed = /* @__PURE__ */ new Date(`${value}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`COACH_CONTEXT_V1_INVALID_DATE:${name}`);
  }
}
function assertTimestamp(name, value) {
  if (value !== null && Number.isNaN(new Date(value).getTime())) {
    throw new Error(`COACH_CONTEXT_V1_INVALID_TIMESTAMP:${name}`);
  }
}
function assertFact(path, fact) {
  if (!fact.provenance.length) throw new Error(`COACH_CONTEXT_V1_PROVENANCE_REQUIRED:${path}`);
  if (fact.provenance.some((item) => item.recordIds.length > COACH_CONTEXT_V1_LIMITS.provenanceRecordIdsPerFact)) {
    throw new Error(`COACH_CONTEXT_V1_TOO_MANY_PROVENANCE_RECORDS:${path}`);
  }
  for (const item of fact.provenance) assertTimestamp(`${path}.provenance.asOf`, item.asOf);
  assertTimestamp(`${path}.freshness.asOf`, fact.freshness.asOf);
  assertTimestamp(`${path}.freshness.expiresAt`, fact.freshness.expiresAt);
  if ((fact.availability === "unknown" || fact.availability === "stale" || fact.availability === "blocked" || fact.availability === "not_applicable") && !fact.unknownReason.trim()) {
    throw new Error(`COACH_CONTEXT_V1_UNKNOWN_REASON_REQUIRED:${path}`);
  }
  if (fact.availability === "known" && fact.value === null) {
    throw new Error(`COACH_CONTEXT_V1_KNOWN_VALUE_REQUIRED:${path}`);
  }
  if (fact.availability === "known" && (fact.freshness.asOf === null || fact.confidence === "none")) {
    throw new Error(`COACH_CONTEXT_V1_KNOWN_METADATA_REQUIRED:${path}`);
  }
}
function walkFacts(value, path, visit) {
  if (!value || typeof value !== "object") return;
  const object = value;
  if (typeof object.availability === "string" && "freshness" in object && "provenance" in object && "unknownReason" in object) {
    const fact = value;
    visit(path, fact);
    if (fact.value !== null) walkFacts(fact.value, `${path}.value`, visit);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkFacts(item, `${path}[${index}]`, visit));
    return;
  }
  for (const key of Object.keys(object).sort()) {
    walkFacts(object[key], path ? `${path}.${key}` : key, visit);
  }
}
function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
function assertCompact(input) {
  const count = (fact) => fact.value?.length ?? 0;
  if ((input.today.value?.tasks.length ?? 0) > COACH_CONTEXT_V1_LIMITS.todayTasks) throw new Error("COACH_CONTEXT_V1_TOO_MANY_TODAY_TASKS");
  if ((input.week.value?.tasks.length ?? 0) > COACH_CONTEXT_V1_LIMITS.weekTasks) throw new Error("COACH_CONTEXT_V1_TOO_MANY_WEEK_TASKS");
  if (input.subjects.length > COACH_CONTEXT_V1_LIMITS.subjects) throw new Error("COACH_CONTEXT_V1_TOO_MANY_SUBJECTS");
  if (count(input.materials) > COACH_CONTEXT_V1_LIMITS.materials) throw new Error("COACH_CONTEXT_V1_TOO_MANY_MATERIALS");
  if ((input.recentProgress.value?.taskEvents.length ?? 0) > COACH_CONTEXT_V1_LIMITS.recentTaskEvents) throw new Error("COACH_CONTEXT_V1_TOO_MANY_TASK_EVENTS");
  if ((input.recentProgress.value?.sessions.length ?? 0) > COACH_CONTEXT_V1_LIMITS.recentSessions) throw new Error("COACH_CONTEXT_V1_TOO_MANY_SESSIONS");
  if ((input.recentProgress.value?.transitions.length ?? 0) > COACH_CONTEXT_V1_LIMITS.recentTransitions) throw new Error("COACH_CONTEXT_V1_TOO_MANY_TRANSITIONS");
  if (count(input.signalInputs) > COACH_CONTEXT_V1_LIMITS.signalInputs) throw new Error("COACH_CONTEXT_V1_TOO_MANY_SIGNAL_INPUTS");
}
function assertPln002Boundary(week) {
  if (week.value !== null && week.value.studyIntentCoverage !== "sufficient" && week.value.progressPosition.availability === "known") {
    throw new Error("COACH_CONTEXT_V1_PLN002_PROGRESS_POSITION_UNSUPPORTED");
  }
}
function assertNoInventedWorkloadFallback(materials) {
  for (const material of materials.value ?? []) {
    if (material.workload.value !== null && !["exact", "calibrated", "unknown"].includes(material.workload.value.authority)) {
      throw new Error("COACH_CONTEXT_V1_WORKLOAD_FALLBACK_FORBIDDEN");
    }
    if (material.workload.value?.authority === "unknown" && material.workload.value.estimatedMinutes !== null) {
      throw new Error("COACH_CONTEXT_V1_UNKNOWN_WORKLOAD_MINUTES_FORBIDDEN");
    }
  }
}
function buildCoachContextV1(input) {
  assertTimestamp("generatedAt", input.generatedAt);
  assertNonBlank("requestId", input.requestId);
  assertNonBlank("userId", input.userId);
  assertNonBlank("examProfileId", input.examProfileId);
  assertNonBlank("locale", input.locale);
  assertNonBlank("timezone", input.timezone);
  assertIsoDate("currentDate", input.currentDate);
  const normalized = {
    ...structuredClone(input),
    identity: normalizeFact(input.identity),
    today: normalizeFact(input.today, (today) => ({ ...today, tasks: sortTasks(today.tasks) })),
    week: normalizeFact(input.week, (week) => ({
      ...week,
      tasks: sortTasks(week.tasks),
      progressPosition: normalizeFact(week.progressPosition)
    })),
    subjects: [...input.subjects].map((subject) => ({
      ...structuredClone(subject),
      tasks: normalizeFact(subject.tasks),
      study: normalizeFact(subject.study),
      material: normalizeFact(subject.material)
    })).sort((left, right) => left.subjectName.localeCompare(right.subjectName, "tr") || left.subjectId.localeCompare(right.subjectId)),
    nextWork: normalizeFact(input.nextWork),
    materials: normalizeFact(input.materials, (materials) => [...materials].map((material) => ({ ...material, workload: normalizeFact(material.workload) })).sort((left, right) => left.resourceId.localeCompare(right.resourceId) || left.materialViewId.localeCompare(right.materialViewId))),
    workload: normalizeFact(input.workload, (workload) => ({
      ...workload,
      blockedByReason: sortNumberRecord(workload.blockedByReason),
      minutesBySubject: sortNumberRecord(workload.minutesBySubject),
      minutesByResource: sortNumberRecord(workload.minutesByResource)
    })),
    capacity: normalizeFact(input.capacity, (capacity) => ({
      ...capacity,
      days: [...capacity.days].map((day) => ({
        ...day,
        protectedMinutes: normalizeFact(day.protectedMinutes),
        availableMinutes: normalizeFact(day.availableMinutes)
      })).sort((left, right) => left.date.localeCompare(right.date))
    })),
    recentProgress: normalizeFact(input.recentProgress, (recent) => ({
      ...recent,
      taskEvents: [...recent.taskEvents].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.taskId.localeCompare(right.taskId)),
      sessions: [...recent.sessions].sort((left, right) => left.startedAt.localeCompare(right.startedAt) || left.sessionId.localeCompare(right.sessionId)),
      transitions: [...recent.transitions].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.transitionId.localeCompare(right.transitionId))
    })),
    planner: normalizeFact(input.planner, (planner) => ({
      ...planner,
      freshnessReasons: [...planner.freshnessReasons].sort(),
      differences: {
        createCanonicalWorkloadIdentities: [...planner.differences.createCanonicalWorkloadIdentities].sort(),
        retainedTaskIds: [...planner.differences.retainedTaskIds].sort(),
        replaceableTaskIds: [...planner.differences.replaceableTaskIds].sort(),
        outsideScopeTaskIds: [...planner.differences.outsideScopeTaskIds].sort()
      },
      warnings: [...planner.warnings].sort(),
      explanationFacts: [...planner.explanationFacts].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
    })),
    signalInputs: normalizeFact(input.signalInputs, (signals) => [...signals].sort((left, right) => left.key.localeCompare(right.key) || left.sourceFactPath.localeCompare(right.sourceFactPath)))
  };
  assertCompact(normalized);
  assertPln002Boundary(normalized.week);
  assertNoInventedWorkloadFallback(normalized.materials);
  const unknowns = [];
  const provenance = [];
  walkFacts(normalized, "", (path, fact) => {
    assertFact(path, fact);
    provenance.push(...fact.provenance);
    if (fact.availability === "unknown" || fact.availability === "stale" || fact.availability === "blocked") {
      unknowns.push({
        path,
        availability: fact.availability,
        reason: fact.unknownReason,
        sources: [...new Set(fact.provenance.map((item) => item.source))].sort()
      });
    }
  });
  const context = {
    version: COACH_CONTEXT_V1_VERSION,
    ...normalized,
    authority: {
      mode: "read_only",
      llmCallsAllowed: false,
      dbWritesAllowed: false,
      planningCalculationsAllowed: false,
      workloadRecalculationAllowed: false,
      taskMutationAllowed: false,
      capacityMutationAllowed: false,
      plannerConfirmationAllowed: false,
      plannerApplyAllowed: false
    },
    unknowns: unknowns.sort((left, right) => left.path.localeCompare(right.path)),
    provenance: normalizeProvenance(provenance)
  };
  const bytes = new TextEncoder().encode(JSON.stringify(context)).byteLength;
  if (bytes > COACH_CONTEXT_V1_LIMITS.serializedBytes) {
    throw new Error(`COACH_CONTEXT_V1_TOO_LARGE:${bytes}`);
  }
  return deepFreeze(context);
}

// packages/domain/src/ai-coach/coach-context-v1-source-map.ts
var COACH_CONTEXT_V1_SOURCE_MAP = Object.freeze([
  {
    fieldPattern: "version",
    truthSources: ["coach_context_builder_v1"],
    existingReaderOrContract: ["packages/domain/src/ai-coach/coach-context-v1.ts::COACH_CONTEXT_V1_VERSION"],
    readiness: "reusable_now",
    rule: "Builder-owned literal; callers cannot select another version."
  },
  {
    fieldPattern: "generatedAt",
    truthSources: ["server_clock"],
    existingReaderOrContract: ["server runtime instant (Date)"],
    readiness: "reusable_now",
    rule: "Server-supplied ISO instant; never supplied by the model."
  },
  {
    fieldPattern: "requestId, locale",
    truthSources: ["request_context"],
    existingReaderOrContract: ["authenticated HTTP request context"],
    readiness: "reusable_now",
    rule: "6B.2 adapter accepts authenticated request-scoped metadata only; no conversation-history authority."
  },
  {
    fieldPattern: "userId",
    truthSources: ["authenticated_user"],
    existingReaderOrContract: ["supabase/functions/app-api/index.ts::client.auth.getUser"],
    readiness: "reusable_now",
    rule: "Authenticated server identity; never accepted from model output."
  },
  {
    fieldPattern: "examProfileId, identity.value.examEditionId, identity.value.targetExamDate, identity.value.profileStatus",
    truthSources: ["exam_profiles"],
    existingReaderOrContract: [
      "supabase/functions/app-api/index.ts::activeProfile",
      "supabase/functions/_shared/canonical-planner-v2-readonly.ts::runCanonicalPlannerV2ReadOnlyShadow active-profile projection"
    ],
    readiness: "reusable_now",
    rule: "6B.2 reads the user-owned active profile directly with a compact allowlist."
  },
  {
    fieldPattern: "timezone, identity.value.displayName",
    truthSources: ["user_profiles"],
    existingReaderOrContract: [
      "apps/web/src/auth/AuthContext.tsx::loadProfile",
      "packages/domain/src/types.ts::UserProfile"
    ],
    readiness: "reusable_now",
    rule: "6B.2 reads the server-side user profile; missing timezone fails closed rather than defaulting a fact."
  },
  {
    fieldPattern: "currentDate",
    truthSources: ["server_clock", "user_profiles"],
    existingReaderOrContract: [
      "packages/domain/src/time-boundaries.ts::DEFAULT_TIMEZONE/getZonedDayRange",
      "supabase/functions/_shared/adaptive.ts::calendarToday"
    ],
    readiness: "reusable_now",
    rule: "6B.2 resolves the date and bounded query windows server-side from the persisted timezone."
  },
  {
    fieldPattern: "identity",
    truthSources: ["authenticated_user", "user_profiles", "exam_profiles"],
    existingReaderOrContract: ["packages/domain/src/types.ts::UserProfile/ExamProfile"],
    readiness: "reusable_now",
    rule: "6B.2 emits a compact identity projection; no raw auth, profile, or edition row."
  },
  {
    fieldPattern: "today.value.weeklyPlanId, today.value.planGenerationVersion",
    truthSources: ["weekly_plans"],
    existingReaderOrContract: [
      "packages/domain/src/planning-v2/db-snapshot-contract.ts::WeeklyPlanDbRowV1",
      "supabase/functions/_shared/canonical-planner-v2-readonly.ts::runCanonicalPlannerV2ReadOnlyShadow active-plan query"
    ],
    readiness: "reusable_now",
    rule: "Active current-week plan selected by ownership, date horizon, status, and latest generation."
  },
  {
    fieldPattern: "today.value.tasks[*]",
    truthSources: ["planning_task_state_v1"],
    existingReaderOrContract: [
      "packages/domain/src/planning-v2/db-snapshot-contract.ts::normalizePlanningSnapshotDbBundleV1",
      "packages/domain/src/planning-v2/db-snapshot-contract.ts::mergePlanningTaskProgressV1"
    ],
    readiness: "reusable_now",
    rule: "Filter the canonical normalized weekly task state by currentDate; lifecycle is tasks.status, never inferred from minutes."
  },
  {
    fieldPattern: "today.value.summary",
    truthSources: ["planning_task_state_v1"],
    existingReaderOrContract: ["packages/domain/src/planning-v2/db-snapshot-contract.ts::NormalizedPlanningSnapshotDbBundleV1"],
    readiness: "reusable_now",
    rule: "6B.2 deterministically projects Today over normalized task state; no planning arithmetic."
  },
  {
    fieldPattern: "today.value.study",
    truthSources: ["study_intent_ledger"],
    existingReaderOrContract: [
      "packages/domain/src/study-intent.ts::buildStudyCapacityAccounting",
      "supabase/functions/_shared/completed-study.ts::aggregateCompletedStudySessions/aggregatePlannedCreditByDate",
      "study_sessions + current non-superseded study_session_allocations"
    ],
    readiness: "reusable_now",
    rule: "6B.2 keeps actual, planned actual, planned credit, Extra Study, and unknown intent separate over timezone-bounded ledger reads."
  },
  {
    fieldPattern: "week.value.weeklyPlanId, week.value.generationVersion, week.value.startDate, week.value.endDate, week.value.status",
    truthSources: ["weekly_plans"],
    existingReaderOrContract: ["packages/domain/src/planning-v2/db-snapshot-contract.ts::WeeklyPlanDbRowV1"],
    readiness: "reusable_now",
    rule: "Copied from the selected active canonical weekly-plan row."
  },
  {
    fieldPattern: "week.value.tasks[*], week.value.summary",
    truthSources: ["planning_task_state_v1"],
    existingReaderOrContract: ["packages/domain/src/planning-v2/db-snapshot-contract.ts::normalizePlanningSnapshotDbBundleV1"],
    readiness: "reusable_now",
    rule: "Canonical normalized task/progress state only; no legacy recommendation ordering."
  },
  {
    fieldPattern: "week.value.study, week.value.studyIntentCoverage",
    truthSources: ["study_intent_ledger"],
    existingReaderOrContract: [
      "packages/domain/src/study-intent.ts::buildStudyCapacityAccounting",
      "study_sessions + current non-superseded study_session_allocations"
    ],
    readiness: "reusable_now",
    rule: "6B.2 reads current non-superseded allocations but holds coverage at partial while PLN-002 completeness is unresolved."
  },
  {
    fieldPattern: "week.value.progressPosition",
    truthSources: ["study_intent_ledger", "planning_task_state_v1"],
    existingReaderOrContract: ["docs/product/specs/PLN-002_STUDY_INTENT_SEMANTICS.md"],
    readiness: "truth_gap",
    rule: "Must be unknown unless PLN-002 coverage for the window is sufficient; 6B.1 rejects a known ahead/on-track/behind value otherwise."
  },
  {
    fieldPattern: "subjects[*].subjectId, subjects[*].subjectName, subjects[*].status",
    truthSources: ["subjects_catalog"],
    existingReaderOrContract: ["app-api weekly context: user_subjects joined to subjects"],
    readiness: "reusable_now",
    rule: "6B.2 reads user-profile subject selection joined to canonical subject identity."
  },
  {
    fieldPattern: "subjects[*].tasks",
    truthSources: ["planning_task_state_v1"],
    existingReaderOrContract: ["packages/domain/src/planning-v2/db-snapshot-contract.ts::normalizePlanningSnapshotDbBundleV1"],
    readiness: "reusable_now",
    rule: "6B.2 deterministically groups normalized canonical tasks by subjectId."
  },
  {
    fieldPattern: "subjects[*].study",
    truthSources: ["study_intent_ledger"],
    existingReaderOrContract: ["study_sessions + current non-superseded study_session_allocations subject_id"],
    readiness: "reusable_now",
    rule: "6B.2 groups current allocations by explicit subject identity; title inference is forbidden."
  },
  {
    fieldPattern: "subjects[*].material",
    truthSources: ["canonical_material_truth_v1", "canonical_workload_engine_v1"],
    existingReaderOrContract: [
      "supabase/functions/_shared/canonical-material-loader.ts::loadCanonicalMaterialUnits",
      "supabase/functions/_shared/canonical-material-shadow.ts::loadCanonicalWorkloadReadiness"
    ],
    readiness: "reusable_now",
    rule: "6B.2 groups canonical material/workload outputs through resource.subject_id; never by title or legacy top-three summaries."
  },
  {
    fieldPattern: "nextWork",
    truthSources: ["planning_task_state_v1", "canonical_material_truth_v1", "canonical_workload_engine_v1", "planner_v2_lifecycle"],
    existingReaderOrContract: [
      "packages/domain/src/planning/material-remaining-scope.ts::calculateRemainingMaterialScope (scoped material continuation only)",
      "packages/domain/src/planning-v2/proposal-lifecycle.ts::PlannerV2Preview.days[*].items (preview only)"
    ],
    readiness: "truth_gap",
    rule: "No global production-authoritative next-work selector exists. Known is allowed only for an exact approved-task binding, scoped canonical continuation, or exact Planner V2 preview item; otherwise unknown/not_applicable."
  },
  {
    fieldPattern: "materials.value[*] except workload",
    truthSources: ["canonical_material_truth_v1"],
    existingReaderOrContract: [
      "supabase/functions/_shared/canonical-material-loader.ts::loadCanonicalMaterialUnits",
      "packages/domain/src/planning/material-unit-view.ts::MaterialUnitView"
    ],
    readiness: "reusable_now",
    rule: "Canonical material identity, mapping, boundary, and progress only; no resource_progress percentage fallback."
  },
  {
    fieldPattern: "materials.value[*].workload",
    truthSources: ["canonical_workload_engine_v1"],
    existingReaderOrContract: [
      "supabase/functions/_shared/canonical-material-shadow.ts::loadCanonicalWorkloadReadiness.estimates",
      "packages/domain/src/planning/canonical-workload.ts::MaterialWorkloadEstimate"
    ],
    readiness: "reusable_now",
    rule: "Copy engine authority/confidence/reason. Unknown has null minutes; legacy or invented fallback is forbidden."
  },
  {
    fieldPattern: "workload",
    truthSources: ["canonical_workload_engine_v1"],
    existingReaderOrContract: [
      "supabase/functions/_shared/canonical-material-shadow.ts::loadCanonicalWorkloadReadiness.summary",
      "packages/domain/src/planning/canonical-workload.ts::CanonicalWorkloadSummary"
    ],
    readiness: "reusable_now",
    rule: "Copy the canonical engine summary; CoachContext never recalculates workload totals."
  },
  {
    fieldPattern: "capacity",
    truthSources: ["capacity_projection_v1"],
    existingReaderOrContract: [
      "packages/domain/src/capacity.ts::calculateDayAvailableMinutes/calculateWeeklyAvailableMinutes",
      "supabase/functions/_shared/capacity-overrides.ts::loadP48DailyCapacityOverrides/grossCapacityForDate/planningCapacityForDate",
      "weekly_availability + calendar_periods + schedule_exceptions + p48_daily_capacity_overrides"
    ],
    readiness: "reusable_now",
    rule: "6B.2 extracts canonical-capacity-readonly with identical adaptive inputs; Coach does not import legacy target-capacity or mutate capacity."
  },
  {
    fieldPattern: "recentProgress.value.taskEvents",
    truthSources: ["planning_task_state_v1"],
    existingReaderOrContract: ["tasks + task_progress canonical lifecycle projection"],
    readiness: "reusable_now",
    rule: "6B.2 emits a bounded deterministic compact event projection; no raw task rows."
  },
  {
    fieldPattern: "recentProgress.value.sessions",
    truthSources: ["study_intent_ledger"],
    existingReaderOrContract: ["study_sessions + current non-superseded study_session_allocations"],
    readiness: "reusable_now",
    rule: "6B.2 emits bounded completed sessions with current allocation identity, explicit intent and recording channel; no notes or raw rows."
  },
  {
    fieldPattern: "recentProgress.value.transitions",
    truthSources: ["study_intent_ledger"],
    existingReaderOrContract: ["study_substitutions + task_carryovers user-scoped lifecycle rows"],
    readiness: "reusable_now",
    rule: "6B.2 carries exact typed lifecycle/identity/minute/date rows only; no transition is inferred from task movement."
  },
  {
    fieldPattern: "planner.value identity/lifecycle/freshness",
    truthSources: ["planner_v2_snapshot", "planner_v2_lifecycle"],
    existingReaderOrContract: [
      "packages/domain/src/planning-v2/proposal-lifecycle.ts::PlannerV2Preview/validatePlannerV2Freshness",
      "supabase/functions/_shared/planner-v2-persisted-readonly.ts::loadCurrentPlannerV2PersistedStateReadOnly"
    ],
    readiness: "reusable_now",
    rule: "6B.2 reads the newest persisted lifecycle row and exact proposal identity only; no preview recomputation, confirmation, or Apply authority."
  },
  {
    fieldPattern: "planner.value.explanationFacts",
    truthSources: ["planner_v2_lifecycle"],
    existingReaderOrContract: ["confirmed_action_proposals.display_payload persisted PlannerV2Preview facts"],
    readiness: "reusable_now",
    rule: "6B.2 copies and validates already-persisted structured preview facts; it never calls buildPlannerV2Preview."
  },
  {
    fieldPattern: "signalInputs",
    truthSources: ["deterministic_signal_input_v1"],
    existingReaderOrContract: ["upstream known CoachContextV1 facts identified by sourceFactPath"],
    readiness: "adapter_extraction_required",
    rule: "Only deterministic scalar inputs are carried. No final insight, severity, ranking, cooldown, or AI prose is created in 6B.1."
  },
  {
    fieldPattern: "unknowns",
    truthSources: ["coach_context_builder_v1"],
    existingReaderOrContract: ["packages/domain/src/ai-coach/coach-context-v1.ts::buildCoachContextV1"],
    readiness: "reusable_now",
    rule: "Deterministically collected from unknown/stale fact envelopes; not model-generated."
  },
  {
    fieldPattern: "provenance",
    truthSources: ["coach_context_builder_v1"],
    existingReaderOrContract: ["packages/domain/src/ai-coach/coach-context-v1.ts::buildCoachContextV1"],
    readiness: "reusable_now",
    rule: "Deterministic compact union of field-level provenance supplied by source adapters."
  },
  {
    fieldPattern: "authority",
    truthSources: ["coach_context_builder_v1"],
    existingReaderOrContract: ["packages/domain/src/ai-coach/coach-context-v1.ts::buildCoachContextV1"],
    readiness: "reusable_now",
    rule: "Builder-owned immutable false-authority flags; callers and models cannot elevate them."
  }
]);
var COACH_CONTEXT_V1_LEGACY_EXCLUSIONS = Object.freeze([
  {
    legacySource: "supabase/functions/_shared/ai-coach/material-context.ts::loadAiCoachMaterialContext",
    excludedFrom: ["materials", "workload", "nextWork"],
    reason: "Top-three legacy projection is not canonical Material Truth and may hide unknown workload."
  },
  {
    legacySource: "supabase/functions/_shared/material-workload.ts::loadMaterialWorkloads",
    excludedFrom: ["materials", "workload", "nextWork"],
    reason: "Legacy material/workload arithmetic is not the MAT-001 Canonical Workload Engine."
  },
  {
    legacySource: "supabase/functions/_shared/ai-coach/target-capacity.ts::loadCurrentGrossCapacityForDate",
    excludedFrom: ["capacity"],
    reason: "Legacy Coach-specific capacity comparison is not a standalone canonical capacity read model."
  },
  {
    legacySource: "supabase/functions/_shared/pilot.ts::loadDailyCoachContext/generateWeeklyReport",
    excludedFrom: ["today", "week", "nextWork", "signalInputs"],
    reason: "The legacy projection mixes task ranking, recommendation, default unit minutes, and older report semantics."
  },
  {
    legacySource: "planning recommendation getNextBestTask / buildDailyPlanProjection",
    excludedFrom: ["nextWork"],
    reason: "No legacy ranking result is promoted to global canonical next-work truth."
  },
  {
    legacySource: "supabase/functions/_shared/adaptive.ts::previewCurrentPlan/recalculateCurrentPlan/applyCurrentPlanRevision",
    excludedFrom: ["planner", "nextWork"],
    reason: "Older planner lifecycle cannot compete with canonical Planner V2 scenario/preview/confirm/apply."
  },
  {
    legacySource: "supabase/functions/ai-coach-plan-preview",
    excludedFrom: ["planner"],
    reason: "Legacy Coach capacity-preview path is compatibility debt and is not an Evre 6 authority."
  },
  {
    legacySource: "public.apply_confirmed_action_proposal",
    excludedFrom: ["authority", "planner"],
    reason: "Every future Coach planning mutation must converge on canonical Planner V2; 6B.1 has no mutation path."
  }
]);

// packages/domain/src/ai-coach/coach-signal-v1.ts
var COACH_SIGNAL_CANDIDATE_V1_VERSION = "coach-signal-candidate-v1";
var COACH_SIGNAL_SET_V1_VERSION = "coach-signal-set-v1";
var COACH_SIGNAL_TYPES_V1 = [
  "today_remaining_work",
  "today_completed_as_planned",
  "today_partial_completion",
  "repeated_task_miss",
  "subject_recent_completion_drop",
  "subject_workload_progress_available",
  "subject_workload_progress_unknown",
  "schedule_capacity_change",
  "weekly_completion_pattern",
  "recent_study_consistency",
  "recent_recovery",
  "planner_warning_present",
  "material_progress_stalled",
  "context_data_stale",
  "important_truth_unknown"
];
var COACH_SIGNAL_FRESHNESS_POLICY_V1 = Object.freeze({
  today_week_task: {
    factPaths: ["today", "week", "subjects[*].tasks"],
    acceptance: "source_declared_fresh_and_current_calendar_scope",
    sourceExpiryEnforced: true,
    independentMaxAgeMs: null,
    limitation: "no_independent_task_ttl_authority"
  },
  planner_lifecycle: {
    factPaths: ["planner"],
    acceptance: "source_declared_fresh_and_persisted_proposal_not_expired",
    sourceExpiryEnforced: true,
    independentMaxAgeMs: null,
    limitation: "persisted_lifecycle_expiry_is_authoritative"
  },
  capacity: {
    factPaths: ["capacity"],
    acceptance: "source_declared_fresh_and_current_date_in_horizon",
    sourceExpiryEnforced: true,
    independentMaxAgeMs: null,
    limitation: "no_coach_owned_capacity_ttl"
  },
  material_workload: {
    factPaths: ["materials", "workload", "subjects[*].material"],
    acceptance: "source_declared_fresh",
    sourceExpiryEnforced: true,
    independentMaxAgeMs: null,
    limitation: "canonical_owners_do_not_publish_independent_ttl"
  },
  recent_progress: {
    factPaths: ["recentProgress"],
    acceptance: "source_declared_fresh_with_declared_window",
    sourceExpiryEnforced: true,
    independentMaxAgeMs: null,
    limitation: "window_is_context_not_trajectory_authority"
  },
  deterministic_signal_input: {
    factPaths: ["signalInputs"],
    acceptance: "source_declared_fresh_and_allowlisted_key_and_source_path",
    sourceExpiryEnforced: true,
    independentMaxAgeMs: null,
    limitation: "missing_registry_input_suppresses_dependent_signal"
  },
  important_context: {
    factPaths: ["today", "week", "materials", "workload", "capacity", "recentProgress", "nextWork", "week.value.progressPosition", "planner"],
    acceptance: "category_policy_for_each_important_fact",
    sourceExpiryEnforced: true,
    independentMaxAgeMs: null,
    limitation: "no_cross_domain_coach_owned_ttl"
  }
});
var registry = [
  ["today_remaining_work", "today_week_task", ["today.value.summary"], "today_known_fresh_and_open_count_and_remaining_minutes_positive", ["today_unavailable", "today_stale_or_expired", "today_date_mismatch", "no_remaining_work"], "suppress", "progress", "same_snapshot", true, false],
  ["today_completed_as_planned", "today_week_task", ["today.value.summary", "today.value.study.plannedCreditMinutes"], "all_today_tasks_completed_and_remaining_zero_and_planned_credit_covers_planned_minutes", ["today_unavailable", "today_stale_or_expired", "today_date_mismatch", "empty_today", "planned_credit_incomplete"], "suppress", "progress", "daily", true, true],
  ["today_partial_completion", "today_week_task", ["today.value.summary.partiallyCompletedTaskCount"], "partial_task_count_positive", ["today_unavailable", "today_stale_or_expired", "today_date_mismatch", "no_partial_task"], "suppress", "progress", "state_change", true, true],
  ["repeated_task_miss", "recent_progress", ["recentProgress.value.taskEvents"], "same_task_has_two_or_more_distinct_missed_events", ["recent_progress_unavailable", "recent_progress_stale_or_expired", "fewer_than_two_distinct_misses"], "emit_data_quality_signal", "consistency", "weekly", true, true],
  ["subject_recent_completion_drop", "deterministic_signal_input", ["signalInputs[key=subject_recent_completion_drop:<subjectId>]"], "allowlisted_positive_canonical_drop_input", ["signal_inputs_unavailable", "signal_inputs_stale_or_expired", "invalid_key_or_source_path", "non_positive_value"], "suppress", "progress", "weekly", true, true],
  ["subject_workload_progress_available", "material_workload", ["workload", "subjects[*].material"], "subject_material_known_and_no_unknown_workload_and_subject_minutes_present", ["workload_unavailable", "material_unavailable", "unknown_workload_present", "subject_minutes_absent"], "emit_data_quality_signal", "material", "state_change", true, false],
  ["subject_workload_progress_unknown", "material_workload", ["workload", "subjects[*].material"], "required_subject_workload_fact_is_unavailable_or_incomplete", ["subject_has_no_material", "canonical_subject_workload_complete"], "suppress", "data_quality", "state_change", true, false],
  ["schedule_capacity_change", "deterministic_signal_input", ["signalInputs[key=schedule_capacity_change:<date>]"], "allowlisted_non_zero_canonical_capacity_delta_input", ["signal_inputs_unavailable", "signal_inputs_stale_or_expired", "invalid_key_or_source_path", "zero_delta"], "suppress", "capacity", "state_change", true, true],
  ["weekly_completion_pattern", "today_week_task", ["week.value.summary"], "current_week_known_fresh_and_non_empty", ["week_unavailable", "week_stale_or_expired", "week_outside_calendar_scope", "empty_week"], "emit_data_quality_signal", "progress", "weekly", true, false],
  ["recent_study_consistency", "deterministic_signal_input", ["signalInputs[key=recent_study_consistency_days]"], "allowlisted_non_negative_canonical_consistency_input", ["signal_inputs_unavailable", "signal_inputs_stale_or_expired", "invalid_source_path", "invalid_value"], "suppress", "consistency", "weekly", true, false],
  ["recent_recovery", "recent_progress", ["recentProgress.value.taskEvents"], "same_task_has_completed_event_after_distinct_missed_event", ["recent_progress_unavailable", "recent_progress_stale_or_expired", "no_miss_then_complete_sequence"], "emit_data_quality_signal", "consistency", "state_change", true, true],
  ["planner_warning_present", "planner_lifecycle", ["planner.value.warnings"], "persisted_current_planner_has_warning_count", ["planner_unavailable", "planner_stale_or_expired", "no_warning"], "emit_data_quality_signal", "planner", "state_change", true, true],
  ["material_progress_stalled", "deterministic_signal_input", ["signalInputs[key=material_progress_stalled:<materialViewId>]"], "allowlisted_true_canonical_stall_input", ["signal_inputs_unavailable", "signal_inputs_stale_or_expired", "invalid_key_or_source_path", "false_value", "material_not_in_context"], "suppress", "material", "weekly", true, true],
  ["context_data_stale", "important_context", ["important_context_facts"], "important_fact_stale_or_freshness_policy_rejected", ["no_stale_important_fact"], "suppress", "data_quality", "state_change", true, false],
  ["important_truth_unknown", "important_context", ["important_context_facts"], "important_fact_unknown_or_blocked", ["fact_known_or_not_applicable"], "suppress", "data_quality", "state_change", true, false]
];
var COACH_SIGNAL_REGISTRY_V1 = Object.freeze(
  registry.map(([signalType, freshnessCategory, exactInputFactPaths, emissionConditionCode, suppressionConditionCodes, unavailableBehavior, attentionCategory, cooldownClass, reactiveExplanation, proactiveCandidate]) => ({
    signalType,
    freshnessCategory,
    exactInputFactPaths,
    emissionConditionCode,
    suppressionConditionCodes,
    unavailableBehavior,
    dedupeIdentityFields: ["signalType", "subjectId", "date", "entityId", "reasonCode", "sourceFactPath"],
    attentionCategory,
    cooldownClass,
    reactiveExplanation,
    proactiveCandidate
  }))
);
var COACH_SIGNAL_V1_LIMITS = Object.freeze({
  candidates: 32,
  sourceFactPathsPerCandidate: 8,
  evidenceValuesPerCandidate: 12,
  provenanceRecordsPerCandidate: 64,
  serializedBytes: 24576
});
function registryEntry(signalType) {
  return COACH_SIGNAL_REGISTRY_V1.find((entry) => entry.signalType === signalType);
}
function isExpired(expiresAt, generatedAt) {
  return expiresAt !== null && Date.parse(generatedAt) >= Date.parse(expiresAt);
}
function isKnownFresh(fact, generatedAt) {
  return fact.availability === "known" && fact.freshness.state === "fresh" && !isExpired(fact.freshness.expiresAt, generatedAt);
}
function confidenceFromFacts(facts) {
  const values = facts.map((fact) => fact.confidence);
  if (values.includes("none") || values.includes("low")) return "low";
  if (values.includes("medium")) return "medium";
  return "high";
}
function freshnessFromFacts(facts, generatedAt) {
  const stale = facts.find((fact) => fact.availability === "stale" || isExpired(fact.freshness.expiresAt, generatedAt));
  if (stale) return { ...stale.freshness, state: "stale" };
  const unknown = facts.find((fact) => fact.availability === "unknown" || fact.availability === "blocked");
  if (unknown) return structuredClone(unknown.freshness);
  return structuredClone(facts[0]?.freshness ?? { state: "unknown", asOf: null, expiresAt: null });
}
function normalizeProvenance2(facts) {
  const unique = /* @__PURE__ */ new Map();
  for (const fact of facts) {
    for (const item of fact.provenance) {
      const normalized = { source: item.source, recordIds: [...new Set(item.recordIds)].sort(), asOf: item.asOf };
      unique.set(`${normalized.source}|${normalized.asOf ?? ""}|${normalized.recordIds.join("|")}`, normalized);
    }
  }
  return [...unique.values()].sort((left, right) => left.source.localeCompare(right.source) || (left.asOf ?? "").localeCompare(right.asOf ?? "") || left.recordIds.join("|").localeCompare(right.recordIds.join("|")));
}
function sortedEvidence(evidence) {
  return Object.fromEntries(Object.entries(evidence).sort(([left], [right]) => left.localeCompare(right)));
}
function authority() {
  return {
    mode: "factual_signal_only_read_only",
    createsProductTruth: false,
    generatesProse: false,
    dbWritesAllowed: false,
    workloadCalculationAllowed: false,
    plannerPreviewAllowed: false,
    plannerProposalAllowed: false,
    plannerConfirmationAllowed: false,
    plannerApplyAllowed: false,
    llmCallsAllowed: false,
    providerCallsAllowed: false
  };
}
function materialize(context, draft) {
  const entry = registryEntry(draft.signalType);
  const sourceFactPaths = [...new Set(draft.sourceFactPaths)].sort();
  if (sourceFactPaths.length > COACH_SIGNAL_V1_LIMITS.sourceFactPathsPerCandidate) throw new Error("COACH_SIGNAL_TOO_MANY_SOURCE_PATHS");
  const evidence = sortedEvidence(draft.evidence);
  if (Object.keys(evidence).length > COACH_SIGNAL_V1_LIMITS.evidenceValuesPerCandidate) throw new Error("COACH_SIGNAL_TOO_MANY_EVIDENCE_VALUES");
  const provenance = normalizeProvenance2(draft.facts);
  if (provenance.some((item) => item.recordIds.length > COACH_SIGNAL_V1_LIMITS.provenanceRecordsPerCandidate)) throw new Error("COACH_SIGNAL_TOO_MANY_PROVENANCE_RECORDS");
  const subjectId = draft.subjectId ?? null;
  const date = draft.date ?? null;
  const entityId = draft.entityId ?? null;
  const dedupeKey = [draft.signalType, subjectId ?? "global", date ?? "any-date", entityId ?? "no-entity", draft.reasonCode, sourceFactPaths.join("+")].join(":");
  const freshness = draft.freshnessOverride ?? freshnessFromFacts(draft.facts, context.generatedAt);
  return {
    version: COACH_SIGNAL_CANDIDATE_V1_VERSION,
    signalType: draft.signalType,
    severity: draft.severity,
    importance: draft.importance,
    subjectId,
    date,
    reasonCode: draft.reasonCode,
    sourceFactPaths,
    asOf: freshness.asOf ?? context.generatedAt,
    freshness,
    confidence: draft.confidenceOverride ?? confidenceFromFacts(draft.facts),
    evidence,
    provenance,
    dedupeKey,
    eligibility: {
      reactiveExplanation: entry.reactiveExplanation,
      proactiveCandidate: entry.proactiveCandidate,
      attentionCategory: entry.attentionCategory,
      cooldownClass: entry.cooldownClass,
      silenceAllowed: true
    },
    authority: authority()
  };
}
function deepFreeze2(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze2(child);
  return value;
}
function validSignalSourcePath(path, prefix) {
  return path === prefix || path.startsWith(`${prefix}.`) || path.startsWith(`${prefix}[`);
}
function usableSignalInputs(context) {
  const signalInputs = context.signalInputs;
  return isKnownFresh(signalInputs, context.generatedAt) ? signalInputs.value : [];
}
function addTodaySignals(context, drafts) {
  const today = context.today;
  if (!isKnownFresh(today, context.generatedAt) || today.value.date !== context.currentDate) return;
  const { summary, study } = today.value;
  const fact = today;
  if (summary.openTaskCount > 0 && summary.remainingMinutes > 0) drafts.push({
    signalType: "today_remaining_work",
    severity: "info",
    importance: "low",
    date: context.currentDate,
    reasonCode: "today_open_minutes_present",
    sourceFactPaths: ["today.value.summary.openTaskCount", "today.value.summary.remainingMinutes"],
    facts: [fact],
    evidence: { openTaskCount: summary.openTaskCount, remainingMinutes: summary.remainingMinutes }
  });
  if (summary.totalTaskCount > 0 && summary.completedTaskCount === summary.totalTaskCount && summary.openTaskCount === 0 && summary.remainingMinutes === 0 && study.plannedCreditMinutes >= summary.plannedMinutes) drafts.push({
    signalType: "today_completed_as_planned",
    severity: "info",
    importance: "medium",
    date: context.currentDate,
    reasonCode: "today_all_tasks_completed_with_planned_credit",
    sourceFactPaths: ["today.value.summary", "today.value.study.plannedCreditMinutes"],
    facts: [fact],
    evidence: { completedTaskCount: summary.completedTaskCount, plannedMinutes: summary.plannedMinutes, plannedCreditMinutes: study.plannedCreditMinutes }
  });
  if (summary.partiallyCompletedTaskCount > 0) drafts.push({
    signalType: "today_partial_completion",
    severity: "notice",
    importance: "medium",
    date: context.currentDate,
    reasonCode: "today_partial_task_count_present",
    sourceFactPaths: ["today.value.summary.partiallyCompletedTaskCount", "today.value.summary.remainingMinutes"],
    facts: [fact],
    evidence: { partiallyCompletedTaskCount: summary.partiallyCompletedTaskCount, remainingMinutes: summary.remainingMinutes }
  });
}
function taskSubject(context, taskId) {
  return context.week.value?.tasks.find((task) => task.taskId === taskId)?.subjectId ?? null;
}
function addRecentProgressSignals(context, drafts) {
  const recentProgress = context.recentProgress;
  if (!isKnownFresh(recentProgress, context.generatedAt)) return;
  const fact = recentProgress;
  const unique = /* @__PURE__ */ new Map();
  for (const event of recentProgress.value.taskEvents) unique.set(`${event.taskId}|${event.occurredAt}|${event.status}|${event.completedMinutes}`, event);
  const events = [...unique.values()].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.taskId.localeCompare(right.taskId));
  const byTask = /* @__PURE__ */ new Map();
  for (const event of events) byTask.set(event.taskId, [...byTask.get(event.taskId) ?? [], event]);
  for (const [taskId, taskEvents] of [...byTask.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const misses = taskEvents.filter((event) => event.status === "missed");
    if (misses.length >= 2) drafts.push({
      signalType: "repeated_task_miss",
      severity: "warning",
      importance: "high",
      subjectId: taskSubject(context, taskId),
      entityId: taskId,
      reasonCode: "same_task_missed_multiple_times_in_recent_window",
      sourceFactPaths: [`recentProgress.value.taskEvents[taskId=${taskId}]`],
      facts: [fact],
      evidence: { distinctMissCount: misses.length, taskId, windowEnd: recentProgress.value.windowEnd, windowStart: recentProgress.value.windowStart }
    });
    const recovery = taskEvents.at(-1)?.status === "completed" ? taskEvents.at(-1) : void 0;
    const lastMissBeforeRecovery = recovery ? [...misses].reverse().find((event) => event.occurredAt < recovery.occurredAt) : void 0;
    if (lastMissBeforeRecovery && recovery) drafts.push({
      signalType: "recent_recovery",
      severity: "info",
      importance: "medium",
      subjectId: taskSubject(context, taskId),
      entityId: taskId,
      reasonCode: "completed_after_recent_miss",
      sourceFactPaths: [`recentProgress.value.taskEvents[taskId=${taskId}]`],
      facts: [fact],
      evidence: { completedAt: recovery.occurredAt, missedAt: lastMissBeforeRecovery.occurredAt, taskId }
    });
  }
}
function addSubjectWorkloadSignals(context, drafts) {
  const workload = context.workload;
  for (const subject of [...context.subjects].sort((left, right) => left.subjectId.localeCompare(right.subjectId))) {
    const material = subject.material;
    const facts = [workload, material];
    const materialKnown = isKnownFresh(material, context.generatedAt);
    const workloadKnown = isKnownFresh(workload, context.generatedAt);
    const totalMaterialViews = material.value?.totalMaterialViews ?? 0;
    if (totalMaterialViews === 0 && materialKnown) continue;
    const minutesPresent = workloadKnown && Object.prototype.hasOwnProperty.call(workload.value.minutesBySubject, subject.subjectId);
    const complete = materialKnown && workloadKnown && material.value.unknownWorkloadViews === 0 && minutesPresent;
    if (complete) {
      drafts.push({
        signalType: "subject_workload_progress_available",
        severity: "info",
        importance: "low",
        subjectId: subject.subjectId,
        reasonCode: "canonical_subject_workload_is_available",
        sourceFactPaths: ["workload.value.minutesBySubject", `subjects[subjectId=${subject.subjectId}].material`],
        facts,
        evidence: { completedMaterialViews: material.value.completedMaterialViews, remainingWorkloadMinutes: workload.value.minutesBySubject[subject.subjectId], subjectId: subject.subjectId, totalMaterialViews }
      });
    } else {
      drafts.push({
        signalType: "subject_workload_progress_unknown",
        severity: "notice",
        importance: "medium",
        subjectId: subject.subjectId,
        reasonCode: "canonical_subject_workload_is_incomplete",
        sourceFactPaths: ["workload", `subjects[subjectId=${subject.subjectId}].material`],
        facts,
        evidence: { subjectId: subject.subjectId, workloadAvailability: context.workload.availability, materialAvailability: subject.material.availability, unknownWorkloadViews: subject.material.value?.unknownWorkloadViews ?? null },
        confidenceOverride: "low"
      });
    }
  }
}
function addWeekSignal(context, drafts) {
  const week = context.week;
  if (!isKnownFresh(week, context.generatedAt) || context.currentDate < week.value.startDate || context.currentDate > week.value.endDate || week.value.summary.totalTaskCount === 0) return;
  const summary = week.value.summary;
  drafts.push({
    signalType: "weekly_completion_pattern",
    severity: "info",
    importance: "low",
    reasonCode: "current_week_task_counts_available",
    sourceFactPaths: ["week.value.summary"],
    facts: [context.week],
    evidence: { completedTaskCount: summary.completedTaskCount, openTaskCount: summary.openTaskCount, partiallyCompletedTaskCount: summary.partiallyCompletedTaskCount, remainingMinutes: summary.remainingMinutes, totalTaskCount: summary.totalTaskCount }
  });
}
function addPlannerSignal(context, drafts) {
  const planner = context.planner;
  if (!isKnownFresh(planner, context.generatedAt) || Date.parse(context.generatedAt) >= Date.parse(planner.value.expiresAt) || planner.value.warnings.length === 0) return;
  drafts.push({
    signalType: "planner_warning_present",
    severity: "warning",
    importance: "high",
    reasonCode: "persisted_planner_warning_count_present",
    sourceFactPaths: ["planner.value.warnings", "planner.value.lifecycleState"],
    facts: [context.planner],
    evidence: { lifecycleState: planner.value.lifecycleState, warningCount: planner.value.warnings.length }
  });
}
function addRegisteredInputSignals(context, drafts) {
  const fact = context.signalInputs;
  const inputs = usableSignalInputs(context);
  for (const input of [...inputs].sort((left, right) => left.key.localeCompare(right.key) || left.sourceFactPath.localeCompare(right.sourceFactPath))) {
    const completionMatch = /^subject_recent_completion_drop:(.+)$/.exec(input.key);
    const completionSubject = completionMatch ? context.subjects.find((subject) => subject.subjectId === completionMatch[1]) : void 0;
    if (completionMatch && completionSubject && isKnownFresh(completionSubject.tasks, context.generatedAt) && input.category === "progress" && (input.unit === "count" || input.unit === "ratio") && typeof input.value === "number" && input.value > 0 && validSignalSourcePath(input.sourceFactPath, "subjects")) drafts.push({
      signalType: "subject_recent_completion_drop",
      severity: "warning",
      importance: "high",
      subjectId: completionMatch[1],
      entityId: input.key,
      reasonCode: "canonical_completion_drop_input_present",
      sourceFactPaths: [input.sourceFactPath, `signalInputs[key=${input.key}]`],
      facts: [fact, completionSubject.tasks],
      evidence: { dropValue: input.value, subjectId: completionMatch[1] }
    });
    const capacityMatch = /^schedule_capacity_change:(\d{4}-\d{2}-\d{2})$/.exec(input.key);
    const capacity = context.capacity;
    const capacityDatePresent = capacityMatch && isKnownFresh(capacity, context.generatedAt) && capacity.value.days.some((day) => day.date === capacityMatch[1]);
    if (capacityMatch && capacityDatePresent && input.category === "capacity" && input.unit === "minutes" && typeof input.value === "number" && input.value !== 0 && validSignalSourcePath(input.sourceFactPath, "capacity")) drafts.push({
      signalType: "schedule_capacity_change",
      severity: "notice",
      importance: "medium",
      date: capacityMatch[1],
      entityId: input.key,
      reasonCode: "canonical_capacity_change_input_present",
      sourceFactPaths: [input.sourceFactPath, `signalInputs[key=${input.key}]`],
      facts: [fact, capacity],
      evidence: { capacityDeltaMinutes: input.value, date: capacityMatch[1] }
    });
    const recentProgress = context.recentProgress;
    if (input.key === "recent_study_consistency_days" && isKnownFresh(recentProgress, context.generatedAt) && input.category === "consistency" && input.unit === "count" && typeof input.value === "number" && input.value >= 0 && validSignalSourcePath(input.sourceFactPath, "recentProgress")) drafts.push({
      signalType: "recent_study_consistency",
      severity: "info",
      importance: "low",
      entityId: input.key,
      reasonCode: "canonical_consistency_input_present",
      sourceFactPaths: [input.sourceFactPath, `signalInputs[key=${input.key}]`],
      facts: [fact, recentProgress],
      evidence: { studyDayCount: input.value }
    });
    const stalledMatch = /^material_progress_stalled:(.+)$/.exec(input.key);
    const materials = context.materials;
    const material = stalledMatch && isKnownFresh(materials, context.generatedAt) ? materials.value.find((item) => item.materialViewId === stalledMatch[1]) : void 0;
    if (stalledMatch && material && input.category === "material" && input.unit === "boolean" && input.value === true && validSignalSourcePath(input.sourceFactPath, "materials")) drafts.push({
      signalType: "material_progress_stalled",
      severity: "warning",
      importance: "high",
      subjectId: material.subjectId,
      entityId: stalledMatch[1],
      reasonCode: "canonical_material_stall_input_present",
      sourceFactPaths: [input.sourceFactPath, `signalInputs[key=${input.key}]`],
      facts: [fact, materials],
      evidence: { materialViewId: stalledMatch[1], progressState: material.progressState }
    });
  }
}
function importantFacts(context) {
  return [
    { path: "today", fact: context.today, freshnessCategory: "today_week_task", policyValid: context.today.value === null || context.today.value.date === context.currentDate },
    { path: "week", fact: context.week, freshnessCategory: "today_week_task", policyValid: context.week.value === null || context.currentDate >= context.week.value.startDate && context.currentDate <= context.week.value.endDate },
    { path: "materials", fact: context.materials, freshnessCategory: "material_workload" },
    { path: "workload", fact: context.workload, freshnessCategory: "material_workload" },
    { path: "capacity", fact: context.capacity, freshnessCategory: "capacity", policyValid: context.capacity.value === null || context.currentDate >= context.capacity.value.horizonStart && context.currentDate <= context.capacity.value.horizonEnd },
    { path: "recentProgress", fact: context.recentProgress, freshnessCategory: "recent_progress" },
    { path: "nextWork", fact: context.nextWork, freshnessCategory: "material_workload" },
    ...context.week.value ? [{ path: "week.value.progressPosition", fact: context.week.value.progressPosition, freshnessCategory: "today_week_task" }] : [],
    ...context.planner.availability !== "not_applicable" ? [{ path: "planner", fact: context.planner, freshnessCategory: "planner_lifecycle", policyValid: context.planner.value === null || Date.parse(context.generatedAt) < Date.parse(context.planner.value.expiresAt) }] : []
  ];
}
function addDataQualitySignals(context, drafts) {
  for (const item of importantFacts(context)) {
    const expired = isExpired(item.fact.freshness.expiresAt, context.generatedAt);
    if (item.fact.availability === "stale" || expired || item.policyValid === false) {
      drafts.push({
        signalType: "context_data_stale",
        severity: "warning",
        importance: "high",
        entityId: item.path,
        reasonCode: item.policyValid === false ? "freshness_policy_rejected" : "source_fact_stale",
        sourceFactPaths: [item.path],
        facts: [item.fact],
        evidence: { availability: item.fact.availability, freshnessCategory: item.freshnessCategory, sourceFactPath: item.path, unknownReason: item.fact.unknownReason },
        freshnessOverride: { ...item.fact.freshness, state: "stale" },
        confidenceOverride: "low"
      });
    } else if (item.fact.availability === "unknown" || item.fact.availability === "blocked") {
      drafts.push({
        signalType: "important_truth_unknown",
        severity: "notice",
        importance: "medium",
        entityId: item.path,
        reasonCode: "required_truth_unavailable",
        sourceFactPaths: [item.path],
        facts: [item.fact],
        evidence: { availability: item.fact.availability, sourceFactPath: item.path, unknownReason: item.fact.unknownReason },
        confidenceOverride: "low"
      });
    }
  }
}
function buildCoachSignalSetV1(context, selection = {}) {
  if (selection.signalTypes?.some((type) => !COACH_SIGNAL_TYPES_V1.includes(type))) throw new Error("COACH_SIGNAL_TYPE_UNSUPPORTED");
  if (selection.subjectId !== void 0 && !context.subjects.some((subject) => subject.subjectId === selection.subjectId)) throw new Error("COACH_SIGNAL_SUBJECT_OUT_OF_PROFILE");
  const drafts = [];
  addTodaySignals(context, drafts);
  addRecentProgressSignals(context, drafts);
  addSubjectWorkloadSignals(context, drafts);
  addWeekSignal(context, drafts);
  addPlannerSignal(context, drafts);
  addRegisteredInputSignals(context, drafts);
  addDataQualitySignals(context, drafts);
  const unique = /* @__PURE__ */ new Map();
  for (const draft of drafts) {
    const candidate = materialize(context, draft);
    if (!unique.has(candidate.dedupeKey)) unique.set(candidate.dedupeKey, candidate);
  }
  const selectedTypes = selection.signalTypes ? new Set(selection.signalTypes) : null;
  const importanceOrder = { high: 0, medium: 1, low: 2 };
  const all = [...unique.values()].filter((candidate) => selectedTypes === null || selectedTypes.has(candidate.signalType)).filter((candidate) => selection.subjectId === void 0 || candidate.subjectId === selection.subjectId).filter((candidate) => selection.proactiveOnly !== true || candidate.eligibility.proactiveCandidate).sort((left, right) => importanceOrder[left.importance] - importanceOrder[right.importance] || left.signalType.localeCompare(right.signalType) || left.dedupeKey.localeCompare(right.dedupeKey));
  const candidates = all.slice(0, COACH_SIGNAL_V1_LIMITS.candidates);
  const result = {
    version: COACH_SIGNAL_SET_V1_VERSION,
    sourceContext: { version: context.version, requestId: context.requestId },
    asOf: context.generatedAt,
    candidates,
    collection: { availableCount: all.length, returnedCount: candidates.length, limit: COACH_SIGNAL_V1_LIMITS.candidates, truncated: candidates.length < all.length },
    silenceEligible: true,
    authority: authority()
  };
  const bytes = new TextEncoder().encode(JSON.stringify(result)).byteLength;
  if (bytes > COACH_SIGNAL_V1_LIMITS.serializedBytes) throw new Error(`COACH_SIGNAL_SET_V1_TOO_LARGE:${bytes}`);
  return deepFreeze2(result);
}

// packages/domain/src/ai-coach/coach-evidence-view-v1.ts
var COACH_EVIDENCE_VIEW_V1_VERSION = "coach-evidence-view-v1";
var COACH_EVIDENCE_DETAIL_REQUEST_V1_VERSION = "coach-evidence-detail-request-v1";
var COACH_EVIDENCE_DETAIL_RESPONSE_V1_VERSION = "coach-evidence-detail-response-v1";
var COACH_EVIDENCE_SCOPES_V1 = [
  "today_explain",
  "week_progress",
  "subject_progress",
  "canonical_work",
  "capacity_status",
  "planner_explanation",
  "general_status",
  "proactive_candidate"
];
var COACH_EVIDENCE_CAPABILITIES_V1 = [
  "explain",
  "progress_analysis",
  "guide",
  "status_analysis",
  "planner_proposal_interpretation",
  "proactive_insight_candidate"
];
var COACH_EVIDENCE_DETAIL_KINDS_V1 = [
  "today_tasks",
  "week_tasks",
  "subject_tasks",
  "recent_sessions",
  "subject_material_progress",
  "planner_explanation_detail"
];
var COACH_EVIDENCE_SCOPE_CAPABILITY_V1 = Object.freeze({
  today_explain: "explain",
  week_progress: "progress_analysis",
  subject_progress: "progress_analysis",
  canonical_work: "guide",
  capacity_status: "status_analysis",
  planner_explanation: "planner_proposal_interpretation",
  general_status: "status_analysis",
  proactive_candidate: "proactive_insight_candidate"
});
var COACH_EVIDENCE_SCOPE_RULES_V1 = Object.freeze({
  today_explain: {
    capability: "explain",
    allowedContextPaths: ["identity", "today", "week.summary", "week.study", "week.studyIntentCoverage", "week.progressPosition", "nextWork", "signalCandidates"],
    excludedContextPaths: ["week.tasks", "subjects", "materials", "workload", "capacity", "recentProgress", "planner", "signalInputs"],
    collectionLimits: { "today.tasks": 8, signalCandidates: 6 },
    detailKinds: ["today_tasks", "recent_sessions"]
  },
  week_progress: {
    capability: "progress_analysis",
    allowedContextPaths: ["week", "subjects", "capacity", "recentProgress", "signalCandidates"],
    excludedContextPaths: ["identity", "today.tasks", "week.tasks", "nextWork", "materials", "workload", "planner", "signalInputs"],
    collectionLimits: { subjects: 12, "capacity.days": 7, "recentProgress.taskEvents": 8, "recentProgress.sessions": 6, "recentProgress.transitions": 4, signalCandidates: 6 },
    detailKinds: ["week_tasks", "subject_tasks", "recent_sessions"]
  },
  subject_progress: {
    capability: "progress_analysis",
    allowedContextPaths: ["subjects[selected]", "week", "materials[selected]", "recentProgress[selected]", "nextWork[selected]", "signalCandidates[selected]"],
    excludedContextPaths: ["identity", "today.tasks", "week.tasks", "workload.minutesByResource", "capacity", "planner", "signalInputs"],
    collectionLimits: { subjects: 1, "canonicalWork.materials": 6, "recentProgress.taskEvents": 6, "recentProgress.sessions": 6, "recentProgress.transitions": 4, signalCandidates: 4 },
    detailKinds: ["subject_tasks", "recent_sessions", "subject_material_progress"]
  },
  canonical_work: {
    capability: "guide",
    allowedContextPaths: ["nextWork", "workload", "materials"],
    excludedContextPaths: ["identity", "today", "week", "subjects", "capacity", "recentProgress", "planner", "signalInputs", "signalCandidates"],
    collectionLimits: { "canonicalWork.materials": 8 },
    detailKinds: ["subject_material_progress"]
  },
  capacity_status: {
    capability: "status_analysis",
    allowedContextPaths: ["today.summary", "today.study", "week.summary", "capacity"],
    excludedContextPaths: ["identity", "today.tasks", "week.tasks", "subjects", "nextWork", "materials", "workload", "recentProgress", "planner", "signalInputs", "signalCandidates"],
    collectionLimits: { "capacity.days": 7 },
    detailKinds: ["today_tasks", "week_tasks"]
  },
  planner_explanation: {
    capability: "planner_proposal_interpretation",
    allowedContextPaths: ["planner"],
    excludedContextPaths: ["identity", "today", "week", "subjects", "nextWork", "materials", "workload", "capacity", "recentProgress", "signalInputs", "signalCandidates"],
    collectionLimits: { "planner.warnings": 8, "planner.explanationFacts": 12 },
    detailKinds: ["planner_explanation_detail"]
  },
  general_status: {
    capability: "status_analysis",
    allowedContextPaths: ["identity", "today.summary", "today.study", "week", "subjects", "nextWork", "workload", "capacity", "signalCandidates"],
    excludedContextPaths: ["today.tasks", "week.tasks", "materials", "recentProgress", "planner", "signalInputs"],
    collectionLimits: { subjects: 8, "capacity.days": 7, signalCandidates: 4 },
    detailKinds: ["today_tasks", "week_tasks", "subject_tasks", "recent_sessions", "subject_material_progress"]
  },
  proactive_candidate: {
    capability: "proactive_insight_candidate",
    allowedContextPaths: ["today.summary", "week", "subjects", "workload", "capacity", "signalCandidates"],
    excludedContextPaths: ["identity", "today.tasks", "week.tasks", "nextWork", "materials", "recentProgress", "planner", "signalInputs"],
    collectionLimits: { subjects: 8, "capacity.days": 7, signalCandidates: 4 },
    detailKinds: ["today_tasks", "week_tasks", "subject_tasks", "recent_sessions", "subject_material_progress"]
  }
});
var COACH_EVIDENCE_VIEW_V1_LIMITS = Object.freeze({
  serializedBytes: 32768,
  provenanceRecordIds: 64,
  unknowns: 32,
  collections: 16
});
var COACH_EVIDENCE_DETAIL_V1_LIMITS = Object.freeze({
  today_tasks: 24,
  week_tasks: 24,
  subject_tasks: 16,
  recent_sessions: 12,
  subject_material_progress: 16,
  planner_explanation_detail: 24,
  serializedBytes: 16384
});
var COACH_EVIDENCE_SIGNAL_TYPES_V1 = Object.freeze({
  today_explain: ["today_remaining_work", "today_completed_as_planned", "today_partial_completion"],
  week_progress: ["repeated_task_miss", "subject_recent_completion_drop", "schedule_capacity_change", "weekly_completion_pattern", "recent_study_consistency", "recent_recovery", "context_data_stale", "important_truth_unknown"],
  subject_progress: ["subject_recent_completion_drop", "subject_workload_progress_available", "subject_workload_progress_unknown", "recent_recovery", "material_progress_stalled"],
  general_status: COACH_SIGNAL_TYPES_V1,
  proactive_candidate: COACH_SIGNAL_TYPES_V1
});
function mapFact(fact, mapValue) {
  const cloned = structuredClone(fact);
  if (cloned.availability === "known") return { ...cloned, value: mapValue(cloned.value) };
  if (cloned.availability === "stale") {
    return { ...cloned, value: cloned.value === null ? null : mapValue(cloned.value) };
  }
  return cloned;
}
function limitCollection(items, path, limit, collections) {
  const selected = items.slice(0, limit);
  collections.push({
    path,
    availableCount: items.length,
    returnedCount: selected.length,
    limit,
    truncated: selected.length < items.length
  });
  return selected;
}
function projectToday(context, taskLimit, collections) {
  return mapFact(context.today, (today) => ({
    date: today.date,
    weeklyPlanId: today.weeklyPlanId,
    planGenerationVersion: today.planGenerationVersion,
    summary: structuredClone(today.summary),
    study: structuredClone(today.study),
    tasks: limitCollection(today.tasks, "today.tasks", taskLimit, collections)
  }));
}
function projectWeek(context) {
  return mapFact(context.week, (week) => ({
    weeklyPlanId: week.weeklyPlanId,
    generationVersion: week.generationVersion,
    startDate: week.startDate,
    endDate: week.endDate,
    status: week.status,
    summary: structuredClone(week.summary),
    study: structuredClone(week.study),
    studyIntentCoverage: week.studyIntentCoverage,
    progressPosition: structuredClone(week.progressPosition)
  }));
}
function projectWorkload(context) {
  return mapFact(context.workload, (workload) => ({
    totalMaterialViews: workload.totalMaterialViews,
    exactWorkloadViews: workload.exactWorkloadViews,
    calibratedWorkloadViews: workload.calibratedWorkloadViews,
    unknownWorkloadViews: workload.unknownWorkloadViews,
    plannerEligibleViews: workload.plannerEligibleViews,
    exactYoutubeRemainingMinutes: workload.exactYoutubeRemainingMinutes,
    physicalPagesWithCalibratedWorkload: workload.physicalPagesWithCalibratedWorkload,
    physicalPagesWithUnknownWorkload: workload.physicalPagesWithUnknownWorkload,
    physicalEstimatedRemainingMinutes: workload.physicalEstimatedRemainingMinutes,
    blockedByReason: structuredClone(workload.blockedByReason),
    minutesBySubject: structuredClone(workload.minutesBySubject)
  }));
}
function projectCapacity(context, limit, collections) {
  return mapFact(context.capacity, (capacity) => ({
    horizonStart: capacity.horizonStart,
    horizonEnd: capacity.horizonEnd,
    days: limitCollection(capacity.days, "capacity.days", limit, collections)
  }));
}
function projectRecent(context, limits, collections, subjectId = null) {
  return mapFact(context.recentProgress, (recent) => {
    const taskIds = subjectId === null ? null : new Set(context.week.value?.tasks.filter((task) => task.subjectId === subjectId).map((task) => task.taskId) ?? []);
    const taskEvents = subjectId === null ? recent.taskEvents : recent.taskEvents.filter((event) => taskIds?.has(event.taskId));
    const sessions = subjectId === null ? recent.sessions : recent.sessions.filter((session) => session.subjectId === subjectId);
    const transitions = subjectId === null ? recent.transitions : recent.transitions.filter((transition) => taskIds?.has(transition.sourceTaskId));
    return {
      windowStart: recent.windowStart,
      windowEnd: recent.windowEnd,
      taskEvents: limitCollection(taskEvents, "recentProgress.taskEvents", limits.taskEvents, collections),
      sessions: limitCollection(sessions, "recentProgress.sessions", limits.sessions, collections),
      transitions: limitCollection(transitions, "recentProgress.transitions", limits.transitions, collections)
    };
  });
}
function projectPlanner(context, warningLimit, explanationLimit, collections) {
  return mapFact(context.planner, (planner) => ({
    lifecycleVersion: planner.lifecycleVersion,
    lifecycleState: planner.lifecycleState,
    weeklyPlanId: planner.weeklyPlanId,
    proposalRecordId: planner.proposalRecordId,
    proposalId: planner.proposalId,
    proposalFingerprint: planner.proposalFingerprint,
    snapshotFingerprint: planner.snapshotFingerprint,
    plannerVersion: planner.plannerVersion,
    expiresAt: planner.expiresAt,
    freshnessReasons: structuredClone(planner.freshnessReasons),
    summary: structuredClone(planner.summary),
    warnings: limitCollection(planner.warnings, "planner.warnings", warningLimit, collections),
    explanationFacts: limitCollection(planner.explanationFacts, "planner.explanationFacts", explanationLimit, collections),
    explicitConfirmationRequired: true,
    applyAvailable: false
  }));
}
function projectSignalCandidates(context, scope, limit, collections, subjectId = null) {
  const candidates = buildCoachSignalSetV1(context, {
    signalTypes: COACH_EVIDENCE_SIGNAL_TYPES_V1[scope],
    ...scope === "subject_progress" && subjectId !== null ? { subjectId } : {},
    ...scope === "proactive_candidate" ? { proactiveOnly: true } : {}
  }).candidates;
  return limitCollection(candidates, "signalCandidates", limit, collections);
}
function normalizeProvenance3(items) {
  const unique = /* @__PURE__ */ new Map();
  for (const item of items) {
    const normalized = {
      source: item.source,
      recordIds: [...new Set(item.recordIds)].sort(),
      asOf: item.asOf
    };
    unique.set(`${normalized.source}|${normalized.asOf ?? ""}|${normalized.recordIds.join("|")}`, normalized);
  }
  return [...unique.values()].sort((left, right) => left.source.localeCompare(right.source) || (left.asOf ?? "").localeCompare(right.asOf ?? "") || left.recordIds.join("|").localeCompare(right.recordIds.join("|")));
}
function collectFactMetadata(value) {
  const unknowns = [];
  const provenance = [];
  const walk = (candidate, path) => {
    if (!candidate || typeof candidate !== "object") return;
    const object = candidate;
    if (typeof object.availability === "string" && "freshness" in object && Array.isArray(object.provenance)) {
      const fact = candidate;
      provenance.push(...fact.provenance);
      if (fact.availability === "unknown" || fact.availability === "stale" || fact.availability === "blocked") {
        unknowns.push({
          path,
          availability: fact.availability,
          reason: fact.unknownReason,
          sources: [...new Set(fact.provenance.map((item) => item.source))].sort()
        });
      }
      if (fact.value !== null) walk(fact.value, `${path}.value`);
      return;
    }
    if (Array.isArray(candidate)) {
      candidate.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }
    for (const key of Object.keys(object).sort()) walk(object[key], path ? `${path}.${key}` : key);
  };
  walk(value, "evidence");
  return {
    unknowns: unknowns.sort((left, right) => left.path.localeCompare(right.path)),
    provenance: [...normalizeProvenance3(provenance)]
  };
}
function deepFreeze3(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze3(child);
  return value;
}
function assertSubjectSelection(context, selection) {
  if (selection.scope !== "subject_progress") {
    if (selection.subjectId !== void 0) throw new Error("COACH_EVIDENCE_SUBJECT_NOT_ALLOWED_FOR_SCOPE");
    return null;
  }
  if (!selection.subjectId?.trim()) throw new Error("COACH_EVIDENCE_SUBJECT_REQUIRED");
  if (!context.subjects.some((subject) => subject.subjectId === selection.subjectId)) {
    throw new Error("COACH_EVIDENCE_SUBJECT_OUT_OF_PROFILE");
  }
  return selection.subjectId;
}
function projectCoachEvidenceViewV1(context, selection) {
  if (!COACH_EVIDENCE_SCOPES_V1.includes(selection.scope)) throw new Error("COACH_EVIDENCE_SCOPE_UNSUPPORTED");
  if (!COACH_EVIDENCE_CAPABILITIES_V1.includes(selection.capability)) throw new Error("COACH_EVIDENCE_CAPABILITY_UNSUPPORTED");
  const expectedCapability = COACH_EVIDENCE_SCOPE_CAPABILITY_V1[selection.scope];
  if (selection.capability !== expectedCapability) throw new Error("COACH_EVIDENCE_SCOPE_CAPABILITY_MISMATCH");
  const subjectId = assertSubjectSelection(context, selection);
  const rule = COACH_EVIDENCE_SCOPE_RULES_V1[selection.scope];
  const collections = [];
  let evidence;
  switch (selection.scope) {
    case "today_explain":
      evidence = {
        identity: structuredClone(context.identity),
        today: projectToday(context, rule.collectionLimits["today.tasks"], collections),
        week: projectWeek(context),
        canonicalWork: {
          next: structuredClone(context.nextWork)
        },
        signalCandidates: projectSignalCandidates(context, "today_explain", rule.collectionLimits.signalCandidates, collections)
      };
      break;
    case "week_progress":
      evidence = {
        week: projectWeek(context),
        subjects: limitCollection(context.subjects, "subjects", rule.collectionLimits.subjects, collections),
        capacity: projectCapacity(context, rule.collectionLimits["capacity.days"], collections),
        recentProgress: projectRecent(context, {
          taskEvents: rule.collectionLimits["recentProgress.taskEvents"],
          sessions: rule.collectionLimits["recentProgress.sessions"],
          transitions: rule.collectionLimits["recentProgress.transitions"]
        }, collections),
        signalCandidates: projectSignalCandidates(context, "week_progress", rule.collectionLimits.signalCandidates, collections)
      };
      break;
    case "subject_progress": {
      const selectedSubjects = context.subjects.filter((subject) => subject.subjectId === subjectId);
      const selectedMaterials = mapFact(context.materials, (materials) => materials.filter((material) => material.subjectId === subjectId));
      evidence = {
        week: projectWeek(context),
        subjects: limitCollection(selectedSubjects, "subjects", 1, collections),
        canonicalWork: {
          ...context.nextWork.availability !== "known" || context.nextWork.value.subjectId === subjectId ? { next: structuredClone(context.nextWork) } : {},
          workload: mapFact(context.workload, (workload) => ({
            minutesBySubject: Object.fromEntries(Object.entries(workload.minutesBySubject).filter(([key]) => key === subjectId))
          })),
          materials: mapFact(selectedMaterials, (materials) => limitCollection(materials, "canonicalWork.materials", rule.collectionLimits["canonicalWork.materials"], collections))
        },
        recentProgress: projectRecent(context, {
          taskEvents: rule.collectionLimits["recentProgress.taskEvents"],
          sessions: rule.collectionLimits["recentProgress.sessions"],
          transitions: rule.collectionLimits["recentProgress.transitions"]
        }, collections, subjectId),
        signalCandidates: projectSignalCandidates(context, "subject_progress", rule.collectionLimits.signalCandidates, collections, subjectId)
      };
      break;
    }
    case "canonical_work":
      evidence = {
        canonicalWork: {
          next: structuredClone(context.nextWork),
          workload: projectWorkload(context),
          materials: mapFact(context.materials, (materials) => limitCollection(materials, "canonicalWork.materials", rule.collectionLimits["canonicalWork.materials"], collections))
        }
      };
      break;
    case "capacity_status":
      evidence = {
        today: projectToday(context, 0, collections),
        week: projectWeek(context),
        capacity: projectCapacity(context, rule.collectionLimits["capacity.days"], collections)
      };
      break;
    case "planner_explanation":
      evidence = {
        planner: projectPlanner(context, rule.collectionLimits["planner.warnings"], rule.collectionLimits["planner.explanationFacts"], collections)
      };
      break;
    case "general_status":
      evidence = {
        identity: structuredClone(context.identity),
        today: projectToday(context, 0, collections),
        week: projectWeek(context),
        subjects: limitCollection(context.subjects, "subjects", rule.collectionLimits.subjects, collections),
        canonicalWork: {
          next: structuredClone(context.nextWork),
          workload: projectWorkload(context)
        },
        capacity: projectCapacity(context, rule.collectionLimits["capacity.days"], collections),
        signalCandidates: projectSignalCandidates(context, "general_status", rule.collectionLimits.signalCandidates, collections)
      };
      break;
    case "proactive_candidate":
      evidence = {
        today: projectToday(context, 0, collections),
        week: projectWeek(context),
        subjects: limitCollection(context.subjects, "subjects", rule.collectionLimits.subjects, collections),
        canonicalWork: {
          workload: projectWorkload(context)
        },
        capacity: projectCapacity(context, rule.collectionLimits["capacity.days"], collections),
        signalCandidates: projectSignalCandidates(context, "proactive_candidate", rule.collectionLimits.signalCandidates, collections)
      };
      break;
  }
  const metadata = collectFactMetadata(evidence);
  const signalProvenance = evidence.signalCandidates?.flatMap((candidate) => candidate.provenance) ?? [];
  if (collections.length > COACH_EVIDENCE_VIEW_V1_LIMITS.collections) {
    throw new Error("COACH_EVIDENCE_TOO_MANY_COLLECTIONS");
  }
  if (metadata.unknowns.length > COACH_EVIDENCE_VIEW_V1_LIMITS.unknowns) {
    throw new Error("COACH_EVIDENCE_TOO_MANY_UNKNOWNS");
  }
  if (metadata.provenance.some((item) => item.recordIds.length > COACH_EVIDENCE_VIEW_V1_LIMITS.provenanceRecordIds)) {
    throw new Error("COACH_EVIDENCE_TOO_MANY_PROVENANCE_RECORDS");
  }
  const view = {
    version: COACH_EVIDENCE_VIEW_V1_VERSION,
    sourceContext: { version: context.version, requestId: context.requestId },
    scope: selection.scope,
    capability: selection.capability,
    subjectId,
    asOf: context.generatedAt,
    timezone: context.timezone,
    currentDate: context.currentDate,
    evidence,
    collections: collections.sort((left, right) => left.path.localeCompare(right.path)),
    unknowns: metadata.unknowns,
    provenance: normalizeProvenance3([...metadata.provenance, ...signalProvenance]),
    availableDetails: rule.detailKinds.map((kind) => ({
      kind,
      subjectIdRequired: kind === "subject_tasks" || kind === "subject_material_progress"
    })),
    authority: {
      mode: "evidence_only_read_only",
      dbWritesAllowed: false,
      arbitraryQueryAllowed: false,
      newTruthCalculationAllowed: false,
      workloadRecalculationAllowed: false,
      plannerPreviewRecomputationAllowed: false,
      taskMutationAllowed: false,
      capacityMutationAllowed: false,
      plannerConfirmationAllowed: false,
      plannerApplyAllowed: false,
      llmCallsAllowed: false,
      providerCallsAllowed: false
    }
  };
  const bytes = new TextEncoder().encode(JSON.stringify(view)).byteLength;
  if (bytes > COACH_EVIDENCE_VIEW_V1_LIMITS.serializedBytes) {
    throw new Error(`COACH_EVIDENCE_VIEW_V1_TOO_LARGE:${bytes}`);
  }
  return deepFreeze3(view);
}
function assertDetailScope(context, request) {
  if (request.version !== COACH_EVIDENCE_DETAIL_REQUEST_V1_VERSION) throw new Error("COACH_EVIDENCE_DETAIL_VERSION_UNSUPPORTED");
  if (!COACH_EVIDENCE_DETAIL_KINDS_V1.includes(request.kind)) throw new Error("COACH_EVIDENCE_DETAIL_KIND_UNSUPPORTED");
  if (request.userId !== context.userId) throw new Error("COACH_EVIDENCE_DETAIL_USER_SCOPE_MISMATCH");
  if (request.examProfileId !== context.examProfileId) throw new Error("COACH_EVIDENCE_DETAIL_PROFILE_SCOPE_MISMATCH");
  const subjectRequired = request.kind === "subject_tasks" || request.kind === "subject_material_progress";
  if (subjectRequired) {
    if (!request.subjectId?.trim()) throw new Error("COACH_EVIDENCE_DETAIL_SUBJECT_REQUIRED");
    if (!context.subjects.some((subject) => subject.subjectId === request.subjectId)) {
      throw new Error("COACH_EVIDENCE_DETAIL_SUBJECT_OUT_OF_PROFILE");
    }
    return request.subjectId;
  }
  if (request.subjectId !== void 0) throw new Error("COACH_EVIDENCE_DETAIL_SUBJECT_NOT_ALLOWED");
  return null;
}
function resolveCoachEvidenceDetailV1(context, request) {
  const subjectId = assertDetailScope(context, request);
  const limit = COACH_EVIDENCE_DETAIL_V1_LIMITS[request.kind];
  let availableCount = 0;
  let returnedCount = 0;
  let payload;
  switch (request.kind) {
    case "today_tasks":
      payload = mapFact(context.today, (today) => {
        availableCount = today.tasks.length;
        const selected = today.tasks.slice(0, limit);
        returnedCount = selected.length;
        return selected;
      });
      break;
    case "week_tasks":
      payload = mapFact(context.week, (week) => {
        availableCount = week.tasks.length;
        const selected = week.tasks.slice(0, limit);
        returnedCount = selected.length;
        return selected;
      });
      break;
    case "subject_tasks":
      payload = mapFact(context.week, (week) => {
        const tasks = week.tasks.filter((task) => task.subjectId === subjectId);
        availableCount = tasks.length;
        const selected = tasks.slice(0, limit);
        returnedCount = selected.length;
        return selected;
      });
      break;
    case "recent_sessions":
      payload = mapFact(context.recentProgress, (recent) => {
        availableCount = recent.sessions.length;
        const selected = recent.sessions.slice(0, limit);
        returnedCount = selected.length;
        return selected;
      });
      break;
    case "subject_material_progress":
      payload = mapFact(context.materials, (materials) => {
        const selected = materials.filter((material) => material.subjectId === subjectId);
        availableCount = selected.length;
        const limited = selected.slice(0, limit);
        returnedCount = limited.length;
        return limited;
      });
      break;
    case "planner_explanation_detail":
      payload = mapFact(context.planner, (planner) => {
        let remaining = limit;
        const take = (items) => {
          const selected = items.slice(0, remaining);
          remaining -= selected.length;
          return selected;
        };
        const warnings = take(planner.warnings);
        const explanationFacts = take(planner.explanationFacts);
        const createCanonicalWorkloadIdentities = take(planner.differences.createCanonicalWorkloadIdentities);
        const retainedTaskIds = take(planner.differences.retainedTaskIds);
        const replaceableTaskIds = take(planner.differences.replaceableTaskIds);
        const outsideScopeTaskIds = take(planner.differences.outsideScopeTaskIds);
        availableCount = planner.warnings.length + planner.explanationFacts.length + planner.differences.createCanonicalWorkloadIdentities.length + planner.differences.retainedTaskIds.length + planner.differences.replaceableTaskIds.length + planner.differences.outsideScopeTaskIds.length;
        returnedCount = limit - remaining;
        return {
          lifecycleState: planner.lifecycleState,
          weeklyPlanId: planner.weeklyPlanId,
          proposalRecordId: planner.proposalRecordId,
          proposalId: planner.proposalId,
          proposalFingerprint: planner.proposalFingerprint,
          snapshotFingerprint: planner.snapshotFingerprint,
          plannerVersion: planner.plannerVersion,
          expiresAt: planner.expiresAt,
          freshnessReasons: structuredClone(planner.freshnessReasons),
          summary: structuredClone(planner.summary),
          differences: { createCanonicalWorkloadIdentities, retainedTaskIds, replaceableTaskIds, outsideScopeTaskIds },
          warnings,
          explanationFacts,
          explicitConfirmationRequired: true,
          applyAvailable: false
        };
      });
      break;
  }
  const response = {
    version: COACH_EVIDENCE_DETAIL_RESPONSE_V1_VERSION,
    sourceContext: { version: context.version, requestId: context.requestId },
    kind: request.kind,
    subjectId,
    asOf: context.generatedAt,
    timezone: context.timezone,
    payload,
    collection: {
      availableCount,
      returnedCount,
      limit,
      truncated: returnedCount < availableCount
    },
    provenance: normalizeProvenance3(payload.provenance),
    authority: {
      mode: "evidence_only_read_only",
      dbWritesAllowed: false,
      arbitraryQueryAllowed: false,
      newTruthCalculationAllowed: false,
      workloadRecalculationAllowed: false,
      plannerPreviewRecomputationAllowed: false,
      taskMutationAllowed: false,
      capacityMutationAllowed: false,
      plannerConfirmationAllowed: false,
      plannerApplyAllowed: false,
      llmCallsAllowed: false,
      providerCallsAllowed: false
    }
  };
  const bytes = new TextEncoder().encode(JSON.stringify(response)).byteLength;
  if (bytes > COACH_EVIDENCE_DETAIL_V1_LIMITS.serializedBytes) {
    throw new Error(`COACH_EVIDENCE_DETAIL_V1_TOO_LARGE:${bytes}`);
  }
  return deepFreeze3(response);
}

// packages/domain/src/ai-coach/ai-economics-v1.ts
var AI_MODEL_ROUTER_V1_VERSION = "ai-model-router-v1";
var AI_EVIDENCE_ESTIMATE_V1_VERSION = "ai-evidence-estimate-v1";
var AI_PRICING_CATALOG_V1_CONTRACT_VERSION = "ai-pricing-catalog-v1";
var AI_FX_POLICY_V1_VERSION = "ai-fx-policy-v1";
var AI_USAGE_EVENT_V1_VERSION = "ai-usage-event-v1";
var AI_MONTHLY_BUDGET_POLICY_V1_VERSION = "ai-monthly-budget-policy-v1";
var AI_COST_PREFLIGHT_V1_VERSION = "ai-cost-preflight-v1";
var AI_COACH_CAPABILITIES_V1 = [
  "deterministic_signal_evaluation",
  "intent_extraction",
  "short_explanation",
  "today_analysis",
  "week_analysis",
  "subject_analysis",
  "planner_explanation",
  "proactive_explanation",
  "conversation_summary",
  "complex_status_analysis"
];
var AI_EVIDENCE_SIZE_LIMITS_V1 = Object.freeze({
  smallMaxBytes: 16384,
  mediumMaxBytes: 32768,
  largeMaxBytes: 65536,
  costWatchBytes: 24576
});
var AI_MONTHLY_BUDGET_POLICY_V1 = Object.freeze({
  version: AI_MONTHLY_BUDGET_POLICY_V1_VERSION,
  currency: "TRY",
  accountingTimezone: "Europe/Istanbul",
  thresholds: Object.freeze({
    normalTargetTry: 150,
    watchStartsTry: 150,
    constrainedStartsTry: 200,
    heavyTargetTry: 250,
    hardLimitTry: 300
  })
});
var AI_ROUTE_CATALOG_V1_TEST_FIXTURE = deepFreeze4({
  version: "ai-route-catalog-test-fixture-v1",
  contractVersion: AI_MODEL_ROUTER_V1_VERSION,
  effectiveFrom: "2026-09-01T00:00:00.000Z",
  pricingVersion: "ai-pricing-test-fixture-v1",
  environment: "test_fixture",
  routes: [
    { tier: "economy", provider: "fixture-provider", modelId: "fixture-economy-v1", maxOutputTokens: 500, timeoutMs: 8e3, retryPolicy: { maxAttempts: 2, retryableCategories: ["timeout", "rate_limit", "provider_unavailable"] }, fallbackTier: null },
    { tier: "standard", provider: "fixture-provider", modelId: "fixture-standard-v1", maxOutputTokens: 900, timeoutMs: 12e3, retryPolicy: { maxAttempts: 2, retryableCategories: ["timeout", "rate_limit", "provider_unavailable"] }, fallbackTier: "economy" },
    { tier: "strong", provider: "fixture-provider", modelId: "fixture-strong-v1", maxOutputTokens: 1400, timeoutMs: 18e3, retryPolicy: { maxAttempts: 2, retryableCategories: ["timeout", "rate_limit", "provider_unavailable"] }, fallbackTier: "standard" }
  ]
});
var AI_PRICING_CATALOG_V1_TEST_FIXTURE = deepFreeze4({
  contractVersion: AI_PRICING_CATALOG_V1_CONTRACT_VERSION,
  version: "ai-pricing-test-fixture-v1",
  effectiveFrom: "2026-09-01T00:00:00.000Z",
  environment: "test_fixture",
  entries: [
    { provider: "fixture-provider", modelId: "fixture-economy-v1", effectiveFrom: "2026-09-01T00:00:00.000Z", effectiveTo: null, billingCurrency: "USD", inputPerMillionTokens: 1, cachedInputPerMillionTokens: 0.25, outputPerMillionTokens: 4, sourceKind: "test_fixture" },
    { provider: "fixture-provider", modelId: "fixture-standard-v1", effectiveFrom: "2026-09-01T00:00:00.000Z", effectiveTo: null, billingCurrency: "USD", inputPerMillionTokens: 3, cachedInputPerMillionTokens: 0.75, outputPerMillionTokens: 12, sourceKind: "test_fixture" },
    { provider: "fixture-provider", modelId: "fixture-strong-v1", effectiveFrom: "2026-09-01T00:00:00.000Z", effectiveTo: null, billingCurrency: "USD", inputPerMillionTokens: 10, cachedInputPerMillionTokens: 2.5, outputPerMillionTokens: 40, sourceKind: "test_fixture" }
  ]
});
var AI_FX_SNAPSHOT_V1_TEST_FIXTURE = deepFreeze4({
  policyVersion: AI_FX_POLICY_V1_VERSION,
  snapshotVersion: "usd-try-test-fixture-2026-09-01",
  source: "test-fixture-only",
  sourceKind: "test_fixture",
  baseCurrency: "USD",
  quoteCurrency: "TRY",
  rate: 40,
  effectiveAt: "2026-09-01T00:00:00.000Z"
});
var CAPABILITY_DEFAULT_TIER = Object.freeze({
  deterministic_signal_evaluation: "no_model",
  intent_extraction: "economy",
  short_explanation: "economy",
  today_analysis: "standard",
  week_analysis: "strong",
  subject_analysis: "standard",
  planner_explanation: "standard",
  proactive_explanation: "economy",
  conversation_summary: "economy",
  complex_status_analysis: "strong"
});
function deepFreeze4(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze4(item);
  }
  return value;
}
function assertFiniteNonNegative(value, code) {
  if (!Number.isFinite(value) || value < 0) throw new Error(code);
}
function assertIntegerNonNegative(value, code) {
  if (value !== null && (!Number.isInteger(value) || value < 0)) throw new Error(code);
}
function assertExactKeys(value, keys, code) {
  const allowed = new Set(keys);
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new Error(code);
}
function isIsoInstant(value) {
  return Number.isFinite(Date.parse(value)) && value.includes("T");
}
function assertRuntimeEnvironment(value) {
  if (value !== "test" && value !== "local" && value !== "production") throw new Error("AI_RUNTIME_ENVIRONMENT_REQUIRED");
}
function round(value, digits = 9) {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}
function tierRank(tier) {
  return { economy: 0, standard: 1, strong: 2 }[tier];
}
function tierAtRank(rank) {
  return ["economy", "standard", "strong"][Math.max(0, Math.min(2, rank))];
}
function estimateAiEvidenceV1(bytes) {
  if (!Number.isInteger(bytes) || bytes < 0 || bytes > AI_EVIDENCE_SIZE_LIMITS_V1.largeMaxBytes) throw new Error("AI_EVIDENCE_BYTES_OUT_OF_RANGE");
  const sizeClass = bytes <= AI_EVIDENCE_SIZE_LIMITS_V1.smallMaxBytes ? "small" : bytes <= AI_EVIDENCE_SIZE_LIMITS_V1.mediumMaxBytes ? "medium" : "large";
  return deepFreeze4({
    version: AI_EVIDENCE_ESTIMATE_V1_VERSION,
    bytes,
    sizeClass,
    estimatedInputTokens: bytes,
    method: "utf8_byte_count_upper_bound",
    providerTokenizerUsed: false,
    conservativeEstimate: true,
    costWatch: bytes >= AI_EVIDENCE_SIZE_LIMITS_V1.costWatchBytes
  });
}
function routeAiCapabilityV1(input, catalog) {
  assertExactKeys(input, ["runtimeEnvironment", "capability", "evidence", "expectedResponse", "budgetState", "complexity"], "AI_ROUTE_INPUT_UNKNOWN_FIELD");
  assertRuntimeEnvironment(input.runtimeEnvironment);
  if (!["test_fixture", "local", "production"].includes(catalog.environment)) throw new Error("AI_ROUTE_CATALOG_INVALID");
  if (input.runtimeEnvironment === "production" && catalog.environment !== "production") throw new Error("AI_ROUTE_PRODUCTION_CATALOG_UNAVAILABLE");
  if (!AI_COACH_CAPABILITIES_V1.includes(input.capability)) throw new Error("AI_ROUTE_CAPABILITY_UNSUPPORTED");
  const classified = estimateAiEvidenceV1(input.evidence.bytes);
  if (JSON.stringify(classified) !== JSON.stringify(input.evidence)) throw new Error("AI_ROUTE_EVIDENCE_CLASSIFICATION_MISMATCH");
  if (catalog.contractVersion !== AI_MODEL_ROUTER_V1_VERSION || catalog.routes.length === 0) throw new Error("AI_ROUTE_CATALOG_INVALID");
  if (!isIsoInstant(catalog.effectiveFrom) || new Set(catalog.routes.map((item) => item.tier)).size !== catalog.routes.length) throw new Error("AI_ROUTE_CATALOG_INVALID");
  if (catalog.routes.some((item) => !item.provider.trim() || !item.modelId.trim() || !Number.isInteger(item.maxOutputTokens) || item.maxOutputTokens <= 0 || !Number.isInteger(item.timeoutMs) || item.timeoutMs <= 0 || !Number.isInteger(item.retryPolicy.maxAttempts) || item.retryPolicy.maxAttempts < 1)) throw new Error("AI_ROUTE_CATALOG_INVALID");
  const base = CAPABILITY_DEFAULT_TIER[input.capability];
  const noRetry = { maxAttempts: 0, retryableCategories: [] };
  const authority2 = { serverOwnedSelection: true, clientOverrideAllowed: false, rawUserTextUsed: false, providerCallMade: false };
  if (base === "no_model") return deepFreeze4({
    version: AI_MODEL_ROUTER_V1_VERSION,
    runtimeEnvironment: input.runtimeEnvironment,
    catalogEnvironment: catalog.environment,
    catalogVersion: catalog.version,
    pricingVersion: catalog.pricingVersion,
    capability: input.capability,
    disposition: "no_model",
    provider: null,
    modelId: null,
    tier: "no_model",
    maxOutputTokens: 0,
    timeoutMs: 0,
    retryPolicy: noRetry,
    fallbackTier: null,
    reasonCode: "deterministic_capability_no_model",
    authority: authority2
  });
  if (input.budgetState === "unknown" || input.budgetState === "hard_limit") return deepFreeze4({
    version: AI_MODEL_ROUTER_V1_VERSION,
    runtimeEnvironment: input.runtimeEnvironment,
    catalogEnvironment: catalog.environment,
    catalogVersion: catalog.version,
    pricingVersion: catalog.pricingVersion,
    capability: input.capability,
    disposition: "blocked",
    provider: null,
    modelId: null,
    tier: "no_model",
    maxOutputTokens: 0,
    timeoutMs: 0,
    retryPolicy: noRetry,
    fallbackTier: null,
    reasonCode: input.budgetState === "unknown" ? "budget_unknown_fail_closed" : "budget_hard_limit_blocked",
    authority: authority2
  });
  let rank = tierRank(base);
  let reasonCode = "capability_default_route";
  if (input.evidence.sizeClass === "large" || input.expectedResponse === "long" || input.complexity === "high") {
    rank = Math.min(2, rank + 1);
    reasonCode = "evidence_or_complexity_escalation";
  }
  if (input.budgetState === "watch" && rank > 1) {
    rank = 1;
    reasonCode = "budget_watch_route_cap";
  }
  if (input.budgetState === "constrained") {
    rank = 0;
    reasonCode = "budget_constrained_economy_only";
  }
  const tier = tierAtRank(rank);
  const route = catalog.routes.find((item) => item.tier === tier);
  if (!route) throw new Error("AI_ROUTE_TIER_UNAVAILABLE");
  return deepFreeze4({
    version: AI_MODEL_ROUTER_V1_VERSION,
    runtimeEnvironment: input.runtimeEnvironment,
    catalogEnvironment: catalog.environment,
    catalogVersion: catalog.version,
    pricingVersion: catalog.pricingVersion,
    capability: input.capability,
    disposition: "model",
    provider: route.provider,
    modelId: route.modelId,
    tier,
    maxOutputTokens: route.maxOutputTokens,
    timeoutMs: route.timeoutMs,
    retryPolicy: structuredClone(route.retryPolicy),
    fallbackTier: route.fallbackTier,
    reasonCode,
    authority: authority2
  });
}
function validateUsage(usage) {
  assertExactKeys(usage, ["availability", "inputTokens", "cachedInputTokens", "outputTokens", "totalTokens", "source"], "AI_USAGE_UNKNOWN_FIELD");
  assertIntegerNonNegative(usage.inputTokens, "AI_USAGE_INPUT_TOKENS_INVALID");
  assertIntegerNonNegative(usage.cachedInputTokens, "AI_USAGE_CACHED_TOKENS_INVALID");
  assertIntegerNonNegative(usage.outputTokens, "AI_USAGE_OUTPUT_TOKENS_INVALID");
  assertIntegerNonNegative(usage.totalTokens, "AI_USAGE_TOTAL_TOKENS_INVALID");
  if (usage.availability === "reported") {
    if (usage.inputTokens === null || usage.cachedInputTokens === null || usage.outputTokens === null || usage.totalTokens === null) throw new Error("AI_USAGE_REPORTED_VALUES_REQUIRED");
    if (usage.cachedInputTokens > usage.inputTokens || usage.totalTokens !== usage.inputTokens + usage.outputTokens || usage.source !== "provider_response") throw new Error("AI_USAGE_REPORTED_VALUES_INCONSISTENT");
  } else if ([usage.inputTokens, usage.cachedInputTokens, usage.outputTokens, usage.totalTokens].some((value) => value !== null) || usage.source !== "provider_usage_unavailable") {
    throw new Error("AI_USAGE_UNAVAILABLE_MUST_BE_NULL");
  }
}
function calculateAiNativeCostV1(route, usage, catalog, occurredAt) {
  validateUsage(usage);
  assertRuntimeEnvironment(route.runtimeEnvironment);
  if (route.disposition !== "model" || route.provider === null || route.modelId === null) return { state: "not_applicable", pricingVersion: catalog.version, nativeAmount: 0, nativeCurrency: null, reason: "no_model_route" };
  if (usage.availability === "unavailable") return { state: "unpriced", pricingVersion: catalog.version, nativeAmount: null, nativeCurrency: null, reason: "usage_unavailable" };
  if (route.runtimeEnvironment === "production" && catalog.environment !== "production") return { state: "unpriced", pricingVersion: catalog.version, nativeAmount: null, nativeCurrency: null, reason: "authoritative_production_pricing_unavailable" };
  const at = Date.parse(occurredAt);
  const entry = catalog.entries.find((item) => item.provider === route.provider && item.modelId === route.modelId && Date.parse(item.effectiveFrom) <= at && (item.effectiveTo === null || at < Date.parse(item.effectiveTo)));
  if (!entry || catalog.version !== route.pricingVersion) return { state: "unpriced", pricingVersion: catalog.version, nativeAmount: null, nativeCurrency: null, reason: "pricing_entry_unavailable" };
  if (route.runtimeEnvironment === "production" && entry.sourceKind !== "authoritative_config") return { state: "unpriced", pricingVersion: catalog.version, nativeAmount: null, nativeCurrency: entry.billingCurrency, reason: "authoritative_production_pricing_unavailable" };
  assertFiniteNonNegative(entry.inputPerMillionTokens, "AI_PRICING_INPUT_INVALID");
  assertFiniteNonNegative(entry.outputPerMillionTokens, "AI_PRICING_OUTPUT_INVALID");
  if (entry.cachedInputPerMillionTokens !== null) assertFiniteNonNegative(entry.cachedInputPerMillionTokens, "AI_PRICING_CACHED_INPUT_INVALID");
  if (usage.cachedInputTokens > 0 && entry.cachedInputPerMillionTokens === null) return { state: "unpriced", pricingVersion: catalog.version, nativeAmount: null, nativeCurrency: entry.billingCurrency, reason: "cached_input_price_unavailable" };
  const uncachedTokens = usage.inputTokens - usage.cachedInputTokens;
  const uncachedInput = round(uncachedTokens * entry.inputPerMillionTokens / 1e6);
  const cachedInput = round(usage.cachedInputTokens * (entry.cachedInputPerMillionTokens ?? 0) / 1e6);
  const output = round(usage.outputTokens * entry.outputPerMillionTokens / 1e6);
  return { state: "known", pricingVersion: catalog.version, nativeAmount: round(uncachedInput + cachedInput + output), nativeCurrency: entry.billingCurrency, components: { uncachedInput, cachedInput, output } };
}
function convertAiCostToTryV1(nativeCost, fx, runtimeEnvironment) {
  assertRuntimeEnvironment(runtimeEnvironment);
  if (nativeCost.state === "not_applicable") return { state: "not_applicable", amount: 0, currency: "TRY", reason: "no_model_route", fx: null };
  if (nativeCost.state === "unpriced") return { state: "unknown", amount: null, currency: "TRY", reason: "native_cost_unpriced", fx };
  if (runtimeEnvironment === "production" && (fx === null || fx.sourceKind !== "authoritative_config")) return { state: "unknown", amount: null, currency: "TRY", reason: "authoritative_production_fx_unavailable", fx };
  if (fx === null) return { state: "unknown", amount: null, currency: "TRY", reason: "fx_snapshot_unavailable", fx: null };
  assertFiniteNonNegative(fx.rate, "AI_FX_RATE_INVALID");
  if (fx.rate === 0) throw new Error("AI_FX_RATE_INVALID");
  if (fx.baseCurrency !== nativeCost.nativeCurrency || fx.quoteCurrency !== "TRY") return { state: "unknown", amount: null, currency: "TRY", reason: "fx_currency_mismatch", fx };
  return { state: "known", amount: round(nativeCost.nativeAmount * fx.rate, 6), currency: "TRY", fx: structuredClone(fx) };
}
function aiAccountingMonthV1(iso) {
  if (!isIsoInstant(iso)) throw new Error("AI_USAGE_TIMESTAMP_INVALID");
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: AI_MONTHLY_BUDGET_POLICY_V1.accountingTimezone, year: "numeric", month: "2-digit" }).formatToParts(new Date(iso));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}`;
}
function createAiUsageEventV1(input) {
  assertExactKeys(input, ["providerAttemptId", "identity", "feature", "route", "usage", "execution", "pricingCatalog", "fxSnapshot"], "AI_USAGE_EVENT_INPUT_UNKNOWN_FIELD");
  assertExactKeys(input.identity, ["userId", "examProfileId"], "AI_USAGE_IDENTITY_UNKNOWN_FIELD");
  assertExactKeys(input.feature, ["capability", "requestId", "correlationId"], "AI_USAGE_FEATURE_UNKNOWN_FIELD");
  assertExactKeys(input.execution, ["startedAt", "completedAt", "status", "retryNumber", "fallbackFromAttemptId", "errorCategory"], "AI_USAGE_EXECUTION_UNKNOWN_FIELD");
  if (input.route.disposition !== "model" || input.route.provider === null || input.route.modelId === null || input.route.tier === "no_model") throw new Error("AI_USAGE_EVENT_REQUIRES_PROVIDER_ATTEMPT");
  if (input.feature.capability !== input.route.capability) throw new Error("AI_USAGE_EVENT_CAPABILITY_ROUTE_MISMATCH");
  for (const value of [input.providerAttemptId, input.identity.userId, input.feature.requestId, input.feature.correlationId]) if (!value.trim()) throw new Error("AI_USAGE_EVENT_ID_REQUIRED");
  if (!isIsoInstant(input.execution.startedAt) || !isIsoInstant(input.execution.completedAt) || Date.parse(input.execution.completedAt) < Date.parse(input.execution.startedAt)) throw new Error("AI_USAGE_EXECUTION_TIME_INVALID");
  if (!Number.isInteger(input.execution.retryNumber) || input.execution.retryNumber < 0) throw new Error("AI_USAGE_RETRY_INVALID");
  if (input.execution.fallbackFromAttemptId === input.providerAttemptId) throw new Error("AI_USAGE_FALLBACK_SELF_REFERENCE");
  if (input.execution.status === "succeeded" !== (input.execution.errorCategory === "none")) throw new Error("AI_USAGE_STATUS_ERROR_MISMATCH");
  const nativeCost = calculateAiNativeCostV1(input.route, input.usage, input.pricingCatalog, input.execution.completedAt);
  const tryCost = convertAiCostToTryV1(nativeCost, input.fxSnapshot, input.route.runtimeEnvironment);
  return deepFreeze4({
    version: AI_USAGE_EVENT_V1_VERSION,
    providerAttemptId: input.providerAttemptId,
    userId: input.identity.userId,
    examProfileId: input.identity.examProfileId,
    capability: input.feature.capability,
    requestId: input.feature.requestId,
    correlationId: input.feature.correlationId,
    routeVersion: input.route.version,
    routeCatalogVersion: input.route.catalogVersion,
    provider: input.route.provider,
    modelId: input.route.modelId,
    tier: input.route.tier,
    routeReasonCode: input.route.reasonCode,
    pricingVersion: input.pricingCatalog.version,
    usage: structuredClone(input.usage),
    startedAt: input.execution.startedAt,
    completedAt: input.execution.completedAt,
    latencyMs: Date.parse(input.execution.completedAt) - Date.parse(input.execution.startedAt),
    status: input.execution.status,
    retryNumber: input.execution.retryNumber,
    fallbackFromAttemptId: input.execution.fallbackFromAttemptId,
    errorCategory: input.execution.errorCategory,
    nativeCost,
    tryCost,
    accountingMonth: aiAccountingMonthV1(input.execution.completedAt),
    privacy: { rawPromptStored: false, rawConversationStored: false, fullCoachContextStored: false }
  });
}
function budgetState(committedTry) {
  const { watchStartsTry, constrainedStartsTry, hardLimitTry } = AI_MONTHLY_BUDGET_POLICY_V1.thresholds;
  if (committedTry >= hardLimitTry) return "hard_limit";
  if (committedTry >= constrainedStartsTry) return "constrained";
  if (committedTry >= watchStartsTry) return "watch";
  return "normal";
}
function aggregateMonthlyAiUsageV1(input) {
  if (!/^\d{4}-\d{2}$/.test(input.accountingMonth)) throw new Error("AI_BUDGET_MONTH_INVALID");
  const scopedEvents = input.events.filter((item) => item.userId === input.userId && (input.examProfileId === null || item.examProfileId === input.examProfileId) && item.accountingMonth === input.accountingMonth);
  if (scopedEvents.some((event) => aiAccountingMonthV1(event.completedAt) !== event.accountingMonth)) throw new Error("AI_USAGE_ACCOUNTING_MONTH_MISMATCH");
  const unique = /* @__PURE__ */ new Map();
  let duplicateAttemptCount = 0;
  for (const event of scopedEvents) {
    const existing = unique.get(event.providerAttemptId);
    if (existing && JSON.stringify(existing) !== JSON.stringify(event)) throw new Error("AI_USAGE_ATTEMPT_CONFLICT");
    if (existing) duplicateAttemptCount += 1;
    else unique.set(event.providerAttemptId, event);
  }
  const values = [...unique.values()];
  const unpricedAttemptCount = values.filter((event) => event.tryCost.state !== "known").length;
  const activeReservations = (input.reservations ?? []).filter((item) => item.userId === input.userId && (input.examProfileId === null || item.examProfileId === input.examProfileId) && item.accountingMonth === input.accountingMonth && item.state === "active");
  if (activeReservations.some((item) => !Number.isFinite(item.tryAmount) || item.tryAmount < 0)) throw new Error("AI_BUDGET_RESERVATION_AMOUNT_INVALID");
  const reservedTry = round(activeReservations.reduce((sum, item) => sum + item.tryAmount, 0), 6);
  if (unpricedAttemptCount > 0) return deepFreeze4({
    version: AI_MONTHLY_BUDGET_POLICY_V1_VERSION,
    scope: input.examProfileId === null ? "user" : "profile",
    userId: input.userId,
    examProfileId: input.examProfileId,
    accountingMonth: input.accountingMonth,
    availability: "unknown",
    unknownReason: "unpriced_usage_present",
    spentTry: null,
    reservedTry,
    committedTry: null,
    remainingTry: null,
    utilizationPercent: null,
    budgetState: null,
    uniqueAttemptCount: values.length,
    unpricedAttemptCount,
    duplicateAttemptCount,
    thresholds: AI_MONTHLY_BUDGET_POLICY_V1.thresholds
  });
  const spentTry = round(values.reduce((sum, event) => sum + (event.tryCost.state === "known" ? event.tryCost.amount : 0), 0), 6);
  const committedTry = round(spentTry + reservedTry, 6);
  const hard = AI_MONTHLY_BUDGET_POLICY_V1.thresholds.hardLimitTry;
  return deepFreeze4({
    version: AI_MONTHLY_BUDGET_POLICY_V1_VERSION,
    scope: input.examProfileId === null ? "user" : "profile",
    userId: input.userId,
    examProfileId: input.examProfileId,
    accountingMonth: input.accountingMonth,
    availability: "known",
    unknownReason: null,
    spentTry,
    reservedTry,
    committedTry,
    remainingTry: round(Math.max(0, hard - committedTry), 6),
    utilizationPercent: round(committedTry / hard * 100, 4),
    budgetState: budgetState(committedTry),
    uniqueAttemptCount: values.length,
    unpricedAttemptCount: 0,
    duplicateAttemptCount,
    thresholds: AI_MONTHLY_BUDGET_POLICY_V1.thresholds
  });
}
function preflightAiCostV1(input) {
  const { route, evidence, budget } = input;
  if (input.reservationIdentity.userId !== budget.userId || budget.examProfileId !== null && input.reservationIdentity.examProfileId !== budget.examProfileId) throw new Error("AI_COST_PREFLIGHT_SCOPE_MISMATCH");
  if (route.disposition !== "model") return deepFreeze4({ version: AI_COST_PREFLIGHT_V1_VERSION, route, evidence, estimateKind: "upper_bound_not_actual_billing", estimatedUsage: { availability: "unavailable", inputTokens: null, cachedInputTokens: null, outputTokens: null, totalTokens: null, source: "provider_usage_unavailable" }, estimatedNativeCost: { state: "not_applicable", pricingVersion: route.pricingVersion, nativeAmount: 0, nativeCurrency: null, reason: "no_model_route" }, estimatedTryCost: { state: "not_applicable", amount: 0, currency: "TRY", reason: "no_model_route", fx: null }, allowed: false, reasonCode: "route_blocked", reservationProposal: null, reservationPersistence: "not_implemented_in_6b5", providerCallMade: false });
  if (!Number.isInteger(input.operationalOverheadTokens) || input.operationalOverheadTokens < 0) throw new Error("AI_PREFLIGHT_OVERHEAD_INVALID");
  const inputTokens = evidence.estimatedInputTokens + input.operationalOverheadTokens;
  const estimatedUsage = { availability: "reported", inputTokens, cachedInputTokens: 0, outputTokens: route.maxOutputTokens, totalTokens: inputTokens + route.maxOutputTokens, source: "provider_response" };
  const nativeCost = calculateAiNativeCostV1(route, estimatedUsage, input.pricingCatalog, input.estimatedAt);
  const tryCost = convertAiCostToTryV1(nativeCost, input.fxSnapshot, route.runtimeEnvironment);
  let reasonCode = "within_budget";
  if (budget.availability === "unknown") reasonCode = "budget_unknown";
  else if (tryCost.state !== "known") reasonCode = "cost_unknown";
  else if (budget.budgetState === "hard_limit") reasonCode = "hard_limit";
  else if (tryCost.amount > budget.remainingTry) reasonCode = "estimated_cost_exceeds_remaining";
  const allowed = reasonCode === "within_budget";
  const reservationProposal = allowed && tryCost.state === "known" ? {
    reservationId: input.reservationIdentity.reservationId,
    userId: input.reservationIdentity.userId,
    examProfileId: input.reservationIdentity.examProfileId,
    accountingMonth: budget.accountingMonth,
    tryAmount: tryCost.amount,
    state: "active",
    expiresAt: input.reservationIdentity.expiresAt
  } : null;
  return deepFreeze4({ version: AI_COST_PREFLIGHT_V1_VERSION, route, evidence, estimateKind: "upper_bound_not_actual_billing", estimatedUsage, estimatedNativeCost: nativeCost, estimatedTryCost: tryCost, allowed, reasonCode, reservationProposal, reservationPersistence: "not_implemented_in_6b5", providerCallMade: false });
}
export {
  AI_COACH_CAPABILITIES_V1,
  AI_COACH_INTENTS_V1,
  AI_COST_PREFLIGHT_V1_VERSION,
  AI_EVIDENCE_ESTIMATE_V1_VERSION,
  AI_EVIDENCE_SIZE_LIMITS_V1,
  AI_EVIDENCE_TYPES_V1,
  AI_FX_POLICY_V1_VERSION,
  AI_FX_SNAPSHOT_V1_TEST_FIXTURE,
  AI_MODEL_ROUTER_V1_VERSION,
  AI_MONTHLY_BUDGET_POLICY_V1,
  AI_MONTHLY_BUDGET_POLICY_V1_VERSION,
  AI_PRICING_CATALOG_V1_CONTRACT_VERSION,
  AI_PRICING_CATALOG_V1_TEST_FIXTURE,
  AI_ROUTE_CATALOG_V1_TEST_FIXTURE,
  AI_USAGE_EVENT_V1_VERSION,
  AI_VALIDATION_STATUSES_V1,
  COACH_CONTEXT_V1_LEGACY_EXCLUSIONS,
  COACH_CONTEXT_V1_LIMITS,
  COACH_CONTEXT_V1_SOURCE_MAP,
  COACH_CONTEXT_V1_TRUTH_SOURCES,
  COACH_CONTEXT_V1_VERSION,
  COACH_EVIDENCE_CAPABILITIES_V1,
  COACH_EVIDENCE_DETAIL_KINDS_V1,
  COACH_EVIDENCE_DETAIL_REQUEST_V1_VERSION,
  COACH_EVIDENCE_DETAIL_RESPONSE_V1_VERSION,
  COACH_EVIDENCE_DETAIL_V1_LIMITS,
  COACH_EVIDENCE_SCOPES_V1,
  COACH_EVIDENCE_SCOPE_CAPABILITY_V1,
  COACH_EVIDENCE_SCOPE_RULES_V1,
  COACH_EVIDENCE_SIGNAL_TYPES_V1,
  COACH_EVIDENCE_VIEW_V1_LIMITS,
  COACH_EVIDENCE_VIEW_V1_VERSION,
  COACH_SIGNAL_CANDIDATE_V1_VERSION,
  COACH_SIGNAL_FRESHNESS_POLICY_V1,
  COACH_SIGNAL_REGISTRY_V1,
  COACH_SIGNAL_SET_V1_VERSION,
  COACH_SIGNAL_TYPES_V1,
  COACH_SIGNAL_V1_LIMITS,
  aggregateMonthlyAiUsageV1,
  aiAccountingMonthV1,
  blockedCoachContextV1Fact,
  buildAiCoachSystemPromptV1,
  buildCoachContextV1,
  buildCoachSignalSetV1,
  calculateAiNativeCostV1,
  convertAiCostToTryV1,
  createAiUsageEventV1,
  estimateAiEvidenceV1,
  executeAiStudyMessageV1,
  knownCoachContextV1Fact,
  mapAiInterpretationToDomainEventV1,
  notApplicableCoachContextV1Fact,
  preflightAiCostV1,
  projectCoachEvidenceViewV1,
  resolveCoachEvidenceDetailV1,
  routeAiCapabilityV1,
  staleCoachContextV1Fact,
  unknownCoachContextV1Fact,
  validateAiInterpretationV1
};
