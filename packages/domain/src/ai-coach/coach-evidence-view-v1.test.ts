import { describe, expect, it } from "vitest";
import {
  buildCoachContextV1,
  COACH_EVIDENCE_DETAIL_KINDS_V1,
  COACH_EVIDENCE_DETAIL_REQUEST_V1_VERSION,
  COACH_EVIDENCE_DETAIL_V1_LIMITS,
  COACH_EVIDENCE_SCOPE_CAPABILITY_V1,
  COACH_EVIDENCE_SCOPES_V1,
  COACH_EVIDENCE_VIEW_V1_LIMITS,
  projectCoachEvidenceViewV1,
  resolveCoachEvidenceDetailV1,
  type CoachEvidenceScopeV1,
  type CoachEvidenceSelectionV1,
} from "./index";
import {
  coachContextV1Fixture,
  COACH_CONTEXT_V1_FIXTURE_KINDS,
} from "./fixtures/coach-context-v1";

const SUBJECT_ID = "subject-law";

function selection(scope: CoachEvidenceScopeV1): CoachEvidenceSelectionV1 {
  return {
    scope,
    capability: COACH_EVIDENCE_SCOPE_CAPABILITY_V1[scope],
    ...(scope === "subject_progress" ? { subjectId: SUBJECT_ID } : {}),
  };
}

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

describe("CoachEvidenceViewV1 6B.3 contract", () => {
  it("projects every A-H fixture and scope byte-equivalently", () => {
    for (const fixtureKind of COACH_CONTEXT_V1_FIXTURE_KINDS) {
      const context = buildCoachContextV1(coachContextV1Fixture(fixtureKind));
      for (const scope of COACH_EVIDENCE_SCOPES_V1) {
        const first = projectCoachEvidenceViewV1(context, selection(scope));
        const second = projectCoachEvidenceViewV1(context, selection(scope));
        expect(JSON.stringify(second), `${fixtureKind}:${scope}`).toBe(JSON.stringify(first));
        expect(byteLength(first)).toBeLessThanOrEqual(COACH_EVIDENCE_VIEW_V1_LIMITS.serializedBytes);
        expect(first.authority).toMatchObject({
          mode: "evidence_only_read_only",
          dbWritesAllowed: false,
          arbitraryQueryAllowed: false,
          newTruthCalculationAllowed: false,
          workloadRecalculationAllowed: false,
          plannerPreviewRecomputationAllowed: false,
          plannerConfirmationAllowed: false,
          plannerApplyAllowed: false,
          llmCallsAllowed: false,
          providerCallsAllowed: false,
        });
      }
    }
  });

  it("allows only the documented top-level evidence sections for each scope", () => {
    const context = buildCoachContextV1(coachContextV1Fixture("healthy_normal_week"));
    const expected = {
      today_explain: ["canonicalWork", "identity", "signalCandidates", "today", "week"],
      week_progress: ["capacity", "recentProgress", "signalCandidates", "subjects", "week"],
      subject_progress: ["canonicalWork", "recentProgress", "signalCandidates", "subjects", "week"],
      canonical_work: ["canonicalWork"],
      capacity_status: ["capacity", "today", "week"],
      planner_explanation: ["planner"],
      general_status: ["canonicalWork", "capacity", "identity", "signalCandidates", "subjects", "today", "week"],
      proactive_candidate: ["canonicalWork", "capacity", "signalCandidates", "subjects", "today", "week"],
    } satisfies Record<CoachEvidenceScopeV1, readonly string[]>;

    for (const scope of COACH_EVIDENCE_SCOPES_V1) {
      const view = projectCoachEvidenceViewV1(context, selection(scope));
      expect(Object.keys(view.evidence).sort(), scope).toEqual(expected[scope]);
    }

    const today = projectCoachEvidenceViewV1(context, selection("today_explain"));
    expect(today.evidence.week?.value).not.toHaveProperty("tasks");
    expect(today.evidence).not.toHaveProperty("materials");
    expect(today.evidence).not.toHaveProperty("planner");
    const planner = projectCoachEvidenceViewV1(context, selection("planner_explanation"));
    expect(planner.evidence).not.toHaveProperty("week");
    expect(planner.evidence).not.toHaveProperty("capacity");
    expect(planner.evidence).not.toHaveProperty("recentProgress");
    const subject = projectCoachEvidenceViewV1(context, selection("subject_progress"));
    expect(subject.evidence.canonicalWork?.workload?.value).toEqual({ minutesBySubject: { "subject-law": 30 } });
    expect(JSON.stringify(subject)).not.toContain("subject-finance");
  });

  it("exposes only bounded scope-appropriate signal candidates", () => {
    const context = buildCoachContextV1(coachContextV1Fixture("healthy_normal_week"));
    const today = projectCoachEvidenceViewV1(context, selection("today_explain"));
    expect(today.evidence.signalCandidates?.every((candidate) => candidate.signalType.startsWith("today_"))).toBe(true);
    expect(today.collections.find((item) => item.path === "signalCandidates")?.limit).toBe(6);
    const week = projectCoachEvidenceViewV1(context, selection("week_progress"));
    expect(week.collections.find((item) => item.path === "recentProgress.taskEvents")?.limit).toBe(6);
    expect(week.collections.find((item) => item.path === "signalCandidates")?.limit).toBe(2);

    const subject = projectCoachEvidenceViewV1(context, selection("subject_progress"));
    expect(subject.evidence.signalCandidates?.every((candidate) => candidate.subjectId === SUBJECT_ID)).toBe(true);
    const proactive = projectCoachEvidenceViewV1(context, selection("proactive_candidate"));
    expect(proactive.evidence.signalCandidates?.every((candidate) => candidate.eligibility.proactiveCandidate)).toBe(true);
    expect(proactive.evidence).not.toHaveProperty("signalInputs");

    for (const scope of ["canonical_work", "capacity_status", "planner_explanation"] as const) {
      expect(projectCoachEvidenceViewV1(context, selection(scope)).evidence).not.toHaveProperty("signalCandidates");
    }
  });

  it("preserves unknown, stale and PLN-002 uncertainty without upgrading facts", () => {
    const missing = projectCoachEvidenceViewV1(
      buildCoachContextV1(coachContextV1Fixture("missing_material_workload")),
      selection("canonical_work"),
    );
    expect(missing.evidence.canonicalWork?.next?.availability).toBe("unknown");
    expect(missing.evidence.canonicalWork?.workload?.availability).toBe("unknown");
    expect(missing.evidence.canonicalWork?.materials?.value?.[0]?.workload.availability).toBe("unknown");
    expect(missing.unknowns.map((item) => item.reason)).toEqual(expect.arrayContaining([
      "canonical_next_work_requires_known_workload",
      "canonical_workload_summary_partial",
      "pace_evidence_unavailable",
    ]));

    const stale = projectCoachEvidenceViewV1(
      buildCoachContextV1(coachContextV1Fixture("stale_partial_fact")),
      selection("capacity_status"),
    );
    expect(stale.evidence.capacity).toMatchObject({
      availability: "stale",
      unknownReason: "capacity_snapshot_expired",
      freshness: { state: "stale", asOf: "2026-09-09T09:00:00.000Z" },
    });

    const ambiguous = projectCoachEvidenceViewV1(
      buildCoachContextV1(coachContextV1Fixture("pln002_ambiguity")),
      selection("week_progress"),
    );
    expect(ambiguous.evidence.week?.value?.studyIntentCoverage).toBe("partial");
    expect(ambiguous.evidence.week?.value?.progressPosition).toMatchObject({
      availability: "unknown",
      value: null,
      unknownReason: "pln002_intent_coverage_insufficient",
    });
  });

  it("retains provenance and freshness for every exposed fact", () => {
    const context = buildCoachContextV1(coachContextV1Fixture("healthy_normal_week"));
    const view = projectCoachEvidenceViewV1(context, selection("general_status"));
    expect(view.asOf).toBe(context.generatedAt);
    expect(view.provenance.length).toBeGreaterThan(0);
    expect(view.evidence.today?.provenance.length).toBeGreaterThan(0);
    expect(view.evidence.week?.freshness).toEqual(context.week.freshness);
    expect(view.evidence.canonicalWork?.next?.provenance).toEqual(context.nextWork.provenance);
  });

  it("enforces explicit collection limits without changing the source context", () => {
    const input = structuredClone(coachContextV1Fixture("healthy_normal_week")) as any;
    const seed = input.today.value.tasks[0];
    const tasks = Array.from({ length: 64 }, (_, index) => ({
      ...seed,
      taskId: `bounded-task-${String(index).padStart(2, "0")}`,
      title: `Bounded task ${index}`,
      plannedDate: index < 24 ? input.currentDate : "2026-09-11",
    }));
    input.today.value.tasks = tasks.slice(0, 24);
    input.week.value.tasks = tasks;
    const context = buildCoachContextV1(input);
    const before = JSON.stringify(context);
    const view = projectCoachEvidenceViewV1(context, selection("today_explain"));
    expect(view.evidence.today?.value?.tasks).toHaveLength(8);
    expect(view.collections).toContainEqual({
      path: "today.tasks",
      availableCount: 24,
      returnedCount: 8,
      limit: 8,
      truncated: true,
    });
    const detail = resolveCoachEvidenceDetailV1(context, {
      version: COACH_EVIDENCE_DETAIL_REQUEST_V1_VERSION,
      kind: "week_tasks",
      userId: context.userId,
      examProfileId: context.examProfileId,
    });
    expect(detail.payload.value).toHaveLength(COACH_EVIDENCE_DETAIL_V1_LIMITS.week_tasks);
    expect(detail.collection).toMatchObject({ availableCount: 64, returnedCount: 24, truncated: true });
    expect(JSON.stringify(context)).toBe(before);
  });

  it("supports only bounded detail kinds and fails closed across user/profile/subject scope", () => {
    const context = buildCoachContextV1(coachContextV1Fixture("healthy_normal_week"));
    for (const kind of COACH_EVIDENCE_DETAIL_KINDS_V1) {
      const request = {
        version: COACH_EVIDENCE_DETAIL_REQUEST_V1_VERSION,
        kind,
        userId: context.userId,
        examProfileId: context.examProfileId,
        ...(["subject_tasks", "subject_material_progress"].includes(kind) ? { subjectId: SUBJECT_ID } : {}),
      } as const;
      const first = resolveCoachEvidenceDetailV1(context, request);
      const second = resolveCoachEvidenceDetailV1(context, request);
      expect(JSON.stringify(second)).toBe(JSON.stringify(first));
      expect(byteLength(first)).toBeLessThanOrEqual(COACH_EVIDENCE_DETAIL_V1_LIMITS.serializedBytes);
      expect(first.provenance.length).toBeGreaterThan(0);
      expect(JSON.stringify(first)).not.toMatch(/created_at|updated_at|description|\"note\"|user_id|exam_profile_id|select\*|sql/i);
    }

    const base = {
      version: COACH_EVIDENCE_DETAIL_REQUEST_V1_VERSION,
      kind: "week_tasks" as const,
      userId: context.userId,
      examProfileId: context.examProfileId,
    };
    expect(() => resolveCoachEvidenceDetailV1(context, { ...base, userId: "another-user" })).toThrow("COACH_EVIDENCE_DETAIL_USER_SCOPE_MISMATCH");
    expect(() => resolveCoachEvidenceDetailV1(context, { ...base, examProfileId: "another-profile" })).toThrow("COACH_EVIDENCE_DETAIL_PROFILE_SCOPE_MISMATCH");
    expect(() => resolveCoachEvidenceDetailV1(context, { ...base, kind: "subject_tasks", subjectId: "another-subject" })).toThrow("COACH_EVIDENCE_DETAIL_SUBJECT_OUT_OF_PROFILE");
    expect(() => resolveCoachEvidenceDetailV1(context, { ...base, kind: "arbitrary_query" } as any)).toThrow("COACH_EVIDENCE_DETAIL_KIND_UNSUPPORTED");
  });

  it("rejects unsupported scope/capability combinations and subject selectors", () => {
    const context = buildCoachContextV1(coachContextV1Fixture("healthy_normal_week"));
    expect(() => projectCoachEvidenceViewV1(context, {
      scope: "today_explain",
      capability: "guide",
    })).toThrow("COACH_EVIDENCE_SCOPE_CAPABILITY_MISMATCH");
    expect(() => projectCoachEvidenceViewV1(context, {
      scope: "subject_progress",
      capability: "progress_analysis",
    })).toThrow("COACH_EVIDENCE_SUBJECT_REQUIRED");
    expect(() => projectCoachEvidenceViewV1(context, {
      scope: "today_explain",
      capability: "explain",
      subjectId: SUBJECT_ID,
    })).toThrow("COACH_EVIDENCE_SUBJECT_NOT_ALLOWED_FOR_SCOPE");
  });

  it("does not expose raw database fields or an arbitrary query contract", () => {
    const context = buildCoachContextV1(coachContextV1Fixture("healthy_normal_week"));
    for (const scope of COACH_EVIDENCE_SCOPES_V1) {
      const serialized = JSON.stringify(projectCoachEvidenceViewV1(context, selection(scope)));
      expect(serialized).not.toMatch(/created_at|updated_at|description|\"note\"|user_id|exam_profile_id|select\*|sql/i);
    }
  });
});
