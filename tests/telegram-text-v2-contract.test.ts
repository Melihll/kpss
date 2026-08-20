import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("P0-06 Telegram text v2 contract", () => {
  const webhook = readFileSync(
    new URL("../supabase/functions/telegram-webhook/index.ts", import.meta.url),
    "utf8",
  );

  it("/bugun uses plain text delivery on its normal daily path", () => {
    const start = webhook.indexOf('if (text === "/bugun"');
    const end = webhook.indexOf('if (text === "/simdi"', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const route = webhook.slice(start, end);
    expect(route).toContain("formatDailyCoachMessage(summaryWithMaterials)");
    expect(route).toContain("respond(message, buttons)");
    expect(route).not.toContain("dailyCoachCard(");
    expect(route).not.toContain("respondCard(");
    expect(route).toContain("materialSummaries");
  });

  it("/simdi uses plain text delivery on its normal recommendation path", () => {
    const start = webhook.indexOf('if (text === "/simdi"');
    const end = webhook.indexOf('if (callback.startsWith("task_start:")', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const route = webhook.slice(start, end);
    expect(route).toContain("formatNowCoachMessage(recommendation)");
    expect(route).toContain("outbound: respond(");
    expect(route).not.toContain("nowCoachCard(");
    expect(route).not.toContain("respondCard(");
  });

  it("keeps active study-session delivery behavior intact", () => {
    expect(webhook).toContain("activeSessionOutbound(running)");
    expect(webhook).toContain("activeSessionDelivery(");
  });

  it("does not add planning or mutation behavior to text presentation", () => {
    const start = webhook.indexOf('if (text === "/bugun"');
    const end = webhook.indexOf('if (callback.startsWith("task_start:")', start);
    const routes = webhook.slice(start, end);

    expect(routes).not.toContain('rpc("apply');
    expect(routes).not.toContain("planning_apply");
    expect(routes).not.toContain(".update(");
    expect(routes).not.toContain(".insert(");
    expect(routes).not.toContain(".delete(");
  });

  it("removes now/daily card imports from the webhook main flow", () => {
    const importBlock = webhook.slice(0, webhook.indexOf('} from "../_shared/telegram-coach.ts";'));
    expect(importBlock).not.toContain("dailyCoachCard,");
    expect(importBlock).not.toContain("nowCoachCard,");
  });
});