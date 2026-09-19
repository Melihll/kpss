import type {
  ProactiveCoachCardActionV1,
  ProactiveCoachCardV1,
} from "@kpss-coach/domain";
import { Icon } from "./Icon";

interface ProactiveCoachCardProps {
  readonly card: ProactiveCoachCardV1 | null;
  readonly controlsEnabled: boolean;
  readonly pendingAction: ProactiveCoachCardActionV1 | null;
  readonly onAction: (action: ProactiveCoachCardActionV1) => void;
}

export function ProactiveCoachCard({
  card,
  controlsEnabled,
  pendingAction,
  onAction,
}: ProactiveCoachCardProps) {
  if (card === null) return null;
  return <aside
    className={`proactive-coach-card tone-${card.tone}`}
    data-testid="proactive-coach-card"
    aria-labelledby="proactive-coach-title"
  >
    <div className="proactive-coach-mark"><Icon name="spark" weight="fill" /></div>
    <div className="proactive-coach-content">
      <span className="proactive-coach-eyebrow">Koçundan kısa not</span>
      <h2 id="proactive-coach-title">{card.title}</h2>
      <p>{card.body}</p>
      <dl>{card.evidenceSummary.map((item) => <div key={item.label}>
        <dt>{item.label}</dt><dd>{item.value}</dd>
      </div>)}</dl>
      <div className="proactive-coach-actions">
        {card.actions.map((item) => <button
          key={item.action}
          type="button"
          disabled={!controlsEnabled || pendingAction !== null}
          onClick={() => onAction(item.action)}
        >
          {pendingAction === item.action ? "Kaydediliyor…" : item.label}
        </button>)}
      </div>
    </div>
  </aside>;
}
