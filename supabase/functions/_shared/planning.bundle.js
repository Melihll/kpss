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
  const result2 = [];
  const maxLength = Math.max(0, ...groups.map((group) => group.length));
  for (let index = 0; index < maxLength; index += 1) {
    for (const group of groups) {
      if (group[index]) result2.push(group[index]);
    }
  }
  return result2;
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
  const plannedCreditMinutes = Math.max(0, Math.floor(input.plannedCreditMinutes ?? input.completedStudyMinutes));
  const completedStudyMinutes = plannedCreditMinutes;
  const actualStudyMinutes = Math.max(0, Math.floor(input.actualStudyMinutes ?? input.completedStudyMinutes));
  const extraStudyMinutes = Math.max(0, Math.floor(input.extraStudyMinutes ?? 0));
  const unknownStudyMinutes = Math.max(0, Math.floor(input.unknownStudyMinutes ?? 0));
  const totalActualMinutes = actualStudyMinutes;
  const remainingCapacityMinutes = Math.max(0, capacityMinutes - plannedCreditMinutes);
  const todayTasks = input.tasks.filter((task) => task.plannedDate === input.date);
  const completedTaskIds = todayTasks.filter((task) => task.status === "completed").map((task) => task.id);
  const openTasks = todayTasks.filter((task) => OPEN_STATUSES.has(task.status) && task.remainingMinutes > 0);
  const openItems = [];
  const deferredTaskIds = [];
  let capacityLeft = remainingCapacityMinutes;
  let deferredMinutes = 0;
  for (const task of openTasks) {
    const remainingMinutes = Math.max(0, Math.floor(task.remainingMinutes));
    const mustFitWholeBlock = Boolean(task.blockClass) || task.isRemainder === true;
    const scheduledMinutes = mustFitWholeBlock ? remainingMinutes <= capacityLeft ? remainingMinutes : 0 : Math.min(remainingMinutes, capacityLeft);
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
    plannedCreditMinutes,
    actualStudyMinutes,
    extraStudyMinutes,
    unknownStudyMinutes,
    totalActualMinutes,
    nominalActualOverageMinutes: Math.max(0, totalActualMinutes - capacityMinutes),
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

// packages/domain/src/planning/learning-stage.ts
var LEARNING_STAGE_POLICY_VERSION = "pln-004-v1";
function resolveState(input) {
  if (input.remediationRequired) return "remediation_required";
  if (input.unknown) return "unknown";
  if (input.acceptedPriorEvidence) return "satisfied";
  if (input.requiredUnits > 0 && input.completedRequiredUnits >= input.requiredUnits) {
    return "satisfied";
  }
  if (input.completedRequiredUnits > 0) return "in_progress";
  return "not_started";
}
function evaluateLearningStage(evidence) {
  const states = {
    learn: resolveState(evidence.learn),
    practice: resolveState(evidence.practice),
    review: resolveState(evidence.review),
    reinforcement: resolveState(evidence.reinforcement)
  };
  const learnSatisfied = states.learn === "satisfied";
  const practiceSatisfied = states.practice === "satisfied";
  const practiceBlockedBy = learnSatisfied ? [] : ["learn"];
  const advancedBlockedBy = [];
  if (!learnSatisfied) advancedBlockedBy.push("learn");
  if (!practiceSatisfied) advancedBlockedBy.push("practice");
  const nonAdvancingReviewAllowed = evidence.allowNonAdvancingReview === true && learnSatisfied && !practiceSatisfied;
  const reviewAllowed = nonAdvancingReviewAllowed || advancedBlockedBy.length === 0;
  const reviewBlockedBy = nonAdvancingReviewAllowed ? [] : [...advancedBlockedBy];
  const reviewReason = nonAdvancingReviewAllowed ? "explicit_non_advancing_review" : advancedBlockedBy.length === 0 ? "learning_path_prerequisites_satisfied" : "learning_path_prerequisites_unsatisfied";
  return {
    policyVersion: LEARNING_STAGE_POLICY_VERSION,
    stages: {
      learn: {
        state: states.learn,
        allowed: true,
        blockedBy: [],
        reason: states.learn === "remediation_required" ? "learn_remediation_required" : "learn_available"
      },
      practice: {
        state: states.practice,
        allowed: practiceBlockedBy.length === 0,
        blockedBy: practiceBlockedBy,
        reason: practiceBlockedBy.length === 0 ? "learn_prerequisite_satisfied" : "learn_prerequisite_unsatisfied"
      },
      review: {
        state: states.review,
        allowed: reviewAllowed,
        blockedBy: reviewBlockedBy,
        reason: reviewReason
      },
      reinforcement: {
        state: states.reinforcement,
        allowed: advancedBlockedBy.length === 0,
        blockedBy: [...advancedBlockedBy],
        reason: advancedBlockedBy.length === 0 ? "learning_path_prerequisites_satisfied" : "learning_path_prerequisites_unsatisfied"
      }
    }
  };
}

// packages/domain/src/planning/learning-stage-evidence.ts
function isAuthoritativeProvenance(provenance) {
  return provenance !== "ai_recommendation";
}
function summarizeMaterialStageEvidence(request) {
  const relevantUnits = request.units.filter(
    (unit) => unit.targetId === request.targetId && unit.stage === request.stage && unit.required
  );
  let completedRequiredUnits = 0;
  let unknown = false;
  let remediationRequired = false;
  for (const unit of relevantUnits) {
    const mappingAccepted = unit.topicMapping === "validated";
    const provenanceAccepted = isAuthoritativeProvenance(unit.provenance);
    if (!mappingAccepted || !provenanceAccepted) {
      unknown = true;
    }
    if (unit.progress === "completed" && mappingAccepted && provenanceAccepted) {
      completedRequiredUnits += 1;
    }
    if (unit.forgotten === true && unit.progress === "completed" && mappingAccepted && provenanceAccepted) {
      remediationRequired = true;
    }
  }
  return {
    requiredUnits: relevantUnits.length,
    completedRequiredUnits,
    unknown,
    remediationRequired
  };
}

// packages/domain/src/planning/material-unit-view.ts
function normalizePhysicalUnitType(input) {
  if (input.pageStart != null && input.pageEnd != null) {
    return input.sourceUnitType === "test" ? "test" : "page_range";
  }
  if (input.sourceUnitType === "test") return "test";
  if (input.sourceUnitType === "chapter") return "chapter";
  if (input.sourceUnitType === "reading") return "reading";
  if (input.sourceUnitType === "mock") return "mock";
  if (input.sourceUnitType === "video") return "video";
  return "other";
}
function resolveYoutubeProgress(input) {
  if (input.completedAt) return "completed";
  if (input.durationSeconds > 0 && input.watchedSeconds >= input.durationSeconds) {
    return "completed";
  }
  if (input.watchedSeconds > 0) return "in_progress";
  return "not_started";
}
function hasAuthoritativeMappingProvenance(provenance) {
  return provenance !== "ai_candidate";
}
function isPlannerEligible(input) {
  if (input.sourceKind === "physical" && input.plannerEligibleOverride === false) {
    return false;
  }
  const hasExactProgress = input.sourceKind !== "youtube" || input.segmentStartSeconds == null && input.segmentEndSeconds == null;
  return input.isActive && input.mappingStatus === "validated" && input.curriculumNodeId !== null && hasAuthoritativeMappingProvenance(input.mappingProvenance) && hasExactProgress;
}
function normalizeMaterialUnit(input) {
  if (input.sourceKind === "youtube") {
    const mappingSuffix = input.mappingId ? `:mapping:${input.mappingId}` : "";
    return {
      id: `youtube:${input.id}${mappingSuffix}`,
      sourceId: input.id,
      sourceKind: "youtube",
      resourceId: input.resourceId,
      curriculumNodeId: input.curriculumNodeId,
      unitType: "video",
      title: input.title,
      sortOrder: input.sortOrder,
      pageStart: null,
      pageEnd: null,
      durationSeconds: input.durationSeconds,
      watchedSeconds: input.watchedSeconds,
      lastPositionSeconds: input.lastPositionSeconds ?? 0,
      mappingId: input.mappingId ?? null,
      segmentStartSeconds: input.segmentStartSeconds ?? null,
      segmentEndSeconds: input.segmentEndSeconds ?? null,
      estimatedMinutes: null,
      progressState: resolveYoutubeProgress(input),
      completedThroughPage: null,
      completedAt: input.completedAt,
      mappingStatus: input.mappingStatus,
      mappingProvenance: input.mappingProvenance,
      isActive: input.isActive,
      plannerEligible: isPlannerEligible(input)
    };
  }
  return {
    id: `physical:${input.id}`,
    sourceId: input.id,
    sourceKind: "physical",
    resourceId: input.resourceId,
    curriculumNodeId: input.curriculumNodeId,
    unitType: normalizePhysicalUnitType(input),
    title: input.title,
    sortOrder: input.sortOrder,
    pageStart: input.pageStart ?? null,
    pageEnd: input.pageEnd ?? null,
    durationSeconds: null,
    watchedSeconds: null,
    lastPositionSeconds: null,
    mappingId: null,
    segmentStartSeconds: null,
    segmentEndSeconds: null,
    estimatedMinutes: input.estimatedMinutes ?? null,
    progressState: input.progressState,
    completedThroughPage: input.completedThroughPage ?? null,
    completedAt: input.completedAt ?? null,
    mappingStatus: input.mappingStatus,
    mappingProvenance: input.mappingProvenance,
    isActive: input.isActive,
    plannerEligible: isPlannerEligible(input)
  };
}

// packages/domain/src/planning/material-remaining-scope.ts
function isEffectivelyCompleted(unit) {
  if (unit.progressState === "completed") return true;
  if (unit.unitType === "page_range" && unit.pageEnd != null && unit.completedThroughPage != null && unit.completedThroughPage >= unit.pageEnd) {
    return true;
  }
  return false;
}
function remainingSeconds(unit) {
  if (unit.sourceKind !== "youtube") return null;
  if (unit.durationSeconds == null) return null;
  return Math.max(
    0,
    unit.durationSeconds - (unit.watchedSeconds ?? 0)
  );
}
function remainingPageStart(unit) {
  if (unit.unitType !== "page_range") return null;
  if (unit.pageStart == null || unit.pageEnd == null) return null;
  if (unit.completedThroughPage == null) return unit.pageStart;
  return Math.min(
    unit.pageEnd,
    Math.max(unit.pageStart, unit.completedThroughPage + 1)
  );
}
function calculateRemainingMaterialScope(request) {
  return request.units.filter((unit) => unit.resourceId === request.resourceId).filter((unit) => unit.curriculumNodeId === request.curriculumNodeId).filter((unit) => unit.isActive).filter((unit) => unit.plannerEligible).filter((unit) => unit.progressState !== "skipped").filter((unit) => !isEffectivelyCompleted(unit)).sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.id.localeCompare(b.id);
  }).map((unit) => ({
    ...unit,
    remainingSeconds: remainingSeconds(unit),
    remainingPageStart: remainingPageStart(unit),
    remainingPageEnd: unit.unitType === "page_range" ? unit.pageEnd : null
  }));
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
  for (const result2 of recent) {
    if (![result2.correct, result2.wrong, result2.blank, result2.total].every(Number.isInteger) || result2.correct < 0 || result2.wrong < 0 || result2.blank < 0 || result2.total <= 0 || result2.correct + result2.wrong + result2.blank !== result2.total) {
      throw new Error("INVALID_MASTERY_TEST_RESULT");
    }
  }
  const sampleQuestionCount = recent.reduce((sum, result2) => sum + result2.total, 0);
  const sampleCorrectCount = recent.reduce((sum, result2) => sum + result2.correct, 0);
  const sampleWrongCount = recent.reduce((sum, result2) => sum + result2.wrong, 0);
  const sampleBlankCount = recent.reduce((sum, result2) => sum + result2.blank, 0);
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
    date < context.currentDate ? 0 : minutes - (context.plannedConsumedMinutesByDate?.[date] ?? 0)
  ]));
  const dates = Object.keys(dayRemaining).sort();
  const activeTasks = context.tasks.filter((task) => !["completed", "cancelled", "missed"].includes(task.status)).sort((left, right) => taskRank(left) - taskRank(right) || right.priorityScore - left.priorityScore || left.id.localeCompare(right.id));
  const currentDeviation = 0;
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
      if (current === context.currentDate) {
        keep.push(task.id);
        used += remaining;
        if (current in dayRemaining) dayRemaining[current] = (dayRemaining[current] ?? 0) - remaining;
        continue;
      }
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
    const budgetBacklog = minimumRepairTasks(
      scheduledTasks.filter((task) => task.plannedDate !== context.currentDate),
      used + scheduledMinutes - planBudget
    );
    tasksToBacklog.push(...budgetBacklog);
    for (const date of dates) {
      const scheduled = (tasksByDate.get(date) ?? []).filter((task) => !budgetBacklog.has(task.id));
      if (date === context.currentDate) {
        for (const task of scheduled) {
          const remaining = remainingTaskMinutes2(task);
          keep.push(task.id);
          used += remaining;
          dayRemaining[date] = (dayRemaining[date] ?? 0) - remaining;
        }
        continue;
      }
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

// packages/domain/src/planning/duration-policy.ts
var STUDY_BLOCK_DURATION_POLICY_VERSION = "pln-003-v1";
var STUDY_BLOCK_DURATION_POLICIES = {
  new_learning: { minMinutes: 60, preferredMinutes: 75, maxMinutes: 90 },
  guided_practice: { minMinutes: 45, preferredMinutes: 60, maxMinutes: 75 },
  primary_practice: { minMinutes: 40, preferredMinutes: 50, maxMinutes: 60 },
  reinforcement: { minMinutes: 40, preferredMinutes: 50, maxMinutes: 60 },
  error_review: { minMinutes: 20, preferredMinutes: 30, maxMinutes: 40 },
  spaced_review: { minMinutes: 15, preferredMinutes: 25, maxMinutes: 30 }
};
var AI_CONFIDENCE_THRESHOLD = 0.6;
function positiveMinutes(value) {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return Math.max(1, Math.round(value));
}
function roundToFive(minutes) {
  return Math.max(5, Math.round(minutes / 5) * 5);
}
function resolveStudyBlockDuration(input) {
  const policy = STUDY_BLOCK_DURATION_POLICIES[input.blockClass];
  const base = {
    blockClass: input.blockClass,
    policyVersion: STUDY_BLOCK_DURATION_POLICY_VERSION,
    minMinutes: policy.minMinutes,
    preferredMinutes: policy.preferredMinutes,
    maxMinutes: policy.maxMinutes
  };
  const userOverride = positiveMinutes(input.userOverrideMinutes);
  if (userOverride != null) {
    return {
      ...base,
      minutes: userOverride,
      source: "user_override",
      policyDeviation: userOverride < policy.minMinutes || userOverride > policy.maxMinutes
    };
  }
  const remainder = positiveMinutes(input.remainderMinutes);
  if (remainder != null) {
    return { ...base, minutes: remainder, source: "remainder", policyDeviation: false };
  }
  const aiMinutes = positiveMinutes(input.aiRecommendedMinutes);
  const aiConfidence = input.aiConfidence;
  const aiAllowed = aiMinutes != null && (aiConfidence == null || Number.isFinite(aiConfidence) && aiConfidence >= AI_CONFIDENCE_THRESHOLD);
  if (aiAllowed) {
    const normalized = Math.min(
      policy.maxMinutes,
      Math.max(policy.minMinutes, roundToFive(aiMinutes))
    );
    return { ...base, minutes: normalized, source: "ai_normalized", policyDeviation: false };
  }
  return {
    ...base,
    minutes: policy.preferredMinutes,
    source: "deterministic_default",
    policyDeviation: false
  };
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
  const result2 = [];
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
    result2.push({
      month: monthKey(startMonth),
      label: new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric", timeZone: "UTC" }).format(startMonth),
      plannedMinutes,
      blockedDays,
      phase: phase.name,
      focus: phase.focus
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return result2;
}
function roundToThirty(minutes) {
  return Math.max(0, Math.round(minutes / 30) * 30);
}
function floorToThirty(minutes) {
  return Math.max(0, Math.floor(minutes / 30) * 30);
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
  const capacityTarget = floorToThirty(totalCapacity);
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
  const result2 = [];
  let previousSubject = null;
  for (const date of activeDates) {
    let dayRemaining = Math.max(0, input.dayCapacities[date] ?? 0);
    let guard = 0;
    while (dayRemaining >= 30 && guard < 30) {
      const candidates = input.subjects.filter((subject2) => (subjectRemaining.get(subject2.subjectId) ?? 0) >= 30).sort((a, b) => (subjectRemaining.get(b.subjectId) ?? 0) - (subjectRemaining.get(a.subjectId) ?? 0));
      if (!candidates.length) break;
      const schedulableCandidates = candidates.filter((candidate) => {
        const candidateWeeklyRemaining = subjectRemaining.get(candidate.subjectId) ?? 0;
        const candidateQueue = queues.get(candidate.subjectId) ?? [];
        while (candidateQueue.length && candidateQueue[0].remainingMinutes <= 0) candidateQueue.shift();
        const candidateResource = candidateQueue[0] ?? null;
        if (!candidateResource?.blockClass) return true;
        const candidatePolicy = resolveStudyBlockDuration({
          blockClass: candidateResource.blockClass
        });
        const candidateLimit = Math.min(
          dayRemaining,
          candidateWeeklyRemaining,
          candidateResource.remainingMinutes
        );
        return candidateLimit >= candidatePolicy.minMinutes;
      });
      if (!schedulableCandidates.length) break;
      const subject = schedulableCandidates.find((candidate) => candidate.subjectId !== previousSubject) ?? schedulableCandidates[0];
      const weeklyRemaining = subjectRemaining.get(subject.subjectId) ?? 0;
      const queue = queues.get(subject.subjectId) ?? [];
      while (queue.length && queue[0].remainingMinutes <= 0) queue.shift();
      const resource = queue[0] ?? null;
      const policyDecision = resource?.blockClass ? resolveStudyBlockDuration({ blockClass: resource.blockClass }) : null;
      const policyLimit = Math.min(
        dayRemaining,
        weeklyRemaining,
        resource?.remainingMinutes ?? Number.POSITIVE_INFINITY
      );
      const policyMinutes = policyDecision ? policyLimit >= policyDecision.minMinutes ? Math.min(policyDecision.minutes, policyLimit) : 0 : null;
      const chunk = policyDecision ? policyMinutes : Math.min(60, dayRemaining, weeklyRemaining, resource ? Math.max(30, roundToThirty(resource.remainingMinutes)) : 60);
      const minutes = policyDecision ? chunk : Math.max(30, roundToThirty(chunk));
      const bounded = Math.min(minutes, dayRemaining, weeklyRemaining);
      if (bounded < 30) break;
      result2.push({
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
  return result2;
}

// packages/domain/src/planning/material-db-adapter.ts
function normalizeProgressStatus(status) {
  if (status === "in_progress") return "in_progress";
  if (status === "completed") return "completed";
  if (status === "skipped") return "skipped";
  return "not_started";
}
function normalizePhysicalUnitType2(unitType) {
  if (unitType === "test") return "test";
  if (unitType === "video") return "video";
  if (unitType === "chapter") return "chapter";
  if (unitType === "reading") return "reading";
  if (unitType === "mock") return "mock";
  return "other";
}
function normalizePhysicalSectionSourceUnitType(sourceUnitType) {
  if (sourceUnitType === "soru_bankas\u0131_blo\u011Fu") return "test";
  if (sourceUnitType === "test") return "test";
  if (sourceUnitType === "konu") return "chapter";
  if (sourceUnitType === "video") return "video";
  if (sourceUnitType === "reading") return "reading";
  if (sourceUnitType === "mock") return "mock";
  return "other";
}
function adaptPhysicalMaterialRow(request) {
  const sectionMatchesResource = request.section !== null && request.section.resource_id === request.unit.resource_id;
  const curriculumNodeId = sectionMatchesResource ? request.section?.curriculum_node_id ?? null : null;
  const mappingStatus = curriculumNodeId !== null ? "validated" : "missing";
  const sectionActive = request.section?.is_active ?? true;
  return normalizeMaterialUnit({
    sourceKind: "physical",
    id: request.unit.id,
    resourceId: request.unit.resource_id,
    curriculumNodeId,
    sourceUnitType: normalizePhysicalUnitType2(request.unit.unit_type),
    title: request.unit.name,
    sortOrder: request.unit.sort_order,
    pageStart: request.unit.page_start,
    pageEnd: request.unit.page_end,
    estimatedMinutes: request.unit.estimated_minutes,
    progressState: normalizeProgressStatus(request.progress?.status),
    completedThroughPage: request.progress?.completed_through_page ?? null,
    completedAt: request.progress?.completed_at ?? null,
    mappingStatus,
    mappingProvenance: request.mappingProvenance,
    isActive: request.unit.is_active && sectionActive
  });
}
function adaptPhysicalStructuralSpan(request) {
  const mappingStatus = request.span.curriculumNodeId !== null ? "validated" : "missing";
  return normalizeMaterialUnit({
    sourceKind: "physical",
    id: request.span.spanId,
    resourceId: request.span.resourceId,
    curriculumNodeId: request.span.curriculumNodeId,
    sourceUnitType: normalizePhysicalSectionSourceUnitType(
      request.section.source_unit_type
    ),
    title: `${request.section.name} \xB7 s.${request.span.pageStart}\u2013${request.span.pageEnd}`,
    sortOrder: request.span.pageStart,
    pageStart: request.span.pageStart,
    pageEnd: request.span.pageEnd,
    estimatedMinutes: null,
    progressState: "not_started",
    completedThroughPage: null,
    completedAt: null,
    mappingStatus,
    mappingProvenance: "reviewed_catalog",
    isActive: request.section.is_active,
    plannerEligibleOverride: false
  });
}
function adaptYoutubeMaterialRow(request) {
  const mappingStatus = request.mapping?.mapping_status ?? "missing";
  const mappingProvenance = request.mapping?.mapping_provenance ?? "ai_candidate";
  return normalizeMaterialUnit({
    sourceKind: "youtube",
    id: request.video.id,
    resourceId: request.resourceId,
    curriculumNodeId: request.mapping?.curriculum_node_id ?? null,
    title: request.video.title,
    sortOrder: request.video.position,
    durationSeconds: request.video.duration_seconds,
    watchedSeconds: request.progress?.watched_seconds ?? 0,
    lastPositionSeconds: request.progress?.last_position_seconds ?? 0,
    completedAt: request.progress?.completed_at ?? null,
    mappingId: request.mapping?.id ?? null,
    segmentStartSeconds: request.mapping?.segment_start_seconds ?? null,
    segmentEndSeconds: request.mapping?.segment_end_seconds ?? null,
    mappingStatus,
    mappingProvenance,
    isActive: request.video.is_active && (request.mapping?.is_active ?? true)
  });
}
function adaptYoutubeMaterialRows(request) {
  const activeMappings = request.mappings.filter(
    (mapping) => mapping.is_active
  );
  if (!activeMappings.length) {
    return [adaptYoutubeMaterialRow({
      video: request.video,
      progress: request.progress,
      resourceId: request.resourceId,
      mapping: null
    })];
  }
  const fullVideoMappings = activeMappings.filter(
    (mapping) => mapping.segment_start_seconds == null && mapping.segment_end_seconds == null
  );
  const fullVideoConflict = fullVideoMappings.length > 1;
  return activeMappings.map((mapping) => {
    const isFullVideo = mapping.segment_start_seconds == null && mapping.segment_end_seconds == null;
    const effectiveMapping = fullVideoConflict && isFullVideo ? { ...mapping, mapping_status: "ambiguous" } : mapping;
    return adaptYoutubeMaterialRow({
      video: request.video,
      progress: request.progress,
      resourceId: request.resourceId,
      mapping: effectiveMapping
    });
  });
}

// packages/domain/src/planning/physical-structural-coverage.ts
function mergeRanges(ranges) {
  const ordered = [...ranges].sort(
    (left, right) => left.start - right.start || left.end - right.end
  );
  const merged2 = [];
  for (const range of ordered) {
    const last = merged2[merged2.length - 1];
    if (!last || range.start > last.end + 1) {
      merged2.push({ ...range });
      continue;
    }
    last.end = Math.max(last.end, range.end);
  }
  return merged2;
}
function derivePhysicalStructuralCoverage(sections, units) {
  const spans = [];
  const anomalies = [];
  const unitsBySection = /* @__PURE__ */ new Map();
  for (const unit of units) {
    if (!unit.isActive || !unit.sectionId) continue;
    const current = unitsBySection.get(unit.sectionId) ?? [];
    current.push(unit);
    unitsBySection.set(unit.sectionId, current);
  }
  for (const section of sections) {
    if (!section.isActive) continue;
    if (section.pageStart == null || section.pageEnd == null) {
      anomalies.push({
        kind: "section_missing_range",
        sectionId: section.sectionId,
        unitId: null
      });
      continue;
    }
    if (section.pageEnd < section.pageStart) {
      anomalies.push({
        kind: "section_invalid_range",
        sectionId: section.sectionId,
        unitId: null
      });
      continue;
    }
    const coveredRanges = [];
    for (const unit of unitsBySection.get(section.sectionId) ?? []) {
      if (unit.pageStart == null || unit.pageEnd == null) {
        anomalies.push({
          kind: "unit_invalid_range",
          sectionId: section.sectionId,
          unitId: unit.unitId
        });
        continue;
      }
      if (unit.pageEnd < unit.pageStart) {
        anomalies.push({
          kind: "unit_invalid_range",
          sectionId: section.sectionId,
          unitId: unit.unitId
        });
        continue;
      }
      if (unit.pageEnd < section.pageStart || unit.pageStart > section.pageEnd) {
        anomalies.push({
          kind: "unit_outside_section",
          sectionId: section.sectionId,
          unitId: unit.unitId
        });
        continue;
      }
      if (unit.pageStart < section.pageStart || unit.pageEnd > section.pageEnd) {
        anomalies.push({
          kind: "unit_outside_section",
          sectionId: section.sectionId,
          unitId: unit.unitId
        });
      }
      coveredRanges.push({
        start: Math.max(unit.pageStart, section.pageStart),
        end: Math.min(unit.pageEnd, section.pageEnd)
      });
    }
    const merged2 = mergeRanges(coveredRanges);
    let cursor = section.pageStart;
    const pushGap = (start, end) => {
      if (end < start) return;
      spans.push({
        spanId: `physical:section:${section.sectionId}:gap:${start}-${end}`,
        sectionId: section.sectionId,
        resourceId: section.resourceId,
        curriculumNodeId: section.curriculumNodeId,
        pageStart: start,
        pageEnd: end,
        pageCount: end - start + 1,
        source: "section_gap",
        plannerEligible: false,
        blockedReason: section.curriculumNodeId ? "duration_unresolved" : "topic_unmapped"
      });
    };
    for (const range of merged2) {
      if (cursor < range.start) {
        pushGap(cursor, range.start - 1);
      }
      cursor = Math.max(cursor, range.end + 1);
    }
    if (cursor <= section.pageEnd) {
      pushGap(cursor, section.pageEnd);
    }
  }
  return { spans, anomalies };
}

// packages/domain/src/planning/canonical-workload.ts
function hasQuality(evidence, quality) {
  return evidence.evidenceQuality.includes(quality);
}
function calibrationEvidenceExclusionReason(evidence, request) {
  if (evidence.sourceKind !== "physical_pace_evidence") return "non_w2_source";
  if (evidence.evidenceStatus !== "accepted") return "status_not_accepted";
  if (evidence.userId !== request.userId) return "cross_user";
  if (evidence.examProfileId !== request.examProfileId) return "cross_profile";
  if (evidence.materialType !== request.materialType) return "incompatible_material_type";
  if (evidence.progressUnit !== "page") return "invalid_progress_unit";
  if (!evidence.causalActivityId) return "missing_causal_activity";
  if (evidence.progressAmount === null || !Number.isFinite(evidence.progressAmount) || Number(evidence.progressAmount) <= 0) return "zero_progress";
  const start = evidence.startPageBoundary;
  const end = evidence.endPageBoundary;
  if (!Number.isInteger(start) || !Number.isInteger(end) || Number(start) < 0 || Number(end) <= Number(start) || Number(evidence.progressAmount) !== Number(end) - Number(start)) return "malformed_boundaries";
  if (evidence.actualMinutes === null || !Number.isFinite(evidence.actualMinutes) || Number(evidence.actualMinutes) <= 0 || !hasQuality(evidence, "actual_elapsed_time")) return "invalid_active_time";
  if (!hasQuality(evidence, "actual_progress_delta") || hasQuality(evidence, "unreliable")) return "unreliable_evidence";
  return null;
}
function confidenceFor(samples) {
  const rates = samples.map(
    (sample) => Number(sample.actualMinutes) / Number(sample.progressAmount)
  );
  const mean = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
  const variance = rates.reduce(
    (sum, rate) => sum + (rate - mean) ** 2,
    0
  ) / rates.length;
  const coefficientOfVariation = mean === 0 ? Number.POSITIVE_INFINITY : Math.sqrt(variance) / mean;
  const totalMinutes = samples.reduce(
    (sum, sample) => sum + Number(sample.actualMinutes),
    0
  );
  if (samples.length >= 5 && totalMinutes >= 120 && coefficientOfVariation <= 0.35) {
    return { confidence: "high", coefficientOfVariation };
  }
  if (samples.length >= 3 && totalMinutes >= 60 && coefficientOfVariation <= 0.75) {
    return { confidence: "medium", coefficientOfVariation };
  }
  return { confidence: "low", coefficientOfVariation };
}
function buildPace(samples, scope) {
  const ordered = [...samples].sort((left, right) => left.id.localeCompare(right.id));
  const totalObservedMinutes = ordered.reduce(
    (sum, sample) => sum + Number(sample.actualMinutes),
    0
  );
  const totalObservedProgress = ordered.reduce(
    (sum, sample) => sum + Number(sample.progressAmount),
    0
  );
  const { confidence, coefficientOfVariation } = confidenceFor(ordered);
  const sessionPaces = ordered.map((sample) => Number(sample.actualMinutes) / Number(sample.progressAmount)).sort((left, right) => left - right);
  const middle = Math.floor(sessionPaces.length / 2);
  const medianPace = sessionPaces.length % 2 === 0 ? (sessionPaces[middle - 1] + sessionPaces[middle]) / 2 : sessionPaces[middle];
  return Object.freeze({
    pace: medianPace,
    unit: "minutes_per_page",
    sampleCount: ordered.length,
    totalObservedMinutes,
    totalObservedProgress,
    coefficientOfVariation,
    confidence,
    provenance: Object.freeze(ordered.map((sample) => sample.provenance)),
    scope,
    aggregationPolicy: "median_session_minutes_per_page",
    evidenceIds: Object.freeze(ordered.map((sample) => sample.id))
  });
}
function compatiblePaceEvidence(request) {
  return request.evidence.filter(
    (sample) => calibrationEvidenceExclusionReason(sample, request) === null
  );
}
function estimatePhysicalPaceAtScope(request, scope) {
  const compatible = compatiblePaceEvidence(request);
  const samples = scope === "resource_material_type" ? compatible.filter((sample) => sample.resourceId === request.resourceId) : scope === "subject_material_type" ? compatible.filter(
    (sample) => request.subjectId !== null && sample.subjectId === request.subjectId
  ) : compatible;
  return samples.length ? buildPace(samples, scope) : null;
}
function estimatePhysicalPace(request) {
  const compatible = compatiblePaceEvidence(request);
  const resource = compatible.filter(
    (sample) => sample.resourceId === request.resourceId
  );
  if (resource.length) return buildPace(resource, "resource_material_type");
  const subject = compatible.filter(
    (sample) => request.subjectId !== null && sample.subjectId === request.subjectId
  );
  if (subject.length) return buildPace(subject, "subject_material_type");
  if (compatible.length) return buildPace(compatible, "material_type");
  return null;
}
function evaluateCalibrationReadiness(request) {
  const estimate = estimatePhysicalPace(request);
  if (!estimate) {
    return Object.freeze({
      scope: "none",
      hierarchyReason: "no_compatible_accepted_w2_evidence",
      compatibleSampleCount: 0,
      totalObservedMinutes: 0,
      totalProgressAmount: 0,
      pace: null,
      paceUnit: "minutes_per_page",
      confidence: "none",
      authority: "unknown",
      usableForShadow: false,
      usableForPlanner: false,
      blockedReason: "accepted_w2_evidence_unavailable",
      evidenceIds: Object.freeze([]),
      provenance: Object.freeze([]),
      aggregationPolicy: "none"
    });
  }
  const usableForPlanner = estimate.confidence === "medium" || estimate.confidence === "high";
  const hierarchyReason = estimate.scope === "resource_material_type" ? "exact_resource_compatible_evidence_won" : estimate.scope === "subject_material_type" ? "subject_type_evidence_won_after_exact_resource_absent" : "material_type_evidence_won_after_narrower_scopes_absent";
  return Object.freeze({
    scope: estimate.scope,
    hierarchyReason,
    compatibleSampleCount: estimate.sampleCount,
    totalObservedMinutes: estimate.totalObservedMinutes,
    totalProgressAmount: estimate.totalObservedProgress,
    pace: estimate.pace,
    paceUnit: estimate.unit,
    confidence: estimate.confidence,
    authority: "calibrated",
    usableForShadow: true,
    usableForPlanner,
    blockedReason: usableForPlanner ? null : "confidence_insufficient",
    evidenceIds: estimate.evidenceIds,
    provenance: estimate.provenance,
    aggregationPolicy: estimate.aggregationPolicy
  });
}
function authoritativeProvenance(provenance) {
  return provenance !== "ai_candidate";
}
function mappingBlockReason(material) {
  if (!material.isActive) return "material_inactive";
  if (material.mappingStatus === "ambiguous") return "mapping_ambiguous";
  if (material.mappingStatus !== "validated" || material.curriculumNodeId === null) {
    return "mapping_missing";
  }
  if (!authoritativeProvenance(material.mappingProvenance)) {
    return "mapping_provenance_untrusted";
  }
  return null;
}
function evidenceSummary(scope, sampleCount = 0, totalObservedMinutes = 0, provenance = []) {
  return Object.freeze({
    scope,
    sampleCount,
    totalObservedMinutes,
    provenance: Object.freeze([...provenance])
  });
}
function result(request, values) {
  return Object.freeze({
    materialViewId: request.material.id,
    sourceKind: request.material.sourceKind,
    resourceId: request.material.resourceId,
    subjectId: request.subjectId,
    materialType: request.material.unitType,
    ...values
  });
}
function estimateYoutube(request) {
  const material = request.material;
  const mappingReason = mappingBlockReason(material);
  if (mappingReason) {
    return result(request, {
      remainingAmount: null,
      remainingUnit: "video_second",
      estimatedMinutes: null,
      authority: "unknown",
      confidence: "none",
      plannerEligible: false,
      reason: mappingReason,
      evidence: evidenceSummary("none")
    });
  }
  if (material.segmentStartSeconds !== null || material.segmentEndSeconds !== null) {
    return result(request, {
      remainingAmount: null,
      remainingUnit: "video_second",
      estimatedMinutes: null,
      authority: "unknown",
      confidence: "none",
      plannerEligible: false,
      reason: "segment_progress_unavailable",
      evidence: evidenceSummary("none")
    });
  }
  if (material.durationSeconds === null || !Number.isFinite(material.durationSeconds) || material.durationSeconds <= 0) {
    return result(request, {
      remainingAmount: null,
      remainingUnit: "video_second",
      estimatedMinutes: null,
      authority: "unknown",
      confidence: "none",
      plannerEligible: false,
      reason: "video_duration_unavailable",
      evidence: evidenceSummary("none")
    });
  }
  const rawWatched = material.watchedSeconds ?? 0;
  if (!Number.isFinite(rawWatched) || rawWatched < 0) {
    return result(request, {
      remainingAmount: null,
      remainingUnit: "video_second",
      estimatedMinutes: null,
      authority: "unknown",
      confidence: "none",
      plannerEligible: false,
      reason: "invalid_video_progress",
      evidence: evidenceSummary("none")
    });
  }
  const remainingSeconds2 = material.progressState === "completed" ? 0 : Math.max(0, Math.floor(material.durationSeconds) - Math.floor(rawWatched));
  return result(request, {
    remainingAmount: remainingSeconds2,
    remainingUnit: "video_second",
    estimatedMinutes: Math.ceil(remainingSeconds2 / 60),
    authority: "exact",
    confidence: "high",
    plannerEligible: true,
    reason: remainingSeconds2 === 0 ? "completed" : "authoritative_full_video",
    evidence: evidenceSummary("intrinsic", 0, 0, ["duration_seconds", "watched_seconds"])
  });
}
function findFallback(request) {
  const policies = request.fallbackPolicies ?? [];
  return policies.find(
    (policy) => policy.materialType === request.material.unitType && (!policy.resourceId || policy.resourceId === request.material.resourceId) && (!policy.subjectId || policy.subjectId === request.subjectId) && Number.isFinite(policy.minutesPerPage) && policy.minutesPerPage > 0
  ) ?? null;
}
function estimatePhysical(request) {
  const material = request.material;
  const mappingReason = mappingBlockReason(material);
  if (material.progressState === "completed") {
    return result(request, {
      remainingAmount: 0,
      remainingUnit: "page",
      estimatedMinutes: 0,
      authority: "exact",
      confidence: "high",
      plannerEligible: mappingReason === null,
      reason: mappingReason ?? "completed",
      evidence: evidenceSummary("intrinsic", 0, 0, ["resource_unit_progress:completed"])
    });
  }
  if (material.progressState === "skipped") {
    return result(request, {
      remainingAmount: null,
      remainingUnit: "page",
      estimatedMinutes: null,
      authority: "unknown",
      confidence: "none",
      plannerEligible: false,
      reason: "progress_skipped",
      evidence: evidenceSummary("none")
    });
  }
  if (material.pageStart === null || material.pageEnd === null || !Number.isInteger(material.pageStart) || !Number.isInteger(material.pageEnd) || material.pageStart <= 0 || material.pageEnd < material.pageStart) {
    return result(request, {
      remainingAmount: null,
      remainingUnit: "page",
      estimatedMinutes: null,
      authority: "unknown",
      confidence: "none",
      plannerEligible: false,
      reason: "physical_range_unavailable",
      evidence: evidenceSummary("none")
    });
  }
  const boundary = material.completedThroughPage ?? null;
  if (boundary !== null && (material.progressState !== "in_progress" || !Number.isInteger(boundary) || boundary < material.pageStart || boundary >= material.pageEnd) || boundary === null && material.progressState === "in_progress") {
    return result(request, {
      remainingAmount: null,
      remainingUnit: "page",
      estimatedMinutes: null,
      authority: "unknown",
      confidence: "none",
      plannerEligible: false,
      reason: "invalid_progress_boundary",
      evidence: evidenceSummary("none")
    });
  }
  const remainingStart = boundary === null ? material.pageStart : boundary + 1;
  const remainingPages = material.pageEnd - remainingStart + 1;
  if (mappingReason) {
    return result(request, {
      remainingAmount: remainingPages,
      remainingUnit: "page",
      estimatedMinutes: null,
      authority: "unknown",
      confidence: "none",
      plannerEligible: false,
      reason: mappingReason,
      evidence: evidenceSummary("none")
    });
  }
  const readiness = evaluateCalibrationReadiness({
    userId: request.userId,
    examProfileId: request.examProfileId,
    resourceId: material.resourceId,
    subjectId: request.subjectId,
    materialType: material.unitType,
    evidence: request.evidence
  });
  if (readiness.usableForPlanner && readiness.pace !== null) {
    return result(request, {
      remainingAmount: remainingPages,
      remainingUnit: "page",
      estimatedMinutes: Math.ceil(remainingPages * readiness.pace),
      authority: "calibrated",
      confidence: readiness.confidence,
      plannerEligible: true,
      reason: "pace_calibrated",
      evidence: evidenceSummary(
        readiness.scope === "none" ? "none" : readiness.scope,
        readiness.compatibleSampleCount,
        readiness.totalObservedMinutes,
        readiness.provenance
      )
    });
  }
  if (readiness.usableForShadow) {
    return result(request, {
      remainingAmount: remainingPages,
      remainingUnit: "page",
      estimatedMinutes: null,
      authority: "unknown",
      confidence: readiness.confidence,
      plannerEligible: false,
      reason: "pace_confidence_insufficient",
      evidence: evidenceSummary(
        readiness.scope === "none" ? "none" : readiness.scope,
        readiness.compatibleSampleCount,
        readiness.totalObservedMinutes,
        readiness.provenance
      )
    });
  }
  const fallback = findFallback(request);
  if (fallback) {
    const plannerEligible = fallback.authorizedForPlanning && (fallback.confidence === "medium" || fallback.confidence === "high");
    return result(request, {
      remainingAmount: remainingPages,
      remainingUnit: "page",
      estimatedMinutes: Math.ceil(remainingPages * fallback.minutesPerPage),
      authority: "fallback",
      confidence: fallback.confidence,
      plannerEligible,
      reason: plannerEligible ? "configured_fallback" : "fallback_not_authorized_for_planning",
      evidence: evidenceSummary("configured_fallback", 0, 0, [fallback.provenance])
    });
  }
  return result(request, {
    remainingAmount: remainingPages,
    remainingUnit: "page",
    estimatedMinutes: null,
    authority: "unknown",
    confidence: "none",
    plannerEligible: false,
    reason: "pace_evidence_unavailable",
    evidence: evidenceSummary("none")
  });
}
function estimateCanonicalMaterialWorkload(request) {
  return request.material.sourceKind === "youtube" ? estimateYoutube(request) : estimatePhysical(request);
}
function toPlannerV2WorkloadHandoff(estimate) {
  const plannerEligible = estimate.plannerEligible && estimate.estimatedMinutes !== null && estimate.authority !== "unknown" && estimate.confidence !== "none" && (estimate.authority === "exact" || estimate.confidence === "medium" || estimate.confidence === "high");
  return Object.freeze({
    materialViewId: estimate.materialViewId,
    sourceKind: estimate.sourceKind,
    resourceId: estimate.resourceId,
    subjectId: estimate.subjectId,
    materialType: estimate.materialType,
    remainingAmount: estimate.remainingAmount,
    remainingUnit: estimate.remainingUnit,
    estimatedMinutes: plannerEligible ? estimate.estimatedMinutes : null,
    workloadAuthority: plannerEligible ? estimate.authority : "unknown",
    workloadConfidence: estimate.confidence,
    plannerEligible,
    unresolvedWorkloadReason: plannerEligible ? null : estimate.reason,
    evidence: estimate.evidence
  });
}
function increment(record, key, amount = 1) {
  record[key] = (record[key] ?? 0) + amount;
}
function summarizeCanonicalWorkload(estimates) {
  const blockedByReason = {};
  const confidenceDistribution = {
    none: 0,
    low: 0,
    medium: 0,
    high: 0
  };
  const workloadMinutesBySubject = {};
  const workloadMinutesByResource = {};
  const workloadMinutesByMaterialType = {};
  let exactWorkloadViews = 0;
  let calibratedWorkloadViews = 0;
  let fallbackWorkloadViews = 0;
  let unknownWorkloadViews = 0;
  let plannerEligibleViews = 0;
  let exactYoutubeRemainingMinutes = 0;
  let physicalPagesWithCalibratedWorkload = 0;
  let physicalPagesWithUnknownWorkload = 0;
  let physicalEstimatedRemainingMinutes = 0;
  let plannerEligibleCalibratedViews = 0;
  for (const estimate of estimates) {
    if (estimate.authority === "exact") exactWorkloadViews += 1;
    if (estimate.authority === "calibrated") calibratedWorkloadViews += 1;
    if (estimate.authority === "fallback") fallbackWorkloadViews += 1;
    if (estimate.authority === "unknown") unknownWorkloadViews += 1;
    if (estimate.plannerEligible) {
      plannerEligibleViews += 1;
      if (estimate.authority === "calibrated") {
        plannerEligibleCalibratedViews += 1;
      }
    } else {
      increment(blockedByReason, estimate.reason);
    }
    confidenceDistribution[estimate.confidence] += 1;
    if (estimate.sourceKind === "youtube" && estimate.authority === "exact" && estimate.estimatedMinutes !== null) {
      exactYoutubeRemainingMinutes += estimate.estimatedMinutes;
    }
    if (estimate.sourceKind === "physical" && estimate.remainingAmount !== null) {
      if (estimate.authority === "calibrated") {
        physicalPagesWithCalibratedWorkload += estimate.remainingAmount;
      } else if (estimate.authority === "unknown") {
        physicalPagesWithUnknownWorkload += estimate.remainingAmount;
      }
    }
    if (estimate.estimatedMinutes !== null) {
      increment(workloadMinutesBySubject, estimate.subjectId ?? "unmapped", estimate.estimatedMinutes);
      increment(workloadMinutesByResource, estimate.resourceId, estimate.estimatedMinutes);
      increment(workloadMinutesByMaterialType, estimate.materialType, estimate.estimatedMinutes);
      if (estimate.sourceKind === "physical") {
        physicalEstimatedRemainingMinutes += estimate.estimatedMinutes;
      }
    }
  }
  return Object.freeze({
    totalMaterialViews: estimates.length,
    exactWorkloadViews,
    calibratedWorkloadViews,
    fallbackWorkloadViews,
    unknownWorkloadViews,
    plannerEligibleViews,
    blockedByReason: Object.freeze(blockedByReason),
    exactYoutubeRemainingMinutes,
    physicalPagesWithCalibratedWorkload,
    physicalPagesWithUnknownWorkload,
    physicalEstimatedRemainingMinutes,
    plannerEligibleCalibratedViews,
    confidenceDistribution: Object.freeze(confidenceDistribution),
    workloadMinutesBySubject: Object.freeze(workloadMinutesBySubject),
    workloadMinutesByResource: Object.freeze(workloadMinutesByResource),
    workloadMinutesByMaterialType: Object.freeze(workloadMinutesByMaterialType)
  });
}

// packages/domain/src/planning/physical-pace-evidence.ts
function physicalPaceMaterialType(sourceUnitType, hasExactPageRange) {
  if (!hasExactPageRange) return null;
  return sourceUnitType === "test" ? "test" : "page_range";
}
function evaluatePhysicalPaceCompletion(input) {
  const values = [
    input.pageStart,
    input.pageEnd,
    input.startPageBoundary,
    input.endPageBoundary
  ];
  const validRange = values.every(Number.isInteger) && input.pageStart > 0 && input.pageEnd >= input.pageStart && input.startPageBoundary >= input.pageStart - 1 && input.startPageBoundary <= input.pageEnd && input.endPageBoundary >= input.pageStart - 1 && input.endPageBoundary <= input.pageEnd;
  if (!validRange) {
    return Object.freeze({
      status: "rejected",
      reason: "invalid_page_boundary"
    });
  }
  if (input.endPageBoundary < input.startPageBoundary) {
    return Object.freeze({
      status: "rejected",
      reason: "progress_reversal"
    });
  }
  const progressedPages = input.endPageBoundary - input.startPageBoundary;
  if (progressedPages === 0) {
    return Object.freeze({
      status: "zero_progress",
      startPageBoundary: input.startPageBoundary,
      endPageBoundary: input.endPageBoundary,
      progressedPages: 0,
      resultingProgressState: "in_progress"
    });
  }
  return Object.freeze({
    status: "accepted",
    startPageBoundary: input.startPageBoundary,
    endPageBoundary: input.endPageBoundary,
    progressedPages,
    resultingProgressState: input.endPageBoundary === input.pageEnd ? "completed" : "in_progress"
  });
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
  LEARNING_STAGE_POLICY_VERSION,
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
  adaptPhysicalMaterialRow,
  adaptPhysicalStructuralSpan,
  adaptYoutubeMaterialRow,
  adaptYoutubeMaterialRows,
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
  calculateRemainingMaterialScope,
  calculateWeeklyAvailableMinutes,
  calculateWeeklyRevisionBudget,
  calibrationEvidenceExclusionReason,
  completeRevisionStatus,
  derivePhysicalStructuralCoverage,
  deriveTaskStatus,
  estimateCanonicalMaterialWorkload,
  estimatePhysicalPace,
  estimatePhysicalPaceAtScope,
  evaluateBacklog,
  evaluateCalibrationReadiness,
  evaluateLearningStage,
  evaluatePhysicalPaceCompletion,
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
  normalizeMaterialUnit,
  p48MondayOf,
  p48PhaseForDate,
  physicalPaceMaterialType,
  remainingTaskMinutes,
  replanWeeklyPlanV1,
  summarizeCanonicalWorkload,
  summarizeMaterialStageEvidence,
  toPlannerV2WorkloadHandoff,
  transitionTopicForLearnTask,
  zonedMidnightToUtc
};
