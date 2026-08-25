import { loadCanonicalMaterialUnits } from "./canonical-material-loader.ts";
import {
  loadMaterialWorkloads,
  type MaterialWorkloadProjection,
} from "./material-workload.ts";
import { loadCanonicalWorkloadEvidence } from "./canonical-workload-evidence.ts";
import {
  estimateCanonicalMaterialWorkload,
  summarizeCanonicalWorkload,
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
  });
}
