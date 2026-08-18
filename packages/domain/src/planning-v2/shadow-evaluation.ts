import type {
  FeasibilityViolationCodeV2,
} from "./feasibility";
import type {
  PlanningDecisionResultV2,
  PlanningDecisionV2,
} from "./planning-decision";
import type {
  PlanValidationViolationCode,
} from "./proposal";
import type {
  PlanningTriggerV2,
  ReplanScopeV2,
} from "./triggers";
import type {
  PlanningSnapshotV2,
} from "./types";

export interface PlanningV2ShadowEvaluationV1 {
  readonly snapshotId: string;
  readonly snapshotHash: string | null;
  readonly trigger: PlanningTriggerV2;

  readonly currentPlan: {
    readonly feasible: boolean;
    readonly issueCodes: readonly FeasibilityViolationCodeV2[];
    readonly scheduledTaskCount: number;
    readonly remainingTaskCount: number;
    readonly completedTaskCount: number;
    readonly partialLifecycleTaskCount: number;
    readonly remainingMinutes: number;
    readonly availableMinutes: number;
    readonly planningBudgetMinutes: number;
    readonly reserveMinutes: number;
  };

  readonly v2: {
    readonly decision: PlanningDecisionV2;
    readonly requestedScope: ReplanScopeV2;
    readonly changedTaskCount: number;
    readonly applyRecommended: boolean;
    readonly validationValid: boolean;
    readonly validationIssueCodes: readonly PlanValidationViolationCode[];
    readonly movedTaskIds: readonly string[];
    readonly backlogTaskIds: readonly string[];
    readonly preservedTaskIds: readonly string[];
    readonly decisionReasonCodes: readonly string[];
    readonly proposalReasonCodes: readonly string[];
  };

  readonly stability: {
    readonly changeRatio: number;
    readonly completedTaskMutationCount: number;
    readonly activeTaskMutationCount: number;
    readonly partialTaskMutationCount: number;
  };

  readonly capacity: {
    readonly grossMinutes: number;
    readonly reserveMinutes: number;
    readonly planningMinutes: number;
    readonly remainingMinutes: number;
  };
}

export interface EvaluatePlanningV2ShadowDecisionInput {
  readonly snapshot: PlanningSnapshotV2;
  readonly decision: PlanningDecisionResultV2;
}

function sortedUnique<T extends string>(values: readonly T[]): readonly T[] {
  return Object.freeze([...new Set(values)].sort((a, b) => a.localeCompare(b)));
}

function sum(
  values: readonly number[],
): number {
  return values.reduce((total, value) => total + value, 0);
}

export function evaluatePlanningV2ShadowDecision(
  input: EvaluatePlanningV2ShadowDecisionInput,
): PlanningV2ShadowEvaluationV1 {
  const { snapshot, decision } = input;

  if (
    decision.snapshotId !== snapshot.meta.snapshotId ||
    decision.proposal.snapshotId !== snapshot.meta.snapshotId
  ) {
    throw new Error("decision does not belong to evaluation snapshot");
  }

  if (
    decision.decision === "KEEP_PLAN" &&
    decision.proposal.changedTaskCount !== 0
  ) {
    throw new Error("KEEP_PLAN decision cannot contain task changes");
  }

  const scheduledTasks = snapshot.existingTasks.filter(
    (task) => task.plannedDate !== null,
  );
  const remainingTasks = snapshot.existingTasks.filter(
    (task) => !task.isCompleted && task.remainingMinutes > 0,
  );
  const completedTasks = snapshot.existingTasks.filter(
    (task) => task.isCompleted,
  );
  const partialTasks = snapshot.existingTasks.filter(
    (task) => task.isPartiallyCompleted,
  );

  const movedTaskIds = sortedUnique(
    decision.proposal.moves.map((move) => move.taskId),
  );
  const backlogTaskIds = sortedUnique(
    decision.proposal.backlog.map((item) => item.taskId),
  );
  const changedExistingTaskIds = new Set([
    ...movedTaskIds,
    ...backlogTaskIds,
    ...decision.proposal.cancels.map((cancel) => cancel.taskId),
  ]);
  const preservedTaskIds = sortedUnique(
    scheduledTasks
      .map((task) => task.taskId)
      .filter((taskId) => !changedExistingTaskIds.has(taskId)),
  );

  const mutationCount = (
    tasks: readonly { readonly taskId: string }[],
  ): number => tasks.filter((task) => changedExistingTaskIds.has(task.taskId)).length;

  const scheduledTaskCount = scheduledTasks.length;
  const changedTaskCount = decision.proposal.changedTaskCount;
  const feasibility = decision.repair.feasibilityBefore;

  const currentPlan = Object.freeze({
    feasible: feasibility.feasible,
    issueCodes: sortedUnique(
      feasibility.violations.map((violation) => violation.code),
    ),
    scheduledTaskCount,
    remainingTaskCount: remainingTasks.length,
    completedTaskCount: completedTasks.length,
    partialLifecycleTaskCount: partialTasks.length,
    remainingMinutes: sum(
      remainingTasks.map((task) => task.remainingMinutes),
    ),
    availableMinutes: snapshot.availableMinutes,
    planningBudgetMinutes: snapshot.planningBudgetMinutes,
    reserveMinutes: snapshot.reserveMinutes,
  });

  const v2 = Object.freeze({
    decision: decision.decision,
    requestedScope: decision.proposal.scope,
    changedTaskCount,
    applyRecommended: decision.applyRecommended,
    validationValid: decision.validation.valid,
    validationIssueCodes: sortedUnique(
      decision.validation.violations.map((violation) => violation.code),
    ),
    movedTaskIds,
    backlogTaskIds,
    preservedTaskIds,
    decisionReasonCodes: Object.freeze([...decision.reasonCodes]),
    proposalReasonCodes: Object.freeze([...decision.proposal.reasonCodes]),
  });

  const stability = Object.freeze({
    changeRatio:
      scheduledTaskCount === 0
        ? 0
        : changedTaskCount / scheduledTaskCount,
    completedTaskMutationCount: mutationCount(completedTasks),
    activeTaskMutationCount: mutationCount(
      snapshot.existingTasks.filter((task) => task.isActive),
    ),
    partialTaskMutationCount: mutationCount(partialTasks),
  });

  const capacity = Object.freeze({
    grossMinutes: sum(
      snapshot.dailyCapacities.map((day) => day.grossCapacityMinutes),
    ),
    reserveMinutes: sum(
      snapshot.dailyCapacities.map((day) => day.reserveMinutes),
    ),
    planningMinutes: sum(
      snapshot.dailyCapacities.map((day) => day.planningCapacityMinutes),
    ),
    remainingMinutes: sum(
      snapshot.dailyCapacities.map((day) => day.remainingCapacityMinutes),
    ),
  });

  return Object.freeze({
    snapshotId: snapshot.meta.snapshotId,
    snapshotHash: snapshot.meta.snapshotHash,
    trigger: snapshot.meta.trigger,
    currentPlan,
    v2,
    stability,
    capacity,
  });
}
