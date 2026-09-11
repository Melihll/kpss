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
    allowedContextPaths: ["identity", "today", "week.summary", "week.study", "week.studyIntentCoverage", "week.progressPosition", "nextWork"],
    excludedContextPaths: ["week.tasks", "subjects", "materials", "workload", "capacity", "recentProgress", "planner", "signalInputs"],
    collectionLimits: { "today.tasks": 8 },
    detailKinds: ["today_tasks", "recent_sessions"]
  },
  week_progress: {
    capability: "progress_analysis",
    allowedContextPaths: ["week", "subjects", "capacity", "recentProgress"],
    excludedContextPaths: ["identity", "today.tasks", "week.tasks", "nextWork", "materials", "workload", "planner", "signalInputs"],
    collectionLimits: { subjects: 12, "capacity.days": 7, "recentProgress.taskEvents": 8, "recentProgress.sessions": 6, "recentProgress.transitions": 4 },
    detailKinds: ["week_tasks", "subject_tasks", "recent_sessions"]
  },
  subject_progress: {
    capability: "progress_analysis",
    allowedContextPaths: ["subjects[selected]", "week", "materials[selected]", "recentProgress[selected]", "nextWork[selected]"],
    excludedContextPaths: ["identity", "today.tasks", "week.tasks", "workload.minutesByResource", "capacity", "planner", "signalInputs"],
    collectionLimits: { subjects: 1, "canonicalWork.materials": 6, "recentProgress.taskEvents": 6, "recentProgress.sessions": 6, "recentProgress.transitions": 4 },
    detailKinds: ["subject_tasks", "recent_sessions", "subject_material_progress"]
  },
  canonical_work: {
    capability: "guide",
    allowedContextPaths: ["nextWork", "workload", "materials"],
    excludedContextPaths: ["identity", "today", "week", "subjects", "capacity", "recentProgress", "planner", "signalInputs"],
    collectionLimits: { "canonicalWork.materials": 8 },
    detailKinds: ["subject_material_progress"]
  },
  capacity_status: {
    capability: "status_analysis",
    allowedContextPaths: ["today.summary", "today.study", "week.summary", "capacity"],
    excludedContextPaths: ["identity", "today.tasks", "week.tasks", "subjects", "nextWork", "materials", "workload", "recentProgress", "planner", "signalInputs"],
    collectionLimits: { "capacity.days": 7 },
    detailKinds: ["today_tasks", "week_tasks"]
  },
  planner_explanation: {
    capability: "planner_proposal_interpretation",
    allowedContextPaths: ["planner"],
    excludedContextPaths: ["identity", "today", "week", "subjects", "nextWork", "materials", "workload", "capacity", "recentProgress", "signalInputs"],
    collectionLimits: { "planner.warnings": 8, "planner.explanationFacts": 12 },
    detailKinds: ["planner_explanation_detail"]
  },
  general_status: {
    capability: "status_analysis",
    allowedContextPaths: ["identity", "today.summary", "today.study", "week", "subjects", "nextWork", "workload", "capacity"],
    excludedContextPaths: ["today.tasks", "week.tasks", "materials", "recentProgress", "planner", "signalInputs"],
    collectionLimits: { subjects: 8, "capacity.days": 7 },
    detailKinds: ["today_tasks", "week_tasks", "subject_tasks", "recent_sessions", "subject_material_progress"]
  },
  proactive_candidate: {
    capability: "proactive_insight_candidate",
    allowedContextPaths: ["today.summary", "week", "subjects", "workload", "capacity", "signalInputs"],
    excludedContextPaths: ["identity", "today.tasks", "week.tasks", "nextWork", "materials", "recentProgress", "planner"],
    collectionLimits: { subjects: 8, "capacity.days": 7, signalInputs: 12 },
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
function normalizeProvenance2(items) {
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
    provenance: [...normalizeProvenance2(provenance)]
  };
}
function deepFreeze2(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze2(child);
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
        }
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
        }, collections)
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
        }, collections, subjectId)
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
        capacity: projectCapacity(context, rule.collectionLimits["capacity.days"], collections)
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
        signalInputs: mapFact(context.signalInputs, (signals) => limitCollection(signals, "signalInputs", rule.collectionLimits.signalInputs, collections))
      };
      break;
  }
  const metadata = collectFactMetadata(evidence);
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
    provenance: metadata.provenance,
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
  return deepFreeze2(view);
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
    provenance: normalizeProvenance2(payload.provenance),
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
  return deepFreeze2(response);
}
export {
  AI_COACH_INTENTS_V1,
  AI_EVIDENCE_TYPES_V1,
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
  COACH_EVIDENCE_VIEW_V1_LIMITS,
  COACH_EVIDENCE_VIEW_V1_VERSION,
  blockedCoachContextV1Fact,
  buildAiCoachSystemPromptV1,
  buildCoachContextV1,
  executeAiStudyMessageV1,
  knownCoachContextV1Fact,
  mapAiInterpretationToDomainEventV1,
  notApplicableCoachContextV1Fact,
  projectCoachEvidenceViewV1,
  resolveCoachEvidenceDetailV1,
  staleCoachContextV1Fact,
  unknownCoachContextV1Fact,
  validateAiInterpretationV1
};
