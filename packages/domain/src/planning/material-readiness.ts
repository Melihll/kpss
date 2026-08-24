export type MaterialPlannerReadinessStatus =
  | "ready"
  | "partial"
  | "blocked"
  | "inactive";

export interface MaterialPlannerReadinessInput {
  resourceId: string;
  isActive: boolean;
  sectionCoverageComplete: boolean;
  unitCoverageComplete: boolean;
  topicMappingCoverageComplete: boolean;
  orderingValid: boolean;
  workloadMetadataComplete: boolean;
  unresolvedValidationIssues: number;
}

export interface MaterialPlannerReadiness {
  resourceId: string;
  status: MaterialPlannerReadinessStatus;
  plannerReady: boolean;
  reasons: string[];
}

export function evaluateMaterialPlannerReadiness(
  input: MaterialPlannerReadinessInput,
): MaterialPlannerReadiness {
  if (!input.isActive) {
    return {
      resourceId: input.resourceId,
      status: "inactive",
      plannerReady: false,
      reasons: ["resource_inactive"],
    };
  }

  const reasons: string[] = [];

  if (!input.sectionCoverageComplete) reasons.push("section_coverage_incomplete");
  if (!input.unitCoverageComplete) reasons.push("unit_coverage_incomplete");
  if (!input.topicMappingCoverageComplete) reasons.push("topic_mapping_incomplete");
  if (!input.orderingValid) reasons.push("ordering_invalid");
  if (!input.workloadMetadataComplete) reasons.push("workload_metadata_incomplete");

  if (input.unresolvedValidationIssues > 0) {
    reasons.push("unresolved_validation_issues");
  }

  if (!input.orderingValid || input.unresolvedValidationIssues > 0) {
    return {
      resourceId: input.resourceId,
      status: "blocked",
      plannerReady: false,
      reasons,
    };
  }

  if (reasons.length > 0) {
    return {
      resourceId: input.resourceId,
      status: "partial",
      plannerReady: false,
      reasons,
    };
  }

  return {
    resourceId: input.resourceId,
    status: "ready",
    plannerReady: true,
    reasons: [],
  };
}
