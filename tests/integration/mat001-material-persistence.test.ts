import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { loadCanonicalMaterialUnits } from "../../supabase/functions/_shared/canonical-material-loader";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error("Supabase integration env required");
}

const EDITION = "11000000-0000-0000-0000-000000000001";
const SUBJECT = "20000000-0000-0000-0000-000000000002";
const TOPIC = "30000000-0000-0000-0000-000000000001";

function client() {
  return createClient(url!, anonKey!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

async function register(api: SupabaseClient): Promise<User> {
  const id = randomUUID();
  const result = await api.auth.signUp({
    email: `mat001-${id}@example.test`,
    password: `Safe-${id}`,
  });
  expect(result.error).toBeNull();
  return result.data.user!;
}

describe("MAT-001 persistence and canonical material loader", () => {
  const a = client();
  const b = client();
  let userA: User;
  let profileId: string;
  let resourceId: string;
  let unitId: string;
  let playlistId: string;
  let fullVideoId: string;
  let segmentVideoId: string;

  beforeAll(async () => {
    userA = await register(a);
    await register(b);

    const profile = await a.from("exam_profiles").insert({
      user_id: userA.id,
      exam_edition_id: EDITION,
      preparation_start_date: "2026-08-24",
      status: "active",
    }).select("id").single();
    expect(profile.error).toBeNull();
    profileId = profile.data!.id;

    const resource = await a.from("resources").insert({
      user_id: userA.id,
      exam_profile_id: profileId,
      subject_id: SUBJECT,
      name: "MAT-001 Source",
      resource_type: "question_bank",
      resource_role: "primary",
      difficulty: "normal",
      status: "active",
    }).select("id").single();
    expect(resource.error).toBeNull();
    resourceId = resource.data!.id;

    const section = await a.from("resource_sections").insert({
      resource_id: resourceId,
      curriculum_node_id: TOPIC,
      name: "MAT-001 Section",
      sort_order: 1,
    }).select("id").single();
    expect(section.error).toBeNull();

    const unit = await a.from("resource_units").insert({
      resource_id: resourceId,
      resource_section_id: section.data!.id,
      unit_type: "reading",
      name: "Pages 10-20",
      sort_order: 1,
      page_start: 10,
      page_end: 20,
      estimated_minutes: 30,
    }).select("id").single();
    expect(unit.error).toBeNull();
    unitId = unit.data!.id;

    const playlist = await a.from("youtube_playlists").insert({
      user_id: userA.id,
      exam_profile_id: profileId,
      source_url: "https://www.youtube.com/playlist?list=mat001",
      youtube_playlist_id: `mat001-${randomUUID()}`,
      title: "MAT-001 Playlist",
    }).select("id").single();
    expect(playlist.error).toBeNull();
    playlistId = playlist.data!.id;

    const topicLink = await a.from("topic_resource_links").insert({
      user_id: userA.id,
      exam_profile_id: profileId,
      curriculum_node_id: TOPIC,
      resource_id: resourceId,
      youtube_playlist_id: playlistId,
      is_primary: true,
    });
    expect(topicLink.error).toBeNull();

    const videos = await a.from("youtube_playlist_videos").insert([
      {
        user_id: userA.id,
        exam_profile_id: profileId,
        youtube_playlist_id: playlistId,
        youtube_video_id: `full-${randomUUID()}`,
        title: "Full mapped video",
        position: 1,
        duration_seconds: 1000,
      },
      {
        user_id: userA.id,
        exam_profile_id: profileId,
        youtube_playlist_id: playlistId,
        youtube_video_id: `segment-${randomUUID()}`,
        title: "Segment mapped video",
        position: 2,
        duration_seconds: 1200,
      },
    ]).select("id,position");
    expect(videos.error).toBeNull();

    fullVideoId = videos.data!.find((row) => row.position === 1)!.id;
    segmentVideoId = videos.data!.find((row) => row.position === 2)!.id;
  });

  it("persists valid exact partial-page progress", async () => {
    const result = await a.from("resource_unit_progress").insert({
      user_id: userA.id,
      resource_unit_id: unitId,
      status: "in_progress",
      completed_through_page: 12,
    }).select("completed_through_page").single();

    expect(result.error).toBeNull();
    expect(result.data!.completed_through_page).toBe(12);
  });

  it("rejects physical progress outside the canonical page range", async () => {
    const result = await a.from("resource_unit_progress").update({
      completed_through_page: 21,
    }).eq("resource_unit_id", unitId);

    expect(result.error?.message).toContain(
      "COMPLETED_THROUGH_PAGE_OUT_OF_RANGE",
    );
  });

  it("persists reviewed full-video and segment mappings with RLS isolation", async () => {
    const mappings = await a.from("youtube_video_topic_links").insert([
      {
        user_id: userA.id,
        exam_profile_id: profileId,
        youtube_playlist_video_id: fullVideoId,
        curriculum_node_id: TOPIC,
        mapping_status: "validated",
        mapping_provenance: "reviewed_mapping",
      },
      {
        user_id: userA.id,
        exam_profile_id: profileId,
        youtube_playlist_video_id: segmentVideoId,
        curriculum_node_id: TOPIC,
        mapping_status: "validated",
        mapping_provenance: "reviewed_mapping",
        segment_start_seconds: 300,
        segment_end_seconds: 700,
      },
    ]);

    expect(mappings.error).toBeNull();

    const isolated = await b.from("youtube_video_topic_links")
      .select("id")
      .eq("youtube_playlist_video_id", fullVideoId);

    expect(isolated.error).toBeNull();
    expect(isolated.data).toEqual([]);
  });

  it("rejects a segment outside video duration", async () => {
    const result = await a.from("youtube_video_topic_links").insert({
      user_id: userA.id,
      exam_profile_id: profileId,
      youtube_playlist_video_id: fullVideoId,
      curriculum_node_id: TOPIC,
      mapping_status: "ambiguous",
      mapping_provenance: "ai_candidate",
      segment_start_seconds: 900,
      segment_end_seconds: 1100,
    });

    expect(result.error?.message).toContain(
      "SEGMENT_OUTSIDE_VIDEO_DURATION",
    );
  });

  it("loads physical and YouTube stores into canonical material units safely", async () => {
    const progress = await a.rpc("record_youtube_video_progress", {
      p_video_id: fullVideoId,
      p_position_seconds: 450,
      p_watched_seconds: 300,
    });
    expect(progress.error).toBeNull();

    const units = await loadCanonicalMaterialUnits(
      a,
      userA.id,
      profileId,
      [resourceId],
    );

    const physical = units.find(
      (unit: any) => unit.sourceKind === "physical",
    );
    expect(physical).toMatchObject({
      completedThroughPage: 12,
      plannerEligible: true,
    });

    const full = units.find(
      (unit: any) => unit.sourceId === fullVideoId,
    );
    expect(full).toMatchObject({
      watchedSeconds: 300,
      lastPositionSeconds: 450,
      plannerEligible: true,
    });

    const segment = units.find(
      (unit: any) => unit.sourceId === segmentVideoId,
    );
    expect(segment).toMatchObject({
      segmentStartSeconds: 300,
      segmentEndSeconds: 700,
      plannerEligible: false,
    });
  });
});
