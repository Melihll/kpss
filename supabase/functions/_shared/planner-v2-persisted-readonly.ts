type Client = any;

export const PLANNER_V2_PERSISTED_SELECT = [
  "id", "user_id", "exam_profile_id", "weekly_plan_id", "action_kind", "status",
  "plan_generation_version", "display_payload", "expires_at", "created_at", "updated_at",
  "confirmed_at", "applied_at", "planner_proposal_id", "proposal_fingerprint",
  "planner_snapshot_fingerprint", "planner_version", "component_fingerprints",
].join(",");

export interface PlannerV2PersistedIdentity {
  readonly recordId: string;
}

/** Exact identity reader shared by lifecycle endpoints. No validation or mutation. */
export async function loadPlannerV2ProposalByIdentityReadOnly(
  client: Client,
  exact: PlannerV2PersistedIdentity,
  userId: string,
  examProfileId: string,
) {
  const { data, error } = await client.from("confirmed_action_proposals")
    .select(PLANNER_V2_PERSISTED_SELECT)
    .eq("id", exact.recordId)
    .eq("user_id", userId)
    .eq("exam_profile_id", examProfileId)
    .eq("action_kind", "planner_v2_week")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("PLANNER_V2_PROPOSAL_NOT_FOUND");
  return data;
}

/**
 * Returns the newest persisted Planner V2 lifecycle row for the selected plan.
 * Deliberately never calls buildPlannerV2Preview or any proposal generator.
 */
export async function loadCurrentPlannerV2PersistedStateReadOnly(
  client: Client,
  userId: string,
  examProfileId: string,
  weeklyPlanId: string,
) {
  const { data, error } = await client.from("confirmed_action_proposals")
    .select(PLANNER_V2_PERSISTED_SELECT)
    .eq("user_id", userId)
    .eq("exam_profile_id", examProfileId)
    .eq("weekly_plan_id", weeklyPlanId)
    .eq("action_kind", "planner_v2_week")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}
