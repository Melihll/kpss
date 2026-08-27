import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Icon } from "../components/Icon";
import { PlanningPanel } from "../components/PlanningPanel";
import { PlannerV2PreviewPanel } from "../components/PlannerV2PreviewPanel";
import { useRoadmap } from "../hooks/useRoadmap";
import { addDays, compactMinutesLabel, dateLabel, DAY_NAMES, isoToday, taskName, taskRemainingMinutes, totalTaskRemainingMinutes, WORK_MODE_LABELS } from "../lib/roadmap";

function weekRangeLabel(start: string, end: string) {
  const startDate = new Date(`${start}T12:00:00Z`);
  const endDate = new Date(`${end}T12:00:00Z`);
  const sameMonth = startDate.getUTCFullYear() === endDate.getUTCFullYear() && startDate.getUTCMonth() === endDate.getUTCMonth();
  return sameMonth
    ? `${startDate.getUTCDate()} — ${dateLabel(end)}`
    : `${dateLabel(start)} — ${dateLabel(end)}`;
}

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function WeekPage() {
  const { data, loading, error, retry } = useRoadmap({ ensureWeek: true });
  const [selectedDate, setSelectedDate] = useState(isoToday());
  const [displayedDate, setDisplayedDate] = useState(isoToday());
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [changingDay, setChangingDay] = useState(false);
  const transitionTimer = useRef<number | null>(null);
  const dayButtons = useRef<Array<HTMLButtonElement | null>>([]);
  const plan = data?.currentWeek?.plan;
  const tasks = useMemo(() => (data?.currentWeek?.tasks ?? []).filter((task) => task.status !== "cancelled"), [data]);

  useEffect(() => {
    if (!plan) return;
    const today = isoToday();
    const initialDate = today >= plan.week_start_date && today <= plan.week_end_date ? today : plan.week_start_date;
    if (transitionTimer.current) window.clearTimeout(transitionTimer.current);
    setSelectedDate(initialDate);
    setDisplayedDate(initialDate);
    setChangingDay(false);
  }, [plan]);

  useEffect(() => () => {
    if (transitionTimer.current) window.clearTimeout(transitionTimer.current);
  }, []);

  const weekStart = plan?.week_start_date ?? isoToday();
  const dates = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const selectedTasks = tasks.filter((task) => task.planned_date === displayedDate);
  const planned = tasks.reduce((sum, task) => sum + task.estimated_minutes, 0);
  const actual = tasks.reduce((sum, task) => sum + (task.task_progress?.[0]?.actual_study_minutes ?? 0), 0);
  const target = data?.capacity?.planningTargetMinutes ?? 0;
  const progress = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0;
  const selectedMinutes = totalTaskRemainingMinutes(selectedTasks);
  const replannedTaskCount = selectedTasks.filter((task) => task.source_reason === "dynamic_replan" || task.status === "rescheduled").length;
  const selectedDayIndex = Math.max(0, dates.indexOf(selectedDate));

  useEffect(() => {
    if (!window.matchMedia("(max-width: 760px)").matches) return;
    dayButtons.current[selectedDayIndex]?.scrollIntoView({
      behavior: reducedMotion() ? "auto" : "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [selectedDayIndex]);

  function selectDay(nextDate: string) {
    if (nextDate === selectedDate) return;
    if (transitionTimer.current) window.clearTimeout(transitionTimer.current);
    setDirection(nextDate > displayedDate ? "forward" : "backward");
    setSelectedDate(nextDate);
    if (reducedMotion()) {
      setDisplayedDate(nextDate);
      setChangingDay(false);
      return;
    }
    setChangingDay(true);
    transitionTimer.current = window.setTimeout(() => {
      setDisplayedDate(nextDate);
      setChangingDay(false);
    }, 130);
  }

  function handleDayKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const keyMoves: Record<string, number> = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };
    let nextIndex = index;
    if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = dates.length - 1;
    else if (event.key in keyMoves) nextIndex = Math.max(0, Math.min(dates.length - 1, index + keyMoves[event.key]!));
    else return;
    event.preventDefault();
    selectDay(dates[nextIndex]!);
    window.requestAnimationFrame(() => dayButtons.current[nextIndex]?.focus());
  }

  return <section className="week-page page-frame">
    <header className="page-header compact-header week-page-header">
      <div>
        <span className="page-eyebrow">Haftam</span>
        <h1>{plan ? weekRangeLabel(plan.week_start_date, plan.week_end_date) : "Bu hafta"}</h1>
        <p>{compactMinutesLabel(planned)} planlandı · {compactMinutesLabel(target)} planlama hedefi</p>
        {data?.capacity && <p className="week-capacity-context">
          Efektif kapasite {compactMinutesLabel(data.capacity.effectiveWeeklyMinutes)}
          {" · "}
          Planlama bütçesi {data.capacity.planningBudgetMinutes == null
            ? "yok"
            : compactMinutesLabel(data.capacity.planningBudgetMinutes)}
        </p>}
      </div>
      <div className="week-progress-editorial"><strong>%{progress}</strong><span>{compactMinutesLabel(actual)} tamamlandı</span></div>
    </header>
    <div className="thin-progress" role="progressbar" aria-label="Haftalık hedef ilerlemesi" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><i style={{ width: `${progress}%` }} /></div>

    {error && <div className="inline-state error" role="alert"><span>Haftalık plan yüklenemedi.</span><button type="button" onClick={() => void retry()}>Tekrar Dene</button></div>}
    {loading ? <div className="week-page-skeleton page-skeleton"><span /><div /><div /></div> : plan ? <>
      <div className="week-calendar-scroll">
        <div className="week-calendar" role="tablist" aria-label="Haftanın günleri" style={{ "--week-active-index": selectedDayIndex } as CSSProperties}>
          {dates.map((date, index) => {
            const dayTasks = tasks.filter((task) => task.planned_date === date);
            const dayMinutes = totalTaskRemainingMinutes(dayTasks);
            const dayCompleted = dayTasks.length > 0 && dayTasks.every((task) => task.status === "completed");
            const isSelected = selectedDate === date;
            return <button
              type="button"
              role="tab"
              id={`week-day-${date}`}
              aria-controls="selected-week-day"
              aria-selected={isSelected}
              tabIndex={isSelected ? 0 : -1}
              className={`${isSelected ? "active" : ""} ${date === isoToday() ? "today" : ""} ${dayCompleted ? "day-complete" : ""} ${dayTasks.length === 0 ? "day-empty" : ""}`}
              key={date}
              ref={(node) => { dayButtons.current[index] = node; }}
              onClick={() => selectDay(date)}
              onKeyDown={(event) => handleDayKeyDown(event, index)}
            >
              <span>{DAY_NAMES[index]}</span>
              <strong>{new Date(`${date}T12:00:00Z`).getUTCDate()}</strong>
              <small>{dayMinutes ? compactMinutesLabel(dayMinutes) : "—"}</small>
              {dayCompleted && <span className="day-state-icon" aria-label="Tamamlandı"><Icon name="check" weight="bold" /></span>}
            </button>;
          })}
        </div>
      </div>

      <section
        className={`selected-day-schedule week-day-content ${changingDay ? "is-leaving" : "is-entering"} ${direction}`}
        id="selected-week-day"
        role="tabpanel"
        aria-labelledby={`week-day-${displayedDate}`}
        key={displayedDate}
      >
        <div className="selected-day-title">
          <div><h2>{new Intl.DateTimeFormat("tr-TR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${displayedDate}T12:00:00Z`))}</h2></div>
          <strong><b>{selectedTasks.length} görev</b><i aria-hidden="true">·</i>{compactMinutesLabel(selectedMinutes)}</strong>
        </div>
        {replannedTaskCount > 1 && <p className="day-plan-change-summary"><Icon name="arrow" />Plan güncellendi · {replannedTaskCount} görev yeniden yerleştirildi</p>}
        {selectedTasks.length ? <div className="day-timeline">{selectedTasks.map((task, index) => {
          const completed = task.status === "completed";
          const active = task.status === "in_progress" || task.status === "partially_completed";
          const replanned = task.source_reason === "dynamic_replan" || task.status === "rescheduled";
          return <article className={`${completed ? "complete" : ""} ${active ? "active-task" : ""} ${replanned ? "replanned-task" : ""}`} style={{ animationDelay: `${index * 40}ms` }} key={task.id}>
            <span className="timeline-node" aria-hidden="true">{completed ? <Icon name="check" weight="bold" /> : String(index + 1).padStart(2, "0")}</span>
            <div className="timeline-task-copy">
              <div className="timeline-task-kicker"><span>{task.subjects?.name ?? "Ders"}</span>{active && <em>{task.status === "in_progress" ? "Şimdi" : "Devam"}</em>}</div>
              <strong title={task.resources?.name ?? taskName(task)}>{task.resources?.name ?? taskName(task)}</strong>
              <small>{task.work_mode ? WORK_MODE_LABELS[task.work_mode] ?? "Çalışma" : task.description ?? "Çalışma"}<i aria-hidden="true">·</i><b>{taskRemainingMinutes(task)} dk</b></small>
              {replanned && replannedTaskCount <= 1 && <span className="task-plan-change"><Icon name="arrow" />Plan güncellendi</span>}
            </div>
          </article>;
        })}</div> : <div className="plain-empty">Bu gün için planlanmış çalışma yok.</div>}
      </section>

      <PlannerV2PreviewPanel />
      <details className="week-edit-tools"><summary><span><Icon name="settings" />Planı düzenle</span><Icon name="arrow" /></summary><PlanningPanel /></details>
    </> : <div className="plain-empty action-empty"><span>Bu hafta henüz plan oluşturulmadı.</span></div>}
  </section>;
}
