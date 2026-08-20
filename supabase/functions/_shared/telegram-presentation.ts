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
  continue: "Devam Et",
  next: "Sonraki Görev",
  today: "Bugünü Gör",
  lowTime: "Az Vaktim Var",
  noStudy: "Bugün Çalışamam",
  addStudy: "Çalışma Ekle",
  reopenDay: "Bugün Plan Aç",
  findTest: "Test Görevini Bul",
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
  primary?: { label: string; title: string; detail?: string; meta?: string; reason?: string };
  items?: TelegramCardItem[];
  moreItems?: number;
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

function formatCardSessionMinutes(minutes: unknown) {
  return `${Math.max(0, Math.round(Number(minutes) || 0))} dk`;
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

export const mainMenuButtons = (remainingCapacityMinutes?: number): TelegramButton[][] =>
  remainingCapacityMinutes === 0
    ? [[
      { text: TELEGRAM_BUTTON_LABELS.today, callback_data: "today" },
      { text: TELEGRAM_BUTTON_LABELS.addStudy, callback_data: "manual_begin" },
    ], [
      { text: TELEGRAM_BUTTON_LABELS.reopenDay, callback_data: "special" },
    ]]
    : [[
      { text: "Şimdi ne çalışayım?", callback_data: "now" },
    ], [
      { text: TELEGRAM_BUTTON_LABELS.today, callback_data: "today" },
      { text: TELEGRAM_BUTTON_LABELS.addStudy, callback_data: "manual_begin" },
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

export function formatStartedSessionMessage(title: string, plannedMinutes: number) {
  return `Çalışman başladı.\n${title}\nPlanlanan: ${formatMinutesShort(plannedMinutes)}.`;
}

export function totalCapacityForRemainingAvailability(completedMinutes: number, remainingAvailableMinutes: number) {
  return Math.max(0, Number(completedMinutes) || 0) + Math.max(0, Number(remainingAvailableMinutes) || 0);
}

export function completionActionButtons(input: { taskId?: string | null; remainingMinutes: number; needsResult?: boolean }): TelegramButton[][] {
  if (input.needsResult && input.taskId) return [[
    { text: "Sonuç Gir", callback_data: `result_begin:${input.taskId}` },
    { text: TELEGRAM_BUTTON_LABELS.today, callback_data: "today" },
  ]];
  if (input.taskId && input.remainingMinutes > 0) return [[
    { text: TELEGRAM_BUTTON_LABELS.continue, callback_data: `task_start:${input.taskId}:${input.remainingMinutes}` },
    { text: TELEGRAM_BUTTON_LABELS.today, callback_data: "today" },
  ]];
  return [[
    { text: TELEGRAM_BUTTON_LABELS.next, callback_data: "now" },
    { text: TELEGRAM_BUTTON_LABELS.today, callback_data: "today" },
  ]];
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
  if (Number(summary.remainingCapacityMinutes ?? 0) <= 0 && !summary.activeSession) {
    return Number(summary.studiedMinutes ?? 0) > 0
      ? `Bugün için çalışma planın kapalı. ${formatMinutesShort(summary.studiedMinutes)} çalışma kaydedildi.`
      : "Bugün için çalışma planın kapalı.";
  }
  const tasks = (summary.tasks ?? []).slice(0, 4);
  if (!tasks.length) {
    if (summary.recommendation?.needsResult) return `${summary.recommendation.title}\nTest sonucu girişi bekliyor.`;
    if (summary.recommendation) return `Bugünün planlanan süresi tamamlandı.\n\nSıradaki: ${summary.recommendation.title} · ${formatMinutesShort(summary.recommendation.remainingMinutes)}`;
    return Number(summary.studiedMinutes ?? 0) > 0 ? `Bugünün açık görevi kalmadı. ${formatMinutesShort(summary.studiedMinutes)} kaydedildi.` : "Bugün için açık bir çalışma görevi yok.";
  }
  const completedIds = new Set((summary.allTasks ?? []).filter((task: any) => task.status === "completed").map((task: any) => task.id));
  const lines = tasks.flatMap((task: any) => {
    const baseLine = `${completedIds.has(task.id) ? "✓" : "○"} ${task.title} · ${task.needsResult ? "sonuç bekliyor" : formatMinutesShort(task.minutes)}`;
    return task.materialSummary ? [baseLine, `  ${task.materialSummary}`] : [baseLine];
  });
  return [
    `Bugün · ${formatTelegramDate(summary.date, true)}`,
    `${formatMinutesShort(summary.studiedMinutes ?? 0)} tamamlandı · ${formatMinutesShort(summary.remainingCapacityMinutes ?? 0)} kaldı`,
    "",
    ...lines,
    (summary.tasks ?? []).length > 4 ? `\n+${summary.tasks.length - 4} görev daha` : "",
  ].filter(Boolean).join("\n");
}

export function dailyCoachCard(summary: any): TelegramCardModel {
  const recommendation = Number(summary.remainingCapacityMinutes ?? 0) > 0 || summary.recommendation?.needsResult
    ? summary.recommendation
    : null;
  const completedIds = new Set((summary.allTasks ?? []).filter((task: any) => task.status === "completed").map((task: any) => task.id));
  const planned = Number(summary.capacityMinutes ?? 0);
  const studied = Number(summary.studiedMinutes ?? 0);
  return {
    variant: "today",
    eyebrow: "BUGÜN",
    title: formatTelegramDate(summary.date).toLocaleUpperCase("tr-TR"),
    date: new Intl.DateTimeFormat("tr-TR", { weekday: "long", timeZone: "UTC" })
      .format(new Date(`${String(summary.date).slice(0, 10)}T12:00:00Z`)),
    metrics: [
      { label: "PLANLANAN", value: formatMinutesShort(planned) },
      { label: "TAMAMLANAN", value: formatMinutesShort(studied) },
      { label: "KALAN", value: formatMinutesShort(summary.remainingCapacityMinutes ?? 0) },
    ],
    primary: recommendation ? (() => {
      const parts = taskParts(recommendation.title);
      return {
        label: "ŞİMDİ",
        title: `${parts.subject} · ${parts.topic}`,
        detail: parts.resource || undefined,
        meta: recommendation.needsResult ? "Sonuç girişi" : formatCardSessionMinutes(recommendation.recommendedSessionMinutes ?? recommendation.remainingMinutes),
        reason: recommendationReasonText(recommendation.reason) || undefined,
      };
    })() : undefined,
    items: (summary.tasks ?? []).slice(0, 3).map((task: any) => ({
      state: completedIds.has(task.id) ? "done" : "next",
      title: (() => {
        const parts = taskParts(task.title);
        return `${parts.subject} · ${parts.topic}`;
      })(),
      detail: task.needsResult ? "Sonuç bekliyor" : formatMinutesShort(task.minutes),
    })),
    moreItems: Math.max(0, Number(summary.tasks?.length ?? 0) - 3) || undefined,
    progress: planned > 0 ? { label: "GÜNLÜK İLERLEME", value: `%${Math.min(100, Math.round(studied / planned * 100))}`, percent: Math.min(100, studied / planned * 100) } : undefined,
    note: !recommendation && !(summary.tasks ?? []).length
      ? Number(summary.remainingCapacityMinutes ?? 0) <= 0
        ? "Bugün için çalışma planın kapalı."
        : "Bugün için açık çalışma kalmadı."
      : undefined,
  };
}

export function formatNowCoachMessage(recommendation: any) {
  if (!recommendation) return "Şu anda önerebileceğim açık bir görev yok.";
  if (recommendation.needsResult) return `${recommendation.title}\nÇalışma tamamlandı; test sonucunu girmen gerekiyor.`;
  const reason = recommendationReasonText(recommendation.reason);
  const sessionMinutes = Number(recommendation.recommendedSessionMinutes ?? recommendation.remainingMinutes ?? 0);
  const taskRemainingMinutes = Number(recommendation.taskRemainingMinutes ?? recommendation.remainingMinutes ?? 0);
  const partial = sessionMinutes > 0 && taskRemainingMinutes > sessionMinutes
    ? `Bugün ${formatMinutesShort(sessionMinutes)} ilerle, ${formatMinutesShort(taskRemainingMinutes - sessionMinutes)} kalır.`
    : "";
  return ["Şimdi", recommendation.title, formatMinutesShort(sessionMinutes), partial, reason ? `Neden: ${reason}` : ""].filter(Boolean).join("\n");
}

export function nowCoachCard(recommendation: any, date: string): TelegramCardModel {
  const parts = taskParts(recommendation.title);
  return {
    variant: "now",
    eyebrow: "ŞİMDİ",
    title: `${parts.subject} · ${parts.topic}`,
    date: formatTelegramDate(date, true),
    headline: recommendation.needsResult ? "Sonuç girişi" : formatCardSessionMinutes(recommendation.recommendedSessionMinutes ?? recommendation.remainingMinutes),
    subhead: parts.resource || undefined,
    note: recommendationReasonText(recommendation.reason) || undefined,
  };
}

function manualTaskRemaining(task: any) {
  return Math.max(0, Number(task.estimated_minutes ?? 0) - Number(task.task_progress?.[0]?.completed_minutes ?? 0));
}

export function manualTaskChoiceButtons(tasks: any[]): TelegramButton[][] {
  const candidates = tasks.map((task) => {
    const remaining = manualTaskRemaining(task);
    const topic = task.curriculum_nodes?.name;
    const resource = task.resources?.name;
    const parts = [task.title, topic && !String(task.title).includes(topic) ? topic : null, resource && !String(task.title).includes(resource) ? resource : null]
      .filter(Boolean);
    return { task, base: parts.join(" · "), remaining };
  });
  const baseCounts = new Map<string, number>();
  for (const candidate of candidates) baseCounts.set(candidate.base, (baseCounts.get(candidate.base) ?? 0) + 1);
  const seen = new Set<string>();
  const buttons: TelegramButton[][] = [];
  for (const candidate of candidates) {
    const suffix = (baseCounts.get(candidate.base) ?? 0) > 1
      ? ` · ${formatMinutesShort(candidate.remaining)}${candidate.task.planned_date ? ` · ${formatTelegramDate(candidate.task.planned_date)}` : ""}`
      : candidate.remaining > 0 ? ` · ${formatMinutesShort(candidate.remaining)}` : "";
    const label = `${candidate.base.slice(0, Math.max(12, 58 - suffix.length))}${suffix}`;
    if (seen.has(label)) continue;
    seen.add(label);
    buttons.push([{ text: label, callback_data: `manual_task:${candidate.task.id}` }]);
    if (buttons.length === 3) break;
  }
  return buttons;
}

export function completionCard(input: { title: string; actualMinutes: number; remainingMinutes: number; next?: any; replan?: any }): TelegramCardModel {
  const next = input.next ? taskParts(input.next.title) : null;
  return {
    variant: "completion",
    eyebrow: "ÇALIŞMA KAYDEDİLDİ",
    title: formatCardSessionMinutes(input.actualMinutes),
    subhead: input.title,
    metrics: input.remainingMinutes > 0 ? [{ label: "BU GÖREVDE KALAN", value: formatMinutesShort(input.remainingMinutes) }] : [{ label: "DURUM", value: "Görev tamamlandı" }],
    primary: next ? { label: input.remainingMinutes > 0 ? "DEVAM" : "SIRADAKİ", title: `${next.subject} · ${next.topic}`, detail: next.resource || undefined, meta: formatCardSessionMinutes(input.next.recommendedSessionMinutes ?? input.next.remainingMinutes) } : undefined,
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
  const intervalDays = Number(revision?.interval_days ?? revision?.intervalDays);
  const revisionText = Number.isFinite(intervalDays) && intervalDays > 0
    ? `Tekrar planlandı · ${intervalDays} gün sonra`
    : revision?.scheduled_for || revision?.scheduledFor
    ? `Tekrar planlandı · ${formatTelegramDate(revision.scheduled_for ?? revision.scheduledFor)}`
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
    headline: `${result.total_questions} SORU`,
    metrics: [
      { label: "DOĞRU", value: String(result.correct_count) },
      { label: "YANLIŞ", value: String(result.wrong_count) },
      { label: "BOŞ", value: String(result.blank_count ?? 0) },
    ],
    note: revisionText || undefined,
  } : null;
  return { text, card };
}

export function weeklyReportPresentation(report: any) {
  const planned = Number(report.planned_minutes ?? 0);
  const actual = Number(report.actual_minutes ?? 0);
  const percent = planned > 0 ? Math.min(100, Math.round(actual / planned * 100)) : null;
  const range = formatTelegramWeek(report.week_start_date, report.week_end_date);
  const planStatus: Record<string, string> = {
    good: "Plan dengeli ilerliyor.",
    attention: "Plan ritmi dikkat istiyor.",
    risk: "Plan yeni haftada sadeleştirilmeli.",
  };
  const backlogStatus: Record<string, string> = {
    normal: "Açık görev yükü kontrol altında.",
    attention: "Açık görev yükünü yakından izle.",
    risk: "Açık görev yükü kapasiteyi zorluyor.",
    critical: "Açık görev yükü kapasiteyi aşıyor.",
  };
  const insights: TelegramCardItem[] = [];
  if (report.plan_status) insights.push({ title: "PLAN DURUMU", detail: planStatus[report.plan_status] ?? String(report.plan_status) });
  if (report.backlog_severity) insights.push({ title: "AÇIK İŞ YÜKÜ", detail: backlogStatus[report.backlog_severity] ?? String(report.backlog_severity) });
  if (report.explanation) insights.push({ title: "SONRAKİ HAFTA", detail: String(report.explanation) });
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
      items: insights.length ? insights : undefined,
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
    primary: first ? { label: "BUGÜNÜN İLK GÖREVİ", title: first.title, meta: formatCardSessionMinutes(first.remainingMinutes) } : undefined,
  } satisfies TelegramCardModel };
}
