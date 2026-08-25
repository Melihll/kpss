import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("MAT-001 canonical workload shadow safety", () => {
  const loader = readFileSync(
    resolve(process.cwd(), "supabase/functions/_shared/canonical-workload-evidence.ts"),
    "utf8",
  );
  const shadow = readFileSync(
    resolve(process.cwd(), "supabase/functions/_shared/canonical-material-shadow.ts"),
    "utf8",
  );
  const appApi = readFileSync(
    resolve(process.cwd(), "supabase/functions/app-api/index.ts"),
    "utf8",
  );
  const runner = readFileSync(
    resolve(process.cwd(), "scripts/run-canonical-workload-shadow.mjs"),
    "utf8",
  );

  it("keeps the production evidence loader read-only", () => {
    expect(loader).toContain('.from("study_sessions")');
    expect(loader).toContain('.from("test_results")');
    expect(loader).toContain('.from("resource_unit_progress")');
    expect(loader).toContain('.from("youtube_video_progress")');
    expect(loader).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/);
  });

  it("exposes canonical readiness metrics in shadow tooling", () => {
    expect(shadow).toContain("summarizeCanonicalWorkload");
    expect(shadow).toContain("loadCanonicalWorkloadEvidence");
  });

  it("leaves app-api canonical planning inactive", () => {
    expect(appApi).not.toContain("loadCanonicalWorkloadReadiness");
    expect(appApi).not.toContain("canonical-workload-evidence");
  });

  it("keeps the production shadow runner read-only and guarded", () => {
    expect(runner).toContain('mode: "PRODUCTION_READ_ONLY_SHADOW"');
    expect(runner).toContain("safetyBefore");
    expect(runner).toContain("safetyAfter");
    expect(runner).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/);
  });
});
