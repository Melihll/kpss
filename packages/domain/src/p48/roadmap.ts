import { resolveStudyBlockDuration, type StudyBlockClass } from "../planning/duration-policy";

export type P48WorkMode = "video" | "book" | "notes" | "questions" | "mock" | "review" | "other";

export interface P48SubjectTarget {
  subjectId: string;
  subjectName: string;
  weeklyMinutes: number;
  scoreWeight?: number;
}

export interface P48ResourceTarget {
  resourceId: string;
  subjectId: string;
  subjectName: string;
  resourceName: string;
  plannedMinutes: number;
  actualMinutes: number;
  sequenceOrder: number;
  workMode: P48WorkMode;
  resourceStatus?: string | null;
  /**
   * Deterministic remaining workload derived from real material progress.
   * null/undefined preserves the legacy plannedMinutes - actualMinutes path.
   */
  materialRemainingMinutes?: number | null;
}

export interface P48CalendarPeriod {
  name: string;
  periodType: string;
  startDate: string;
  endDate: string;
  capacityMultiplier: number | null;
}

export interface P48ResourceForecast extends P48ResourceTarget {
  remainingMinutes: number;
  progressPercent: number;
  forecastStartDate: string | null;
  forecastFinishDate: string | null;
  completed: boolean;
}

export interface P48SubjectForecast {
  subjectId: string;
  subjectName: string;
  weeklyMinutes: number;
  resources: P48ResourceForecast[];
  newSourceDate: string | null;
  totalPlannedMinutes: number;
  totalActualMinutes: number;
}

export interface P48MonthSummary {
  month: string;
  label: string;
  plannedMinutes: number;
  blockedDays: number;
  phase: string;
  focus: string;
}

export interface P48WeekResource {
  resourceId: string;
  resourceName: string;
  subjectId: string;
  subjectName: string;
  workMode: P48WorkMode;
  blockClass?: StudyBlockClass | null;
  remainingMinutes: number;
  sequenceOrder: number;
}

export interface P48WeekBlock {
  plannedDate: string;
  subjectId: string;
  subjectName: string;
  workMode: P48WorkMode;
  resourceId: string | null;
  resourceName: string | null;
  estimatedMinutes: number;
  detail: string;
  isNewResourceWindow: boolean;
}

const DAY_MS = 86_400_000;

function parseDate(date: string) {
  return new Date(`${date}T12:00:00Z`);
}

function dateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addP48Days(date: string, days: number) {
  const value = parseDate(date);
  value.setUTCDate(value.getUTCDate() + days);
  return dateString(value);
}

export function p48MondayOf(date: string) {
  const value = parseDate(date);
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() - day + 1);
  return dateString(value);
}

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthEnd(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 12));
}

function periodMultiplierForDate(date: string, periods: P48CalendarPeriod[]) {
  const matches = periods.filter((period) => period.startDate <= date && period.endDate >= date);
  if (!matches.length) return 1;
  return matches.reduce((value, period) => Math.min(value, period.capacityMultiplier ?? 1), 1);
}

export function p48PhaseForDate(date: string) {
  if (date <= "2027-01-03") return { name: "Temel + ilk tur", focus: "Konu anlatımı, not ve soru bankasını düzenli biçimde ilerlet." };
  if (date <= "2027-04-04") return { name: "Ana kaynak + soru yoğunlaştırma", focus: "Ana kaynakları sürdür; soru çözümünü ve yanlış dönüşlerini artır." };
  if (date <= "2027-06-06") return { name: "Kaynak kapanışı", focus: "İlk kaynak havuzunu kapatmaya çalış; biten derslerde branş denemesi ekle." };
  if (date <= "2027-08-08") return { name: "Yeni kaynak + branş denemeleri", focus: "Biten kaynakların yerine yeni soru/deneme kaynakları koy ve süreli çözümü artır." };
  return { name: "Final tekrar", focus: "Yeni ağır kaynak açma; deneme, yanlış defteri ve kısa tekrarlarla sınava gir." };
}

function usableWeekRatio(weekStart: string, asOfDate: string, targetExamDate: string, periods: P48CalendarPeriod[]) {
  let ratio = 0;
  for (let day = 0; day < 7; day += 1) {
    const date = addP48Days(weekStart, day);
    if (date < asOfDate || date > targetExamDate) continue;
    ratio += periodMultiplierForDate(date, periods) / 7;
  }
  return ratio;
}

export function forecastP48Resources(input: {
  asOfDate: string;
  targetExamDate: string;
  subjects: P48SubjectTarget[];
  resources: P48ResourceTarget[];
  periods: P48CalendarPeriod[];
}) {
  const subjects: P48SubjectForecast[] = [];
  for (const subject of input.subjects) {
    const queue = input.resources
      .filter((resource) => resource.subjectId === subject.subjectId)
      .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
      .map((resource) => {
        const hasMaterialRemaining = Number.isFinite(resource.materialRemainingMinutes)
          && Number(resource.materialRemainingMinutes) >= 0;
        const materialRemainingMinutes = hasMaterialRemaining
          ? Math.max(0, Math.round(Number(resource.materialRemainingMinutes)))
          : null;
        const remainingMinutes = materialRemainingMinutes
          ?? Math.max(0, resource.plannedMinutes - resource.actualMinutes);

        /*
         * When real material progress exists it is authoritative for finish
         * projection. Session minutes remain the fallback for resources that
         * do not yet expose page/video progress.
         */
        const completed = resource.resourceStatus === "completed"
          || (materialRemainingMinutes !== null
            ? materialRemainingMinutes === 0
            : resource.actualMinutes >= resource.plannedMinutes);

        return {
          ...resource,
          remainingMinutes,
          progressPercent: resource.plannedMinutes > 0
            ? Math.min(100, Math.round((resource.actualMinutes / resource.plannedMinutes) * 100))
            : 0,
          forecastStartDate: null,
          forecastFinishDate: null,
          completed,
        };
      }) as P48ResourceForecast[];

    let currentIndex = queue.findIndex((resource) => !resource.completed);
    if (currentIndex < 0) currentIndex = queue.length;
    let week = p48MondayOf(input.asOfDate);
    let lastFinish: string | null = null;
    let guard = 0;

    while (currentIndex < queue.length && week <= input.targetExamDate && guard < 90) {
      const ratio = usableWeekRatio(week, input.asOfDate, input.targetExamDate, input.periods);
      let budget = Math.round(subject.weeklyMinutes * ratio);
      if (budget <= 0) {
        week = addP48Days(week, 7);
        guard += 1;
        continue;
      }
      while (budget > 0 && currentIndex < queue.length) {
        const resource = queue[currentIndex]!;
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
    const newSourceDate = currentIndex >= queue.length && lastFinish && lastFinish < input.targetExamDate
      ? addP48Days(lastFinish, 1)
      : null;

    subjects.push({
      subjectId: subject.subjectId,
      subjectName: subject.subjectName,
      weeklyMinutes: subject.weeklyMinutes,
      resources: queue,
      newSourceDate,
      totalPlannedMinutes,
      totalActualMinutes,
    });
  }
  return subjects;
}

export function buildP48Months(input: {
  asOfDate: string;
  targetExamDate: string;
  monthlyTargetMinutes: number;
  periods: P48CalendarPeriod[];
}) {
  const result: P48MonthSummary[] = [];
  const cursor = parseDate(input.asOfDate);
  cursor.setUTCDate(1);
  const end = parseDate(input.targetExamDate);
  end.setUTCDate(1);

  while (cursor <= end) {
    const startMonth = new Date(cursor);
    const endMonth = monthEnd(startMonth);
    const rangeStart = startMonth < parseDate(input.asOfDate) ? parseDate(input.asOfDate) : startMonth;
    const rangeEnd = endMonth > parseDate(input.targetExamDate) ? parseDate(input.targetExamDate) : endMonth;
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
    result.push({
      month: monthKey(startMonth),
      label: new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric", timeZone: "UTC" }).format(startMonth),
      plannedMinutes,
      blockedDays,
      phase: phase.name,
      focus: phase.focus,
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return result;
}

function roundToThirty(minutes: number) {
  return Math.max(0, Math.round(minutes / 30) * 30);
}

function floorToThirty(minutes: number) {
  return Math.max(0, Math.floor(minutes / 30) * 30);
}

export function buildP48WeekBlocks(input: {
  weekStart: string;
  currentDate: string;
  weeklyTargetMinutes: number;
  dayCapacities: Record<string, number>;
  subjects: P48SubjectTarget[];
  resources: P48WeekResource[];
}) {
  const dates = Array.from({ length: 7 }, (_, index) => addP48Days(input.weekStart, index));
  const activeDates = dates.filter((date) => date >= input.currentDate && (input.dayCapacities[date] ?? 0) > 0);
  const totalCapacity = activeDates.reduce((sum, date) => sum + (input.dayCapacities[date] ?? 0), 0);
  if (totalCapacity <= 0) return [] as P48WeekBlock[];

  const scale = Math.min(1, totalCapacity / input.weeklyTargetMinutes);
  const subjectRemaining = new Map<string, number>();
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
    const subject = input.subjects
      .slice()
      .sort((a, b) => (b.weeklyMinutes - (subjectRemaining.get(b.subjectId) ?? 0)) - (a.weeklyMinutes - (subjectRemaining.get(a.subjectId) ?? 0)))[0];
    if (!subject) break;
    subjectRemaining.set(subject.subjectId, (subjectRemaining.get(subject.subjectId) ?? 0) + 30);
    targetTotal += 30;
  }

  const queues = new Map<string, P48WeekResource[]>();
  for (const subject of input.subjects) {
    queues.set(subject.subjectId, input.resources
      .filter((resource) => resource.subjectId === subject.subjectId && resource.remainingMinutes > 0)
      .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
      .map((resource) => ({ ...resource })));
  }

  const result: P48WeekBlock[] = [];
  let previousSubject: string | null = null;
  for (const date of activeDates) {
    let dayRemaining = Math.max(0, input.dayCapacities[date] ?? 0);
    let guard = 0;
    while (dayRemaining >= 30 && guard < 30) {
      const candidates = input.subjects
        .filter((subject) => (subjectRemaining.get(subject.subjectId) ?? 0) >= 30)
        .sort((a, b) => (subjectRemaining.get(b.subjectId) ?? 0) - (subjectRemaining.get(a.subjectId) ?? 0));
      if (!candidates.length) break;

      const schedulableCandidates = candidates.filter((candidate) => {
        const candidateWeeklyRemaining = subjectRemaining.get(candidate.subjectId) ?? 0;
        const candidateQueue = queues.get(candidate.subjectId) ?? [];
        while (candidateQueue.length && candidateQueue[0]!.remainingMinutes <= 0) candidateQueue.shift();
        const candidateResource = candidateQueue[0] ?? null;
        if (!candidateResource?.blockClass) return true;

        const candidatePolicy = resolveStudyBlockDuration({
          blockClass: candidateResource.blockClass,
        });
        const candidateLimit = Math.min(
          dayRemaining,
          candidateWeeklyRemaining,
          candidateResource.remainingMinutes,
        );
        return candidateLimit >= candidatePolicy.minMinutes;
      });

      if (!schedulableCandidates.length) break;
      const subject = (
        schedulableCandidates.find((candidate) => candidate.subjectId !== previousSubject)
        ?? schedulableCandidates[0]
      )!;
      const weeklyRemaining = subjectRemaining.get(subject.subjectId) ?? 0;
      const queue = queues.get(subject.subjectId) ?? [];
      while (queue.length && queue[0]!.remainingMinutes <= 0) queue.shift();
      const resource = queue[0] ?? null;
      const policyDecision = resource?.blockClass
        ? resolveStudyBlockDuration({ blockClass: resource.blockClass })
        : null;
      const policyLimit = Math.min(
        dayRemaining,
        weeklyRemaining,
        resource?.remainingMinutes ?? Number.POSITIVE_INFINITY,
      );
      const policyMinutes = policyDecision
        ? (policyLimit >= policyDecision.minMinutes
          ? Math.min(policyDecision.minutes, policyLimit)
          : 0)
        : null;
      const chunk = policyDecision
        ? policyMinutes!
        : Math.min(60, dayRemaining, weeklyRemaining, resource ? Math.max(30, roundToThirty(resource.remainingMinutes)) : 60);
      const minutes = policyDecision ? chunk : Math.max(30, roundToThirty(chunk));
      const bounded = Math.min(minutes, dayRemaining, weeklyRemaining);
      if (bounded < 30) break;

      result.push({
        plannedDate: date,
        subjectId: subject.subjectId,
        subjectName: subject.subjectName,
        workMode: resource?.workMode ?? "other",
        resourceId: resource?.resourceId ?? null,
        resourceName: resource?.resourceName ?? null,
        estimatedMinutes: bounded,
        detail: resource ? resource.resourceName : `Yeni kaynak zamanı · ${subject.subjectName}`,
        isNewResourceWindow: !resource,
      });

      subjectRemaining.set(subject.subjectId, weeklyRemaining - bounded);
      dayRemaining -= bounded;
      if (resource) resource.remainingMinutes -= bounded;
      previousSubject = subject.subjectId;
      guard += 1;
    }
  }
  return result;
}
