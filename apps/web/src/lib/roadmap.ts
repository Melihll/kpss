export interface RoadmapTask {
  id: string;
  title: string;
  description: string | null;
  planned_date: string | null;
  estimated_minutes: number;
  status: string;
  work_mode: string | null;
  source_reason?: string;
  subjects?: { name: string } | null;
  resources?: { name: string; resource_type: string } | null;
  task_progress?: Array<{ completed_minutes: number; actual_study_minutes: number }>;
}

export interface ResourceForecast {
  resourceId: string;
  resourceName: string;
  plannedMinutes: number;
  actualMinutes: number;
  progressPercent: number;
  remainingMinutes: number;
  forecastStartDate?: string | null;
  forecastFinishDate: string | null;
  completed: boolean;
  publisher?: string | null;
  resourceType?: string | null;
}

export interface SubjectForecast {
  subjectId: string;
  subjectName: string;
  weeklyMinutes: number;
  totalPlannedMinutes: number;
  totalActualMinutes: number;
  newSourceDate: string | null;
  resources: ResourceForecast[];
}

export interface MonthSummary {
  month: string;
  label: string;
  plannedMinutes: number;
  blockedDays: number;
  phase: string;
  focus: string;
  focusResources?: string[];
}

export interface RoadmapMilestone {
  type: string;
  date: string;
  endDate: string | null;
  title: string;
  subjectName: string | null;
}

export interface RoadmapResponse {
  configured: boolean;
  strategy?: {
    scoreType: string;
    targetExamDate: string;
    weeklyTargetMinutes: number;
    monthlyTargetMinutes: number;
    sourceNote: string;
    daysToExam: number;
  };
  subjectForecasts?: SubjectForecast[];
  months?: MonthSummary[];
  periods?: Array<{ name: string; periodType: string; startDate: string; endDate: string; capacityMultiplier: number | null }>;
  milestones?: RoadmapMilestone[];
  currentWeek?: {
    plan: { id: string; week_start_date: string; week_end_date: string; available_minutes: number; planned_minutes: number } | null;
    tasks: RoadmapTask[];
  };
  resourcesSummary?: { count: number; totalPlannedMinutes: number; totalActualMinutes: number; progressPercent: number };
}

export const DAY_NAMES = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
export const WORK_MODE_LABELS: Record<string, string> = {
  video: "Video",
  book: "Konu çalışması",
  notes: "Not çalışması",
  questions: "Soru çözümü",
  mock: "Deneme",
  review: "Tekrar",
  other: "Çalışma",
};
export const RESOURCE_TYPE_LABELS: Record<string, string> = {
  question_bank: "Soru bankası",
  video_course: "Video kurs",
  book: "Konu anlatımı",
  notes: "Notlar",
  mock_book: "Deneme kitabı",
  other: "Kaynak",
};

export const isoToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
export const minutesLabel = (minutes: number) => `${Math.floor(minutes / 60)}s ${minutes % 60}dk`;
export const compactMinutesLabel = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder} dk`;
  if (remainder === 0) return `${hours} saat`;
  return `${hours}s ${remainder}dk`;
};
export const addDays = (value: string, days: number) => {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
export const dateLabel = (value: string, options: Intl.DateTimeFormatOptions = {}) => new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
  ...options,
}).format(new Date(`${value}T12:00:00Z`));
export const taskName = (task: Pick<RoadmapTask, "title">) => task.title.split(" · ").at(-1) || task.title;
