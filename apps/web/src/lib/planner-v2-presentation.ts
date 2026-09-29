interface PlannerExplanationFact {
  readonly kind: string;
  readonly [key: string]: unknown;
}

export function plannerMaterialLabel(materialType: string): string {
  if (materialType === "page_range") return "Sayfa çalışması";
  if (materialType === "video") return "Video çalışması";
  if (materialType === "test") return "Soru çalışması";
  return "Çalışma";
}

export function plannerBoundaryLabel(boundaryKind: string): string {
  if (boundaryKind === "physical_pages") return "Sayfa kapsamı";
  if (boundaryKind === "full_video") return "Tam video";
  return "Materyal kapsamı";
}

export function plannerBlockedReasonLabel(reason: string): string {
  if (reason === "already_in_progress") return "Bu çalışma zaten devam ediyor.";
  if (reason === "learning_stage_blocked") return "Bu çalışma mevcut öğrenme aşamasına henüz uygun değil.";
  if (reason === "duration_unresolved") return "Bu çalışmanın süresi henüz güvenle hesaplanamıyor.";
  if (reason === "topic_unmapped") return "Bu çalışma henüz bir konuya bağlanmamış.";
  if (reason === "duplicate_canonical_workload_identity") return "Bu çalışma öneride zaten yer alıyor.";
  if (
    reason === "accepted_w2_evidence_unavailable"
    || reason === "pace_evidence_unavailable"
    || reason === "confidence_insufficient"
  ) return "Bu çalışma için yeterli ilerleme verisi henüz oluşmadı.";
  return "Bu çalışma şu an güvenle planlanamıyor.";
}

export function plannerFactLabel(fact: PlannerExplanationFact): string {
  if (fact.kind === "day_capacity") return `${String(fact.date ?? "Bu gün")}: ${String(fact.availableMinutes ?? 0)} dk kullanılabilir.`;
  if (fact.kind === "continuation_selected") return "Yarım kalan çalışma devamlılık için öne alındı.";
  if (fact.kind === "blocked_workload") return plannerBlockedReasonLabel(String(fact.reason ?? ""));
  if (fact.kind === "current_day_protected") return `${String(fact.date ?? "Bugün")}: bugünkü görevler korunuyor.`;
  if (fact.kind === "unused_capacity") return `${String(fact.date ?? "Bu gün")}: sıradaki çalışma bölünemediği için ${String(fact.unusedMinutes ?? 0)} dk boş kaldı.`;
  if (fact.kind === "replacement_scope") return "Yalnızca açıkça listelenen gelecek plan görevleri değiştirilebilir.";
  return "Planlama kararı güncel program ve kapasiteye göre hesaplandı.";
}
