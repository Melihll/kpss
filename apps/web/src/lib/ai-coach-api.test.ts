import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession } = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock("./supabase", () => ({
  supabase: {
    auth: { getSession },
  },
}));

import { callAiCoachPreview } from "./ai-coach-api";

const profileId = "79a32e8a-268e-431a-8684-a5ce659727ec";

function validPayload() {
  return {
    status: "VALID" as const,
    interpretation: {
      intent: "CAPACITY_CHANGE" as const,
      confidence: 0.9,
      needsClarification: false,
      clarificationQuestion: null,
      effectiveDate: "2026-08-20",
      subjectHint: null,
      curriculumHint: null,
      reasonCode: "capacity increase",
      evidence: [{
        type: "CAPACITY_CHANGE_REQUEST" as const,
        confidence: 0.9,
        effectiveDate: "2026-08-20",
        subjectHint: null,
        curriculumHint: null,
        reasonCode: "capacity increase",
        direction: "INCREASE" as const,
        deltaMinutes: 60,
        targetMinutes: null,
      }],
    },
    mapping: {
      action: "PLANNING_TRIGGER_CANDIDATE" as const,
      planningTriggerCandidate: "CAPACITY_INCREASE" as const,
      effectiveDate: "2026-08-20",
      evidence: [],
      reasonCodes: ["AI_CAPACITY_EVIDENCE_VALIDATED"],
      requiresDeterministicReview: true,
      planMutationAllowed: false as const,
    },
    shadowPreview: {
      previewOnly: true as const,
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

describe("callAiCoachPreview", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
    getSession.mockResolvedValue({
      data: { session: { access_token: "access-token" } },
      error: null,
    });
  });

  it("calls the preview endpoint with the current session and only the safe request contract", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(validPayload()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await callAiCoachPreview(profileId, "  Yarın 60 dakika daha çalışabilirim.  ");

    expect(result.status).toBe("VALID");
    expect(result.shadowPreview?.previewOnly).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://example.supabase.co/functions/v1/ai-coach-plan-preview");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({
      Authorization: "Bearer access-token",
      apikey: "anon-key",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      examProfileId: profileId,
      message: "Yarın 60 dakika daha çalışabilirim.",
    });
  });

  it("stops before the network when there is no authenticated session", async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(callAiCoachPreview(profileId, "Merhaba")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves a structured non-2xx preview state for the UI", async () => {
    const payload = {
      ...validPayload(),
      shadowPreview: null,
      error: {
        code: "SHADOW_PREVIEW_REJECTED",
        message: "Capacity preview could not be evaluated.",
      },
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 422,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await callAiCoachPreview(profileId, "Yarın 60 dakika daha çalışabilirim.");

    expect(result.status).toBe("VALID");
    expect(result.shadowPreview).toBeNull();
    if (result.status === "VALID") {
      expect(result.error?.code).toBe("SHADOW_PREVIEW_REJECTED");
    }
  });
});
