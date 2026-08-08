import type {
  ResourceDifficulty,
  ResourceRole,
  ResourceStatus,
  ResourceUnitProgressStatus,
  ResourceUnitType,
  TaskImportance,
  TaskSourceReason,
  TaskStatus,
  TaskType,
  TopicProgressState,
  UserSubjectStatus,
} from "../types";
import type { AvailabilityWindow } from "../capacity";

export interface PlanningSubject {
  id: string;
  name: string;
  status: UserSubjectStatus;
  sortOrder: number;
}

export interface PlanningCurriculumNode {
  id: string;
  subjectId: string;
  parentId: string | null;
  nodeType: "topic" | "subtopic";
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface PlanningTopicProgress {
  curriculumNodeId: string;
  state: TopicProgressState;
}

export interface PlanningResource {
  id: string;
  subjectId: string;
  name: string;
  role: ResourceRole;
  difficulty: ResourceDifficulty;
  status: ResourceStatus;
}

export interface PlanningResourceSection {
  id: string;
  resourceId: string;
  curriculumNodeId: string | null;
  name: string;
  sortOrder: number;
}

export interface PlanningResourceUnit {
  id: string;
  resourceId: string;
  sectionId: string | null;
  name: string;
  unitType: ResourceUnitType;
  sortOrder: number;
  estimatedMinutes: number | null;
}

export interface PlanningResourceUnitProgress {
  resourceUnitId: string;
  status: ResourceUnitProgressStatus;
}

export interface CarryoverTask {
  id: string;
  subjectId: string;
  curriculumNodeId: string | null;
  resourceId: string | null;
  taskType: TaskType;
  title: string;
  description: string | null;
  estimatedMinutes: number;
  importance: TaskImportance;
  priorityScore: number;
  resourceUnitIds: string[];
}

export interface WeeklyPlanningContext {
  examProfileId: string;
  weekStartDate: string;
  subjects: PlanningSubject[];
  curriculum: PlanningCurriculumNode[];
  topicProgress: PlanningTopicProgress[];
  weeklyAvailability: AvailabilityWindow[];
  resources: PlanningResource[];
  resourceSections: PlanningResourceSection[];
  resourceUnits: PlanningResourceUnit[];
  resourceUnitProgress: PlanningResourceUnitProgress[];
  existingCarryoverTasks: CarryoverTask[];
}

export interface PlannedTaskDraft {
  subjectId: string;
  curriculumNodeId: string | null;
  resourceId: string | null;
  carriedFromTaskId: string | null;
  taskType: TaskType;
  title: string;
  description: string | null;
  plannedDate: string;
  estimatedMinutes: number;
  importance: TaskImportance;
  priorityScore: number;
  status: "ready";
  sourceReason: TaskSourceReason;
  dedupeKey: string;
  resourceUnitIds: string[];
}

export interface WeeklyPlanDraft {
  examProfileId: string;
  weekStartDate: string;
  weekEndDate: string;
  availableMinutes: number;
  planningBudgetMinutes: number;
  plannedMinutes: number;
  generationVersion: number;
  tasks: PlannedTaskDraft[];
}

export interface RecommendationTask {
  id: string;
  status: TaskStatus;
  importance: TaskImportance;
  priorityScore: number;
  plannedDate: string | null;
  estimatedMinutes: number;
  completedMinutes: number;
  pendingUnitMinutes?: number | null;
  createdAt: string;
}

export type RecommendationReason =
  | "continue_in_progress"
  | "continue_partial"
  | "overdue_core"
  | "today_core"
  | "overdue_important"
  | "today_important"
  | "fits_available_window"
  | "highest_priority"
  | "optional";

export interface NextTaskRecommendation {
  recommendedTask: RecommendationTask;
  reason: RecommendationReason;
  remainingMinutes: number;
}
