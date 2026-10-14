import { Link, useSearchParams } from "react-router-dom";
import { useWeeklyStudyView } from "../hooks/useWeeklyStudyView";
import { TaskMaterialSummary } from "../components/TaskMaterialSummary";
import { initialDateLabel } from "../lib/initial-manual-plan";
import { WORK_MODE_LABELS } from "../lib/roadmap";
import { canOpenFirstPlan, fulfillmentLabel, minutesLabel, WEEK_STATUS, type WeekMetrics, type WeekTask } from "../lib/weekly-study-view";
import "./weekly-view.css";

const STATUSES: Record<string, string> = { planned: "Planlandı", ready: "Hazır", pending: "Bekliyor", in_progress: "Çalışılıyor", partially_completed: "Kısmen tamamlandı", completed: "Tamamlandı", missed: "Kaçırıldı", cancelled: "İptal edildi", rescheduled: "Yeniden tarihlendi", blocked: "Engelli" };
export function WeeklyMetrics({ metrics, compact = false }: { metrics: WeekMetrics; compact?: boolean }) {
  const values = [["Beyan", metrics.declaredMinutes], ["Efektif kapasite", metrics.effectiveMinutes], ["Planlandı", metrics.plannedMinutes], ["Plan kredisi", metrics.plannedCreditMinutes], ["Çalışıldı", metrics.actualMinutes], ["Kalan iş", metrics.remainingPlannedMinutes], ["Ayrılmamış zaman", metrics.unallocatedMinutes]] as const;
  return <dl className={`wv-metrics ${compact ? "wv-compact" : ""}`}>{values.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{minutesLabel(value)}</dd></div>)}</dl>;
}
function Task({ task, materialUnavailable }: { task: WeekTask; materialUnavailable?: boolean }) {
  return <details className="wv-task" data-task-id={task.id} data-resource-id={task.resources?.id}>
    <summary><div><strong>{task.subjects?.name ?? "Ders"} · {WORK_MODE_LABELS[task.work_mode ?? "other"] ?? "Çalışma"}</strong><span className="wv-resource">{task.resources?.name ?? "Kaynak bilgisi yok"}</span><small>{minutesLabel(task.estimated_minutes)} planlandı · {minutesLabel(task.plannedCreditMinutes)} kredi · {minutesLabel(task.remainingPlannedMinutes)} kaldı</small></div><span className="wv-task-status">{STATUSES[task.status] ?? task.status}<span aria-hidden="true"> ⌄</span></span></summary>
    <div className="wv-task-detail">{materialUnavailable ? <p role="status">Materyal ayrıntıları yüklenemedi. Kayıtlı görev ve kaynak bilgileri korunuyor.</p> : <TaskMaterialSummary task={task} />}<p>{task.title}{task.description && ` · ${task.description}`}</p>{task.protected && <p>Korunan çalışma · tarih, kaynak ve ilerleme kayıtları korunuyor.</p>}{task.progressMissing && <p role="status">İlerleme kaydı eksik. Kredi ve kalan süre doğrulanamıyor.</p>}<p>Gerçek çalışma süresi, tamamlanmış oturumların başladığı İstanbul gününde sayılır. Göreve verilen kredi kalan işi azaltır; ek çalışma bunu kendiliğinden azaltmaz.</p>{task.eligibleToday && <Link className="secondary-action" to={`/?task=${task.id}`}>Bugün’de aç</Link>}</div>
  </details>;
}
export function WeekPage() {
  const [params, setParams] = useSearchParams();
  const selected = params.get("weekStart") ?? undefined;
  const { data, loading, error, retry } = useWeeklyStudyView(selected);
  return <section className="page-frame wv-page">
    <header className="page-header compact-header"><div><span className="page-eyebrow">Haftam</span><h1>Haftalık çalışmaların</h1><p>Bu hafta neler planladın ve ne kadarını gerçekleştirdin?</p></div><Link className="secondary-action" to="/">Bugün’e dön</Link></header>
    <div className="wv-toolbar">{data && <label>Gösterilen hafta<select value={data.weekStart} onChange={e => setParams({ weekStart: e.target.value })}><option value={data.currentWeek}>Bu hafta · {initialDateLabel(data.currentWeek)}</option><option value={data.nextWeek}>Gelecek hafta · {initialDateLabel(data.nextWeek)}</option>{data.knownHistoricalWeeks.map(w => <option key={w} value={w}>Geçmiş · {initialDateLabel(w)}</option>)}</select></label>}<button className="secondary-action" type="button" disabled={loading} onClick={() => void retry()}>Yenile</button></div>
    {loading && <p role="status">Haftanın kayıtlı görevleri ve çalışma süreleri yükleniyor…</p>}
    {error && <div className="wv-notice" role="alert"><h2>Haftalık veriler yüklenemedi</h2><p>{error === "UNAUTHORIZED" ? "Oturumun sona ermiş. Yeniden giriş yap." : error === "UNSUPPORTED_WEEK" || error === "INVALID_WEEK" ? "Bu hafta görüntülenemiyor. Bu haftaya dönerek tekrar dene." : "Kaydedilmiş çalışmaların korunuyor. Yenile veya mevcut çalışmalarını Bugün’den aç."}</p>{error === "UNAUTHORIZED" ? <Link to="/login">Giriş yap</Link> : <button type="button" onClick={() => setParams({})}>Bu haftayı aç</button>}<Link to="/">Mevcut çalışmalarını aç</Link></div>}
    {data && <>
      <section className="wv-overview" aria-label="Haftalık özet" data-week-start={data.weekStart} data-plan-ids={data.plans.map(p => p.id).join(",")}>
        <div className="wv-overview-heading"><h2>{initialDateLabel(data.weekStart)} — {initialDateLabel(data.weekEnd)}</h2><span>{data.mode === "daily_minutes" ? "Günlük süre" : "Saat aralığı"} · İstanbul takvimi</span></div>
        <WeeklyMetrics metrics={data.totals} />
        <p className="wv-explainer">Plan karşılığı <strong>{fulfillmentLabel(data.totals.planFulfillmentPercent)}</strong> · {data.totals.completedTaskCount} / {data.totals.taskCount} görev tamamlandı. {minutesLabel(data.totals.extraActualMinutes)} ek çalışma; ek süre plan kredisine eklenmez.</p>
        <details className="wv-definition"><summary>Bu sayılar ne anlama geliyor?</summary><p>Beyan: kaydettiğin haftalık gün süreleri. Efektif kapasite: seçili haftada geçmiş gün, sınav takvimi, dönem, istisna ve rezervlerden sonra kalan kapasite. Planlandı: tamamlanan görevler dahil başlangıç taahhüdü. Plan kredisi: bu görevlerin kazanılmış karşılığı. Çalışıldı: bu hafta başlayan tamamlanmış oturumların gerçek süresi; aktif sayaç dahil değil. Kalan iş: açık görevlerin kalan yükü. Ayrılmamış zaman: gerçek çalışma ve kredi politikaları ile haftalık tavanı aşmadan, kalan işin ötesinde kullanılabilen süre. Geçmişte kalan iş otomatik taşınmaz. N/A: doğrulanamayan veya paydası sıfır değer.</p><p>Takvimde kazanılan plan kredisi: {minutesLabel(data.totals.calendarPlannedCreditMinutes)}. Görevlerin başka tarihlerde tamamlanması durumunda bu değer seçili haftanın görev kredisinden farklı olabilir.</p>{data.totals.weeklyCeilingMinutes != null && <p>Haftalık planlama tavanı: {minutesLabel(data.totals.weeklyCeilingMinutes)}. Günlerin kapasitesi bu tavandan ayrı gösterilir; ayrılmamış haftalık zaman tavana tabidir.</p>}</details>
        {data.totals.activeSessionCount > 0 && <p role="status">{data.totals.activeSessionCount} açık çalışma oturumu var. Süresi bitirilene kadar gerçekleşen toplamına eklenmez.</p>}
      </section>
      {data.capacityStatus !== "SUPPORTED" && <div className="wv-notice" role="status"><p>{WEEK_STATUS[data.capacityStatus] ?? data.capacityStatus}</p><Link to="/onboarding?step=capacity">Zamanını gözden geçir</Link></div>}
      {!!data.dataWarnings.length && <p className="wv-notice" role="status">Bazı kayıtlar eksik. N/A değerleri 0 kabul edilmedi. Verileri yenileyip mevcut çalışmanı Bugün’den kontrol edebilirsin.</p>}
      {data.initialPlanStartDate && data.initialPlanStartDate > data.today && <div className="wv-notice">İlk planın {initialDateLabel(data.initialPlanStartDate)} başlıyor. {data.initialPlanStartDate >= data.nextWeek && data.weekStart !== data.nextWeek && <button type="button" onClick={() => setParams({ weekStart: data.nextWeek })}>Gelecek haftayı gör</button>}</div>}
      {!data.totals.taskCount && <div className="wv-notice"><h2>Bu haftada planlanmış çalışma yok</h2>{data.upcomingStartDate && <p>Kayıtlı çalışman {initialDateLabel(data.upcomingStartDate)} başlıyor. Tarihi gelince Bugün’de görünecek.</p>}{canOpenFirstPlan(data) ? <Link className="primary-action" to="/first-plan">İlk planını incele</Link> : data.hasAnyPlan || data.hasProtectedWork ? <p>Mevcut plan ve korunan görevlerin saklanıyor. Bu ekran yeni plan oluşturmaz.</p> : <p>İlk plan için hedef, çalışabileceğin zaman ve uygun kaynak gerekiyor.</p>}{data.totals.declaredMinutes === 0 && <p>Kaydedilmiş haftalık kapasiten 0 dk. Çalışabileceğin günlere süre ekle.</p>}{data.totals.effectiveMinutes === 0 && data.totals.declaredMinutes !== 0 && <p>Seçili haftada kullanılabilir zaman kalmadı. Gelecek haftayı veya zaman ayarlarını incele.</p>}{data.firstPlan.reasons?.includes("MISSING_SUITABLE_RESOURCE") && <p>Plan için seçili bir derse uygun aktif kaynak ekle.</p>}<div className="wv-links"><Link to="/onboarding?step=capacity">Zamanını düzenle</Link><Link to="/onboarding?step=resources">Kaynaklarını aç</Link></div></div>}
      {!!data.firstPlan.subjectsWithoutSources.length && <p className="wv-notice">Kaynağı olmayan dersler: {data.firstPlan.subjectsWithoutSources.map(s => s.name).join(", ")}. Bu dersler için kendiliğinden görev oluşturulmaz. <Link to="/onboarding?step=resources">Kaynak ekle</Link></p>}
      {data.periods.filter(p => p.start_date <= data.weekEnd && p.end_date >= data.weekStart).map((p, i) => <p className="wv-notice" key={i}>Takvim dönemi: {p.name} · kapasite çarpanı {p.capacity_multiplier}</p>)}
      <div className="wv-days">{data.days.map(day => <article key={day.date} className={`wv-day ${day.date === data.today ? "wv-today" : ""}`} data-date={day.date}>
        <header><h2>{initialDateLabel(day.date)}</h2><span>{day.date === data.today ? "Bugün · " : ""}{day.tasks.length} görev</span></header>
        <WeeklyMetrics metrics={day} compact />
        {day.status !== "SUPPORTED" && <p className="wv-day-note">{WEEK_STATUS[day.status] ?? day.status}</p>}
        {day.extraActualMinutes !== 0 && <p className="wv-day-note">Ek çalışma: {minutesLabel(day.extraActualMinutes)} · plan karşılığına eklenmez</p>}
        {day.exceptions.map((x, i) => <p className="wv-day-note" key={i}>İstisna: {x.exception_type === "unavailable" ? "Müsait değil" : "Özel düzenleme"}{x.start_time && ` · ${x.start_time.slice(0, 5)}–${x.end_time?.slice(0, 5)}`}{x.minutes_delta != null && ` · ${x.minutes_delta > 0 ? "+" : ""}${x.minutes_delta} dk`}</p>)}
        {day.overrides.map((x, i) => <p className="wv-day-note" key={i}>Gün düzenlemesi: {x.capacity_minutes} dk kapasite · {x.reserve_minutes} dk rezerv</p>)}
        {!!day.warnings.length && <p className="wv-day-note">{day.warnings.includes("COMPLETED_WITH_PARTIAL_CREDIT") ? "Görev tamamlandı; kaydedilmiş kredi taahhütten az. Kalan yük 0, kredi değiştirilmedi." : "Muhasebe kaydı eksik veya tutarsız. Bilinmeyen süreler N/A."}</p>}
        {day.tasks.length ? <div className="wv-tasks">{day.tasks.map(t => <Task key={t.id} task={t} materialUnavailable={data.materialDetailsUnavailable} />)}</div> : <p className="wv-empty-day">Planlanmış çalışma yok.</p>}
      </article>)}</div>
    </>}
  </section>;
}
