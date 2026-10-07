import { useState } from "react";
import { Icon } from "../components/Icon";
import { useLab } from "./context";
import { DAYS, DATES, SHORT_DAYS, SUBJECT_COLORS, TODAY, coachProposal, duration } from "./model";
import { Badge, Button, PageHeading, Progress } from "./ui";

export function Week() {
  const { state, concept, edit, capacity, review, navigate } = useLab();
  const [selected, setSelected] = useState(TODAY);
  const tasks = state.tasks;
  const planned = tasks.reduce((sum, t) => sum + t.minutes, 0);
  const total = state.capacities.reduce((sum, n) => sum + n, 0);
  const days = concept === "product" ? DAYS.map((_, i) => i) : [selected];
  return <>
    <PageHeading eyebrow="HAFTAM · 28 EYLÜL — 4 EKİM" title="Haftana yer aç." description="Biraz düzen, biraz esneklik. Her gün için gerçekçi bir adım."><Button tone="secondary" icon="spark" onClick={() => navigate("coach")}>Birlikte düzenleyelim</Button></PageHeading>
    <section className="lab-week-summary"><div><span className="lab-muted">Planlanan</span><strong>{duration(planned)}</strong></div><div><span className="lab-muted">Ayırdığın toplam süre</span><strong>{duration(total)}</strong></div><div><Progress value={planned} max={total} label="Haftalık süre kullanımı" /><small>Boş kalan süre, mola ve esneklik için.</small></div></section>
    {concept === "coach" && <section className="lab-inline-coach"><Icon name="spark" /><div><strong>Cuma günü daha az vaktin mi var?</strong><p>Matematiği cumartesiye taşıyıp cuma gününe alan açabilirsin.</p></div><Button tone="secondary" onClick={() => review(coachProposal(state))}>Öneriyi incele</Button></section>}
    <nav className={`lab-days ${concept === "product" ? "product-days" : ""}`} aria-label="Haftanın günleri">{DAYS.map((day, i) => <button key={day} aria-current={selected === i ? "date" : undefined} onClick={() => setSelected(i)}><span>{SHORT_DAYS[i]}</span><strong>{DATES[i]}</strong><span>{duration(tasks.filter((t) => t.day === i).reduce((sum, t) => sum + t.minutes, 0))}</span>{i === TODAY && <i />}</button>)}</nav>
    <div className={`lab-week-board ${concept === "product" ? "is-board" : ""}`}>{days.map((day) => {
      const dayTasks = tasks.filter((t) => t.day === day);
      const dayTotal = dayTasks.reduce((sum, t) => sum + t.minutes, 0);
      return <section key={day} className={`lab-day-column ${day === selected ? "selected-day" : ""} ${day === TODAY ? "current-day" : ""}`}>
        <header><div><h2>{DAYS[day]}</h2><span className="lab-muted">{DATES[day]}{day === TODAY ? " · Bugün" : ""}</span></div>{day === TODAY && <Badge tone="success">Bugün</Badge>}</header>
        <div className="lab-day-capacity"><span>{duration(dayTotal)} / {duration(state.capacities[day]!)}</span>{day >= TODAY && <button className="lab-text-link" aria-label={`${DAYS[day]} ayırdığım süreyi düzenle`} onClick={() => capacity(day)}>Süreyi ayarla</button>}</div>
        <Progress value={dayTotal} max={state.capacities[day]!} label={`${DAYS[day]} ayrılan süre`} />
        <div className="lab-day-tasks">{dayTasks.map((task) => <button key={task.id} className={`lab-week-task ${task.done ? "is-complete" : ""}`} onClick={() => edit(task, day)} aria-label={`${task.subject}, ${task.title}, ${duration(task.minutes)}${task.done ? ", tamamlandı" : ", düzenle"}`}><span className="lab-week-task-subject"><i style={{ background: SUBJECT_COLORS[task.subject] }} />{task.subject}{task.done && <Icon name="check" size={16} />}</span><strong>{task.title}</strong><span>{duration(task.minutes)} · {state.materials.find((m) => m.id === task.resourceId)?.kind === "video" ? "Video ders" : `s. ${task.start}–${task.end}`}</span></button>)}</div>
        {!dayTasks.length && <p className="lab-day-empty">Planında boş bir alan.<br />Dinlenmek de ilerlemenin bir parçası.</p>}
        {day >= TODAY && <button className="lab-add-work" onClick={() => edit(null, day)}><span>＋</span> Çalışma ekle</button>}
      </section>;
    })}</div>
    <p className="lab-footnote"><Icon name="calendar" size={16} /> Bir çalışmayı seçerek süresini veya gününü değiştirebilirsin. Değişiklikler önce incelemene sunulur.</p>
  </>;
}
