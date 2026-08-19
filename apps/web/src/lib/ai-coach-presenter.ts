import type { AiEvidenceV1 } from "@kpss-coach/domain";
import type {
  AiCoachPlanPreviewResponse,
  AiCoachShadowPreviewChange,
} from "./ai-coach-api";

export type AiCoachPresentationTone = "neutral" | "positive" | "warning" | "danger";
export type AiCoachPreviewState = "KEEP" | "READY" | "BLOCKED" | null;

export interface AiCoachPresentationStat {
  readonly label: string;
  readonly value: string;
}

export interface AiCoachPresentationChange {
  readonly taskId: string;
  readonly changeType: "MOVE" | "BACKLOG";
  readonly subject: string;
  readonly title: string;
  readonly resource: string | null;
  readonly schedule: string;
  readonly remaining: string;
  readonly reason: string;
}

export interface AiCoachPresentation {
  readonly tone: AiCoachPresentationTone;
  readonly previewState: AiCoachPreviewState;
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
  readonly stats: readonly AiCoachPresentationStat[];
  readonly changes: readonly AiCoachPresentationChange[];
  readonly changeDetailsComplete: boolean;
  readonly note: string | null;
}

const TURKISH_MONTHS = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
] as const;

function compactMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} dk`;
  if (rest === 0) return `${hours} sa`;
  return `${hours} sa ${rest} dk`;
}

function dateLabel(date: string | null): string | null {
  if (!date) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return date;
  const monthIndex = Number(match[2]) - 1;
  const month = TURKISH_MONTHS[monthIndex];
  if (!month) return date;
  return `${Number(match[3])} ${month}`;
}

function capacityEvidence(evidence: readonly AiEvidenceV1[]) {
  return evidence.find((item) => item.type === "CAPACITY_CHANGE_REQUEST");
}

function capacityStat(response: Extract<AiCoachPlanPreviewResponse, { status: "VALID" }>, capacity: ReturnType<typeof capacityEvidence>): AiCoachPresentationStat | null {
  const resolved = response.capacityResolution;
  if (resolved?.source === "TARGET_MINUTES") {
    return { label: "Günlük kapasite", value: compactMinutes(resolved.targetMinutes) };
  }

  const deltaMinutes = capacity?.deltaMinutes ?? null;
  const direction = capacity?.direction ?? null;
  if (deltaMinutes == null) return null;
  return {
    label: "Kapasite değişimi",
    value: `${direction === "DECREASE" ? "−" : "+"}${compactMinutes(deltaMinutes)}`,
  };
}

function issueExplanation(issueCodes: readonly string[]): string | null {
  if (issueCodes.includes("PAST_DUE_REMAINING_WORK")) {
    return "Geçmişten kalan çalışma olduğu için planın küçük bir düzenlemeye ihtiyaç duyuyor.";
  }
  return null;
}

function changeReason(change: AiCoachShadowPreviewChange): string {
  if (change.reasonCodes.includes("LOCAL_PAST_DUE_REPAIR")) {
    return "Geçmiş görev";
  }
  if (change.reasonCodes.includes("LOCAL_DAILY_OVERLOAD_REPAIR")) {
    return "Kapasite dengesi";
  }
  if (change.changeType === "BACKLOG") {
    return "Bu hafta yer kalmadı";
  }
  return "Plan dengesi";
}

function presentChanges(
  changes: readonly AiCoachShadowPreviewChange[] | undefined,
): readonly AiCoachPresentationChange[] {
  return (changes ?? []).map((change) => {
    const from = dateLabel(change.fromDate);
    const to = dateLabel(change.toDate);
    const schedule = change.changeType === "BACKLOG"
      ? `${from ? `${from} → ` : ""}Sonraya`
      : `${from ?? "—"} → ${to ?? "—"}`;

    return {
      taskId: change.taskId,
      changeType: change.changeType,
      subject: change.subjectName ?? "Ders",
      title: change.title,
      resource: change.resourceName,
      schedule,
      remaining: `${compactMinutes(change.remainingMinutes)} kaldı`,
      reason: changeReason(change),
    };
  });
}

function emptyPresentation(
  input: Omit<AiCoachPresentation, "changes" | "changeDetailsComplete" | "previewState">,
): AiCoachPresentation {
  return {
    ...input,
    previewState: null,
    changes: [],
    changeDetailsComplete: true,
  };
}

export function presentAiCoachPreview(response: AiCoachPlanPreviewResponse): AiCoachPresentation {
  if (response.status === "NEEDS_CLARIFICATION") {
    return emptyPresentation({
      tone: "neutral",
      eyebrow: "Bir şeyi netleştirelim",
      title: response.clarificationQuestion,
      body: "Tarih ve süreyi biraz daha açık yazarsan planını güvenle değerlendirebilirim.",
      stats: [],
      note: null,
    });
  }

  if (response.status === "INVALID") {
    return emptyPresentation({
      tone: "warning",
      eyebrow: "Mesajı netleştiremedim",
      title: "Bunu plan kararına çevirmek için biraz daha bilgi gerekiyor.",
      body: "Örneğin “Yarın 60 dakika daha çalışabilirim” gibi tarih ve süreyi birlikte yazabilirsin.",
      stats: [],
      note: null,
    });
  }

  if (response.status === "GATEWAY_ERROR") {
    return emptyPresentation({
      tone: "danger",
      eyebrow: "Koç şu an meşgul",
      title: "Mesajını şu anda değerlendiremedim.",
      body: "Biraz sonra tekrar deneyebilirsin. Planında herhangi bir değişiklik yapılmadı.",
      stats: [],
      note: "Planın değişmedi.",
    });
  }

  const capacity = capacityEvidence(response.interpretation.evidence);
  const preview = response.shadowPreview;

  if (!preview) {
    if (response.capacityResolution?.noChange) {
      return emptyPresentation({
        tone: "positive",
        eyebrow: "Plan kontrol edildi",
        title: `Günlük kapasiten zaten ${compactMinutes(response.capacityResolution.targetMinutes)}.`,
        body: "Bu nedenle görevlerini yeniden düzenlemeye gerek yok.",
        stats: [{ label: "Günlük kapasite", value: compactMinutes(response.capacityResolution.targetMinutes) }],
        note: "Planın değişmedi.",
      });
    }

    const targetText = capacity?.targetMinutes != null
      ? `Toplam ${compactMinutes(capacity.targetMinutes)} çalışma isteğini anladım.`
      : "Mesajını anladım.";
    return emptyPresentation({
      tone: "neutral",
      eyebrow: "Mesaj alındı",
      title: targetText,
      body: response.error ? "Bu değişiklik için güvenli bir plan önizlemesi oluşturulamadı." : "Bu mesaj için henüz güvenli bir plan önizlemesi oluşmadı.",
      stats: [],
      note: "Planın değişmedi.",
    });
  }

  const resolvedCapacityStat = capacityStat(response, capacity);
  const explanation = issueExplanation(preview.evaluation.issueCodes);
  const changes = presentChanges(preview.changes);
  const changeDetailsComplete = preview.changeDetailsComplete ?? changes.length === preview.changedTaskCount;

  if (preview.decision === "KEEP_PLAN") {
    return {
      tone: "positive",
      previewState: "KEEP",
      eyebrow: "Plan kontrol edildi",
      title: "Mevcut planın bu değişikliği zaten karşılıyor.",
      body: explanation ?? "Görevlerini yeniden taşımaya gerek görünmüyor.",
      stats: [
        ...(resolvedCapacityStat ? [resolvedCapacityStat] : []),
        { label: "Etkilenen görev", value: String(preview.changedTaskCount) },
      ],
      changes,
      changeDetailsComplete,
      note: "Bu yalnızca önizleme; planın değişmedi.",
    };
  }

  if (preview.decision === "READY_TO_APPLY") {
    return {
      tone: "positive",
      previewState: "READY",
      eyebrow: "Plan önerisi hazır",
      title: "Programında küçük bir düzenleme öneriyorum.",
      body: explanation ?? "Yeni çalışma süreni mevcut programınla karşılaştırdım.",
      stats: [
        ...(resolvedCapacityStat ? [resolvedCapacityStat] : []),
        { label: "Etkilenen görev", value: String(preview.changedTaskCount) },
        { label: "Taşınan görev", value: String(preview.evaluation.movedTaskCount) },
        { label: "Sonraya kalan", value: String(preview.evaluation.backlogTaskCount) },
      ],
      changes,
      changeDetailsComplete,
      note: "Bu yalnızca önizleme; henüz hiçbir görev veya tarih değiştirilmedi.",
    };
  }

  return {
    tone: "warning",
    previewState: "BLOCKED",
    eyebrow: "Plan kontrol edildi",
    title: "Bu değişikliği şu anda güvenle planlayamıyorum.",
    body: explanation ?? "Mevcut plan koşulları güvenli bir öneri üretmek için yeterli değil.",
    stats: [
      ...(resolvedCapacityStat ? [resolvedCapacityStat] : []),
      { label: "Etkilenen görev", value: String(preview.changedTaskCount) },
    ],
    changes,
    changeDetailsComplete,
    note: "Planın değişmedi.",
  };
}
