export type ExamStatus = "upcoming" | "active" | "completed";
export type ExamProfileStatus = "draft" | "active" | "paused" | "completed";
export type UserSubjectStatus = "active" | "paused" | "completed";
export type CurriculumNodeType = "topic" | "subtopic";
export type TopicProgressState =
  | "not_started"
  | "learning"
  | "practicing"
  | "remediation"
  | "learned"
  | "maintenance";
export type MasteryLevel =
  | "unknown"
  | "strong"
  | "sufficient"
  | "fragile"
  | "weak"
  | "critical";
export type CalendarPeriodType =
  | "normal"
  | "midterm"
  | "final"
  | "holiday"
  | "internship"
  | "custom";
export type ScheduleExceptionType = "unavailable" | "extra_available" | "custom";
export type ResourceType =
  | "question_bank"
  | "video_course"
  | "book"
  | "notes"
  | "mock_book"
  | "other";
export type ResourceRole = "primary" | "reinforcement" | "revision" | "advanced" | "mock";
export type ResourceDifficulty = "unknown" | "easy" | "normal" | "hard";
export type ResourceStatus = "active" | "paused" | "completed" | "abandoned";
export type ResourceUnitType = "test" | "video" | "chapter" | "reading" | "mock" | "other";
export type ResourceUnitProgressStatus = "not_started" | "in_progress" | "completed" | "skipped";

export interface UserProfile {
  id: string;
  display_name: string | null;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface Exam {
  id: string;
  code: string;
  name: string;
  level: string;
  is_active: boolean;
  created_at: string;
}

export interface ExamEdition {
  id: string;
  exam_id: string;
  year: number;
  exam_date: string | null;
  status: ExamStatus;
  created_at: string;
}

export interface Subject {
  id: string;
  code: string;
  name: string;
  category: string;
  sort_order: number;
  is_active: boolean;
}

export interface CurriculumNode {
  id: string;
  subject_id: string;
  parent_id: string | null;
  node_type: CurriculumNodeType;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface ExamProfile {
  id: string;
  user_id: string;
  exam_edition_id: string;
  preparation_start_date: string;
  target_exam_date: string | null;
  status: ExamProfileStatus;
  created_at: string;
  updated_at: string;
}

export interface UserSubject {
  id: string;
  user_id: string;
  exam_profile_id: string;
  subject_id: string;
  status: UserSubjectStatus;
  created_at: string;
}

export interface TopicProgress {
  id: string;
  user_id: string;
  exam_profile_id: string;
  curriculum_node_id: string;
  state: TopicProgressState;
  mastery_level: MasteryLevel;
  first_started_at: string | null;
  learned_at: string | null;
  last_practiced_at: string | null;
  last_revision_at: string | null;
  total_study_minutes: number;
  total_questions: number;
  correct_questions: number;
  wrong_questions: number;
  blank_questions: number;
  created_at: string;
  updated_at: string;
}

export interface WeeklyAvailability {
  id: string;
  user_id: string;
  exam_profile_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  label: string | null;
  is_active: boolean;
  created_at: string;
}

export interface CalendarPeriod {
  id: string;
  user_id: string;
  exam_profile_id: string;
  period_type: CalendarPeriodType;
  name: string;
  start_date: string;
  end_date: string;
  capacity_multiplier: number | null;
  created_at: string;
}

export interface ScheduleException {
  id: string;
  user_id: string;
  exam_profile_id: string;
  exception_date: string;
  exception_type: ScheduleExceptionType;
  start_time: string | null;
  end_time: string | null;
  minutes_delta: number | null;
  note: string | null;
  created_at: string;
}

export interface Resource {
  id: string;
  user_id: string;
  exam_profile_id: string;
  subject_id: string;
  name: string;
  publisher: string | null;
  resource_type: ResourceType;
  resource_role: ResourceRole;
  difficulty: ResourceDifficulty;
  status: ResourceStatus;
  created_at: string;
  updated_at: string;
}

export interface ResourceSection {
  id: string;
  resource_id: string;
  curriculum_node_id: string | null;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface ResourceUnit {
  id: string;
  resource_id: string;
  resource_section_id: string | null;
  unit_type: ResourceUnitType;
  name: string;
  sort_order: number;
  question_count: number | null;
  estimated_minutes: number | null;
  created_at: string;
}

export interface ResourceUnitProgress {
  id: string;
  user_id: string;
  resource_unit_id: string;
  status: ResourceUnitProgressStatus;
  completed_at: string | null;
  attempt_count: number;
  created_at: string;
  updated_at: string;
}

export type WeeklyPlanStatus = "draft" | "active" | "completed" | "superseded" | "cancelled";
export type TaskType = "learn_topic" | "solve_resource_units" | "review_topic" | "custom";
export type TaskImportance = "core" | "important" | "optional";
export type TaskStatus =
  | "planned"
  | "ready"
  | "in_progress"
  | "partially_completed"
  | "completed"
  | "rescheduled"
  | "missed"
  | "cancelled";
export type TaskSourceReason = "curriculum_progress" | "resource_progress" | "carryover" | "manual" | "revision_due" | "dynamic_replan";
export type TaskResourceUnitStatus = "pending" | "completed" | "skipped";

export interface WeeklyPlan {
  id: string;
  user_id: string;
  exam_profile_id: string;
  week_start_date: string;
  week_end_date: string;
  available_minutes: number;
  planning_budget_minutes: number;
  planned_minutes: number;
  status: WeeklyPlanStatus;
  generation_version: number;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  user_id: string;
  exam_profile_id: string;
  weekly_plan_id: string | null;
  subject_id: string;
  curriculum_node_id: string | null;
  resource_id: string | null;
  carried_from_task_id: string | null;
  task_type: TaskType;
  work_mode: "video" | "book" | "notes" | "questions" | "mock" | "review" | "other" | null;
  title: string;
  description: string | null;
  planned_date: string | null;
  estimated_minutes: number;
  importance: TaskImportance;
  priority_score: number;
  status: TaskStatus;
  source_reason: TaskSourceReason;
  dedupe_key: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface TaskResourceUnit {
  id: string;
  user_id: string;
  task_id: string;
  resource_unit_id: string;
  status: TaskResourceUnitStatus;
  completed_at: string | null;
  created_at: string;
}

export interface TaskProgress {
  task_id: string;
  user_id: string;
  completed_minutes: number;
  created_at: string;
  updated_at: string;
}

export type StudySessionType = "task" | "topic" | "resource" | "custom";
export type StudySessionStatus = "active" | "completed" | "cancelled";
export type StudyEntrySource = "live" | "retroactive" | "manual" | "telegram" | "web";
export type TestReviewStatus = "pending" | "reviewed" | "skipped";

export interface StudySession {
  id: string; user_id: string; exam_profile_id: string; task_id: string | null;
  subject_id: string | null; curriculum_node_id: string | null; resource_id: string | null;
  resource_unit_id: string | null; session_type: StudySessionType; started_at: string;
  ended_at: string | null; duration_minutes: number | null; status: StudySessionStatus;
  entry_source: StudyEntrySource; note: string | null; created_at: string; updated_at: string;
}

export interface TestResult {
  id: string; user_id: string; exam_profile_id: string; task_id: string | null;
  subject_id: string; curriculum_node_id: string | null; resource_id: string | null;
  resource_unit_id: string | null; correct_count: number; wrong_count: number;
  blank_count: number; total_questions: number; duration_minutes: number | null;
  accuracy: number; review_status: TestReviewStatus; entry_source: StudyEntrySource;
  idempotency_key: string | null; completed_at: string; created_at: string; updated_at: string;
}
