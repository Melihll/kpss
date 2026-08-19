import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AppApiError } from "../lib/app-api";
import { callAiCoachPreview, type AiCoachPlanPreviewResponse } from "../lib/ai-coach-api";
import { presentAiCoachPreview } from "../lib/ai-coach-presenter";
import { supabase } from "../lib/supabase";
import { Icon } from "./Icon";

export type CoachDrawerMode = "default" | "capacity";

interface CoachDrawerProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly mode?: CoachDrawerMode;
}

const QUICK_PROMPTS = [
  "Yarın 60 dakika daha çalışabilirim.",
  "Yarın 30 dakika daha az vaktim var.",
] as const;

const CAPACITY_QUICK_PROMPTS = [
  "Bugün 1 saat daha az vaktim var.",
  "Yarın 60 dakika daha çalışabilirim.",
  "Yarın toplam 2 saat çalışabilirim.",
  "Bugün çalışamayacağım.",
] as const;

export function CoachDrawer({ open, onClose, mode = "default" }: CoachDrawerProps) {
  const [profileId, setProfileId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [submittedMessage, setSubmittedMessage] = useState<string | null>(null);
  const [response, setResponse] = useState<AiCoachPlanPreviewResponse | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [sending, setSending] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const quickPrompts = mode === "capacity" ? CAPACITY_QUICK_PROMPTS : QUICK_PROMPTS;

  useEffect(() => {
    if (!open) return;
    setMessage("");
    setSubmittedMessage(null);
    setResponse(null);
    setDetailsOpen(false);
    setError(null);
  }, [mode, open]);

  useEffect(() => {
    if (!open || profileId) return;
    let active = true;
    setLoadingProfile(true);

    void (async () => {
      try {
        const { data, error: profileError } = await supabase
          .from("exam_profiles")
          .select("id")
          .eq("status", "active")
          .maybeSingle();

        if (!active) return;
        if (profileError) {
          console.error("AI_COACH_PROFILE_LOAD_FAILED", profileError);
          setError("Aktif çalışma profili bulunamadı.");
          return;
        }

        setProfileId(data?.id ?? null);
        if (!data?.id) setError("Aktif çalışma profili bulunamadı.");
      } catch (caught) {
        if (!active) return;
        console.error("AI_COACH_PROFILE_LOAD_FAILED", caught);
        setError("Aktif çalışma profili bulunamadı.");
      } finally {
        if (active) setLoadingProfile(false);
      }
    })();

    return () => { active = false; };
  }, [open, profileId]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    window.setTimeout(() => textareaRef.current?.focus(), 120);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  const presentation = useMemo(
    () => response ? presentAiCoachPreview(response) : null,
    [response],
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    const normalized = message.trim();
    if (!profileId || !normalized || sending) return;
    setSending(true);
    setDetailsOpen(false);
    setError(null);
    setSubmittedMessage(normalized);
    try {
      const result = await callAiCoachPreview(profileId, normalized);
      setResponse(result);
      setMessage("");
    } catch (caught) {
      console.error("AI_COACH_PREVIEW_FAILED", caught);
      setResponse(null);
      setError(caught instanceof AppApiError ? caught.message : "Koç yanıtı alınamadı. Tekrar deneyebilirsin.");
    } finally {
      setSending(false);
    }
  }

  return <>
    <button
      className={`coach-drawer-backdrop ${open ? "is-open" : ""}`}
      type="button"
      aria-label="Koçu kapat"
      tabIndex={open ? 0 : -1}
      onClick={onClose}
    />
    <aside className={`coach-drawer ${open ? "is-open" : ""}`} role="dialog" aria-modal="true" aria-hidden={!open} aria-labelledby="coach-drawer-title">
      <header className="coach-drawer-header">
        <div className="coach-drawer-brand"><span><Icon name="spark" weight="fill" /></span><div><small>AI destekli</small><strong id="coach-drawer-title">KPSS Koçu</strong></div></div>
        <button className="coach-close" type="button" aria-label="Koçu kapat" onClick={onClose}><Icon name="close" /></button>
      </header>

      <div className="coach-drawer-body">
        {!submittedMessage && <section className="coach-intro">
          <span className="coach-kicker">{mode === "capacity" ? "Vaktini plana yansıt" : "Programını birlikte düşünelim"}</span>
          <h2>{mode === "capacity" ? "Vaktin nasıl değişti?" : "Bugün ne değişti?"}</h2>
          <p>{mode === "capacity"
            ? "Daha az ya da daha fazla çalışabileceğin süreyi yaz. Önce etkisini gösteririm; planında değişiklik yapmam."
            : "Vaktindeki değişikliği veya çalışma durumunu yaz. Koç önce anlamlandırır, sonra planına dokunmadan etkisini hesaplar."
          }</p>
          <div className="coach-quick-prompts">
            {quickPrompts.map((prompt) => <button type="button" key={prompt} onClick={() => { setMessage(prompt); textareaRef.current?.focus(); }}>{prompt}</button>)}
          </div>
        </section>}

        {submittedMessage && <div className="coach-user-message"><span>Sen</span><p>{submittedMessage}</p></div>}

        {sending && <div className="coach-thinking" aria-live="polite"><span><Icon name="spark" /></span><div><strong>Planını kontrol ediyorum</strong><p>Mesajını yorumlayıp Planning V2 önizlemesiyle karşılaştırıyorum.</p></div></div>}

        {presentation && !sending && <article className={`coach-result tone-${presentation.tone}`} aria-live="polite">
          <span className="coach-result-eyebrow">{presentation.eyebrow}</span>
          <h3>{presentation.title}</h3>
          <p>{presentation.body}</p>
          {presentation.stats.length > 0 && <dl>{presentation.stats.map((stat) => <div key={stat.label}><dt>{stat.label}</dt><dd>{stat.value}</dd></div>)}</dl>}
          {presentation.changes.length > 0 && <div className="coach-change-section">
            <button
              className="coach-change-toggle"
              type="button"
              aria-expanded={detailsOpen}
              onClick={() => setDetailsOpen((value) => !value)}
            >
              <span>{detailsOpen ? "Değişiklikleri gizle" : "Değişiklikleri gör"}</span>
              <Icon name="arrow" />
            </button>
            {detailsOpen && <>
              <div className="coach-change-summary" aria-label="Değişiklik özeti">
                <strong>{presentation.changes.length} değişiklik</strong>
                <span>{presentation.changes.filter((change) => change.changeType === "MOVE").length} taşındı · {presentation.changes.filter((change) => change.changeType === "BACKLOG").length} sonraya kaldı</span>
              </div>
              <div className="coach-change-list">
                {presentation.changes.map((change) => <article key={`${change.changeType}:${change.taskId}`} className={`coach-change-item is-${change.changeType.toLowerCase()}`}>
                  <div className="coach-change-heading">
                    <span>{change.subject}</span>
                    <strong>{change.title}</strong>
                    {change.resource && change.resource !== change.title && <small>{change.resource}</small>}
                  </div>
                  <div className="coach-change-meta">
                    <strong>{change.schedule}</strong>
                    <span>{change.remaining}</span>
                  </div>
                  <div className="coach-change-footer">
                    <span className="coach-change-reason">{change.reason}</span>
                    {change.changeType === "BACKLOG" && <span className="coach-change-state">Sonraya kaldı</span>}
                  </div>
                </article>)}
                {!presentation.changeDetailsComplete && <p className="coach-change-partial">Bazı görev detayları şu anda gösterilemiyor; özet hesap değişmedi.</p>}
              </div>
            </>}
          </div>}
          {presentation.note && <div className="coach-preview-note"><Icon name="check" /><span>{presentation.note}</span></div>}
        </article>}

        {error && !sending && <div className="coach-error" role="alert"><Icon name="warning" /><span>{error}</span></div>}
      </div>

      <form className="coach-composer" onSubmit={(event) => void submit(event)}>
        <textarea
          ref={textareaRef}
          value={message}
          rows={3}
          maxLength={1200}
          placeholder={mode === "capacity" ? "Örn. Yarın toplam 2 saat çalışabilirim." : "Örn. Yarın 60 dakika daha çalışabilirim."}
          aria-label="Koça mesaj yaz"
          disabled={sending || loadingProfile || !profileId}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <div><small>{loadingProfile ? "Profil hazırlanıyor…" : "Enter gönderir · Shift+Enter yeni satır"}</small><button type="submit" disabled={sending || !profileId || !message.trim()} aria-label="Mesajı gönder"><Icon name="arrow" weight="bold" /></button></div>
      </form>
    </aside>
  </>;
}
