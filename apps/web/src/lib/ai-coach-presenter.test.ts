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
      changedTaskCount: 6,
      validationValid: true,
      applyRecommended: true,
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
        movedTaskCount: 5,
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
      { label: "Etkilenen görev", value: "6" },
      { label: "Taşınan görev", value: "5" },
      { label: "Sonraya kalan", value: "1" },
    ]);
    expect(result.body).toContain("Geçmişten kalan");
    expect(result.note).toContain("henüz hiçbir görev");
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

  it("keeps target-only capacity messages as understood but not previewed", () => {
    const response = readyResponse();
    const targetOnly: AiCoachPlanPreviewResponse = {
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
      shadowPreview: null,
    };

    const result = presentAiCoachPreview(targetOnly);
    expect(result.title).toContain("2 sa");
    expect(result.note).toBe("Planın değişmedi.");
  });
});
