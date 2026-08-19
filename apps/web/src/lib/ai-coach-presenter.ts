import type { AiEvidenceV1 } from "@kpss-coach/domain";
import type { AiCoachPlanPreviewResponse } from "./ai-coach-api";

export type AiCoachPresentationTone = "neutral" | "positive" | "warning" | "danger";

export interface AiCoachPresentationStat {
  readonly label: string;
  readonly value: string;
}

export interface AiCoachPresentation {
  readonly tone: AiCoachPresentationTone;
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
  readonly stats: readonly AiCoachPresentationStat[];
  readonly note: string | null;
}

function compactMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} dk`;
  if (rest === 0) return `${hours} sa`;
  return `${hours} sa ${rest} dk`;
}

function capacityEvidence(evidence: readonly AiEvidenceV1[]) {
  return evidence.find((item) => item.type === "CAPACITY_CHANGE_REQUEST");
}

function issueExplanation(issueCodes: readonly string[]): string | null {
  if (issueCodes.includes("PAST_DUE_REMAINING_WORK")) {
    return "Geçmişten kalan çalışma olduğu için planın küçük bir düzenlemeye ihtiyaç duyuyor.";
  }
  return null;
}

export function presentAiCoachPreview(response: AiCoachPlanPreviewResponse): AiCoachPresentation {
  if (response.status === "NEEDS_CLARIFICATION") {
    return {
      tone: "neutral",
      eyebrow: "Bir şeyi netleştirelim",
      title: response.clarificationQuestion,
      body: "Tarih ve süreyi biraz daha açık yazarsan planını güvenle değerlendirebilirim.",
      stats: [],
      note: null,
    };
  }

  if (response.status === "INVALID") {
    return {
      tone: "warning",
      eyebrow: "Mesajı netleştiremedim",
      title: "Bunu plan kararına çevirmek için biraz daha bilgi gerekiyor.",
      body: "Örneğin “Yarın 60 dakika daha çalışabilirim” gibi tarih ve süreyi birlikte yazabilirsin.",
      stats: [],
      note: null,
    };
  }

  if (response.status === "GATEWAY_ERROR") {
    return {
      tone: "danger",
      eyebrow: "Koç şu an meşgul",
      title: "Mesajını şu anda değerlendiremedim.",
      body: "Biraz sonra tekrar deneyebilirsin. Planında herhangi bir değişiklik yapılmadı.",
      stats: [],
      note: "Planın değişmedi.",
    };
  }

  const capacity = capacityEvidence(response.interpretation.evidence);
  const preview = response.shadowPreview;

  if (!preview) {
    const targetText = capacity?.targetMinutes != null
      ? `Toplam ${compactMinutes(capacity.targetMinutes)} çalışma isteğini anladım.`
      : "Mesajını anladım.";
    return {
      tone: "neutral",
      eyebrow: "Mesaj alındı",
      title: targetText,
      body: response.error ? "Bu değişiklik için güvenli bir plan önizlemesi oluşturulamadı." : "Bu mesaj için henüz güvenli bir plan önizlemesi oluşmadı.",
      stats: [],
      note: "Planın değişmedi.",
    };
  }

  const deltaMinutes = capacity?.deltaMinutes ?? null;
  const direction = capacity?.direction ?? null;
  const capacityLabel = deltaMinutes == null
    ? null
    : `${direction === "DECREASE" ? "−" : "+"}${compactMinutes(deltaMinutes)}`;
  const explanation = issueExplanation(preview.evaluation.issueCodes);

  if (preview.decision === "KEEP_PLAN") {
    return {
      tone: "positive",
      eyebrow: "Plan kontrol edildi",
      title: "Mevcut planın bu değişikliği zaten karşılıyor.",
      body: explanation ?? "Görevlerini yeniden taşımaya gerek görünmüyor.",
      stats: [
        ...(capacityLabel ? [{ label: "Kapasite değişimi", value: capacityLabel }] : []),
        { label: "Etkilenen görev", value: String(preview.changedTaskCount) },
      ],
      note: "Bu yalnızca önizleme; planın değişmedi.",
    };
  }

  if (preview.decision === "READY_TO_APPLY") {
    return {
      tone: "positive",
      eyebrow: "Plan önerisi hazır",
      title: "Programında küçük bir düzenleme öneriyorum.",
      body: explanation ?? "Yeni çalışma süreni mevcut programınla karşılaştırdım.",
      stats: [
        ...(capacityLabel ? [{ label: "Kapasite değişimi", value: capacityLabel }] : []),
        { label: "Etkilenen görev", value: String(preview.changedTaskCount) },
        { label: "Taşınan görev", value: String(preview.evaluation.movedTaskCount) },
        { label: "Sonraya kalan", value: String(preview.evaluation.backlogTaskCount) },
      ],
      note: "Bu yalnızca önizleme; henüz hiçbir görev veya tarih değiştirilmedi.",
    };
  }

  return {
    tone: "warning",
    eyebrow: "Plan kontrol edildi",
    title: "Bu değişikliği şu anda güvenle planlayamıyorum.",
    body: explanation ?? "Mevcut plan koşulları güvenli bir öneri üretmek için yeterli değil.",
    stats: [
      ...(capacityLabel ? [{ label: "Kapasite değişimi", value: capacityLabel }] : []),
      { label: "Etkilenen görev", value: String(preview.changedTaskCount) },
    ],
    note: "Planın değişmedi.",
  };
}
