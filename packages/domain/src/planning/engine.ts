import { calculateDayAvailableMinutes, calculateWeeklyAvailableMinutes } from "../capacity";
import type { ResourceRole, TopicProgressState } from "../types";
import {
  DEFAULT_LEARN_TOPIC_MINUTES,
  DEFAULT_RESOURCE_UNIT_MINUTES,
  DEFAULT_WEEKLY_UTILIZATION,
  MAX_RESOURCE_UNITS_PER_TASK,
  PLANNING_GENERATION_VERSION,
  PRIORITY,
  RESOURCE_ROLE_ORDER,
} from "./config";
import { PlanningDomainError } from "./errors";
import type {
  PlannedTaskDraft,
  PlanningCurriculumNode,
  PlanningResource,
  WeeklyPlanDraft,
  WeeklyPlanningContext,
} from "./types";

interface Candidate extends Omit<PlannedTaskDraft, "plannedDate" | "status"> {
  subjectOrder: number;
  candidateOrder: number;
}

const STATE_ORDER: Readonly<Record<TopicProgressState, number>> = {
  remediation: 0,
  practicing: 1,
  learning: 2,
  not_started: 3,
  learned: 4,
  maintenance: 5,
};

function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function statePriority(state: TopicProgressState) {
  if (state === "remediation") return PRIORITY.remediation;
  if (state === "practicing") return PRIORITY.practicing;
  if (state === "learning") return PRIORITY.learning;
  return 0;
}

function roleRank(role: ResourceRole) {
  return RESOURCE_ROLE_ORDER.indexOf(role);
}

function dedupeKey(
  profileId: string,
  week: string,
  subjectId: string,
  topicId: string | null,
  taskType: string,
  unitIds: readonly string[],
) {
  return [profileId, week, subjectId, topicId ?? "none", taskType, [...unitIds].sort().join(",") || "none"].join("|");
}

function activeTopicForSubject(context: WeeklyPlanningContext, subjectId: string) {
  const progressByNode = new Map(context.topicProgress.map((progress) => [progress.curriculumNodeId, progress.state]));
  return context.curriculum
    .filter((node) => node.subjectId === subjectId && node.nodeType === "topic" && node.isActive)
    .map((node) => ({ node, state: progressByNode.get(node.id) ?? "not_started" as TopicProgressState }))
    .filter(({ state }) => state !== "learned" && state !== "maintenance")
    .sort((left, right) => STATE_ORDER[left.state] - STATE_ORDER[right.state] || left.node.sortOrder - right.node.sortOrder || left.node.id.localeCompare(right.node.id))[0];
}

function bestMappedResource(
  context: WeeklyPlanningContext,
  topic: PlanningCurriculumNode,
): { resource: PlanningResource; sectionId: string } | null {
  return context.resourceSections
    .filter((section) => section.curriculumNodeId === topic.id)
    .map((section) => ({ section, resource: context.resources.find((resource) => resource.id === section.resourceId) }))
    .filter((item): item is { section: typeof item.section; resource: PlanningResource } => Boolean(item.resource && item.resource.status === "active"))
    .sort((left, right) => roleRank(left.resource.role) - roleRank(right.resource.role) || left.section.sortOrder - right.section.sortOrder || left.resource.id.localeCompare(right.resource.id))
    .map(({ section, resource }) => ({ resource, sectionId: section.id }))[0] ?? null;
}

function subjectCandidates(context: WeeklyPlanningContext): Candidate[][] {
  const completedUnitIds = new Set(
    context.resourceUnitProgress
      .filter((progress) => progress.status === "completed")
      .map((progress) => progress.resourceUnitId),
  );

  return context.subjects
    .filter((subject) => subject.status === "active")
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id))
    .map((subject, subjectOrder) => {
      const active = activeTopicForSubject(context, subject.id);
      if (!active) return [];
      const { node, state } = active;
      const candidates: Candidate[] = [];
      if (state === "not_started" || state === "learning" || state === "remediation") {
        const importance = state === "remediation" ? "core" : "important";
        candidates.push({
          subjectId: subject.id,
          curriculumNodeId: node.id,
          resourceId: null,
          carriedFromTaskId: null,
          taskType: "learn_topic",
          title: `${subject.name}: ${node.name}`,
          description: "Konu çalışması",
          estimatedMinutes: DEFAULT_LEARN_TOPIC_MINUTES,
          importance,
          priorityScore: clampScore(PRIORITY.base + statePriority(state)),
          sourceReason: "curriculum_progress",
          dedupeKey: dedupeKey(context.examProfileId, context.weekStartDate, subject.id, node.id, "learn_topic", []),
          resourceUnitIds: [],
          subjectOrder,
          candidateOrder: 0,
        });
      }

      const mapped = bestMappedResource(context, node);
      if (mapped) {
        const units = context.resourceUnits
          .filter((unit) => unit.sectionId === mapped.sectionId && !completedUnitIds.has(unit.id))
          .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id))
          .slice(0, MAX_RESOURCE_UNITS_PER_TASK);
        if (units.length) {
          const unitIds = units.map((unit) => unit.id);
          candidates.push({
            subjectId: subject.id,
            curriculumNodeId: node.id,
            resourceId: mapped.resource.id,
            carriedFromTaskId: null,
            taskType: "solve_resource_units",
            title: `${subject.name}: ${node.name} — ${units.map((unit) => unit.name).join("–")}`,
            description: `${mapped.resource.name}: ${units.map((unit) => unit.name).join(", ")}`,
            estimatedMinutes: units.reduce((sum, unit) => sum + (unit.estimatedMinutes ?? DEFAULT_RESOURCE_UNIT_MINUTES[unit.unitType]), 0),
            importance: "important",
            priorityScore: clampScore(PRIORITY.base + statePriority(state) + (mapped.resource.role === "primary" ? PRIORITY.primaryResource : 0)),
            sourceReason: "resource_progress",
            dedupeKey: dedupeKey(context.examProfileId, context.weekStartDate, subject.id, node.id, "solve_resource_units", unitIds),
            resourceUnitIds: unitIds,
            subjectOrder,
            candidateOrder: 1,
          });
        }
      }
      return candidates;
    });
}

function roundRobin(groups: Candidate[][]) {
  const result: Candidate[] = [];
  const maxLength = Math.max(0, ...groups.map((group) => group.length));
  for (let index = 0; index < maxLength; index += 1) {
    for (const group of groups) {
      if (group[index]) result.push(group[index]!);
    }
  }
  return result;
}

export function buildWeeklyPlanV0(context: WeeklyPlanningContext): WeeklyPlanDraft {
  const availableMinutes = calculateWeeklyAvailableMinutes(context.weeklyAvailability);
  if (availableMinutes <= 0) throw new PlanningDomainError("NO_WEEKLY_AVAILABILITY");
  const planningBudgetMinutes = Math.floor(availableMinutes * DEFAULT_WEEKLY_UTILIZATION);
  const weekEndDate = addDays(context.weekStartDate, 6);
  const dailyRemaining = Array.from({ length: 7 }, (_, index) =>
    calculateDayAvailableMinutes(context.weeklyAvailability, index + 1),
  );
  let dayCursor = 0;
  let plannedMinutes = 0;
  const seen = new Set<string>();
  const selected: PlannedTaskDraft[] = [];

  const carryovers: Candidate[] = context.existingCarryoverTasks.map((task, index) => ({
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
    candidateOrder: index,
  }));

  const candidates = [...carryovers, ...roundRobin(subjectCandidates(context))];
  for (const candidate of candidates) {
    if (seen.has(candidate.dedupeKey)) continue;
    seen.add(candidate.dedupeKey);
    if (plannedMinutes + candidate.estimatedMinutes > planningBudgetMinutes) continue;
    let assignedDay = -1;
    for (let offset = 0; offset < 7; offset += 1) {
      const day = (dayCursor + offset) % 7;
      if (dailyRemaining[day]! >= candidate.estimatedMinutes) {
        assignedDay = day;
        break;
      }
    }
    if (assignedDay < 0) continue;
    dailyRemaining[assignedDay]! -= candidate.estimatedMinutes;
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
      resourceUnitIds: candidate.resourceUnitIds,
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
    tasks: selected,
  };
}
