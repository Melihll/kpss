import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("MAT-001 apply proposal safety", () => {
  const source = readFileSync(
    resolve(process.cwd(), "scripts/mat001-build-apply-proposal.mjs"),
    "utf8",
  );

  it("remains proposal-only", () => {
    expect(source).toContain('productionWritesAllowed: false');
    expect(source).toContain('requiresExplicitApproval: true');
    expect(source).not.toMatch(/insert\\s+into/i);
    expect(source).not.toContain("supabase db push");
  });

  it("does not fabricate physical workload", () => {
    expect(source).toContain('estimatedMinutes: null');
    expect(source).toContain('durationAuthority: "unresolved"');
    expect(source).toContain('plannerEligible: false');
    expect(source).toContain('pageCountOnlyPolicyAllowed: false');
  });

  it("keeps non-single YouTube mappings outside the apply set", () => {
    expect(source).toContain('video.status === "single_candidate"');
    expect(source).toContain('video.status !== "single_candidate"');
  });
});
