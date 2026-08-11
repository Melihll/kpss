export type TelegramIntent = "greeting" | "today" | "now" | "revision" | "minimum" | "special" | "manual" | "help" | "unknown";

const fold = (value: string) => value
  .toLocaleLowerCase("tr-TR")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/ı/g, "i")
  .replace(/[^a-z0-9çğıöşü\s/?]/gi, " ")
  .replace(/\s+/g, " ")
  .trim();

export function classifyTelegramText(text: string): TelegramIntent {
  const value = fold(text);
  if (!value) return "unknown";
  if (["/start", "merhaba", "selam", "selamlar", "gunaydin", "iyi aksamlar", "iyi gunler", "hey"].some((item) => value === item)) return "greeting";
  if (value === "/bugun" || /(bugun.*(ne|plan|calis)|bugunku plan|bugun ne var)/.test(value)) return "today";
  if (value === "/simdi" || /(ne calisayim|ne yapmaliyim|simdi ne|sirada ne|hangi derse)/.test(value)) return "now";
  if (value === "/tekrar" || /(tekrarlarim|tekrar ne|tekrar var)/.test(value)) return "revision";
  if (value === "/minimum" || /(minimum plan|en az ne)/.test(value)) return "minimum";
  if (value === "/ozel" || /(ozel durum|az vaktim|daha az vaktim|ekstra vaktim|vaktim degisti)/.test(value)) return "special";
  if (value === "/calisma_ekle" || /(calisma ekle|calistim|kayit ekle)/.test(value)) return "manual";
  if (value === "/help" || value === "/yardim" || value === "yardim") return "help";
  return "unknown";
}

export function recommendationReasonText(reason: string) {
  const labels: Record<string, string> = {
    continue_in_progress: "başladığın işi sürdürmek en verimli seçenek",
    continue_partial: "yarım kalan görevi tamamlamak öncelikli",
    critical_revision: "kritik gecikmiş tekrar var",
    overdue_core: "çekirdek görev gecikmiş durumda",
    weak_topic: "zayıf konu yakın çalışma istiyor",
    due_revision: "tekrar zamanı geldi",
    today_core: "bugünün çekirdek görevi",
    overdue_important: "önemli görev gecikmiş durumda",
    today_important: "bugünün önemli görevi",
    fits_available_window: "mevcut sürene en iyi uyan görev",
    optional: "uygun bir ek çalışma",
    highest_priority: "şu an en yüksek önceliğe sahip görev",
  };
  return labels[reason] ?? "şu an en yüksek değerli görev";
}

export function formatMinutesShort(minutes: number) {
  const safe = Math.max(0, Math.round(Number(minutes) || 0));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  return hours ? `${hours}s ${rest}dk` : `${rest} dk`;
}

export function formatDailyCoachMessage(summary: any) {
  if (!summary?.plan) return "Bu hafta için aktif plan bulamadım. Web uygulamasından haftalık planı oluşturduktan sonra tekrar deneyebilirsin.";
  const capacity = Number(summary.capacityMinutes ?? 0);
  const tasks = summary.tasks ?? [];
  const lines = tasks.map((task: any, index: number) => {
    if (task.needsResult) return `${index + 1}. ${task.title}\n   Sonuç girişi bekliyor`;
    const allocation = Number(task.minutes ?? 0);
    const remaining = Number(task.remainingMinutes ?? allocation);
    const suffix = remaining > allocation ? ` · toplam kalan ${formatMinutesShort(remaining)}` : "";
    return `${index + 1}. ${task.title}\n   ${formatMinutesShort(allocation)}${suffix}`;
  });

  if (!tasks.length) {
    if (summary.recommendation) {
      const recommendation = summary.recommendation;
      if (recommendation.needsResult) {
        return `Bugün için ayrılmış çalışma süresi kalmadı.\n\nAncak ${recommendation.title} için sonuç girişi bekliyor.`;
      }
      return `Bugün için ayrılmış çalışma süresi kalmadı.\n\nSıradaki önceliğin:\n${recommendation.title}\nKalan: ${formatMinutesShort(recommendation.remainingMinutes)}`;
    }
    return "Bugün için açık bir çalışma görevi görünmüyor.";
  }

  return [
    "Bugünkü çalışma planın",
    "",
    `Kapasite: ${formatMinutesShort(capacity)} · Kalan: ${formatMinutesShort(summary.remainingCapacityMinutes ?? capacity)}`,
    `Bugün kaydedilen: ${formatMinutesShort(summary.studiedMinutes ?? 0)}`,
    `Odak: ${tasks.length} görev · ${formatMinutesShort(summary.totalMinutes ?? 0)}`,
    "",
    lines.join("\n\n"),
  ].join("\n");
}

export function formatNowCoachMessage(recommendation: any) {
  if (!recommendation) return "Şu anda önerebileceğim açık bir görev yok.";
  if (recommendation.needsResult) {
    return `Sıradaki adım\n\n${recommendation.title}\nÇalışma süresi tamamlandı; test sonucunu girmen gerekiyor.`;
  }
  return [
    "Şimdi en değerli çalışma",
    "",
    recommendation.title,
    `Kalan: ${formatMinutesShort(recommendation.remainingMinutes)}`,
    `Neden: ${recommendationReasonText(recommendation.reason)}`,
  ].join("\n");
}

export function friendlyHelpMessage() {
  return "Ne yapmak istediğini kısa cümleyle yazabilirsin. Örneğin: “Bugün ne var?”, “Ne çalışayım?”, “Az vaktim var” veya “Çalışma ekle”.";
}

export function greetingMessage() {
  return "Selam 👋 KPSS Koçu hazır. Bugünkü planına bakabilir ya da doğrudan ne çalışman gerektiğini sorabilirsin.";
}
