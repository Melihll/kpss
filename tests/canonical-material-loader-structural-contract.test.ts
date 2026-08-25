import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("canonical material loader structural coverage", () => {
  const source = readFileSync(
    resolve(
      process.cwd(),
      "supabase/functions/_shared/canonical-material-loader.ts",
    ),
    "utf8",
  );

  it("loads complete section inventory and derives structural gaps", () => {
    expect(source).toContain('.from("resource_sections")');
    expect(source).toContain('.in("resource_id", resourceIds)');
    expect(source).toContain("derivePhysicalStructuralCoverage");
    expect(source).toContain("adaptPhysicalStructuralSpan");
  });

  it("remains read-only", () => {
    expect(source).not.toMatch(/\.insert\s*\(/);
    expect(source).not.toMatch(/\.update\s*\(/);
    expect(source).not.toMatch(/\.delete\s*\(/);
    expect(source).not.toMatch(/\.upsert\s*\(/);
  });
});
