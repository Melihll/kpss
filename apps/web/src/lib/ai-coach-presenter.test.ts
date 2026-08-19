import { describe, expect, it } from "vitest";
import type { AiCoachPlanPreviewResponse } from "./ai-coach-api";
import { presentAiCoachPreview } from "./ai-coach-presenter";

type ValidPreviewResponse = Extract<AiCoachPlanPreviewResponse, { status: "VALID" }>;

function readyResponse(): ValidPreviewResponse {
  return {
    status: "VALID",
    interpretation: {
      intent: "CAPACITY_CHANGE",
      confidence: 0.9,
      needsClarification: false,
      clarificationQuestion: null,
      effectiveDate: "2026-08-20",
      subjectHint: null,
      curriculumHint: null,
      reasonCode: "capacity increase",
      evidence: [{
        type: "CAPACITY_CHANGE_REQUEST",
        confidence: 0.9,
        effectiveDate: "2026-08-20",
        subjectHint: null,
        curriculumHint: null,
        reasonCode: "capacity increase",
        direction: "INCREASE",
        deltaMinutes: 60,
        targetMinutes: null,
      }],
    },
    mapping: {
      action: "PLANNING_TRIGGER_CANDIDATE",
      planningTriggerCandidate: "CAPACITY_INCREASE",
      effectiveDate: "2026-08-20",
      evidence: [],
      reasonCodes: ["AI_CAPACITY_EVIDENCE_VALIDATED"],
      requiresDeterministicReview: true,
      planMutationAllowed: false,
    },
    shadowPreview: {
      previewOnly: true,
      snapshotId: "snapshot-1",
      snapshotHash: "hash-1",
      decision: "READY_TO_APPLY",
      changedTaskCount: 2,
      validationValid: true,
      applyRecommended: true,
      changes: [
        {
          changeType: "MOVE",
          taskId: "task-1",
          subjectName: "Matematik",
          title: "Temel Kavramlar III",
          resourceName: "2026 KPSS Matematik Soru Bankası",
          remainingMinutes: 60,
          fromDate: "2026-08-20",
          toDate: "2026-08-21",
          reasonCodes: ["LOCAL_DAILY_OVERLOAD_REPAIR"],
        },
        {
          changeType: "BACKLOG",
          taskId: "task-2",
          subjectName: "Maliye",
          title: "Optimus Maliye — Konu Anlatımlı",
          resourceName: "Optimus Maliye",
          remainingMinutes: 45,
          fromDate: "2026-08-22",
          toDate: null,
          reasonCodes: ["LOCAL_PAST_DUE_REPAIR"],
        },
      ],
      changeDetailsComplete: true,
      evaluation: {
        currentPlanFeasible: false,
        issueCodes: ["PAST_DUE_REMAINING_WORK"],
        availableMinutes: 2580,
        planningBudgetMinutes: 1800,
        reserveMinutes: 210,
        capacity: {
          grossMinutes: 2580,
          reserveMinutes: 210,
          planningMinutes: 2370,
          remainingMinutes: 2278,
        },
        changeRatio: 0.23,
        movedTaskCount: 1,
        backlogTaskCount: 1,
      },
    },
  };
}

describe("presentAiCoachPreview", () => {
  it("turns a ready shadow proposal into user-facing preview copy without apply language", () => {
    const result = presentAiCoachPreview(readyResponse());

    expect(result.title).toContain("düzenleme");
    expect(result.stats).toEqual([
      { label: "Kapasite değişimi", value: "+1 sa" },
      { label: "Etkilenen görev", value: "2" },
      { label: "Taşınan görev", value: "1" },
      { label: "Sonraya kalan", value: "1" },
    ]);
    expect(result.body).toContain("Geçmişten kalan");
    expect(result.note).toContain("henüz hiçbir görev");
    expect(result.changes).toEqual([
      expect.objectContaining({
        subject: "Matematik",
        title: "Temel Kavramlar III",
        schedule: "20 Ağustos → 21 Ağustos",
        remaining: "1 sa kaldı",
        reason: "Kapasite dengesi",
      }),
      expect.objectContaining({
        subject: "Maliye",
        schedule: "22 Ağustos → Sonraya",
        remaining: "45 dk kaldı",
        reason: "Geçmiş görev",
      }),
    ]);
    expect(result.changeDetailsComplete).toBe(true);
  });

  it("renders the backend clarification question instead of inventing a plan", () => {
    const response: AiCoachPlanPreviewResponse = {
      status: "NEEDS_CLARIFICATION",
      clarificationQuestion: "Hangi gün daha az vaktin olacak?",
      interpretation: {
        intent: "CAPACITY_CHANGE",
        confidence: 0.6,
        needsClarification: true,
        clarificationQuestion: "Hangi gün daha az vaktin olacak?",
        effectiveDate: null,
        subjectHint: null,
        curriculumHint: null,
        reasonCode: null,
        evidence: [],
      },
      mapping: null,
      shadowPreview: null,
    };

    const result = presentAiCoachPreview(response);
    expect(result.title).toBe("Hangi gün daha az vaktin olacak?");
    expect(result.stats).toEqual([]);
  });

  it("presents a deterministic targetMinutes preview as the new daily capacity", () => {
    const response = readyResponse();
    const targetPreview: AiCoachPlanPreviewResponse = {
      ...response,
      interpretation: {
        ...response.interpretation,
        evidence: [{
          type: "CAPACITY_CHANGE_REQUEST",
          confidence: 0.9,
          effectiveDate: "2026-08-20",
          subjectHint: null,
          curriculumHint: null,
          reasonCode: "absolute capacity",
          direction: null,
          deltaMinutes: null,
          targetMinutes: 120,
        }],
      },
      mapping: {
        ...response.mapping,
        action: "EVIDENCE_ONLY",
        planningTriggerCandidate: null,
      },
      capacityResolution: {
        source: "TARGET_MINUTES",
        effectiveDate: "2026-08-20",
        targetMinutes: 120,
        currentGrossMinutes: 240,
        deltaMinutes: -120,
        trigger: "CAPACITY_DECREASE",
        noChange: false,
      },
    };

    const result = presentAiCoachPreview(targetPreview);
    expect(result.stats[0]).toEqual({ label: "Günlük kapasite", value: "2 sa" });
    expect(result.title).toContain("düzenleme");
  });

  it("explains when an absolute capacity target already matches the current day", () => {
    const response = readyResponse();
    const noChange: AiCoachPlanPreviewResponse = {
      ...response,
      interpretation: {
        ...response.interpretation,
        evidence: [{
          type: "CAPACITY_CHANGE_REQUEST",
          confidence: 0.9,
          effectiveDate: "2026-08-20",
          subjectHint: null,
          curriculumHint: null,
          reasonCode: "absolute capacity",
          direction: null,
          deltaMinutes: null,
          targetMinutes: 120,
        }],
      },
      mapping: {
        ...response.mapping,
        action: "EVIDENCE_ONLY",
        planningTriggerCandidate: null,
      },
      capacityResolution: {
        source: "TARGET_MINUTES",
        effectiveDate: "2026-08-20",
        targetMinutes: 120,
        currentGrossMinutes: 120,
        deltaMinutes: 0,
        trigger: null,
        noChange: true,
      },
      shadowPreview: null,
    };

    const result = presentAiCoachPreview(noChange);
    expect(result.title).toContain("zaten 2 sa");
    expect(result.stats).toEqual([{ label: "Günlük kapasite", value: "2 sa" }]);
    expect(result.note).toBe("Planın değişmedi.");
  });
});
