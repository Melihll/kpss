import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("MAT-001 YouTube title candidate behavior", () => {
  it("classifies UTF-8 Turkish titles deterministically without granting authority", () => {
    const dir = mkdtempSync(join(tmpdir(), "mat001-youtube-"));
    const input = join(dir, "input.json");
    const output = join(dir, "output.json");
    const script = resolve(process.cwd(), "scripts/mat001-youtube-title-candidates.mjs");

    const dataset = {
      target: { user_key: "user", profile_key: "profile" },
      topics: [
        { name: "Temel Kavramlar", curriculum_node_id: "topic-temel" },
        { name: "Sayılar", curriculum_node_id: "topic-sayilar" },
        { name: "Yüzde Problemleri", curriculum_node_id: "topic-yuzde" },
        { name: "Kâr-Zarar Problemleri", curriculum_node_id: "topic-kar-zarar" },
      ],
      videos: [
        { video_id: "v1", position: 1, title: "TEMEL KAVRAMLAR - İLYAS GÜNEŞ", duration_seconds: 100, watched_seconds: 0 },
        { video_id: "v2", position: 2, title: "BÖLME - İLYAS GÜNEŞ", duration_seconds: 100, watched_seconds: 0 },
        { video_id: "v3", position: 3, title: "YÜZDE - KAR - ZARAR PROBLEMLERİ", duration_seconds: 100, watched_seconds: 0 },
        { video_id: "v4", position: 4, title: "MATEMATİK KONU TEKRARI - 1", duration_seconds: 100, watched_seconds: 0 },
        { video_id: "v5", position: 5, title: "MATEMATİK TANITIM", duration_seconds: 100, watched_seconds: 0 },
        { video_id: "v6", position: 6, title: "İŞLEM - İLYAS GÜNEŞ", duration_seconds: 100, watched_seconds: 0 },
      ],
      physical_summary: {},
      physical_candidates: [],
    };

    const raw = { rows: [{ mat001_h2_dataset: dataset }] };
    writeFileSync(input, "\uFEFF" + JSON.stringify(raw), "utf8");

    const result = spawnSync(process.execPath, [script, input, output], {
      encoding: "utf8",
    });

    expect(result.status).toBe(0);

    const manifest = JSON.parse(readFileSync(output, "utf8"));
    expect(manifest.writesAllowed).toBe(false);

    const byPosition = new Map(
      manifest.videos.map((video: any) => [video.position, video]),
    );

    expect(byPosition.get(1)?.status).toBe("single_candidate");
    expect(byPosition.get(1)?.candidates[0]?.curriculumNodeId).toBe("topic-temel");

    expect(byPosition.get(2)?.status).toBe("single_candidate");
    expect(byPosition.get(2)?.candidates[0]?.curriculumNodeId).toBe("topic-sayilar");

    expect(byPosition.get(3)?.status).toBe("ambiguous");
    expect(byPosition.get(3)?.candidates).toHaveLength(2);

    expect(byPosition.get(4)?.status).toBe("segment_review_required");
    expect(byPosition.get(5)?.status).toBe("exclude_non_instructional");
    expect(byPosition.get(6)?.status).toBe("manual_review");

    rmSync(dir, { recursive: true, force: true });
  });
});
