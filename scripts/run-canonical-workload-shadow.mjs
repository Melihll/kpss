import { createClient } from "@supabase/supabase-js";
import { loadCanonicalWorkloadReadiness } from "../supabase/functions/_shared/canonical-material-shadow.ts";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error("SUPABASE_URL_AND_SERVICE_ROLE_KEY_REQUIRED");
}

const client = createClient(url, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

async function exactCount(table, configure = (query) => query) {
  const result = await configure(client.from(table).select("*", { count: "exact", head: true }));
  if (result.error) throw result.error;
  return result.count ?? 0;
}

async function safetyGuard() {
  const [resourceUnits, mappings, partialPages] = await Promise.all([
    exactCount("resource_units"),
    exactCount("youtube_video_topic_links"),
    exactCount("resource_unit_progress", (query) => query.not("completed_through_page", "is", null)),
  ]);
  return { resourceUnits, youtubeVideoTopicLinks: mappings, completedThroughPageNonNull: partialPages };
}

const mappingResult = await client
  .from("youtube_video_topic_links")
  .select("user_id,exam_profile_id")
  .eq("is_active", true)
  .limit(1000);
if (mappingResult.error) throw mappingResult.error;

const scopes = new Map();
for (const row of mappingResult.data ?? []) {
  const key = `${row.user_id}:${row.exam_profile_id}`;
  const current = scopes.get(key) ?? { userId: row.user_id, examProfileId: row.exam_profile_id, mappings: 0 };
  current.mappings += 1;
  scopes.set(key, current);
}

const target = [...scopes.values()].sort(
  (left, right) => right.mappings - left.mappings ||
    String(left.examProfileId).localeCompare(String(right.examProfileId)),
)[0];
if (!target) throw new Error("CANONICAL_WORKLOAD_TARGET_PROFILE_NOT_FOUND");

const resourcesResult = await client
  .from("resources")
  .select("id")
  .eq("user_id", target.userId)
  .eq("exam_profile_id", target.examProfileId)
  .eq("status", "active")
  .order("id");
if (resourcesResult.error) throw resourcesResult.error;
const resourceIds = (resourcesResult.data ?? []).map((row) => String(row.id));

const before = await safetyGuard();
const readiness = await loadCanonicalWorkloadReadiness(
  client,
  target.userId,
  target.examProfileId,
  resourceIds,
);
const after = await safetyGuard();

if (JSON.stringify(before) !== JSON.stringify(after)) {
  throw new Error("READ_ONLY_SHADOW_GUARD_CHANGED");
}

process.stdout.write(`${JSON.stringify({
  mode: "PRODUCTION_READ_ONLY_SHADOW",
  target: {
    activeResources: resourceIds.length,
    authoritativeMappingRowsInScope: target.mappings,
  },
  workload: readiness.summary,
  evidenceClassificationCounts: readiness.evidenceClassificationCounts,
  acceptedPaceSamples: readiness.acceptedPaceSamples,
  safetyBefore: before,
  safetyAfter: after,
  canonicalRuntimeActive: false,
}, null, 2)}\n`);
