import type {
  MaterialMappingProvenance,
  MaterialUnitType,
  MaterialUnitView,
} from "./material-unit-view";

export type WorkloadProgressUnit = "page" | "video_second";
export type WorkloadAuthority = "exact" | "calibrated" | "fallback" | "unknown";
export type WorkloadConfidence = "none" | "low" | "medium" | "high";
export type WorkloadEvidenceQuality =
  | "actual_elapsed_time"
  | "actual_progress_delta"
  | "planned_only"
  | "unreliable"
  | "unavailable";

export type WorkloadEvidenceSourceKind =
  | "study_session"
  | "test_result_completion"
  | "resource_unit_progress"
  | "physical_pace_evidence"
  | "youtube_video_progress"
  | "task_plan";

export interface WorkloadEvidence {
  readonly id: string;
  readonly userId: string;
  readonly examProfileId: string;
  readonly sourceKind: WorkloadEvidenceSourceKind;
  readonly resourceId: string | null;
  readonly subjectId: string | null;
  readonly curriculumNodeId: string | null;
  readonly materialType: MaterialUnitType;
  readonly actualMinutes: number | null;
  readonly progressAmount: number | null;
  readonly progressUnit: WorkloadProgressUnit;
  readonly sampleStart: string | null;
  readonly sampleEnd: string | null;
  readonly evidenceQuality: readonly WorkloadEvidenceQuality[];
  readonly provenance: string;
  /** W2-only fields. They stay optional so non-W2 observations remain descriptive evidence. */
  readonly evidenceStatus?: "accepted" | "candidate" | "rejected";
  readonly causalActivityId?: string | null;
  readonly startPageBoundary?: number | null;
  readonly endPageBoundary?: number | null;
}

export type PaceScope =
  | "resource_material_type"
  | "subject_material_type"
  | "material_type";

export interface PaceEstimate {
  readonly pace: number;
  readonly unit: "minutes_per_page";
  readonly sampleCount: number;
  readonly totalObservedMinutes: number;
  readonly totalObservedProgress: number;
  readonly coefficientOfVariation: number;
  readonly confidence: Exclude<WorkloadConfidence, "none">;
  readonly provenance: readonly string[];
  readonly scope: PaceScope;
  readonly aggregationPolicy: "median_session_minutes_per_page";
  readonly evidenceIds: readonly string[];
}

export type CalibrationEvidenceExclusionReason =
  | "non_w2_source"
  | "status_not_accepted"
  | "cross_user"
  | "cross_profile"
  | "incompatible_material_type"
  | "invalid_progress_unit"
  | "missing_causal_activity"
  | "malformed_boundaries"
  | "zero_progress"
  | "invalid_active_time"
  | "unreliable_evidence";

export interface CalibrationReadiness {
  readonly scope: PaceScope | "none";
  readonly hierarchyReason: string;
  readonly compatibleSampleCount: number;
  readonly totalObservedMinutes: number;
  readonly totalProgressAmount: number;
  readonly pace: number | null;
  readonly paceUnit: "minutes_per_page";
  readonly confidence: WorkloadConfidence;
  readonly authority: "calibrated" | "unknown";
  readonly usableForShadow: boolean;
  readonly usableForPlanner: boolean;
  readonly blockedReason: "accepted_w2_evidence_unavailable" | "confidence_insufficient" | null;
  readonly evidenceIds: readonly string[];
  readonly provenance: readonly string[];
  readonly aggregationPolicy: "median_session_minutes_per_page" | "none";
}

export interface PlannerV2WorkloadHandoff {
  readonly materialViewId: string;
  readonly sourceKind: "physical" | "youtube";
  readonly resourceId: string;
  readonly subjectId: string | null;
  readonly materialType: MaterialUnitType;
  readonly remainingAmount: number | null;
  readonly remainingUnit: WorkloadProgressUnit;
  readonly estimatedMinutes: number | null;
  readonly workloadAuthority: WorkloadAuthority;
  readonly workloadConfidence: WorkloadConfidence;
  readonly plannerEligible: boolean;
  readonly unresolvedWorkloadReason: string | null;
  readonly evidence: WorkloadEvidenceSummary;
}

export interface PhysicalFallbackPolicy {
  readonly materialType: MaterialUnitType;
  readonly minutesPerPage: number;
  readonly confidence: Exclude<WorkloadConfidence, "none">;
  readonly provenance: string;
  readonly authorizedForPlanning: boolean;
  readonly resourceId?: string | null;
  readonly subjectId?: string | null;
}

export interface WorkloadEvidenceSummary {
  readonly scope: PaceScope | "configured_fallback" | "intrinsic" | "none";
  readonly sampleCount: number;
  readonly totalObservedMinutes: number;
  readonly provenance: readonly string[];
}

export interface MaterialWorkloadEstimate {
  readonly materialViewId: string;
  readonly sourceKind: "physical" | "youtube";
  readonly resourceId: string;
  readonly subjectId: string | null;
  readonly materialType: MaterialUnitType;
  readonly remainingAmount: number | null;
  readonly remainingUnit: WorkloadProgressUnit;
  readonly estimatedMinutes: number | null;
  readonly authority: WorkloadAuthority;
  readonly confidence: WorkloadConfidence;
  readonly plannerEligible: boolean;
  readonly reason: string;
  readonly evidence: WorkloadEvidenceSummary;
}

export interface EstimatePhysicalPaceRequest {
  readonly userId: string;
  readonly examProfileId: string;
  readonly resourceId: string;
  readonly subjectId: string | null;
  readonly materialType: MaterialUnitType;
  readonly evidence: readonly WorkloadEvidence[];
}

export interface EstimateCanonicalMaterialWorkloadRequest {
  readonly userId: string;
  readonly examProfileId: string;
  readonly subjectId: string | null;
  readonly material: MaterialUnitView;
  readonly evidence: readonly WorkloadEvidence[];
  readonly fallbackPolicies?: readonly PhysicalFallbackPolicy[];
}

export interface CanonicalWorkloadSummary {
  readonly totalMaterialViews: number;
  readonly exactWorkloadViews: number;
  readonly calibratedWorkloadViews: number;
  readonly fallbackWorkloadViews: number;
  readonly unknownWorkloadViews: number;
  readonly plannerEligibleViews: number;
  readonly blockedByReason: Readonly<Record<string, number>>;
  readonly exactYoutubeRemainingMinutes: number;
  readonly physicalPagesWithCalibratedWorkload: number;
  readonly physicalPagesWithUnknownWorkload: number;
  readonly physicalEstimatedRemainingMinutes: number;
  readonly plannerEligibleCalibratedViews: number;
  readonly confidenceDistribution: Readonly<Record<WorkloadConfidence, number>>;
  readonly workloadMinutesBySubject: Readonly<Record<string, number>>;
  readonly workloadMinutesByResource: Readonly<Record<string, number>>;
  readonly workloadMinutesByMaterialType: Readonly<Record<string, number>>;
}

function hasQuality(
  evidence: WorkloadEvidence,
  quality: WorkloadEvidenceQuality,
): boolean {
  return evidence.evidenceQuality.includes(quality);
}

export function calibrationEvidenceExclusionReason(
  evidence: WorkloadEvidence,
  request: EstimatePhysicalPaceRequest,
): CalibrationEvidenceExclusionReason | null {
  if (evidence.sourceKind !== "physical_pace_evidence") return "non_w2_source";
  if (evidence.evidenceStatus !== "accepted") return "status_not_accepted";
  if (evidence.userId !== request.userId) return "cross_user";
  if (evidence.examProfileId !== request.examProfileId) return "cross_profile";
  if (evidence.materialType !== request.materialType) return "incompatible_material_type";
  if (evidence.progressUnit !== "page") return "invalid_progress_unit";
  if (!evidence.causalActivityId) return "missing_causal_activity";
  if (
    evidence.progressAmount === null ||
    !Number.isFinite(evidence.progressAmount) ||
    Number(evidence.progressAmount) <= 0
  ) return "zero_progress";

  const start = evidence.startPageBoundary;
  const end = evidence.endPageBoundary;
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    Number(start) < 0 ||
    Number(end) <= Number(start) ||
    Number(evidence.progressAmount) !== Number(end) - Number(start)
  ) return "malformed_boundaries";
  if (
    evidence.actualMinutes === null ||
    !Number.isFinite(evidence.actualMinutes) ||
    Number(evidence.actualMinutes) <= 0 ||
    !hasQuality(evidence, "actual_elapsed_time")
  ) return "invalid_active_time";
  if (
    !hasQuality(evidence, "actual_progress_delta") ||
    hasQuality(evidence, "unreliable")
  ) return "unreliable_evidence";
  return null;
}

function confidenceFor(samples: readonly WorkloadEvidence[]): {
  confidence: Exclude<WorkloadConfidence, "none">;
  coefficientOfVariation: number;
} {
  const rates = samples.map(
    (sample) => Number(sample.actualMinutes) / Number(sample.progressAmount),
  );
  const mean = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
  const variance = rates.reduce(
    (sum, rate) => sum + ((rate - mean) ** 2),
    0,
  ) / rates.length;
  const coefficientOfVariation = mean === 0
    ? Number.POSITIVE_INFINITY
    : Math.sqrt(variance) / mean;
  const totalMinutes = samples.reduce(
    (sum, sample) => sum + Number(sample.actualMinutes),
    0,
  );

  if (
    samples.length >= 5 &&
    totalMinutes >= 120 &&
    coefficientOfVariation <= 0.35
  ) {
    return { confidence: "high", coefficientOfVariation };
  }

  if (
    samples.length >= 3 &&
    totalMinutes >= 60 &&
    coefficientOfVariation <= 0.75
  ) {
    return { confidence: "medium", coefficientOfVariation };
  }

  return { confidence: "low", coefficientOfVariation };
}

function buildPace(
  samples: readonly WorkloadEvidence[],
  scope: PaceScope,
): PaceEstimate {
  const ordered = [...samples].sort((left, right) => left.id.localeCompare(right.id));
  const totalObservedMinutes = ordered.reduce(
    (sum, sample) => sum + Number(sample.actualMinutes),
    0,
  );
  const totalObservedProgress = ordered.reduce(
    (sum, sample) => sum + Number(sample.progressAmount),
    0,
  );
  const { confidence, coefficientOfVariation } = confidenceFor(ordered);
  const sessionPaces = ordered
    .map((sample) => Number(sample.actualMinutes) / Number(sample.progressAmount))
    .sort((left, right) => left - right);
  const middle = Math.floor(sessionPaces.length / 2);
  const medianPace = sessionPaces.length % 2 === 0
    ? (sessionPaces[middle - 1]! + sessionPaces[middle]!) / 2
    : sessionPaces[middle]!;

  return Object.freeze({
    pace: medianPace,
    unit: "minutes_per_page" as const,
    sampleCount: ordered.length,
    totalObservedMinutes,
    totalObservedProgress,
    coefficientOfVariation,
    confidence,
    provenance: Object.freeze(ordered.map((sample) => sample.provenance)),
    scope,
    aggregationPolicy: "median_session_minutes_per_page" as const,
    evidenceIds: Object.freeze(ordered.map((sample) => sample.id)),
  });
}

function compatiblePaceEvidence(request: EstimatePhysicalPaceRequest): WorkloadEvidence[] {
  return request.evidence.filter(
    (sample) => calibrationEvidenceExclusionReason(sample, request) === null,
  );
}

export function estimatePhysicalPaceAtScope(
  request: EstimatePhysicalPaceRequest,
  scope: PaceScope,
): PaceEstimate | null {
  const compatible = compatiblePaceEvidence(request);
  const samples = scope === "resource_material_type"
    ? compatible.filter((sample) => sample.resourceId === request.resourceId)
    : scope === "subject_material_type"
      ? compatible.filter(
        (sample) => request.subjectId !== null && sample.subjectId === request.subjectId,
      )
      : compatible;
  return samples.length ? buildPace(samples, scope) : null;
}

export function estimatePhysicalPace(
  request: EstimatePhysicalPaceRequest,
): PaceEstimate | null {
  const compatible = compatiblePaceEvidence(request);

  const resource = compatible.filter(
    (sample) => sample.resourceId === request.resourceId,
  );
  if (resource.length) return buildPace(resource, "resource_material_type");

  const subject = compatible.filter(
    (sample) => request.subjectId !== null && sample.subjectId === request.subjectId,
  );
  if (subject.length) return buildPace(subject, "subject_material_type");

  if (compatible.length) return buildPace(compatible, "material_type");
  return null;
}

export function evaluateCalibrationReadiness(
  request: EstimatePhysicalPaceRequest,
): CalibrationReadiness {
  const estimate = estimatePhysicalPace(request);
  if (!estimate) {
    return Object.freeze({
      scope: "none" as const,
      hierarchyReason: "no_compatible_accepted_w2_evidence",
      compatibleSampleCount: 0,
      totalObservedMinutes: 0,
      totalProgressAmount: 0,
      pace: null,
      paceUnit: "minutes_per_page" as const,
      confidence: "none" as const,
      authority: "unknown" as const,
      usableForShadow: false,
      usableForPlanner: false,
      blockedReason: "accepted_w2_evidence_unavailable" as const,
      evidenceIds: Object.freeze([]),
      provenance: Object.freeze([]),
      aggregationPolicy: "none" as const,
    });
  }

  const usableForPlanner = estimate.confidence === "medium" || estimate.confidence === "high";
  const hierarchyReason = estimate.scope === "resource_material_type"
    ? "exact_resource_compatible_evidence_won"
    : estimate.scope === "subject_material_type"
      ? "subject_type_evidence_won_after_exact_resource_absent"
      : "material_type_evidence_won_after_narrower_scopes_absent";
  return Object.freeze({
    scope: estimate.scope,
    hierarchyReason,
    compatibleSampleCount: estimate.sampleCount,
    totalObservedMinutes: estimate.totalObservedMinutes,
    totalProgressAmount: estimate.totalObservedProgress,
    pace: estimate.pace,
    paceUnit: estimate.unit,
    confidence: estimate.confidence,
    authority: "calibrated" as const,
    usableForShadow: true,
    usableForPlanner,
    blockedReason: usableForPlanner ? null : "confidence_insufficient" as const,
    evidenceIds: estimate.evidenceIds,
    provenance: estimate.provenance,
    aggregationPolicy: estimate.aggregationPolicy,
  });
}

function authoritativeProvenance(provenance: MaterialMappingProvenance): boolean {
  return provenance !== "ai_candidate";
}

function mappingBlockReason(material: MaterialUnitView): string | null {
  if (!material.isActive) return "material_inactive";
  if (material.mappingStatus === "ambiguous") return "mapping_ambiguous";
  if (material.mappingStatus !== "validated" || material.curriculumNodeId === null) {
    return "mapping_missing";
  }
  if (!authoritativeProvenance(material.mappingProvenance)) {
    return "mapping_provenance_untrusted";
  }
  return null;
}

function evidenceSummary(
  scope: WorkloadEvidenceSummary["scope"],
  sampleCount = 0,
  totalObservedMinutes = 0,
  provenance: readonly string[] = [],
): WorkloadEvidenceSummary {
  return Object.freeze({
    scope,
    sampleCount,
    totalObservedMinutes,
    provenance: Object.freeze([...provenance]),
  });
}

function result(
  request: EstimateCanonicalMaterialWorkloadRequest,
  values: Omit<MaterialWorkloadEstimate,
    "materialViewId" | "sourceKind" | "resourceId" | "subjectId" | "materialType">,
): MaterialWorkloadEstimate {
  return Object.freeze({
    materialViewId: request.material.id,
    sourceKind: request.material.sourceKind,
    resourceId: request.material.resourceId,
    subjectId: request.subjectId,
    materialType: request.material.unitType,
    ...values,
  });
}

function estimateYoutube(
  request: EstimateCanonicalMaterialWorkloadRequest,
): MaterialWorkloadEstimate {
  const material = request.material;
  const mappingReason = mappingBlockReason(material);
  if (mappingReason) {
    return result(request, {
      remainingAmount: null,
      remainingUnit: "video_second",
      estimatedMinutes: null,
      authority: "unknown",
      confidence: "none",
      plannerEligible: false,
      reason: mappingReason,
      evidence: evidenceSummary("none"),
    });
  }

  if (material.segmentStartSeconds !== null || material.segmentEndSeconds !== null) {
    return result(request, {
      remainingAmount: null,
      remainingUnit: "video_second",
      estimatedMinutes: null,
      authority: "unknown",
      confidence: "none",
      plannerEligible: false,
      reason: "segment_progress_unavailable",
      evidence: evidenceSummary("none"),
    });
  }

  if (
    material.durationSeconds === null ||
    !Number.isFinite(material.durationSeconds) ||
    material.durationSeconds <= 0
  ) {
    return result(request, {
      remainingAmount: null,
      remainingUnit: "video_second",
      estimatedMinutes: null,
      authority: "unknown",
      confidence: "none",
      plannerEligible: false,
      reason: "video_duration_unavailable",
      evidence: evidenceSummary("none"),
    });
  }

  const rawWatched = material.watchedSeconds ?? 0;
  if (!Number.isFinite(rawWatched) || rawWatched < 0) {
    return result(request, {
      remainingAmount: null,
      remainingUnit: "video_second",
      estimatedMinutes: null,
      authority: "unknown",
      confidence: "none",
      plannerEligible: false,
      reason: "invalid_video_progress",
      evidence: evidenceSummary("none"),
    });
  }

  const remainingSeconds = material.progressState === "completed"
    ? 0
    : Math.max(0, Math.floor(material.durationSeconds) - Math.floor(rawWatched));

  return result(request, {
    remainingAmount: remainingSeconds,
    remainingUnit: "video_second",
    estimatedMinutes: Math.ceil(remainingSeconds / 60),
    authority: "exact",
    confidence: "high",
    plannerEligible: true,
    reason: remainingSeconds === 0 ? "completed" : "authoritative_full_video",
    evidence: evidenceSummary("intrinsic", 0, 0, ["duration_seconds", "watched_seconds"]),
  });
}

function findFallback(
  request: EstimateCanonicalMaterialWorkloadRequest,
): PhysicalFallbackPolicy | null {
  const policies = request.fallbackPolicies ?? [];
  return policies.find((policy) =>
    policy.materialType === request.material.unitType &&
    (!policy.resourceId || policy.resourceId === request.material.resourceId) &&
    (!policy.subjectId || policy.subjectId === request.subjectId) &&
    Number.isFinite(policy.minutesPerPage) &&
    policy.minutesPerPage > 0
  ) ?? null;
}

function estimatePhysical(
  request: EstimateCanonicalMaterialWorkloadRequest,
): MaterialWorkloadEstimate {
  const material = request.material;
  const mappingReason = mappingBlockReason(material);

  if (material.progressState === "completed") {
    return result(request, {
      remainingAmount: 0,
      remainingUnit: "page",
      estimatedMinutes: 0,
      authority: "exact",
      confidence: "high",
      plannerEligible: mappingReason === null,
      reason: mappingReason ?? "completed",
      evidence: evidenceSummary("intrinsic", 0, 0, ["resource_unit_progress:completed"]),
    });
  }

  if (material.progressState === "skipped") {
    return result(request, {
      remainingAmount: null,
      remainingUnit: "page",
      estimatedMinutes: null,
      authority: "unknown",
      confidence: "none",
      plannerEligible: false,
      reason: "progress_skipped",
      evidence: evidenceSummary("none"),
    });
  }

  if (
    material.pageStart === null ||
    material.pageEnd === null ||
    !Number.isInteger(material.pageStart) ||
    !Number.isInteger(material.pageEnd) ||
    material.pageStart <= 0 ||
    material.pageEnd < material.pageStart
  ) {
    return result(request, {
      remainingAmount: null,
      remainingUnit: "page",
      estimatedMinutes: null,
      authority: "unknown",
      confidence: "none",
      plannerEligible: false,
      reason: "physical_range_unavailable",
      evidence: evidenceSummary("none"),
    });
  }

  const boundary = material.completedThroughPage ?? null;
  if (
    (boundary !== null && (
      material.progressState !== "in_progress" ||
      !Number.isInteger(boundary) ||
      boundary < material.pageStart ||
      boundary >= material.pageEnd
    )) ||
    (boundary === null && material.progressState === "in_progress")
  ) {
    return result(request, {
      remainingAmount: null,
      remainingUnit: "page",
      estimatedMinutes: null,
      authority: "unknown",
      confidence: "none",
      plannerEligible: false,
      reason: "invalid_progress_boundary",
      evidence: evidenceSummary("none"),
    });
  }

  const remainingStart = boundary === null ? material.pageStart : boundary + 1;
  const remainingPages = material.pageEnd - remainingStart + 1;

  if (mappingReason) {
    return result(request, {
      remainingAmount: remainingPages,
      remainingUnit: "page",
      estimatedMinutes: null,
      authority: "unknown",
      confidence: "none",
      plannerEligible: false,
      reason: mappingReason,
      evidence: evidenceSummary("none"),
    });
  }

  const readiness = evaluateCalibrationReadiness({
    userId: request.userId,
    examProfileId: request.examProfileId,
    resourceId: material.resourceId,
    subjectId: request.subjectId,
    materialType: material.unitType,
    evidence: request.evidence,
  });

  if (readiness.usableForPlanner && readiness.pace !== null) {
    return result(request, {
      remainingAmount: remainingPages,
      remainingUnit: "page",
      estimatedMinutes: Math.ceil(remainingPages * readiness.pace),
      authority: "calibrated",
      confidence: readiness.confidence,
      plannerEligible: true,
      reason: "pace_calibrated",
      evidence: evidenceSummary(
        readiness.scope === "none" ? "none" : readiness.scope,
        readiness.compatibleSampleCount,
        readiness.totalObservedMinutes,
        readiness.provenance,
      ),
    });
  }

  if (readiness.usableForShadow) {
    return result(request, {
      remainingAmount: remainingPages,
      remainingUnit: "page",
      estimatedMinutes: null,
      authority: "unknown",
      confidence: readiness.confidence,
      plannerEligible: false,
      reason: "pace_confidence_insufficient",
      evidence: evidenceSummary(
        readiness.scope === "none" ? "none" : readiness.scope,
        readiness.compatibleSampleCount,
        readiness.totalObservedMinutes,
        readiness.provenance,
      ),
    });
  }

  const fallback = findFallback(request);
  if (fallback) {
    const plannerEligible = fallback.authorizedForPlanning &&
      (fallback.confidence === "medium" || fallback.confidence === "high");
    return result(request, {
      remainingAmount: remainingPages,
      remainingUnit: "page",
      estimatedMinutes: Math.ceil(remainingPages * fallback.minutesPerPage),
      authority: "fallback",
      confidence: fallback.confidence,
      plannerEligible,
      reason: plannerEligible ? "configured_fallback" : "fallback_not_authorized_for_planning",
      evidence: evidenceSummary("configured_fallback", 0, 0, [fallback.provenance]),
    });
  }

  return result(request, {
    remainingAmount: remainingPages,
    remainingUnit: "page",
    estimatedMinutes: null,
    authority: "unknown",
    confidence: "none",
    plannerEligible: false,
    reason: "pace_evidence_unavailable",
    evidence: evidenceSummary("none"),
  });
}

export function estimateCanonicalMaterialWorkload(
  request: EstimateCanonicalMaterialWorkloadRequest,
): MaterialWorkloadEstimate {
  return request.material.sourceKind === "youtube"
    ? estimateYoutube(request)
    : estimatePhysical(request);
}

export function toPlannerV2WorkloadHandoff(
  estimate: MaterialWorkloadEstimate,
): PlannerV2WorkloadHandoff {
  const plannerEligible = estimate.plannerEligible &&
    estimate.estimatedMinutes !== null &&
    estimate.authority !== "unknown" &&
    estimate.confidence !== "none" &&
    (estimate.authority === "exact" || estimate.confidence === "medium" || estimate.confidence === "high");

  return Object.freeze({
    materialViewId: estimate.materialViewId,
    sourceKind: estimate.sourceKind,
    resourceId: estimate.resourceId,
    subjectId: estimate.subjectId,
    materialType: estimate.materialType,
    remainingAmount: estimate.remainingAmount,
    remainingUnit: estimate.remainingUnit,
    estimatedMinutes: plannerEligible ? estimate.estimatedMinutes : null,
    workloadAuthority: plannerEligible ? estimate.authority : "unknown",
    workloadConfidence: estimate.confidence,
    plannerEligible,
    unresolvedWorkloadReason: plannerEligible ? null : estimate.reason,
    evidence: estimate.evidence,
  });
}

function increment(record: Record<string, number>, key: string, amount = 1): void {
  record[key] = (record[key] ?? 0) + amount;
}

export function summarizeCanonicalWorkload(
  estimates: readonly MaterialWorkloadEstimate[],
): CanonicalWorkloadSummary {
  const blockedByReason: Record<string, number> = {};
  const confidenceDistribution: Record<WorkloadConfidence, number> = {
    none: 0,
    low: 0,
    medium: 0,
    high: 0,
  };
  const workloadMinutesBySubject: Record<string, number> = {};
  const workloadMinutesByResource: Record<string, number> = {};
  const workloadMinutesByMaterialType: Record<string, number> = {};

  let exactWorkloadViews = 0;
  let calibratedWorkloadViews = 0;
  let fallbackWorkloadViews = 0;
  let unknownWorkloadViews = 0;
  let plannerEligibleViews = 0;
  let exactYoutubeRemainingMinutes = 0;
  let physicalPagesWithCalibratedWorkload = 0;
  let physicalPagesWithUnknownWorkload = 0;
  let physicalEstimatedRemainingMinutes = 0;
  let plannerEligibleCalibratedViews = 0;

  for (const estimate of estimates) {
    if (estimate.authority === "exact") exactWorkloadViews += 1;
    if (estimate.authority === "calibrated") calibratedWorkloadViews += 1;
    if (estimate.authority === "fallback") fallbackWorkloadViews += 1;
    if (estimate.authority === "unknown") unknownWorkloadViews += 1;
    if (estimate.plannerEligible) {
      plannerEligibleViews += 1;
      if (estimate.authority === "calibrated") {
        plannerEligibleCalibratedViews += 1;
      }
    } else {
      increment(blockedByReason, estimate.reason);
    }
    confidenceDistribution[estimate.confidence] += 1;

    if (
      estimate.sourceKind === "youtube" &&
      estimate.authority === "exact" &&
      estimate.estimatedMinutes !== null
    ) {
      exactYoutubeRemainingMinutes += estimate.estimatedMinutes;
    }

    if (estimate.sourceKind === "physical" && estimate.remainingAmount !== null) {
      if (estimate.authority === "calibrated") {
        physicalPagesWithCalibratedWorkload += estimate.remainingAmount;
      } else if (estimate.authority === "unknown") {
        physicalPagesWithUnknownWorkload += estimate.remainingAmount;
      }
    }

    if (estimate.estimatedMinutes !== null) {
      increment(workloadMinutesBySubject, estimate.subjectId ?? "unmapped", estimate.estimatedMinutes);
      increment(workloadMinutesByResource, estimate.resourceId, estimate.estimatedMinutes);
      increment(workloadMinutesByMaterialType, estimate.materialType, estimate.estimatedMinutes);
      if (estimate.sourceKind === "physical") {
        physicalEstimatedRemainingMinutes += estimate.estimatedMinutes;
      }
    }
  }

  return Object.freeze({
    totalMaterialViews: estimates.length,
    exactWorkloadViews,
    calibratedWorkloadViews,
    fallbackWorkloadViews,
    unknownWorkloadViews,
    plannerEligibleViews,
    blockedByReason: Object.freeze(blockedByReason),
    exactYoutubeRemainingMinutes,
    physicalPagesWithCalibratedWorkload,
    physicalPagesWithUnknownWorkload,
    physicalEstimatedRemainingMinutes,
    plannerEligibleCalibratedViews,
    confidenceDistribution: Object.freeze(confidenceDistribution),
    workloadMinutesBySubject: Object.freeze(workloadMinutesBySubject),
    workloadMinutesByResource: Object.freeze(workloadMinutesByResource),
    workloadMinutesByMaterialType: Object.freeze(workloadMinutesByMaterialType),
  });
}
