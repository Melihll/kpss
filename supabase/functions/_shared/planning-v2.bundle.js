// packages/domain/src/planning-v2/triggers.ts
var DEFAULT_REPLAN_SCOPE_V2 = {
  STUDY_COMPLETED: "NO_REPLAN",
  STUDY_DEVIATION: "NO_REPLAN",
  CAPACITY_INCREASE: "NO_REPLAN",
  CAPACITY_DECREASE: "LOCAL_CAPACITY_REPAIR",
  MISSED_DAY: "MISSED_DAY_REPAIR",
  MASTERY_CHANGE: "NO_REPLAN",
  WEEKLY_REVIEW: "WEEKLY_REOPTIMIZATION",
  MANUAL_REPLAN: "MANUAL_REPLAN"
};
function defaultReplanScopeV2(trigger) {
  return DEFAULT_REPLAN_SCOPE_V2[trigger];
}

// packages/domain/src/planning-v2/snapshot.ts
function assertNonNegativeNumber(name, value) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a finite non-negative number`);
  }
}
function assertIsoDate(name, value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${name} must use YYYY-MM-DD format`);
  }
}
function deepFreezeV2(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const nested of Object.values(value)) {
    deepFreezeV2(nested);
  }
  return Object.freeze(value);
}
function remainingTaskMinutesV2(estimatedMinutes, completedMinutes) {
  assertNonNegativeNumber("estimatedMinutes", estimatedMinutes);
  assertNonNegativeNumber("completedMinutes", completedMinutes);
  return Math.max(estimatedMinutes - completedMinutes, 0);
}
function buildPlanningDayCapacityV2(input) {
  assertIsoDate("capacity.date", input.date);
  assertNonNegativeNumber(
    "capacity.grossCapacityMinutes",
    input.grossCapacityMinutes
  );
  assertNonNegativeNumber(
    "capacity.reserveMinutes",
    input.reserveMinutes
  );
  assertNonNegativeNumber(
    "capacity.alreadyStudiedMinutes",
    input.alreadyStudiedMinutes
  );
  const planningCapacityMinutes = Math.max(
    input.grossCapacityMinutes - input.reserveMinutes,
    0
  );
  const remainingCapacityMinutes = Math.max(
    planningCapacityMinutes - input.alreadyStudiedMinutes,
    0
  );
  return {
    date: input.date,
    grossCapacityMinutes: input.grossCapacityMinutes,
    reserveMinutes: input.reserveMinutes,
    planningCapacityMinutes,
    alreadyStudiedMinutes: input.alreadyStudiedMinutes,
    remainingCapacityMinutes,
    unavailable: input.unavailable ?? input.grossCapacityMinutes === 0
  };
}
function buildExistingScheduledTaskV2(input) {
  assertNonNegativeNumber(
    `${input.taskId}.estimatedMinutes`,
    input.estimatedMinutes
  );
  assertNonNegativeNumber(
    `${input.taskId}.completedMinutes`,
    input.completedMinutes
  );
  if (input.plannedDate !== null) {
    assertIsoDate(`${input.taskId}.plannedDate`, input.plannedDate);
  }
  return {
    taskId: input.taskId,
    userId: input.userId,
    examProfileId: input.examProfileId,
    weeklyPlanId: input.weeklyPlanId,
    curriculumUnitId: input.curriculumUnitId,
    subjectId: input.subjectId,
    resourceId: input.resourceId,
    resourceUnitIds: [...input.resourceUnitIds ?? []],
    title: input.title,
    taskType: input.taskType,
    lifecycleStatus: input.lifecycleStatus,
    plannedDate: input.plannedDate,
    estimatedMinutes: input.estimatedMinutes,
    completedMinutes: input.completedMinutes,
    remainingMinutes: remainingTaskMinutesV2(
      input.estimatedMinutes,
      input.completedMinutes
    ),
    priorityScore: input.priorityScore ?? 0,
    importance: input.importance ?? null,
    isCompleted: input.isCompleted,
    isActive: input.isActive,
    isPartiallyCompleted: input.isPartiallyCompleted,
    earliestAllowedDate: input.earliestAllowedDate ?? null,
    latestAllowedDate: input.latestAllowedDate ?? null
  };
}
function buildPlanningSnapshotV2(input) {
  assertIsoDate("currentDate", input.currentDate);
  assertIsoDate("weekStart", input.weekStart);
  assertIsoDate("weekEnd", input.weekEnd);
  if (input.examDate !== null) {
    assertIsoDate("examDate", input.examDate);
  }
  if (input.weekStart > input.weekEnd) {
    throw new Error("weekStart must not be after weekEnd");
  }
  if (input.currentDate < input.weekStart || input.currentDate > input.weekEnd) {
    throw new Error("currentDate must be inside the planning week");
  }
  assertNonNegativeNumber("availableMinutes", input.availableMinutes);
  assertNonNegativeNumber(
    "planningBudgetMinutes",
    input.planningBudgetMinutes
  );
  assertNonNegativeNumber("reserveMinutes", input.reserveMinutes);
  const seenDates = /* @__PURE__ */ new Set();
  const dailyCapacities = input.dailyCapacities.map((day) => {
    if (seenDates.has(day.date)) {
      throw new Error(`duplicate daily capacity date: ${day.date}`);
    }
    seenDates.add(day.date);
    if (day.date < input.weekStart || day.date > input.weekEnd) {
      throw new Error(`capacity date outside planning week: ${day.date}`);
    }
    return buildPlanningDayCapacityV2(day);
  });
  const seenTaskIds = /* @__PURE__ */ new Set();
  const existingTasks = input.existingTasks.map((task) => {
    if (seenTaskIds.has(task.taskId)) {
      throw new Error(`duplicate task id: ${task.taskId}`);
    }
    seenTaskIds.add(task.taskId);
    if (task.userId !== input.userId) {
      throw new Error(`task ownership mismatch: ${task.taskId}`);
    }
    if (task.examProfileId !== input.examProfileId) {
      throw new Error(`task exam profile mismatch: ${task.taskId}`);
    }
    return buildExistingScheduledTaskV2(task);
  });
  const snapshot = {
    meta: {
      snapshotId: input.snapshotId,
      snapshotHash: input.snapshotHash ?? null,
      generatedAt: input.generatedAt,
      currentDate: input.currentDate,
      weekStart: input.weekStart,
      weekEnd: input.weekEnd,
      trigger: input.trigger,
      requestedScope: input.requestedScope ?? defaultReplanScopeV2(input.trigger),
      versions: { ...input.versions }
    },
    userId: input.userId,
    examProfileId: input.examProfileId,
    examDate: input.examDate,
    availableMinutes: input.availableMinutes,
    planningBudgetMinutes: input.planningBudgetMinutes,
    reserveMinutes: input.reserveMinutes,
    dailyCapacities,
    existingTasks,
    learnerStates: [...input.learnerStates ?? []],
    prerequisites: [...input.prerequisites ?? []],
    activeTaskIds: existingTasks.filter((task) => task.isActive).map((task) => task.taskId),
    completedTaskIds: existingTasks.filter((task) => task.isCompleted).map((task) => task.taskId)
  };
  return deepFreezeV2(snapshot);
}

// packages/domain/src/planning-v2/db-snapshot-contract.ts
function assertNonNegativeInteger(name, value) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(
      `${name} must be a non-negative integer`
    );
  }
}
function assertOwnership(name, expectedUserId, expectedProfileId, actualUserId, actualProfileId) {
  if (expectedUserId !== actualUserId || expectedProfileId !== actualProfileId) {
    throw new Error(
      `${name} ownership mismatch`
    );
  }
}
function mergePlanningTaskProgressV1(task, progress) {
  assertNonNegativeInteger(
    "estimated_minutes",
    task.estimated_minutes
  );
  if (task.estimated_minutes === 0) {
    throw new Error(
      "estimated_minutes must be positive"
    );
  }
  if (progress !== null && progress.user_id !== task.user_id) {
    throw new Error(
      "task progress ownership mismatch"
    );
  }
  const completedMinutes = progress?.completed_minutes ?? 0;
  assertNonNegativeInteger(
    "completed_minutes",
    completedMinutes
  );
  const remainingMinutes = Math.max(
    task.estimated_minutes - completedMinutes,
    0
  );
  return Object.freeze({
    taskId: task.id,
    userId: task.user_id,
    examProfileId: task.exam_profile_id,
    weeklyPlanId: task.weekly_plan_id,
    subjectId: task.subject_id,
    curriculumUnitId: task.curriculum_node_id,
    resourceId: task.resource_id,
    resourceSectionId: task.resource_section_id ?? null,
    taskType: task.task_type,
    title: task.title,
    plannedDate: task.planned_date,
    estimatedMinutes: task.estimated_minutes,
    completedMinutes,
    remainingMinutes,
    isCompleted: task.status === "completed",
    isActive: task.status === "in_progress",
    isPartiallyCompleted: task.status === "partially_completed",
    status: task.status
  });
}
function learnerStateFromDbProjectionV1(row) {
  return Object.freeze({
    userId: row.user_id,
    examProfileId: row.exam_profile_id,
    curriculumUnitId: row.curriculum_node_id,
    masteryMean: row.mastery_mean,
    masteryConfidence: row.mastery_confidence,
    questionAccuracy: row.question_accuracy,
    questionCount: row.question_count,
    averageQuestionSeconds: row.average_question_seconds,
    studyMinutes: row.study_minutes,
    evidenceCount: row.evidence_count,
    difficultyEstimate: row.difficulty_estimate,
    lastStudiedAt: row.last_studied_at,
    lastRetrievalAt: row.last_retrieval_at,
    memoryStability: row.memory_stability,
    memoryDifficulty: row.memory_difficulty,
    retrievability: row.retrievability,
    misconceptionTags: Object.freeze([
      ...row.misconception_tags
    ]),
    /*
     * The persisted projection represents
     * the current calculated state.
     */
    updatedAt: null
  });
}
function normalizePlanningSnapshotDbBundleV1(input) {
  const {
    weeklyPlan
  } = input;
  const progressByTaskId = /* @__PURE__ */ new Map();
  for (const progress of input.taskProgress) {
    if (progressByTaskId.has(
      progress.task_id
    )) {
      throw new Error(
        `duplicate task progress: ${progress.task_id}`
      );
    }
    progressByTaskId.set(
      progress.task_id,
      progress
    );
  }
  const seenTaskIds = /* @__PURE__ */ new Set();
  const tasks = input.tasks.map((task) => {
    assertOwnership(
      `task:${task.id}`,
      weeklyPlan.user_id,
      weeklyPlan.exam_profile_id,
      task.user_id,
      task.exam_profile_id
    );
    if (task.weekly_plan_id !== weeklyPlan.id) {
      throw new Error(
        `task weekly plan mismatch: ${task.id}`
      );
    }
    if (seenTaskIds.has(task.id)) {
      throw new Error(
        `duplicate task: ${task.id}`
      );
    }
    seenTaskIds.add(task.id);
    const progress = progressByTaskId.get(
      task.id
    ) ?? null;
    return mergePlanningTaskProgressV1(
      task,
      progress
    );
  });
  for (const progress of input.taskProgress) {
    if (!seenTaskIds.has(
      progress.task_id
    )) {
      throw new Error(
        `orphan task progress in snapshot bundle: ${progress.task_id}`
      );
    }
  }
  const seenLearnerUnits = /* @__PURE__ */ new Set();
  const learnerStates = input.learnerStates.map(
    (row) => {
      assertOwnership(
        `learner-state:${row.curriculum_node_id}`,
        weeklyPlan.user_id,
        weeklyPlan.exam_profile_id,
        row.user_id,
        row.exam_profile_id
      );
      if (seenLearnerUnits.has(
        row.curriculum_node_id
      )) {
        throw new Error(
          `duplicate learner state: ${row.curriculum_node_id}`
        );
      }
      seenLearnerUnits.add(
        row.curriculum_node_id
      );
      return learnerStateFromDbProjectionV1(
        row
      );
    }
  );
  const seenDates = /* @__PURE__ */ new Set();
  const dailyCapacities = input.dailyCapacities.map((day) => {
    assertNonNegativeInteger(
      `gross capacity ${day.date}`,
      day.grossCapacityMinutes
    );
    assertNonNegativeInteger(
      `reserve ${day.date}`,
      day.reserveMinutes
    );
    assertNonNegativeInteger(
      `already studied ${day.date}`,
      day.alreadyStudiedMinutes
    );
    if (day.reserveMinutes > day.grossCapacityMinutes) {
      throw new Error(
        `reserve exceeds gross capacity: ${day.date}`
      );
    }
    if (seenDates.has(day.date)) {
      throw new Error(
        `duplicate daily capacity: ${day.date}`
      );
    }
    if (day.date < weeklyPlan.week_start_date || day.date > weeklyPlan.week_end_date) {
      throw new Error(
        `daily capacity outside weekly plan: ${day.date}`
      );
    }
    seenDates.add(day.date);
    return Object.freeze({
      ...day
    });
  }).sort(
    (a, b) => a.date.localeCompare(
      b.date
    )
  );
  const totalEstimatedMinutes = tasks.reduce(
    (sum2, task) => sum2 + task.estimatedMinutes,
    0
  );
  const totalCompletedMinutes = tasks.reduce(
    (sum2, task) => sum2 + task.completedMinutes,
    0
  );
  const totalRemainingMinutes = tasks.filter(
    (task) => !task.isCompleted
  ).reduce(
    (sum2, task) => sum2 + task.remainingMinutes,
    0
  );
  return Object.freeze({
    weeklyPlan,
    tasks: Object.freeze(tasks),
    learnerStates: Object.freeze(
      learnerStates
    ),
    dailyCapacities: Object.freeze(
      dailyCapacities
    ),
    totalEstimatedMinutes,
    totalCompletedMinutes,
    totalRemainingMinutes
  });
}

// packages/domain/src/planning-v2/db-snapshot-builder.ts
function assertNonBlank(name, value) {
  if (!value.trim()) {
    throw new Error(
      `${name} must not be blank`
    );
  }
}
function buildPlanningSnapshotFromDbBundleV1(input) {
  assertNonBlank(
    "snapshotId",
    input.snapshotId
  );
  const normalized = normalizePlanningSnapshotDbBundleV1(
    input.bundle
  );
  const {
    weeklyPlan
  } = normalized;
  if (input.currentDate < weeklyPlan.week_start_date || input.currentDate > weeklyPlan.week_end_date) {
    throw new Error(
      "currentDate must be inside the loaded weekly plan"
    );
  }
  const availableMinutes = normalized.dailyCapacities.reduce(
    (sum2, day) => sum2 + day.grossCapacityMinutes,
    0
  );
  const reserveMinutes = normalized.dailyCapacities.reduce(
    (sum2, day) => sum2 + day.reserveMinutes,
    0
  );
  const rawTaskById = new Map(
    input.bundle.tasks.map(
      (task) => [task.id, task]
    )
  );
  const dailyCapacities = normalized.dailyCapacities.map(
    (day) => ({
      date: day.date,
      grossCapacityMinutes: day.grossCapacityMinutes,
      reserveMinutes: day.reserveMinutes,
      alreadyStudiedMinutes: day.alreadyStudiedMinutes,
      /*
       * Zero gross capacity represents a
       * completely unavailable day.
       */
      unavailable: day.grossCapacityMinutes === 0
    })
  );
  const existingTasks = normalized.tasks.map(
    (task) => {
      const raw = rawTaskById.get(
        task.taskId
      );
      if (!raw) {
        throw new Error(
          `raw task missing after normalization: ${task.taskId}`
        );
      }
      const priorityScore = raw.priority_score ?? 0;
      if (!Number.isFinite(
        priorityScore
      ) || priorityScore < 0 || priorityScore > 100) {
        throw new Error(
          `invalid priority score: ${task.taskId}`
        );
      }
      return {
        taskId: task.taskId,
        userId: task.userId,
        examProfileId: task.examProfileId,
        weeklyPlanId: task.weeklyPlanId,
        curriculumUnitId: task.curriculumUnitId,
        subjectId: task.subjectId,
        resourceId: task.resourceId,
        /*
         * Loaded in the Supabase adapter phase.
         * Empty here is explicit, not inferred.
         */
        resourceUnitIds: Object.freeze([]),
        title: task.title,
        taskType: task.taskType,
        lifecycleStatus: task.status,
        plannedDate: task.plannedDate,
        estimatedMinutes: task.estimatedMinutes,
        completedMinutes: task.completedMinutes,
        priorityScore,
        importance: raw.importance ?? null,
        /*
         * These are authoritative DB lifecycle
         * flags from tasks.status.
         *
         * Never infer them from minute totals.
         */
        isCompleted: task.isCompleted,
        isActive: task.isActive,
        isPartiallyCompleted: task.isPartiallyCompleted,
        /*
         * No fake curriculum constraints.
         * Real DAG/eligibility constraints will
         * be supplied separately.
         */
        earliestAllowedDate: null,
        latestAllowedDate: null
      };
    }
  );
  return buildPlanningSnapshotV2({
    snapshotId: input.snapshotId,
    snapshotHash: input.snapshotHash ?? null,
    generatedAt: input.generatedAt,
    currentDate: input.currentDate,
    weekStart: weeklyPlan.week_start_date,
    weekEnd: weeklyPlan.week_end_date,
    trigger: input.trigger,
    requestedScope: input.requestedScope,
    versions: input.versions,
    userId: weeklyPlan.user_id,
    examProfileId: weeklyPlan.exam_profile_id,
    examDate: input.examDate,
    availableMinutes,
    /*
     * Stable source-of-truth budget.
     *
     * Capacity increases must not automatically
     * inflate the learner workload target.
     */
    planningBudgetMinutes: weeklyPlan.planning_budget_minutes,
    reserveMinutes,
    dailyCapacities,
    existingTasks,
    learnerStates: normalized.learnerStates,
    prerequisites: input.prerequisites ?? []
  });
}

// packages/domain/src/planning-v2/feasibility.ts
function remainingFutureTask(snapshot, task) {
  if (task.isCompleted) {
    return false;
  }
  return task.remainingMinutes > 0;
}
function taskIds(tasks) {
  return Object.freeze(tasks.map((task) => task.taskId));
}
function checkCurrentPlanFeasibilityV2(snapshot) {
  const violations = [];
  const capacityByDate = new Map(
    snapshot.dailyCapacities.map((day) => [day.date, day])
  );
  const relevantTasks = snapshot.existingTasks.filter(
    (task) => remainingFutureTask(snapshot, task)
  );
  const pastDueTasks = relevantTasks.filter(
    (task) => task.plannedDate !== null && task.plannedDate < snapshot.meta.currentDate
  );
  if (pastDueTasks.length > 0) {
    violations.push({
      code: "PAST_DUE_REMAINING_WORK",
      message: "Remaining work exists on dates before the current planning date.",
      date: null,
      taskIds: taskIds(pastDueTasks),
      excessMinutes: pastDueTasks.reduce(
        (sum2, task) => sum2 + task.remainingMinutes,
        0
      )
    });
  }
  const outsideWeekTasks = relevantTasks.filter(
    (task) => task.plannedDate !== null && (task.plannedDate < snapshot.meta.weekStart || task.plannedDate > snapshot.meta.weekEnd)
  );
  if (outsideWeekTasks.length > 0) {
    violations.push({
      code: "TASK_OUTSIDE_PLANNING_WEEK",
      message: "One or more remaining tasks are scheduled outside the planning week.",
      date: null,
      taskIds: taskIds(outsideWeekTasks),
      excessMinutes: outsideWeekTasks.reduce(
        (sum2, task) => sum2 + task.remainingMinutes,
        0
      )
    });
  }
  const missingCapacityTasks = relevantTasks.filter(
    (task) => task.plannedDate !== null && task.plannedDate >= snapshot.meta.currentDate && task.plannedDate >= snapshot.meta.weekStart && task.plannedDate <= snapshot.meta.weekEnd && !capacityByDate.has(task.plannedDate)
  );
  if (missingCapacityTasks.length > 0) {
    violations.push({
      code: "MISSING_DAY_CAPACITY",
      message: "One or more scheduled tasks do not have a matching daily capacity record.",
      date: null,
      taskIds: taskIds(missingCapacityTasks),
      excessMinutes: missingCapacityTasks.reduce(
        (sum2, task) => sum2 + task.remainingMinutes,
        0
      )
    });
  }
  const futureDays = snapshot.dailyCapacities.filter(
    (day) => day.date >= snapshot.meta.currentDate && day.date >= snapshot.meta.weekStart && day.date <= snapshot.meta.weekEnd
  ).sort((a, b) => a.date.localeCompare(b.date));
  const daily = futureDays.map((day) => {
    const tasks = relevantTasks.filter(
      (task) => task.plannedDate === day.date
    );
    const scheduledRemainingMinutes = tasks.reduce(
      (sum2, task) => sum2 + task.remainingMinutes,
      0
    );
    const slackMinutes = Math.max(
      day.remainingCapacityMinutes - scheduledRemainingMinutes,
      0
    );
    const overloadMinutes = Math.max(
      scheduledRemainingMinutes - day.remainingCapacityMinutes,
      0
    );
    if (overloadMinutes > 0) {
      violations.push({
        code: "DAILY_OVERLOAD",
        message: `Scheduled remaining workload exceeds remaining capacity on ${day.date}.`,
        date: day.date,
        taskIds: taskIds(tasks),
        excessMinutes: overloadMinutes
      });
    }
    return Object.freeze({
      date: day.date,
      remainingCapacityMinutes: day.remainingCapacityMinutes,
      scheduledRemainingMinutes,
      slackMinutes,
      overloadMinutes,
      taskIds: taskIds(tasks),
      feasible: overloadMinutes === 0
    });
  });
  const scheduledFutureTaskIds = new Set(
    daily.flatMap((day) => day.taskIds)
  );
  const totalRemainingWorkMinutes = relevantTasks.filter((task) => scheduledFutureTaskIds.has(task.taskId)).reduce((sum2, task) => sum2 + task.remainingMinutes, 0);
  const totalRemainingCapacityMinutes = daily.reduce(
    (sum2, day) => sum2 + day.remainingCapacityMinutes,
    0
  );
  if (totalRemainingWorkMinutes > totalRemainingCapacityMinutes) {
    violations.push({
      code: "WEEKLY_REMAINING_CAPACITY_EXCEEDED",
      message: "Remaining scheduled workload exceeds the remaining planning capacity.",
      date: null,
      taskIds: Object.freeze([...scheduledFutureTaskIds]),
      excessMinutes: totalRemainingWorkMinutes - totalRemainingCapacityMinutes
    });
  }
  const totalSlackMinutes = daily.reduce(
    (sum2, day) => sum2 + day.slackMinutes,
    0
  );
  const totalOverloadMinutes = daily.reduce(
    (sum2, day) => sum2 + day.overloadMinutes,
    0
  );
  const result = {
    feasible: violations.length === 0,
    daily: Object.freeze(daily),
    violations: Object.freeze(violations),
    totalRemainingWorkMinutes,
    totalRemainingCapacityMinutes,
    totalSlackMinutes,
    totalOverloadMinutes,
    checkedTaskCount: relevantTasks.length
  };
  return Object.freeze(result);
}

// packages/domain/src/planning-v2/local-repair.ts
function parseIsoDateUtc(date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    throw new Error(`invalid ISO date: ${date}`);
  }
  return Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3])
  );
}
function daysBetween(earlier, later) {
  return Math.floor(
    (parseIsoDateUtc(later) - parseIsoDateUtc(earlier)) / 864e5
  );
}
function movableTask(task) {
  return !task.isCompleted && !task.isActive && task.remainingMinutes > 0 && task.plannedDate !== null;
}
function chooseTasksForOverload(tasks, overloadMinutes) {
  const candidates = tasks.filter(movableTask).sort((a, b) => {
    if (a.isPartiallyCompleted !== b.isPartiallyCompleted) {
      return a.isPartiallyCompleted ? 1 : -1;
    }
    if (a.remainingMinutes !== b.remainingMinutes) {
      return b.remainingMinutes - a.remainingMinutes;
    }
    return a.taskId.localeCompare(b.taskId);
  });
  let best = null;
  function better(candidate, current) {
    if (current === null) {
      return true;
    }
    if (candidate.selectedTasks.length !== current.selectedTasks.length) {
      return candidate.selectedTasks.length < current.selectedTasks.length;
    }
    if (candidate.partialTaskCount !== current.partialTaskCount) {
      return candidate.partialTaskCount < current.partialTaskCount;
    }
    if (candidate.overshootMinutes !== current.overshootMinutes) {
      return candidate.overshootMinutes < current.overshootMinutes;
    }
    const candidateIds = candidate.selectedTasks.map((task) => task.taskId).sort().join("|");
    const currentIds = current.selectedTasks.map((task) => task.taskId).sort().join("|");
    return candidateIds < currentIds;
  }
  function search(index, selected, selectedMinutes) {
    if (selectedMinutes >= overloadMinutes) {
      const candidate = {
        selectedTasks: [...selected],
        totalMinutes: selectedMinutes,
        overshootMinutes: selectedMinutes - overloadMinutes,
        partialTaskCount: selected.filter(
          (task) => task.isPartiallyCompleted
        ).length
      };
      if (better(candidate, best)) {
        best = candidate;
      }
      return;
    }
    if (index >= candidates.length) {
      return;
    }
    if (best !== null && selected.length >= best.selectedTasks.length) {
      return;
    }
    const remainingPossible = candidates.slice(index).reduce(
      (sum2, task) => sum2 + task.remainingMinutes,
      0
    );
    if (selectedMinutes + remainingPossible < overloadMinutes) {
      return;
    }
    selected.push(candidates[index]);
    search(
      index + 1,
      selected,
      selectedMinutes + candidates[index].remainingMinutes
    );
    selected.pop();
    search(
      index + 1,
      selected,
      selectedMinutes
    );
  }
  search(0, [], 0);
  return best;
}
function availableDestinationDates(snapshot, task, fromDate, days) {
  return [...days.values()].filter((day) => {
    if (day.date <= fromDate) {
      return false;
    }
    if (day.date < snapshot.meta.currentDate) {
      return false;
    }
    if (task.earliestAllowedDate !== null && day.date < task.earliestAllowedDate) {
      return false;
    }
    if (task.latestAllowedDate !== null && day.date > task.latestAllowedDate) {
      return false;
    }
    if (snapshot.examDate !== null && day.date > snapshot.examDate) {
      return false;
    }
    return day.capacityMinutes - day.scheduledMinutes >= task.remainingMinutes;
  }).sort((a, b) => a.date.localeCompare(b.date));
}
function repairCurrentPlanLocallyV1(snapshot) {
  const feasibilityBefore = checkCurrentPlanFeasibilityV2(snapshot);
  if (feasibilityBefore.feasible) {
    return Object.freeze({
      repairRequired: false,
      successful: true,
      feasibilityBefore,
      moves: Object.freeze([]),
      backlog: Object.freeze([]),
      changedTaskCount: 0,
      movedMinutes: 0,
      backlogMinutes: 0,
      unresolvedOverloadMinutes: 0,
      reasonCodes: Object.freeze([
        "CURRENT_PLAN_ALREADY_FEASIBLE",
        "KEEP_EXISTING_PLAN"
      ])
    });
  }
  const unsupportedViolations = feasibilityBefore.violations.filter(
    (violation2) => violation2.code !== "DAILY_OVERLOAD" && violation2.code !== "WEEKLY_REMAINING_CAPACITY_EXCEEDED" && violation2.code !== "PAST_DUE_REMAINING_WORK"
  );
  if (unsupportedViolations.length > 0) {
    return Object.freeze({
      repairRequired: true,
      successful: false,
      feasibilityBefore,
      moves: Object.freeze([]),
      backlog: Object.freeze([]),
      changedTaskCount: 0,
      movedMinutes: 0,
      backlogMinutes: 0,
      unresolvedOverloadMinutes: feasibilityBefore.totalOverloadMinutes,
      reasonCodes: Object.freeze([
        "LOCAL_REPAIR_SCOPE_UNSUPPORTED",
        ...unsupportedViolations.map(
          (violation2) => `UNSUPPORTED:${violation2.code}`
        )
      ])
    });
  }
  const dayState = /* @__PURE__ */ new Map();
  for (const day of feasibilityBefore.daily) {
    dayState.set(day.date, {
      date: day.date,
      capacityMinutes: day.remainingCapacityMinutes,
      scheduledMinutes: day.scheduledRemainingMinutes
    });
  }
  const tasksByDate = /* @__PURE__ */ new Map();
  for (const task of snapshot.existingTasks) {
    if (task.plannedDate === null || task.plannedDate < snapshot.meta.currentDate || task.remainingMinutes <= 0 || task.isCompleted) {
      continue;
    }
    const bucket = tasksByDate.get(task.plannedDate) ?? [];
    bucket.push(task);
    tasksByDate.set(task.plannedDate, bucket);
  }
  const moves = [];
  const backlog = [];
  const pastDueTasks = snapshot.existingTasks.filter(
    (task) => task.plannedDate !== null && task.plannedDate < snapshot.meta.currentDate && task.remainingMinutes > 0 && !task.isCompleted
  ).sort((a, b) => {
    const dateOrder = a.plannedDate.localeCompare(b.plannedDate);
    if (dateOrder !== 0) return dateOrder;
    if (a.isPartiallyCompleted !== b.isPartiallyCompleted) {
      return a.isPartiallyCompleted ? 1 : -1;
    }
    if (a.remainingMinutes !== b.remainingMinutes) {
      return b.remainingMinutes - a.remainingMinutes;
    }
    return a.taskId.localeCompare(b.taskId);
  });
  let unresolvedPastDueMinutes = 0;
  for (const task of pastDueTasks) {
    if (!movableTask(task)) {
      unresolvedPastDueMinutes += task.remainingMinutes;
      continue;
    }
    const fromDate = task.plannedDate;
    const destination = availableDestinationDates(
      snapshot,
      task,
      fromDate,
      dayState
    )[0] ?? null;
    if (destination === null) {
      backlog.push(
        Object.freeze({
          taskId: task.taskId,
          fromDate,
          remainingMinutes: task.remainingMinutes,
          reasonCodes: Object.freeze([
            "LOCAL_PAST_DUE_REPAIR",
            "NO_FEASIBLE_REMAINING_WEEK_CAPACITY",
            "BACKLOG_ONLY_AFTER_MOVE_SEARCH"
          ])
        })
      );
      continue;
    }
    destination.scheduledMinutes += task.remainingMinutes;
    moves.push(
      Object.freeze({
        taskId: task.taskId,
        fromDate,
        toDate: destination.date,
        remainingMinutes: task.remainingMinutes,
        distanceDays: daysBetween(fromDate, destination.date),
        reasonCodes: Object.freeze([
          "LOCAL_PAST_DUE_REPAIR",
          "MOVE_TO_NEAREST_FEASIBLE_FUTURE_DAY"
        ])
      })
    );
    const destinationBucket = tasksByDate.get(destination.date) ?? [];
    destinationBucket.push({
      ...task,
      plannedDate: destination.date
    });
    tasksByDate.set(destination.date, destinationBucket);
  }
  const orderedDays = [...dayState.values()].sort(
    (a, b) => a.date.localeCompare(b.date)
  );
  for (const sourceDay of orderedDays) {
    const overload = Math.max(
      sourceDay.scheduledMinutes - sourceDay.capacityMinutes,
      0
    );
    if (overload === 0) {
      continue;
    }
    const sourceTasks = tasksByDate.get(sourceDay.date) ?? [];
    const choice = chooseTasksForOverload(
      sourceTasks,
      overload
    );
    if (choice === null) {
      continue;
    }
    const selected = [...choice.selectedTasks].sort((a, b) => {
      if (a.isPartiallyCompleted !== b.isPartiallyCompleted) {
        return a.isPartiallyCompleted ? 1 : -1;
      }
      if (a.remainingMinutes !== b.remainingMinutes) {
        return b.remainingMinutes - a.remainingMinutes;
      }
      return a.taskId.localeCompare(
        b.taskId
      );
    });
    for (const task of selected) {
      const fromDate = task.plannedDate;
      const destinations = availableDestinationDates(
        snapshot,
        task,
        fromDate,
        dayState
      );
      const destination = destinations[0] ?? null;
      sourceDay.scheduledMinutes -= task.remainingMinutes;
      if (destination !== null) {
        destination.scheduledMinutes += task.remainingMinutes;
        moves.push(
          Object.freeze({
            taskId: task.taskId,
            fromDate,
            toDate: destination.date,
            remainingMinutes: task.remainingMinutes,
            distanceDays: daysBetween(
              fromDate,
              destination.date
            ),
            reasonCodes: Object.freeze([
              "LOCAL_DAILY_OVERLOAD_REPAIR",
              "MOVE_TO_NEAREST_FEASIBLE_FUTURE_DAY"
            ])
          })
        );
        const sourceBucket = tasksByDate.get(fromDate) ?? [];
        tasksByDate.set(
          fromDate,
          sourceBucket.filter(
            (item) => item.taskId !== task.taskId
          )
        );
        const destinationBucket = tasksByDate.get(destination.date) ?? [];
        destinationBucket.push({
          ...task,
          plannedDate: destination.date
        });
        tasksByDate.set(
          destination.date,
          destinationBucket
        );
      } else {
        backlog.push(
          Object.freeze({
            taskId: task.taskId,
            fromDate,
            remainingMinutes: task.remainingMinutes,
            reasonCodes: Object.freeze([
              "LOCAL_DAILY_OVERLOAD_REPAIR",
              "NO_FEASIBLE_FUTURE_CAPACITY",
              "BACKLOG_ONLY_AFTER_MOVE_SEARCH"
            ])
          })
        );
        const sourceBucket = tasksByDate.get(fromDate) ?? [];
        tasksByDate.set(
          fromDate,
          sourceBucket.filter(
            (item) => item.taskId !== task.taskId
          )
        );
      }
      if (sourceDay.scheduledMinutes <= sourceDay.capacityMinutes) {
        break;
      }
    }
  }
  const unresolvedOverloadMinutes = unresolvedPastDueMinutes + [...dayState.values()].reduce(
    (sum2, day) => sum2 + Math.max(
      day.scheduledMinutes - day.capacityMinutes,
      0
    ),
    0
  );
  const changedTaskIds = /* @__PURE__ */ new Set([
    ...moves.map((move) => move.taskId),
    ...backlog.map((item) => item.taskId)
  ]);
  return Object.freeze({
    repairRequired: true,
    successful: unresolvedOverloadMinutes === 0,
    feasibilityBefore,
    moves: Object.freeze(moves),
    backlog: Object.freeze(backlog),
    changedTaskCount: changedTaskIds.size,
    movedMinutes: moves.reduce(
      (sum2, move) => sum2 + move.remainingMinutes,
      0
    ),
    backlogMinutes: backlog.reduce(
      (sum2, item) => sum2 + item.remainingMinutes,
      0
    ),
    unresolvedOverloadMinutes,
    reasonCodes: Object.freeze(
      unresolvedOverloadMinutes === 0 ? [
        "MINIMUM_LOCAL_REPAIR_APPLIED"
      ] : [
        "LOCAL_REPAIR_INCOMPLETE"
      ]
    )
  });
}

// packages/domain/src/planning-v2/proposal-builder.ts
function defaultRepairScope(snapshot, repair) {
  if (!repair.repairRequired) {
    return "NO_REPLAN";
  }
  if (snapshot.meta.trigger === "CAPACITY_INCREASE" || snapshot.meta.trigger === "CAPACITY_DECREASE") {
    return "LOCAL_CAPACITY_REPAIR";
  }
  if (snapshot.meta.trigger === "MISSED_DAY") {
    return "MISSED_DAY_REPAIR";
  }
  return "LOCAL_TASK_REPAIR";
}
function deterministicProposalId(snapshot, scope) {
  return [
    "proposal-v1",
    snapshot.meta.snapshotId,
    snapshot.meta.trigger,
    scope
  ].join(":");
}
function buildLocalRepairProposalV1(input) {
  const { snapshot, repair } = input;
  const scope = input.scope ?? defaultRepairScope(
    snapshot,
    repair
  );
  const moves = Object.freeze(
    repair.moves.map(
      (move) => Object.freeze({
        taskId: move.taskId,
        fromDate: move.fromDate,
        toDate: move.toDate,
        reasonCodes: Object.freeze([
          ...move.reasonCodes
        ])
      })
    )
  );
  const backlog = Object.freeze(
    repair.backlog.map(
      (item) => Object.freeze({
        taskId: item.taskId,
        fromDate: item.fromDate,
        reasonCodes: Object.freeze([
          ...item.reasonCodes
        ])
      })
    )
  );
  const changedTaskIds = /* @__PURE__ */ new Set([
    ...moves.map((move) => move.taskId),
    ...backlog.map((item) => item.taskId)
  ]);
  const reasonCodes = !repair.repairRequired ? [
    "CURRENT_PLAN_ALREADY_FEASIBLE",
    "NO_REPLAN_REQUIRED"
  ] : repair.successful ? [
    "LOCAL_REPAIR_PROPOSAL",
    ...repair.reasonCodes
  ] : [
    "LOCAL_REPAIR_UNRESOLVED",
    ...repair.reasonCodes
  ];
  return Object.freeze({
    proposalId: deterministicProposalId(
      snapshot,
      scope
    ),
    snapshotId: snapshot.meta.snapshotId,
    userId: snapshot.userId,
    examProfileId: snapshot.examProfileId,
    trigger: snapshot.meta.trigger,
    scope,
    moves,
    creates: Object.freeze([]),
    cancels: Object.freeze([]),
    backlog,
    objectiveBefore: null,
    objectiveAfter: null,
    hardConstraintViolations: Object.freeze([]),
    changedTaskCount: changedTaskIds.size,
    versions: Object.freeze({
      ...snapshot.meta.versions
    }),
    /*
     * Builder never authorizes application.
     *
     * Only the orchestration pipeline may turn this true
     * after deterministic validation succeeds.
     */
    applyRecommended: false,
    reasonCodes: Object.freeze(reasonCodes)
  });
}

// packages/domain/src/planning-v2/proposal-validator.ts
var DEFAULT_PLAN_VALIDATION_POLICY_V1 = Object.freeze({
  maxAutomaticChangedTaskCount: 8,
  maxAutomaticChangedTaskFraction: 0.35
});
function violation(code, message, options = {}) {
  return Object.freeze({
    code,
    message,
    taskIds: Object.freeze([
      ...options.taskIds ?? []
    ]),
    date: options.date ?? null,
    blocking: options.blocking ?? true
  });
}
function automaticScope(proposal) {
  return proposal.scope !== "WEEKLY_REOPTIMIZATION" && proposal.scope !== "MANUAL_REPLAN";
}
function validatePolicy(policy) {
  if (!Number.isInteger(
    policy.maxAutomaticChangedTaskCount
  ) || policy.maxAutomaticChangedTaskCount < 0) {
    throw new Error(
      "maxAutomaticChangedTaskCount must be a non-negative integer"
    );
  }
  if (!Number.isFinite(
    policy.maxAutomaticChangedTaskFraction
  ) || policy.maxAutomaticChangedTaskFraction < 0 || policy.maxAutomaticChangedTaskFraction > 1) {
    throw new Error(
      "maxAutomaticChangedTaskFraction must be between 0 and 1"
    );
  }
}
function taskMutationIds(proposal) {
  return [
    ...proposal.moves.map(
      (item) => item.taskId
    ),
    ...proposal.cancels.map(
      (item) => item.taskId
    ),
    ...proposal.backlog.map(
      (item) => item.taskId
    )
  ];
}
function withinPlanningWindow(snapshot, date) {
  if (date < snapshot.meta.currentDate || date < snapshot.meta.weekStart || date > snapshot.meta.weekEnd) {
    return false;
  }
  if (snapshot.examDate !== null && date > snapshot.examDate) {
    return false;
  }
  return true;
}
function validatePlanProposalV1(input) {
  const {
    snapshot,
    proposal
  } = input;
  const policy = input.policy ?? DEFAULT_PLAN_VALIDATION_POLICY_V1;
  validatePolicy(policy);
  const violations = [];
  if (proposal.snapshotId !== snapshot.meta.snapshotId) {
    violations.push(
      violation(
        "SNAPSHOT_STALE",
        "Proposal was produced from a different planning snapshot."
      )
    );
  }
  if (proposal.userId !== snapshot.userId || proposal.examProfileId !== snapshot.examProfileId) {
    violations.push(
      violation(
        "OWNERSHIP_MISMATCH",
        "Proposal ownership does not match planning snapshot ownership."
      )
    );
  }
  const mutationIds = taskMutationIds(proposal);
  const mutationCounts = /* @__PURE__ */ new Map();
  for (const taskId of mutationIds) {
    mutationCounts.set(
      taskId,
      (mutationCounts.get(taskId) ?? 0) + 1
    );
  }
  const duplicateMutationIds = [...mutationCounts.entries()].filter(([, count]) => count > 1).map(([taskId]) => taskId).sort();
  if (duplicateMutationIds.length > 0) {
    violations.push(
      violation(
        "DUPLICATE_ACTIVITY",
        "The same task is mutated more than once in the proposal.",
        {
          taskIds: duplicateMutationIds
        }
      )
    );
  }
  const createdCandidateIds = proposal.creates.map(
    (item) => item.candidateId
  );
  if (new Set(createdCandidateIds).size !== createdCandidateIds.length) {
    violations.push(
      violation(
        "DUPLICATE_ACTIVITY",
        "The proposal contains duplicate candidate creations."
      )
    );
  }
  const uniqueChangedTasks = new Set(mutationIds);
  const actualChangedTaskCount = uniqueChangedTasks.size + proposal.creates.length;
  if (actualChangedTaskCount !== proposal.changedTaskCount) {
    violations.push(
      violation(
        "DUPLICATE_ACTIVITY",
        `changedTaskCount mismatch: proposal=${proposal.changedTaskCount}, actual=${actualChangedTaskCount}`,
        {
          taskIds: [
            ...uniqueChangedTasks
          ]
        }
      )
    );
  }
  const taskById = new Map(
    snapshot.existingTasks.map(
      (task) => [task.taskId, task]
    )
  );
  for (const move of proposal.moves) {
    const task = taskById.get(move.taskId);
    if (!task) {
      violations.push(
        violation(
          "OWNERSHIP_MISMATCH",
          `Unknown task in move: ${move.taskId}`,
          {
            taskIds: [move.taskId]
          }
        )
      );
      continue;
    }
    if (task.isCompleted) {
      violations.push(
        violation(
          "COMPLETED_TASK_MOVED",
          "Completed tasks are immutable.",
          {
            taskIds: [task.taskId]
          }
        )
      );
    }
    if (task.isActive) {
      violations.push(
        violation(
          "ACTIVE_TASK_MOVED",
          "Active tasks are immutable.",
          {
            taskIds: [task.taskId]
          }
        )
      );
    }
    if (task.plannedDate !== move.fromDate) {
      violations.push(
        violation(
          "SNAPSHOT_STALE",
          `Move source date no longer matches snapshot for ${task.taskId}.`,
          {
            taskIds: [task.taskId],
            date: move.fromDate
          }
        )
      );
    }
    if (!withinPlanningWindow(
      snapshot,
      move.toDate
    )) {
      violations.push(
        violation(
          "INVALID_DATE",
          `Move target date is outside the valid planning window: ${move.toDate}`,
          {
            taskIds: [task.taskId],
            date: move.toDate
          }
        )
      );
    }
    if (task.earliestAllowedDate !== null && move.toDate < task.earliestAllowedDate) {
      violations.push(
        violation(
          "INVALID_DATE",
          "Move violates earliest allowed task date.",
          {
            taskIds: [task.taskId],
            date: move.toDate
          }
        )
      );
    }
    if (task.latestAllowedDate !== null && move.toDate > task.latestAllowedDate) {
      violations.push(
        violation(
          "INVALID_DATE",
          "Move violates latest allowed task date.",
          {
            taskIds: [task.taskId],
            date: move.toDate
          }
        )
      );
    }
  }
  for (const item of [
    ...proposal.cancels,
    ...proposal.backlog
  ]) {
    const task = taskById.get(item.taskId);
    if (!task) {
      violations.push(
        violation(
          "OWNERSHIP_MISMATCH",
          `Unknown task mutation: ${item.taskId}`,
          {
            taskIds: [item.taskId]
          }
        )
      );
      continue;
    }
    if (task.isCompleted) {
      violations.push(
        violation(
          "COMPLETED_TASK_MOVED",
          "Completed tasks cannot be removed from their authoritative schedule state.",
          {
            taskIds: [task.taskId]
          }
        )
      );
    }
    if (task.isActive) {
      violations.push(
        violation(
          "ACTIVE_TASK_MOVED",
          "Active tasks cannot be removed from their authoritative schedule state.",
          {
            taskIds: [task.taskId]
          }
        )
      );
    }
  }
  for (const create of proposal.creates) {
    if (!withinPlanningWindow(
      snapshot,
      create.plannedDate
    )) {
      violations.push(
        violation(
          "INVALID_DATE",
          `Created activity date is outside the valid planning window: ${create.plannedDate}`,
          {
            date: create.plannedDate
          }
        )
      );
    }
    if (!Number.isFinite(
      create.estimatedMinutes
    ) || create.estimatedMinutes <= 0) {
      violations.push(
        violation(
          "INVALID_DATE",
          "Created activity must have positive estimated minutes.",
          {
            date: create.plannedDate
          }
        )
      );
    }
  }
  const scheduledTasks = /* @__PURE__ */ new Map();
  for (const task of snapshot.existingTasks) {
    scheduledTasks.set(
      task.taskId,
      {
        taskId: task.taskId,
        original: task,
        plannedDate: task.plannedDate,
        scheduled: !task.isCompleted && task.remainingMinutes > 0 && task.plannedDate !== null
      }
    );
  }
  for (const move of proposal.moves) {
    const state = scheduledTasks.get(
      move.taskId
    );
    if (state) {
      state.plannedDate = move.toDate;
      state.scheduled = true;
    }
  }
  for (const item of [
    ...proposal.cancels,
    ...proposal.backlog
  ]) {
    const state = scheduledTasks.get(
      item.taskId
    );
    if (state) {
      state.scheduled = false;
      state.plannedDate = null;
    }
  }
  const scheduledMinutesByDate = /* @__PURE__ */ new Map();
  for (const state of scheduledTasks.values()) {
    if (!state.scheduled || state.plannedDate === null) {
      continue;
    }
    scheduledMinutesByDate.set(
      state.plannedDate,
      (scheduledMinutesByDate.get(
        state.plannedDate
      ) ?? 0) + state.original.remainingMinutes
    );
  }
  for (const create of proposal.creates) {
    scheduledMinutesByDate.set(
      create.plannedDate,
      (scheduledMinutesByDate.get(
        create.plannedDate
      ) ?? 0) + create.estimatedMinutes
    );
  }
  const capacityByDate = new Map(
    snapshot.dailyCapacities.map(
      (day) => [day.date, day]
    )
  );
  for (const [
    date,
    scheduledMinutes
  ] of scheduledMinutesByDate) {
    const capacity = capacityByDate.get(date);
    if (!capacity) {
      violations.push(
        violation(
          "INVALID_DATE",
          `No capacity record exists for proposed date ${date}.`,
          {
            date
          }
        )
      );
      continue;
    }
    if (scheduledMinutes > capacity.remainingCapacityMinutes) {
      violations.push(
        violation(
          "DAILY_CAPACITY_EXCEEDED",
          `Proposed workload exceeds remaining capacity on ${date}.`,
          {
            date
          }
        )
      );
    }
  }
  const totalScheduledRemaining = [...scheduledMinutesByDate.values()].reduce(
    (sum2, minutes) => sum2 + minutes,
    0
  );
  const totalRemainingCapacity = snapshot.dailyCapacities.filter(
    (day) => day.date >= snapshot.meta.currentDate
  ).reduce(
    (sum2, day) => sum2 + day.remainingCapacityMinutes,
    0
  );
  if (totalScheduledRemaining > totalRemainingCapacity) {
    violations.push(
      violation(
        "WEEKLY_BUDGET_EXCEEDED",
        "Proposed remaining workload exceeds remaining weekly capacity."
      )
    );
  }
  if (automaticScope(proposal) && proposal.changedTaskCount > 0) {
    const denominator = Math.max(
      snapshot.existingTasks.length,
      1
    );
    const changedFraction = proposal.changedTaskCount / denominator;
    if (proposal.changedTaskCount > policy.maxAutomaticChangedTaskCount || changedFraction > policy.maxAutomaticChangedTaskFraction) {
      violations.push(
        violation(
          "MASS_CHANGE_GUARD",
          `Automatic proposal changes ${proposal.changedTaskCount} tasks (${(changedFraction * 100).toFixed(1)}%).`,
          {
            taskIds: [
              ...uniqueChangedTasks
            ]
          }
        )
      );
    }
  }
  return Object.freeze({
    valid: violations.every(
      (item) => !item.blocking
    ),
    violations: Object.freeze(violations)
  });
}

// packages/domain/src/planning-v2/planning-decision.ts
function finalizeProposal(proposal, applyRecommended, additionalReasonCode) {
  return Object.freeze({
    ...proposal,
    applyRecommended,
    reasonCodes: Object.freeze([
      ...proposal.reasonCodes,
      additionalReasonCode
    ])
  });
}
function decidePlanningActionV2(input) {
  const { snapshot } = input;
  const repair = repairCurrentPlanLocallyV1(
    snapshot
  );
  const preliminaryProposal = buildLocalRepairProposalV1({
    snapshot,
    repair
  });
  const validation = validatePlanProposalV1({
    snapshot,
    proposal: preliminaryProposal,
    policy: input.validationPolicy
  });
  if (!repair.repairRequired) {
    const proposal2 = finalizeProposal(
      preliminaryProposal,
      false,
      "DECISION_KEEP_EXISTING_PLAN"
    );
    return Object.freeze({
      decision: "KEEP_PLAN",
      snapshotId: snapshot.meta.snapshotId,
      repair,
      proposal: proposal2,
      validation,
      applyRecommended: false,
      reasonCodes: Object.freeze([
        "CURRENT_PLAN_FEASIBLE",
        "NO_MUTATION_REQUIRED"
      ])
    });
  }
  if (!repair.successful) {
    const proposal2 = finalizeProposal(
      preliminaryProposal,
      false,
      "DECISION_BLOCKED_REPAIR_UNRESOLVED"
    );
    return Object.freeze({
      decision: "BLOCKED",
      snapshotId: snapshot.meta.snapshotId,
      repair,
      proposal: proposal2,
      validation,
      applyRecommended: false,
      reasonCodes: Object.freeze([
        "LOCAL_REPAIR_UNRESOLVED",
        "NO_AUTOMATIC_MUTATION"
      ])
    });
  }
  if (!validation.valid) {
    const proposal2 = finalizeProposal(
      preliminaryProposal,
      false,
      "DECISION_BLOCKED_VALIDATION_FAILED"
    );
    return Object.freeze({
      decision: "BLOCKED",
      snapshotId: snapshot.meta.snapshotId,
      repair,
      proposal: proposal2,
      validation,
      applyRecommended: false,
      reasonCodes: Object.freeze([
        "PROPOSAL_VALIDATION_FAILED",
        "NO_AUTOMATIC_MUTATION"
      ])
    });
  }
  if (preliminaryProposal.changedTaskCount === 0) {
    const proposal2 = finalizeProposal(
      preliminaryProposal,
      false,
      "DECISION_KEEP_ZERO_CHANGE_PROPOSAL"
    );
    return Object.freeze({
      decision: "KEEP_PLAN",
      snapshotId: snapshot.meta.snapshotId,
      repair,
      proposal: proposal2,
      validation,
      applyRecommended: false,
      reasonCodes: Object.freeze([
        "ZERO_CHANGE_PROPOSAL",
        "NO_MUTATION_REQUIRED"
      ])
    });
  }
  const proposal = finalizeProposal(
    preliminaryProposal,
    true,
    "DECISION_VALIDATED_READY_TO_APPLY"
  );
  return Object.freeze({
    decision: "READY_TO_APPLY",
    snapshotId: snapshot.meta.snapshotId,
    repair,
    proposal,
    validation,
    applyRecommended: true,
    reasonCodes: Object.freeze([
      "LOCAL_REPAIR_SUCCESSFUL",
      "PROPOSAL_VALIDATED",
      "READY_FOR_ATOMIC_APPLY"
    ])
  });
}

// packages/domain/src/planning-v2/shadow-evaluation.ts
function sortedUnique(values) {
  return Object.freeze([...new Set(values)].sort((a, b) => a.localeCompare(b)));
}
function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}
function evaluatePlanningV2ShadowDecision(input) {
  const { snapshot, decision } = input;
  if (decision.snapshotId !== snapshot.meta.snapshotId || decision.proposal.snapshotId !== snapshot.meta.snapshotId) {
    throw new Error("decision does not belong to evaluation snapshot");
  }
  if (decision.decision === "KEEP_PLAN" && decision.proposal.changedTaskCount !== 0) {
    throw new Error("KEEP_PLAN decision cannot contain task changes");
  }
  const scheduledTasks = snapshot.existingTasks.filter(
    (task) => task.plannedDate !== null
  );
  const remainingTasks = snapshot.existingTasks.filter(
    (task) => !task.isCompleted && task.remainingMinutes > 0
  );
  const completedTasks = snapshot.existingTasks.filter(
    (task) => task.isCompleted
  );
  const partialTasks = snapshot.existingTasks.filter(
    (task) => task.isPartiallyCompleted
  );
  const movedTaskIds = sortedUnique(
    decision.proposal.moves.map((move) => move.taskId)
  );
  const backlogTaskIds = sortedUnique(
    decision.proposal.backlog.map((item) => item.taskId)
  );
  const changedExistingTaskIds = /* @__PURE__ */ new Set([
    ...movedTaskIds,
    ...backlogTaskIds,
    ...decision.proposal.cancels.map((cancel) => cancel.taskId)
  ]);
  const preservedTaskIds = sortedUnique(
    scheduledTasks.map((task) => task.taskId).filter((taskId) => !changedExistingTaskIds.has(taskId))
  );
  const mutationCount = (tasks) => tasks.filter((task) => changedExistingTaskIds.has(task.taskId)).length;
  const scheduledTaskCount = scheduledTasks.length;
  const changedTaskCount = decision.proposal.changedTaskCount;
  const feasibility = decision.repair.feasibilityBefore;
  const currentPlan = Object.freeze({
    feasible: feasibility.feasible,
    issueCodes: sortedUnique(
      feasibility.violations.map((violation2) => violation2.code)
    ),
    scheduledTaskCount,
    remainingTaskCount: remainingTasks.length,
    completedTaskCount: completedTasks.length,
    partialLifecycleTaskCount: partialTasks.length,
    remainingMinutes: sum(
      remainingTasks.map((task) => task.remainingMinutes)
    ),
    availableMinutes: snapshot.availableMinutes,
    planningBudgetMinutes: snapshot.planningBudgetMinutes,
    reserveMinutes: snapshot.reserveMinutes
  });
  const v2 = Object.freeze({
    decision: decision.decision,
    requestedScope: decision.proposal.scope,
    changedTaskCount,
    applyRecommended: decision.applyRecommended,
    validationValid: decision.validation.valid,
    validationIssueCodes: sortedUnique(
      decision.validation.violations.map((violation2) => violation2.code)
    ),
    movedTaskIds,
    backlogTaskIds,
    preservedTaskIds,
    decisionReasonCodes: Object.freeze([...decision.reasonCodes]),
    proposalReasonCodes: Object.freeze([...decision.proposal.reasonCodes])
  });
  const stability = Object.freeze({
    changeRatio: scheduledTaskCount === 0 ? 0 : changedTaskCount / scheduledTaskCount,
    completedTaskMutationCount: mutationCount(completedTasks),
    activeTaskMutationCount: mutationCount(
      snapshot.existingTasks.filter((task) => task.isActive)
    ),
    partialTaskMutationCount: mutationCount(partialTasks)
  });
  const capacity = Object.freeze({
    grossMinutes: sum(
      snapshot.dailyCapacities.map((day) => day.grossCapacityMinutes)
    ),
    reserveMinutes: sum(
      snapshot.dailyCapacities.map((day) => day.reserveMinutes)
    ),
    planningMinutes: sum(
      snapshot.dailyCapacities.map((day) => day.planningCapacityMinutes)
    ),
    remainingMinutes: sum(
      snapshot.dailyCapacities.map((day) => day.remainingCapacityMinutes)
    )
  });
  return Object.freeze({
    snapshotId: snapshot.meta.snapshotId,
    snapshotHash: snapshot.meta.snapshotHash,
    trigger: snapshot.meta.trigger,
    currentPlan,
    v2,
    stability,
    capacity
  });
}

// packages/domain/src/planning-v2/shadow-persistence.ts
function assertNonBlank2(name, value) {
  if (!value.trim()) {
    throw new Error(`${name} must not be blank`);
  }
}
function normalizeFingerprint(value) {
  if (value === void 0 || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
function planningV2SnapshotIdempotencyKey(snapshot) {
  return [
    "planning-v2-snapshot",
    snapshot.userId,
    snapshot.examProfileId,
    snapshot.meta.snapshotId,
    snapshot.meta.trigger,
    snapshot.meta.versions.plannerVersion
  ].join(":");
}
function planningV2ProposalIdempotencyKey(proposal) {
  return [
    "planning-v2-proposal",
    proposal.userId,
    proposal.examProfileId,
    proposal.proposalId,
    proposal.versions.plannerVersion
  ].join(":");
}
function planningV2ApplyDedupeKey(proposal) {
  return [
    "planning-v2-apply",
    proposal.userId,
    proposal.examProfileId,
    proposal.proposalId,
    proposal.versions.plannerVersion
  ].join(":");
}
function toPlanningV2SnapshotRow(snapshot, context = {}, snapshotHash) {
  const idempotencyKey = planningV2SnapshotIdempotencyKey(
    snapshot
  );
  return Object.freeze({
    user_id: snapshot.userId,
    exam_profile_id: snapshot.examProfileId,
    weekly_plan_id: context.weeklyPlanId ?? null,
    external_snapshot_id: snapshot.meta.snapshotId,
    snapshot_hash: normalizeFingerprint(
      snapshotHash
    ),
    idempotency_key: idempotencyKey,
    trigger_type: snapshot.meta.trigger,
    requested_scope: snapshot.meta.requestedScope,
    current_date: snapshot.meta.currentDate,
    week_start_date: snapshot.meta.weekStart,
    week_end_date: snapshot.meta.weekEnd,
    available_minutes: snapshot.availableMinutes,
    planning_budget_minutes: snapshot.planningBudgetMinutes,
    reserve_minutes: snapshot.reserveMinutes,
    source_plan_generation_version: context.sourcePlanGenerationVersion ?? null,
    planner_version: snapshot.meta.versions.plannerVersion,
    scoring_version: snapshot.meta.versions.scoringVersion,
    learner_state_version: snapshot.meta.versions.learnerStateVersion,
    snapshot_schema_version: snapshot.meta.versions.snapshotSchemaVersion,
    snapshot_payload: snapshot
  });
}
function statusForDecision(decision, validation) {
  if (decision === "BLOCKED" || !validation.valid) {
    return "blocked";
  }
  return "validated";
}
function toPlanningV2ProposalRow(input) {
  assertNonBlank2(
    "planningSnapshotDatabaseId",
    input.planningSnapshotDatabaseId
  );
  if (input.proposal.snapshotId !== input.snapshot.meta.snapshotId) {
    throw new Error(
      "proposal snapshot does not match persistence snapshot"
    );
  }
  if (input.proposal.userId !== input.snapshot.userId || input.proposal.examProfileId !== input.snapshot.examProfileId) {
    throw new Error(
      "proposal ownership does not match persistence snapshot"
    );
  }
  const idempotencyKey = planningV2ProposalIdempotencyKey(
    input.proposal
  );
  return Object.freeze({
    user_id: input.proposal.userId,
    exam_profile_id: input.proposal.examProfileId,
    weekly_plan_id: input.weeklyPlanId ?? null,
    planning_snapshot_id: input.planningSnapshotDatabaseId,
    external_proposal_id: input.proposal.proposalId,
    idempotency_key: idempotencyKey,
    trigger_type: input.proposal.trigger,
    scope: input.proposal.scope,
    decision: input.decision,
    status: statusForDecision(
      input.decision,
      input.validation
    ),
    changed_task_count: input.proposal.changedTaskCount,
    apply_recommended: input.proposal.applyRecommended,
    validation_valid: input.validation.valid,
    objective_before: input.proposal.objectiveBefore,
    objective_after: input.proposal.objectiveAfter,
    reason_codes: Object.freeze([
      ...input.proposal.reasonCodes
    ]),
    proposal_payload: input.proposal,
    validation_payload: input.validation,
    planner_version: input.proposal.versions.plannerVersion,
    scoring_version: input.proposal.versions.scoringVersion,
    learner_state_version: input.proposal.versions.learnerStateVersion,
    /*
     * Generated now but NOT executed in shadow mode.
     * Later this can be passed to existing apply_plan_revision().
     */
    apply_dedupe_key: input.decision === "READY_TO_APPLY" && input.validation.valid ? planningV2ApplyDedupeKey(
      input.proposal
    ) : null
  });
}

// packages/domain/src/planning-v2/canonical-shadow.ts
var CANONICAL_PLANNER_V2_VERSION = "canonical-planner-v2-shadow-v1";
var ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
function assertIsoDate2(name, value) {
  const parsed = /* @__PURE__ */ new Date(`${value}T00:00:00Z`);
  if (!ISO_DATE.test(value) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${name} must be a valid YYYY-MM-DD date`);
  }
}
function assertNonNegativeInteger2(name, value) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
}
function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, nested]) => [key, stableValue(nested)])
    );
  }
  return value;
}
function stableCanonicalPlannerJson(value) {
  return JSON.stringify(stableValue(value));
}
async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function datesBetween(start, end) {
  const dates = [];
  const cursor = /* @__PURE__ */ new Date(`${start}T00:00:00Z`);
  const last = /* @__PURE__ */ new Date(`${end}T00:00:00Z`);
  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}
function stageRank(stage) {
  if (stage === "learn") return 0;
  if (stage === "practice") return 1;
  if (stage === "review") return 2;
  if (stage === "reinforcement") return 3;
  return 4;
}
function compareDemand(left, right) {
  return right.userPriority - left.userPriority || Number(right.alreadyStarted) - Number(left.alreadyStarted) || stageRank(left.learningStage) - stageRank(right.learningStage) || left.latestDate.localeCompare(right.latestDate) || left.curriculumOrder - right.curriculumOrder || left.canonicalWorkloadIdentity.localeCompare(right.canonicalWorkloadIdentity) || left.demandId.localeCompare(right.demandId);
}
function block(demand, reason, facts) {
  return Object.freeze({
    demandId: demand.demandId,
    canonicalWorkloadIdentity: demand.canonicalWorkloadIdentity,
    materialViewId: demand.workload.materialViewId,
    resourceId: demand.workload.resourceId,
    curriculumNodeId: demand.curriculumNodeId,
    remainingAmount: demand.workload.remainingAmount,
    remainingUnit: demand.workload.remainingUnit,
    blockedReason: reason,
    unresolvedWorkloadReason: demand.workload.unresolvedWorkloadReason,
    explanationFacts: Object.freeze([...facts])
  });
}
function normalizedFingerprintInput(input) {
  return {
    ...input,
    dailyCapacities: [...input.dailyCapacities].sort((a, b) => a.date.localeCompare(b.date)),
    commitments: [...input.commitments].sort((a, b) => a.commitmentId.localeCompare(b.commitmentId)),
    demands: [...input.demands].sort((a, b) => a.demandId.localeCompare(b.demandId)).map((demand) => ({
      ...demand,
      prerequisiteWorkloadIdentities: [...demand.prerequisiteWorkloadIdentities].sort(),
      sourceProvenance: [...demand.sourceProvenance].sort()
    })),
    completedWorkloadIdentities: [...input.completedWorkloadIdentities].sort()
  };
}
async function buildCanonicalPlannerV2Proposal(input) {
  if (!input.userId || !input.examProfileId || !input.progressVersion) throw new Error("planner identity and progressVersion are required");
  assertIsoDate2("currentDate", input.currentDate);
  assertIsoDate2("horizonStart", input.horizonStart);
  assertIsoDate2("horizonEnd", input.horizonEnd);
  if (input.horizonStart > input.horizonEnd) throw new Error("invalid planning horizon");
  if (input.policy.plannerVersion !== CANONICAL_PLANNER_V2_VERSION || input.policy.protectCurrentDay !== true || input.policy.materialSplitting !== "whole_canonical_workload_only" || input.policy.orderingPolicy !== "user_priority_continuation_stage_curriculum_stable_id") {
    throw new Error("unsupported canonical planner policy");
  }
  const horizonDates = datesBetween(input.horizonStart, input.horizonEnd);
  const capacityByDate = /* @__PURE__ */ new Map();
  for (const day of input.dailyCapacities) {
    assertIsoDate2("capacity.date", day.date);
    assertNonNegativeInteger2("configuredCapacityMinutes", day.configuredCapacityMinutes);
    assertNonNegativeInteger2("alreadyStudiedMinutes", day.alreadyStudiedMinutes);
    if (day.date < input.horizonStart || day.date > input.horizonEnd) throw new Error("capacity outside planning horizon");
    if (capacityByDate.has(day.date)) throw new Error(`duplicate capacity date: ${day.date}`);
    capacityByDate.set(day.date, day);
  }
  if (horizonDates.some((date) => !capacityByDate.has(date))) throw new Error("daily capacity missing inside horizon");
  const commitmentsByDate = /* @__PURE__ */ new Map();
  const inProgressIdentities = /* @__PURE__ */ new Set();
  for (const commitment of input.commitments) {
    assertNonNegativeInteger2("commitment.minutes", commitment.minutes);
    if (commitment.date !== null) {
      assertIsoDate2("commitment.date", commitment.date);
      const list = commitmentsByDate.get(commitment.date) ?? [];
      list.push(commitment);
      commitmentsByDate.set(commitment.date, list);
    }
    if (commitment.classification === "in_progress" && commitment.canonicalWorkloadIdentity) {
      inProgressIdentities.add(commitment.canonicalWorkloadIdentity);
    }
  }
  const mutableDays = /* @__PURE__ */ new Map();
  for (const date of horizonDates) {
    const capacity2 = capacityByDate.get(date);
    const protectedCommitments = (commitmentsByDate.get(date) ?? []).filter((item) => item.occupiesCapacity).sort((a, b) => a.commitmentId.localeCompare(b.commitmentId));
    const protectedMinutes = protectedCommitments.reduce((sum2, item) => sum2 + item.minutes, 0);
    const rawAvailable = capacity2.configuredCapacityMinutes - capacity2.alreadyStudiedMinutes - protectedMinutes;
    const available = Math.max(0, rawAvailable);
    const overcommitted = Math.max(0, -rawAvailable);
    mutableDays.set(date, { input: capacity2, protectedCommitments, protectedMinutes, overcommitted, available, planned: 0, scheduled: [] });
  }
  const completed = new Set(input.completedWorkloadIdentities);
  const completedDemandIds = [];
  const blocked = [];
  const unmet = [];
  const pending = [];
  const seenDemandIds = /* @__PURE__ */ new Set();
  const bestByWorkload = /* @__PURE__ */ new Map();
  for (const demand of [...input.demands].sort(compareDemand)) {
    if (!demand.demandId || !demand.canonicalWorkloadIdentity) throw new Error("demand identity required");
    if (seenDemandIds.has(demand.demandId)) throw new Error(`duplicate demand id: ${demand.demandId}`);
    seenDemandIds.add(demand.demandId);
    assertIsoDate2("demand.earliestDate", demand.earliestDate);
    assertIsoDate2("demand.latestDate", demand.latestDate);
    if (demand.earliestDate > demand.latestDate) {
      blocked.push(block(demand, "invalid_date_window", ["earliest_date_after_latest_date"]));
      continue;
    }
    const previous = bestByWorkload.get(demand.canonicalWorkloadIdentity);
    if (previous) {
      blocked.push(block(demand, "duplicate_canonical_workload_identity", [`selected:${previous.demandId}`]));
      continue;
    }
    bestByWorkload.set(demand.canonicalWorkloadIdentity, demand);
    if (completed.has(demand.canonicalWorkloadIdentity) || demand.workload.remainingAmount === 0 || demand.workload.estimatedMinutes === 0) {
      completedDemandIds.push(demand.demandId);
      completed.add(demand.canonicalWorkloadIdentity);
      continue;
    }
    if (inProgressIdentities.has(demand.canonicalWorkloadIdentity)) {
      blocked.push(block(demand, "already_in_progress", ["existing_in_progress_commitment"]));
      continue;
    }
    if (!demand.workload.plannerEligible || demand.workload.estimatedMinutes === null || demand.workload.workloadAuthority === "unknown") {
      blocked.push(block(demand, demand.workload.unresolvedWorkloadReason ?? "canonical_workload_ineligible", ["planner_eligible_false"]));
      continue;
    }
    if (!demand.learningStageAllowed) {
      blocked.push(block(demand, "learning_stage_blocked", [demand.learningStageReason]));
      continue;
    }
    if (!Number.isInteger(demand.workload.estimatedMinutes) || demand.workload.estimatedMinutes <= 0) {
      blocked.push(block(demand, "invalid_canonical_duration", ["positive_integer_minutes_required"]));
      continue;
    }
    if (demand.boundary === null) {
      blocked.push(block(demand, "authoritative_material_boundary_unavailable", ["whole_workload_boundary_required"]));
      continue;
    }
    pending.push(demand);
  }
  const scheduledIdentities = /* @__PURE__ */ new Set();
  let remaining = [...pending].sort(compareDemand);
  while (remaining.length) {
    let progressed = false;
    const next = [];
    for (const demand of remaining) {
      const unmetPrerequisites = demand.prerequisiteWorkloadIdentities.filter(
        (identity) => !completed.has(identity) && !scheduledIdentities.has(identity)
      );
      const prerequisitesStillPending = unmetPrerequisites.some(
        (identity) => remaining.some((candidate) => candidate.canonicalWorkloadIdentity === identity)
      );
      if (prerequisitesStillPending) {
        next.push(demand);
        continue;
      }
      if (unmetPrerequisites.length) {
        unmet.push(Object.freeze({
          demandId: demand.demandId,
          canonicalWorkloadIdentity: demand.canonicalWorkloadIdentity,
          materialViewId: demand.workload.materialViewId,
          estimatedMinutes: demand.workload.estimatedMinutes,
          reason: "prerequisite_unsatisfied"
        }));
        progressed = true;
        continue;
      }
      const earliest = demand.earliestDate > input.horizonStart ? demand.earliestDate : input.horizonStart;
      const latest = demand.latestDate < input.horizonEnd ? demand.latestDate : input.horizonEnd;
      const eligibleDates = horizonDates.filter(
        (date) => date >= earliest && date <= latest && date > input.currentDate
      );
      const day = eligibleDates.map((date) => mutableDays.get(date)).find((candidate) => candidate.available - candidate.planned >= demand.workload.estimatedMinutes);
      if (!day) {
        unmet.push(Object.freeze({
          demandId: demand.demandId,
          canonicalWorkloadIdentity: demand.canonicalWorkloadIdentity,
          materialViewId: demand.workload.materialViewId,
          estimatedMinutes: demand.workload.estimatedMinutes,
          reason: "insufficient_contiguous_capacity"
        }));
        progressed = true;
        continue;
      }
      const item = Object.freeze({
        demandId: demand.demandId,
        title: demand.title,
        canonicalWorkloadIdentity: demand.canonicalWorkloadIdentity,
        materialViewId: demand.workload.materialViewId,
        resourceId: demand.workload.resourceId,
        subjectId: demand.workload.subjectId,
        curriculumNodeId: demand.curriculumNodeId,
        materialType: demand.workload.materialType,
        plannedDate: day.input.date,
        estimatedMinutes: demand.workload.estimatedMinutes,
        workloadAuthority: demand.workload.workloadAuthority,
        workloadConfidence: demand.workload.workloadConfidence,
        boundary: demand.boundary,
        learningStage: demand.learningStage,
        reasonCodes: Object.freeze([
          "canonical_workload_eligible",
          "whole_boundary_fit",
          ...demand.alreadyStarted ? ["continuation_preference"] : [],
          demand.learningStageReason
        ]),
        sourceProvenance: Object.freeze([...demand.sourceProvenance].sort())
      });
      day.scheduled.push(item);
      day.planned += item.estimatedMinutes;
      scheduledIdentities.add(demand.canonicalWorkloadIdentity);
      progressed = true;
    }
    if (!progressed) {
      for (const demand of next) {
        unmet.push(Object.freeze({
          demandId: demand.demandId,
          canonicalWorkloadIdentity: demand.canonicalWorkloadIdentity,
          materialViewId: demand.workload.materialViewId,
          estimatedMinutes: demand.workload.estimatedMinutes,
          reason: "prerequisite_unsatisfied"
        }));
      }
      break;
    }
    remaining = next.sort(compareDemand);
  }
  const dailyPlans = Object.freeze(horizonDates.map((date) => {
    const day = mutableDays.get(date);
    const plannedMinutes = day.scheduled.reduce((sum2, item) => sum2 + item.estimatedMinutes, 0);
    return Object.freeze({
      date,
      configuredCapacityMinutes: day.input.configuredCapacityMinutes,
      alreadyStudiedMinutes: day.input.alreadyStudiedMinutes,
      protectedCommitmentMinutes: day.protectedMinutes,
      overcommittedMinutes: day.overcommitted,
      availableMinutes: day.available,
      plannedMinutes,
      unusedMinutes: day.available - plannedMinutes,
      protectedCommitmentIds: Object.freeze(day.protectedCommitments.map((item) => item.commitmentId)),
      scheduledItems: Object.freeze([...day.scheduled])
    });
  }));
  const scheduledItems = Object.freeze(dailyPlans.flatMap((day) => day.scheduledItems));
  const capacity = Object.freeze({
    configuredMinutes: dailyPlans.reduce((sum2, day) => sum2 + day.configuredCapacityMinutes, 0),
    alreadyStudiedMinutes: dailyPlans.reduce((sum2, day) => sum2 + day.alreadyStudiedMinutes, 0),
    protectedCommitmentMinutes: dailyPlans.reduce((sum2, day) => sum2 + day.protectedCommitmentMinutes, 0),
    overcommittedMinutes: dailyPlans.reduce((sum2, day) => sum2 + day.overcommittedMinutes, 0),
    availableMinutes: dailyPlans.reduce((sum2, day) => sum2 + day.availableMinutes, 0),
    plannedMinutes: scheduledItems.reduce((sum2, item) => sum2 + item.estimatedMinutes, 0),
    unusedMinutes: dailyPlans.reduce((sum2, day) => sum2 + day.unusedMinutes, 0),
    unmetEligibleMinutes: unmet.reduce((sum2, item) => sum2 + item.estimatedMinutes, 0)
  });
  const snapshotFingerprint = await sha256(stableCanonicalPlannerJson(normalizedFingerprintInput(input)));
  const proposalPayload = {
    snapshotFingerprint,
    scheduledItems,
    blockedDemands: blocked,
    unmetEligibleDemand: unmet,
    completedDemandIds: [...completedDemandIds].sort(),
    capacity
  };
  const proposalFingerprint = await sha256(stableCanonicalPlannerJson(proposalPayload));
  const warnings = [
    ...blocked.length ? ["BLOCKED_CANONICAL_DEMAND_PRESENT"] : [],
    ...unmet.length ? ["UNMET_ELIGIBLE_DEMAND_PRESENT"] : [],
    ...capacity.overcommittedMinutes ? ["PROTECTED_COMMITMENTS_EXCEED_CONFIGURED_CAPACITY"] : [],
    ...input.policy.protectCurrentDay ? ["CURRENT_DAY_PROTECTED"] : []
  ];
  const proposal = Object.freeze({
    proposalId: `canonical-planner-v2:${proposalFingerprint.slice(0, 24)}`,
    snapshotFingerprint,
    proposalFingerprint,
    plannerVersion: CANONICAL_PLANNER_V2_VERSION,
    userId: input.userId,
    examProfileId: input.examProfileId,
    currentDate: input.currentDate,
    horizonStart: input.horizonStart,
    horizonEnd: input.horizonEnd,
    dailyPlans,
    scheduledItems,
    blockedDemands: Object.freeze(blocked),
    unmetEligibleDemand: Object.freeze(unmet),
    completedDemandIds: Object.freeze([...completedDemandIds].sort()),
    capacity,
    warnings: Object.freeze(warnings),
    explanationFacts: Object.freeze([
      "deterministic_whole_workload_first_fit",
      "user_priority_before_optimizer_preferences",
      "unknown_workload_never_scheduled",
      "current_day_existing_plan_protected",
      "proposal_only_no_apply_authority"
    ]),
    applyAllowed: false
  });
  assertCanonicalPlannerV2Proposal(proposal);
  return proposal;
}
function assertCanonicalPlannerV2Proposal(proposal) {
  const identities = /* @__PURE__ */ new Set();
  let planned = 0;
  for (const day of proposal.dailyPlans) {
    assertNonNegativeInteger2("day.availableMinutes", day.availableMinutes);
    assertNonNegativeInteger2("day.plannedMinutes", day.plannedMinutes);
    assertNonNegativeInteger2("day.overcommittedMinutes", day.overcommittedMinutes);
    if (day.date < proposal.horizonStart || day.date > proposal.horizonEnd) throw new Error("scheduled day outside proposal horizon");
    if (day.availableMinutes !== Math.max(0, day.configuredCapacityMinutes - day.alreadyStudiedMinutes - day.protectedCommitmentMinutes)) {
      throw new Error("daily available capacity does not reconcile");
    }
    if (day.overcommittedMinutes !== Math.max(0, day.alreadyStudiedMinutes + day.protectedCommitmentMinutes - day.configuredCapacityMinutes)) {
      throw new Error("daily overcommit does not reconcile");
    }
    if (day.unusedMinutes !== day.availableMinutes - day.plannedMinutes) throw new Error("daily unused minutes do not reconcile");
    if (day.plannedMinutes > day.availableMinutes) throw new Error("canonical planner capacity overflow");
    const daySum = day.scheduledItems.reduce((sum2, item) => sum2 + item.estimatedMinutes, 0);
    if (daySum !== day.plannedMinutes) throw new Error("daily planned minutes do not reconcile");
    for (const item of day.scheduledItems) {
      if (!Number.isInteger(item.estimatedMinutes) || item.estimatedMinutes <= 0) throw new Error("scheduled minutes must be positive integers");
      if (item.workloadAuthority === "unknown") throw new Error("unknown workload scheduled");
      if (item.plannedDate !== day.date) throw new Error("scheduled item day mismatch");
      if (item.plannedDate <= proposal.currentDate) throw new Error("current or past day received new canonical work");
      if (identities.has(item.canonicalWorkloadIdentity)) throw new Error("duplicate canonical workload scheduled");
      identities.add(item.canonicalWorkloadIdentity);
      planned += item.estimatedMinutes;
    }
  }
  if (planned !== proposal.capacity.plannedMinutes || planned !== proposal.scheduledItems.reduce((sum2, item) => sum2 + item.estimatedMinutes, 0)) {
    throw new Error("whole-horizon planned minutes do not reconcile");
  }
  if (proposal.capacity.plannedMinutes > proposal.capacity.availableMinutes) throw new Error("whole-horizon capacity overflow");
  if (proposal.capacity.unusedMinutes !== proposal.capacity.availableMinutes - proposal.capacity.plannedMinutes) throw new Error("whole-horizon unused minutes do not reconcile");
  if (proposal.capacity.overcommittedMinutes !== proposal.dailyPlans.reduce((sum2, day) => sum2 + day.overcommittedMinutes, 0)) throw new Error("whole-horizon overcommit does not reconcile");
  if (proposal.applyAllowed !== false) throw new Error("W5 proposal cannot authorize apply");
}
function compareCanonicalPlannerV2Shadow(input, proposal, legacyItems) {
  const legacy = legacyItems.filter((item) => !item.completed);
  const legacyPlannedMinutes = legacy.reduce((sum2, item) => sum2 + Math.max(0, item.estimatedMinutes), 0);
  const exactCapacityMinutes = Math.max(
    0,
    proposal.capacity.configuredMinutes - proposal.capacity.alreadyStudiedMinutes
  );
  const v2OccupiedMinutes = proposal.capacity.protectedCommitmentMinutes + proposal.capacity.plannedMinutes;
  const legacyByIdentity = new Map(legacy.filter((item) => item.canonicalWorkloadIdentity).map((item) => [item.canonicalWorkloadIdentity, item]));
  const v2ByIdentity = new Map(proposal.scheduledItems.map((item) => [item.canonicalWorkloadIdentity, item]));
  const comparable = [...v2ByIdentity.keys()].filter((identity) => legacyByIdentity.has(identity));
  const days = proposal.dailyPlans.map((day) => {
    const legacyDay = legacy.filter((item) => item.plannedDate === day.date);
    return Object.freeze({
      date: day.date,
      legacyItems: legacyDay.length,
      legacyMinutes: legacyDay.reduce((sum2, item) => sum2 + item.estimatedMinutes, 0),
      v2Items: day.scheduledItems.length,
      v2Minutes: day.plannedMinutes
    });
  });
  const scheduledIdentityCount = new Set(proposal.scheduledItems.map((item) => item.canonicalWorkloadIdentity)).size;
  return Object.freeze({
    capacity: Object.freeze({
      exactCapacityMinutes,
      legacyPlannedMinutes,
      v2PlannedMinutes: proposal.capacity.plannedMinutes,
      legacyOverflowMinutes: Math.max(0, legacyPlannedMinutes - exactCapacityMinutes),
      v2OverflowMinutes: Math.max(0, v2OccupiedMinutes - exactCapacityMinutes),
      v2UnusedMinutes: proposal.capacity.unusedMinutes
    }),
    workload: Object.freeze({
      canonicalEligibleDemandMinutes: [...new Map(
        input.demands.filter((item) => item.workload.plannerEligible && item.workload.estimatedMinutes !== null && !input.completedWorkloadIdentities.includes(item.canonicalWorkloadIdentity)).map((item) => [item.canonicalWorkloadIdentity, Number(item.workload.estimatedMinutes)])
      ).values()].reduce((sum2, minutes) => sum2 + minutes, 0),
      scheduledEligibleDemandMinutes: proposal.capacity.plannedMinutes,
      unmetEligibleDemandMinutes: proposal.capacity.unmetEligibleMinutes,
      blockedUnknownDemandCount: proposal.blockedDemands.filter((item) => item.unresolvedWorkloadReason?.includes("pace") || item.blockedReason.includes("pace")).length,
      blockedMappingDemandCount: proposal.blockedDemands.filter((item) => item.blockedReason.includes("mapping") || item.unresolvedWorkloadReason?.includes("mapping")).length
    }),
    material: Object.freeze({
      exactYoutubeScheduled: proposal.scheduledItems.filter((item) => item.boundary.kind === "full_video" && item.workloadAuthority === "exact").length,
      physicalCalibratedScheduled: proposal.scheduledItems.filter((item) => item.boundary.kind === "physical_pages" && item.workloadAuthority === "calibrated").length,
      duplicateMaterialIdentities: proposal.scheduledItems.length - scheduledIdentityCount,
      completedMaterialMistakenlyPlanned: proposal.scheduledItems.filter((item) => input.completedWorkloadIdentities.includes(item.canonicalWorkloadIdentity)).length,
      unknownWorkloadScheduledCount: proposal.scheduledItems.filter((item) => item.workloadAuthority === "unknown").length
    }),
    plan: Object.freeze({
      days: Object.freeze(days),
      legacyOnlyItems: legacy.filter((item) => !item.canonicalWorkloadIdentity || !v2ByIdentity.has(item.canonicalWorkloadIdentity)).length,
      v2OnlyItems: proposal.scheduledItems.filter((item) => !legacyByIdentity.has(item.canonicalWorkloadIdentity)).length,
      comparableMatches: comparable.length,
      orderingDifferences: comparable.filter((identity) => legacyByIdentity.get(identity).plannedDate !== v2ByIdentity.get(identity).plannedDate).length
    }),
    safety: Object.freeze({
      currentDayProtectedDifferences: proposal.scheduledItems.filter((item) => item.plannedDate === input.currentDate).length,
      capacityViolations: proposal.dailyPlans.filter((day) => day.plannedMinutes > day.availableMinutes || day.overcommittedMinutes > 0).length,
      staleOrUnknownViolations: proposal.scheduledItems.filter((item) => item.workloadAuthority === "unknown").length,
      duplicateViolations: proposal.scheduledItems.length - scheduledIdentityCount
    })
  });
}

// packages/domain/src/planning-v2/proposal-lifecycle.ts
var PLANNER_V2_LIFECYCLE_VERSION = "planner-v2-lifecycle-v1";
var LIFECYCLE_TRANSITIONS = Object.freeze({
  generated: Object.freeze({ preview: "previewed", reject: "rejected", expire: "expired" }),
  previewed: Object.freeze({ confirm: "confirmed", mark_stale: "stale", reject: "rejected", expire: "expired" }),
  confirmed: Object.freeze({ apply: "applied", mark_stale: "stale", reject: "rejected", expire: "expired" }),
  applied: Object.freeze({ apply: "applied" }),
  stale: Object.freeze({}),
  rejected: Object.freeze({}),
  expired: Object.freeze({})
});
function transitionPlannerV2ProposalState(current, event) {
  const next = LIFECYCLE_TRANSITIONS[current][event];
  if (!next) throw new Error(`PLANNER_V2_INVALID_LIFECYCLE_TRANSITION:${current}:${event}`);
  return next;
}
async function sha2562(value) {
  const bytes = new TextEncoder().encode(stableCanonicalPlannerJson(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function sorted(values, key) {
  return [...values].sort((left, right) => key(left).localeCompare(key(right)));
}
async function fingerprintPlannerV2SnapshotComponents(input, snapshotFingerprint) {
  const tasks = sorted(input.commitments, (item) => item.commitmentId).map((item) => ({
    id: item.commitmentId,
    date: item.date,
    minutes: item.minutes,
    classification: item.classification,
    canonicalWorkloadIdentity: item.canonicalWorkloadIdentity,
    source: item.source
  }));
  const workload = sorted(input.demands, (item) => item.demandId).map((item) => ({
    demandId: item.demandId,
    canonicalWorkloadIdentity: item.canonicalWorkloadIdentity,
    workload: item.workload,
    boundary: item.boundary,
    learningStage: item.learningStage,
    learningStageAllowed: item.learningStageAllowed,
    userPriority: item.userPriority,
    curriculumOrder: item.curriculumOrder,
    earliestDate: item.earliestDate,
    latestDate: item.latestDate,
    prerequisites: [...item.prerequisiteWorkloadIdentities].sort()
  }));
  return Object.freeze({
    snapshotFingerprint,
    capacityFingerprint: await sha2562(sorted(input.dailyCapacities, (item) => item.date)),
    progressFingerprint: await sha2562({
      progressVersion: input.progressVersion,
      completed: [...input.completedWorkloadIdentities].sort()
    }),
    taskStateFingerprint: await sha2562(tasks),
    workloadFingerprint: await sha2562(workload),
    commitmentFingerprint: await sha2562(tasks.filter((item) => ["in_progress", "protected_current_day", "locked", "manual"].includes(item.classification))),
    policyFingerprint: await sha2562({
      userId: input.userId,
      examProfileId: input.examProfileId,
      currentDate: input.currentDate,
      horizonStart: input.horizonStart,
      horizonEnd: input.horizonEnd,
      policy: input.policy
    })
  });
}
function replacementScope(proposal, tasks) {
  const retained = [];
  const replaceable = [];
  const outside = [];
  for (const task of sorted(tasks, (item) => item.taskId)) {
    if (!task.plannedDate || task.plannedDate < proposal.horizonStart || task.plannedDate > proposal.horizonEnd) {
      outside.push(task.taskId);
    } else if (task.plannedDate > proposal.currentDate && task.classification === "future_replaceable_generated") {
      replaceable.push(task.taskId);
    } else {
      retained.push(task.taskId);
    }
  }
  return Object.freeze({
    retainedTaskIds: Object.freeze(retained),
    replaceableTaskIds: Object.freeze(replaceable),
    outsideScopeTaskIds: Object.freeze(outside)
  });
}
function buildPlannerV2Preview(proposal, tasks) {
  const scope = replacementScope(proposal, tasks);
  const facts = [];
  for (const day of proposal.dailyPlans) {
    facts.push(Object.freeze({ kind: "day_capacity", date: day.date, availableMinutes: day.availableMinutes }));
    if (day.date === proposal.currentDate) {
      facts.push(Object.freeze({
        kind: "current_day_protected",
        date: day.date,
        commitmentIds: Object.freeze([...day.protectedCommitmentIds])
      }));
    }
    if (day.unusedMinutes > 0 && proposal.unmetEligibleDemand.length > 0) {
      facts.push(Object.freeze({
        kind: "unused_capacity",
        date: day.date,
        unusedMinutes: day.unusedMinutes,
        reason: "next_indivisible_workload_does_not_fit"
      }));
    }
  }
  for (const item of proposal.scheduledItems.filter((candidate) => candidate.reasonCodes.includes("continuation_preference"))) {
    facts.push(Object.freeze({ kind: "continuation_selected", canonicalWorkloadIdentity: item.canonicalWorkloadIdentity }));
  }
  for (const item of proposal.blockedDemands) {
    facts.push(Object.freeze({ kind: "blocked_workload", canonicalWorkloadIdentity: item.canonicalWorkloadIdentity, reason: item.blockedReason }));
  }
  facts.push(Object.freeze({
    kind: "replacement_scope",
    replaceableTaskIds: scope.replaceableTaskIds,
    retainedTaskIds: scope.retainedTaskIds
  }));
  return Object.freeze({
    lifecycleVersion: PLANNER_V2_LIFECYCLE_VERSION,
    state: "previewed",
    proposalId: proposal.proposalId,
    proposalFingerprint: proposal.proposalFingerprint,
    snapshotFingerprint: proposal.snapshotFingerprint,
    plannerVersion: proposal.plannerVersion,
    userId: proposal.userId,
    examProfileId: proposal.examProfileId,
    horizon: Object.freeze({ start: proposal.horizonStart, end: proposal.horizonEnd }),
    summary: Object.freeze({
      totalAvailableMinutes: proposal.capacity.availableMinutes,
      protectedMinutes: proposal.capacity.protectedCommitmentMinutes,
      newlyPlannedMinutes: proposal.capacity.plannedMinutes,
      unusedMinutes: proposal.capacity.unusedMinutes,
      unmetEligibleMinutes: proposal.capacity.unmetEligibleMinutes,
      blockedDemandCount: proposal.blockedDemands.length
    }),
    days: Object.freeze(proposal.dailyPlans.map((day) => Object.freeze({
      date: day.date,
      configuredCapacityMinutes: day.configuredCapacityMinutes,
      availableMinutes: day.availableMinutes,
      protectedMinutes: day.protectedCommitmentMinutes,
      proposedMinutes: day.plannedMinutes,
      unusedMinutes: day.unusedMinutes,
      warnings: Object.freeze([
        ...day.overcommittedMinutes > 0 ? ["PROTECTED_OVERCOMMIT"] : [],
        ...day.date === proposal.currentDate ? ["CURRENT_DAY_PROTECTED"] : []
      ]),
      items: day.scheduledItems
    }))),
    blocked: proposal.blockedDemands,
    differences: Object.freeze({
      createCanonicalWorkloadIdentities: Object.freeze(proposal.scheduledItems.map((item) => item.canonicalWorkloadIdentity)),
      ...scope
    }),
    explanationFacts: Object.freeze(facts),
    explicitConfirmationRequired: true,
    applyAvailable: false
  });
}
function confirmPlannerV2Preview(input) {
  const expected = input.preview;
  if (input.userId !== expected.userId || input.examProfileId !== expected.examProfileId) throw new Error("PLANNER_V2_CONFIRMATION_OWNERSHIP_MISMATCH");
  if (input.proposalId !== expected.proposalId || input.proposalFingerprint !== expected.proposalFingerprint || input.snapshotFingerprint !== expected.snapshotFingerprint || input.plannerVersion !== expected.plannerVersion) throw new Error("PLANNER_V2_CONFIRMATION_IDENTITY_MISMATCH");
  if (Number.isNaN(new Date(input.confirmedAt).getTime())) throw new Error("PLANNER_V2_CONFIRMATION_TIMESTAMP_INVALID");
  return Object.freeze({
    lifecycleVersion: PLANNER_V2_LIFECYCLE_VERSION,
    state: "confirmed",
    userId: input.userId,
    examProfileId: input.examProfileId,
    proposalId: input.proposalId,
    proposalFingerprint: input.proposalFingerprint,
    snapshotFingerprint: input.snapshotFingerprint,
    plannerVersion: input.plannerVersion,
    confirmedAt: input.confirmedAt
  });
}
function validatePlannerV2Freshness(expected, current) {
  const reasons = [];
  if (expected.capacityFingerprint !== current.capacityFingerprint) reasons.push("capacity_changed");
  if (expected.progressFingerprint !== current.progressFingerprint) reasons.push("progress_changed");
  if (expected.taskStateFingerprint !== current.taskStateFingerprint) reasons.push("task_state_changed");
  if (expected.workloadFingerprint !== current.workloadFingerprint) reasons.push("workload_changed");
  if (expected.commitmentFingerprint !== current.commitmentFingerprint) reasons.push("commitment_changed");
  if (expected.policyFingerprint !== current.policyFingerprint) reasons.push("policy_changed");
  if (!reasons.length && expected.snapshotFingerprint !== current.snapshotFingerprint) reasons.push("snapshot_changed");
  return Object.freeze({ fresh: reasons.length === 0, state: reasons.length ? "stale" : "confirmed", reasons: Object.freeze(reasons) });
}
function taskType(item) {
  if (item.boundary.kind === "physical_pages") return "solve_resource_units";
  if (item.learningStage === "review" || item.learningStage === "reinforcement") return "review_topic";
  if (item.learningStage === "learn") return "learn_topic";
  return "custom";
}
function workMode(item) {
  if (item.boundary.kind === "full_video") return "video";
  if (item.materialType === "test" || item.materialType === "question_set") return "questions";
  if (item.materialType === "mock") return "mock";
  if (item.learningStage === "review" || item.learningStage === "reinforcement") return "review";
  if (item.boundary.kind === "physical_pages") return "book";
  return "other";
}
function buildPlannerV2ApplyPlanCandidate(input) {
  const { proposal } = input;
  const scope = replacementScope(proposal, input.tasks);
  const identities = /* @__PURE__ */ new Set();
  const creates = proposal.scheduledItems.map((item) => {
    if (item.workloadAuthority === "unknown") throw new Error("PLANNER_V2_UNKNOWN_WORKLOAD_IN_APPLY_PLAN");
    if (identities.has(item.canonicalWorkloadIdentity)) throw new Error("PLANNER_V2_DUPLICATE_WORKLOAD_IN_APPLY_PLAN");
    if (!item.subjectId) throw new Error("PLANNER_V2_SUBJECT_ID_REQUIRED");
    if (item.plannedDate <= proposal.currentDate) throw new Error("PLANNER_V2_CURRENT_DAY_OR_PAST_CREATE_BLOCKED");
    if (item.plannedDate < proposal.horizonStart || item.plannedDate > proposal.horizonEnd) {
      throw new Error("PLANNER_V2_CREATE_OUTSIDE_HORIZON");
    }
    identities.add(item.canonicalWorkloadIdentity);
    return Object.freeze({
      canonicalWorkloadIdentity: item.canonicalWorkloadIdentity,
      materialViewId: item.materialViewId,
      subjectId: item.subjectId,
      resourceId: item.resourceId,
      curriculumNodeId: item.curriculumNodeId,
      taskType: taskType(item),
      workMode: workMode(item),
      title: item.title,
      plannedDate: item.plannedDate,
      estimatedMinutes: item.estimatedMinutes,
      workloadAuthority: item.workloadAuthority,
      workloadConfidence: item.workloadConfidence,
      boundary: item.boundary,
      dedupeKey: `planner-v2:${proposal.proposalFingerprint}:${item.canonicalWorkloadIdentity}`
    });
  });
  return Object.freeze({
    lifecycleVersion: PLANNER_V2_LIFECYCLE_VERSION,
    proposalId: proposal.proposalId,
    proposalFingerprint: proposal.proposalFingerprint,
    snapshotFingerprint: proposal.snapshotFingerprint,
    plannerVersion: proposal.plannerVersion,
    userId: proposal.userId,
    examProfileId: proposal.examProfileId,
    horizonStart: proposal.horizonStart,
    horizonEnd: proposal.horizonEnd,
    ...scope,
    creates: Object.freeze(creates),
    expectedNewMinutes: creates.reduce((sum2, item) => sum2 + item.estimatedMinutes, 0),
    atomicRequired: true,
    applyCandidateOnly: true
  });
}
function buildPlannerV2ApplyPlan(input) {
  const { proposal, confirmation } = input;
  if (confirmation.state !== "confirmed") throw new Error("PLANNER_V2_EXPLICIT_CONFIRMATION_REQUIRED");
  if (confirmation.userId !== proposal.userId || confirmation.examProfileId !== proposal.examProfileId || confirmation.proposalId !== proposal.proposalId || confirmation.proposalFingerprint !== proposal.proposalFingerprint || confirmation.snapshotFingerprint !== proposal.snapshotFingerprint || confirmation.plannerVersion !== proposal.plannerVersion) throw new Error("PLANNER_V2_CONFIRMATION_IDENTITY_MISMATCH");
  return buildPlannerV2ApplyPlanCandidate({ proposal, tasks: input.tasks });
}
export {
  CANONICAL_PLANNER_V2_VERSION,
  PLANNER_V2_LIFECYCLE_VERSION,
  assertCanonicalPlannerV2Proposal,
  buildCanonicalPlannerV2Proposal,
  buildPlannerV2ApplyPlan,
  buildPlannerV2ApplyPlanCandidate,
  buildPlannerV2Preview,
  buildPlanningSnapshotFromDbBundleV1,
  compareCanonicalPlannerV2Shadow,
  confirmPlannerV2Preview,
  decidePlanningActionV2,
  evaluatePlanningV2ShadowDecision,
  fingerprintPlannerV2SnapshotComponents,
  stableCanonicalPlannerJson,
  toPlanningV2ProposalRow,
  toPlanningV2SnapshotRow,
  transitionPlannerV2ProposalState,
  validatePlannerV2Freshness
};
