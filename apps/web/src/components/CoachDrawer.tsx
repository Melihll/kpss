import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  COACH_CONVERSATION_CONTEXT_V1_VERSION,
  COACH_CONVERSATION_MAX_TURNS_V1,
  COACH_CONVERSATION_TURN_MAX_LENGTH_V1,
  type CoachConversationInputV1,
  type CoachConversationTurnV1,
} from "@kpss-coach/domain";
import { AppApiError, FRIENDLY_API_ERRORS, callAppApi } from "../lib/app-api";
import { callAiCoachPreview, callReactiveCoach, type AiCoachApplyResponse, type AiCoachPlanPreviewResponse, type ReactiveCoachResponseV1 } from "../lib/ai-coach-api";
import { presentAiCoachPreview } from "../lib/ai-coach-presenter";
import { supabase } from "../lib/supabase";
import { Icon } from "./Icon";
import { PlannerCoachExplanationCard } from "./PlannerCoachExplanationCard";

export type CoachDrawerMode = "default" | "capacity";

interface CoachDrawerProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly mode?: CoachDrawerMode;
  readonly onApplied?: () => void;
}

const QUICK_PROMPTS = [
  "Planımda sorun var mı?",
  "Planner ne görüyor?",
  "Bu hafta planı yenilemeli miyim?",
] as const;

interface ReactiveCoachExchange {
  readonly userMessage: string;
  readonly response: ReactiveCoachResponseV1;
}

function clipConversationText(
  value: string,
): string {
  return Array.from(
    value
      .normalize("NFC")
      .trim(),
  )
    .slice(
      0,
      COACH_CONVERSATION_TURN_MAX_LENGTH_V1,
    )
    .join("");
}

function buildReactiveConversationContext(
  history: readonly ReactiveCoachExchange[],
): CoachConversationInputV1 | undefined {
  if (history.length === 0) {
    return undefined;
  }

  const turns:
    CoachConversationTurnV1[] =
      history.flatMap(
        (exchange) => [
          {
            role:
              "user" as const,
            text:
              clipConversationText(
                exchange.userMessage,
              ),
          },
          {
            role:
              "assistant" as const,
            text:
              clipConversationText(
                exchange.response
                  .execution
                  .response
                  .answer,
              ),
          },
        ],
      );

  return {
    version:
      COACH_CONVERSATION_CONTEXT_V1_VERSION,

    recentTurns:
      turns.slice(
        -COACH_CONVERSATION_MAX_TURNS_V1,
      ),
  };
}

const CAPACITY_QUICK_PROMPTS = [
  "Bugün 1 saat daha az vaktim var.",
  "Yarın 60 dakika daha çalışabilirim.",
  "Yarın toplam 2 saat çalışabilirim.",
  "Bugün çalışamayacağım.",
] as const;

export function CoachDrawer({ open, onClose, mode = "default", onApplied }: CoachDrawerProps) {
  const [profileId, setProfileId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [submittedMessage, setSubmittedMessage] = useState<string | null>(null);
  const [response, setResponse] = useState<AiCoachPlanPreviewResponse | null>(null);
  const [reactiveHistory, setReactiveHistory] = useState<readonly ReactiveCoachExchange[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [sending, setSending] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState<AiCoachApplyResponse | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const quickPrompts = mode === "capacity" ? CAPACITY_QUICK_PROMPTS : QUICK_PROMPTS;

  useEffect(() => {
    if (!open) return;
    setMessage("");
    setSubmittedMessage(null);
    setResponse(null);
    setReactiveHistory([]);
    setApplied(null);
    setDetailsOpen(false);
    setError(null);
  }, [mode, open]);

  useEffect(() => {
    if (!open || mode !== "capacity" || profileId) return;
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
  }, [mode, open, profileId]);

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
    if ((mode === "capacity" && !profileId) || !normalized || sending) return;
    setSending(true);
    setDetailsOpen(false);
    setError(null);
    setSubmittedMessage(normalized);
    try {
      if (mode === "capacity") {
        const result = await callAiCoachPreview(profileId!, normalized);
        setResponse(result);
        setReactiveHistory([]);
      } else {
        const result =
          await callReactiveCoach(
            normalized,
            buildReactiveConversationContext(
              reactiveHistory,
            ),
          );

        setReactiveHistory(
          (current) => [
            ...current,
            {
              userMessage:
                normalized,
              response:
                result,
            },
          ].slice(-3),
        );

        setResponse(null);
        setSubmittedMessage(null);
      }
      setMessage("");
    } catch (caught) {
      console.error("AI_COACH_PREVIEW_FAILED", caught);
      setResponse(null);
      setError(caught instanceof AppApiError ? caught.message : "Koç yanıtı alınamadı. Tekrar deneyebilirsin.");
    } finally {
      setSending(false);
    }
  }

  async function applyConfirmed() {
    const proposalId = response?.status === "VALID"
      ? response.confirmation?.proposalId
      : undefined;
    if (!proposalId || applying) return;
    setApplying(true);
    setError(null);
    try {
      const result = await callAppApi<AiCoachApplyResponse>(
        "/plans/current/apply-confirmed",
        { method: "POST", body: { proposalId } },
      );
      setApplied(result);
      window.dispatchEvent(new Event("kpss:execution-changed"));
      onApplied?.();
    } catch (caught) {
      console.error("AI_COACH_APPLY_FAILED", caught);
      setError(caught instanceof AppApiError
        ? FRIENDLY_API_ERRORS[caught.code] ?? "Öneri uygulanamadı. Güncel bir önizleme oluşturun."
        : "Öneri uygulanamadı. Güncel bir önizleme oluşturun.");
    } finally {
      setApplying(false);
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
        {!submittedMessage && (mode === "capacity" || reactiveHistory.length === 0) && <section className="coach-intro">
          <span className="coach-kicker">{mode === "capacity" ? "Vaktini plana yansıt" : "Planını birlikte değerlendirelim"}</span>
          <h2>{mode === "capacity" ? "Vaktin nasıl değişti?" : "Planner hakkında ne bilmek istiyorsun?"}</h2>
          <p>{mode === "capacity"
            ? "Daha az ya da daha fazla çalışabileceğin süreyi yaz. Önce etkisini gösteririm; planında değişiklik yapmam."
            : "Koç mevcut canonical Planner kanıtını açıklar. Sohbet mesajı planını onaylamaz, uygulamaz veya değiştirmez."
          }</p>
          <div className="coach-quick-prompts">
            {quickPrompts.map((prompt) => <button type="button" key={prompt} onClick={() => { setMessage(prompt); textareaRef.current?.focus(); }}>{prompt}</button>)}
          </div>
        </section>}

        {mode === "default" && reactiveHistory.map((exchange, index) => <div
          key={`${index}:${exchange.userMessage}`}
          className="coach-conversation-exchange"
        >
          <div className="coach-user-message">
            <span>Sen</span>
            <p>{exchange.userMessage}</p>
          </div>

          {exchange.response.execution.response.plannerExplanation
            ? <PlannerCoachExplanationCard
                explanation={exchange.response.execution.response.plannerExplanation}
                onOpenPreview={onClose}
              />
            : <article className="coach-result tone-neutral" aria-live="polite">
                <span className="coach-result-eyebrow">KPSS Ko?u ? salt okunur</span>
                <h3>Durum de?erlendirmesi</h3>
                <p>{exchange.response.execution.response.answer}</p>
              </article>}
        </div>)}

        {submittedMessage && <div className="coach-user-message"><span>Sen</span><p>{submittedMessage}</p></div>}

        {sending && <div className="coach-thinking" aria-live="polite"><span><Icon name="spark" /></span><div><strong>Planını kontrol ediyorum</strong><p>{mode === "capacity" ? "Mesajını yorumlayıp Planning V2 önizlemesiyle karşılaştırıyorum." : "Mevcut Planner kanıtını salt okunur biçimde değerlendiriyorum."}</p></div></div>}

        {presentation && !sending && <article className={`coach-result tone-${presentation.tone}${presentation.previewState ? ` preview-${presentation.previewState.toLowerCase()}` : ""}`} aria-live="polite">
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
          {mode === "capacity" && response?.status === "VALID" && response.confirmation && presentation.previewState === "READY" && !applied && <button
            className="secondary-action"
            type="button"
            disabled={applying}
            onClick={() => void applyConfirmed()}
          >
            <Icon name="check" weight="bold" />
            {applying ? "Uygulanıyor…" : "Onayla ve Plana Uygula"}
          </button>}
          {response?.status === "VALID" && response.confirmationError && !response.confirmation && <div className="coach-error" role="alert">
            <Icon name="warning" /><span>Bu önizleme uygulanamaz; lütfen yeniden önizleyin.</span>
          </div>}
        </article>}

        {applied && <article className="coach-result tone-positive" aria-live="polite">
          <span className="coach-result-eyebrow">Onaylandı</span>
          <h3>Planın güncellendi</h3>
          <p>{applied.changes.length} görev değişikliği ve kapasite tercihin tek işlemde uygulandı.</p>
          <div className="coach-preview-note"><Icon name="check" weight="bold" /><span>Bugün ve Haftam görünümü yenilendi</span></div>
        </article>}

        {error && !sending && <div className="coach-error" role="alert"><Icon name="warning" /><span>{error}</span></div>}
      </div>

      <form className="coach-composer" onSubmit={(event) => void submit(event)}>
        <textarea
          ref={textareaRef}
          value={message}
          rows={3}
          maxLength={1200}
          placeholder={mode === "capacity" ? "Örn. Yarın toplam 2 saat çalışabilirim." : "Örn. Planner ne görüyor?"}
          aria-label="Koça mesaj yaz"
          disabled={sending || (mode === "capacity" && (loadingProfile || !profileId))}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <div><small>{mode === "capacity" && loadingProfile ? "Profil hazırlanıyor…" : "Enter gönderir · Shift+Enter yeni satır"}</small><button type="submit" disabled={sending || (mode === "capacity" && !profileId) || !message.trim()} aria-label="Mesajı gönder"><Icon name="arrow" weight="bold" /></button></div>
      </form>
    </aside>
  </>;
}
