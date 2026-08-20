import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  normalizeTopicResourceLinkInput,
} from "../supabase/functions/_shared/topic-resource-link";

describe("P1-09 topic resource link input", () => {
  it("normalizes a resource-only link", () => {
    expect(normalizeTopicResourceLinkInput({
      resourceId: "resource-1",
    })).toEqual({
      resourceId: "resource-1",
      isPrimary: false,
      playlist: null,
    });
  });

  it("normalizes a resource + youtube playlist link without external calls", () => {
    expect(normalizeTopicResourceLinkInput({
      resourceId: "resource-1",
      isPrimary: true,
      playlist: {
        sourceUrl: "https://www.youtube.com/playlist?list=PLabc_123",
        youtubePlaylistId: "PLabc_123",
      },
    })).toEqual({
      resourceId: "resource-1",
      isPrimary: true,
      playlist: {
        sourceUrl: "https://www.youtube.com/playlist?list=PLabc_123",
        youtubePlaylistId: "PLabc_123",
      },
    });
  });

  it("rejects invalid resource and playlist inputs", () => {
    expect(() => normalizeTopicResourceLinkInput({}))
      .toThrow("TOPIC_RESOURCE_LINK_INVALID_RESOURCE");

    expect(() => normalizeTopicResourceLinkInput({
      resourceId: "resource-1",
      playlist: {
        sourceUrl: "https://example.com/not-youtube",
        youtubePlaylistId: "PLabc_123",
      },
    })).toThrow("TOPIC_RESOURCE_LINK_INVALID_PLAYLIST");

    expect(() => normalizeTopicResourceLinkInput({
      resourceId: "resource-1",
      playlist: {
        sourceUrl: "https://www.youtube.com/playlist?list=PLabc",
        youtubePlaylistId: "bad id spaces",
      },
    })).toThrow("TOPIC_RESOURCE_LINK_INVALID_PLAYLIST");
  });
});

describe("P1-09 schema and app-api contract", () => {
  const migration = readFileSync(
    new URL(
      "../supabase/migrations/20260820113000_create_topic_resource_links.sql",
      import.meta.url,
    ),
    "utf8",
  );

  const appApi = readFileSync(
    new URL("../supabase/functions/app-api/index.ts", import.meta.url),
    "utf8",
  );

  it("creates playlist registry and topic-resource links with ownership constraints", () => {
    expect(migration).toContain("create table public.youtube_playlists");
    expect(migration).toContain("create table public.topic_resource_links");
    expect(migration).toContain("youtube_playlist_id uuid null");
    expect(migration).toContain("references public.youtube_playlists");
    expect(migration).toContain("foreign key (youtube_playlist_id)");
    expect(migration).not.toContain("foreign key (youtube_playlist_id, user_id, exam_profile_id)");
    expect(migration).toContain("c.subject_id = r.subject_id");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain('create policy "Users own youtube playlists"');
    expect(migration).toContain('create policy "Users own topic resource links"');
  });

  it("keeps one primary resource link per topic through a database trigger", () => {
    expect(migration).toContain("enforce_single_primary_topic_resource");
    expect(migration).toContain("topic_resource_links_single_primary");
    expect(migration).toContain("set is_primary=false");
  });

  it("exposes scoped GET/PUT material link management", () => {
    const start = appApi.indexOf("const topicMaterialLinksMatch");
    const end = appApi.indexOf("const resourceProgressMatch", start);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const route = appApi.slice(start, end);
    expect(route).toContain('request.method === "GET"');
    expect(route).toContain('request.method === "PUT"');
    expect(route).toContain('from("topic_resource_links")');
    expect(route).toContain('from("youtube_playlists")');
    expect(route).toContain('eq("user_id", userId)');
    expect(route).toContain('eq("exam_profile_id", profile.id)');
    expect(route).toContain("resource.subject_id !== topic.subject_id");
  });

  it("does not call YouTube or mutate planning in P1-09", () => {
    const start = appApi.indexOf("const topicMaterialLinksMatch");
    const end = appApi.indexOf("const resourceProgressMatch", start);
    const route = appApi.slice(start, end);

    expect(route).not.toContain("fetch(");
    expect(route).not.toContain("googleapis");
    expect(route).not.toContain("playlistItems");
    expect(route).not.toContain("videos.list");
    expect(route).not.toContain("replace_manual_weekly_plan");
    expect(route).not.toContain("persist_weekly_plan");
    expect(route).not.toContain("recalculate");
    expect(route).not.toContain('from("resource_units").update');
  });
});