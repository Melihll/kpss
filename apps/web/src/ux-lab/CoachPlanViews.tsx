import { useRef, useState, type PointerEvent } from "react";
import { Icon } from "../components/Icon";
import { useCoachWorkspace } from "./coach-workspace-context";
import { clockTime, DATES, DAYS, duration, SHORT_DAYS, SUBJECTS, taskScope, TODAY, type Material, type Proposal, type Task } from "./model";
import { Button, Progress } from "./ui";

type PlanningActions = { edit: (task: Task | null, day: number, resourceId?: string) => void; capacity: (day: number) => void; review: (proposal: Proposal) => void };
export function CoachWeek({ edit, capacity, review }: PlanningActions) {
  const { state } = useCoachWorkspace();
  const [day, setDay] = useState(TODAY);
  const [dragged, setDragged] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const pointerDrag = useRef<{ task: Task; x: number; y: number } | null>(null);
  const tasks = state.lab.tasks.filter((t) => t.day === day);
  const planned = tasks.reduce((sum, t) => sum + t.minutes, 0);
  function move(task: Task, target: number) {
    if (target === task.day) return;
    setDragged(null); setOver(null);
    review({ version: state.lab.version, title: "Çalışmanın günü değişecek", reason: `${DAYS[task.day]} → ${DAYS[target]}`, changes: [{ before: task, after: { ...task, day: target } }] });
  }
  function pointerTarget(event: PointerEvent): number | null {
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLButtonElement>(".b-week-days button");
    if (!target) return null;
    const index = Array.from(target.parentElement!.children).indexOf(target);
    return index >= TODAY ? index : null;
  }
  function beginDrag(event: PointerEvent<HTMLSpanElement>, task: Task) {
    if (task.done || task.studiedSeconds || state.session?.taskId === task.id && state.session.phase !== "saved") return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerDrag.current = { task, x: event.clientX, y: event.clientY };
    setDragged(task.id);
  }
  function dragMove(event: PointerEvent<HTMLSpanElement>) {
    const drag = pointerDrag.current;
    if (drag && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 8) setOver(pointerTarget(event));
  }
  function endDrag(event: PointerEvent<HTMLSpanElement>) {
    const drag = pointerDrag.current;
    pointerDrag.current = null;
    setDragged(null); setOver(null);
    if (!drag || Math.hypot(event.clientX - drag.x, event.clientY - drag.y) <= 8) return;
    const target = pointerTarget(event);
    if (target !== null) move(drag.task, target);
  }
  return <><header className="b-page-heading"><div><h1>Haftam</h1><span>28 Eylül – 4 Ekim</span></div><Button icon="calendar" onClick={() => edit(null, Math.max(TODAY, day))}>Çalışma ekle</Button></header>
    <div className="b-week-days" aria-label="Haftanın günleri">{DAYS.map((name, index) => { const minutes = state.lab.tasks.filter((t) => t.day === index).reduce((sum, t) => sum + t.minutes, 0); return <button key={name} type="button" aria-pressed={day === index} aria-label={`${name}, ${duration(minutes)} planlandı`} className={over === index ? "b-drop-target" : ""} onClick={() => setDay(index)} onDragOver={(e) => { if (index >= TODAY && dragged) { e.preventDefault(); setOver(index); } }} onDragLeave={() => setOver(null)} onDrop={(e) => { e.preventDefault(); const task = state.lab.tasks.find((t) => t.id === dragged); if (task && index >= TODAY) move(task, index); }}><span>{SHORT_DAYS[index]}{index === TODAY && <i />}</span><strong>{DATES[index]}</strong><span className="b-day-load"><span style={{ width: `${Math.min(100, minutes / state.lab.capacities[index]! * 100)}%` }} /></span><small>{duration(minutes)}</small></button>; })}</div>
    <section className="b-week-list"><header><div><h2>{DAYS[day]}</h2><span className="b-muted">{duration(planned)} planlandı · {duration(state.lab.capacities[day]! - planned)} boş</span></div><Button tone="secondary" icon="timer" disabled={day < TODAY} onClick={() => capacity(day)}>{duration(state.lab.capacities[day]!)} kapasite</Button></header>
      {tasks.length ? <ul>{tasks.map((task) => { const material = state.lab.materials.find((m) => m.id === task.resourceId)!; const active = state.session?.taskId === task.id && state.session.phase !== "saved"; return <li key={task.id} draggable={!task.done && !active && !task.studiedSeconds} onDragStart={(event) => { event.dataTransfer.setData("text/plain", task.id); event.dataTransfer.effectAllowed = "move"; setDragged(task.id); }} onDragEnd={() => { setDragged(null); setOver(null); }} className={task.done ? "is-done" : ""}><span className="b-drag-handle" aria-hidden="true" onPointerDown={(event) => beginDrag(event, task)} onPointerMove={dragMove} onPointerUp={endDrag} onPointerCancel={() => { pointerDrag.current = null; setDragged(null); setOver(null); }}>{task.done ? <Icon name="check" size={18} /> : "⠿"}</span><div className="b-task-name"><span className="b-label">{task.subject}{active ? " · Çalışma açık" : ""}</span><h3>{task.title}</h3><span className="b-muted">{material.name} · {taskScope(task, material)}</span></div><strong className="b-task-duration">{duration(task.minutes)}</strong><div className="b-task-tools">{!task.done && <label><span className="lab-sr-only">{task.title} çalışmasını taşı</span><select aria-label={`${task.title} çalışmasını taşı`} value={task.day} disabled={active || task.studiedSeconds > 0} onChange={(e) => move(task, Number(e.target.value))}>{DAYS.map((name, index) => index >= TODAY && <option key={name} value={index}>{name}</option>)}</select></label>}<Button tone="quiet" disabled={active} onClick={() => edit(task, day)}>{task.done ? "Kaydı gör" : "Düzenle"}</Button></div></li>; })}</ul> : <div className="b-empty"><p>Bu güne çalışma eklenmemiş.</p>{day >= TODAY && <Button tone="secondary" onClick={() => edit(null, day)}>Çalışma ekle</Button>}</div>}
    </section><p className="b-muted b-week-hint">Taşımak için çalışmayı güne sürükle veya gün menüsünü kullan. Değişiklikler onayından sonra uygulanır.</p>
  </>;
}

export function CoachResources({ navigate, edit }: { navigate: (screen: string) => void; edit: PlanningActions["edit"] }) {
  const { state, send } = useCoachWorkspace();
  const [subject, setSubject] = useState("Tümü");
  const [expanded, setExpanded] = useState<string | null>(null);
  const materials = state.lab.materials.filter((m) => m.id !== "account-video" && (subject === "Tümü" || m.subject === subject));
  function continueWith(material: Material) {
    const task = state.lab.tasks.find((t) => t.resourceId === material.id && t.day === TODAY && !t.done);
    if (task) { send({ type: "select", taskId: task.id }); navigate("today"); }
    else edit(null, TODAY, material.id);
  }
  return <><header className="b-page-heading"><div><h1>Kaynaklar</h1><span>{state.lab.materials.length} kaynak · {state.lab.materials.filter((m) => m.status === "active").length} aktif</span></div></header><div className="b-filters" aria-label="Ders filtresi">{["Tümü", ...SUBJECTS].map((name) => <button key={name} aria-pressed={subject === name} onClick={() => setSubject(name)}>{name}</button>)}</div>
    <div className="b-resource-list">{materials.map((material) => { const paired = material.id === "reditus" ? state.playlists["account-video"] : undefined; const player = state.playlists[material.id]; const related = player ?? paired; const task = state.lab.tasks.find((t) => t.resourceId === material.id && t.day === TODAY && !t.done); return <section key={material.id} className="b-resource"><div className={`b-resource-icon ${material.kind}`}><Icon name={material.kind === "video" ? "play" : "book"} size={24} /></div><div className="b-resource-content"><div className="b-resource-title"><div><span className="b-label">{material.subject} · {material.activity}</span><h2>{material.name}</h2></div><span className="b-muted">{material.status === "active" ? "Aktif" : material.status === "queued" ? "Sıradaki" : "Konu bitince"}</span></div><div className="b-resource-facts"><span><strong>{player ? player.completed.length : material.progress}</strong> / {material.total} {material.kind === "video" ? "video" : "sayfa"}</span>{paired && <span><Icon name="play" size={15} /> {paired.completed.length} / {paired.lessons.length} video</span>}<span className="b-muted">{Math.round((player ? player.completed.length : material.progress) / material.total * 100)}%</span></div><Progress value={player ? player.completed.length : material.progress} max={material.total} label={`${material.name} genel ilerleme`} /><div className="b-resource-actions"><button className="b-text-button" aria-expanded={expanded === material.id} aria-controls={`b-source-${material.id}`} onClick={() => setExpanded(expanded === material.id ? null : material.id)}>{expanded === material.id ? "Ayrıntıyı kapat" : "İlerleme ayrıntısı"} <span aria-hidden="true">{expanded === material.id ? "−" : "+"}</span></button><Button tone={task ? "primary" : "secondary"} icon={task ? "play" : "calendar"} onClick={() => continueWith(material)}>{task ? "Çalışmaya devam et" : "Çalışma planla"}</Button></div><div id={`b-source-${material.id}`} hidden={expanded !== material.id} className="b-resource-detail"><dl><div><dt>Son kayıt</dt><dd>{material.kind === "book" ? `Sayfa ${material.progress}` : `${player?.completed.length ?? material.progress} video tamamlandı`}</dd></div><div><dt>Tahmini bitiş</dt><dd>{material.estimate}</dd></div>{related && <div><dt>{paired ? "İlgili video" : "Kaldığın yer"}</dt><dd>{related.current}. {related.lessons[related.current - 1]!.title}<small>{clockTime(related.positions[related.current] ?? 0)} / {clockTime(related.lessons[related.current - 1]!.seconds)}</small></dd></div>}{task && <div><dt>Bugünkü hedef</dt><dd>{taskScope(task, material)} · {duration(task.minutes)}</dd></div>}</dl></div></div></section>; })}</div>
  </>;
}

export function CoachProgress({ navigate }: { navigate: (screen: string) => void }) {
  const { state } = useCoachWorkspace();
  const total = state.lab.tasks.reduce((sum, t) => sum + t.studiedSeconds / 60, 0);
  const planned = state.lab.tasks.reduce((sum, t) => sum + t.minutes, 0);
  const missing = SUBJECTS.filter((subject) => !state.lab.tasks.some((t) => t.subject === subject && t.studiedSeconds > 0));
  return <><header className="b-page-heading"><div><h1>İlerleme</h1><span>28 Eylül – 4 Ekim</span></div></header><div className="b-progress-summary"><span>Bu hafta</span><div><strong>{duration(total)}</strong><span> / {duration(planned)}</span></div><Progress value={total} max={planned} label="Haftalık süre" /><span>{state.lab.tasks.filter((t) => t.done).length} / {state.lab.tasks.length} çalışma tamamlandı</span></div>
    <div className="b-insights-grid"><section><h2>Günlük çalışma</h2><div className="b-daily-chart">{DAYS.map((day, index) => { const tasks = state.lab.tasks.filter((t) => t.day === index); const actual = tasks.reduce((sum, t) => sum + t.studiedSeconds / 60, 0); const target = tasks.reduce((sum, t) => sum + t.minutes, 0); return <div key={day} aria-label={`${day}: ${duration(actual)} / ${duration(target)}`}><span>{duration(actual)}</span><div><i style={{ height: `${Math.min(100, target / 240 * 100)}%` }} /><b style={{ height: `${Math.min(100, actual / 240 * 100)}%` }} /></div><span>{SHORT_DAYS[index]}</span></div>; })}</div><div className="b-chart-legend"><span>● Kaydedilen</span><span>○ Planlanan</span></div></section><section><h2>Ders dağılımı</h2><div className="b-subject-progress">{SUBJECTS.map((subject) => { const tasks = state.lab.tasks.filter((t) => t.subject === subject); const actual = tasks.reduce((sum, t) => sum + t.studiedSeconds / 60, 0); const target = tasks.reduce((sum, t) => sum + t.minutes, 0); return <div key={subject}><span>{subject}</span><Progress value={actual} max={target} label={`${subject} süre`} /><strong>{duration(actual)}</strong></div>; })}</div></section></div><div className="b-progress-note"><Icon name="calendar" size={20} /><div><strong>{missing.length ? missing.join(" · ") : "Tüm derslerde çalışma kaydı var"}</strong><p>{missing.length ? `Bu hafta henüz çalışma kaydı yok. Kalan planda ${duration(state.lab.tasks.filter((t) => !t.done && missing.includes(t.subject)).reduce((sum, t) => sum + t.minutes, 0))} ayrıldı.` : `${state.lab.tasks.filter((t) => !t.done).length} çalışma kaldı.`}</p></div><Button tone="secondary" onClick={() => navigate("week")}>Haftamı aç</Button></div>
    <details className="b-records"><summary>Çalışma kayıtları</summary><ul>{state.lab.tasks.filter((t) => t.studiedSeconds > 0).map((task) => <li key={task.id}><span>{DATES[task.day]} · {task.subject}</span><strong>{task.title}</strong><span>{duration(task.studiedSeconds / 60)}</span></li>)}</ul></details>
  </>;
}

const MONTHS = [
  { name: "Ekim", load: "12 sa / hafta", milestone: "Temel konular", finish: "Muhasebe · Temel kavramlar", start: "Maliye Ders Notları", risk: "İktisat için haftada 2 çalışma", sources: ["Reditus Muhasebe", "Matematik Soru Bankası", "Anayasa Hukuku"] },
  { name: "Kasım", load: "14 sa / hafta", milestone: "İlk kaynakların bitişi", finish: "Reditus Muhasebe · Anayasa Hukuku", start: "Muhasebe Denemeleri", risk: "Muhasebe denemeleri konu bitişini bekliyor", sources: ["Muhasebe Video Dersleri", "Anayasa Hukuku", "Maliye Ders Notları"] },
  { name: "Aralık", load: "15 sa / hafta", milestone: "Soru ağırlıklı çalışma", finish: "Matematik Soru Bankası · Maliye Ders Notları", start: "Karma soru tekrarları", risk: "İktisat video serisi ocak ayına devam ediyor", sources: ["Matematik Soru Bankası", "Maliye Ders Notları", "İktisat Konu Anlatımı"] },
  { name: "Ocak", load: "14 sa / hafta", milestone: "Genel tekrar", finish: "İktisat Konu Anlatımı", start: "Süreli denemeler", risk: "Deneme sıklığı: haftada 1", sources: ["Muhasebe Denemeleri", "Karma soru tekrarları", "İktisat Konu Anlatımı"] },
];
export function CoachRoadmap({ navigate }: { navigate: (screen: string) => void }) {
  const [month, setMonth] = useState(0);
  const current = MONTHS[month]!;
  return <><header className="b-page-heading"><div><h1>Yol Haritası</h1><span>Ekim 2026 – Ocak 2027 · Örnek tahmin</span></div></header><div className="b-months" aria-label="Ay seçimi">{MONTHS.map((item, index) => <button key={item.name} aria-pressed={index === month} onClick={() => setMonth(index)}><span>{item.name}</span><strong>{item.milestone}</strong><small>{item.load}</small></button>)}</div><section className="b-milestone"><header><span className="b-label">{current.name}</span><h2>{current.milestone}</h2><span className="b-muted">{current.load}</span></header><dl><div><dt>Bitecek</dt><dd>{current.finish}</dd></div><div><dt>Başlayacak</dt><dd>{current.start}</dd></div><div><dt>Çalışılacak kaynaklar</dt><dd>{current.sources.map((source) => <span key={source}>{source}</span>)}</dd></div></dl><footer><Icon name="countdown" size={18} /><span>{current.risk}</span><Button tone="quiet" onClick={() => navigate("resources")}>Kaynakları aç <Icon name="arrow" size={15} /></Button></footer></section><div className="b-roadmap-later"><span>Şubat – Nisan <strong>Tekrar ve deneme</strong></span><span>Mayıs – Sınav <strong>Süreli deneme ve analiz</strong></span></div></>;
}
