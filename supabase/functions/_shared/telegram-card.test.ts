import { renderTelegramCard, renderTelegramSvg, telegramCardSvg } from "./telegram-card.ts";
import { dailyCoachCard } from "./telegram-presentation.ts";
import { activeSessionDelivery, cardDelivery, deliverTelegram, interactiveStateDelivery, keyboardDelivery, telegramCardCaption, textDelivery } from "./telegram-transport.ts";

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

Deno.test("uses mobile-first type, format-specific canvases and a dominant hero", () => {
  const today = telegramCardSvg(model);
  const now = telegramCardSvg({
    variant: "now",
    eyebrow: "ŞİMDİ",
    title: "Tarih · Osmanlı Devleti kültür ve medeniyet çalışması",
    date: "13 Ağustos Perşembe",
    headline: "10 dk",
    subhead: "2026 KPSS Tarih Ders Notları",
    note: "Yarım kalan görevin önce geliyor.",
  });
  const report = telegramCardSvg({
    variant: "report",
    eyebrow: "HAFTALIK RAPOR",
    title: "7–13 AĞUSTOS",
    headline: "2s 05dk",
    metrics: [{ label: "GÖREV", value: "3/5" }],
  });
  const todayHeight = Number(today.match(/<svg[^>]+height="(\d+)"/)?.[1]);
  const nowHeight = Number(now.match(/<svg[^>]+height="(\d+)"/)?.[1]);
  const reportHeight = Number(report.match(/<svg[^>]+height="(\d+)"/)?.[1]);
  if (!today.includes('data-card-format="standard"') || todayHeight < 1100 || todayHeight > 1320) {
    throw new Error("Daily card did not use the standard content-sized canvas");
  }
  if (!now.includes('data-card-format="compact"') || nowHeight < 600 || nowHeight > 800) {
    throw new Error("Now card did not use a compact content-sized canvas");
  }
  if (!report.includes('data-card-format="report"') || reportHeight < 850 || reportHeight > 1500) {
    throw new Error("Weekly report did not use the report canvas");
  }
  if (!now.includes('data-role="hero-duration"') || !now.includes('font-size="76"')) {
    throw new Error("Now duration is not visually dominant");
  }
  const fontSizes = [...today.matchAll(/font-size="(\d+)"/g)].map((match) => Number(match[1]));
  if (Math.min(...fontSizes.filter((size) => size !== 20)) < 21) {
    throw new Error(`Daily card contains undersized content type: ${fontSizes.join(",")}`);
  }
});

Deno.test("keeps sparse cards tight while preserving a footer safety reserve", () => {
  const heights = {
    todayEmpty: Number(telegramCardSvg({
      variant: "today",
      eyebrow: "BUGÜN",
      title: "13 AĞUSTOS",
      metrics: [{ label: "KALAN", value: "0 dk" }],
      note: "Bugün için çalışma planın kapalı.",
    }).match(/<svg[^>]+height="(\d+)"/)?.[1]),
    now: Number(telegramCardSvg({
      variant: "now",
      eyebrow: "ŞİMDİ",
      title: "Tarih · Not",
      headline: "10 dk",
      note: "Yarım kalan görevin önce geliyor.",
    }).match(/<svg[^>]+height="(\d+)"/)?.[1]),
    completion: Number(telegramCardSvg({
      variant: "completion",
      eyebrow: "ÇALIŞMA KAYDEDİLDİ",
      title: "25 dk",
      subhead: "Türkçe · Paragraf",
      metrics: [{ label: "DURUM", value: "Görev tamamlandı" }],
    }).match(/<svg[^>]+height="(\d+)"/)?.[1]),
    replan: Number(telegramCardSvg({
      variant: "replan",
      eyebrow: "PLAN GÜNCELLENDİ",
      title: "Bugün plan dışı",
      metrics: [{ label: "YERİ DEĞİŞEN", value: "1" }],
      note: "1 görev yeniden yerleştirildi.",
    }).match(/<svg[^>]+height="(\d+)"/)?.[1]),
    reportLow: Number(telegramCardSvg({
      variant: "report",
      eyebrow: "HAFTALIK RAPOR",
      title: "7–13 AĞUSTOS",
      headline: "25 dk",
      metrics: [{ label: "GÖREV", value: "1/0" }],
    }).match(/<svg[^>]+height="(\d+)"/)?.[1]),
  };
  const maximums = { todayEmpty: 760, now: 680, completion: 700, replan: 730, reportLow: 900 };
  for (const [variant, height] of Object.entries(heights)) {
    if (!height || height > maximums[variant as keyof typeof maximums]) {
      throw new Error(`Sparse ${variant} card retained excess height: ${height}`);
    }
  }
});

Deno.test("limits the daily flow to three task rows and summarizes overflow", () => {
  const svg = telegramCardSvg({
    ...model,
    items: [
      { title: "Tarih · Not", detail: "10 dk" },
      { title: "Coğrafya · Harita", detail: "15 dk" },
      { title: "Türkçe · Paragraf", detail: "20 dk" },
      { title: "Matematik · Problemler", detail: "25 dk" },
    ],
    moreItems: 2,
  });
  const rows = svg.match(/data-role="task-row"/g)?.length ?? 0;
  if (rows !== 3 || !svg.includes('data-role="task-overflow"') || !svg.includes("+2 görev daha")) {
    throw new Error("Daily flow density rule was not preserved");
  }
});

Deno.test("wraps primary Turkish titles without clipping the first line", () => {
  const svg = telegramCardSvg({
    variant: "now",
    eyebrow: "ŞİMDİ",
    title: "Türkiye’nin fiziki coğrafyasında dağların uzanış yönleri ve sonuçları",
    date: "16 Ağustos Pazar",
    headline: "60 dk",
  });
  if (!svg.includes("Türkiye’nin fiziki") || (svg.match(/<tspan/g)?.length ?? 0) < 2 || !svg.includes("ğ")) {
    throw new Error("Long Turkish hero title did not wrap safely");
  }
});

Deno.test("keeps each semantic detail in one dedicated section", () => {
  const result = telegramCardSvg({
    variant: "result",
    eyebrow: "TEST DEĞERLENDİRMESİ",
    title: "Dikkat istiyor",
    headline: "30 SORU",
    metrics: [
      { label: "DOĞRU", value: "23" },
      { label: "YANLIŞ", value: "7" },
      { label: "BOŞ", value: "0" },
    ],
    note: "Tekrar planlandı · 3 gün sonra",
  });
  if ((result.match(/data-role="mastery-status"/g)?.length ?? 0) !== 1 ||
    (result.match(/data-role="revision-status"/g)?.length ?? 0) !== 1 ||
    (result.match(/data-role="score-metric"/g)?.length ?? 0) !== 3) {
    throw new Error("Result card duplicated or omitted a detail section");
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

Deno.test("retires stale keyboards and can replace a photo interaction with one current text state", async () => {
  const previousMode = Deno.env.get("TELEGRAM_TRANSPORT_MODE");
  Deno.env.set("TELEGRAM_TRANSPORT_MODE", "mock");
  try {
    const retired = await deliverTelegram(keyboardDelivery("42", 71));
    if (retired.method !== "editMessageReplyMarkup" || retired.message_id !== 71 || retired.reply_markup?.inline_keyboard?.length !== 0) {
      throw new Error(`Stale keyboard was not retired: ${JSON.stringify(retired)}`);
    }
    const current = await deliverTelegram(textDelivery(
      "42",
      "Çalışman devam ediyor.",
      [[{ text: "Bitir", callback_data: "session_finish:1" }]],
      null,
      71,
    ));
    if (current.method !== "sendMessage" || current.keyboardCleared !== true || current.reply_markup?.inline_keyboard?.length !== 1) {
      throw new Error(`Photo interaction was not replaced with one current state: ${JSON.stringify(current)}`);
    }
  } finally {
    if (previousMode == null) Deno.env.delete("TELEGRAM_TRANSPORT_MODE");
    else Deno.env.set("TELEGRAM_TRANSPORT_MODE", previousMode);
  }
});

Deno.test("edits the canonical active photo caption and keeps stale completion copy coherent", async () => {
  const previousMode = Deno.env.get("TELEGRAM_TRANSPORT_MODE");
  Deno.env.set("TELEGRAM_TRANSPORT_MODE", "mock");
  try {
    const active = await deliverTelegram(activeSessionDelivery(
      "42",
      "Çalışman devam ediyor.\nTarih · Not\n2 dk geçti.",
      [[{ text: "Bitir", callback_data: "session_finish:session" }]],
      "session",
      { messageId: 81, isPhoto: true },
      35,
    ));
    if (active.method !== "editMessageCaption" || active.message_id !== 81 || active.caption.includes("Planlanan: 1s")) {
      throw new Error(`Canonical photo state was not edited coherently: ${JSON.stringify(active)}`);
    }
    const stale = await deliverTelegram(interactiveStateDelivery(
      "42",
      "Bu çalışma tamamlandı.",
      [[{ text: "Sonraki Görev", callback_data: "now" }]],
      { messageId: 81, isPhoto: true },
    ));
    if (stale.method !== "editMessageCaption" || stale.caption !== "Bu çalışma tamamlandı.") {
      throw new Error(`Stale completion caption was not finalized: ${JSON.stringify(stale)}`);
    }
  } finally {
    if (previousMode == null) Deno.env.delete("TELEGRAM_TRANSPORT_MODE");
    else Deno.env.set("TELEGRAM_TRANSPORT_MODE", previousMode);
  }
});
