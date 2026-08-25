import { loadCanonicalMaterialUnits } from "./canonical-material-loader.ts";
import {
  loadMaterialWorkloads,
  type MaterialWorkloadProjection,
} from "./material-workload.ts";
import { loadCanonicalWorkloadEvidence } from "./canonical-workload-evidence.ts";
import {
  calibrationEvidenceExclusionReason,
  estimateCanonicalMaterialWorkload,
  estimatePhysicalPaceAtScope,
  summarizeCanonicalWorkload,
  toPlannerV2WorkloadHandoff,
} from "./planning.bundle.js";

export interface CanonicalMaterialShadowTarget {
  readonly resourceId: string;
  readonly plannedMinutes: number;
}

export type CanonicalMaterialCoverage =
  | "complete"
  | "partial"
  | "none";

export interface CanonicalMaterialUnitSummary {
  readonly resourceId: string;
  readonly knownRemainingMinutes: number;
  readonly eligibleUnitCount: number;
  readonly unknownDurationUnitCount: number;
  readonly blockedUnitCount: number;
  readonly coverage: CanonicalMaterialCoverage;
}

export interface MaterialWorkloadShadowRow {
  readonly resourceId: string;
  readonly legacy: MaterialWorkloadProjection | null;
  readonly legacyRemainingMinutes: number | null;
  readonly canonicalKnownRemainingMinutes: number;
  readonly canonicalEligibleUnitCount: number;
  readonly canonicalUnknownDurationUnitCount: number;
  readonly canonicalBlockedUnitCount: number;
  readonly canonicalCoverage: CanonicalMaterialCoverage;
  readonly deltaMinutes: number | null;
}

function finiteNonNegative(value: unknown): number | null {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) return null;
  return numberValue;
}

function remainingMinutesForUnit(unit: any): number | null {
  if (unit.progressState === "completed") return 0;

  if (unit.sourceKind === "youtube") {
    const duration = finiteNonNegative(unit.durationSeconds);
    if (duration == null || duration <= 0) return null;

    const watched = Math.min(
      duration,
      finiteNonNegative(unit.watchedSeconds) ?? 0,
    );

    const remainingSeconds = Math.max(0, duration - watched);
    return remainingSeconds === 0
      ? 0
      : Math.ceil(remainingSeconds / 60);
  }

  const estimated = finiteNonNegative(unit.estimatedMinutes);
  if (estimated == null) return null;

  if (
    unit.unitType === "page_range" &&
    Number.isFinite(unit.pageStart) &&
    Number.isFinite(unit.pageEnd) &&
    Number(unit.pageEnd) >= Number(unit.pageStart)
  ) {
    const pageStart = Math.floor(Number(unit.pageStart));
    const pageEnd = Math.floor(Number(unit.pageEnd));
    const totalPages = Math.max(1, pageEnd - pageStart + 1);

    const completedThrough = Number.isFinite(
      unit.completedThroughPage,
    )
      ? Math.floor(Number(unit.completedThroughPage))
      : null;

    const remainingStart = completedThrough == null
      ? pageStart
      : Math.max(pageStart, completedThrough + 1);

    const remainingPages = Math.max(
      0,
      pageEnd - remainingStart + 1,
    );

    return remainingPages === 0
      ? 0
      : Math.ceil(estimated * (remainingPages / totalPages));
  }

  return Math.ceil(estimated);
}

export function summarizeCanonicalMaterialUnits(
  resourceId: string,
  units: readonly any[],
): CanonicalMaterialUnitSummary {
  const activeUnits = units.filter(
    (unit) =>
      unit.resourceId === resourceId &&
      unit.isActive === true,
  );

  const eligibleUnits = activeUnits.filter(
    (unit) => unit.plannerEligible === true,
  );

  const blockedUnitCount =
    activeUnits.length - eligibleUnits.length;

  let knownRemainingMinutes = 0;
  let unknownDurationUnitCount = 0;

  for (const unit of eligibleUnits) {
    const remaining = remainingMinutesForUnit(unit);

    if (remaining == null) {
      unknownDurationUnitCount += 1;
      continue;
    }

    knownRemainingMinutes += remaining;
  }

  const coverage: CanonicalMaterialCoverage =
    eligibleUnits.length === 0
      ? "none"
      : blockedUnitCount === 0 && unknownDurationUnitCount === 0
        ? "complete"
        : "partial";

  return Object.freeze({
    resourceId,
    knownRemainingMinutes,
    eligibleUnitCount: eligibleUnits.length,
    unknownDurationUnitCount,
    blockedUnitCount,
    coverage,
  });
}

export async function loadMaterialWorkloadShadow(
  client: any,
  userId: string,
  examProfileId: string,
  targets: readonly CanonicalMaterialShadowTarget[],
): Promise<readonly MaterialWorkloadShadowRow[]> {
  if (!targets.length) return Object.freeze([]);

  const resourceIds = [...new Set(
    targets.map((target) => target.resourceId),
  )];

  const [legacyByResource, canonicalUnits] = await Promise.all([
    loadMaterialWorkloads(
      client,
      userId,
      examProfileId,
      targets,
    ),
    loadCanonicalMaterialUnits(
      client,
      userId,
      examProfileId,
      resourceIds,
    ),
  ]);

  return Object.freeze(
    targets.map((target) => {
      const canonical = summarizeCanonicalMaterialUnits(
        target.resourceId,
        canonicalUnits,
      );

      const legacy = legacyByResource[target.resourceId] ?? null;
      const legacyRemainingMinutes =
        legacy?.totalRemainingMinutes ?? null;

      const deltaMinutes =
        canonical.coverage === "complete" &&
        legacyRemainingMinutes !== null
          ? canonical.knownRemainingMinutes - legacyRemainingMinutes
          : null;

      return Object.freeze({
        resourceId: target.resourceId,
        legacy,
        legacyRemainingMinutes,
        canonicalKnownRemainingMinutes:
          canonical.knownRemainingMinutes,
        canonicalEligibleUnitCount:
          canonical.eligibleUnitCount,
        canonicalUnknownDurationUnitCount:
          canonical.unknownDurationUnitCount,
        canonicalBlockedUnitCount:
          canonical.blockedUnitCount,
        canonicalCoverage: canonical.coverage,
        deltaMinutes,
      });
    }),
  );
}

const CALIBRATION_EXCLUSION_REASONS = [
  "status_not_accepted",
  "cross_user",
  "cross_profile",
  "incompatible_material_type",
  "invalid_progress_unit",
  "missing_causal_activity",
  "malformed_boundaries",
  "zero_progress",
  "invalid_active_time",
  "unreliable_evidence",
] as const;

export function summarizeCalibrationShadow(
  userId: string,
  examProfileId: string,
  canonicalUnits: readonly any[],
  evidence: readonly any[],
  estimates: readonly any[],
) {
  const physicalEvidence = evidence.filter(
    (item) => item.sourceKind === "physical_pace_evidence",
  );
  const excludedByReason: Record<string, number> = Object.fromEntries(
    CALIBRATION_EXCLUSION_REASONS.map((reason) => [reason, 0]),
  );
  let usablePaceSamples = 0;
  for (const item of physicalEvidence) {
    const reason = calibrationEvidenceExclusionReason(item, {
      userId,
      examProfileId,
      resourceId: item.resourceId ?? "",
      subjectId: item.subjectId,
      materialType: item.materialType,
      evidence: [item],
    });
    if (reason === null) usablePaceSamples += 1;
    else excludedByReason[reason] = (excludedByReason[reason] ?? 0) + 1;
  }

  const physicalTargets = canonicalUnits
    .filter((unit: any) => unit.sourceKind === "physical")
    .map((unit: any) => {
      const estimate = estimates.find((item: any) => item.materialViewId === unit.id);
      return {
        resourceId: String(unit.resourceId),
        subjectId: estimate?.subjectId ?? null,
        materialType: unit.unitType,
      };
    });

  const scopeDefinitions = [
    {
      scope: "resource_material_type" as const,
      key: (target: any) => `${target.resourceId}:${target.materialType}`,
    },
    {
      scope: "subject_material_type" as const,
      key: (target: any) => `${target.subjectId ?? "none"}:${target.materialType}`,
    },
    {
      scope: "material_type" as const,
      key: (target: any) => String(target.materialType),
    },
  ];
  const scopes: any[] = [];
  for (const definition of scopeDefinitions) {
    const unique = new Map<string, any>();
    for (const target of physicalTargets) unique.set(definition.key(target), target);
    let ordinal = 0;
    for (const [, target] of [...unique.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      const pace = estimatePhysicalPaceAtScope({
        userId,
        examProfileId,
        resourceId: target.resourceId,
        subjectId: target.subjectId,
        materialType: target.materialType,
        evidence,
      }, definition.scope);
      if (!pace) continue;
      ordinal += 1;
      scopes.push(Object.freeze({
        scopeKey: `${definition.scope}:${ordinal}`,
        selectedHierarchyLevel: definition.scope,
        sampleCount: pace.sampleCount,
        confidence: pace.confidence,
        usableForShadow: true,
        usableForPlanner: pace.confidence === "medium" || pace.confidence === "high",
        aggregationPolicy: pace.aggregationPolicy,
        provenance: Object.freeze([...new Set(pace.provenance)]),
      }));
    }
  }

  const confidenceDistribution = { low: 0, medium: 0, high: 0 };
  for (const scope of scopes) confidenceDistribution[scope.confidence as keyof typeof confidenceDistribution] += 1;
  const summary = summarizeCanonicalWorkload(estimates);
  return Object.freeze({
    global: Object.freeze({
      totalAcceptedPhysicalEvidence: physicalEvidence.filter(
        (item) => item.evidenceStatus === "accepted",
      ).length,
      totalUsablePaceSamples: usablePaceSamples,
      excludedByReason: Object.freeze(excludedByReason),
    }),
    scope: Object.freeze({
      exactResourceReadyScopes: scopes.filter(
        (item) => item.selectedHierarchyLevel === "resource_material_type" && item.usableForPlanner,
      ).length,
      subjectTypeReadyScopes: scopes.filter(
        (item) => item.selectedHierarchyLevel === "subject_material_type" && item.usableForPlanner,
      ).length,
      typeReadyScopes: scopes.filter(
        (item) => item.selectedHierarchyLevel === "material_type" && item.usableForPlanner,
      ).length,
      mediumHighScopes: scopes.filter((item) => item.usableForPlanner).length,
      confidenceDistribution: Object.freeze(confidenceDistribution),
      calibratedScopes: Object.freeze(scopes),
    }),
    material: Object.freeze({
      physicalViewsExact: estimates.filter(
        (item) => item.sourceKind === "physical" && item.authority === "exact",
      ).length,
      physicalViewsCalibrated: estimates.filter(
        (item) => item.sourceKind === "physical" && item.authority === "calibrated",
      ).length,
      physicalViewsUnknown: estimates.filter(
        (item) => item.sourceKind === "physical" && item.authority === "unknown",
      ).length,
      physicalPagesCalibrated: summary.physicalPagesWithCalibratedWorkload,
      physicalPagesUnknown: summary.physicalPagesWithUnknownWorkload,
      physicalEstimatedRemainingMinutes: summary.physicalEstimatedRemainingMinutes,
      plannerEligibleCalibratedViews: summary.plannerEligibleCalibratedViews,
      blockedReasons: summary.blockedByReason,
    }),
    youtube: Object.freeze({
      exactViews: estimates.filter(
        (item) => item.sourceKind === "youtube" && item.authority === "exact",
      ).length,
      exactRemainingMinutes: summary.exactYoutubeRemainingMinutes,
    }),
    total: summary,
  });
}

export async function loadCanonicalWorkloadReadiness(
  client: any,
  userId: string,
  examProfileId: string,
  requestedResourceIds: readonly string[],
  options: { readonly physicalPaceEvidenceAvailable?: boolean } = {},
) {
  const resourceIds = [...new Set(requestedResourceIds.filter(Boolean).map(String))];
  if (!resourceIds.length) {
    return Object.freeze({
      estimates: Object.freeze([]),
      summary: summarizeCanonicalWorkload([]),
      evidenceClassificationCounts: Object.freeze({}),
      acceptedPaceSamples: 0,
      calibration: summarizeCalibrationShadow(userId, examProfileId, [], [], []),
      plannerHandoff: Object.freeze([]),
    });
  }

  const [canonicalUnits, evidence, resourceResult] = await Promise.all([
    loadCanonicalMaterialUnits(client, userId, examProfileId, resourceIds),
    loadCanonicalWorkloadEvidence(client, userId, examProfileId, resourceIds, {
      physicalPaceEvidenceAvailable: options.physicalPaceEvidenceAvailable === true,
    }),
    client
      .from("resources")
      .select("id,subject_id")
      .eq("user_id", userId)
      .eq("exam_profile_id", examProfileId)
      .in("id", resourceIds),
  ]);
  if (resourceResult.error) throw resourceResult.error;

  const subjectByResource = new Map(
    (resourceResult.data ?? []).map((row: any) => [String(row.id), String(row.subject_id)]),
  );
  const estimates = canonicalUnits.map((material: any) =>
    estimateCanonicalMaterialWorkload({
      userId,
      examProfileId,
      subjectId: subjectByResource.get(String(material.resourceId)) ?? null,
      material,
      evidence,
      fallbackPolicies: [],
    })
  );

  const evidenceClassificationCounts: Record<string, number> = {
    actual_elapsed_time: 0,
    actual_progress_delta: 0,
    planned_only: 0,
    unreliable: 0,
    unavailable: 0,
  };
  let acceptedPaceSamples = 0;
  for (const observation of evidence) {
    for (const quality of observation.evidenceQuality) {
      evidenceClassificationCounts[quality] = (evidenceClassificationCounts[quality] ?? 0) + 1;
    }
    if (
      observation.sourceKind === "physical_pace_evidence" &&
      observation.evidenceStatus === "accepted" &&
      observation.evidenceQuality.includes("actual_elapsed_time") &&
      observation.evidenceQuality.includes("actual_progress_delta") &&
      !observation.evidenceQuality.includes("unreliable")
    ) {
      acceptedPaceSamples += 1;
    }
  }

  return Object.freeze({
    estimates: Object.freeze(estimates),
    summary: summarizeCanonicalWorkload(estimates),
    evidenceClassificationCounts: Object.freeze(evidenceClassificationCounts),
    acceptedPaceSamples,
    calibration: summarizeCalibrationShadow(
      userId,
      examProfileId,
      canonicalUnits,
      evidence,
      estimates,
    ),
    plannerHandoff: Object.freeze(estimates.map(toPlannerV2WorkloadHandoff)),
  });
}
