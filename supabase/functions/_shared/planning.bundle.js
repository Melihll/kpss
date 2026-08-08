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
  const overdue = Boolean(task.plannedDate && task.plannedDate < today);
  const dueToday = task.plannedDate === today;
  if (overdue && task.importance === "core") return 3;
  if (dueToday && task.importance === "core") return 4;
  if (overdue && task.importance === "important") return 5;
  if (dueToday && task.importance === "important") return 6;
  if (task.importance !== "optional") return 7;
  return 8;
}
function reasonFor(task, today, fits) {
  if (task.status === "in_progress") return "continue_in_progress";
  if (task.status === "partially_completed") return "continue_partial";
  if (task.plannedDate && task.plannedDate < today && task.importance === "core") return "overdue_core";
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
export {
  DEFAULT_LEARN_TOPIC_MINUTES,
  DEFAULT_RESOURCE_UNIT_MINUTES,
  DEFAULT_TIMEZONE,
  DEFAULT_WEEKLY_UTILIZATION,
  MAX_RESOURCE_UNITS_PER_TASK,
  PLANNING_GENERATION_VERSION,
  PRIORITY,
  PlanningDomainError,
  RESOURCE_ROLE_ORDER,
  buildWeeklyPlanV0,
  deriveTaskStatus,
  getNextBestTask,
  getZonedDayRange,
  getZonedWeekRange,
  isInstantInRange,
  remainingTaskMinutes,
  transitionTopicForLearnTask,
  zonedMidnightToUtc
};
