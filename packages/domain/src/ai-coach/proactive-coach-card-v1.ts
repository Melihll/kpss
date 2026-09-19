import type { CoachSignalCandidateV1 } from "./coach-signal-v1";
import type { ProactiveCoachSelectionV1 } from "./proactive-coach-selection-v1";

export const PROACTIVE_COACH_CARD_V1_VERSION = "proactive-coach-card-v1" as const;
export const PROACTIVE_COACH_CARD_TEMPLATE_V1_VERSION = "proactive-coach-card-template-v1" as const;

export type ProactiveCoachCardActionV1 = "dismiss" | "snooze_24h" | "disable_category";

export interface ProactiveCoachCardV1 {
  readonly version: typeof PROACTIVE_COACH_CARD_V1_VERSION;
  readonly templateVersion: typeof PROACTIVE_COACH_CARD_TEMPLATE_V1_VERSION;
  readonly presentationToken: string;
  readonly fingerprint: string;
  readonly signalType:
    | "today_completed_as_planned"
    | "repeated_task_miss"
    | "recent_recovery"
    | "planner_warning_present";
  readonly attentionCategory: "progress" | "consistency" | "planner";
  readonly title: string;
  readonly body: string;
  readonly tone: "positive" | "notice" | "warning";
  readonly evidenceSummary: readonly {
    readonly label: string;
    readonly value: string;
  }[];
  readonly actions: readonly {
    readonly action: ProactiveCoachCardActionV1;
    readonly label: string;
  }[];
}

const ACTIONS = Object.freeze([
  { action: "dismiss", label: "Bu kartı kapat" },
  { action: "snooze_24h", label: "24 saat ertele" },
  { action: "disable_category", label: "Bu tür bildirimleri kapat" },
] as const);

function integer(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function base(
  selection: ProactiveCoachSelectionV1,
  candidate: CoachSignalCandidateV1,
): Pick<ProactiveCoachCardV1, "version" | "templateVersion" | "presentationToken" | "fingerprint" | "actions"> | null {
  if (!selection.selectedFingerprint?.trim()) return null;
  return {
    version: PROACTIVE_COACH_CARD_V1_VERSION,
    templateVersion: PROACTIVE_COACH_CARD_TEMPLATE_V1_VERSION,
    presentationToken: selection.selectedFingerprint,
    fingerprint: selection.selectedFingerprint,
    actions: ACTIONS,
  };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

/** Fixed, deterministic UI templates for launch-enabled proactive V1 signals only. */
export function presentProactiveCoachCardV1(
  selection: ProactiveCoachSelectionV1,
): ProactiveCoachCardV1 | null {
  if (selection.outcome !== "selected" || selection.selectedCandidate === null) return null;
  const candidate = selection.selectedCandidate;
  const common = base(selection, candidate);
  if (!common || candidate.eligibility.proactiveCandidate !== true) return null;

  switch (candidate.signalType) {
    case "today_completed_as_planned": {
      const completed = candidate.evidence.completedTaskCount;
      const planned = candidate.evidence.plannedMinutes;
      const credit = candidate.evidence.plannedCreditMinutes;
      if (
        candidate.reasonCode !== "today_all_tasks_completed_with_planned_credit"
        || candidate.eligibility.attentionCategory !== "progress"
        || !integer(completed) || completed < 1 || !integer(planned) || !integer(credit) || credit < planned
      ) return null;
      return deepFreeze({
        ...common,
        signalType: candidate.signalType,
        attentionCategory: "progress",
        title: "Bugünün planı tamamlandı",
        body: `Planlanan ${planned} dakikalık çalışma bugün tamamlandı.`,
        tone: "positive",
        evidenceSummary: [
          { label: "Tamamlanan görev", value: String(completed) },
          { label: "Plan kredisi", value: `${credit} dk` },
        ],
      });
    }
    case "repeated_task_miss": {
      const count = candidate.evidence.distinctMissCount;
      if (
        candidate.reasonCode !== "same_task_missed_multiple_times_in_recent_window"
        || candidate.eligibility.attentionCategory !== "consistency"
        || !integer(count) || count < 2 || typeof candidate.evidence.taskId !== "string" || !candidate.evidence.taskId.trim()
      ) return null;
      return deepFreeze({
        ...common,
        signalType: candidate.signalType,
        attentionCategory: "consistency",
        title: "Aynı görev birden fazla kez kaçırıldı",
        body: `Aynı görev son ilerleme penceresinde ${count} kez kaçırıldı.`,
        tone: "warning",
        evidenceSummary: [{ label: "Kaçırılma", value: `${count} kez` }],
      });
    }
    case "recent_recovery": {
      const missedAt = candidate.evidence.missedAt;
      const completedAt = candidate.evidence.completedAt;
      if (
        candidate.reasonCode !== "completed_after_recent_miss"
        || candidate.eligibility.attentionCategory !== "consistency"
        || typeof missedAt !== "string"
        || typeof completedAt !== "string"
        || !Number.isFinite(Date.parse(missedAt))
        || !Number.isFinite(Date.parse(completedAt))
        || Date.parse(completedAt) <= Date.parse(missedAt)
      ) return null;
      return deepFreeze({
        ...common,
        signalType: candidate.signalType,
        attentionCategory: "consistency",
        title: "Kaçırılan görev tamamlandı",
        body: "Daha önce kaçırılan aynı görev daha sonra tamamlandı.",
        tone: "positive",
        evidenceSummary: [{ label: "Durum", value: "Tamamlandı" }],
      });
    }
    case "planner_warning_present": {
      const count = candidate.evidence.warningCount;
      if (
        candidate.reasonCode !== "persisted_planner_warning_count_present"
        || candidate.eligibility.attentionCategory !== "planner"
        || !integer(count) || count < 1 || typeof candidate.evidence.lifecycleState !== "string"
      ) return null;
      return deepFreeze({
        ...common,
        signalType: candidate.signalType,
        attentionCategory: "planner",
        title: "Planında dikkat gerektiren bir durum var",
        body: `Mevcut Planner V2 kaydında ${count} uyarı bulunuyor.`,
        tone: "notice",
        evidenceSummary: [{ label: "Plan uyarısı", value: String(count) }],
      });
    }
    default:
      return null;
  }
}
