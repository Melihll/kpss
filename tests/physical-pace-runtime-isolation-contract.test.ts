import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("W3 runtime isolation", () => {
  const appApi = read("supabase/functions/app-api/index.ts");
  const telegram = read("supabase/functions/telegram-webhook/index.ts");
  const lifecycle = read("supabase/functions/_shared/physical-study-lifecycle.ts");
  const loader = read("supabase/functions/_shared/canonical-workload-evidence.ts");
  const shadow = read("supabase/functions/_shared/canonical-material-shadow.ts");
  const runner = read("scripts/run-canonical-workload-shadow.mjs");

  it("gates app-api capture off by default while Telegram remains legacy/UI-blocked", () => {
    expect(appApi).toContain("PhysicalStudyLifecycleService");
    expect(appApi).toContain("PHYSICAL_PACE_CAPTURE_V1_PROFILE_IDS");
    expect(lifecycle).toContain("start_physical_study_session");
    expect(lifecycle).toContain("finish_physical_study_session");
    expect(telegram).not.toContain("start_physical_study_session");
    expect(telegram).not.toContain("finish_physical_study_session");
    expect(telegram).toContain("telegram_start_study_session");
    expect(telegram).toContain("telegram_finish_study_session");
  });

  it("keeps the new evidence loader capability explicit and read-only", () => {
    expect(loader).toContain("physicalPaceEvidenceAvailable");
    expect(loader).toContain('.from("physical_pace_evidence")');
    expect(loader).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/);
    expect(shadow).toContain("physicalPaceEvidenceAvailable");
  });

  it("keeps the production runner read-only and shadow evidence separately gated", () => {
    expect(runner).toContain("physical_pace_evidence");
    expect(runner).toContain("migrationCandidateDeployed");
    expect(runner).toContain("PHYSICAL_PACE_EVIDENCE_SHADOW_V1");
    expect(runner).toContain("diagnosticPhysicalEvidenceBypass: true");
    expect(runner).toContain("canonicalRuntimeActive: false");
    expect(runner).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/);
  });

  it("keeps capture, diagnostic evidence reading, and planner activation independent", () => {
    expect(appApi).toContain("PHYSICAL_PACE_CAPTURE_V1_PROFILE_IDS");
    expect(appApi).not.toContain("loadCanonicalWorkloadReadiness");
    expect(runner).toContain("physicalPaceEvidenceAvailable: true");
    expect(runner).toContain("physicalPaceEvidenceShadowEnabled");
    expect(runner).toContain("canonicalRuntimeActive: false");
  });
});
