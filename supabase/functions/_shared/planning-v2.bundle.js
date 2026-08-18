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
    snapshot.meta.trigger
  ].join(":");
}
function planningV2ProposalIdempotencyKey(proposal) {
  return [
    "planning-v2-proposal",
    proposal.userId,
    proposal.examProfileId,
    proposal.proposalId
  ].join(":");
}
function planningV2ApplyDedupeKey(proposal) {
  return [
    "planning-v2-apply",
    proposal.userId,
    proposal.examProfileId,
    proposal.proposalId
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
export {
  buildPlanningSnapshotFromDbBundleV1,
  decidePlanningActionV2,
  evaluatePlanningV2ShadowDecision,
  toPlanningV2ProposalRow,
  toPlanningV2SnapshotRow
};
