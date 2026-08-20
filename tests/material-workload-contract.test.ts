import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("P2-07 material workload contract", () => {
  const helper = readFileSync(
    new URL(
      "../supabase/functions/_shared/material-workload.ts",
      import.meta.url,
    ),
    "utf8",
  );

  const appApi = readFileSync(
    new URL(
      "../supabase/functions/app-api/index.ts",
      import.meta.url,
    ),
    "utf8",
  );

  it("keeps material workload loading read-only", () => {
    expect(helper).toContain('from("resource_progress")');
    expect(helper).toContain('from("topic_resource_links")');
    expect(helper).toContain('from("youtube_playlist_videos")');
    expect(helper).toContain('from("youtube_video_progress")');

    expect(helper).not.toContain(".insert(");
    expect(helper).not.toContain(".update(");
    expect(helper).not.toContain(".upsert(");
    expect(helper).not.toContain(".delete(");
    expect(helper).not.toContain(".rpc(");
  });

  it("does not introduce a global minutes-per-page magic constant", () => {
    expect(helper).not.toMatch(
      /minutesPerPage|pagesPerMinute|readingRate|readingSpeed/,
    );
    expect(helper).toContain(
      "plannedMinutes * (remainingPages / totalPages)",
    );
  });

  it("exposes workload separately from the existing P48 finish forecast", () => {
    const start = appApi.indexOf(
      "async function loadP48Roadmap",
    );
    const end = appApi.indexOf(
      "async function generateP48Week",
      start,
    );

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const body = appApi.slice(start, end);

    expect(body).toContain("loadMaterialWorkloads");
    expect(body).toContain("materialWorkloads,");
    expect(body).toContain("forecastP48Resources");
  });

  it("does not mutate planner/task/resource state", () => {
    expect(helper).not.toContain('from("tasks")');
    expect(helper).not.toContain('from("weekly_plans")');
    expect(helper).not.toContain('from("resource_units")');
  });
});