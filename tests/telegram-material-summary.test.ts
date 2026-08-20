import { describe, expect, it } from "vitest";
import {
  formatTelegramMaterialDuration,
  formatTelegramMaterialSummary,
} from "../supabase/functions/_shared/telegram-material-summary";

describe("P1-15 Telegram material summary formatter", () => {
  it("formats page progress compactly", () => {
    expect(formatTelegramMaterialSummary({
      page: { currentPage: 145, totalPages: 300 },
    })).toBe("Sayfa 145/300 (%48)");
  });

  it("formats aggregate video progress compactly", () => {
    expect(formatTelegramMaterialSummary({
      video: { watchedSeconds: 72 * 60, durationSeconds: 155 * 60 },
    })).toBe("Video 1sa 12dk/2sa 35dk (%46)");
  });

  it("joins page and video progress in one simple line", () => {
    expect(formatTelegramMaterialSummary({
      page: { currentPage: 145, totalPages: 300 },
      video: { watchedSeconds: 72 * 60, durationSeconds: 155 * 60 },
    })).toBe("Sayfa 145/300 (%48) · Video 1sa 12dk/2sa 35dk (%46)");
  });

  it("omits unavailable progress instead of fabricating it", () => {
    expect(formatTelegramMaterialSummary({})).toBeNull();
    expect(formatTelegramMaterialSummary({
      page: { currentPage: 0, totalPages: 0 },
      video: { watchedSeconds: 0, durationSeconds: 0 },
    })).toBeNull();
  });

  it("formats short material durations", () => {
    expect(formatTelegramMaterialDuration(42)).toBe("42 sn");
    expect(formatTelegramMaterialDuration(60)).toBe("1dk");
    expect(formatTelegramMaterialDuration(3600)).toBe("1sa");
  });
});