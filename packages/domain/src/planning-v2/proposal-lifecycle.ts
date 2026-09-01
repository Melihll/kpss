import type {
  CanonicalPlannerV2Commitment,
  CanonicalPlannerV2Input,
  CanonicalPlannerV2Proposal,
  CanonicalPlannerV2ScheduledItem,
} from "./canonical-shadow";
import { stableCanonicalPlannerJson } from "./canonical-shadow";

export const PLANNER_V2_LIFECYCLE_VERSION = "planner-v2-lifecycle-v1" as const;

export type PlannerV2ProposalLifecycleState =
  | "generated"
  | "previewed"
  | "confirmed"
  | "applied"
  | "stale"
  | "rejected"
  | "expired";

export type PlannerV2ProposalLifecycleEvent =
  | "preview"
  | "confirm"
  | "apply"
  | "mark_stale"
  | "reject"
  | "expire";

export type PlannerV2FreshnessReason =
  | "capacity_changed"
  | "progress_changed"
  | "task_state_changed"
  | "workload_changed"
  | "commitment_changed"
  | "policy_changed"
  | "snapshot_changed";

export interface PlannerV2SnapshotComponentFingerprints {
  readonly snapshotFingerprint: string;
  readonly capacityFingerprint: string;
  readonly progressFingerprint: string;
  readonly taskStateFingerprint: string;
  readonly workloadFingerprint: string;
  readonly commitmentFingerprint: string;
  readonly policyFingerprint: string;
}

export type PlannerV2ExplanationFact =
  | { readonly kind: "day_capacity"; readonly date: string; readonly availableMinutes: number }
  | { readonly kind: "continuation_selected"; readonly canonicalWorkloadIdentity: string }
  | { readonly kind: "blocked_workload"; readonly canonicalWorkloadIdentity: string; readonly reason: string }
  | { readonly kind: "current_day_protected"; readonly date: string; readonly commitmentIds: readonly string[] }
  | { readonly kind: "unused_capacity"; readonly date: string; readonly unusedMinutes: number; readonly reason: "next_indivisible_workload_does_not_fit" }
  | { readonly kind: "replacement_scope"; readonly replaceableTaskIds: readonly string[]; readonly retainedTaskIds: readonly string[] };

export interface PlannerV2ExistingTaskScope {
  readonly taskId: string;
  readonly plannedDate: string | null;
  readonly classification: CanonicalPlannerV2Commitment["classification"];
  readonly canonicalWorkloadIdentity: string | null;
  readonly source: string;
}

export interface PlannerV2Preview {
  readonly lifecycleVersion: typeof PLANNER_V2_LIFECYCLE_VERSION;
  readonly state: "previewed";
  readonly proposalId: string;
  readonly proposalFingerprint: string;
  readonly snapshotFingerprint: string;
  readonly plannerVersion: string;
  readonly userId: string;
  readonly examProfileId: string;
  readonly horizon: { readonly start: string; readonly end: string };
  readonly summary: {
    readonly totalAvailableMinutes: number;
    readonly protectedMinutes: number;
    readonly newlyPlannedMinutes: number;
    readonly unusedMinutes: number;
    readonly unmetEligibleMinutes: number;
    readonly blockedDemandCount: number;
  };
  readonly days: readonly {
    readonly date: string;
    readonly configuredCapacityMinutes: number;
    readonly availableMinutes: number;
    readonly protectedMinutes: number;
    readonly proposedMinutes: number;
    readonly unusedMinutes: number;
    readonly warnings: readonly string[];
    readonly items: readonly CanonicalPlannerV2ScheduledItem[];
  }[];
  readonly blocked: CanonicalPlannerV2Proposal["blockedDemands"];
  readonly differences: {
    readonly createCanonicalWorkloadIdentities: readonly string[];
    readonly retainedTaskIds: readonly string[];
    readonly replaceableTaskIds: readonly string[];
    readonly outsideScopeTaskIds: readonly string[];
  };
  readonly explanationFacts: readonly PlannerV2ExplanationFact[];
  readonly explicitConfirmationRequired: true;
  readonly applyAvailable: false;
}

export interface PlannerV2Confirmation {
  readonly lifecycleVersion: typeof PLANNER_V2_LIFECYCLE_VERSION;
  readonly state: "confirmed";
  readonly userId: string;
  readonly examProfileId: string;
  readonly proposalId: string;
  readonly proposalFingerprint: string;
  readonly snapshotFingerprint: string;
  readonly plannerVersion: string;
  readonly confirmedAt: string;
}

export interface PlannerV2ApplyCreate {
  readonly canonicalWorkloadIdentity: string;
  readonly materialViewId: string;
  readonly subjectId: string;
  readonly resourceId: string;
  readonly curriculumNodeId: string | null;
  readonly taskType: "learn_topic" | "solve_resource_units" | "review_topic" | "custom";
  readonly workMode: "video" | "book" | "questions" | "mock" | "review" | "other";
  readonly title: string;
  readonly plannedDate: string;
  readonly estimatedMinutes: number;
  readonly workloadAuthority: CanonicalPlannerV2ScheduledItem["workloadAuthority"];
  readonly workloadConfidence: CanonicalPlannerV2ScheduledItem["workloadConfidence"];
  readonly boundary: CanonicalPlannerV2ScheduledItem["boundary"];
  readonly dedupeKey: string;
}

const LIFECYCLE_TRANSITIONS: Readonly<Record<PlannerV2ProposalLifecycleState, Partial<Record<PlannerV2ProposalLifecycleEvent, PlannerV2ProposalLifecycleState>>>> = Object.freeze({
  generated: Object.freeze({ preview: "previewed", reject: "rejected", expire: "expired" }),
  previewed: Object.freeze({ confirm: "confirmed", mark_stale: "stale", reject: "rejected", expire: "expired" }),
  confirmed: Object.freeze({ apply: "applied", mark_stale: "stale", reject: "rejected", expire: "expired" }),
  applied: Object.freeze({ apply: "applied" }),
  stale: Object.freeze({}),
  rejected: Object.freeze({}),
  expired: Object.freeze({}),
});

export function transitionPlannerV2ProposalState(
  current: PlannerV2ProposalLifecycleState,
  event: PlannerV2ProposalLifecycleEvent,
): PlannerV2ProposalLifecycleState {
  const next = LIFECYCLE_TRANSITIONS[current][event];
  if (!next) throw new Error(`PLANNER_V2_INVALID_LIFECYCLE_TRANSITION:${current}:${event}`);
  return next;
}

export interface PlannerV2ApplyPlan {
  readonly lifecycleVersion: typeof PLANNER_V2_LIFECYCLE_VERSION;
  readonly proposalId: string;
  readonly proposalFingerprint: string;
  readonly snapshotFingerprint: string;
  readonly plannerVersion: string;
  readonly userId: string;
  readonly examProfileId: string;
  readonly horizonStart: string;
  readonly horizonEnd: string;
  readonly retainedTaskIds: readonly string[];
  readonly replaceableTaskIds: readonly string[];
  readonly outsideScopeTaskIds: readonly string[];
  readonly creates: readonly PlannerV2ApplyCreate[];
  readonly expectedNewMinutes: number;
  readonly atomicRequired: true;
  readonly applyCandidateOnly: true;
}

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableCanonicalPlannerJson(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sorted<T>(values: readonly T[], key: (value: T) => string): T[] {
  return [...values].sort((left, right) => key(left).localeCompare(key(right)));
}

export async function fingerprintPlannerV2SnapshotComponents(
  input: CanonicalPlannerV2Input,
  snapshotFingerprint: string,
): Promise<PlannerV2SnapshotComponentFingerprints> {
  const tasks = sorted(input.commitments, (item) => item.commitmentId).map((item) => ({
    id: item.commitmentId,
    date: item.date,
    minutes: item.minutes,
    classification: item.classification,
    canonicalWorkloadIdentity: item.canonicalWorkloadIdentity,
    source: item.source,
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
    prerequisites: [...item.prerequisiteWorkloadIdentities].sort(),
  }));
  return Object.freeze({
    snapshotFingerprint,
    capacityFingerprint: await sha256(sorted(input.dailyCapacities, (item) => item.date)),
    progressFingerprint: await sha256({
      progressVersion: input.progressVersion,
      completed: [...input.completedWorkloadIdentities].sort(),
    }),
    taskStateFingerprint: await sha256(tasks),
    workloadFingerprint: await sha256(workload),
    commitmentFingerprint: await sha256(tasks.filter((item) =>
      ["in_progress", "protected_current_day", "locked", "manual"].includes(item.classification))),
    policyFingerprint: await sha256({
      userId: input.userId,
      examProfileId: input.examProfileId,
      currentDate: input.currentDate,
      horizonStart: input.horizonStart,
      horizonEnd: input.horizonEnd,
      policy: input.policy,
    }),
  });
}

function replacementScope(
  proposal: CanonicalPlannerV2Proposal,
  tasks: readonly PlannerV2ExistingTaskScope[],
) {
  const retained: string[] = [];
  const replaceable: string[] = [];
  const outside: string[] = [];
  for (const task of sorted(tasks, (item) => item.taskId)) {
    if (!task.plannedDate || task.plannedDate < proposal.horizonStart || task.plannedDate > proposal.horizonEnd) {
      outside.push(task.taskId);
    } else if (
      task.plannedDate > proposal.currentDate &&
      task.classification === "future_replaceable_generated"
    ) {
      replaceable.push(task.taskId);
    } else {
      retained.push(task.taskId);
    }
  }
  return Object.freeze({
    retainedTaskIds: Object.freeze(retained),
    replaceableTaskIds: Object.freeze(replaceable),
    outsideScopeTaskIds: Object.freeze(outside),
  });
}

export function buildPlannerV2Preview(
  proposal: CanonicalPlannerV2Proposal,
  tasks: readonly PlannerV2ExistingTaskScope[],
): PlannerV2Preview {
  const scope = replacementScope(proposal, tasks);
  const futureSchedulableDays = proposal.dailyPlans.filter(
    (day) => day.date > proposal.currentDate,
  );
  const previewAvailableMinutes = futureSchedulableDays.reduce(
    (sum, day) => sum + day.availableMinutes,
    0,
  );
  const previewUnusedMinutes = futureSchedulableDays.reduce(
    (sum, day) => sum + day.unusedMinutes,
    0,
  );
  const facts: PlannerV2ExplanationFact[] = [];
  for (const day of proposal.dailyPlans) {
    const schedulable = day.date > proposal.currentDate;
    const availableMinutes = schedulable ? day.availableMinutes : 0;
    const unusedMinutes = schedulable ? day.unusedMinutes : 0;
    facts.push(Object.freeze({ kind: "day_capacity", date: day.date, availableMinutes }));
    if (day.date === proposal.currentDate) {
      facts.push(Object.freeze({
        kind: "current_day_protected",
        date: day.date,
        commitmentIds: Object.freeze([...day.protectedCommitmentIds]),
      }));
    }
    if (unusedMinutes > 0 && proposal.unmetEligibleDemand.length > 0) {
      facts.push(Object.freeze({
        kind: "unused_capacity",
        date: day.date,
        unusedMinutes,
        reason: "next_indivisible_workload_does_not_fit",
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
    retainedTaskIds: scope.retainedTaskIds,
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
      totalAvailableMinutes: previewAvailableMinutes,
      protectedMinutes: proposal.capacity.protectedCommitmentMinutes,
      newlyPlannedMinutes: proposal.capacity.plannedMinutes,
      unusedMinutes: previewUnusedMinutes,
      unmetEligibleMinutes: proposal.capacity.unmetEligibleMinutes,
      blockedDemandCount: proposal.blockedDemands.length,
    }),
    days: Object.freeze(proposal.dailyPlans.map((day) => Object.freeze({
      date: day.date,
      configuredCapacityMinutes: day.configuredCapacityMinutes,
      availableMinutes: day.date > proposal.currentDate ? day.availableMinutes : 0,
      protectedMinutes: day.protectedCommitmentMinutes,
      proposedMinutes: day.plannedMinutes,
      unusedMinutes: day.date > proposal.currentDate ? day.unusedMinutes : 0,
      warnings: Object.freeze([
        ...(day.overcommittedMinutes > 0 ? ["PROTECTED_OVERCOMMIT"] : []),
        ...(day.date === proposal.currentDate ? ["CURRENT_DAY_PROTECTED"] : []),
      ]),
      items: day.scheduledItems,
    }))),
    blocked: proposal.blockedDemands,
    differences: Object.freeze({
      createCanonicalWorkloadIdentities: Object.freeze(proposal.scheduledItems.map((item) => item.canonicalWorkloadIdentity)),
      ...scope,
    }),
    explanationFacts: Object.freeze(facts),
    explicitConfirmationRequired: true,
    applyAvailable: false,
  });
}

export function confirmPlannerV2Preview(input: {
  readonly preview: PlannerV2Preview;
  readonly userId: string;
  readonly examProfileId: string;
  readonly proposalId: string;
  readonly proposalFingerprint: string;
  readonly snapshotFingerprint: string;
  readonly plannerVersion: string;
  readonly confirmedAt: string;
}): PlannerV2Confirmation {
  const expected = input.preview;
  if (
    input.userId !== expected.userId ||
    input.examProfileId !== expected.examProfileId
  ) throw new Error("PLANNER_V2_CONFIRMATION_OWNERSHIP_MISMATCH");
  if (
    input.proposalId !== expected.proposalId ||
    input.proposalFingerprint !== expected.proposalFingerprint ||
    input.snapshotFingerprint !== expected.snapshotFingerprint ||
    input.plannerVersion !== expected.plannerVersion
  ) throw new Error("PLANNER_V2_CONFIRMATION_IDENTITY_MISMATCH");
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
    confirmedAt: input.confirmedAt,
  });
}

export function validatePlannerV2Freshness(
  expected: PlannerV2SnapshotComponentFingerprints,
  current: PlannerV2SnapshotComponentFingerprints,
) {
  const reasons: PlannerV2FreshnessReason[] = [];
  if (expected.capacityFingerprint !== current.capacityFingerprint) reasons.push("capacity_changed");
  if (expected.progressFingerprint !== current.progressFingerprint) reasons.push("progress_changed");
  if (expected.taskStateFingerprint !== current.taskStateFingerprint) reasons.push("task_state_changed");
  if (expected.workloadFingerprint !== current.workloadFingerprint) reasons.push("workload_changed");
  if (expected.commitmentFingerprint !== current.commitmentFingerprint) reasons.push("commitment_changed");
  if (expected.policyFingerprint !== current.policyFingerprint) reasons.push("policy_changed");
  if (!reasons.length && expected.snapshotFingerprint !== current.snapshotFingerprint) reasons.push("snapshot_changed");
  return Object.freeze({ fresh: reasons.length === 0, state: reasons.length ? "stale" as const : "confirmed" as const, reasons: Object.freeze(reasons) });
}

function taskType(item: CanonicalPlannerV2ScheduledItem): PlannerV2ApplyCreate["taskType"] {
  if (item.boundary.kind === "physical_pages") return "solve_resource_units";
  if (item.learningStage === "review" || item.learningStage === "reinforcement") return "review_topic";
  if (item.learningStage === "learn") return "learn_topic";
  return "custom";
}

function workMode(item: CanonicalPlannerV2ScheduledItem): PlannerV2ApplyCreate["workMode"] {
  if (item.boundary.kind === "full_video") return "video";
  if (item.materialType === "test" || item.materialType === "question_set") return "questions";
  if (item.materialType === "mock") return "mock";
  if (item.learningStage === "review" || item.learningStage === "reinforcement") return "review";
  if (item.boundary.kind === "physical_pages") return "book";
  return "other";
}

export function buildPlannerV2ApplyPlanCandidate(input: {
  readonly proposal: CanonicalPlannerV2Proposal;
  readonly tasks: readonly PlannerV2ExistingTaskScope[];
}): PlannerV2ApplyPlan {
  const { proposal } = input;
  const scope = replacementScope(proposal, input.tasks);
  const identities = new Set<string>();
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
      dedupeKey: `planner-v2:${proposal.proposalFingerprint}:${item.canonicalWorkloadIdentity}`,
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
    expectedNewMinutes: creates.reduce((sum, item) => sum + item.estimatedMinutes, 0),
    atomicRequired: true,
    applyCandidateOnly: true,
  });
}

export function buildPlannerV2ApplyPlan(input: {
  readonly proposal: CanonicalPlannerV2Proposal;
  readonly confirmation: PlannerV2Confirmation;
  readonly tasks: readonly PlannerV2ExistingTaskScope[];
}): PlannerV2ApplyPlan {
  const { proposal, confirmation } = input;
  if (confirmation.state !== "confirmed") throw new Error("PLANNER_V2_EXPLICIT_CONFIRMATION_REQUIRED");
  if (
    confirmation.userId !== proposal.userId ||
    confirmation.examProfileId !== proposal.examProfileId ||
    confirmation.proposalId !== proposal.proposalId ||
    confirmation.proposalFingerprint !== proposal.proposalFingerprint ||
    confirmation.snapshotFingerprint !== proposal.snapshotFingerprint ||
    confirmation.plannerVersion !== proposal.plannerVersion
  ) throw new Error("PLANNER_V2_CONFIRMATION_IDENTITY_MISMATCH");
  return buildPlannerV2ApplyPlanCandidate({ proposal, tasks: input.tasks });
}
