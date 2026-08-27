import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceRoleKey) throw new Error("Local Supabase env required");

const EDITION = "11000000-0000-0000-0000-000000000001";
const SUBJECT = "20000000-0000-0000-0000-000000000002";
const TOPIC = "30000000-0000-0000-0000-000000000001";
const PLANNER_VERSION = "canonical-planner-v2-shadow-v1";

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

const TODAY = new Date().toISOString().slice(0, 10);
const TARGET = addDays(TODAY, 1);
const weekday = new Date(`${TARGET}T00:00:00Z`).getUTCDay();
const WEEK_START = addDays(TARGET, weekday === 0 ? -6 : 1 - weekday);
const WEEK_END = addDays(WEEK_START, 6);

function client(key = anonKey): SupabaseClient {
  return createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

async function register(api: SupabaseClient, label: string): Promise<User> {
  const suffix = randomUUID();
  const result = await api.auth.signUp({ email: `w6-${label}-${suffix}@example.test`, password: `Safe-${suffix}` });
  expect(result.error).toBeNull();
  return result.data.user!;
}

describe("W6 Planner V2 local transactional candidate", () => {
  const owner = client();
  const other = client();
  const admin = client(serviceRoleKey);
  let ownerUser: User;
  let profileId: string;
  let planId: string;
  let resourceId: string;
  let videoId: string;
  let replaceableTaskId: string;

  function identity(suffix: string) {
    return {
      plannerProposalId: `canonical-planner-v2:${suffix}:${randomUUID()}`,
      proposalFingerprint: `proposal-${suffix}-${randomUUID()}`,
      snapshotFingerprint: `snapshot-${suffix}-${randomUUID()}`,
    };
  }

  function createItem(overrides: Record<string, unknown> = {}) {
    return {
      canonicalWorkloadIdentity: `youtube:${videoId}`,
      materialViewId: `youtube:${videoId}:mapping:map-1`,
      subjectId: SUBJECT,
      resourceId,
      curriculumNodeId: TOPIC,
      taskType: "learn_topic",
      workMode: "video",
      title: "W6 exact full video",
      plannedDate: TARGET,
      estimatedMinutes: 30,
      workloadAuthority: "exact",
      workloadConfidence: "high",
      boundary: { kind: "full_video", videoId, durationSeconds: 1800, watchedSeconds: 0 },
      dedupeKey: `planner-v2:${randomUUID()}`,
      ...overrides,
    };
  }

  async function createCandidate(input: {
    suffix: string;
    creates?: Record<string, unknown>[];
    replaceableTaskIds?: string[];
  }) {
    const ids = identity(input.suffix);
    const plan = await owner.from("weekly_plans").select("generation_version").eq("id", planId).single();
    expect(plan.error).toBeNull();
    const creates = input.creates ?? [createItem()];
    const applyPlan = {
      lifecycleVersion: "planner-v2-lifecycle-v1",
      proposalId: ids.plannerProposalId,
      proposalFingerprint: ids.proposalFingerprint,
      snapshotFingerprint: ids.snapshotFingerprint,
      plannerVersion: PLANNER_VERSION,
      userId: ownerUser.id,
      examProfileId: profileId,
      horizonStart: TODAY,
      horizonEnd: WEEK_END,
      retainedTaskIds: [],
      replaceableTaskIds: input.replaceableTaskIds ?? [],
      outsideScopeTaskIds: [],
      creates,
      expectedNewMinutes: creates.reduce((sum, item) => sum + Number(item.estimatedMinutes), 0),
      atomicRequired: true,
      applyCandidateOnly: true,
    };
    const preview = {
      proposalId: ids.plannerProposalId,
      proposalFingerprint: ids.proposalFingerprint,
      snapshotFingerprint: ids.snapshotFingerprint,
      plannerVersion: PLANNER_VERSION,
      days: [{
        date: TARGET,
        proposedMinutes: creates.reduce((sum, item) => sum + Number(item.estimatedMinutes), 0),
        availableMinutes: 300,
      }],
      explicitConfirmationRequired: true,
      applyAvailable: false,
    };
    const created = await admin.rpc("create_planner_v2_proposal_candidate", {
      p_user_id: ownerUser.id,
      p_exam_profile_id: profileId,
      p_weekly_plan_id: planId,
      p_plan_generation_version: plan.data!.generation_version,
      p_planner_proposal_id: ids.plannerProposalId,
      p_proposal_fingerprint: ids.proposalFingerprint,
      p_planner_snapshot_fingerprint: ids.snapshotFingerprint,
      p_planner_version: PLANNER_VERSION,
      p_component_fingerprints: { capacityFingerprint: "capacity", workloadFingerprint: "workload" },
      p_apply_plan: applyPlan,
      p_preview: preview,
      p_idempotency_key: `w6:${input.suffix}:${randomUUID()}`,
    });
    expect(created.error).toBeNull();
    return { recordId: created.data.recordId as string, ...ids };
  }

  async function confirm(candidate: Awaited<ReturnType<typeof createCandidate>>) {
    return owner.rpc("confirm_planner_v2_proposal_candidate", {
      p_record_id: candidate.recordId,
      p_planner_proposal_id: candidate.plannerProposalId,
      p_proposal_fingerprint: candidate.proposalFingerprint,
      p_planner_snapshot_fingerprint: candidate.snapshotFingerprint,
      p_planner_version: PLANNER_VERSION,
    });
  }

  async function apply(candidate: Awaited<ReturnType<typeof createCandidate>>) {
    return owner.rpc("apply_planner_v2_proposal_candidate", {
      p_record_id: candidate.recordId,
      p_planner_proposal_id: candidate.plannerProposalId,
      p_proposal_fingerprint: candidate.proposalFingerprint,
      p_planner_snapshot_fingerprint: candidate.snapshotFingerprint,
      p_planner_version: PLANNER_VERSION,
    });
  }

  beforeAll(async () => {
    ownerUser = await register(owner, "owner");
    await register(other, "other");
    const profile = await owner.from("exam_profiles").insert({
      user_id: ownerUser.id, exam_edition_id: EDITION, preparation_start_date: TODAY, status: "active",
    }).select("id").single();
    expect(profile.error).toBeNull();
    profileId = profile.data!.id;
    expect((await owner.from("user_subjects").insert({
      user_id: ownerUser.id, exam_profile_id: profileId, subject_id: SUBJECT, status: "active",
    })).error).toBeNull();
    const resource = await owner.from("resources").insert({
      user_id: ownerUser.id, exam_profile_id: profileId, subject_id: SUBJECT,
      name: "W6 Video Resource", resource_type: "video_course", resource_role: "primary",
      difficulty: "normal", status: "active",
    }).select("id").single();
    expect(resource.error).toBeNull();
    resourceId = resource.data!.id;
    const playlist = await owner.from("youtube_playlists").insert({
      user_id: ownerUser.id, exam_profile_id: profileId,
      source_url: "https://www.youtube.com/playlist?list=w6", youtube_playlist_id: `w6-${randomUUID()}`, title: "W6",
    }).select("id").single();
    expect(playlist.error).toBeNull();
    const video = await owner.from("youtube_playlist_videos").insert({
      user_id: ownerUser.id, exam_profile_id: profileId, youtube_playlist_id: playlist.data!.id,
      youtube_video_id: `w6-${randomUUID()}`, title: "W6 exact full video", position: 1, duration_seconds: 1800,
    }).select("id").single();
    expect(video.error).toBeNull();
    videoId = video.data!.id;
    expect((await owner.from("youtube_video_topic_links").insert({
      user_id: ownerUser.id, exam_profile_id: profileId, youtube_playlist_video_id: videoId,
      curriculum_node_id: TOPIC, mapping_status: "validated", mapping_provenance: "reviewed_mapping",
    })).error).toBeNull();
    const plan = await owner.from("weekly_plans").insert({
      user_id: ownerUser.id, exam_profile_id: profileId, week_start_date: WEEK_START, week_end_date: WEEK_END,
      available_minutes: 300, planning_budget_minutes: 300, planned_minutes: 50, status: "active", generation_version: 1,
    }).select("id").single();
    expect(plan.error).toBeNull();
    planId = plan.data!.id;
    const existing = await owner.from("tasks").insert([
      {
        user_id: ownerUser.id, exam_profile_id: profileId, weekly_plan_id: planId, subject_id: SUBJECT,
        curriculum_node_id: TOPIC, resource_id: resourceId, task_type: "learn_topic", title: "Protected today",
        planned_date: TODAY, estimated_minutes: 30, importance: "important", priority_score: 50,
        status: "ready", source_reason: "manual", dedupe_key: `manual-${randomUUID()}`,
      },
      {
        user_id: ownerUser.id, exam_profile_id: profileId, weekly_plan_id: planId, subject_id: SUBJECT,
        curriculum_node_id: TOPIC, resource_id: resourceId, task_type: "custom", title: "Replaceable W6 generated",
        planned_date: TARGET, estimated_minutes: 20, importance: "important", priority_score: 40,
        status: "ready", source_reason: "planner_v2", dedupe_key: `old-${randomUUID()}`,
        canonical_workload_identity: `youtube:old-${randomUUID()}`,
        canonical_material_view_id: "youtube:old:mapping:old",
        canonical_boundary: { kind: "full_video", videoId: randomUUID(), durationSeconds: 1200, watchedSeconds: 0 },
        planner_version: PLANNER_VERSION, planner_proposal_fingerprint: "old-proposal",
      },
    ]).select("id,title");
    expect(existing.error).toBeNull();
    replaceableTaskId = existing.data!.find((row) => row.title.startsWith("Replaceable"))!.id;
  });

  it("preview persistence creates zero task mutations", async () => {
    const before = await owner.from("tasks").select("id", { count: "exact", head: true }).eq("weekly_plan_id", planId);
    const candidate = await createCandidate({ suffix: "preview-only" });
    const after = await owner.from("tasks").select("id", { count: "exact", head: true }).eq("weekly_plan_id", planId);
    expect(after.count).toBe(before.count);
    expect(candidate.recordId).toBeTruthy();
  });

  it("rejects generic or wrong proposal confirmation identity", async () => {
    const candidate = await createCandidate({ suffix: "wrong-confirm" });
    const result = await owner.rpc("confirm_planner_v2_proposal_candidate", {
      p_record_id: candidate.recordId, p_planner_proposal_id: candidate.plannerProposalId,
      p_proposal_fingerprint: "generic-yes", p_planner_snapshot_fingerprint: candidate.snapshotFingerprint,
      p_planner_version: PLANNER_VERSION,
    });
    expect(result.error?.message).toContain("PLANNER_V2_CONFIRMATION_IDENTITY_MISMATCH");
  });

  it("rejects Apply without explicit confirmation and enforces ownership", async () => {
    const candidate = await createCandidate({ suffix: "unconfirmed" });
    expect((await apply(candidate)).error?.message).toContain("PLANNER_V2_EXPLICIT_CONFIRMATION_REQUIRED");
    const foreign = await other.rpc("confirm_planner_v2_proposal_candidate", {
      p_record_id: candidate.recordId, p_planner_proposal_id: candidate.plannerProposalId,
      p_proposal_fingerprint: candidate.proposalFingerprint,
      p_planner_snapshot_fingerprint: candidate.snapshotFingerprint, p_planner_version: PLANNER_VERSION,
    });
    expect(foreign.error?.message).toContain("PLANNER_V2_PROPOSAL_NOT_FOUND");
  });

  it("rolls back all task replacement/inserts when a later create fails", async () => {
    const before = await owner.from("tasks").select("id,status,planned_date").eq("weekly_plan_id", planId).order("id");
    const candidate = await createCandidate({
      suffix: "rollback",
      replaceableTaskIds: [replaceableTaskId],
      creates: [createItem(), createItem({ canonicalWorkloadIdentity: `youtube:${randomUUID()}`, resourceId: randomUUID() })],
    });
    expect((await confirm(candidate)).error).toBeNull();
    expect((await apply(candidate)).error?.message).toContain("PLANNER_V2_RESOURCE_OWNER_MISMATCH");
    const after = await owner.from("tasks").select("id,status,planned_date").eq("weekly_plan_id", planId).order("id");
    expect(after.data).toEqual(before.data);
  });

  it("atomically replaces only owned future generated work and creates canonical linkage", async () => {
    const candidate = await createCandidate({ suffix: "success", replaceableTaskIds: [replaceableTaskId] });
    const confirmed = await confirm(candidate);
    expect(confirmed.error).toBeNull();
    expect(confirmed.data.state).toBe("confirmed");
    const result = await apply(candidate);
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({ state: "applied", applied: true, idempotent: false });
    const protectedTask = await owner.from("tasks").select("status,planned_date").eq("title", "Protected today").single();
    expect(protectedTask.data).toEqual({ status: "ready", planned_date: TODAY });
    const replaced = await owner.from("tasks").select("status,planned_date").eq("id", replaceableTaskId).single();
    expect(replaced.data).toEqual({ status: "cancelled", planned_date: null });
    const created = await owner.from("tasks").select("canonical_workload_identity,planner_version,source_reason")
      .eq("canonical_workload_identity", `youtube:${videoId}`).single();
    expect(created.data).toEqual({
      canonical_workload_identity: `youtube:${videoId}`, planner_version: PLANNER_VERSION, source_reason: "planner_v2",
    });
  });

  it("returns the original result on duplicate Apply without duplicating tasks", async () => {
    const row = await owner.from("confirmed_action_proposals")
      .select("id,planner_proposal_id,proposal_fingerprint,planner_snapshot_fingerprint")
      .eq("status", "applied").eq("action_kind", "planner_v2_week").single();
    const result = await owner.rpc("apply_planner_v2_proposal_candidate", {
      p_record_id: row.data!.id, p_planner_proposal_id: row.data!.planner_proposal_id,
      p_proposal_fingerprint: row.data!.proposal_fingerprint,
      p_planner_snapshot_fingerprint: row.data!.planner_snapshot_fingerprint,
      p_planner_version: PLANNER_VERSION,
    });
    expect(result.error).toBeNull();
    expect(result.data.idempotent).toBe(true);
    const count = await owner.from("tasks").select("id", { count: "exact", head: true })
      .eq("canonical_workload_identity", `youtube:${videoId}`).neq("status", "cancelled");
    expect(count.count).toBe(1);
  });

  it("prevents duplicate canonical workload in a later proposal", async () => {
    const candidate = await createCandidate({ suffix: "duplicate" });
    expect((await confirm(candidate)).error).toBeNull();
    const applied = await apply(candidate);
    expect(applied.error).not.toBeNull();
    const count = await owner.from("tasks").select("id", { count: "exact", head: true })
      .eq("canonical_workload_identity", `youtube:${videoId}`).neq("status", "cancelled");
    expect(count.count).toBe(1);
  });

  it("marks a confirmed proposal stale after authoritative capacity changes and never applies it", async () => {
    const candidate = await createCandidate({ suffix: "stale-capacity", creates: [] });
    expect((await confirm(candidate)).error).toBeNull();
    const plan = await owner.from("weekly_plans").select("planning_budget_minutes").eq("id", planId).single();
    expect((await owner.from("weekly_plans").update({ planning_budget_minutes: plan.data!.planning_budget_minutes - 1 }).eq("id", planId)).error).toBeNull();
    const result = await apply(candidate);
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({ state: "stale", applied: false });
    const stored = await owner.from("confirmed_action_proposals").select("status,confirmed_at").eq("id", candidate.recordId).single();
    expect(stored.data).toEqual({ status: "stale", confirmed_at: null });
  });
});
