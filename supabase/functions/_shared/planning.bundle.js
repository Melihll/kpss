// packages/domain/src/planning/config.ts
var DEFAULT_WEEKLY_UTILIZATION = 0.85;
var MAX_RESOURCE_UNITS_PER_TASK = 2;
var DEFAULT_LEARN_TOPIC_MINUTES = 60;
var PLANNING_GENERATION_VERSION = 1;
var DEFAULT_RESOURCE_UNIT_MINUTES = {
  test: 30,
  video: 45,
  chapter: 45,
  reading: 30,
  mock: 60,
  other: 30
};
var RESOURCE_ROLE_ORDER = [
  "primary",
  "reinforcement",
  "revision",
  "advanced",
  "mock"
];
var PRIORITY = {
  base: 40,
  carryover: 30,
  remediation: 20,
  practicing: 10,
  learning: 5,
  primaryResource: 5
};

// packages/domain/src/planning/errors.ts
var PlanningDomainError = class extends Error {
  constructor(code, message = code) {
    super(message);
    this.code = code;
  }
  code;
  name = "PlanningDomainError";
};

// packages/domain/src/capacity.ts
var DomainValidationError = class extends Error {
  name = "DomainValidationError";
};
function parseTime(value) {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value);
  if (!match) throw new DomainValidationError(`Invalid time: ${value}`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new DomainValidationError(`Invalid time: ${value}`);
  return hours * 60 + minutes;
}
function validatedIntervals(windows, weekday) {
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
    throw new DomainValidationError(`Invalid weekday: ${weekday}`);
  }
  return windows.filter((window) => window.is_active !== false && window.weekday === weekday).map((window) => {
    if (!Number.isInteger(window.weekday) || window.weekday < 1 || window.weekday > 7) {
      throw new DomainValidationError(`Invalid weekday: ${window.weekday}`);
    }
    const start = parseTime(window.start_time);
    const end = parseTime(window.end_time);
    if (end <= start) throw new DomainValidationError("Availability end time must be after start time");
    return { start, end };
  }).sort((left, right) => left.start - right.start || left.end - right.end);
}
function calculateDayAvailableMinutes(windows, weekday) {
  const intervals = validatedIntervals(windows, weekday);
  if (intervals.length === 0) return 0;
  let total = 0;
  let currentStart = intervals[0].start;
  let currentEnd = intervals[0].end;
  for (const interval of intervals.slice(1)) {
    if (interval.start <= currentEnd) {
      currentEnd = Math.max(currentEnd, interval.end);
    } else {
      total += currentEnd - currentStart;
      currentStart = interval.start;
      currentEnd = interval.end;
    }
  }
  return total + currentEnd - currentStart;
}
function calculateWeeklyAvailableMinutes(windows) {
  for (const window of windows) {
    if (!Number.isInteger(window.weekday) || window.weekday < 1 || window.weekday > 7) {
      throw new DomainValidationError(`Invalid weekday: ${window.weekday}`);
    }
  }
  return Array.from({ length: 7 }, (_, index) => index + 1).reduce(
    (total, weekday) => total + calculateDayAvailableMinutes(windows, weekday),
    0
  );
}

// packages/domain/src/planning/engine.ts
var STATE_ORDER = {
  remediation: 0,
  practicing: 1,
  learning: 2,
  not_started: 3,
  learned: 4,
  maintenance: 5
};
function addDays(isoDate, days) {
  const date = /* @__PURE__ */ new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}
function statePriority(state) {
  if (state === "remediation") return PRIORITY.remediation;
  if (state === "practicing") return PRIORITY.practicing;
  if (state === "learning") return PRIORITY.learning;
  return 0;
}
function roleRank(role) {
  return RESOURCE_ROLE_ORDER.indexOf(role);
}
function dedupeKey(profileId, week, subjectId, topicId, taskType, unitIds) {
  return [profileId, week, subjectId, topicId ?? "none", taskType, [...unitIds].sort().join(",") || "none"].join("|");
}
function activeTopicForSubject(context, subjectId) {
  const progressByNode = new Map(context.topicProgress.map((progress) => [progress.curriculumNodeId, progress.state]));
  return context.curriculum.filter((node) => node.subjectId === subjectId && node.nodeType === "topic" && node.isActive).map((node) => ({ node, state: progressByNode.get(node.id) ?? "not_started" })).filter(({ state }) => state !== "learned" && state !== "maintenance").sort((left, right) => STATE_ORDER[left.state] - STATE_ORDER[right.state] || left.node.sortOrder - right.node.sortOrder || left.node.id.localeCompare(right.node.id))[0];
}
function bestMappedResource(context, topic) {
  return context.resourceSections.filter((section) => section.curriculumNodeId === topic.id).map((section) => ({ section, resource: context.resources.find((resource) => resource.id === section.resourceId) })).filter((item) => Boolean(item.resource && item.resource.status === "active")).sort((left, right) => roleRank(left.resource.role) - roleRank(right.resource.role) || left.section.sortOrder - right.section.sortOrder || left.resource.id.localeCompare(right.resource.id)).map(({ section, resource }) => ({ resource, sectionId: section.id }))[0] ?? null;
}
function subjectCandidates(context) {
  const completedUnitIds = new Set(
    context.resourceUnitProgress.filter((progress) => progress.status === "completed").map((progress) => progress.resourceUnitId)
  );
  return context.subjects.filter((subject) => subject.status === "active").sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id)).map((subject, subjectOrder) => {
    const active = activeTopicForSubject(context, subject.id);
    if (!active) return [];
    const { node, state } = active;
    const candidates = [];
    if (state === "not_started" || state === "learning" || state === "remediation") {
      const importance = state === "remediation" ? "core" : "important";
      candidates.push({
        subjectId: subject.id,
        curriculumNodeId: node.id,
        resourceId: null,
        carriedFromTaskId: null,
        taskType: "learn_topic",
        title: `${subject.name}: ${node.name}`,
        description: "Konu \xE7al\u0131\u015Fmas\u0131",
        estimatedMinutes: DEFAULT_LEARN_TOPIC_MINUTES,
        importance,
        priorityScore: clampScore(PRIORITY.base + statePriority(state)),
        sourceReason: "curriculum_progress",
        dedupeKey: dedupeKey(context.examProfileId, context.weekStartDate, subject.id, node.id, "learn_topic", []),
        resourceUnitIds: [],
        subjectOrder,
        candidateOrder: 0
      });
    }
    const mapped = bestMappedResource(context, node);
    if (mapped) {
      const units = context.resourceUnits.filter((unit) => unit.sectionId === mapped.sectionId && !completedUnitIds.has(unit.id)).sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id)).slice(0, MAX_RESOURCE_UNITS_PER_TASK);
      if (units.length) {
        const unitIds = units.map((unit) => unit.id);
        candidates.push({
          subjectId: subject.id,
          curriculumNodeId: node.id,
          resourceId: mapped.resource.id,
          carriedFromTaskId: null,
          taskType: "solve_resource_units",
          title: `${subject.name}: ${node.name} \u2014 ${units.map((unit) => unit.name).join("\u2013")}`,
          description: `${mapped.resource.name}: ${units.map((unit) => unit.name).join(", ")}`,
          estimatedMinutes: units.reduce((sum, unit) => sum + (unit.estimatedMinutes ?? DEFAULT_RESOURCE_UNIT_MINUTES[unit.unitType]), 0),
          importance: "important",
          priorityScore: clampScore(PRIORITY.base + statePriority(state) + (mapped.resource.role === "primary" ? PRIORITY.primaryResource : 0)),
          sourceReason: "resource_progress",
          dedupeKey: dedupeKey(context.examProfileId, context.weekStartDate, subject.id, node.id, "solve_resource_units", unitIds),
          resourceUnitIds: unitIds,
          subjectOrder,
          candidateOrder: 1
        });
      }
    }
    return candidates;
  });
}
function roundRobin(groups) {
  const result = [];
  const maxLength = Math.max(0, ...groups.map((group) => group.length));
  for (let index = 0; index < maxLength; index += 1) {
    for (const group of groups) {
      if (group[index]) result.push(group[index]);
    }
  }
  return result;
}
function buildWeeklyPlanV0(context) {
  const availableMinutes = calculateWeeklyAvailableMinutes(context.weeklyAvailability);
  if (availableMinutes <= 0) throw new PlanningDomainError("NO_WEEKLY_AVAILABILITY");
  const planningBudgetMinutes = Math.floor(availableMinutes * DEFAULT_WEEKLY_UTILIZATION);
  const weekEndDate = addDays(context.weekStartDate, 6);
  const dailyRemaining = Array.from(
    { length: 7 },
    (_, index) => calculateDayAvailableMinutes(context.weeklyAvailability, index + 1)
  );
  let dayCursor = 0;
  let plannedMinutes = 0;
  const seen = /* @__PURE__ */ new Set();
  const selected = [];
  const carryovers = context.existingCarryoverTasks.map((task, index) => ({
    subjectId: task.subjectId,
    curriculumNodeId: task.curriculumNodeId,
    resourceId: task.resourceId,
    carriedFromTaskId: task.id,
    taskType: task.taskType,
    title: task.title,
    description: task.description,
    estimatedMinutes: task.estimatedMinutes,
    importance: "core",
    priorityScore: clampScore(Math.max(task.priorityScore, PRIORITY.base) + PRIORITY.carryover),
    sourceReason: "carryover",
    dedupeKey: dedupeKey(context.examProfileId, context.weekStartDate, task.subjectId, task.curriculumNodeId, `carryover:${task.id}`, task.resourceUnitIds),
    resourceUnitIds: [...task.resourceUnitIds],
    subjectOrder: -1,
    candidateOrder: index
  }));
  const candidates = [...carryovers, ...roundRobin(subjectCandidates(context))];
  for (const candidate of candidates) {
    if (seen.has(candidate.dedupeKey)) continue;
    seen.add(candidate.dedupeKey);
    if (plannedMinutes + candidate.estimatedMinutes > planningBudgetMinutes) continue;
    let assignedDay = -1;
    for (let offset = 0; offset < 7; offset += 1) {
      const day = (dayCursor + offset) % 7;
      if (dailyRemaining[day] >= candidate.estimatedMinutes) {
        assignedDay = day;
        break;
      }
    }
    if (assignedDay < 0) continue;
    dailyRemaining[assignedDay] -= candidate.estimatedMinutes;
    dayCursor = (assignedDay + 1) % 7;
    plannedMinutes += candidate.estimatedMinutes;
    selected.push({
      subjectId: candidate.subjectId,
      curriculumNodeId: candidate.curriculumNodeId,
      resourceId: candidate.resourceId,
      carriedFromTaskId: candidate.carriedFromTaskId,
      taskType: candidate.taskType,
      title: candidate.title,
      description: candidate.description,
      plannedDate: addDays(context.weekStartDate, assignedDay),
      estimatedMinutes: candidate.estimatedMinutes,
      importance: candidate.importance,
      priorityScore: candidate.priorityScore,
      status: "ready",
      sourceReason: candidate.sourceReason,
      dedupeKey: candidate.dedupeKey,
      resourceUnitIds: candidate.resourceUnitIds
    });
  }
  return {
    examProfileId: context.examProfileId,
    weekStartDate: context.weekStartDate,
    weekEndDate,
    availableMinutes,
    planningBudgetMinutes,
    plannedMinutes,
    generationVersion: PLANNING_GENERATION_VERSION,
    tasks: selected
  };
}

// packages/domain/src/planning/recommendation.ts
function remainingTaskMinutes(task) {
  if (task.pendingUnitMinutes != null) return Math.max(0, task.pendingUnitMinutes);
  return Math.max(0, task.estimatedMinutes - task.completedMinutes);
}
function tier(task, today) {
  if (task.status === "in_progress") return 1;
  if (task.status === "partially_completed") return 2;
  if (task.isRevision && task.revisionUrgency === "critical_overdue") return 3;
  const overdue = Boolean(task.plannedDate && task.plannedDate < today);
  const dueToday = task.plannedDate === today;
  if (overdue && task.importance === "core") return 4;
  if (task.topicState === "remediation" || task.masteryLevel === "critical" || task.masteryLevel === "weak") return 5;
  if (task.isRevision && (task.revisionUrgency === "due" || task.revisionUrgency === "overdue")) return 6;
  if (dueToday && task.importance === "core") return 7;
  if (overdue && task.importance === "important") return 8;
  if (dueToday && task.importance === "important") return 9;
  if (task.importance !== "optional") return 10;
  return 11;
}
function reasonFor(task, today, fits) {
  if (task.status === "in_progress") return "continue_in_progress";
  if (task.status === "partially_completed") return "continue_partial";
  if (task.isRevision && task.revisionUrgency === "critical_overdue") return "critical_revision";
  if (task.plannedDate && task.plannedDate < today && task.importance === "core") return "overdue_core";
  if (task.topicState === "remediation" || task.masteryLevel === "critical" || task.masteryLevel === "weak") return "weak_topic";
  if (task.isRevision && (task.revisionUrgency === "due" || task.revisionUrgency === "overdue")) return "due_revision";
  if (task.plannedDate === today && task.importance === "core") return "today_core";
  if (task.plannedDate && task.plannedDate < today && task.importance === "important") return "overdue_important";
  if (task.plannedDate === today && task.importance === "important") return "today_important";
  if (fits) return "fits_available_window";
  return task.importance === "optional" ? "optional" : "highest_priority";
}
function getNextBestTask(tasks, options) {
  const eligible = tasks.filter((task) => !["completed", "cancelled", "missed"].includes(task.status));
  if (!eligible.length) throw new PlanningDomainError("NO_RECOMMENDABLE_TASK");
  const available = options.availableMinutes ?? null;
  const sorted = [...eligible].sort((left, right) => {
    const tierDifference = tier(left, options.today) - tier(right, options.today);
    if (tierDifference) return tierDifference;
    if (available != null) {
      const leftFits = remainingTaskMinutes(left) <= available;
      const rightFits = remainingTaskMinutes(right) <= available;
      if (leftFits !== rightFits) return leftFits ? -1 : 1;
    }
    return right.priorityScore - left.priorityScore || remainingTaskMinutes(left) - remainingTaskMinutes(right) || left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
  });
  const recommendedTask = sorted[0];
  const remainingMinutes = remainingTaskMinutes(recommendedTask);
  return {
    recommendedTask,
    reason: reasonFor(recommendedTask, options.today, available != null && remainingMinutes <= available),
    remainingMinutes
  };
}

// packages/domain/src/planning/lifecycle.ts
function deriveTaskStatus(input) {
  if (!Number.isFinite(input.completedMinutes) || input.completedMinutes < 0) {
    throw new PlanningDomainError("INVALID_TASK_PROGRESS");
  }
  const units = input.unitStatuses ?? [];
  const pendingUnits = units.filter((status) => status === "pending").length;
  if (input.explicitComplete) {
    if (pendingUnits > 0) throw new PlanningDomainError("TASK_HAS_PENDING_UNITS");
    return "completed";
  }
  if (units.length) {
    const completedUnits = units.filter((status) => status === "completed").length;
    if (completedUnits === units.length) return "completed";
    if (completedUnits > 0 || input.completedMinutes > 0) return "partially_completed";
    return input.currentStatus;
  }
  if (input.completedMinutes >= input.estimatedMinutes && input.estimatedMinutes > 0) return "completed";
  if (input.completedMinutes > 0) return "partially_completed";
  return input.currentStatus;
}
function transitionTopicForLearnTask(current, event) {
  if (event === "start") return current === "not_started" ? "learning" : current;
  if (current === "not_started" || current === "learning") return "practicing";
  return current;
}

// packages/domain/src/time-boundaries.ts
var DEFAULT_TIMEZONE = "Europe/Istanbul";
function parseDate(date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error("INVALID_DATE");
  const [, year, month, day] = match;
  const value = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12));
  if (value.toISOString().slice(0, 10) !== date) throw new Error("INVALID_DATE");
  return value;
}
function addDays2(date, days) {
  const value = parseDate(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
function mondayOf(date) {
  const value = parseDate(date);
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() - day + 1);
  return value.toISOString().slice(0, 10);
}
function timeZoneOffsetAt(utcMillis, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(utcMillis)).map((part) => [part.type, part.value]));
  const representedAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return representedAsUtc - Math.floor(utcMillis / 1e3) * 1e3;
}
function zonedMidnightToUtc(date, timeZone = DEFAULT_TIMEZONE) {
  const value = parseDate(date);
  const wallClockUtc = Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  let instant = wallClockUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    instant = wallClockUtc - timeZoneOffsetAt(instant, timeZone);
  }
  return new Date(instant).toISOString();
}
function getZonedDayRange(date, timeZone = DEFAULT_TIMEZONE) {
  return {
    startUtc: zonedMidnightToUtc(date, timeZone),
    endUtc: zonedMidnightToUtc(addDays2(date, 1), timeZone)
  };
}
function getZonedWeekRange(date, timeZone = DEFAULT_TIMEZONE) {
  const monday = mondayOf(date);
  return {
    startUtc: zonedMidnightToUtc(monday, timeZone),
    endUtc: zonedMidnightToUtc(addDays2(monday, 7), timeZone)
  };
}
function isInstantInRange(instant, range) {
  const value = new Date(instant).getTime();
  return value >= new Date(range.startUtc).getTime() && value < new Date(range.endUtc).getTime();
}

// packages/domain/src/mastery/config.ts
var MASTERY_RECENT_RESULT_LIMIT = 3;
var MIN_QUESTIONS_FOR_MASTERY = 20;
var MAX_MASTERY_LEVEL_STEP = 1;
var MASTERY_THRESHOLDS = {
  strong: 0.85,
  sufficient: 0.75,
  fragile: 0.65,
  weak: 0.55
};
var MASTERY_LEVEL_ORDER = [
  "critical",
  "weak",
  "fragile",
  "sufficient",
  "strong"
];
var REVISION_INTERVAL_DAYS = {
  strong: 7,
  sufficient: 5,
  fragile: 3,
  weak: 2,
  critical: 1
};
var REVISION_TYPE_BY_MASTERY = {
  strong: "short_review",
  sufficient: "short_review",
  fragile: "topic_test",
  weak: "topic_test",
  critical: "intensive_review"
};
var REVISION_ESTIMATED_MINUTES = {
  short_review: 15,
  wrong_review: 20,
  topic_test: 30,
  intensive_review: 45
};
var DEFAULT_WEEKLY_REVISION_BUDGET_RATIO = 0.2;
var CRITICAL_OVERDUE_AFTER_DAYS = 3;

// packages/domain/src/mastery/engine.ts
function candidateForAccuracy(accuracy) {
  if (accuracy >= MASTERY_THRESHOLDS.strong) return "strong";
  if (accuracy >= MASTERY_THRESHOLDS.sufficient) return "sufficient";
  if (accuracy >= MASTERY_THRESHOLDS.fragile) return "fragile";
  if (accuracy >= MASTERY_THRESHOLDS.weak) return "weak";
  return "critical";
}
function reasonFor2(level) {
  if (level === "strong") return "CONSISTENT_STRONG_RESULTS";
  if (level === "sufficient") return "SUFFICIENT_RESULTS";
  if (level === "fragile") return "FRAGILE_RESULTS";
  if (level === "weak") return "WEAK_RESULTS";
  return "CRITICAL_RESULTS";
}
function applyHysteresis(current, candidate) {
  if (current === "unknown" || candidate === "unknown") return candidate;
  const currentIndex = MASTERY_LEVEL_ORDER.indexOf(current);
  const candidateIndex = MASTERY_LEVEL_ORDER.indexOf(candidate);
  const distance = candidateIndex - currentIndex;
  if (Math.abs(distance) <= MAX_MASTERY_LEVEL_STEP) return candidate;
  return MASTERY_LEVEL_ORDER[currentIndex + Math.sign(distance) * MAX_MASTERY_LEVEL_STEP];
}
function topicStateFor(mastery, currentState, hasSufficientEvidence) {
  if (!hasSufficientEvidence || mastery === "unknown") return currentState;
  if (mastery === "strong" || mastery === "sufficient") {
    return currentState === "maintenance" ? "maintenance" : "learned";
  }
  if (mastery === "fragile") return "practicing";
  return "remediation";
}
function evaluateTopicMastery(context) {
  const recent = [...context.recentTestResults].sort((left, right) => new Date(right.completedAt).getTime() - new Date(left.completedAt).getTime()).slice(0, MASTERY_RECENT_RESULT_LIMIT);
  for (const result of recent) {
    if (![result.correct, result.wrong, result.blank, result.total].every(Number.isInteger) || result.correct < 0 || result.wrong < 0 || result.blank < 0 || result.total <= 0 || result.correct + result.wrong + result.blank !== result.total) {
      throw new Error("INVALID_MASTERY_TEST_RESULT");
    }
  }
  const sampleQuestionCount = recent.reduce((sum, result) => sum + result.total, 0);
  const sampleCorrectCount = recent.reduce((sum, result) => sum + result.correct, 0);
  const sampleWrongCount = recent.reduce((sum, result) => sum + result.wrong, 0);
  const sampleBlankCount = recent.reduce((sum, result) => sum + result.blank, 0);
  const hasSufficientEvidence = sampleQuestionCount >= MIN_QUESTIONS_FOR_MASTERY;
  const accuracy = sampleQuestionCount ? sampleCorrectCount / sampleQuestionCount : null;
  const candidateMasteryLevel = hasSufficientEvidence && accuracy !== null ? candidateForAccuracy(accuracy) : "unknown";
  const resultingMasteryLevel = hasSufficientEvidence ? applyHysteresis(context.currentMasteryLevel, candidateMasteryLevel) : context.currentMasteryLevel;
  return {
    sampleQuestionCount,
    sampleCorrectCount,
    sampleWrongCount,
    sampleBlankCount,
    accuracy,
    previousMasteryLevel: context.currentMasteryLevel,
    candidateMasteryLevel,
    resultingMasteryLevel,
    resultingTopicState: topicStateFor(resultingMasteryLevel, context.topicState, hasSufficientEvidence),
    reason: hasSufficientEvidence ? reasonFor2(candidateMasteryLevel) : "INSUFFICIENT_EVIDENCE",
    hasSufficientEvidence,
    hysteresisApplied: hasSufficientEvidence && resultingMasteryLevel !== candidateMasteryLevel
  };
}

// packages/domain/src/mastery/revision.ts
function parseDate2(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("INVALID_REVISION_DATE");
  const value = /* @__PURE__ */ new Date(`${date}T12:00:00Z`);
  if (value.toISOString().slice(0, 10) !== date) throw new Error("INVALID_REVISION_DATE");
  return value;
}
function addRevisionCalendarDays(date, days) {
  const value = parseDate2(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
function getRevisionUrgency(scheduledFor, today) {
  const scheduled = parseDate2(scheduledFor).getTime();
  const current = parseDate2(today).getTime();
  const daysLate = Math.floor((current - scheduled) / 864e5);
  if (daysLate < 0) return "upcoming";
  if (daysLate === 0) return "due";
  if (daysLate >= CRITICAL_OVERDUE_AFTER_DAYS) return "critical_overdue";
  return "overdue";
}
function buildRevisionDecision(context) {
  if (context.masteryLevel === "unknown") {
    return {
      shouldSchedule: false,
      shouldCreateNew: false,
      activeRevisionId: null,
      revisionType: null,
      intervalDays: null,
      scheduledFor: null,
      estimatedMinutes: null,
      reason: "INSUFFICIENT_EVIDENCE"
    };
  }
  const active = context.previousRevisionSchedules.find((schedule) => schedule.status === "scheduled" || schedule.status === "due");
  const revisionType = context.pendingWrongReview ? "wrong_review" : REVISION_TYPE_BY_MASTERY[context.masteryLevel];
  const intervalDays = REVISION_INTERVAL_DAYS[context.masteryLevel];
  return {
    shouldSchedule: true,
    shouldCreateNew: !active,
    activeRevisionId: active?.id ?? null,
    revisionType,
    intervalDays,
    scheduledFor: addRevisionCalendarDays(context.today, intervalDays),
    estimatedMinutes: REVISION_ESTIMATED_MINUTES[revisionType],
    reason: context.pendingWrongReview ? "PENDING_WRONG_REVIEW" : `MASTERY_${context.masteryLevel.toUpperCase()}`
  };
}
function calculateWeeklyRevisionBudget(planningBudgetMinutes, ratio = DEFAULT_WEEKLY_REVISION_BUDGET_RATIO) {
  if (!Number.isFinite(planningBudgetMinutes) || planningBudgetMinutes < 0 || ratio < 0 || ratio > 1) {
    throw new Error("INVALID_REVISION_BUDGET");
  }
  return Math.floor(planningBudgetMinutes * ratio);
}
function completeRevisionStatus(status) {
  if (status === "completed") return "completed";
  if (status !== "scheduled" && status !== "due") throw new Error("REVISION_NOT_ACTIVE");
  return "completed";
}

// packages/domain/src/adaptive/config.ts
var BACKLOG_THRESHOLDS = { normal: 0.7, attention: 0.9, risk: 1.1 };
var DEVIATION_THRESHOLDS = { normal: 0.05, attention: 0.1 };
var FIRST_PASS_BUFFER_DAYS = 30;
var MIN_PROJECTION_WEEKS = 2;
var PRIORITY_V1 = { scheduleUrgency: 25, weakness: 25, revisionUrgency: 20, planDeviation: 15, postponement: 10, dependency: 5 };
var REPLAN_LEVEL_1_CHANGE_LIMIT = 2;
var REPLAN_LEVEL_2_CHANGE_LIMIT = 6;

// packages/domain/src/adaptive/capacity.ts
var dateOk = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && (/* @__PURE__ */ new Date(`${value}T12:00:00Z`)).toISOString().slice(0, 10) === value;
var minute = (value) => {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value);
  if (!match) throw new Error("INVALID_TIME");
  return Number(match[1]) * 60 + Number(match[2]);
};
function isoWeekday(date) {
  if (!dateOk(date)) throw new Error("INVALID_DATE");
  const day = (/* @__PURE__ */ new Date(`${date}T12:00:00Z`)).getUTCDay();
  return day === 0 ? 7 : day;
}
function merged(intervals) {
  const sorted = intervals.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out = [];
  for (const item of sorted) {
    const last = out.at(-1);
    if (last && item[0] <= last[1]) last[1] = Math.max(last[1], item[1]);
    else out.push([...item]);
  }
  return out;
}
function calculateEffectiveDayCapacity(context) {
  const weekday = isoWeekday(context.date);
  const base = calculateDayAvailableMinutes(context.weeklyAvailability, weekday);
  const baseIntervals = merged(context.weeklyAvailability.filter((w) => w.is_active !== false && w.weekday === weekday).map((w) => [minute(w.start_time), minute(w.end_time)]));
  const unavailable = merged(context.scheduleExceptions.filter((e) => e.date === context.date && e.type === "unavailable" && e.startTime && e.endTime).map((e) => [minute(e.startTime), minute(e.endTime)]));
  let removed = 0;
  for (const [start, end] of baseIntervals) for (const [uStart, uEnd] of unavailable) removed += Math.max(0, Math.min(end, uEnd) - Math.max(start, uStart));
  const activeMultipliers = context.calendarPeriods.filter((p) => p.startDate <= context.date && p.endDate >= context.date && p.capacityMultiplier != null).map((p) => p.capacityMultiplier);
  const multiplier = activeMultipliers.length ? Math.min(...activeMultipliers) : 1;
  const delta = context.scheduleExceptions.filter((e) => e.date === context.date && ((e.type === "extra_available" || e.type === "custom") && e.minutesDelta != null || e.type === "unavailable" && e.minutesDelta != null)).reduce((sum, e) => sum + (e.minutesDelta ?? 0), 0);
  return Math.max(0, Math.round((base - removed) * Math.max(0, multiplier) + delta));
}
function addCalendarDays(date, days) {
  if (!dateOk(date)) throw new Error("INVALID_DATE");
  const value = /* @__PURE__ */ new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
function calculateEffectiveWeekCapacity(input) {
  return Array.from({ length: 7 }, (_, i) => calculateEffectiveDayCapacity({ ...input, date: addCalendarDays(input.weekStart, i) })).reduce((a, b) => a + b, 0);
}

// packages/domain/src/adaptive/backlog.ts
function evaluateBacklog(tasks, remainingCapacityMinutes) {
  const open = tasks.filter((t) => !["completed", "cancelled"].includes(t.status));
  const minutes = open.reduce((s, t) => s + Math.max(0, t.remainingMinutes), 0);
  const ratio = remainingCapacityMinutes <= 0 ? minutes ? Number.POSITIVE_INFINITY : 0 : minutes / remainingCapacityMinutes;
  const severity = ratio <= BACKLOG_THRESHOLDS.normal ? "normal" : ratio <= BACKLOG_THRESHOLDS.attention ? "attention" : ratio <= BACKLOG_THRESHOLDS.risk ? "risk" : "critical";
  return { openTaskCount: open.length, openCoreCount: open.filter((t) => t.importance === "core").length, openImportantCount: open.filter((t) => t.importance === "important").length, openOptionalCount: open.filter((t) => t.importance === "optional").length, estimatedRemainingMinutes: minutes, remainingCapacityMinutes, capacityRatio: ratio, severity, shouldReplan: severity === "risk" || severity === "critical" };
}
function calculatePlanDeviation(input) {
  const expectedMinutes = input.plannedMinutes * Math.max(0, Math.min(1, input.elapsedWeekRatio));
  const delay = Math.max(0, Math.round(expectedMinutes - input.actualMinutes));
  const minuteRatio = expectedMinutes ? delay / expectedMinutes : 0;
  const expectedTasks = input.plannedTaskCount * Math.max(0, Math.min(1, input.elapsedWeekRatio));
  const taskRatio = expectedTasks ? Math.max(0, expectedTasks - input.completedTaskCount) / expectedTasks : 0;
  const ratio = (minuteRatio + taskRatio) / 2;
  return { deviationRatio: ratio, estimatedDelayMinutes: delay, severity: ratio <= DEVIATION_THRESHOLDS.normal ? "normal" : ratio <= DEVIATION_THRESHOLDS.attention ? "attention" : "risk" };
}

// packages/domain/src/adaptive/replan.ts
var urgencyRank = { critical_overdue: 0, overdue: 1, due: 2, upcoming: 3 };
var masteryRank = { critical: 0, weak: 1, fragile: 2, sufficient: 3, strong: 4 };
function taskRank(task) {
  if (task.status === "in_progress") return 0;
  if (task.status === "partially_completed") return 1;
  if (task.plannedDate && task.importance === "core") return 2;
  if (task.topicState === "remediation" || task.masteryLevel === "critical" || task.masteryLevel === "weak") return 3;
  if (task.importance === "core") return 4;
  if (task.importance === "important") return 5;
  return 6;
}
function calculatePriorityV1(input) {
  return Math.max(0, Math.min(100, Math.round(Object.values(input).reduce((a, b) => a + b, 0))));
}
function replanWeeklyPlanV1(context) {
  const availableMinutes = Object.values(context.dailyCapacities).reduce((a, b) => a + Math.max(0, b), 0);
  const planBudget = Math.min(context.planningBudgetMinutes, Math.floor(availableMinutes * 0.85));
  const revisionBudget = calculateWeeklyRevisionBudget(planBudget);
  const activeTasks = context.tasks.filter((t) => !["completed", "cancelled", "missed"].includes(t.status)).sort((a, b) => taskRank(a) - taskRank(b) || b.priorityScore - a.priorityScore || a.id.localeCompare(b.id));
  const selectedRevisions = [...context.revisions].sort((a, b) => urgencyRank[a.urgency] - urgencyRank[b.urgency] || masteryRank[a.masteryLevel] - masteryRank[b.masteryLevel] || a.id.localeCompare(b.id));
  let revisionMinutes = 0;
  const creates = [];
  for (const revision of selectedRevisions) {
    if (revisionMinutes + revision.estimatedMinutes > revisionBudget) continue;
    revisionMinutes += revision.estimatedMinutes;
    creates.push({ revisionScheduleId: revision.id, subjectId: revision.subjectId, curriculumNodeId: revision.curriculumNodeId, title: revision.title, plannedDate: revision.scheduledFor < context.currentDate ? context.currentDate : revision.scheduledFor, estimatedMinutes: revision.estimatedMinutes, importance: revision.masteryLevel === "critical" || revision.masteryLevel === "weak" ? "core" : "important", priorityScore: calculatePriorityV1({ scheduleUrgency: revision.urgency.includes("overdue") ? 25 : 18, weakness: 25 - masteryRank[revision.masteryLevel] * 5, revisionUrgency: 20 - urgencyRank[revision.urgency] * 5, planDeviation: 0, postponement: 0, dependency: 0 }), dedupeKey: `revision|${revision.id}` });
  }
  let used = revisionMinutes;
  const keep = [];
  const cancel = [];
  for (const task of activeTasks) {
    const remaining = Math.max(0, task.estimatedMinutes - task.completedMinutes);
    if (task.status === "in_progress" || task.status === "partially_completed" || used + remaining <= planBudget) {
      keep.push(task.id);
      used += remaining;
    } else if (task.importance === "optional") cancel.push(task.id);
    else keep.push(task.id);
  }
  const moves = [];
  const dayRemaining = { ...context.dailyCapacities };
  for (const task of activeTasks.filter((t) => keep.includes(t.id) && !["in_progress", "partially_completed"].includes(t.status))) {
    const remaining = Math.max(0, task.estimatedMinutes - task.completedMinutes);
    const current = task.plannedDate;
    const dates = Object.keys(dayRemaining).sort();
    const chosen = dates.find((d) => d >= context.currentDate && (dayRemaining[d] ?? 0) >= remaining);
    if (chosen) {
      dayRemaining[chosen] = (dayRemaining[chosen] ?? 0) - remaining;
      if (current !== chosen) moves.push({ taskId: task.id, fromDate: current, toDate: chosen, reason: "replanning" });
    }
  }
  const changed = moves.length + cancel.length + creates.length;
  const revisionType = changed <= REPLAN_LEVEL_1_CHANGE_LIMIT ? "automatic_minor" : changed <= REPLAN_LEVEL_2_CHANGE_LIMIT ? "automatic_informed" : "strategic_proposal";
  const reasonCode = context.trigger.toUpperCase();
  const explanation = context.trigger === "capacity_change" ? `Kapasiten de\u011Fi\u015Fti\u011Fi i\xE7in ${changed} plan \xF6\u011Fesi yeniden d\xFCzenlendi.` : context.trigger === "revision_due" ? `${creates.length} \xF6ncelikli tekrar haftal\u0131k plana eklendi.` : `Plan\u0131ndaki ${changed} \xF6\u011Fe g\xFCncel ilerlemene g\xF6re d\xFCzenlendi.`;
  return { tasksToKeep: keep, tasksToMove: moves, tasksToCancel: cancel, tasksToCreate: creates, availableMinutes, afterPlannedMinutes: used, revisionMinutes, revisionBudgetMinutes: revisionBudget, changedTaskCount: changed, revisionType, reasonCode, explanation, dedupeKey: [context.planId, context.trigger, availableMinutes, keep.join(","), moves.map((m) => `${m.taskId}:${m.toDate}`).join(","), creates.map((c) => c.revisionScheduleId).join(",")].join("|") };
}

// packages/domain/src/adaptive/minimum.ts
function rank(c) {
  if (c.kind === "revision" && c.revisionUrgency === "critical_overdue") return 0;
  if (c.status === "partially_completed" && c.importance === "core") return 1;
  if (c.kind === "task" && c.importance === "core" && c.status !== "completed") return 2;
  if (c.topicState === "remediation" || c.masteryLevel === "critical" || c.masteryLevel === "weak") return 3;
  if (c.kind === "revision" && (c.revisionUrgency === "due" || c.revisionUrgency === "overdue")) return 4;
  if (c.importance === "core") return 5;
  return 6;
}
function buildMinimumDayPlan(input) {
  if (input.availableMinutes < 0) throw new Error("INVALID_AVAILABLE_MINUTES");
  let used = 0;
  const selected = [];
  for (const c of [...input.candidates].filter((c2) => c2.minutes > 0 && c2.status !== "completed").sort((a, b) => rank(a) - rank(b) || a.minutes - b.minutes || a.id.localeCompare(b.id))) {
    if (used + c.minutes <= input.availableMinutes) {
      selected.push(c);
      used += c.minutes;
    }
  }
  return { tasks: selected, totalMinutes: used, reason: selected.length ? "MINIMUM_MEANINGFUL_WORKLOAD" : "NO_MEANINGFUL_TASK_FITS" };
}

// packages/domain/src/adaptive/projection.ts
function buildSyllabusProjection(input) {
  const top = input.topics.filter((t) => t.nodeType === "topic" && t.parentId === null);
  const completed = top.filter((t) => t.state === "learned" || t.state === "maintenance").length;
  const inProgress = top.filter((t) => ["learning", "practicing", "remediation"].includes(t.state)).length;
  const remaining = top.length - completed - inProgress;
  if (input.observedWeeks < MIN_PROJECTION_WEEKS || input.recentLearnedTopics <= 0) return { completed, inProgress, remaining, total: top.length, status: "UNKNOWN", projectedCompletionDate: null, weeksRemaining: null, deviationDays: null, message: "\u0130lk tur tahmini i\xE7in hen\xFCz yeterli \xE7al\u0131\u015Fma verisi yok." };
  const rate = input.recentLearnedTopics / input.observedWeeks;
  const weeks = Math.ceil((remaining + inProgress) / rate);
  const projected = addCalendarDays(input.asOfDate, weeks * 7);
  if (!input.examDate) return { completed, inProgress, remaining, total: top.length, status: "UNKNOWN", projectedCompletionDate: projected, weeksRemaining: weeks, deviationDays: null, message: "S\u0131nav tarihi olmad\u0131\u011F\u0131 i\xE7in yeti\u015Fme durumu hesaplanamad\u0131." };
  const target = addCalendarDays(input.examDate, -FIRST_PASS_BUFFER_DAYS);
  const diff = Math.round(((/* @__PURE__ */ new Date(`${projected}T12:00:00Z`)).getTime() - (/* @__PURE__ */ new Date(`${target}T12:00:00Z`)).getTime()) / 864e5);
  const status = projected <= target ? "ON_TRACK" : projected <= input.examDate ? "ATTENTION" : "RISK";
  return { completed, inProgress, remaining, total: top.length, status, projectedCompletionDate: projected, weeksRemaining: weeks, deviationDays: diff, message: status === "ON_TRACK" ? "\u0130lk tur hedefi plan dahilinde." : status === "ATTENTION" ? "\u0130lk tur hedefi s\u0131nav tamponuna yakla\u015Ft\u0131." : "\u0130lk tur tahmini s\u0131nav tarihini a\u015F\u0131yor." };
}
export {
  BACKLOG_THRESHOLDS,
  CRITICAL_OVERDUE_AFTER_DAYS,
  DEFAULT_LEARN_TOPIC_MINUTES,
  DEFAULT_RESOURCE_UNIT_MINUTES,
  DEFAULT_TIMEZONE,
  DEFAULT_WEEKLY_REVISION_BUDGET_RATIO,
  DEFAULT_WEEKLY_UTILIZATION,
  DEVIATION_THRESHOLDS,
  DomainValidationError,
  FIRST_PASS_BUFFER_DAYS,
  MASTERY_LEVEL_ORDER,
  MASTERY_RECENT_RESULT_LIMIT,
  MASTERY_THRESHOLDS,
  MAX_MASTERY_LEVEL_STEP,
  MAX_RESOURCE_UNITS_PER_TASK,
  MIN_PROJECTION_WEEKS,
  MIN_QUESTIONS_FOR_MASTERY,
  PLANNING_GENERATION_VERSION,
  PRIORITY,
  PRIORITY_V1,
  PlanningDomainError,
  REPLAN_LEVEL_1_CHANGE_LIMIT,
  REPLAN_LEVEL_2_CHANGE_LIMIT,
  RESOURCE_ROLE_ORDER,
  REVISION_ESTIMATED_MINUTES,
  REVISION_INTERVAL_DAYS,
  REVISION_TYPE_BY_MASTERY,
  addCalendarDays,
  addRevisionCalendarDays,
  buildMinimumDayPlan,
  buildRevisionDecision,
  buildSyllabusProjection,
  buildWeeklyPlanV0,
  calculateDayAvailableMinutes,
  calculateEffectiveDayCapacity,
  calculateEffectiveWeekCapacity,
  calculatePlanDeviation,
  calculatePriorityV1,
  calculateWeeklyAvailableMinutes,
  calculateWeeklyRevisionBudget,
  completeRevisionStatus,
  deriveTaskStatus,
  evaluateBacklog,
  evaluateTopicMastery,
  getNextBestTask,
  getRevisionUrgency,
  getZonedDayRange,
  getZonedWeekRange,
  isInstantInRange,
  isoWeekday,
  remainingTaskMinutes,
  replanWeeklyPlanV1,
  transitionTopicForLearnTask,
  zonedMidnightToUtc
};
