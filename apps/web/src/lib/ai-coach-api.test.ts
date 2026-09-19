import fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession } = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock("./supabase", () => ({
  supabase: {
    auth: { getSession },
  },
}));

import {
  applyProactiveCoachCardAction,
  callAiCoachPreview,
  loadProactiveCoachCard,
  recordProactiveCoachPresentation,
} from "./ai-coach-api";

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

describe("Proactive Coach app-api client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
    getSession.mockResolvedValue({ data: { session: { access_token: "access-token" } }, error: null });
  });

  it("loads one deterministic card using only the stable surfaceSessionId", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      version: "proactive-coach-http-v1",
      status: "OK",
      runtime: {
        selection: {
          version: "proactive-coach-selection-v1",
          evaluatedAt: "2026-09-19T09:00:00.000Z",
          currentDate: "2026-09-19",
          outcome: "silence",
          selectedCandidate: null,
          selectedFingerprint: null,
          selectedConditionKey: null,
          suppressions: [],
          authority: {
            mode: "deterministic_in_app_selection_only",
            inAppOnly: true,
            generatesProse: false,
            llmCallsAllowed: false,
            providerCallsAllowed: false,
            dbWritesAllowed: false,
            plannerProposalAllowed: false,
            plannerConfirmationAllowed: false,
            plannerApplyAllowed: false,
          },
        },
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(loadProactiveCoachCard("  today-surface  ")).resolves.toBeNull();
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe("https://example.supabase.co/functions/v1/app-api/ai-coach/proactive");
    expect(JSON.parse(String(init?.body))).toEqual({ surfaceSessionId: "today-surface" });
  });

  it("records presentation and sends controls through narrow app-api endpoints only", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({
      version: "proactive-coach-actions-http-v1",
      status: "CONTROL_APPLIED",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await recordProactiveCoachPresentation("today-surface", "token-1");
    await applyProactiveCoachCardAction("dismiss", "today-surface", "token-1");
    await applyProactiveCoachCardAction("snooze_24h", "today-surface", "token-1");
    await applyProactiveCoachCardAction("disable_category", "today-surface", "token-1");

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://example.supabase.co/functions/v1/app-api/ai-coach/proactive/presented",
      "https://example.supabase.co/functions/v1/app-api/ai-coach/proactive/dismiss",
      "https://example.supabase.co/functions/v1/app-api/ai-coach/proactive/snooze",
      "https://example.supabase.co/functions/v1/app-api/ai-coach/proactive/disable-category",
    ]);
    for (const [, init] of fetchMock.mock.calls) {
      expect(JSON.parse(String(init?.body))).toEqual({ surfaceSessionId: "today-surface", presentationToken: "token-1" });
    }
  });

  it("never calls Supabase tables or RPCs directly from the proactive browser helper", () => {
    const source = fs.readFileSync(new URL("ai-coach-api.ts", import.meta.url), "utf8");
    const proactiveSource = source.slice(source.indexOf("export async function loadProactiveCoachCard"));
    expect(proactiveSource).not.toMatch(/supabase\.(from|rpc)\s*\(/);
    expect(proactiveSource).not.toMatch(/ai_coach_proactive_(presentations|user_controls)/);
  });
});
