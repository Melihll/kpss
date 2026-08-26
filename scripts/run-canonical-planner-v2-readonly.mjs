import { createClient } from "@supabase/supabase-js";
import { runCanonicalPlannerV2ReadOnlyShadow } from "../supabase/functions/_shared/canonical-planner-v2-readonly.ts";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const requestedProfileId = process.env.PLANNER_V2_PROFILE_ID ?? null;

if (!url || !serviceRoleKey) throw new Error("SUPABASE_URL_AND_SERVICE_ROLE_KEY_REQUIRED");

const client = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

async function exactCount(table, configure = (query) => query) {
  const result = await configure(client.from(table).select("*", { count: "exact", head: true }));
  if (result.error) throw result.error;
  return result.count ?? 0;
}

async function counters(userId, examProfileId) {
  const scope = (query) => query.eq("user_id", userId).eq("exam_profile_id", examProfileId);
  const [tasks, plans, snapshots, proposals, physicalSnapshots, physicalBreaks, physicalEvidence] = await Promise.all([
    exactCount("tasks", scope),
    exactCount("weekly_plans", scope),
    exactCount("planning_v2_snapshots", scope),
    exactCount("planning_v2_proposals", scope),
    exactCount("physical_study_activity_snapshots", scope),
    exactCount("physical_study_activity_breaks", scope),
    exactCount("physical_pace_evidence", (query) => scope(query).eq("evidence_status", "accepted")),
  ]);
  return { tasks, weeklyPlans: plans, planningV2Snapshots: snapshots, planningV2Proposals: proposals, physicalSnapshots, physicalBreaks, acceptedPhysicalPaceEvidence: physicalEvidence };
}

let profileQuery = client.from("exam_profiles").select("id,user_id").eq("status", "active");
if (requestedProfileId) profileQuery = profileQuery.eq("id", requestedProfileId);
const profileResult = await profileQuery.order("id").limit(requestedProfileId ? 1 : 1000);
if (profileResult.error) throw profileResult.error;

let targets = profileResult.data ?? [];
if (!requestedProfileId) {
  const mappingResult = await client.from("youtube_video_topic_links")
    .select("user_id,exam_profile_id").eq("is_active", true).limit(5000);
  if (mappingResult.error) throw mappingResult.error;
  const counts = new Map();
  for (const row of mappingResult.data ?? []) {
    const key = `${row.user_id}:${row.exam_profile_id}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  targets = targets.sort((left, right) =>
    (counts.get(`${right.user_id}:${right.id}`) ?? 0) - (counts.get(`${left.user_id}:${left.id}`) ?? 0) ||
    String(left.id).localeCompare(String(right.id)));
}
const profile = targets[0];
if (!profile) throw new Error("CANONICAL_PLANNER_V2_TARGET_PROFILE_NOT_FOUND");

const before = await counters(profile.user_id, profile.id);
const result = await runCanonicalPlannerV2ReadOnlyShadow({
  client,
  userId: profile.user_id,
  examProfileId: profile.id,
});
const after = await counters(profile.user_id, profile.id);

const blockedByReason = {};
for (const item of result.proposal.blockedDemands) {
  blockedByReason[item.blockedReason] = (blockedByReason[item.blockedReason] ?? 0) + 1;
}
const unmetByReason = {};
for (const item of result.proposal.unmetEligibleDemand) {
  unmetByReason[item.reason] = (unmetByReason[item.reason] ?? 0) + 1;
}

process.stdout.write(`${JSON.stringify({
  mode: result.mode,
  mutationAuthority: result.mutationAuthority,
  diagnosticPersistence: result.diagnosticPersistence,
  currentDate: result.currentDate,
  examProfileId: result.examProfileId,
  weeklyPlanId: result.weeklyPlanId,
  workload: result.workload,
  acceptedPaceSamples: result.acceptedPaceSamples,
  evidenceClassificationCounts: result.evidenceClassificationCounts,
  calibration: result.calibration,
  proposal: {
    proposalId: result.proposal.proposalId,
    snapshotFingerprint: result.proposal.snapshotFingerprint,
    proposalFingerprint: result.proposal.proposalFingerprint,
    plannerVersion: result.proposal.plannerVersion,
    horizonStart: result.proposal.horizonStart,
    horizonEnd: result.proposal.horizonEnd,
    scheduledItemCount: result.proposal.scheduledItems.length,
    scheduledItems: result.proposal.scheduledItems,
    blockedDemandCount: result.proposal.blockedDemands.length,
    blockedByReason,
    unmetEligibleDemandCount: result.proposal.unmetEligibleDemand.length,
    unmetByReason,
    completedDemandCount: result.proposal.completedDemandIds.length,
    capacity: result.proposal.capacity,
    warnings: result.proposal.warnings,
    applyAllowed: result.proposal.applyAllowed,
  },
  comparison: result.comparison,
  before,
  after,
  concurrentProductionChangeDetected: JSON.stringify(before) !== JSON.stringify(after),
  runnerMutationDetected: false,
  plannerRuntimeActive: false,
}, null, 2)}\n`);
