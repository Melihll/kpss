import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("W2 runtime isolation", () => {
  const appApi = read("supabase/functions/app-api/index.ts");
  const telegram = read("supabase/functions/telegram-webhook/index.ts");
  const loader = read("supabase/functions/_shared/canonical-workload-evidence.ts");
  const shadow = read("supabase/functions/_shared/canonical-material-shadow.ts");
  const runner = read("scripts/run-canonical-workload-shadow.mjs");

  it("does not activate physical pace capture in app-api or Telegram", () => {
    for (const runtime of [appApi, telegram]) {
      expect(runtime).not.toContain("start_physical_study_session");
      expect(runtime).not.toContain("finish_physical_study_session");
      expect(runtime).not.toContain("physical_pace_evidence");
    }
  });

  it("keeps the new evidence loader capability explicit and read-only", () => {
    expect(loader).toContain("physicalPaceEvidenceAvailable");
    expect(loader).toContain('.from("physical_pace_evidence")');
    expect(loader).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/);
    expect(shadow).not.toContain("physicalPaceEvidenceAvailable");
  });

  it("keeps the production runner read-only while probing migration absence", () => {
    expect(runner).toContain("physical_pace_evidence");
    expect(runner).toContain("migrationCandidateDeployed");
    expect(runner).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/);
  });
});
