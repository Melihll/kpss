export type WeeklyReportStatus = "good" | "attention" | "risk";

export interface WeeklyReportSignals {
  plannedMinutes: number;
  actualMinutes: number;
  plannedTaskCount: number;
  completedTaskCount: number;
  backlogSeverity: "normal" | "attention" | "risk" | "critical";
  projectionStatus: string;
}

export interface WeeklyReportInterpretation {
  status: WeeklyReportStatus;
  completionRatio: number;
  plannedVsActualRatio: number;
  explanation: string;
}

const ratio = (actual: number, planned: number) => planned > 0 ? actual / planned : 1;
const percent = (value: number) => Math.round(Math.max(0, value) * 100);

export function interpretWeeklyReport(input: WeeklyReportSignals): WeeklyReportInterpretation {
  const completionRatio = ratio(input.completedTaskCount, input.plannedTaskCount);
  const plannedVsActualRatio = ratio(input.actualMinutes, input.plannedMinutes);
  const backlogRisk = input.backlogSeverity === "risk" || input.backlogSeverity === "critical";
  const projectionRisk = input.projectionStatus.toUpperCase() === "RISK";
  const riskSignals = Number(completionRatio < 0.65) + Number(plannedVsActualRatio < 0.65)
    + Number(backlogRisk) + Number(projectionRisk);

  let status: WeeklyReportStatus = "attention";
  if (riskSignals >= 2) status = "risk";
  else if (completionRatio >= 0.8 && plannedVsActualRatio >= 0.8 && !backlogRisk && !projectionRisk) status = "good";

  const parts = [
    `Bu hafta planlanan sürenin %${percent(plannedVsActualRatio)}'i ve görevlerin %${percent(completionRatio)}'i tamamlandı.`,
  ];
  if (backlogRisk) parts.push("Backlog yükseldiği için gelecek hafta açık görevler önceliklendirilmeli.");
  else if (projectionRisk) parts.push("Müfredat projeksiyonu risk gösterdiği için haftalık kapasite yeniden gözden geçirilmeli.");
  else if (status === "good") parts.push("Plan ve gerçek çalışma dengesi pilot hedefiyle uyumlu.");
  else parts.push("Planı yakalamak için gelecek hafta günlük gerçekleşen süre takip edilmeli.");

  return { status, completionRatio, plannedVsActualRatio, explanation: parts.join(" ") };
}
