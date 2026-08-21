import { describe, expect, it } from "vitest";
import {
  classifyTelegramText,
  completionActionButtons,
  dailyCoachCard,
  formatActiveSessionMessage,
  formatDailyCoachMessage,
  formatMinutesShort,
  formatNowCoachMessage,
  formatStartedSessionMessage,
  formatTelegramDate,
  greetingMessage,
  mainMenuButtons,
  manualTaskChoiceButtons,
  nowCoachCard,
  parseAvailableMinutes,
  parseManualStudyText,
  parseTestResultText,
  formatReplanSummary,
  testResultPresentation,
  TELEGRAM_BUTTON_LABELS,
  totalCapacityForRemainingAvailability,
  weeklyReportPresentation,
} from "../supabase/functions/_shared/telegram-presentation.ts";
import { recommendationWindow } from "../supabase/functions/_shared/recommendation-window.ts";

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

  it("uses the real planned session duration and truthful completion actions", () => {
    expect(formatStartedSessionMessage("Tarih · Not", 35)).toContain("Planlanan: 35 dk");
    expect(formatStartedSessionMessage("Tarih · Not", 35)).not.toContain("Planlanan: 1s");
    expect(completionActionButtons({ taskId: "task", remainingMinutes: 31 }).flat().map((button) => button.text))
      .toContain("Devam Et");
    expect(completionActionButtons({ taskId: "task", remainingMinutes: 31 }).flat().map((button) => button.text))
      .not.toContain("Görev Bitti");
    expect(completionActionButtons({ taskId: "task", remainingMinutes: 0 }).flat().map((button) => button.text))
      .toContain("Sonraki Görev");
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
    expect(card.primary?.meta).toBe("60 dk");
  });

  it("summarizes daily flow after three visible tasks", () => {
    const tasks = Array.from({ length: 5 }, (_, index) => ({ id: `t${index}`, title: `Tarih · Konu ${index + 1}`, minutes: 20 }));
    const card = dailyCoachCard({
      date: "2026-08-13",
      plan: { id: "plan" },
      capacityMinutes: 100,
      studiedMinutes: 0,
      remainingCapacityMinutes: 100,
      recommendation: { title: tasks[0].title, remainingMinutes: 20, reason: "today_core" },
      tasks,
      allTasks: [],
    });
    expect(card.items).toHaveLength(3);
    expect(card.moreItems).toBe(2);
    expect(card.primary?.reason).toBe("Bugünün çekirdek görevi.");
    expect(card.date).toBe("Perşembe");
  });

  it("never renders a now block when remaining day capacity is zero", () => {
    const summary = {
      date: "2026-08-13",
      plan: { id: "plan" },
      capacityMinutes: 0,
      studiedMinutes: 97,
      remainingCapacityMinutes: 0,
      recommendation: { taskId: "task", title: "Tarih · Not", remainingMinutes: 21, recommendedSessionMinutes: 21 },
      tasks: [],
      allTasks: [],
    };
    expect(dailyCoachCard(summary).primary).toBeUndefined();
    expect(formatDailyCoachMessage(summary)).toContain("planın kapalı");
    expect(mainMenuButtons(0).flat().map((button) => button.callback_data)).not.toContain("now");
    expect(mainMenuButtons(0).flat().map((button) => button.callback_data)).not.toContain("special_less");
  });

  it("time-boxes recommendation presentation without changing task remaining", () => {
    expect(recommendationWindow(21, 20)).toEqual({ taskRemainingMinutes: 21, recommendedSessionMinutes: 20 });
    expect(recommendationWindow(31, 25)).toEqual({ taskRemainingMinutes: 31, recommendedSessionMinutes: 25 });
    const recommendation = {
      title: "Tarih · Not",
      remainingMinutes: 21,
      taskRemainingMinutes: 21,
      recommendedSessionMinutes: 20,
      reason: "continue_partial",
    };
    expect(nowCoachCard(recommendation, "2026-08-13").headline).toBe("20 dk");
    expect(formatNowCoachMessage(recommendation)).toContain("1 dk kalır");
    expect(recommendation.remainingMinutes).toBe(21);
    const longer = { ...recommendation, remainingMinutes: 31, taskRemainingMinutes: 31, recommendedSessionMinutes: 25 };
    expect(nowCoachCard(longer, "2026-08-13").headline).toBe("25 dk");
    expect(formatNowCoachMessage(longer)).not.toContain("\n31 dk\n");
    expect(nowCoachCard({ ...recommendation, remainingMinutes: 60, taskRemainingMinutes: 60, recommendedSessionMinutes: 60 }, "2026-08-13").headline).toBe("60 dk");
  });

  it("preserves completed study when applying a remaining-availability answer", () => {
    expect(totalCapacityForRemainingAvailability(97, 25)).toBe(122);
  });

  it("labels a preview as a proposal instead of claiming the plan changed", () => {
    const summary = formatReplanSummary({
      planMutationApplied: false,
      decision: { tasksToMove: [{ taskId: "future" }], tasksToBacklog: [], tasksToCreate: [] },
    });
    expect(summary).toContain("değişiklik önerisi");
    expect(summary).not.toContain("yeniden planlandı");
  });

  it("makes duplicate-looking manual task choices distinguishable or collapses exact duplicates", () => {
    const choices = manualTaskChoiceButtons([
      { id: "a", title: "Tarih · Not · Ders Notları", estimated_minutes: 35, planned_date: "2026-08-13", task_progress: [{ completed_minutes: 14 }] },
      { id: "b", title: "Tarih · Not · Ders Notları", estimated_minutes: 35, planned_date: "2026-08-14", task_progress: [{ completed_minutes: 0 }] },
      { id: "c", title: "Tarih · Not · Ders Notları", estimated_minutes: 35, planned_date: "2026-08-14", task_progress: [{ completed_minutes: 0 }] },
    ]).flat();
    expect(new Set(choices.map((choice) => choice.text)).size).toBe(choices.length);
    expect(choices.map((choice) => choice.text).join(" ")).toContain("21 dk");
    expect(choices).toHaveLength(2);
  });

  it("uses mastery labels without unnecessary precision", () => {
    const presentation = testResultPresentation({ total_questions: 30, correct_count: 23, wrong_count: 7, blank_count: 0 }, { assessment: { resulting_mastery_level: "fragile" } });
    expect(presentation.text).toContain("Dikkat istiyor");
    expect(presentation.text).not.toMatch(/\.\d{2,}/);
    expect(presentation.card?.variant).toBe("result");
    expect(presentation.card?.headline).toBe("30 SORU");
    expect(presentation.card?.metrics?.map((metric) => metric.label)).toEqual(["DOĞRU", "YANLIŞ", "BOŞ"]);
  });

  it("only computes weekly completion when a real plan exists", () => {
    const withPlan = weeklyReportPresentation({ week_start_date: "2026-08-07", week_end_date: "2026-08-13", actual_minutes: 120, planned_minutes: 240, completed_task_count: 2, planned_task_count: 4, question_count: 30, revision_completed_count: 1, revision_due_count: 2 });
    const withoutPlan = weeklyReportPresentation({ week_start_date: "2026-08-07", week_end_date: "2026-08-13", actual_minutes: 120, planned_minutes: 0, completed_task_count: 2, planned_task_count: 0, question_count: 0, revision_completed_count: 0, revision_due_count: 0 });
    expect(withPlan.text).toContain("%50");
    expect(withoutPlan.text).not.toContain("%0");
  });

  it("summarizes available weekly status signals in at most three review sections", () => {
    const presentation = weeklyReportPresentation({
      week_start_date: "2026-08-07",
      week_end_date: "2026-08-13",
      actual_minutes: 180,
      planned_minutes: 240,
      completed_task_count: 4,
      planned_task_count: 6,
      question_count: 80,
      revision_completed_count: 1,
      revision_due_count: 2,
      plan_status: "attention",
      backlog_severity: "risk",
      explanation: "Gelecek hafta açık görevleri sadeleştir.",
    });
    expect(presentation.card.items).toHaveLength(3);
    expect(presentation.card.items?.map((item) => item.title)).toEqual(["PLAN DURUMU", "AÇIK İŞ YÜKÜ", "SONRAKİ HAFTA"]);
  });
});
