import { Icon } from "../components/Icon";
import { useLab } from "./context";
import { DAYS, SHORT_DAYS, TODAY, duration, studiedMinutes, taskScope, type Task } from "./model";
import { Badge, Button, EmptyState, PageHeading, Progress, SectionHeading, TaskCard } from "./ui";

function DailyProgress({ tasks }: { tasks: Task[] }) {
  const actual = studiedMinutes(tasks);
  const target = tasks.reduce((sum, t) => sum + t.minutes, 0);
  return <section className="lab-daily-progress"><div><span className="lab-eyebrow">Bugünkü emeğin</span><strong>{duration(actual)} <small>/ {duration(target)}</small></strong></div><div><Progress value={actual} max={target} label="Bugünkü çalışma hedefi" /><span className="lab-muted">{tasks.filter((t) => t.done).length} / {tasks.length} çalışma tamamlandı</span></div></section>;
}
function NextWork({ task }: { task: Task }) {
  const { state, start, resource } = useLab();
  const material = state.materials.find((m) => m.id === task.resourceId)!;
  return <section className="lab-next-work">
    <div className="lab-next-top"><span className="lab-eyebrow"><span className="lab-live-dot" /> ŞİMDİ ODAKLAN</span><Badge>{duration(task.minutes)}</Badge></div>
    <div className="lab-next-body"><span className="lab-subject-label">{task.subject} <span> / </span> {material.activity}</span><h2>{task.title}</h2><p>{material.name} <span>·</span> {taskScope(task, material)}</p></div>
    <div className="lab-next-bottom"><Button icon="play" onClick={() => start(task)}>Şimdi çalış</Button><button className="lab-text-link" onClick={() => resource(material)}>Kaynağı incele <Icon name="arrow" size={16} /></button></div>
    <div className="lab-next-note"><Icon name="target" size={16} /><span>Küçük bir adım. Bir konu daha net.</span></div>
  </section>;
}
function DailyBrief({ next }: { next: Task | undefined }) {
  const { state } = useLab();
  const material = state.materials.find((m) => m.id === next?.resourceId);
  return <section className="lab-coach-brief"><span className="lab-eyebrow">KOÇUNDAN GÜNÜN NOTU</span><h2>{next ? `Önce ${next.subject.toLocaleLowerCase("tr-TR")}, sonra kısa bir nefes.` : "Bugün kendine de alan aç."}</h2><p>{next && material ? `${material.name} ile devam edebilirsin. Kısa ve belirli bir hedef, başlamanı kolaylaştırır.` : "Sırada bekleyen çalışman yok. İstersen haftana göz atabilir veya dinlenebilirsin."}</p>{next && material && <details><summary>Neden bu sıra?</summary><p>{material.kind === "video" ? `${material.progress} videoyu tamamladın.` : `Kaynağında ${material.progress}. sayfadasın.`} Bugünkü hedefin {taskScope(next, material).toLocaleLowerCase("tr-TR")}. Önce bu çalışmayı tamamlayıp sonraki adıma geçebilirsin.</p></details>}</section>;
}
export function Today() {
  const { state, concept, start, resource, navigate } = useLab();
  const tasks = state.tasks.filter((t) => t.day === TODAY);
  const next = tasks.find((t) => !t.done);
  const remaining = tasks.filter((t) => !t.done && t.id !== next?.id);
  const completed = tasks.filter((t) => t.done);
  return <>
    <PageHeading eyebrow="1 EKİM PERŞEMBE" title={concept === "coach" ? "Her gün, biraz daha ileri." : "Günaydın, Deniz."} description="Bugün büyük bir sıçrama değil, iyi bir adım yeter.">
      <span className="lab-streak"><Icon name="check" size={16} /> 4 gündür buradasın</span>
    </PageHeading>
    <div className="lab-today-composition">
      {concept === "coach" && <DailyBrief next={next} />}
      <div className="lab-today-main">
        {next ? <NextWork task={next} /> : <EmptyState title={tasks.length ? "Bugünkü planın tamamlandı." : "Bugün sana ait."} description={tasks.length ? "Emeğini kaydettik. Şimdi kendine biraz zaman ayır." : "İstersen hafif bir çalışma ekleyebilir veya dinlenmeye zaman ayırabilirsin."}><Button tone="secondary" onClick={() => navigate("week")}>Haftama bak</Button></EmptyState>}
        {tasks.length > 0 && <DailyProgress tasks={tasks} />}
        <section className="lab-up-next"><SectionHeading title="Günün devamı" aside={<button className="lab-text-link" onClick={() => navigate("week")}>Haftam <Icon name="arrow" size={15} /></button>} />
          {remaining.length ? remaining.map((task) => <TaskCard key={task.id} task={task} material={state.materials.find((m) => m.id === task.resourceId)!} onStart={() => start(task)} onResource={() => resource(state.materials.find((m) => m.id === task.resourceId)!)} />) : <p className="lab-muted">Sırada başka çalışma yok.</p>}
          {completed.length > 0 && <details className="lab-completed"><summary>{completed.length} tamamlanan çalışma</summary>{completed.map((task) => <TaskCard key={task.id} task={task} material={state.materials.find((m) => m.id === task.resourceId)!} />)}</details>}
        </section>
      </div>
      <aside className="lab-today-aside">
        {concept === "product" && <section className="lab-surface"><SectionHeading title="Haftanın ritmi" aside={<Icon name="chart" size={18} />} /><strong className="lab-big-number">{duration(studiedMinutes(state.tasks))}</strong><p className="lab-muted">Bu hafta kendine ayırdığın zaman</p><div className="lab-mini-week">{DAYS.map((day, i) => { const value = studiedMinutes(state.tasks.filter((t) => t.day === i)); return <div key={day} className={i === TODAY ? "is-today" : ""}><div><i style={{ height: `${Math.max(3, value / 120 * 70)}px` }} /></div><span>{SHORT_DAYS[i]}</span></div>; })}</div><button className="lab-text-link" onClick={() => navigate("progress")}>İlerlememi gör <Icon name="arrow" size={15} /></button></section>}
        <section className="lab-coach-note"><span className="lab-coach-symbol"><Icon name="spark" size={20} /></span><span className="lab-eyebrow">KÜÇÜK BİR HATIRLATMA</span><h3>Planın sana uyum sağlasın.</h3><p>Yarın daha az vaktin varsa haftanın kalanını birlikte düzenleyebiliriz.</p><Button tone="secondary" onClick={() => navigate("coach")}>Koçla konuş <Icon name="arrow" size={16} /></Button></section>
        {concept === "product" && <section className="lab-resource-peek"><span className="lab-eyebrow">KALDIĞIN YER</span><h3>Reditus Muhasebe</h3><p>{state.materials[0]!.progress} / 480 sayfa</p><Progress value={state.materials[0]!.progress} max={480} label="Reditus ilerlemesi" /><button className="lab-text-link" onClick={() => resource(state.materials[0]!)}>Kaynağı aç <Icon name="arrow" size={15} /></button></section>}
      </aside>
    </div>
  </>;
}
