export const PLANNER_V2_PROPOSAL_CAPABILITY_ENV = "PLANNER_V2_PROPOSAL_LIFECYCLE_PROFILE_IDS" as const;

export function isPlannerV2ProposalLifecycleEnabled(
  configuredProfileIds: string | null | undefined,
  examProfileId: string,
): boolean {
  if (!configuredProfileIds?.trim() || !examProfileId) return false;
  return configuredProfileIds
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && value !== "*")
    .includes(examProfileId);
}
