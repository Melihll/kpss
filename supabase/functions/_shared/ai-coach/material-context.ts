import {
  loadMaterialWorkloads,
  type MaterialWorkloadProjection,
} from "../material-workload.ts";

export type AiMaterialCoachingFocus =
  | "PAGE"
  | "VIDEO"
  | "MIXED"
  | "COMPLETE";

export interface AiMaterialCoachingContext {
  readonly resourceName: string;
  readonly remainingPages: number | null;
  readonly remainingVideoMinutes: number | null;
  readonly totalRemainingMinutes: number;
  readonly focus: AiMaterialCoachingFocus;
}

export interface AiMaterialContextCandidate {
  readonly resourceId: string;
  readonly resourceName: string;
  readonly sequenceOrder: number;
  readonly projection: MaterialWorkloadProjection;
}

function focusFor(pageMinutes: number, videoMinutes: number): AiMaterialCoachingFocus {
  if (pageMinutes <= 0 && videoMinutes <= 0) return "COMPLETE";
  if (pageMinutes > videoMinutes) return "PAGE";
  if (videoMinutes > pageMinutes) return "VIDEO";
  return "MIXED";
}

export function buildAiMaterialCoachingContext(
  candidates: readonly AiMaterialContextCandidate[],
  limit = 3,
): readonly AiMaterialCoachingContext[] {
  const safeLimit = Math.max(0, Math.floor(Number(limit) || 0));
  if (safeLimit === 0) return Object.freeze([]);

  return Object.freeze(
    candidates
      .map((candidate) => {
        const pageMinutes = Math.max(0, Number(candidate.projection.page?.remainingMinutes ?? 0));
        const videoMinutes = Math.max(0, Number(candidate.projection.video?.remainingMinutes ?? 0));

        return {
          sequenceOrder: Math.max(0, Number(candidate.sequenceOrder ?? 0)),
          context: Object.freeze({
            resourceName: candidate.resourceName,
            remainingPages: candidate.projection.page?.remainingPages ?? null,
            remainingVideoMinutes: candidate.projection.video?.remainingMinutes ?? null,
            totalRemainingMinutes: candidate.projection.totalRemainingMinutes,
            focus: focusFor(pageMinutes, videoMinutes),
          }),
        };
      })
      .sort((left, right) =>
        right.context.totalRemainingMinutes - left.context.totalRemainingMinutes ||
        left.sequenceOrder - right.sequenceOrder ||
        left.context.resourceName.localeCompare(right.context.resourceName, "tr")
      )
      .slice(0, safeLimit)
      .map((item) => item.context),
  );
}

function firstRelation(value: any): any {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export async function loadAiCoachMaterialContext(
  client: any,
  userId: string,
  examProfileId: string,
): Promise<readonly AiMaterialCoachingContext[]> {
  const targetResult = await client
    .from("p48_resource_targets")
    .select("planned_minutes,sequence_order,resources(id,name,status)")
    .eq("user_id", userId)
    .eq("exam_profile_id", examProfileId)
    .order("sequence_order");

  if (targetResult.error) throw targetResult.error;

  const targets = (targetResult.data ?? [])
    .map((row: any) => {
      const resource = firstRelation(row.resources);
      if (!resource || typeof resource.id !== "string" || typeof resource.name !== "string") return null;

      return {
        resourceId: resource.id,
        resourceName: resource.name,
        plannedMinutes: Math.max(0, Number(row.planned_minutes ?? 0)),
        sequenceOrder: Math.max(0, Number(row.sequence_order ?? 0)),
      };
    })
    .filter(Boolean) as Array<{
      resourceId: string;
      resourceName: string;
      plannedMinutes: number;
      sequenceOrder: number;
    }>;

  if (!targets.length) return Object.freeze([]);

  const workloads = await loadMaterialWorkloads(
    client,
    userId,
    examProfileId,
    targets.map((target) => ({
      resourceId: target.resourceId,
      plannedMinutes: target.plannedMinutes,
    })),
  );

  return buildAiMaterialCoachingContext(
    targets
      .map((target) => {
        const projection = workloads[target.resourceId];
        return projection
          ? {
              resourceId: target.resourceId,
              resourceName: target.resourceName,
              sequenceOrder: target.sequenceOrder,
              projection,
            }
          : null;
      })
      .filter(Boolean) as AiMaterialContextCandidate[],
  );
}