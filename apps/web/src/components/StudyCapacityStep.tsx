import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { availabilitySaveMessage, availabilityValidationMessage } from "../lib/weekly-availability";
import {
  capacityMinutesLabel, capacitySaveMessage, capacityWeekStarts, weeklyCapacityMinutes,
  type CapacityMode, type CapacityReadiness, type StudyCapacityState,
} from "../lib/study-capacity";
import "./study-capacity.css";

const DAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
type SaveStatus = "loading" | "unchanged" | "unsaved" | "saving" | "saved" | "conflict" | "error";

export function StudyCapacityStep({ profileId, allowDailyDefault, onSaved, onDirty, onContinue }: {
  profileId: string;
  allowDailyDefault: boolean;
  onSaved: (minutes: number) => void;
  onDirty: (dirty: boolean) => void;
  onContinue: () => void;
}) {
  const [state, setState] = useState<StudyCapacityState | null>(null);
  const [mode, setMode] = useState<CapacityMode>("daily_minutes");
  const [days, setDays] = useState(DAYS.map((_, index) => ({ weekday: index + 1, minutes: 0 })));
  const [windows, setWindows] = useState<StudyCapacityState["windows"]>([]);
  const [status, setStatus] = useState<SaveStatus>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [modeConfirmed, setModeConfirmed] = useState(false);
  const [readiness, setReadiness] = useState<CapacityReadiness[]>([]);
  const [readinessError, setReadinessError] = useState(false);
  const dirty = Boolean(state && (mode !== state.mode || JSON.stringify(days) !== JSON.stringify(state.days) || JSON.stringify(windows) !== JSON.stringify(state.windows)));
  const modeChange = Boolean(state && mode !== state.mode && (state.mode === "daily_minutes" || state.windows.length > 0 || !allowDailyDefault));
  const busy = status === "saving" || status === "loading";
  const legacyInvalid = mode === "time_windows" ? availabilityValidationMessage(windows) : null;
  const total = mode === "daily_minutes" ? days.reduce((sum, day) => sum + day.minutes, 0) : state && !legacyInvalid ? weeklyCapacityMinutes({ ...state, mode, windows }) : 0;

  const accept = useCallback((saved: StudyCapacityState, nextStatus: SaveStatus) => {
    setState(saved); setDays(saved.days); setWindows(saved.windows);
    setMode(allowDailyDefault && saved.mode === "time_windows" && saved.windows.length === 0 ? "daily_minutes" : saved.mode);
    setStatus(nextStatus); setModeConfirmed(false); setMessage(null); onSaved(weeklyCapacityMinutes(saved));
  }, [allowDailyDefault, onSaved]);
  const reload = useCallback(async () => {
    setStatus("loading");
    const result = await supabase.rpc("study_capacity_state", { p_exam_profile_id: profileId });
    if (result.error) { setStatus("error"); setMessage("Çalışma sürelerin yüklenemedi. Tekrar dene."); return; }
    accept(result.data as StudyCapacityState, "unchanged");
  }, [accept, profileId]);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  useEffect(() => {
    if (!state) return;
    let active = true;
    setReadiness([]); setReadinessError(false);
    const timer = window.setTimeout(() => {
      void Promise.all(capacityWeekStarts().map(p_week_start => supabase.rpc("study_capacity_readiness", {
        p_exam_profile_id: profileId, p_week_start,
        p_proposed_days: mode === "daily_minutes" ? days : null, p_proposed_mode: mode,
      }))).then(results => {
        if (!active) return;
        if (results.some(result => result.error)) { setReadinessError(true); return; }
        setReadiness(results.map(result => result.data as CapacityReadiness));
      }).catch(() => { if (active) setReadinessError(true); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [state, profileId, mode, days]);

  function changed() { setStatus("unsaved"); setMessage(null); }
  async function save() {
    if (!state || busy || (modeChange && !modeConfirmed)) return;
    const invalid = mode === "time_windows" ? availabilityValidationMessage(windows) : null;
    if (invalid) { setStatus("error"); setMessage(invalid); return; }
    setStatus("saving"); setMessage(null);
    try {
      // Mode changes are explicit; changing legacy windows never switches authority.
      const result = mode === "time_windows" && state.mode === "time_windows"
        ? await supabase.rpc("replace_weekly_availability", {
          p_exam_profile_id: profileId, p_expected_revision: state.windowsRevision,
          p_windows: windows.map(w => ({ weekday: w.weekday, start_time: w.start_time, end_time: w.end_time, label: w.label, is_active: w.is_active })),
        })
        : await supabase.rpc("set_study_capacity", {
          p_exam_profile_id: profileId, p_mode: mode, p_days: mode === "daily_minutes" ? days : null, p_expected_revision: state.revision,
        });
      if (result.error) throw result.error;
      const confirmed = await supabase.rpc("study_capacity_state", { p_exam_profile_id: profileId });
      if (confirmed.error) throw confirmed.error;
      const saved = confirmed.data as StudyCapacityState;
      const normalizedWindows = (rows: StudyCapacityState["windows"]) => rows.map(w => ({ weekday: w.weekday, start: w.start_time.slice(0, 5), end: w.end_time.slice(0, 5), label: w.label?.trim() || null, active: w.is_active !== false })).sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start));
      if (saved.mode !== mode || (mode === "daily_minutes" && JSON.stringify(saved.days) !== JSON.stringify(days)) ||
        (mode === "time_windows" && JSON.stringify(normalizedWindows(saved.windows)) !== JSON.stringify(normalizedWindows(windows)))) throw new Error("CAPACITY_CONFLICT");
      accept(saved, "saved");
    } catch (error) {
      const text = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error);
      setStatus(text.includes("CONFLICT") ? "conflict" : "error");
      setMessage(mode === "time_windows" && text.includes("AVAILABILITY") ? availabilitySaveMessage(text) : capacitySaveMessage(text));
    }
  }

  return <section className="study-capacity" aria-busy={busy}>
    <h2>Hangi gün ne kadar çalışabilirsin?</h2>
    <p>Her gün ayırabileceğin süreyi seç. Saat kaçta çalışacağına kendin karar verebilirsin.</p>
    {!state ? <div role="status">{status === "loading" ? "Çalışma sürelerin yükleniyor…" : message}<button type="button" disabled={busy} onClick={() => void reload()}>Tekrar dene</button></div> : <>
      {mode === "daily_minutes" ? <div className="capacity-days">
        {days.map(day => <div className={`capacity-day${day.minutes ? " selected" : ""}`} key={day.weekday}>
          <label className="capacity-day-toggle"><input type="checkbox" checked={day.minutes > 0} disabled={busy} onChange={event => {
            setDays(current => current.map(d => d.weekday === day.weekday ? { ...d, minutes: event.target.checked ? 60 : 0 } : d)); changed();
          }} />{DAYS[day.weekday - 1]}</label>
          <label className="capacity-duration"><span className="sr-only">{DAYS[day.weekday - 1]} çalışma süresi</span><select aria-label={`${DAYS[day.weekday - 1]} çalışma süresi`} value={day.minutes} disabled={busy} onChange={event => {
            setDays(current => current.map(d => d.weekday === day.weekday ? { ...d, minutes: Number(event.target.value) } : d)); changed();
          }}>
            <option value={0}>Dinlenme günü</option>
            {day.minutes % 30 !== 0 && <option value={day.minutes}>{capacityMinutesLabel(day.minutes)}</option>}
            {Array.from({ length: 48 }, (_, i) => (i + 1) * 30).map(minutes => <option key={minutes} value={minutes}>{capacityMinutesLabel(minutes)}</option>)}
          </select></label>
        </div>)}
      </div> : <div className="capacity-legacy">
        <h3>Kaydettiğin saat aralıkları</h3><p>Planın mevcut saat aralıklarını kullanıyor.</p>
        {windows.map((w, i) => <div className="capacity-window" key={w.id}>
          <select aria-label={`Saat aralığı ${i + 1} günü`} value={w.weekday} disabled={busy || mode !== state.mode} onChange={e => { setWindows(current => current.map((item, n) => n === i ? { ...item, weekday: Number(e.target.value) } : item)); changed(); }}>{DAYS.map((day, n) => <option key={day} value={n + 1}>{day}</option>)}</select>
          <input aria-label={`${DAYS[w.weekday - 1]} başlangıç ${i + 1}`} type="time" value={w.start_time.slice(0, 5)} disabled={busy || mode !== state.mode} onChange={e => { setWindows(current => current.map((item, n) => n === i ? { ...item, start_time: e.target.value } : item)); changed(); }} />
          <input aria-label={`${DAYS[w.weekday - 1]} bitiş ${i + 1}`} type="time" value={w.end_time.slice(0, 5)} disabled={busy || mode !== state.mode} onChange={e => { setWindows(current => current.map((item, n) => n === i ? { ...item, end_time: e.target.value } : item)); changed(); }} />
          <input aria-label={`Saat aralığı ${i + 1} etiketi`} value={w.label ?? ""} disabled={busy || mode !== state.mode} onChange={e => { setWindows(current => current.map((item, n) => n === i ? { ...item, label: e.target.value } : item)); changed(); }} />
          <button type="button" disabled={busy || mode !== state.mode} onClick={() => { setWindows(current => current.filter((_, n) => n !== i)); changed(); }}>Kaldır</button>
        </div>)}
        <button className="capacity-secondary" type="button" disabled={busy || mode !== state.mode} onClick={() => {
          setWindows(current => [...current, { id: crypto.randomUUID(), weekday: 1, start_time: "", end_time: "", label: "", is_active: true } as StudyCapacityState["windows"][number]]); changed();
        }}>Saat aralığı ekle</button>
        {legacyInvalid && <p role="alert">{legacyInvalid}</p>}
      </div>}
      <div className="capacity-total"><span>Haftalık toplam</span><strong>{capacityMinutesLabel(total)}</strong><small>Takvim ve mevcut çalışmalar, bu haftaki kalan süreyi değiştirebilir.</small></div>
      <div className="capacity-readiness" aria-live="polite">
        {total === 0 && <p>Çalışabileceğin en az bir gün seç. Sıfır süreyle plan hazırlanmaya hazır olmaz.</p>}
        {readinessError && <p>Kalan süre hesaplanamadı. Kaydedilmiş sürelerin değişmedi.</p>}
        {readiness.map((r, i) => <p key={i}><strong>{i === 0 ? "Bu hafta" : "Gelecek hafta"}: </strong>{
          r.status === "CAPACITY_TIMED_EXCEPTION_UNSUPPORTED" ? "Saat içeren takvim istisnası nedeniyle hesaplanamıyor." :
          r.protectedWorkExceedsCapacity ? "Seçtiğin süreler mevcut çalışmalarına yetmiyor. Çalışmaların korunuyor." :
          r.remainingMinutes === 0 ? "Kullanılabilir süre kalmadı." : `${capacityMinutesLabel(r.remainingMinutes ?? 0)} kullanılabilir.`
        }</p>)}
        {mode === "daily_minutes" && <p>Bu seçim plan oluşturmaz. İlk plan adımında çalışacağın kaynağı, günü ve süreyi kendin seçebilirsin.</p>}
      </div>
      {state.windows.length > 0 && mode === "daily_minutes" && <button className="capacity-secondary" type="button" disabled={busy} onClick={() => { setMode("time_windows"); setWindows(state.windows); setModeConfirmed(false); changed(); }}>Saklanan saat aralıklarını kullan</button>}
      {mode === "time_windows" && <button className="capacity-secondary" type="button" disabled={busy} onClick={() => { setMode("daily_minutes"); setModeConfirmed(false); changed(); }}>Gün başına süre seç</button>}
      {modeChange && <label className="capacity-mode-confirm"><input type="checkbox" checked={modeConfirmed} disabled={busy} onChange={e => setModeConfirmed(e.target.checked)} />{mode === "daily_minutes" ? "Planlama için gün sürelerimi kullanmayı seçiyorum. Saat aralıklarım saklanacak, süreler birlikte toplanmayacak." : "Planlama için saklanan saat aralıklarımı kullanmayı seçiyorum. Gün sürelerim saklanacak."}</label>}
      <p className={`capacity-save-status ${status}`} role={status === "error" || status === "conflict" ? "alert" : "status"}>{message ?? (status === "saving" ? "Kaydediliyor…" : status === "saved" && !dirty ? "Kaydedildi." : dirty ? "Kaydedilmemiş seçimlerin var." : "Kaydedilmiş sürelerin gösteriliyor.")}</p>
      <div className="capacity-actions"><button type="button" disabled={busy || (modeChange && !modeConfirmed)} onClick={() => void save()}>{status === "saving" ? "Kaydediliyor…" : "Süreleri kaydet"}</button>
        {(status === "error" || status === "conflict") && <button className="capacity-secondary" type="button" disabled={busy} onClick={() => void reload()}>Seçimlerimi bırak, son kaydı yükle</button>}
        <button className="capacity-secondary" type="button" disabled={busy || dirty} onClick={onContinue}>Devam et</button>
      </div>
    </>}
  </section>;
}
