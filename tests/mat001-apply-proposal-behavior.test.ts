import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("MAT-001 apply proposal behavior", () => {
  it("separates authoritative content from unresolved workload", () => {
    const dir = mkdtempSync(join(tmpdir(), "mat001-proposal-"));
    const input = join(dir, "input.json");
    const output = join(dir, "output.json");
    const script = resolve(process.cwd(), "scripts/mat001-build-apply-proposal.mjs");

    const manifest = {
      writesAllowed: false,
      videos: [
        {
          videoId: "v1",
          position: 1,
          title: "BÖLME",
          durationSeconds: 100,
          status: "single_candidate",
          reason: "deterministic_title_rule",
          candidates: [
            { name: "Sayılar", curriculumNodeId: "topic-1" },
          ],
        },
        {
          videoId: "v2",
          position: 2,
          title: "KONU TEKRARI",
          durationSeconds: 100,
          status: "segment_review_required",
          reason: "multi_topic_review_video",
          candidates: [],
        },
      ],
      physicalCandidates: [
        {
          resource_id: "r1",
          resource_name: "Book",
          section_id: "s1",
          section_name: "Section",
          curriculum_node_id: "topic-1",
          curriculum_topic: "Sayılar",
          page_start: 10,
          page_end: 20,
          source_unit_type: "konu",
          planning_role: "curriculum",
          basis: "verified_range",
          confidence: "high",
          evidence: "fixture",
          physical_range: "s.10–20",
          candidate_status: "exact_unit_candidate",
        },
        {
          resource_id: "r2",
          resource_name: "Book 2",
          section_id: "s2",
          section_name: "Unknown",
          curriculum_node_id: null,
          curriculum_topic: null,
          page_start: 1,
          page_end: 5,
          candidate_status: "blocked_unmapped_topic",
        },
      ],
    };

    writeFileSync(input, JSON.stringify(manifest), "utf8");

    const result = spawnSync(process.execPath, [script, input, output], {
      encoding: "utf8",
    });

    expect(result.status).toBe(0);

    const proposal = JSON.parse(readFileSync(output, "utf8"));

    expect(proposal.productionWritesAllowed).toBe(false);
    expect(proposal.acceptance.youtubeProposedCount).toBe(1);
    expect(proposal.acceptance.youtubeHeldCount).toBe(1);
    expect(proposal.acceptance.physicalStructuralCount).toBe(1);
    expect(proposal.acceptance.physicalHeldCount).toBe(1);
    expect(proposal.acceptance.fabricatedDurationCount).toBe(0);

    expect(
      proposal.physical.proposedStructuralUnits[0].estimatedMinutes,
    ).toBeNull();

    expect(
      proposal.physical.proposedStructuralUnits[0].plannerEligible,
    ).toBe(false);

    rmSync(dir, { recursive: true, force: true });
  });
});
