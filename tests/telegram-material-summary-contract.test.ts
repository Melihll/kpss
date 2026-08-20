import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("P1-15 Telegram material summary contract", () => {
  const webhook = readFileSync(
    new URL("../supabase/functions/telegram-webhook/index.ts", import.meta.url),
    "utf8",
  );
  const presentation = readFileSync(
    new URL("../supabase/functions/_shared/telegram-presentation.ts", import.meta.url),
    "utf8",
  );
  const helper = readFileSync(
    new URL("../supabase/functions/_shared/telegram-material-summary.ts", import.meta.url),
    "utf8",
  );

  it("enriches /bugun before rendering the existing daily plain-text message", () => {
    expect(webhook).toContain("loadTelegramTaskMaterialSummaries");
    expect(webhook).toContain("summaryWithMaterials");
    expect(webhook).toContain("formatDailyCoachMessage(summaryWithMaterials)");
    expect(webhook).toContain("respond(message, buttons)");
    expect(webhook).toContain("TELEGRAM_MATERIAL_SUMMARY_FAILED");
  });

  it("shows material summary beneath the existing simple task line", () => {
    expect(presentation).toContain("task.materialSummary");
    expect(presentation).toContain("baseLine");
  });

  it("reads canonical resource, page and video progress with explicit owner scope", () => {
    expect(helper).toContain('from("tasks")');
    expect(helper).toContain("resource_sections(resource_id)");
    expect(helper).toContain("task_resource_units(resource_units(resource_id))");
    expect(helper).toContain('from("resource_progress")');
    expect(helper).toContain('from("topic_resource_links")');
    expect(helper).toContain('from("youtube_playlist_videos")');
    expect(helper).toContain('from("youtube_video_progress")');

    const ownerScopeCount = (helper.match(/\.eq\("user_id", userId\)/g) ?? []).length;
    const profileScopeCount = (helper.match(/\.eq\("exam_profile_id", examProfileId\)/g) ?? []).length;
    expect(ownerScopeCount).toBeGreaterThanOrEqual(5);
    expect(profileScopeCount).toBeGreaterThanOrEqual(5);
  });

  it("is read-only and does not mutate planning, tasks, sessions or resource units", () => {
    expect(helper).not.toContain(".insert(");
    expect(helper).not.toContain(".update(");
    expect(helper).not.toContain(".upsert(");
    expect(helper).not.toContain(".delete(");
    expect(helper).not.toContain(".rpc(");
    expect(helper).not.toContain("recalculate");
    expect(helper).not.toContain("resource_unit_progress");
    expect(helper).not.toContain("study_sessions");
    expect(helper).not.toContain("weekly_plans");
  });
});