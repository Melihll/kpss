import { useEffect, useRef, useState } from "react";
import type {
  ProactiveCoachCardActionV1,
  ProactiveCoachCardV1,
} from "@kpss-coach/domain";
import {
  applyProactiveCoachCardAction,
  loadProactiveCoachCard,
  recordProactiveCoachPresentation,
} from "../lib/ai-coach-api";
import { ProactiveCoachCard } from "./ProactiveCoachCard";

export function createProactiveCoachSurfaceSessionId(): string {
  return `today:${crypto.randomUUID()}`;
}

export async function loadProactiveCoachCardQuietly(
  surfaceSessionId: string,
  loader: typeof loadProactiveCoachCard = loadProactiveCoachCard,
): Promise<ProactiveCoachCardV1 | null> {
  try {
    return await loader(surfaceSessionId);
  } catch {
    return null;
  }
}

export function reduceProactiveCoachCardAfterControl(
  card: ProactiveCoachCardV1 | null,
  succeeded: boolean,
): ProactiveCoachCardV1 | null {
  return succeeded ? null : card;
}

export function ProactiveCoachSurface() {
  const surfaceSessionId = useRef(createProactiveCoachSurfaceSessionId());
  const presentationAttempts = useRef(new Set<string>());
  const [loading, setLoading] = useState(true);
  const [card, setCard] = useState<ProactiveCoachCardV1 | null>(null);
  const [presentationRecorded, setPresentationRecorded] = useState(false);
  const [pendingAction, setPendingAction] = useState<ProactiveCoachCardActionV1 | null>(null);

  useEffect(() => {
    let active = true;
    void loadProactiveCoachCardQuietly(surfaceSessionId.current).then((value) => {
      if (!active) return;
      setCard(value);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (card === null || presentationAttempts.current.has(card.presentationToken)) return;
    let active = true;
    presentationAttempts.current.add(card.presentationToken);
    setPresentationRecorded(false);
    void recordProactiveCoachPresentation(
      surfaceSessionId.current,
      card.presentationToken,
    ).then(() => {
      if (active) setPresentationRecorded(true);
    }).catch(() => {
      if (!active) return;
      presentationAttempts.current.delete(card.presentationToken);
      setCard(null);
    });
    return () => { active = false; };
  }, [card]);

  const applyControl = async (action: ProactiveCoachCardActionV1) => {
    if (card === null || !presentationRecorded || pendingAction !== null) return;
    setPendingAction(action);
    try {
      await applyProactiveCoachCardAction(
        action,
        surfaceSessionId.current,
        card.presentationToken,
      );
      setCard((current) => reduceProactiveCoachCardAfterControl(current, true));
    } catch {
      // Controls fail quietly and never block or mutate the Today experience.
    } finally {
      setPendingAction(null);
    }
  };

  if (loading) {
    return <div className="proactive-coach-loading" aria-busy="true" aria-label="Koç değerlendirmesi yükleniyor"><span /></div>;
  }
  return <ProactiveCoachCard
    card={card}
    controlsEnabled={presentationRecorded}
    pendingAction={pendingAction}
    onAction={(action) => void applyControl(action)}
  />;
}
