import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Icon } from "../components/Icon";
import { useRoadmap } from "../hooks/useRoadmap";
import { compactMinutesLabel, dateLabel, type RoadmapMilestone } from "../lib/roadmap";

const milestoneType = (type: string) => type === "academic_gap" ? "Akademik ara" : type === "new_resource" ? "Yeni kaynak zamanı" : type === "exam" ? "Sınav" : "Kaynak notu";
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function useAnimatedNumber(target: number, duration = 380) {
  const [value, setValue] = useState(target);
  const valueRef = useRef(target);

  useEffect(() => { valueRef.current = value; }, [value]);
  useEffect(() => {
    if (reducedMotion()) {
      setValue(target);
      return;
    }
    const startedAt = performance.now();
    const startValue = valueRef.current;
    const difference = target - startValue;
    let frame = 0;
    const update = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      setValue(Math.round(startValue + difference * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [duration, target]);

  return value;
}

function contextualDateLabel(value: string) {
  return dateLabel(value, Number(value.slice(0, 4)) === new Date().getFullYear() ? {} : { year: "numeric" });
}

function eventDate(item: RoadmapMilestone) {
  return item.endDate ? `${contextualDateLabel(item.date)} — ${contextualDateLabel(item.endDate)}` : contextualDateLabel(item.date);
}

export function RoadmapPage() {
  const { data, loading, error, retry } = useRoadmap();
  const months = useMemo(() => data?.months ?? [], [data]);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [displayedMonth, setDisplayedMonth] = useState("");
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [changingMonth, setChangingMonth] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);
  const monthButtons = useRef<Array<HTMLButtonElement | null>>([]);
  const transitionTimer = useRef<number | null>(null);

  const currentMonth = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", timeZone: "Europe/Istanbul" }).format(new Date()).slice(0, 7);
  const today = new Date();
  const daysInCurrentMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const currentMonthIndex = months.findIndex((item) => item.month === currentMonth);
  const timelineProgress = !months.length || currentMonth < months[0]!.month
    ? 0
    : currentMonth > months.at(-1)!.month
      ? 100
      : Math.min(100, ((Math.max(0, currentMonthIndex) + today.getDate() / daysInCurrentMonth) / months.length) * 100);

  useEffect(() => {
    if (!months.length) return;
    const initialMonth = months.some((month) => month.month === currentMonth) ? currentMonth : months[0]!.month;
    if (transitionTimer.current) window.clearTimeout(transitionTimer.current);
    setSelectedMonth(initialMonth);
    setDisplayedMonth(initialMonth);
    setChangingMonth(false);
  }, [currentMonth, months]);

  useEffect(() => () => {
    if (transitionTimer.current) window.clearTimeout(transitionTimer.current);
  }, []);

  const selectedIndex = Math.max(0, months.findIndex((item) => item.month === selectedMonth));
  useEffect(() => {
    monthButtons.current[selectedIndex]?.scrollIntoView({
      behavior: reducedMotion() ? "auto" : "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [selectedIndex]);

  const month = months.find((item) => item.month === displayedMonth) ?? months[0];
  const milestonesByMonth = useMemo(() => {
    const result = new Map<string, RoadmapMilestone[]>();
    for (const item of data?.milestones ?? []) {
      const key = item.date.slice(0, 7);
      result.set(key, [...(result.get(key) ?? []), item]);
    }
    return result;
  }, [data]);
  const milestones = month ? milestonesByMonth.get(month.month) ?? [] : [];
  const periods = (data?.periods ?? []).filter((item) => month && item.startDate.slice(0, 7) <= month.month && item.endDate.slice(0, 7) >= month.month);
  const activeResources = (data?.subjectForecasts ?? []).flatMap((subject) => subject.resources
    .filter((resource) => month && resource.forecastStartDate && resource.forecastFinishDate && resource.forecastStartDate.slice(0, 7) <= month.month && resource.forecastFinishDate.slice(0, 7) >= month.month)
    .map((resource) => ({ ...resource, subjectName: subject.subjectName, newSourceDate: subject.newSourceDate })));
  const targetExamDate = data?.strategy?.targetExamDate;
  const animatedDays = useAnimatedNumber(data?.strategy?.daysToExam ?? 0);

  function selectMonth(nextMonth: string) {
    if (nextMonth === selectedMonth) return;
    if (transitionTimer.current) window.clearTimeout(transitionTimer.current);
    setDirection(nextMonth > displayedMonth ? "forward" : "backward");
    setSelectedMonth(nextMonth);
    if (reducedMotion()) {
      setDisplayedMonth(nextMonth);
      setChangingMonth(false);
      return;
    }
    setChangingMonth(true);
    transitionTimer.current = window.setTimeout(() => {
      setDisplayedMonth(nextMonth);
      setChangingMonth(false);
    }, 130);
  }

  function handleMonthKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };
    let nextIndex = index;
    if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = months.length - 1;
    else if (event.key in moves) nextIndex = Math.max(0, Math.min(months.length - 1, index + moves[event.key]!));
    else return;
    event.preventDefault();
    selectMonth(months[nextIndex]!.month);
    requestAnimationFrame(() => monthButtons.current[nextIndex]?.focus());
  }

  function scrollTimeline(offset: number) {
    railRef.current?.scrollBy({ left: offset, behavior: reducedMotion() ? "auto" : "smooth" });
  }

  return <section className="roadmap-page page-frame">
    <header className="page-header roadmap-header">
      <div><span className="page-eyebrow">Yol Haritası</span><h1>KPSS P48</h1><p>{data?.strategy?.targetExamDate ? dateLabel(data.strategy.targetExamDate, { year: "numeric" }) : "—"}</p></div>
      <div className="exam-countdown"><strong>{data?.strategy ? animatedDays : "—"}</strong><span>gün kaldı</span></div>
    </header>
    {error && <div className="inline-state error" role="alert"><span>Yol haritası yüklenemedi.</span><button type="button" onClick={() => void retry()}>Tekrar Dene</button></div>}
    {loading ? <div className="roadmap-page-skeleton page-skeleton"><span /><div /><div /></div> : month ? <>
      <div className="exam-timeline-shell">
        <button type="button" className="timeline-scroll-button previous" aria-label="Önceki dönem" onClick={() => scrollTimeline(-336)}><Icon name="arrow" /></button>
        <div className="exam-timeline-scroll" ref={railRef}>
          <div className="exam-timeline-track" role="tablist" aria-label="Sınava kadar aylar" style={{ "--roadmap-selected-index": selectedIndex, "--roadmap-time-progress": `${timelineProgress}%` } as CSSProperties}>
            <span className="timeline-base" aria-hidden="true"><i /></span>
            <span className="month-selection" aria-hidden="true" />
            {months.map((item, index) => {
              const events = milestonesByMonth.get(item.month) ?? [];
              const isSelected = selectedMonth === item.month;
              const isCurrent = item.month === currentMonth;
              const state = item.month < currentMonth ? "past" : item.month > currentMonth ? "future" : "current";
              const monthName = new Intl.DateTimeFormat("tr-TR", { month: "short", timeZone: "UTC" }).format(new Date(`${item.month}-01T12:00:00Z`)).replace(".", "").toLocaleUpperCase("tr-TR");
              const tooltipId = events.length ? `roadmap-events-${item.month}` : undefined;
              return <button
                type="button"
                role="tab"
                id={`roadmap-month-${item.month}`}
                aria-controls="roadmap-month-detail"
                aria-selected={isSelected}
                aria-describedby={tooltipId}
                tabIndex={isSelected ? 0 : -1}
                className={`timeline-month-node ${state} ${isSelected ? "active" : ""} ${item.blockedDays ? "has-gap" : ""}`}
                style={{ "--node-delay": `${Math.min(index, 12) * 28}ms` } as CSSProperties}
                key={item.month}
                ref={(node) => { monthButtons.current[index] = node; }}
                onClick={() => selectMonth(item.month)}
                onKeyDown={(event) => handleMonthKeyDown(event, index)}
              >
                {isCurrent && <em>Şimdi</em>}
                <span>{monthName}</span>
                <i className="month-node-dot" />
                <small>{item.month.slice(0, 4)}</small>
                {events.length > 0 && <span className="month-event-markers" aria-hidden="true">{events.slice(0, 3).map((event, eventIndex) => <i className={event.type} key={`${event.type}-${eventIndex}`} />)}</span>}
                {events.length > 0 && <span className="month-event-tooltip" id={tooltipId} role="tooltip">{events.map((event) => <span key={`${event.type}-${event.date}-${event.title}`}><b>{event.title}</b><small>{milestoneType(event.type)} · {eventDate(event)}</small></span>)}</span>}
              </button>;
            })}
            {targetExamDate && <div className="exam-endpoint" aria-label={`KPSS P48 sınavı ${dateLabel(targetExamDate, { year: "numeric" })}`}><span>{dateLabel(targetExamDate, { day: "numeric", month: "short" }).toLocaleUpperCase("tr-TR")}</span><i /><strong>KPSS P48</strong></div>}
          </div>
        </div>
        <button type="button" className="timeline-scroll-button next" aria-label="Sonraki dönem" onClick={() => scrollTimeline(336)}><Icon name="arrow" /></button>
      </div>

      <section className={`month-detail roadmap-month-content ${changingMonth ? "is-leaving" : "is-entering"} ${direction}`} id="roadmap-month-detail" role="tabpanel" aria-labelledby={`roadmap-month-${displayedMonth}`} key={month.month}>
        <div className="month-detail-heading"><div><span>{month.phase}</span><h2>{month.label}</h2></div><div><strong>{compactMinutesLabel(month.plannedMinutes)}</strong><span>bu ay</span></div></div>
        <p className="month-focus">{month.focus}</p>
        {periods.length > 0 && <div className="academic-period"><Icon name="calendar" /><div><span>{periods[0]!.name}</span><strong>{contextualDateLabel(periods[0]!.startDate)} — {contextualDateLabel(periods[0]!.endDate)}</strong><small>Bu dönemde KPSS çalışma yükü azaltıldı.</small></div><div><small>Normal ay</small><strong>{compactMinutesLabel(data?.strategy?.monthlyTargetMinutes ?? 0)}</strong><small>Bu ay</small><strong>{compactMinutesLabel(month.plannedMinutes)}</strong></div></div>}

        {activeResources.length ? <div className="month-resource-status">{activeResources.slice(0, 6).map((resource, index) => <article style={{ animationDelay: `${index * 35}ms` }} key={resource.resourceId}>
          <div className="month-resource-copy"><span>{resource.subjectName}</span><strong>{resource.resourceName}</strong></div>
          <div className={`month-resource-progress ${resource.progressPercent > 0 ? "has-progress" : "zero-progress"}`}>
            {resource.progressPercent > 0 ? <><div><i style={{ width: `${resource.progressPercent}%` }} /></div><span>%{resource.progressPercent}</span></> : <span>Henüz başlanmadı</span>}
          </div>
          <div className="month-resource-finish"><span>Tahmini bitiş</span><strong>{resource.completed ? "Tamamlandı" : resource.forecastFinishDate ? contextualDateLabel(resource.forecastFinishDate) : "Sınava kadar"}</strong></div>
        </article>)}</div> : <div className="plain-empty roadmap-resource-empty">Bu ay aktif kaynak tahmini yok.</div>}

        {milestones.length ? <div className="compact-milestones">{milestones.map((item) => <article className={item.type} key={`${item.type}-${item.date}-${item.title}`}><i /><div><span>{milestoneType(item.type)} · {eventDate(item)}</span><strong>{item.title}</strong>{item.subjectName && <small>{item.subjectName}</small>}</div></article>)}</div> : <div className="plain-empty">Bu ay için kaynak kilometre taşı yok.</div>}
      </section>
    </> : <div className="plain-empty">Yol haritası henüz hazır değil.</div>}
  </section>;
}
