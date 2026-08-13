import { renderTelegramCard } from "./telegram-card.ts";
import { dailyCoachCard } from "./telegram-presentation.ts";
import { cardDelivery, deliverTelegram } from "./telegram-transport.ts";

const model = dailyCoachCard({
  date: "2026-08-13",
  plan: { id: "plan" },
  capacityMinutes: 120,
  studiedMinutes: 40,
  remainingCapacityMinutes: 80,
  recommendation: { title: "Anayasa · Temel Kavramlar", remainingMinutes: 45 },
  tasks: [{ id: "task", title: "Anayasa · Temel Kavramlar", minutes: 45 }],
  allTasks: [],
});

Deno.test("renders a valid Telegram PNG with packaged assets", async () => {
  const png = await renderTelegramCard(model);
  const signature = [137, 80, 78, 71];
  if (png.byteLength < 1_000 || !signature.every((byte, index) => png[index] === byte)) {
    throw new Error("Telegram card renderer did not return a valid PNG");
  }
});

Deno.test("falls back to the same actionable text when visual rendering fails", async () => {
  const previousMode = Deno.env.get("TELEGRAM_TRANSPORT_MODE");
  Deno.env.set("TELEGRAM_TRANSPORT_MODE", "mock");
  try {
    const text = "Bugün 80 dk kaldı. Şimdi Anayasa ile devam et.";
    const result = await deliverTelegram(
      cardDelivery("42", model, text, [[{ text: "Şimdi başla", callback_data: "now" }]]),
      { forceCardFailure: true },
    );
    if (result.method !== "sendMessage" || result.text !== text || result.visualFallback !== true) {
      throw new Error("Telegram visual fallback did not preserve the text action");
    }
  } finally {
    if (previousMode == null) Deno.env.delete("TELEGRAM_TRANSPORT_MODE");
    else Deno.env.set("TELEGRAM_TRANSPORT_MODE", previousMode);
  }
});
