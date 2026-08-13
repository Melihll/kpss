export type TelegramIntent =
  | "greeting"
  | "today"
  | "now"
  | "revision"
  | "minimum"
  | "special"
  | "no_study"
  | "manual"
  | "test_result"
  | "help"
  | "unknown";

export type TelegramButton = { text: string; callback_data: string };

export const TELEGRAM_BUTTON_LABELS = {
  start: "Çalışmaya Başla",
  finish: "Bitir",
  next: "Sonraki Görev",
  today: "Bugünü Gör",
  lowTime: "Az Vaktim Var",
  noStudy: "Bugün Çalışamam",
} as const;

export type TelegramCardMetric = { label: string; value: string };
export type TelegramCardItem = { state?: "done" | "next" | "muted"; title: string; detail?: string };
export type TelegramCardModel = {
  variant: "today" | "now" | "week" | "report" | "completion" | "result" | "replan";
  eyebrow: string;
  title: string;
  date?: string;
  headline?: string;
  subhead?: string;
  metrics?: TelegramCardMetric[];
  primary?: { label: string; title: string; detail?: string; meta?: string };
  items?: TelegramCardItem[];
  progress?: { label: string; value: string; percent: number };
  note?: string;
};

const fold = (value: string) => value
  .toLocaleLowerCase("tr-TR")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/ı/g, "i")
  .replace(/[^a-z0-9çğıöşü\s/?]/gi, " ")
  .replace(/\s+/g, " ")
  .trim();

export const foldedTelegramText = fold;

export function classifyTelegramText(text: string): TelegramIntent {
  const value = fold(text);
  if (!value) return "unknown";
  if (["/start", "merhaba", "selam", "selamlar", "gunaydin", "iyi aksamlar", "iyi gunler", "hey"].includes(value)) return "greeting";
  if (/(bugun (calisamayacagim|yokum|pas|yapamayacagim)|bugun baska yapamam)/.test(value)) return "no_study";
  if (value === "/bugun" || /(bugun.*(ne|plan|calis)|bugunku plan|bugun ne var|bugun ne kaldi)/.test(value)) return "today";
  if (value === "/simdi" || /(ne calisayim|ne yapmaliyim|simdi ne|sirada ne|hangi derse)/.test(value)) return "now";
  if (value === "/tekrar" || /(tekrarlarim|tekrar ne|tekrar var)/.test(value)) return "revision";
  if (value === "/minimum" || /(minimum plan|en az ne)/.test(value)) return "minimum";
  if (value === "/ozel" || /(ozel durum|az vaktim|daha az vaktim|ekstra vaktim|vaktim degisti|dakikam var|saatim var)/.test(value)) return "special";
  if (parseTestResultText(text)) return "test_result";
  if (value === "/calisma_ekle" || /(calisma ekle|calistim|kayit ekle)/.test(value) || parseManualStudyText(text)) return "manual";
  if (value === "/help" || value === "/yardim" || value === "yardim") return "help";
  return "unknown";
}

export function parseAvailableMinutes(text: string) {
  const value = fold(text);
  if (/yarim\s+saat/.test(value)) return 30;
  const hours = value.match(/(\d+(?:[.,]\d+)?)\s*(?:saat|sa)/)?.[1];
  const minutes = value.match(/(\d+)\s*(?:dakika|dakikam|dk)/)?.[1];
  if (!hours && !minutes) return null;
  return Math.max(0, Math.round((hours ? Number(hours.replace(",", ".")) * 60 : 0) + Number(minutes ?? 0)));
}

export function parseManualStudyText(text: string) {
  const value = fold(text);
  if (!/(calistim|calisma yaptim)/.test(value)) return null;
  const minutes = parseAvailableMinutes(text);
  if (!minutes) return null;
  const query = value
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:saat|sa|dakika|dakikam|dk)\b/g, " ")
    .replace(/\b(calisma yaptim|calistim)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { minutes, query };
}

export type ParsedTestResult = { total: number; correct: number; wrong: number; blank: number; query: string };

export function parseTestResultText(text: string): ParsedTestResult | null {
  const value = fold(text);
  const totalMatch = value.match(/(\d+)\s*soru/);
  const correctMatch = value.match(/(\d+)\s*dogru/);
  const wrongMatch = value.match(/(\d+)\s*yanlis/);
  const blankMatch = value.match(/(\d+)\s*bos/);
  if (!totalMatch || (!correctMatch && !wrongMatch && !blankMatch)) return null;
  const total = Number(totalMatch[1]);
  const wrong = Number(wrongMatch?.[1] ?? 0);
  const blank = Number(blankMatch?.[1] ?? 0);
  const correct = correctMatch ? Number(correctMatch[1]) : total - wrong - blank;
  if (total <= 0 || correct < 0 || wrong < 0 || blank < 0 || correct + wrong + blank !== total) return null;
  const query = value
    .replace(/\b\d+\s*(?:soru|dogru|yanlis|bos)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { total, correct, wrong, blank, query };
}

export function formatMinutesShort(minutes: number, padMinutes = false) {
  const safe = Math.max(0, Math.round(Number(minutes) || 0));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  if (!hours) return `${rest} dk`;
  if (!rest) return `${hours}s`;
  return `${hours}s ${padMinutes ? String(rest).padStart(2, "0") : rest}dk`;
}

export function formatTelegramDate(value: string, weekday = false) {
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    ...(weekday ? { weekday: "long" } : {}),
    timeZone: "UTC",
  }).format(parsed);
}

export function formatTelegramWeek(start: string, end: string) {
  const startDate = new Date(`${start}T12:00:00Z`);
  const endDate = new Date(`${end}T12:00:00Z`);
  if (startDate.getUTCMonth() === endDate.getUTCMonth()) return `${startDate.getUTCDate()}–${formatTelegramDate(end)}`;
  return `${formatTelegramDate(start)} – ${formatTelegramDate(end)}`;
}

function taskParts(title: string) {
  const parts = String(title ?? "Çalışma").split(" · ").map((item) => item.trim()).filter(Boolean);
  return { subject: parts[0] ?? "Çalışma", topic: parts[1] ?? parts[0] ?? "Çalışma", resource: parts.slice(2).join(" · ") };
}

export function recommendationReasonText(reason: string) {
  const labels: Record<string, string> = {
    continue_in_progress: "Başladığın çalışma devam ediyor.",
    continue_partial: "Yarım kalan görevin önce geliyor.",
    critical_revision: "Kritik bir tekrar gecikmiş durumda.",
    overdue_core: "Çekirdek görev gecikmiş durumda.",
    weak_topic: "Bu konu yakın çalışma istiyor.",
    due_revision: "Tekrar zamanı geldi.",
    today_core: "Bugünün çekirdek görevi.",
    overdue_important: "Önemli görev gecikmiş durumda.",
    today_important: "Bugünün önemli görevi.",
    fits_available_window: "Elindeki süreye en iyi uyan görev.",
    optional: "Uygun bir ek çalışma.",
    highest_priority: "Şu an en yüksek öncelikli görev.",
  };
  return labels[reason] ?? "";
}

export const mainMenuButtons = (): TelegramButton[][] => [[
  { text: "Şimdi ne çalışayım?", callback_data: "now" },
], [
  { text: TELEGRAM_BUTTON_LABELS.today, callback_data: "today" },
  { text: "Çalışma ekle", callback_data: "manual_begin" },
], [
  { text: TELEGRAM_BUTTON_LABELS.lowTime, callback_data: "special_less" },
]];

export function formatActiveSessionMessage(session: any, elapsedMinutes: number) {
  return [
    "Çalışman devam ediyor.",
    session?.task?.title ?? "Aktif çalışma",
    `${Math.max(0, Math.floor(elapsedMinutes))} dk geçti.`,
  ].join("\n");
}

export function greetingMessage() {
  return "Bugün için en iyi sonraki adımı seçelim. İstersen yaz, istersen aşağıdan seç.";
}

export function friendlyHelpMessage() {
  return "Ne yapmak istiyorsun? Kısa yazabilirsin: “25 dakikam var”, “40 dk anayasa çalıştım” veya “30 soru 7 yanlış”.";
}

export function unknownMessage() {
  return "Bunu netleştiremedim. Aşağıdaki seçeneklerden devam edebilirsin.";
}

export function formatDailyCoachMessage(summary: any) {
  if (!summary?.plan) return "Aktif haftalık plan görünmüyor. Planını web uygulamasından açtıktan sonra tekrar deneyebilirsin.";
  const tasks = (summary.tasks ?? []).slice(0, 4);
  if (!tasks.length) {
    if (summary.recommendation?.needsResult) return `${summary.recommendation.title}\nTest sonucu girişi bekliyor.`;
    if (summary.recommendation) return `Bugünün planlanan süresi tamamlandı.\n\nSıradaki: ${summary.recommendation.title} · ${formatMinutesShort(summary.recommendation.remainingMinutes)}`;
    return Number(summary.studiedMinutes ?? 0) > 0 ? `Bugünün açık görevi kalmadı. ${formatMinutesShort(summary.studiedMinutes)} kaydedildi.` : "Bugün için açık bir çalışma görevi yok.";
  }
  const completedIds = new Set((summary.allTasks ?? []).filter((task: any) => task.status === "completed").map((task: any) => task.id));
  const lines = tasks.map((task: any) => `${completedIds.has(task.id) ? "✓" : "○"} ${task.title} · ${task.needsResult ? "sonuç bekliyor" : formatMinutesShort(task.minutes)}`);
  return [
    `Bugün · ${formatTelegramDate(summary.date, true)}`,
    `${formatMinutesShort(summary.studiedMinutes ?? 0)} tamamlandı · ${formatMinutesShort(summary.remainingCapacityMinutes ?? 0)} kaldı`,
    "",
    ...lines,
    (summary.tasks ?? []).length > 4 ? `\n+${summary.tasks.length - 4} görev daha` : "",
  ].filter(Boolean).join("\n");
}

export function dailyCoachCard(summary: any): TelegramCardModel {
  const recommendation = summary.recommendation;
  const completedIds = new Set((summary.allTasks ?? []).filter((task: any) => task.status === "completed").map((task: any) => task.id));
  const planned = Number(summary.capacityMinutes ?? 0);
  const studied = Number(summary.studiedMinutes ?? 0);
  return {
    variant: "today",
    eyebrow: "BUGÜN",
    title: formatTelegramDate(summary.date).toLocaleUpperCase("tr-TR"),
    metrics: [
      { label: "PLANLANAN", value: formatMinutesShort(planned) },
      { label: "TAMAMLANAN", value: formatMinutesShort(studied) },
      { label: "KALAN", value: formatMinutesShort(summary.remainingCapacityMinutes ?? 0) },
    ],
    primary: recommendation ? (() => {
      const parts = taskParts(recommendation.title);
      return { label: "ŞİMDİ", title: `${parts.subject} · ${parts.topic}`, detail: parts.resource || undefined, meta: recommendation.needsResult ? "Sonuç girişi" : formatMinutesShort(recommendation.remainingMinutes) };
    })() : undefined,
    items: (summary.tasks ?? []).slice(0, 4).map((task: any) => ({
      state: completedIds.has(task.id) ? "done" : "next",
      title: (() => {
        const parts = taskParts(task.title);
        return `${parts.subject} · ${parts.topic}`;
      })(),
      detail: task.needsResult ? "Sonuç bekliyor" : formatMinutesShort(task.minutes),
    })),
    progress: planned > 0 ? { label: "GÜNLÜK İLERLEME", value: `%${Math.min(100, Math.round(studied / planned * 100))}`, percent: Math.min(100, studied / planned * 100) } : undefined,
  };
}

export function formatNowCoachMessage(recommendation: any) {
  if (!recommendation) return "Şu anda önerebileceğim açık bir görev yok.";
  if (recommendation.needsResult) return `${recommendation.title}\nÇalışma tamamlandı; test sonucunu girmen gerekiyor.`;
  const reason = recommendationReasonText(recommendation.reason);
  return [`Şimdi`, recommendation.title, formatMinutesShort(recommendation.remainingMinutes), reason ? `Neden: ${reason}` : ""].filter(Boolean).join("\n");
}

export function nowCoachCard(recommendation: any, date: string): TelegramCardModel {
  const parts = taskParts(recommendation.title);
  return {
    variant: "now",
    eyebrow: "ŞİMDİ",
    title: `${parts.subject} · ${parts.topic}`,
    date: formatTelegramDate(date, true),
    headline: recommendation.needsResult ? "Sonuç girişi" : formatMinutesShort(recommendation.remainingMinutes),
    subhead: parts.resource || undefined,
    note: recommendationReasonText(recommendation.reason) || undefined,
  };
}

export function completionCard(input: { title: string; actualMinutes: number; remainingMinutes: number; next?: any; replan?: any }): TelegramCardModel {
  const next = input.next ? taskParts(input.next.title) : null;
  return {
    variant: "completion",
    eyebrow: "ÇALIŞMA KAYDEDİLDİ",
    title: formatMinutesShort(input.actualMinutes),
    subhead: input.title,
    metrics: input.remainingMinutes > 0 ? [{ label: "BU GÖREVDE KALAN", value: formatMinutesShort(input.remainingMinutes) }] : [{ label: "DURUM", value: "Tamamlandı" }],
    primary: next ? { label: "SIRADAKİ", title: `${next.subject} · ${next.topic}`, detail: next.resource || undefined, meta: formatMinutesShort(input.next.remainingMinutes) } : undefined,
    note: formatReplanSummary(input.replan) || undefined,
  };
}

export function formatReplanSummary(replan: any) {
  const decision = replan?.decision;
  const moved = Number(decision?.tasksToMove?.length ?? decision?.changedTaskCount ?? 0);
  const cancelled = Number(decision?.tasksToCancel?.length ?? 0);
  const created = Number(decision?.tasksToCreate?.length ?? 0);
  const parts: string[] = [];
  if (moved > 0) parts.push(`${moved} görev yeniden yerleştirildi`);
  if (cancelled > 0) parts.push(`${cancelled} düşük öncelikli görev bu haftadan çıkarıldı`);
  if (created > 0) parts.push(`${created} tekrar plana eklendi`);
  return parts.length ? `${parts.join(". ")}.` : "";
}

export function replanCard(title: string, replan: any, note?: string): TelegramCardModel {
  const moved = Number(replan?.decision?.tasksToMove?.length ?? replan?.decision?.changedTaskCount ?? 0);
  return { variant: "replan", eyebrow: "PLAN GÜNCELLENDİ", title, metrics: [
    { label: "YERİ DEĞİŞEN", value: String(moved) },
    { label: "EKLENEN TEKRAR", value: String(replan?.decision?.tasksToCreate?.length ?? 0) },
  ], note: note || formatReplanSummary(replan) || undefined };
}

const MASTERY_LABELS: Record<string, string> = { strong: "Güçlü", sufficient: "Yeterli", fragile: "Dikkat istiyor", weak: "Dikkat istiyor", critical: "Kritik tekrar", unknown: "Yeni" };

export function testResultPresentation(result: any, mastery: any) {
  const level = mastery?.assessment?.resulting_mastery_level ?? mastery?.assessment?.resultingMasteryLevel;
  const revision = mastery?.revision;
  const status = level ? MASTERY_LABELS[level] ?? "Değerlendirildi" : null;
  const revisionText = revision?.scheduled_for || revision?.scheduledFor
    ? `${formatTelegramDate(revision.scheduled_for ?? revision.scheduledFor)} kısa tekrar`
    : null;
  const text = [
    "Test değerlendirmesi",
    `${result.total_questions} soru · ${result.correct_count} doğru · ${result.wrong_count} yanlış${result.blank_count ? ` · ${result.blank_count} boş` : ""}`,
    status ? `Durum: ${status}` : "",
    revisionText ? `Önerilen: ${revisionText}` : "",
  ].filter(Boolean).join("\n");
  const card: TelegramCardModel | null = status ? {
    variant: "result",
    eyebrow: "TEST DEĞERLENDİRMESİ",
    title: status,
    metrics: [
      { label: "SORU", value: String(result.total_questions) },
      { label: "DOĞRU", value: String(result.correct_count) },
      { label: "YANLIŞ", value: String(result.wrong_count) },
    ],
    note: revisionText ? `Önerilen: ${revisionText}` : undefined,
  } : null;
  return { text, card };
}

export function weeklyReportPresentation(report: any) {
  const planned = Number(report.planned_minutes ?? 0);
  const actual = Number(report.actual_minutes ?? 0);
  const percent = planned > 0 ? Math.min(100, Math.round(actual / planned * 100)) : null;
  const range = formatTelegramWeek(report.week_start_date, report.week_end_date);
  const text = [
    `Haftalık rapor · ${range}`,
    planned > 0 ? `${formatMinutesShort(actual, true)} / ${formatMinutesShort(planned, true)}` : `${formatMinutesShort(actual, true)} çalışma`,
    `${report.completed_task_count} / ${report.planned_task_count} görev`,
    Number.isFinite(Number(report.question_count)) ? `${report.question_count} soru` : "",
    percent !== null ? `Planın %${percent}’i tamamlandı.` : "",
  ].filter(Boolean).join("\n");
  return {
    text,
    card: {
      variant: "report",
      eyebrow: "HAFTALIK RAPOR",
      title: range.toLocaleUpperCase("tr-TR"),
      headline: formatMinutesShort(actual, true),
      subhead: planned > 0 ? `${formatMinutesShort(planned, true)} plan` : "Çalışma kaydı",
      metrics: [
        { label: "GÖREV", value: `${report.completed_task_count}/${report.planned_task_count}` },
        { label: "SORU", value: String(report.question_count ?? 0) },
        { label: "TEKRAR", value: `${report.revision_completed_count}/${report.revision_due_count}` },
      ],
      progress: percent !== null ? { label: "PLAN TAMAMLAMA", value: `%${percent}`, percent } : undefined,
      note: report.explanation || undefined,
    } satisfies TelegramCardModel,
  };
}

export function weeklyStartPresentation(summary: any) {
  const tasks = (summary.allTasks ?? []).filter((task: any) => task.status !== "cancelled");
  const revisions = tasks.filter((task: any) => task.revision_schedule_id).length;
  const focuses = [...new Set(tasks.slice().sort((a: any, b: any) => Number(b.priority_score ?? 0) - Number(a.priority_score ?? 0)).map((task: any) => taskParts(task.title).subject))].slice(0, 2);
  const first = summary.recommendation;
  const text = [
    "Bu hafta",
    `${formatMinutesShort(summary.plan?.planned_minutes ?? tasks.reduce((sum: number, task: any) => sum + Number(task.estimated_minutes ?? 0), 0))} hedef · ${tasks.length} görev${revisions ? ` · ${revisions} tekrar` : ""}`,
    focuses.length ? `Ana odak: ${focuses.join(" + ")}` : "",
    first ? `Bugünün ilk görevi: ${first.title}` : "",
  ].filter(Boolean).join("\n");
  return { text, card: {
    variant: "week",
    eyebrow: "BU HAFTA",
    title: `${formatMinutesShort(summary.plan?.planned_minutes ?? 0)} HEDEF`,
    metrics: [{ label: "GÖREV", value: String(tasks.length) }, { label: "TEKRAR", value: String(revisions) }],
    headline: focuses.join(" + ") || undefined,
    primary: first ? { label: "BUGÜNÜN İLK GÖREVİ", title: first.title, meta: formatMinutesShort(first.remainingMinutes) } : undefined,
  } satisfies TelegramCardModel };
}
