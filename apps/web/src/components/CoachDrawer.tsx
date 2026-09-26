import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  COACH_CONVERSATION_CONTEXT_V1_VERSION,
  COACH_CONVERSATION_MAX_TURNS_V1,
  COACH_CONVERSATION_TURN_MAX_LENGTH_V1,
  type CoachConversationInputV1,
  type CoachConversationTurnV1,
} from "@kpss-coach/domain";
import { AppApiError } from "../lib/app-api";
import { callReactiveCoach, type ReactiveCoachResponseV1 } from "../lib/ai-coach-api";
import { Icon } from "./Icon";
import { PlannerCoachExplanationCard } from "./PlannerCoachExplanationCard";


export type CoachDrawerEntryContext = "general" | "capacity";

interface CoachDrawerProps {
  readonly entryContext?: CoachDrawerEntryContext;
  readonly open: boolean;
  readonly onClose: () => void;
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

export function CoachDrawer({ open, entryContext = "general", onClose }: CoachDrawerProps) {
  const [message, setMessage] = useState("");
  const [submittedMessage, setSubmittedMessage] = useState<string | null>(null);
  const [reactiveHistory, setReactiveHistory] = useState<readonly ReactiveCoachExchange[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Presentation-only entry intent. It must never select API or mutation authority.
  const capacityEntry = entryContext === "capacity";

  const quickPrompts = capacityEntry
    ? [
        "Bugün vaktim azaldı, ne yapmalıyım?",
        "Bugün daha fazla vaktim var; planım ne durumda?",
        "Vaktim değişti; Planner açısından ne anlama geliyor?",
      ]
    : QUICK_PROMPTS;

  const introKicker = capacityEntry
    ? "Bugünkü zamanını birlikte değerlendirelim"
    : "Planını birlikte değerlendirelim";

  const introTitle = capacityEntry
    ? "Vaktin değiştiyse ne yapabilirsin?"
    : "Planner hakkında ne bilmek istiyorsun?";

  useEffect(() => {
    if (!open) return;

    setMessage("");
    setSubmittedMessage(null);
    setReactiveHistory([]);
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    window.setTimeout(() => textareaRef.current?.focus(), 120);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  async function submit(event: FormEvent) {
    event.preventDefault();

    const normalized =
      message.trim();

    if (!normalized || sending) return;

    setSending(true);
    setError(null);
    setSubmittedMessage(normalized);

    try {
      const result =
        await callReactiveCoach(
          normalized,
          buildReactiveConversationContext(
            reactiveHistory,
          ),
        );

      setReactiveHistory(
        (current) =>
          [
            ...current,
            {
              userMessage:
                normalized,
              response:
                result,
            },
          ].slice(-3),
      );

      setSubmittedMessage(null);
      setMessage("");
    }
    catch (caught) {
      console.error(
        "AI_COACH_REACTIVE_FAILED",
        caught,
      );

      setError(
        caught instanceof AppApiError
          ? caught.message
          : "Koç yanıtı alınamadı. Tekrar deneyebilirsin.",
      );
    }
    finally {
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
        {!submittedMessage && reactiveHistory.length === 0 && <section className="coach-intro">
          <span className="coach-kicker">{introKicker}</span>
          <h2>{introTitle}</h2>
          <p>Koç mevcut canonical Planner kanıtını açıklar. Sohbet mesajı planını onaylamaz, uygulamaz veya değiştirmez.</p>
          <div className="coach-quick-prompts">
            {quickPrompts.map((prompt) => <button type="button" key={prompt} onClick={() => { setMessage(prompt); textareaRef.current?.focus(); }}>{prompt}</button>)}
          </div>
        </section>}

        {reactiveHistory.map((exchange, index) => <div
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
                <span className="coach-result-eyebrow">KPSS Koçu · salt okunur</span>
                <h3>Durum değerlendirmesi</h3>
                <p>{exchange.response.execution.response.answer}</p>
              </article>}
        </div>)}

        {submittedMessage && <div className="coach-user-message"><span>Sen</span><p>{submittedMessage}</p></div>}

        {sending && <div className="coach-thinking" aria-live="polite">
          <span><Icon name="spark" /></span>
          <div>
            <strong>Planını kontrol ediyorum</strong>
            <p>Mevcut Planner kanıtını salt okunur biçimde değerlendiriyorum.</p>
          </div>
        </div>}

        {error && !sending && <div className="coach-error" role="alert"><Icon name="warning" /><span>{error}</span></div>}
      </div>

      <form className="coach-composer" onSubmit={(event) => void submit(event)}>
        <textarea
          ref={textareaRef}
          value={message}
          rows={3}
          maxLength={1200}
          placeholder="Örn. Planner ne görüyor?"
          aria-label="Koça mesaj yaz"
          disabled={sending}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />

        <div>
          <small>Enter gönderir · Shift+Enter yeni satır</small>
          <button
            type="submit"
            disabled={sending || !message.trim()}
            aria-label="Mesajı gönder"
          >
            <Icon name="arrow" weight="bold" />
          </button>
        </div>
      </form>
    </aside>
  </>;
}
