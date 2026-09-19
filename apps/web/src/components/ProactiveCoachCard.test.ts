import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ProactiveCoachCardV1 } from "@kpss-coach/domain";

vi.mock("../lib/ai-coach-api", () => ({
  loadProactiveCoachCard: vi.fn(),
  recordProactiveCoachPresentation: vi.fn(),
  applyProactiveCoachCardAction: vi.fn(),
}));

import { ProactiveCoachCard } from "./ProactiveCoachCard";
import {
  loadProactiveCoachCardQuietly,
  reduceProactiveCoachCardAfterControl,
} from "./ProactiveCoachSurface";

function card(): ProactiveCoachCardV1 {
  return {
    version: "proactive-coach-card-v1",
    templateVersion: "proactive-coach-card-template-v1",
    presentationToken: "token-1",
    fingerprint: "token-1",
    signalType: "today_completed_as_planned",
    attentionCategory: "progress",
    title: "Bugünün planı tamamlandı",
    body: "Planlanan 60 dakikalık çalışma bugün tamamlandı.",
    tone: "positive",
    evidenceSummary: [{ label: "Plan kredisi", value: "60 dk" }],
    actions: [
      { action: "dismiss", label: "Bu kartı kapat" },
      { action: "snooze_24h", label: "24 saat ertele" },
      { action: "disable_category", label: "Bu tür bildirimleri kapat" },
    ],
  };
}

describe("Proactive Coach Today card", () => {
  it("T. renders the single selected card exactly once without runtime debug metadata", () => {
    const html = renderToStaticMarkup(createElement(ProactiveCoachCard, {
      card: card(),
      controlsEnabled: true,
      pendingAction: null,
      onAction: vi.fn(),
    }));
    expect(html.match(/data-testid="proactive-coach-card"/g)).toHaveLength(1);
    expect(html).toContain("Bugünün planı tamamlandı");
    expect(html).toContain("24 saat ertele");
    expect(html).not.toMatch(/selectedFingerprint|conditionKey|sourceFactPaths|runtime/);
  });

  it("U. renders nothing for silence/no-card state", () => {
    expect(renderToStaticMarkup(createElement(ProactiveCoachCard, {
      card: null,
      controlsEnabled: false,
      pendingAction: null,
      onAction: vi.fn(),
    }))).toBe("");
  });

  it("V. removes the card only after a successful persisted control", () => {
    expect(reduceProactiveCoachCardAfterControl(card(), true)).toBeNull();
    expect(reduceProactiveCoachCardAfterControl(card(), false)).toEqual(card());
  });

  it("W. converts proactive load failure to silence without throwing into Today", async () => {
    const loader = vi.fn(async () => { throw new Error("PROACTIVE_UNAVAILABLE"); });
    await expect(loadProactiveCoachCardQuietly("today-surface", loader)).resolves.toBeNull();
    expect(loader).toHaveBeenCalledTimes(1);
  });
});
