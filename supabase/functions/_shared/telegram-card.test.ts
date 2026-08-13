import { renderTelegramCard, renderTelegramSvg } from "./telegram-card.ts";
import { dailyCoachCard } from "./telegram-presentation.ts";
import { cardDelivery, deliverTelegram, telegramCardCaption } from "./telegram-transport.ts";

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

async function digest(bytes: Uint8Array) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer)))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

Deno.test("renders Latin, digits and every Turkish glyph instead of one missing-glyph box", async () => {
  const glyphs = [..."A0çÇğĞıİöÖşŞüÜ"];
  const hashes = await Promise.all(glyphs.map(async (glyph) => digest(await renderTelegramSvg(
    `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="160"><rect width="180" height="160" fill="white"/><text x="20" y="115" font-family="Inter" font-size="100" fill="black">${glyph}</text></svg>`,
  ))));
  const blankHash = await digest(await renderTelegramSvg(
    `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="160"><rect width="180" height="160" fill="white"/></svg>`,
  ));
  if (new Set(hashes).size !== glyphs.length || hashes.some((hash) => hash === blankHash)) {
    throw new Error(`Inter TTF did not render distinct Turkish/Latin glyphs: ${JSON.stringify({ glyphs, hashes, blankHash })}`);
  }
});

Deno.test("uses compact captions for every successful card variant", () => {
  const variants = ["today", "now", "week", "report", "completion", "result", "replan"] as const;
  for (const variant of variants) {
    const caption = telegramCardCaption({ ...model, variant });
    if (!caption || caption.length > 32 || caption.includes("\n")) {
      throw new Error(`${variant} card caption is not compact: ${JSON.stringify(caption)}`);
    }
  }
});

Deno.test("does not duplicate detailed fallback text in a successful photo caption", async () => {
  const previousMode = Deno.env.get("TELEGRAM_TRANSPORT_MODE");
  Deno.env.set("TELEGRAM_TRANSPORT_MODE", "mock");
  try {
    const fallback = "Bugün 40 dk tamamlandı ve 80 dk kaldı. Şimdi Anayasa ile devam et.";
    const buttons = [[{ text: "Şimdi başla", callback_data: "now" }]];
    const result = await deliverTelegram(cardDelivery("42", model, fallback, buttons));
    if (result.method !== "sendPhoto" || result.caption !== "Bugünün planı hazır." || result.caption === fallback) {
      throw new Error(`Successful card duplicated its fallback text: ${JSON.stringify(result)}`);
    }
    if (result.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data !== "now") {
      throw new Error("Successful card did not preserve inline buttons");
    }
  } finally {
    if (previousMode == null) Deno.env.delete("TELEGRAM_TRANSPORT_MODE");
    else Deno.env.set("TELEGRAM_TRANSPORT_MODE", previousMode);
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
    if (result.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data !== "now") {
      throw new Error("Telegram visual fallback did not preserve inline buttons");
    }
  } finally {
    if (previousMode == null) Deno.env.delete("TELEGRAM_TRANSPORT_MODE");
    else Deno.env.set("TELEGRAM_TRANSPORT_MODE", previousMode);
  }
});
