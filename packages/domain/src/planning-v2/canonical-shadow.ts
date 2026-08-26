import type {
  PlannerV2WorkloadHandoff,
  WorkloadAuthority,
  WorkloadConfidence,
  WorkloadProgressUnit,
} from "../planning/canonical-workload";
import type { LearningStage } from "../planning/learning-stage";

export const CANONICAL_PLANNER_V2_VERSION = "canonical-planner-v2-shadow-v1" as const;

export type CanonicalWorkloadBoundary =
  | {
      readonly kind: "physical_pages";
      readonly pageStart: number;
      readonly pageEnd: number;
      readonly remainingPageStart: number;
      readonly remainingPageEnd: number;
    }
  | {
      readonly kind: "full_video";
      readonly videoId: string;
      readonly durationSeconds: number;
      readonly watchedSeconds: number;
    };

export type CanonicalCommitmentClass =
  | "completed"
  | "in_progress"
  | "protected_current_day"
  | "locked"
  | "manual"
  | "future_replaceable_generated"
  | "legacy";

export interface CanonicalPlannerV2DayCapacityInput {
  readonly date: string;
  readonly configuredCapacityMinutes: number;
  readonly alreadyStudiedMinutes: number;
}

export interface CanonicalPlannerV2Commitment {
  readonly commitmentId: string;
  readonly date: string | null;
  readonly minutes: number;
  readonly classification: CanonicalCommitmentClass;
  readonly occupiesCapacity: boolean;
  readonly canonicalWorkloadIdentity: string | null;
  readonly materialViewId: string | null;
  readonly source: string;
}

export interface CanonicalPlannerV2Demand {
  readonly demandId: string;
  readonly canonicalWorkloadIdentity: string;
  readonly workload: PlannerV2WorkloadHandoff;
  readonly curriculumNodeId: string | null;
  readonly title: string;
  readonly boundary: CanonicalWorkloadBoundary | null;
  readonly learningStage: LearningStage | null;
  readonly learningStageAllowed: boolean;
  readonly learningStageReason: string;
  readonly userPriority: number;
  readonly curriculumOrder: number;
  readonly alreadyStarted: boolean;
  readonly earliestDate: string;
  readonly latestDate: string;
  readonly prerequisiteWorkloadIdentities: readonly string[];
  readonly sourceProvenance: readonly string[];
}

export interface CanonicalPlannerV2Policy {
  readonly plannerVersion: typeof CANONICAL_PLANNER_V2_VERSION;
  readonly protectCurrentDay: true;
  readonly materialSplitting: "whole_canonical_workload_only";
  readonly orderingPolicy: "user_priority_continuation_stage_curriculum_stable_id";
}

export interface CanonicalPlannerV2Input {
  readonly userId: string;
  readonly examProfileId: string;
  readonly currentDate: string;
  readonly horizonStart: string;
  readonly horizonEnd: string;
  readonly dailyCapacities: readonly CanonicalPlannerV2DayCapacityInput[];
  readonly commitments: readonly CanonicalPlannerV2Commitment[];
  readonly demands: readonly CanonicalPlannerV2Demand[];
  readonly completedWorkloadIdentities: readonly string[];
  readonly progressVersion: string;
  readonly policy: CanonicalPlannerV2Policy;
}

export interface CanonicalPlannerV2ScheduledItem {
  readonly demandId: string;
  readonly canonicalWorkloadIdentity: string;
  readonly materialViewId: string;
  readonly resourceId: string;
  readonly curriculumNodeId: string | null;
  readonly materialType: string;
  readonly plannedDate: string;
  readonly estimatedMinutes: number;
  readonly workloadAuthority: WorkloadAuthority;
  readonly workloadConfidence: WorkloadConfidence;
  readonly boundary: CanonicalWorkloadBoundary;
  readonly learningStage: LearningStage | null;
  readonly reasonCodes: readonly string[];
  readonly sourceProvenance: readonly string[];
}

export interface CanonicalPlannerV2BlockedDemand {
  readonly demandId: string;
  readonly canonicalWorkloadIdentity: string;
  readonly materialViewId: string;
  readonly resourceId: string;
  readonly curriculumNodeId: string | null;
  readonly remainingAmount: number | null;
  readonly remainingUnit: WorkloadProgressUnit;
  readonly blockedReason: string;
  readonly unresolvedWorkloadReason: string | null;
  readonly explanationFacts: readonly string[];
}

export interface CanonicalPlannerV2UnmetDemand {
  readonly demandId: string;
  readonly canonicalWorkloadIdentity: string;
  readonly materialViewId: string;
  readonly estimatedMinutes: number;
  readonly reason: "insufficient_contiguous_capacity" | "prerequisite_unsatisfied";
}

export interface CanonicalPlannerV2DayPlan {
  readonly date: string;
  readonly configuredCapacityMinutes: number;
  readonly alreadyStudiedMinutes: number;
  readonly protectedCommitmentMinutes: number;
  readonly overcommittedMinutes: number;
  readonly availableMinutes: number;
  readonly plannedMinutes: number;
  readonly unusedMinutes: number;
  readonly protectedCommitmentIds: readonly string[];
  readonly scheduledItems: readonly CanonicalPlannerV2ScheduledItem[];
}

export interface CanonicalPlannerV2Proposal {
  readonly proposalId: string;
  readonly snapshotFingerprint: string;
  readonly proposalFingerprint: string;
  readonly plannerVersion: typeof CANONICAL_PLANNER_V2_VERSION;
  readonly userId: string;
  readonly examProfileId: string;
  readonly currentDate: string;
  readonly horizonStart: string;
  readonly horizonEnd: string;
  readonly dailyPlans: readonly CanonicalPlannerV2DayPlan[];
  readonly scheduledItems: readonly CanonicalPlannerV2ScheduledItem[];
  readonly blockedDemands: readonly CanonicalPlannerV2BlockedDemand[];
  readonly unmetEligibleDemand: readonly CanonicalPlannerV2UnmetDemand[];
  readonly completedDemandIds: readonly string[];
  readonly capacity: {
    readonly configuredMinutes: number;
    readonly alreadyStudiedMinutes: number;
    readonly protectedCommitmentMinutes: number;
    readonly overcommittedMinutes: number;
    readonly availableMinutes: number;
    readonly plannedMinutes: number;
    readonly unusedMinutes: number;
    readonly unmetEligibleMinutes: number;
  };
  readonly warnings: readonly string[];
  readonly explanationFacts: readonly string[];
  readonly applyAllowed: false;
}

export interface CanonicalPlannerV2LegacyItem {
  readonly taskId: string;
  readonly plannedDate: string;
  readonly estimatedMinutes: number;
  readonly canonicalWorkloadIdentity: string | null;
  readonly completed: boolean;
}

export interface CanonicalPlannerV2ShadowComparison {
  readonly capacity: {
    readonly exactCapacityMinutes: number;
    readonly legacyPlannedMinutes: number;
    readonly v2PlannedMinutes: number;
    readonly legacyOverflowMinutes: number;
    readonly v2OverflowMinutes: number;
    readonly v2UnusedMinutes: number;
  };
  readonly workload: {
    readonly canonicalEligibleDemandMinutes: number;
    readonly scheduledEligibleDemandMinutes: number;
    readonly unmetEligibleDemandMinutes: number;
    readonly blockedUnknownDemandCount: number;
    readonly blockedMappingDemandCount: number;
  };
  readonly material: {
    readonly exactYoutubeScheduled: number;
    readonly physicalCalibratedScheduled: number;
    readonly duplicateMaterialIdentities: number;
    readonly completedMaterialMistakenlyPlanned: number;
    readonly unknownWorkloadScheduledCount: number;
  };
  readonly plan: {
    readonly days: readonly { readonly date: string; readonly legacyItems: number; readonly legacyMinutes: number; readonly v2Items: number; readonly v2Minutes: number }[];
    readonly legacyOnlyItems: number;
    readonly v2OnlyItems: number;
    readonly comparableMatches: number;
    readonly orderingDifferences: number;
  };
  readonly safety: {
    readonly currentDayProtectedDifferences: number;
    readonly capacityViolations: number;
    readonly staleOrUnknownViolations: number;
    readonly duplicateViolations: number;
  };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertIsoDate(name: string, value: string): void {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!ISO_DATE.test(value) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${name} must be a valid YYYY-MM-DD date`);
  }
}

function assertNonNegativeInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

export function stableCanonicalPlannerJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function datesBetween(start: string, end: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function stageRank(stage: LearningStage | null): number {
  if (stage === "learn") return 0;
  if (stage === "practice") return 1;
  if (stage === "review") return 2;
  if (stage === "reinforcement") return 3;
  return 4;
}

function compareDemand(left: CanonicalPlannerV2Demand, right: CanonicalPlannerV2Demand): number {
  return right.userPriority - left.userPriority ||
    Number(right.alreadyStarted) - Number(left.alreadyStarted) ||
    stageRank(left.learningStage) - stageRank(right.learningStage) ||
    left.latestDate.localeCompare(right.latestDate) ||
    left.curriculumOrder - right.curriculumOrder ||
    left.canonicalWorkloadIdentity.localeCompare(right.canonicalWorkloadIdentity) ||
    left.demandId.localeCompare(right.demandId);
}

function block(demand: CanonicalPlannerV2Demand, reason: string, facts: readonly string[]): CanonicalPlannerV2BlockedDemand {
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
    explanationFacts: Object.freeze([...facts]),
  });
}

function normalizedFingerprintInput(input: CanonicalPlannerV2Input): unknown {
  return {
    ...input,
    dailyCapacities: [...input.dailyCapacities].sort((a, b) => a.date.localeCompare(b.date)),
    commitments: [...input.commitments].sort((a, b) => a.commitmentId.localeCompare(b.commitmentId)),
    demands: [...input.demands]
      .sort((a, b) => a.demandId.localeCompare(b.demandId))
      .map((demand) => ({
        ...demand,
        prerequisiteWorkloadIdentities: [...demand.prerequisiteWorkloadIdentities].sort(),
        sourceProvenance: [...demand.sourceProvenance].sort(),
      })),
    completedWorkloadIdentities: [...input.completedWorkloadIdentities].sort(),
  };
}

export async function buildCanonicalPlannerV2Proposal(input: CanonicalPlannerV2Input): Promise<CanonicalPlannerV2Proposal> {
  if (!input.userId || !input.examProfileId || !input.progressVersion) throw new Error("planner identity and progressVersion are required");
  assertIsoDate("currentDate", input.currentDate);
  assertIsoDate("horizonStart", input.horizonStart);
  assertIsoDate("horizonEnd", input.horizonEnd);
  if (input.horizonStart > input.horizonEnd) throw new Error("invalid planning horizon");
  if (
    input.policy.plannerVersion !== CANONICAL_PLANNER_V2_VERSION ||
    input.policy.protectCurrentDay !== true ||
    input.policy.materialSplitting !== "whole_canonical_workload_only" ||
    input.policy.orderingPolicy !== "user_priority_continuation_stage_curriculum_stable_id"
  ) {
    throw new Error("unsupported canonical planner policy");
  }

  const horizonDates = datesBetween(input.horizonStart, input.horizonEnd);
  const capacityByDate = new Map<string, CanonicalPlannerV2DayCapacityInput>();
  for (const day of input.dailyCapacities) {
    assertIsoDate("capacity.date", day.date);
    assertNonNegativeInteger("configuredCapacityMinutes", day.configuredCapacityMinutes);
    assertNonNegativeInteger("alreadyStudiedMinutes", day.alreadyStudiedMinutes);
    if (day.date < input.horizonStart || day.date > input.horizonEnd) throw new Error("capacity outside planning horizon");
    if (capacityByDate.has(day.date)) throw new Error(`duplicate capacity date: ${day.date}`);
    capacityByDate.set(day.date, day);
  }
  if (horizonDates.some((date) => !capacityByDate.has(date))) throw new Error("daily capacity missing inside horizon");

  const commitmentsByDate = new Map<string, CanonicalPlannerV2Commitment[]>();
  const inProgressIdentities = new Set<string>();
  for (const commitment of input.commitments) {
    assertNonNegativeInteger("commitment.minutes", commitment.minutes);
    if (commitment.date !== null) {
      assertIsoDate("commitment.date", commitment.date);
      const list = commitmentsByDate.get(commitment.date) ?? [];
      list.push(commitment);
      commitmentsByDate.set(commitment.date, list);
    }
    if (commitment.classification === "in_progress" && commitment.canonicalWorkloadIdentity) {
      inProgressIdentities.add(commitment.canonicalWorkloadIdentity);
    }
  }

  const mutableDays = new Map<string, {
    input: CanonicalPlannerV2DayCapacityInput;
    protectedCommitments: CanonicalPlannerV2Commitment[];
    protectedMinutes: number;
    overcommitted: number;
    available: number;
    planned: number;
    scheduled: CanonicalPlannerV2ScheduledItem[];
  }>();
  for (const date of horizonDates) {
    const capacity = capacityByDate.get(date)!;
    const protectedCommitments = (commitmentsByDate.get(date) ?? [])
      .filter((item) => item.occupiesCapacity)
      .sort((a, b) => a.commitmentId.localeCompare(b.commitmentId));
    const protectedMinutes = protectedCommitments.reduce((sum, item) => sum + item.minutes, 0);
    const rawAvailable = capacity.configuredCapacityMinutes - capacity.alreadyStudiedMinutes - protectedMinutes;
    const available = Math.max(0, rawAvailable);
    const overcommitted = Math.max(0, -rawAvailable);
    mutableDays.set(date, { input: capacity, protectedCommitments, protectedMinutes, overcommitted, available, planned: 0, scheduled: [] });
  }

  const completed = new Set(input.completedWorkloadIdentities);
  const completedDemandIds: string[] = [];
  const blocked: CanonicalPlannerV2BlockedDemand[] = [];
  const unmet: CanonicalPlannerV2UnmetDemand[] = [];
  const pending: CanonicalPlannerV2Demand[] = [];
  const seenDemandIds = new Set<string>();
  const bestByWorkload = new Map<string, CanonicalPlannerV2Demand>();

  for (const demand of [...input.demands].sort(compareDemand)) {
    if (!demand.demandId || !demand.canonicalWorkloadIdentity) throw new Error("demand identity required");
    if (seenDemandIds.has(demand.demandId)) throw new Error(`duplicate demand id: ${demand.demandId}`);
    seenDemandIds.add(demand.demandId);
    assertIsoDate("demand.earliestDate", demand.earliestDate);
    assertIsoDate("demand.latestDate", demand.latestDate);
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

  const scheduledIdentities = new Set<string>();
  let remaining = [...pending].sort(compareDemand);
  while (remaining.length) {
    let progressed = false;
    const next: CanonicalPlannerV2Demand[] = [];
    for (const demand of remaining) {
      const unmetPrerequisites = demand.prerequisiteWorkloadIdentities.filter(
        (identity) => !completed.has(identity) && !scheduledIdentities.has(identity),
      );
      const prerequisitesStillPending = unmetPrerequisites.some(
        (identity) => remaining.some((candidate) => candidate.canonicalWorkloadIdentity === identity),
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
          estimatedMinutes: demand.workload.estimatedMinutes!,
          reason: "prerequisite_unsatisfied" as const,
        }));
        progressed = true;
        continue;
      }

      const earliest = demand.earliestDate > input.horizonStart ? demand.earliestDate : input.horizonStart;
      const latest = demand.latestDate < input.horizonEnd ? demand.latestDate : input.horizonEnd;
      const eligibleDates = horizonDates.filter(
        (date) => date >= earliest && date <= latest && date > input.currentDate,
      );
      const day = eligibleDates
        .map((date) => mutableDays.get(date)!)
        .find((candidate) => candidate.available - candidate.planned >= demand.workload.estimatedMinutes!);
      if (!day) {
        unmet.push(Object.freeze({
          demandId: demand.demandId,
          canonicalWorkloadIdentity: demand.canonicalWorkloadIdentity,
          materialViewId: demand.workload.materialViewId,
          estimatedMinutes: demand.workload.estimatedMinutes!,
          reason: "insufficient_contiguous_capacity" as const,
        }));
        progressed = true;
        continue;
      }
      const item = Object.freeze({
        demandId: demand.demandId,
        canonicalWorkloadIdentity: demand.canonicalWorkloadIdentity,
        materialViewId: demand.workload.materialViewId,
        resourceId: demand.workload.resourceId,
        curriculumNodeId: demand.curriculumNodeId,
        materialType: demand.workload.materialType,
        plannedDate: day.input.date,
        estimatedMinutes: demand.workload.estimatedMinutes!,
        workloadAuthority: demand.workload.workloadAuthority,
        workloadConfidence: demand.workload.workloadConfidence,
        boundary: demand.boundary!,
        learningStage: demand.learningStage,
        reasonCodes: Object.freeze(["canonical_workload_eligible", "whole_boundary_fit", demand.learningStageReason]),
        sourceProvenance: Object.freeze([...demand.sourceProvenance].sort()),
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
          estimatedMinutes: demand.workload.estimatedMinutes!,
          reason: "prerequisite_unsatisfied" as const,
        }));
      }
      break;
    }
    remaining = next.sort(compareDemand);
  }

  const dailyPlans = Object.freeze(horizonDates.map((date) => {
    const day = mutableDays.get(date)!;
    const plannedMinutes = day.scheduled.reduce((sum, item) => sum + item.estimatedMinutes, 0);
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
      scheduledItems: Object.freeze([...day.scheduled]),
    });
  }));
  const scheduledItems = Object.freeze(dailyPlans.flatMap((day) => day.scheduledItems));
  const capacity = Object.freeze({
    configuredMinutes: dailyPlans.reduce((sum, day) => sum + day.configuredCapacityMinutes, 0),
    alreadyStudiedMinutes: dailyPlans.reduce((sum, day) => sum + day.alreadyStudiedMinutes, 0),
    protectedCommitmentMinutes: dailyPlans.reduce((sum, day) => sum + day.protectedCommitmentMinutes, 0),
    overcommittedMinutes: dailyPlans.reduce((sum, day) => sum + day.overcommittedMinutes, 0),
    availableMinutes: dailyPlans.reduce((sum, day) => sum + day.availableMinutes, 0),
    plannedMinutes: scheduledItems.reduce((sum, item) => sum + item.estimatedMinutes, 0),
    unusedMinutes: dailyPlans.reduce((sum, day) => sum + day.unusedMinutes, 0),
    unmetEligibleMinutes: unmet.reduce((sum, item) => sum + item.estimatedMinutes, 0),
  });
  const snapshotFingerprint = await sha256(stableCanonicalPlannerJson(normalizedFingerprintInput(input)));
  const proposalPayload = {
    snapshotFingerprint,
    scheduledItems,
    blockedDemands: blocked,
    unmetEligibleDemand: unmet,
    completedDemandIds: [...completedDemandIds].sort(),
    capacity,
  };
  const proposalFingerprint = await sha256(stableCanonicalPlannerJson(proposalPayload));
  const warnings = [
    ...(blocked.length ? ["BLOCKED_CANONICAL_DEMAND_PRESENT"] : []),
    ...(unmet.length ? ["UNMET_ELIGIBLE_DEMAND_PRESENT"] : []),
    ...(capacity.overcommittedMinutes ? ["PROTECTED_COMMITMENTS_EXCEED_CONFIGURED_CAPACITY"] : []),
    ...(input.policy.protectCurrentDay ? ["CURRENT_DAY_PROTECTED"] : []),
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
      "proposal_only_no_apply_authority",
    ]),
    applyAllowed: false as const,
  });
  assertCanonicalPlannerV2Proposal(proposal);
  return proposal;
}

export function assertCanonicalPlannerV2Proposal(proposal: CanonicalPlannerV2Proposal): void {
  const identities = new Set<string>();
  let planned = 0;
  for (const day of proposal.dailyPlans) {
    assertNonNegativeInteger("day.availableMinutes", day.availableMinutes);
    assertNonNegativeInteger("day.plannedMinutes", day.plannedMinutes);
    assertNonNegativeInteger("day.overcommittedMinutes", day.overcommittedMinutes);
    if (day.date < proposal.horizonStart || day.date > proposal.horizonEnd) throw new Error("scheduled day outside proposal horizon");
    if (day.availableMinutes !== Math.max(0, day.configuredCapacityMinutes - day.alreadyStudiedMinutes - day.protectedCommitmentMinutes)) {
      throw new Error("daily available capacity does not reconcile");
    }
    if (day.overcommittedMinutes !== Math.max(0, day.alreadyStudiedMinutes + day.protectedCommitmentMinutes - day.configuredCapacityMinutes)) {
      throw new Error("daily overcommit does not reconcile");
    }
    if (day.unusedMinutes !== day.availableMinutes - day.plannedMinutes) throw new Error("daily unused minutes do not reconcile");
    if (day.plannedMinutes > day.availableMinutes) throw new Error("canonical planner capacity overflow");
    const daySum = day.scheduledItems.reduce((sum, item) => sum + item.estimatedMinutes, 0);
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
  if (planned !== proposal.capacity.plannedMinutes || planned !== proposal.scheduledItems.reduce((sum, item) => sum + item.estimatedMinutes, 0)) {
    throw new Error("whole-horizon planned minutes do not reconcile");
  }
  if (proposal.capacity.plannedMinutes > proposal.capacity.availableMinutes) throw new Error("whole-horizon capacity overflow");
  if (proposal.capacity.unusedMinutes !== proposal.capacity.availableMinutes - proposal.capacity.plannedMinutes) throw new Error("whole-horizon unused minutes do not reconcile");
  if (proposal.capacity.overcommittedMinutes !== proposal.dailyPlans.reduce((sum, day) => sum + day.overcommittedMinutes, 0)) throw new Error("whole-horizon overcommit does not reconcile");
  if (proposal.applyAllowed !== false) throw new Error("W5 proposal cannot authorize apply");
}

export function compareCanonicalPlannerV2Shadow(
  input: CanonicalPlannerV2Input,
  proposal: CanonicalPlannerV2Proposal,
  legacyItems: readonly CanonicalPlannerV2LegacyItem[],
): CanonicalPlannerV2ShadowComparison {
  const legacy = legacyItems.filter((item) => !item.completed);
  const legacyPlannedMinutes = legacy.reduce((sum, item) => sum + Math.max(0, item.estimatedMinutes), 0);
  const exactCapacityMinutes = Math.max(
    0,
    proposal.capacity.configuredMinutes - proposal.capacity.alreadyStudiedMinutes,
  );
  const v2OccupiedMinutes = proposal.capacity.protectedCommitmentMinutes + proposal.capacity.plannedMinutes;
  const legacyByIdentity = new Map(legacy.filter((item) => item.canonicalWorkloadIdentity).map((item) => [item.canonicalWorkloadIdentity!, item]));
  const v2ByIdentity = new Map(proposal.scheduledItems.map((item) => [item.canonicalWorkloadIdentity, item]));
  const comparable = [...v2ByIdentity.keys()].filter((identity) => legacyByIdentity.has(identity));
  const days = proposal.dailyPlans.map((day) => {
    const legacyDay = legacy.filter((item) => item.plannedDate === day.date);
    return Object.freeze({
      date: day.date,
      legacyItems: legacyDay.length,
      legacyMinutes: legacyDay.reduce((sum, item) => sum + item.estimatedMinutes, 0),
      v2Items: day.scheduledItems.length,
      v2Minutes: day.plannedMinutes,
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
      v2UnusedMinutes: proposal.capacity.unusedMinutes,
    }),
    workload: Object.freeze({
      canonicalEligibleDemandMinutes: [...new Map(
        input.demands
          .filter((item) =>
            item.workload.plannerEligible &&
            item.workload.estimatedMinutes !== null &&
            !input.completedWorkloadIdentities.includes(item.canonicalWorkloadIdentity))
          .map((item) => [item.canonicalWorkloadIdentity, Number(item.workload.estimatedMinutes)]),
      ).values()].reduce((sum, minutes) => sum + minutes, 0),
      scheduledEligibleDemandMinutes: proposal.capacity.plannedMinutes,
      unmetEligibleDemandMinutes: proposal.capacity.unmetEligibleMinutes,
      blockedUnknownDemandCount: proposal.blockedDemands.filter((item) => item.unresolvedWorkloadReason?.includes("pace") || item.blockedReason.includes("pace")).length,
      blockedMappingDemandCount: proposal.blockedDemands.filter((item) =>
        item.blockedReason.includes("mapping") || item.unresolvedWorkloadReason?.includes("mapping"))
        .length,
    }),
    material: Object.freeze({
      exactYoutubeScheduled: proposal.scheduledItems.filter((item) => item.boundary.kind === "full_video" && item.workloadAuthority === "exact").length,
      physicalCalibratedScheduled: proposal.scheduledItems.filter((item) => item.boundary.kind === "physical_pages" && item.workloadAuthority === "calibrated").length,
      duplicateMaterialIdentities: proposal.scheduledItems.length - scheduledIdentityCount,
      completedMaterialMistakenlyPlanned: proposal.scheduledItems.filter((item) => input.completedWorkloadIdentities.includes(item.canonicalWorkloadIdentity)).length,
      unknownWorkloadScheduledCount: proposal.scheduledItems.filter((item) => item.workloadAuthority === "unknown").length,
    }),
    plan: Object.freeze({
      days: Object.freeze(days),
      legacyOnlyItems: legacy.filter((item) => !item.canonicalWorkloadIdentity || !v2ByIdentity.has(item.canonicalWorkloadIdentity)).length,
      v2OnlyItems: proposal.scheduledItems.filter((item) => !legacyByIdentity.has(item.canonicalWorkloadIdentity)).length,
      comparableMatches: comparable.length,
      orderingDifferences: comparable.filter((identity) => legacyByIdentity.get(identity)!.plannedDate !== v2ByIdentity.get(identity)!.plannedDate).length,
    }),
    safety: Object.freeze({
      currentDayProtectedDifferences: proposal.scheduledItems.filter((item) => item.plannedDate === input.currentDate).length,
      capacityViolations: proposal.dailyPlans.filter((day) => day.plannedMinutes > day.availableMinutes || day.overcommittedMinutes > 0).length,
      staleOrUnknownViolations: proposal.scheduledItems.filter((item) => item.workloadAuthority === "unknown").length,
      duplicateViolations: proposal.scheduledItems.length - scheduledIdentityCount,
    }),
  });
}
