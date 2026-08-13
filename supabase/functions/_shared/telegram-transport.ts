import { renderTelegramCard } from "./telegram-card.ts";
import type { TelegramButton, TelegramCardModel } from "./telegram-presentation.ts";

export type TelegramDelivery = {
  __telegramDelivery: true;
  kind: "text" | "card" | "keyboard";
  chatId: string;
  text: string;
  caption?: string;
  buttons: TelegramButton[][];
  editMessageId?: number | null;
  card?: TelegramCardModel;
  clearKeyboardMessageId?: number | null;
};

export const textDelivery = (
  chatId: string,
  text: string,
  buttons: TelegramButton[][] = [],
  editMessageId?: number | null,
  clearKeyboardMessageId?: number | null,
): TelegramDelivery => ({ __telegramDelivery: true, kind: "text", chatId, text, buttons, editMessageId, clearKeyboardMessageId });

export const cardDelivery = (
  chatId: string,
  card: TelegramCardModel,
  textFallback: string,
  buttons: TelegramButton[][] = [],
  clearKeyboardMessageId?: number | null,
): TelegramDelivery => ({
  __telegramDelivery: true,
  kind: "card",
  chatId,
  text: textFallback,
  caption: telegramCardCaption(card),
  buttons,
  card,
  clearKeyboardMessageId,
});

export const keyboardDelivery = (
  chatId: string,
  messageId: number,
  buttons: TelegramButton[][] = [],
): TelegramDelivery => ({
  __telegramDelivery: true,
  kind: "keyboard",
  chatId,
  text: "",
  buttons,
  editMessageId: messageId,
});

export function telegramCardCaption(card: TelegramCardModel) {
  const captions: Record<TelegramCardModel["variant"], string> = {
    today: "Bugünün planı hazır.",
    now: "Şimdi başlayabilirsin.",
    week: "Haftanın planı hazır.",
    report: "Haftalık özetin hazır.",
    completion: "Çalışma kaydedildi.",
    result: "Test sonucun hazır.",
    replan: "Planın güncellendi.",
  };
  return captions[card.variant];
}

function replyMarkup(buttons: TelegramButton[][]) {
  return buttons.length ? { inline_keyboard: buttons } : undefined;
}

function mockMode() {
  return Deno.env.get("TELEGRAM_TRANSPORT_MODE") === "mock";
}

async function telegramJsonCall(method: string, payload: Record<string, unknown>) {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (mockMode() || !token) return { method, ...payload, transport: mockMode() ? "mock" : "TELEGRAM_NOT_CONFIGURED" };
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const description = String(result?.description ?? "").toLocaleLowerCase("en-US");
    if (["editMessageText", "editMessageCaption", "editMessageReplyMarkup"].includes(method) && description.includes("message is not modified")) {
      return { method, ...payload, notModified: true };
    }
    throw new Error(`TELEGRAM_${method.toUpperCase()}_FAILED:${response.status}`);
  }
  return result?.result ?? { method, ...payload };
}

async function updateKeyboard(chatId: string, messageId: number, buttons: TelegramButton[][]) {
  try {
    return await telegramJsonCall("editMessageReplyMarkup", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: buttons },
    });
  } catch (error) {
    console.error("TELEGRAM_KEYBOARD_UPDATE_FAILED", error instanceof Error ? error.message : "UNKNOWN");
    return { method: "editMessageReplyMarkup", chat_id: chatId, message_id: messageId, keyboardUpdateFailed: true };
  }
}

async function sendPhoto(chatId: string, png: Uint8Array, caption: string, buttons: TelegramButton[][]) {
  const markup = replyMarkup(buttons);
  if (mockMode() || !Deno.env.get("TELEGRAM_BOT_TOKEN")) {
    return {
      method: "sendPhoto",
      chat_id: chatId,
      text: caption,
      caption,
      reply_markup: markup,
      photo: { filename: "kpss-kocu.png", size: png.byteLength, type: "image/png" },
      visual: true,
      transport: mockMode() ? "mock" : "TELEGRAM_NOT_CONFIGURED",
    };
  }
  const form = new FormData();
  form.set("chat_id", chatId);
  if (caption) form.set("caption", caption.slice(0, 1024));
  const pngBuffer = Uint8Array.from(png).buffer;
  form.set("photo", new Blob([pngBuffer], { type: "image/png" }), "kpss-kocu.png");
  if (markup) form.set("reply_markup", JSON.stringify(markup));
  const response = await fetch(`https://api.telegram.org/bot${Deno.env.get("TELEGRAM_BOT_TOKEN")}/sendPhoto`, { method: "POST", body: form });
  if (!response.ok) throw new Error(`TELEGRAM_SENDPHOTO_FAILED:${response.status}`);
  const result = await response.json().catch(() => null);
  return result?.result ?? { method: "sendPhoto", chat_id: chatId, text: caption, visual: true };
}

function fallbackReason(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith("TELEGRAM_SENDPHOTO_FAILED")) return message;
  if (message === "MOCK_CARD_RENDER_FAILURE") return message;
  return "CARD_RENDER_FAILED";
}

export async function deliverTelegram(delivery: TelegramDelivery, options: { forceCardFailure?: boolean } = {}) {
  if (delivery.kind === "keyboard") {
    return await updateKeyboard(delivery.chatId, delivery.editMessageId!, delivery.buttons);
  }
  let keyboardCleared = false;
  if (delivery.clearKeyboardMessageId) {
    const cleared = await updateKeyboard(delivery.chatId, delivery.clearKeyboardMessageId, []);
    keyboardCleared = !("keyboardUpdateFailed" in cleared);
  }
  if (delivery.kind === "text") {
    const method = delivery.editMessageId ? "editMessageText" : "sendMessage";
    const result = await telegramJsonCall(method, {
      chat_id: delivery.chatId,
      ...(delivery.editMessageId ? { message_id: delivery.editMessageId } : {}),
      text: delivery.text,
      reply_markup: replyMarkup(delivery.buttons),
    });
    return keyboardCleared ? { ...result, keyboardCleared: true } : result;
  }
  try {
    if (options.forceCardFailure && mockMode()) throw new Error("MOCK_CARD_RENDER_FAILURE");
    const png = await renderTelegramCard(delivery.card!);
    const result = await sendPhoto(delivery.chatId, png, delivery.caption ?? "", delivery.buttons);
    return keyboardCleared ? { ...result, keyboardCleared: true } : result;
  } catch (error) {
    console.error("TELEGRAM_CARD_TEXT_FALLBACK", fallbackReason(error));
    const fallback = await telegramJsonCall("sendMessage", {
      chat_id: delivery.chatId,
      text: delivery.text,
      reply_markup: replyMarkup(delivery.buttons),
    });
    return { ...fallback, visualFallback: true, ...(keyboardCleared ? { keyboardCleared: true } : {}) };
  }
}

export const answerTelegramCallback = (callbackQueryId: string, text?: string) =>
  telegramJsonCall("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text: text.slice(0, 200) } : {}),
  });
