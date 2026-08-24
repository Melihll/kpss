import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../supabase/functions/telegram-webhook/index.ts", import.meta.url),
  "utf8",
);

describe("Telegram production error observability", () => {
  it("logs the sanitized caught error before fallback recovery", () => {
    const catchStart = source.indexOf("} catch (error) {");
    const tail = source.slice(catchStart);

    const logIndex = tail.indexOf("TELEGRAM_WEBHOOK_UNHANDLED_ERROR");
    const fallbackIndex = tail.indexOf("Kısa bir sorun oldu. Bugünkü planını yeniden kontrol edelim.");

    expect(catchStart).toBeGreaterThanOrEqual(0);
    expect(logIndex).toBeGreaterThanOrEqual(0);
    expect(fallbackIndex).toBeGreaterThan(logIndex);
    expect(tail).toContain(
      'console.error("TELEGRAM_WEBHOOK_UNHANDLED_ERROR", errorMessage);',
    );
  });
});
