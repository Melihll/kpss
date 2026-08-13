import { describe, expect, it } from "vitest";
import {
  classifyTelegramText,
  dailyCoachCard,
  formatActiveSessionMessage,
  formatDailyCoachMessage,
  formatMinutesShort,
  formatTelegramDate,
  greetingMessage,
  mainMenuButtons,
  parseAvailableMinutes,
  parseManualStudyText,
  parseTestResultText,
  testResultPresentation,
  TELEGRAM_BUTTON_LABELS,
  weeklyReportPresentation,
} from "../supabase/functions/_shared/telegram-presentation.ts";

describe("Telegram presentation", () => {
  it("uses a short greeting and a four-action main menu", () => {
    expect(greetingMessage()).not.toMatch(/anlayamad|hata|destek/i);
    const buttons = mainMenuButtons().flat();
    expect(buttons).toHaveLength(4);
    expect(buttons.map((button) => button.callback_data)).toEqual(["now", "today", "manual_begin", "special_less"]);
  });

  it("keeps active session copy concise and action labels canonical", () => {
    expect(formatActiveSessionMessage({ task: { title: "Matematik · Soru çözümü" } }, 18)).toBe(
      "Çalışman devam ediyor.\nMatematik · Soru çözümü\n18 dk geçti.",
    );
    expect(TELEGRAM_BUTTON_LABELS).toMatchObject({
      start: "Çalışmaya Başla",
      finish: "Bitir",
      next: "Sonraki Görev",
      today: "Bugünü Gör",
      lowTime: "Az Vaktim Var",
      noStudy: "Bugün Çalışamam",
    });
  });

  it("classifies daily coach language deterministically", () => {
    expect(classifyTelegramText("Bugün ne kaldı?")).toBe("today");
    expect(classifyTelegramText("bugün çalışamayacağım")).toBe("no_study");
    expect(classifyTelegramText("25 dakikam var")).toBe("special");
    expect(classifyTelegramText("40 dk anayasa çalıştım")).toBe("manual");
    expect(classifyTelegramText("30 soru 7 yanlış")).toBe("test_result");
  });

  it("parses constrained time, manual study and test results", () => {
    expect(parseAvailableMinutes("yarım saatim var")).toBe(30);
    expect(parseAvailableMinutes("1 saat 20 dakikam var")).toBe(80);
    expect(parseManualStudyText("40 dk anayasa çalıştım")).toEqual({ minutes: 40, query: "anayasa" });
    expect(parseTestResultText("temel kavramlar 30 soru 7 yanlış")).toEqual({ total: 30, correct: 23, wrong: 7, blank: 0, query: "temel kavramlar" });
    expect(parseTestResultText("20 soru 14 doğru 4 yanlış 2 boş")).toEqual({ total: 20, correct: 14, wrong: 4, blank: 2, query: "" });
  });

  it("formats Turkish duration and dates consistently", () => {
    expect(formatMinutesShort(5)).toBe("5 dk");
    expect(formatMinutesShort(60)).toBe("1s");
    expect(formatMinutesShort(125, true)).toBe("2s 05dk");
    expect(formatTelegramDate("2026-08-13")).toBe("13 Ağustos");
  });

  it("does not present missing plan data as zero study", () => {
    expect(formatDailyCoachMessage({ plan: null })).toContain("Aktif haftalık plan görünmüyor");
    expect(formatDailyCoachMessage({ plan: null })).not.toContain("0 dk");
  });

  it("builds a compact truthful daily visual model", () => {
    const summary = {
      date: "2026-08-13",
      plan: { id: "plan" },
      capacityMinutes: 145,
      studiedMinutes: 45,
      remainingCapacityMinutes: 100,
      recommendation: { taskId: "t2", title: "İktisat · Temel Kavramlar · Economicus Mikro", remainingMinutes: 60 },
      tasks: [
        { id: "t1", title: "Tarih · Osmanlı", minutes: 45 },
        { id: "t2", title: "İktisat · Temel Kavramlar", minutes: 60 },
      ],
      allTasks: [{ id: "t1", status: "completed" }],
    };
    const card = dailyCoachCard(summary);
    expect(card.variant).toBe("today");
    expect(card.items).toHaveLength(2);
    expect(card.items?.[0]?.state).toBe("done");
    expect(card.primary?.title).toContain("İktisat");
  });

  it("uses mastery labels without unnecessary precision", () => {
    const presentation = testResultPresentation({ total_questions: 30, correct_count: 23, wrong_count: 7, blank_count: 0 }, { assessment: { resulting_mastery_level: "fragile" } });
    expect(presentation.text).toContain("Dikkat istiyor");
    expect(presentation.text).not.toMatch(/\.\d{2,}/);
    expect(presentation.card?.variant).toBe("result");
  });

  it("only computes weekly completion when a real plan exists", () => {
    const withPlan = weeklyReportPresentation({ week_start_date: "2026-08-07", week_end_date: "2026-08-13", actual_minutes: 120, planned_minutes: 240, completed_task_count: 2, planned_task_count: 4, question_count: 30, revision_completed_count: 1, revision_due_count: 2 });
    const withoutPlan = weeklyReportPresentation({ week_start_date: "2026-08-07", week_end_date: "2026-08-13", actual_minutes: 120, planned_minutes: 0, completed_task_count: 2, planned_task_count: 0, question_count: 0, revision_completed_count: 0, revision_due_count: 0 });
    expect(withPlan.text).toContain("%50");
    expect(withoutPlan.text).not.toContain("%0");
  });
});
