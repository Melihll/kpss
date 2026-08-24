import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("MAT-001 YouTube candidate mapper safety", () => {
  const source = readFileSync(
    resolve(process.cwd(), "scripts/mat001-youtube-title-candidates.mjs"),
    "utf8",
  );

  it("is candidate-only and contains no production mutation", () => {
    expect(source).toContain('writesAllowed: false');
    expect(source).not.toMatch(/insert\\s+into/i);
    expect(source).not.toMatch(/update\\s+public\\./i);
    expect(source).not.toContain("supabase db push");
    expect(source).toContain('replace(/^\\uFEFF/, "")');
  });

  it("keeps multi-topic review videos out of exact mapping", () => {
    expect(source).toContain('segment_review_required');
    expect(source).toContain('multi_topic_review_video');
  });

  it("does not force combined percentage and profit-loss videos into one topic", () => {
    expect(source).toContain('"Yüzde Problemleri", "Kâr-Zarar Problemleri"');
    expect(source).toContain('combined_topic_title');
  });

  it("excludes intro videos from planner authority", () => {
    expect(source).toContain('exclude_non_instructional');
  });
});
