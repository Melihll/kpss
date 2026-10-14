/** A legacy window-only consumer must never read retained windows as daily authority. */
export async function requireTimeWindowCapacity(client: any, userId: string, profileId: string) {
  const result = await client.from("study_capacity_preferences").select("mode")
    .eq("user_id", userId).eq("exam_profile_id", profileId).maybeSingle();
  if (result.error) throw result.error;
  if (result.data?.mode === "daily_minutes") throw new Error("CAPACITY_MODEL_UNSUPPORTED");
}
