import { describe, expect, it } from "vitest";
import { estimateCanonicalMaterialWorkload } from "../packages/domain/src/planning/canonical-workload";
import { deriveCanonicalWorkloadEvidence } from "../supabase/functions/_shared/canonical-workload-evidence";

const material = {
  id: "physical:u1", sourceId: "u1", sourceKind: "physical" as const,
  resourceId: "r1", curriculumNodeId: "n1", unitType: "page_range" as const,
  title: "Pages", sortOrder: 1, pageStart: 1, pageEnd: 10,
  durationSeconds: null, watchedSeconds: null, lastPositionSeconds: null,
  mappingId: null, segmentStartSeconds: null, segmentEndSeconds: null,
  estimatedMinutes: null, progressState: "not_started" as const,
  completedThroughPage: null, completedAt: null, mappingStatus: "validated" as const,
  mappingProvenance: "reviewed_catalog" as const, isActive: true, plannerEligible: false,
};

function evidenceRows() {
  return {
    resources: [{ id: "r1", subject_id: "s1" }],
    units: [{ id: "u1", resource_id: "r1", unit_type: "reading", page_start: 1, page_end: 10 }],
    studySessions: [], testResults: [], resourceProgress: [], tasks: [], taskResourceUnits: [], youtubeProgress: [],
    physicalPaceEvidence: Array.from({ length: 3 }, (_, index) => ({
      id: `p${index}`, study_session_id: `session${index}`,
      resource_id: "r1", resource_unit_id: "u1", subject_id: "s1",
      curriculum_node_id: "n1", material_type: "page_range", progress_unit: "page",
      start_page_boundary: 0, end_page_boundary: 10, progressed_pages: 10,
      actual_active_seconds: 1200, activity_started_at: `2026-08-0${index + 1}T09:00:00Z`,
      activity_ended_at: `2026-08-0${index + 1}T09:20:00Z`, evidence_status: "accepted",
      evidence_provenance: "atomic_physical_finish",
    })),
  };
}

describe("W2 physical pace evidence ingestion", () => {
  it("feeds exact-resource W1 calibration with actual seconds and exact identity", () => {
    const evidence = deriveCanonicalWorkloadEvidence("user", "profile", evidenceRows());
    const accepted = evidence.filter((row) => row.sourceKind === "physical_pace_evidence");
    expect(accepted).toHaveLength(3);
    expect(accepted[0]).toMatchObject({
      resourceId: "r1", curriculumNodeId: "n1", materialType: "page_range",
      actualMinutes: 20, progressAmount: 10,
      evidenceQuality: ["actual_elapsed_time", "actual_progress_delta"],
    });
    const result = estimateCanonicalMaterialWorkload({
      userId: "user", examProfileId: "profile", subjectId: "s1",
      material, evidence,
    });
    expect(result).toMatchObject({
      authority: "calibrated", confidence: "medium", plannerEligible: true,
      estimatedMinutes: 20,
      evidence: { scope: "resource_material_type", sampleCount: 3 },
    });
  });

  it("keeps a synthetic span blocked below the unchanged W1 confidence threshold", () => {
    const rows = evidenceRows();
    rows.physicalPaceEvidence = rows.physicalPaceEvidence.slice(0, 1);
    const evidence = deriveCanonicalWorkloadEvidence("user", "profile", rows);
    const result = estimateCanonicalMaterialWorkload({
      userId: "user", examProfileId: "profile", subjectId: "s1",
      material: { ...material, id: "physical:section:sec1:gap:1-10" }, evidence,
    });
    expect(result).toMatchObject({
      authority: "unknown", confidence: "low", plannerEligible: false,
      estimatedMinutes: null,
      reason: "pace_confidence_insufficient",
    });
  });

  it("does not let question/test evidence calibrate reading/content material", () => {
    const rows = evidenceRows();
    rows.physicalPaceEvidence = rows.physicalPaceEvidence.map((row) => ({ ...row, material_type: "test" }));
    const evidence = deriveCanonicalWorkloadEvidence("user", "profile", rows);
    const result = estimateCanonicalMaterialWorkload({
      userId: "user", examProfileId: "profile", subjectId: "s1", material, evidence,
    });
    expect(result).toMatchObject({ authority: "unknown", plannerEligible: false });
  });
});
