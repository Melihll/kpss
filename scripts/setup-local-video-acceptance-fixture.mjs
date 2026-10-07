#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { readLocalSupabaseStatus } from "./supabase-status.mjs";
import { ACCEPTANCE_EMAIL, assertLocalVideoEnvironment, acceptanceDates, fixtureId, verifyLocalAccessToken } from "./local-video-acceptance.mjs";
import { adaptYoutubeMaterialRow } from "../supabase/functions/_shared/planning.bundle.js";

const args = process.argv.slice(2);
const profileIndex = args.indexOf("--profile-id");
const profileId = profileIndex >= 0 ? args[profileIndex + 1] : undefined;
const apply = args.includes("--apply");
const releaseClosure = args.includes("--release-closure");
if (args.some((arg, index) => !["--apply", "--profile-id", "--release-closure"].includes(arg) && index !== profileIndex + 1)) throw new Error("Use --profile-id UUID [--release-closure] [--apply].");
const local = readLocalSupabaseStatus();
assertLocalVideoEnvironment(local, profileId, ACCEPTANCE_EMAIL);
const dates = acceptanceDates();
const id = (label) => fixtureId(profileId, label);
const catalogId = (label) => id(releaseClosure ? `release-closure:${label}` : label);
// Official YouTube IFrame API example, checked against public YouTube metadata.
// Catalog data only: no native ID or source URL is added to frontend/task identity.
const videoFixture = { youtube_video_id: "M7lc1UVf-VE", title: "YouTube Developers Live: Embedded Web Player Customization", duration_seconds: 1344 };
const manifest = { email: ACCEPTANCE_EMAIL, profileId, ...dates, scope: releaseClosure ? "release-closure" : "original", resourceId: catalogId("resource"), playlistId: catalogId("playlist"), videoId: catalogId("video"), mappingId: catalogId("mapping"), planId: id(`week:${dates.weekStart}`), taskId: catalogId(`task:${dates.today}`), nativeVideoId: videoFixture.youtube_video_id };
if (!apply) {
  console.log(JSON.stringify({ mode: "DRY_RUN", manifest, writes: "none" }, null, 2));
  process.exit(0);
}
const password = process.env.KPSS_VIDEO_ACCEPTANCE_PASSWORD;
if (!password || password.length < 12) throw new Error("Set KPSS_VIDEO_ACCEPTANCE_PASSWORD for the dedicated LOCAL test account (minimum 12 characters).");
const sql = postgres(local.dbUrl, { max: 1 });
try {
  const existing = await sql.begin("read only", (tx) => tx`select id from auth.users where email=${ACCEPTANCE_EMAIL}`);
  const auth = createClient(local.url, local.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const result = existing.length
    ? await auth.auth.signInWithPassword({ email: ACCEPTANCE_EMAIL, password })
    : await auth.auth.signUp({ email: ACCEPTANCE_EMAIL, password, options: { data: { display_name: "Local Video Acceptance" } } });
  if (result.error || !result.data.session || !result.data.user) throw new Error("Real local Auth login/signup failed. No fixture rows were written.");
  const token = result.data.session.access_token;
  const authEvidence = await verifyLocalAccessToken(local.url, token);
  const smoke = await fetch(`${local.url}/functions/v1/app-api/study-sessions/active`, { redirect: "error", headers: { apikey: local.anonKey, Authorization: `Bearer ${token}` } });
  const smokeBody = await smoke.json();
  if (!(smoke.ok || smokeBody?.error?.code === "NO_ACTIVE_EXAM_PROFILE")) throw new Error(`Local protected smoke failed (${smoke.status}). Fixture writes refused.`);
  const userId = result.data.user.id;
  const editionId = "11000000-0000-0000-0000-000000000001";
  const subjectId = "20000000-0000-0000-0000-000000000002";
  const topicId = "30000000-0000-0000-0000-000000000001";
  const inserted = [];
  const reused = [];
  const updated = [];
  await sql.begin(async (tx) => {
    // Never modify another user/profile or overwrite progress, sessions, task status.
    const profiles = await tx`select id,user_id from public.exam_profiles where id=${profileId}::uuid or user_id=${userId}::uuid`;
    if (profiles.some((row) => row.id !== profileId || row.user_id !== userId)) throw new Error("Test profile/account already belongs to a different fixture. Refused.");
    async function insert(table, row) {
      const found = await tx`select * from ${tx(table)} where id=${row.id}::uuid`;
      if (found.length) {
        const current = found[0];
        if (current.user_id !== userId || (current.exam_profile_id && current.exam_profile_id !== profileId) ||
            (row.canonical_material_view_id && current.canonical_material_view_id !== row.canonical_material_view_id) ||
            (row.youtube_video_id && current.youtube_video_id !== row.youtube_video_id)) {
          throw new Error(`Fixture identity collision in ${table}. Refused.`);
        }
        for (const field of ["exam_edition_id", "subject_id", "curriculum_node_id", "resource_id", "youtube_playlist_id", "youtube_playlist_video_id", "weekly_plan_id"]) {
          if (row[field] !== undefined && current[field] !== row[field]) throw new Error(`Fixture linkage collision in ${table}.${field}. Refused.`);
        }
        reused.push({ table, id: row.id });
        return current;
      }
      const rows = await tx`insert into ${tx(table)} ${tx(row)} returning *`;
      inserted.push({ table, id: row.id });
      return rows[0];
    }
    const ownership = { user_id: userId, exam_profile_id: profileId };
    await insert("exam_profiles", { id: profileId, user_id: userId, exam_edition_id: editionId, preparation_start_date: dates.today, target_exam_date: "2027-09-12", status: "active" });
    await insert("user_subjects", { id: id("subject"), ...ownership, subject_id: subjectId, status: "active" });
    await insert("p48_strategy_profiles", { id: id("strategy"), ...ownership, target_exam_date: "2027-09-12", weekly_target_minutes: 420, monthly_target_minutes: 1680, status: "active", source_note: "LOCAL video acceptance fixture only" });
    for (let weekday = 1; weekday <= 7; weekday++) await insert("weekly_availability", { id: id(`availability:${weekday}`), ...ownership, weekday, start_time: "00:00", end_time: "23:59", label: "LOCAL acceptance", is_active: true });
    await insert("resources", { id: manifest.resourceId, ...ownership, subject_id: subjectId, name: "Yerel video kabul testi", resource_type: "video_course", resource_role: "primary", difficulty: "normal", status: "active" });
    await insert("p48_resource_targets", { id: catalogId("target"), ...ownership, resource_id: manifest.resourceId, planned_minutes: 23, sequence_order: releaseClosure ? 2 : 1, work_mode: "video" });
    // A one-video local fixture collection in the EXISTING playlist table; not a remote playlist import.
    await insert("youtube_playlists", { id: manifest.playlistId, ...ownership, source_url: `https://www.youtube.com/watch?v=${videoFixture.youtube_video_id}`, youtube_playlist_id: `local-acceptance-single-video:${videoFixture.youtube_video_id}${releaseClosure ? ":release-closure" : ""}`, title: "LOCAL acceptance collection", total_duration_seconds: videoFixture.duration_seconds, video_count: 1 });
    const video = await insert("youtube_playlist_videos", { id: manifest.videoId, ...ownership, youtube_playlist_id: manifest.playlistId, ...videoFixture, position: 0, channel_title: "Google for Developers", is_active: true });
    await insert("topic_resource_links", { id: catalogId("resource-link"), ...ownership, curriculum_node_id: topicId, resource_id: manifest.resourceId, youtube_playlist_id: manifest.playlistId, is_primary: !releaseClosure });
    const mapping = await insert("youtube_video_topic_links", { id: manifest.mappingId, ...ownership, youtube_playlist_video_id: manifest.videoId, curriculum_node_id: topicId, mapping_status: "validated", mapping_provenance: "reviewed_mapping", is_active: true });
    const unit = adaptYoutubeMaterialRow({ video, resourceId: manifest.resourceId, progress: null, mapping });
    if (!unit.plannerEligible || unit.sourceId !== manifest.videoId) throw new Error("Existing canonical adapter rejected the fixture.");
    manifest.materialViewId = unit.id;
    // An active canonical workload can occur only once in a week. Reuse it on
    // replay across dates instead of overwriting its date/progress/session state.
    const activeWorkload = await tx`select id,planned_date,canonical_material_view_id,resource_id from tasks where user_id=${userId}::uuid and exam_profile_id=${profileId}::uuid and weekly_plan_id=${manifest.planId}::uuid and canonical_workload_identity=${`youtube:${unit.sourceId}`} and status not in ('cancelled','missed')`;
    if (activeWorkload.length > 1 || activeWorkload.some((task) => task.canonical_material_view_id !== unit.id || task.resource_id !== manifest.resourceId)) throw new Error("Active canonical fixture collision. Refused.");
    if (activeWorkload.length) { manifest.taskId = activeWorkload[0].id; manifest.actualTaskDate = String(activeWorkload[0].planned_date).slice(0, 10); }
    await insert("weekly_plans", { id: manifest.planId, ...ownership, week_start_date: dates.weekStart, week_end_date: dates.weekEnd, available_minutes: 10073, planning_budget_minutes: 420, planned_minutes: 23, status: "active", generation_version: 1 });
    await insert("tasks", { id: manifest.taskId, ...ownership, weekly_plan_id: manifest.planId, subject_id: subjectId, curriculum_node_id: topicId, resource_id: manifest.resourceId, task_type: "custom", work_mode: "video", title: "Gerçek video · Yerel kabul testi", description: "LOCAL-only playback/progress/resume acceptance. KPSS curriculum content is not claimed.", planned_date: dates.today, estimated_minutes: 23, importance: "important", priority_score: 90, status: "ready", source_reason: "planner_v2", dedupe_key: `local-video-acceptance:${dates.today}`, canonical_workload_identity: `youtube:${unit.sourceId}`, canonical_material_view_id: unit.id, canonical_boundary: { kind: "full_video", videoId: unit.sourceId, durationSeconds: videoFixture.duration_seconds, watchedSeconds: 0 }, planner_version: "canonical-planner-v2-shadow-v1", planner_proposal_fingerprint: `local-video-acceptance-v1:${dates.today}` });
    const totals = await tx`select coalesce(sum(estimated_minutes),0)::int as minutes from tasks where weekly_plan_id=${manifest.planId}::uuid and status not in ('cancelled','rescheduled')`;
    const changed = await tx`update weekly_plans set planned_minutes=${totals[0].minutes} where id=${manifest.planId}::uuid and user_id=${userId}::uuid and exam_profile_id=${profileId}::uuid and planned_minutes<>${totals[0].minutes} returning id`;
    if (changed.length) updated.push({ table: "weekly_plans", id: manifest.planId, plannedMinutes: totals[0].minutes });
  });
  console.log(JSON.stringify({ mode: "APPLIED", auth: authEvidence, protectedSmokeStatus: smoke.status, userId, manifest, inserted, reused, updated, progressAndSessions: "untouched", production: "NOT DEPLOYED" }, null, 2));
} finally {
  await sql.end();
}
