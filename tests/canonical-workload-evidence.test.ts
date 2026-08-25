import { describe, expect, it } from "vitest";
import { deriveCanonicalWorkloadEvidence } from "../supabase/functions/_shared/canonical-workload-evidence";

const rows = (overrides: Record<string, unknown> = {}) => ({
  resources: [{ id: "r1", subject_id: "s1" }],
  units: [{ id: "u1", resource_id: "r1", unit_type: "test", page_start: 10, page_end: 19 }],
  studySessions: [],
  testResults: [],
  resourceProgress: [],
  tasks: [],
  taskResourceUnits: [],
  youtubeProgress: [],
  ...overrides,
});

describe("canonical production workload evidence classification", () => {
  it("accepts only the atomically matching first exact test completion as pace evidence", () => {
    const evidence = deriveCanonicalWorkloadEvidence("user", "profile", rows({
      testResults: [{
        id: "tr1", subject_id: "s1", curriculum_node_id: "n1", resource_id: "r1",
        resource_unit_id: "u1", duration_minutes: 30, completed_at: "2026-08-01T10:00:00Z", entry_source: "web",
      }],
      resourceProgress: [{
        resource_unit_id: "u1", status: "completed", completed_at: "2026-08-01T10:00:00Z",
        completed_through_page: null, updated_at: "2026-08-01T10:00:00Z",
      }],
    }));

    expect(evidence.find((item) => item.id === "test_result:tr1")).toMatchObject({
      actualMinutes: 30,
      progressAmount: 10,
      evidenceQuality: ["actual_elapsed_time", "actual_progress_delta"],
      provenance: "record_test_result:first_completion",
    });
  });

  it("rejects a later attempt as a causal progress delta", () => {
    const evidence = deriveCanonicalWorkloadEvidence("user", "profile", rows({
      testResults: [{
        id: "tr2", subject_id: "s1", curriculum_node_id: "n1", resource_id: "r1",
        resource_unit_id: "u1", duration_minutes: 20, completed_at: "2026-08-02T10:00:00Z", entry_source: "web",
      }],
      resourceProgress: [{
        resource_unit_id: "u1", status: "completed", completed_at: "2026-08-01T10:00:00Z",
        completed_through_page: null, updated_at: "2026-08-02T10:00:00Z",
      }],
    }));

    expect(evidence.find((item) => item.id === "test_result:tr2")).toMatchObject({
      actualMinutes: 20,
      progressAmount: null,
      evidenceQuality: ["actual_elapsed_time", "unreliable"],
    });
  });

  it("keeps session time and progress-only records separate", () => {
    const evidence = deriveCanonicalWorkloadEvidence("user", "profile", rows({
      studySessions: [{
        id: "ss1", subject_id: "s1", curriculum_node_id: "n1", resource_id: "r1",
        resource_unit_id: "u1", duration_minutes: 25, started_at: "2026-08-01T09:00:00Z",
        ended_at: "2026-08-01T09:25:00Z", status: "completed", entry_source: "web",
      }],
      resourceProgress: [{
        resource_unit_id: "u1", status: "completed", completed_at: "2026-08-01T09:25:00Z",
        completed_through_page: null, updated_at: "2026-08-01T09:25:00Z",
      }],
    }));

    expect(evidence.find((item) => item.id === "study_session:ss1")?.evidenceQuality)
      .toEqual(["actual_elapsed_time", "unavailable"]);
    expect(evidence.find((item) => item.id === "resource_unit_progress:u1")?.evidenceQuality)
      .toEqual(["actual_progress_delta", "unavailable"]);
  });
});
