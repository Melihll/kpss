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
function bestMappedResource(context, topic, completedUnitIds) {
  return context.resourceSections.filter((section) => section.curriculumNodeId === topic.id && section.planningRole === "curriculum" && section.isActive).map((section) => ({
    section,
    resource: context.resources.find((resource) => resource.id === section.resourceId),
    units: context.resourceUnits.filter((unit) => unit.sectionId === section.id && unit.isActive && !completedUnitIds.has(unit.id)).sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id))
  })).filter((item) => Boolean(item.resource && item.resource.status === "active" && item.units.length)).sort((left, right) => roleRank(left.resource.role) - roleRank(right.resource.role) || left.section.sortOrder - right.section.sortOrder || left.resource.id.localeCompare(right.resource.id)).map(({ section, resource, units }) => ({ resource, sectionId: section.id, units }))[0] ?? null;
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
    const mapped = bestMappedResource(context, node, completedUnitIds);
    if (mapped) {
      const units = mapped.units.slice(0, MAX_RESOURCE_UNITS_PER_TASK);
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
  const timeRemaining = Math.max(0, task.estimatedMinutes - task.completedMinutes);
  if (task.pendingUnitMinutes == null) return timeRemaining;
  return Math.max(0, Math.min(timeRemaining, task.pendingUnitMinutes));
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
    return right.priorityScore - left.priorityScore || (left.executionOrder != null && right.executionOrder != null ? left.executionOrder - right.executionOrder : 0) || remainingTaskMinutes(left) - remainingTaskMinutes(right) || 0;
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

// packages/domain/src/planning/daily.ts
var OPEN_STATUSES = /* @__PURE__ */ new Set(["planned", "ready", "in_progress", "partially_completed", "rescheduled"]);
function buildDailyPlanProjection(input) {
  const capacityMinutes = Math.max(0, Math.floor(input.capacityMinutes));
  const completedStudyMinutes = Math.max(0, Math.floor(input.completedStudyMinutes));
  const remainingCapacityMinutes = Math.max(0, capacityMinutes - completedStudyMinutes);
  const todayTasks = input.tasks.filter((task) => task.plannedDate === input.date);
  const completedTaskIds = todayTasks.filter((task) => task.status === "completed").map((task) => task.id);
  const openTasks = todayTasks.filter((task) => OPEN_STATUSES.has(task.status) && task.remainingMinutes > 0);
  const openItems = [];
  const deferredTaskIds = [];
  let capacityLeft = remainingCapacityMinutes;
  let deferredMinutes = 0;
  for (const task of openTasks) {
    const remainingMinutes = Math.max(0, Math.floor(task.remainingMinutes));
    const scheduledMinutes = Math.min(remainingMinutes, capacityLeft);
    if (scheduledMinutes > 0) {
      openItems.push({ taskId: task.id, remainingMinutes, scheduledMinutes });
      capacityLeft -= scheduledMinutes;
    } else {
      deferredTaskIds.push(task.id);
    }
    deferredMinutes += remainingMinutes - scheduledMinutes;
  }
  const scheduledOpenMinutes = openItems.reduce((sum, item) => sum + item.scheduledMinutes, 0);
  return {
    date: input.date,
    capacityMinutes,
    completedStudyMinutes,
    remainingCapacityMinutes,
    scheduledOpenMinutes,
    totalCommittedMinutes: completedStudyMinutes + scheduledOpenMinutes,
    openItems,
    completedTaskIds,
    deferredTaskIds,
    deferredMinutes
  };
}
function findDailyCapacityOverloads(blocks, dayCapacities) {
  const plannedByDate = /* @__PURE__ */ new Map();
  for (const block of blocks) {
    plannedByDate.set(block.plannedDate, (plannedByDate.get(block.plannedDate) ?? 0) + Math.max(0, block.estimatedMinutes));
  }
  return [...plannedByDate.entries()].map(([date, plannedMinutes]) => ({ date, plannedMinutes, capacityMinutes: Math.max(0, dayCapacities[date] ?? 0) })).filter((day) => day.plannedMinutes > day.capacityMinutes).sort((left, right) => left.date.localeCompare(right.date));
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
function calculateWeeklyRevisionBudget(planningBudgetMinutes, ratio2 = DEFAULT_WEEKLY_REVISION_BUDGET_RATIO) {
  if (!Number.isFinite(planningBudgetMinutes) || planningBudgetMinutes < 0 || ratio2 < 0 || ratio2 > 1) {
    throw new Error("INVALID_REVISION_BUDGET");
  }
  return Math.floor(planningBudgetMinutes * ratio2);
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
  const ratio2 = remainingCapacityMinutes <= 0 ? minutes ? Number.POSITIVE_INFINITY : 0 : minutes / remainingCapacityMinutes;
  const severity = ratio2 <= BACKLOG_THRESHOLDS.normal ? "normal" : ratio2 <= BACKLOG_THRESHOLDS.attention ? "attention" : ratio2 <= BACKLOG_THRESHOLDS.risk ? "risk" : "critical";
  return { openTaskCount: open.length, openCoreCount: open.filter((t) => t.importance === "core").length, openImportantCount: open.filter((t) => t.importance === "important").length, openOptionalCount: open.filter((t) => t.importance === "optional").length, estimatedRemainingMinutes: minutes, remainingCapacityMinutes, capacityRatio: ratio2, severity, shouldReplan: severity === "risk" || severity === "critical" };
}
function calculatePlanDeviation(input) {
  const expectedMinutes = input.plannedMinutes * Math.max(0, Math.min(1, input.elapsedWeekRatio));
  const delay = Math.max(0, Math.round(expectedMinutes - input.actualMinutes));
  const minuteRatio = expectedMinutes ? delay / expectedMinutes : 0;
  const expectedTasks = input.plannedTaskCount * Math.max(0, Math.min(1, input.elapsedWeekRatio));
  const taskRatio = expectedTasks ? Math.max(0, expectedTasks - input.completedTaskCount) / expectedTasks : 0;
  const ratio2 = (minuteRatio + taskRatio) / 2;
  return { deviationRatio: ratio2, estimatedDelayMinutes: delay, severity: ratio2 <= DEVIATION_THRESHOLDS.normal ? "normal" : ratio2 <= DEVIATION_THRESHOLDS.attention ? "attention" : "risk" };
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
var remainingTaskMinutes2 = (task) => Math.max(0, task.estimatedMinutes - task.completedMinutes);
function minimumRepairTasks(tasks, overloadMinutes) {
  if (overloadMinutes <= 0) return /* @__PURE__ */ new Set();
  const candidates = [...tasks].sort((left, right) => remainingTaskMinutes2(right) - remainingTaskMinutes2(left) || taskRank(right) - taskRank(left) || left.priorityScore - right.priorityScore || left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
  const selected = /* @__PURE__ */ new Set();
  let repairedMinutes = 0;
  for (const task of candidates) {
    selected.add(task.id);
    repairedMinutes += remainingTaskMinutes2(task);
    if (repairedMinutes >= overloadMinutes) break;
  }
  return selected;
}
function calendarDistance(left, right) {
  return Math.abs(Date.parse(`${left}T12:00:00Z`) - Date.parse(`${right}T12:00:00Z`)) / 864e5;
}
function calculatePriorityV1(input) {
  return Math.max(0, Math.min(100, Math.round(Object.values(input).reduce((sum, value) => sum + value, 0))));
}
function replanWeeklyPlanV1(context) {
  const availableMinutes = Object.values(context.dailyCapacities).reduce((sum, minutes) => sum + Math.max(0, minutes), 0);
  const planBudget = Math.min(context.planningBudgetMinutes, availableMinutes);
  const revisionBudget = calculateWeeklyRevisionBudget(planBudget);
  const dayRemaining = Object.fromEntries(Object.entries(context.dailyCapacities).map(([date, minutes]) => [
    date,
    date < context.currentDate ? 0 : minutes - (context.actualMinutesByDate?.[date] ?? 0)
  ]));
  const dates = Object.keys(dayRemaining).sort();
  const activeTasks = context.tasks.filter((task) => !["completed", "cancelled", "missed"].includes(task.status)).sort((left, right) => taskRank(left) - taskRank(right) || right.priorityScore - left.priorityScore || left.id.localeCompare(right.id));
  const currentDeviation = (context.actualMinutesByDate?.[context.currentDate] ?? 0) - (context.plannedConsumedMinutesByDate?.[context.currentDate] ?? 0);
  const allowPullForward = currentDeviation <= 0;
  const keep = [];
  const moves = [];
  const tasksToBacklog = [];
  const cancel = [];
  let used = 0;
  for (const task of activeTasks.filter((item) => ["in_progress", "partially_completed"].includes(item.status))) {
    keep.push(task.id);
    const remaining = remainingTaskMinutes2(task);
    used += remaining;
    if (task.plannedDate && task.plannedDate >= context.currentDate && task.plannedDate in dayRemaining) {
      dayRemaining[task.plannedDate] = dayRemaining[task.plannedDate] - remaining;
    }
  }
  const selectedRevisions = context.trigger === "study_deviation" ? [] : [...context.revisions].sort((left, right) => urgencyRank[left.urgency] - urgencyRank[right.urgency] || masteryRank[left.masteryLevel] - masteryRank[right.masteryLevel] || left.id.localeCompare(right.id));
  let revisionMinutes = 0;
  const creates = [];
  const placementTasks = activeTasks.filter((task) => !["in_progress", "partially_completed"].includes(task.status));
  let pendingPlacementTasks = placementTasks;
  if (context.trigger === "capacity_change") {
    const pending = [];
    for (const task of [...placementTasks].sort((left, right) => (left.plannedDate ?? context.weekEnd).localeCompare(right.plannedDate ?? context.weekEnd) || taskRank(left) - taskRank(right) || right.priorityScore - left.priorityScore || left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))) {
      const remaining = remainingTaskMinutes2(task);
      if (remaining === 0) {
        keep.push(task.id);
        continue;
      }
      const current = task.plannedDate;
      if (current && current >= context.currentDate && current in dayRemaining && used + remaining <= planBudget && (dayRemaining[current] ?? 0) >= remaining) {
        keep.push(task.id);
        used += remaining;
        dayRemaining[current] = (dayRemaining[current] ?? 0) - remaining;
      } else {
        pending.push(task);
      }
    }
    pendingPlacementTasks = pending;
  } else if (context.trigger === "study_deviation") {
    const pending = [];
    const tasksByDate = /* @__PURE__ */ new Map();
    for (const task of placementTasks) {
      const remaining = remainingTaskMinutes2(task);
      if (remaining === 0) {
        keep.push(task.id);
        continue;
      }
      const current = task.plannedDate;
      if (current && current >= context.currentDate && current in dayRemaining) {
        const scheduled = tasksByDate.get(current) ?? [];
        scheduled.push(task);
        tasksByDate.set(current, scheduled);
      } else if (current !== null) {
        pending.push(task);
      }
    }
    const scheduledTasks = [...tasksByDate.values()].flat().concat(pending);
    const scheduledMinutes = scheduledTasks.reduce((sum, task) => sum + remainingTaskMinutes2(task), 0);
    const budgetBacklog = minimumRepairTasks(scheduledTasks, used + scheduledMinutes - planBudget);
    tasksToBacklog.push(...budgetBacklog);
    for (const date of dates) {
      const scheduled = (tasksByDate.get(date) ?? []).filter((task) => !budgetBacklog.has(task.id));
      const scheduledMinutes2 = scheduled.reduce((sum, task) => sum + remainingTaskMinutes2(task), 0);
      const displaced = minimumRepairTasks(scheduled, scheduledMinutes2 - Math.max(0, dayRemaining[date] ?? 0));
      for (const task of scheduled) {
        if (displaced.has(task.id)) {
          pending.push(task);
          continue;
        }
        const remaining = remainingTaskMinutes2(task);
        keep.push(task.id);
        used += remaining;
        dayRemaining[date] = (dayRemaining[date] ?? 0) - remaining;
      }
    }
    pendingPlacementTasks = pending.filter((task) => !budgetBacklog.has(task.id));
  }
  for (const revision of selectedRevisions) {
    if (revisionMinutes + revision.estimatedMinutes > revisionBudget || used + revision.estimatedMinutes > planBudget) continue;
    const earliest = revision.scheduledFor < context.currentDate ? context.currentDate : revision.scheduledFor;
    const chosen = dates.find((date) => date >= earliest && (dayRemaining[date] ?? 0) >= revision.estimatedMinutes);
    if (!chosen) continue;
    dayRemaining[chosen] = (dayRemaining[chosen] ?? 0) - revision.estimatedMinutes;
    revisionMinutes += revision.estimatedMinutes;
    used += revision.estimatedMinutes;
    creates.push({
      revisionScheduleId: revision.id,
      subjectId: revision.subjectId,
      curriculumNodeId: revision.curriculumNodeId,
      title: revision.title,
      plannedDate: chosen,
      estimatedMinutes: revision.estimatedMinutes,
      importance: revision.masteryLevel === "critical" || revision.masteryLevel === "weak" ? "core" : "important",
      priorityScore: calculatePriorityV1({
        scheduleUrgency: revision.urgency.includes("overdue") ? 25 : 18,
        weakness: 25 - masteryRank[revision.masteryLevel] * 5,
        revisionUrgency: 20 - urgencyRank[revision.urgency] * 5,
        planDeviation: 0,
        postponement: 0,
        dependency: 0
      }),
      dedupeKey: `revision|${revision.id}`
    });
  }
  if (!allowPullForward) {
    pendingPlacementTasks.sort((left, right) => (left.plannedDate ?? context.currentDate).localeCompare(right.plannedDate ?? context.currentDate) || taskRank(left) - taskRank(right) || right.priorityScore - left.priorityScore || left.id.localeCompare(right.id));
  }
  for (const task of pendingPlacementTasks) {
    const remaining = remainingTaskMinutes2(task);
    if (remaining === 0) {
      keep.push(task.id);
      continue;
    }
    const current = task.plannedDate;
    let chosen;
    if (used + remaining <= planBudget) {
      if (context.trigger === "study_deviation") {
        const origin = current && current >= context.currentDate ? current : context.currentDate;
        chosen = dates.filter((date) => date >= context.currentDate && date !== current && !(current && current > context.currentDate && date === context.currentDate) && (dayRemaining[date] ?? 0) >= remaining).sort((left, right) => calendarDistance(left, origin) - calendarDistance(right, origin) || left.localeCompare(right))[0];
      } else {
        const earliest = allowPullForward ? context.currentDate : current && current > context.currentDate ? current : context.currentDate;
        chosen = dates.find((date) => date >= earliest && (dayRemaining[date] ?? 0) >= remaining);
      }
    }
    if (!chosen) {
      if (current !== null) tasksToBacklog.push(task.id);
      continue;
    }
    keep.push(task.id);
    used += remaining;
    dayRemaining[chosen] = (dayRemaining[chosen] ?? 0) - remaining;
    if (current !== chosen) moves.push({ taskId: task.id, fromDate: current, toDate: chosen, reason: "replanning" });
  }
  const changed = moves.length + tasksToBacklog.length + cancel.length + creates.length;
  const revisionType = context.trigger === "capacity_change" || context.trigger === "study_deviation" ? "automatic_informed" : changed <= REPLAN_LEVEL_1_CHANGE_LIMIT ? "automatic_minor" : changed <= REPLAN_LEVEL_2_CHANGE_LIMIT ? "automatic_informed" : "strategic_proposal";
  const reasonCode = context.trigger.toUpperCase();
  const explanation = context.trigger === "capacity_change" ? `Kapasiten de\u011Fi\u015Fti\u011Fi i\xE7in ${changed} plan \xF6\u011Fesi yeniden d\xFCzenlendi.` : context.trigger === "study_deviation" ? changed ? `Ger\xE7ek \xE7al\u0131\u015Fma s\xFCrene g\xF6re haftan\u0131n kalan\u0131nda ${changed} g\xF6rev yeniden yerle\u015Ftirildi.` : "Ger\xE7ek \xE7al\u0131\u015Fma s\xFCren plana uygun; g\xF6revlerin yerini de\u011Fi\u015Ftirmeye gerek kalmad\u0131." : context.trigger === "revision_due" ? `${creates.length} \xF6ncelikli tekrar haftal\u0131k plana eklendi.` : `Plan\u0131ndaki ${changed} \xF6\u011Fe g\xFCncel ilerlemene g\xF6re d\xFCzenlendi.`;
  return {
    tasksToKeep: keep,
    tasksToMove: moves,
    tasksToBacklog,
    tasksToCancel: cancel,
    tasksToCreate: creates,
    availableMinutes,
    afterPlannedMinutes: used,
    revisionMinutes,
    revisionBudgetMinutes: revisionBudget,
    changedTaskCount: changed,
    revisionType,
    reasonCode,
    explanation,
    dedupeKey: [
      context.planId,
      context.trigger,
      availableMinutes,
      keep.join(","),
      moves.map((move) => `${move.taskId}:${move.toDate}`).join(","),
      tasksToBacklog.join(","),
      creates.map((create) => create.revisionScheduleId).join(",")
    ].join("|")
  };
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

// packages/domain/src/pilot/report.ts
var ratio = (actual, planned) => planned > 0 ? actual / planned : 1;
var percent = (value) => Math.round(Math.max(0, value) * 100);
function interpretWeeklyReport(input) {
  const completionRatio = ratio(input.completedTaskCount, input.plannedTaskCount);
  const plannedVsActualRatio = ratio(input.actualMinutes, input.plannedMinutes);
  const backlogRisk = input.backlogSeverity === "risk" || input.backlogSeverity === "critical";
  const projectionRisk = input.projectionStatus.toUpperCase() === "RISK";
  const riskSignals = Number(completionRatio < 0.65) + Number(plannedVsActualRatio < 0.65) + Number(backlogRisk) + Number(projectionRisk);
  let status = "attention";
  if (riskSignals >= 2) status = "risk";
  else if (completionRatio >= 0.8 && plannedVsActualRatio >= 0.8 && !backlogRisk && !projectionRisk) status = "good";
  const parts = [
    `Bu hafta planlanan s\xFCrenin %${percent(plannedVsActualRatio)}'i ve g\xF6revlerin %${percent(completionRatio)}'i tamamland\u0131.`
  ];
  if (backlogRisk) parts.push("Backlog y\xFCkseldi\u011Fi i\xE7in gelecek hafta a\xE7\u0131k g\xF6revler \xF6nceliklendirilmeli.");
  else if (projectionRisk) parts.push("M\xFCfredat projeksiyonu risk g\xF6sterdi\u011Fi i\xE7in haftal\u0131k kapasite yeniden g\xF6zden ge\xE7irilmeli.");
  else if (status === "good") parts.push("Plan ve ger\xE7ek \xE7al\u0131\u015Fma dengesi pilot hedefiyle uyumlu.");
  else parts.push("Plan\u0131 yakalamak i\xE7in gelecek hafta g\xFCnl\xFCk ger\xE7ekle\u015Fen s\xFCre takip edilmeli.");
  return { status, completionRatio, plannedVsActualRatio, explanation: parts.join(" ") };
}

// packages/domain/src/p48/roadmap.ts
var DAY_MS = 864e5;
function parseDate3(date) {
  return /* @__PURE__ */ new Date(`${date}T12:00:00Z`);
}
function dateString(date) {
  return date.toISOString().slice(0, 10);
}
function addP48Days(date, days) {
  const value = parseDate3(date);
  value.setUTCDate(value.getUTCDate() + days);
  return dateString(value);
}
function p48MondayOf(date) {
  const value = parseDate3(date);
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() - day + 1);
  return dateString(value);
}
function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}
function monthEnd(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 12));
}
function periodMultiplierForDate(date, periods) {
  const matches = periods.filter((period) => period.startDate <= date && period.endDate >= date);
  if (!matches.length) return 1;
  return matches.reduce((value, period) => Math.min(value, period.capacityMultiplier ?? 1), 1);
}
function p48PhaseForDate(date) {
  if (date <= "2027-01-03") return { name: "Temel + ilk tur", focus: "Konu anlat\u0131m\u0131, not ve soru bankas\u0131n\u0131 d\xFCzenli bi\xE7imde ilerlet." };
  if (date <= "2027-04-04") return { name: "Ana kaynak + soru yo\u011Funla\u015Ft\u0131rma", focus: "Ana kaynaklar\u0131 s\xFCrd\xFCr; soru \xE7\xF6z\xFCm\xFCn\xFC ve yanl\u0131\u015F d\xF6n\xFC\u015Flerini art\u0131r." };
  if (date <= "2027-06-06") return { name: "Kaynak kapan\u0131\u015F\u0131", focus: "\u0130lk kaynak havuzunu kapatmaya \xE7al\u0131\u015F; biten derslerde bran\u015F denemesi ekle." };
  if (date <= "2027-08-08") return { name: "Yeni kaynak + bran\u015F denemeleri", focus: "Biten kaynaklar\u0131n yerine yeni soru/deneme kaynaklar\u0131 koy ve s\xFCreli \xE7\xF6z\xFCm\xFC art\u0131r." };
  return { name: "Final tekrar", focus: "Yeni a\u011F\u0131r kaynak a\xE7ma; deneme, yanl\u0131\u015F defteri ve k\u0131sa tekrarlarla s\u0131nava gir." };
}
function usableWeekRatio(weekStart, asOfDate, targetExamDate, periods) {
  let ratio2 = 0;
  for (let day = 0; day < 7; day += 1) {
    const date = addP48Days(weekStart, day);
    if (date < asOfDate || date > targetExamDate) continue;
    ratio2 += periodMultiplierForDate(date, periods) / 7;
  }
  return ratio2;
}
function forecastP48Resources(input) {
  const subjects = [];
  for (const subject of input.subjects) {
    const queue = input.resources.filter((resource) => resource.subjectId === subject.subjectId).sort((a, b) => a.sequenceOrder - b.sequenceOrder).map((resource) => {
      const hasMaterialRemaining = Number.isFinite(resource.materialRemainingMinutes) && Number(resource.materialRemainingMinutes) >= 0;
      const materialRemainingMinutes = hasMaterialRemaining ? Math.max(0, Math.round(Number(resource.materialRemainingMinutes))) : null;
      const remainingMinutes = materialRemainingMinutes ?? Math.max(0, resource.plannedMinutes - resource.actualMinutes);
      const completed = resource.resourceStatus === "completed" || (materialRemainingMinutes !== null ? materialRemainingMinutes === 0 : resource.actualMinutes >= resource.plannedMinutes);
      return {
        ...resource,
        remainingMinutes,
        progressPercent: resource.plannedMinutes > 0 ? Math.min(100, Math.round(resource.actualMinutes / resource.plannedMinutes * 100)) : 0,
        forecastStartDate: null,
        forecastFinishDate: null,
        completed
      };
    });
    let currentIndex = queue.findIndex((resource) => !resource.completed);
    if (currentIndex < 0) currentIndex = queue.length;
    let week = p48MondayOf(input.asOfDate);
    let lastFinish = null;
    let guard = 0;
    while (currentIndex < queue.length && week <= input.targetExamDate && guard < 90) {
      const ratio2 = usableWeekRatio(week, input.asOfDate, input.targetExamDate, input.periods);
      let budget = Math.round(subject.weeklyMinutes * ratio2);
      if (budget <= 0) {
        week = addP48Days(week, 7);
        guard += 1;
        continue;
      }
      while (budget > 0 && currentIndex < queue.length) {
        const resource = queue[currentIndex];
        if (!resource.forecastStartDate) resource.forecastStartDate = week < input.asOfDate ? input.asOfDate : week;
        const use = Math.min(budget, resource.remainingMinutes);
        resource.remainingMinutes -= use;
        budget -= use;
        if (resource.remainingMinutes <= 0) {
          resource.forecastFinishDate = addP48Days(week, 6);
          lastFinish = resource.forecastFinishDate;
          currentIndex += 1;
        }
      }
      week = addP48Days(week, 7);
      guard += 1;
    }
    for (const resource of queue) {
      if (resource.completed) {
        resource.forecastStartDate = resource.forecastStartDate ?? input.asOfDate;
        resource.forecastFinishDate = resource.forecastFinishDate ?? input.asOfDate;
        resource.remainingMinutes = 0;
        resource.progressPercent = 100;
      }
    }
    const totalPlannedMinutes = queue.reduce((sum, resource) => sum + resource.plannedMinutes, 0);
    const totalActualMinutes = queue.reduce((sum, resource) => sum + Math.min(resource.actualMinutes, resource.plannedMinutes), 0);
    const newSourceDate = currentIndex >= queue.length && lastFinish && lastFinish < input.targetExamDate ? addP48Days(lastFinish, 1) : null;
    subjects.push({
      subjectId: subject.subjectId,
      subjectName: subject.subjectName,
      weeklyMinutes: subject.weeklyMinutes,
      resources: queue,
      newSourceDate,
      totalPlannedMinutes,
      totalActualMinutes
    });
  }
  return subjects;
}
function buildP48Months(input) {
  const result = [];
  const cursor = parseDate3(input.asOfDate);
  cursor.setUTCDate(1);
  const end = parseDate3(input.targetExamDate);
  end.setUTCDate(1);
  while (cursor <= end) {
    const startMonth = new Date(cursor);
    const endMonth = monthEnd(startMonth);
    const rangeStart = startMonth < parseDate3(input.asOfDate) ? parseDate3(input.asOfDate) : startMonth;
    const rangeEnd = endMonth > parseDate3(input.targetExamDate) ? parseDate3(input.targetExamDate) : endMonth;
    const totalMonthDays = endMonth.getUTCDate();
    let activeFactor = 0;
    let blockedDays = 0;
    for (let d = new Date(rangeStart); d <= rangeEnd; d = new Date(d.getTime() + DAY_MS)) {
      const multiplier = periodMultiplierForDate(dateString(d), input.periods);
      activeFactor += multiplier;
      if (multiplier === 0) blockedDays += 1;
    }
    const plannedMinutes = Math.max(0, Math.round(input.monthlyTargetMinutes * (activeFactor / totalMonthDays) / 30) * 30);
    const phase = p48PhaseForDate(dateString(rangeStart));
    result.push({
      month: monthKey(startMonth),
      label: new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric", timeZone: "UTC" }).format(startMonth),
      plannedMinutes,
      blockedDays,
      phase: phase.name,
      focus: phase.focus
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return result;
}
function roundToThirty(minutes) {
  return Math.max(0, Math.round(minutes / 30) * 30);
}
function buildP48WeekBlocks(input) {
  const dates = Array.from({ length: 7 }, (_, index) => addP48Days(input.weekStart, index));
  const activeDates = dates.filter((date) => date >= input.currentDate && (input.dayCapacities[date] ?? 0) > 0);
  const totalCapacity = activeDates.reduce((sum, date) => sum + (input.dayCapacities[date] ?? 0), 0);
  if (totalCapacity <= 0) return [];
  const scale = Math.min(1, totalCapacity / input.weeklyTargetMinutes);
  const subjectRemaining = /* @__PURE__ */ new Map();
  for (const subject of input.subjects) subjectRemaining.set(subject.subjectId, roundToThirty(subject.weeklyMinutes * scale));
  let targetTotal = [...subjectRemaining.values()].reduce((sum, minutes) => sum + minutes, 0);
  const capacityTarget = roundToThirty(totalCapacity);
  while (targetTotal > capacityTarget) {
    const candidate = [...subjectRemaining.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!candidate || candidate[1] < 30) break;
    subjectRemaining.set(candidate[0], candidate[1] - 30);
    targetTotal -= 30;
  }
  while (targetTotal + 30 <= capacityTarget) {
    const subject = input.subjects.slice().sort((a, b) => b.weeklyMinutes - (subjectRemaining.get(b.subjectId) ?? 0) - (a.weeklyMinutes - (subjectRemaining.get(a.subjectId) ?? 0)))[0];
    if (!subject) break;
    subjectRemaining.set(subject.subjectId, (subjectRemaining.get(subject.subjectId) ?? 0) + 30);
    targetTotal += 30;
  }
  const queues = /* @__PURE__ */ new Map();
  for (const subject of input.subjects) {
    queues.set(subject.subjectId, input.resources.filter((resource) => resource.subjectId === subject.subjectId && resource.remainingMinutes > 0).sort((a, b) => a.sequenceOrder - b.sequenceOrder).map((resource) => ({ ...resource })));
  }
  const result = [];
  let previousSubject = null;
  for (const date of activeDates) {
    let dayRemaining = roundToThirty(input.dayCapacities[date] ?? 0);
    let guard = 0;
    while (dayRemaining >= 30 && guard < 30) {
      const candidates = input.subjects.filter((subject2) => (subjectRemaining.get(subject2.subjectId) ?? 0) >= 30).sort((a, b) => (subjectRemaining.get(b.subjectId) ?? 0) - (subjectRemaining.get(a.subjectId) ?? 0));
      if (!candidates.length) break;
      const subject = candidates.find((candidate) => candidate.subjectId !== previousSubject) ?? candidates[0];
      const weeklyRemaining = subjectRemaining.get(subject.subjectId) ?? 0;
      const queue = queues.get(subject.subjectId) ?? [];
      while (queue.length && queue[0].remainingMinutes <= 0) queue.shift();
      const resource = queue[0] ?? null;
      const chunk = Math.min(60, dayRemaining, weeklyRemaining, resource ? Math.max(30, roundToThirty(resource.remainingMinutes)) : 60);
      const minutes = Math.max(30, roundToThirty(chunk));
      const bounded = Math.min(minutes, dayRemaining, weeklyRemaining);
      if (bounded < 30) break;
      result.push({
        plannedDate: date,
        subjectId: subject.subjectId,
        subjectName: subject.subjectName,
        workMode: resource?.workMode ?? "other",
        resourceId: resource?.resourceId ?? null,
        resourceName: resource?.resourceName ?? null,
        estimatedMinutes: bounded,
        detail: resource ? resource.resourceName : `Yeni kaynak zaman\u0131 \xB7 ${subject.subjectName}`,
        isNewResourceWindow: !resource
      });
      subjectRemaining.set(subject.subjectId, weeklyRemaining - bounded);
      dayRemaining -= bounded;
      if (resource) resource.remainingMinutes -= bounded;
      previousSubject = subject.subjectId;
      guard += 1;
    }
  }
  return result;
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
  addP48Days,
  addRevisionCalendarDays,
  buildDailyPlanProjection,
  buildMinimumDayPlan,
  buildP48Months,
  buildP48WeekBlocks,
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
  findDailyCapacityOverloads,
  forecastP48Resources,
  getNextBestTask,
  getRevisionUrgency,
  getZonedDayRange,
  getZonedWeekRange,
  interpretWeeklyReport,
  isInstantInRange,
  isoWeekday,
  p48MondayOf,
  p48PhaseForDate,
  remainingTaskMinutes,
  replanWeeklyPlanV1,
  transitionTopicForLearnTask,
  zonedMidnightToUtc
};
