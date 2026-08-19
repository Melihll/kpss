import { describe, expect, it, vi } from "vitest";
import { createAiCoachPlanPreviewHandler } from "./handler";

const examProfileId = "11111111-1111-4111-8111-111111111111";

function capacityResult(
  direction: "INCREASE" | "DECREASE" = "INCREASE",
  deltaMinutes: number | null = 60,
  targetMinutes: number | null = null,
  trigger = direction === "INCREASE" ? "CAPACITY_INCREASE" : "CAPACITY_DECREASE",
) {
  return {
    status: "VALID",
    interpretation: {
      intent: "CAPACITY_CHANGE",
      confidence: 0.98,
      needsClarification: false,
      clarificationQuestion: null,
      effectiveDate: "2026-08-20",
      subjectHint: null,
      curriculumHint: null,
      reasonCode: null,
      evidence: [{
        type: "CAPACITY_CHANGE_REQUEST",
        confidence: 0.98,
        effectiveDate: "2026-08-20",
        subjectHint: null,
        curriculumHint: null,
        reasonCode: null,
        direction,
        deltaMinutes,
        targetMinutes,
      }],
    },
    mapping: {
      action: direction && deltaMinutes
        ? "PLANNING_TRIGGER_CANDIDATE"
        : "EVIDENCE_ONLY",
      planningTriggerCandidate: direction && deltaMinutes ? trigger : null,
      effectiveDate: "2026-08-20",
      evidence: [],
      reasonCodes: [],
      requiresDeterministicReview: true,
      planMutationAllowed: false,
    },
  };
}

function createHarness(options: {
  owned?: boolean;
  authError?: boolean;
  aiResult?: unknown;
  shadowError?: boolean;
} = {}) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({
      data: options.owned === false ? null : { id: examProfileId },
      error: null,
    })),
  };
  const userClient = {
    auth: {
      getUser: vi.fn(async () => options.authError
        ? { data: { user: null }, error: { message: "bad token" } }
        : { data: { user: { id: "user-1" } }, error: null }),
    },
    from: vi.fn(() => query),
  };
  const gateway = { interpretStudyMessage: vi.fn() };
  const shadowClient = { shadowOnly: true };
  const createGateway = vi.fn(() => gateway);
  const createShadowClient = vi.fn(() => shadowClient);
  const executeAiStudyMessage = vi.fn(async () =>
    options.aiResult ?? capacityResult());
  const runShadowDecision = options.shadowError
    ? vi.fn(async () => {
        throw new Error("database secret and internal stack");
      })
    : vi.fn(async () => ({
        snapshotId: "planning-v2-shadow:plan-1:capacity:test",
        snapshotHash: "a".repeat(64),
        decision: "READY_TO_APPLY",
        changedTaskCount: 2,
        validationValid: true,
        applyRecommended: true,
        evaluation: {
          currentPlan: {
            feasible: true,
            issueCodes: [],
            availableMinutes: 2160,
            planningBudgetMinutes: 1995,
            reserveMinutes: 105,
          },
          v2: {
            movedTaskIds: ["task-1", "task-2"],
            backlogTaskIds: [],
          },
          stability: { changeRatio: 0.2 },
          capacity: {
            grossMinutes: 2160,
            reserveMinutes: 105,
            planningMinutes: 2055,
            remainingMinutes: 2055,
          },
        },
      }));
  const handler = createAiCoachPlanPreviewHandler({
    createUserClient: vi.fn(() => userClient),
    createShadowClient,
    createGateway,
    executeAiStudyMessage: executeAiStudyMessage as any,
    runShadowDecision: runShadowDecision as any,
    currentDate: () => "2026-08-19",
  });

  return {
    handler,
    createGateway,
    createShadowClient,
    executeAiStudyMessage,
    runShadowDecision,
    shadowClient,
  };
}

function request(
  body: unknown = { examProfileId, message: "Yarın 60 dakika daha çalışabilirim." },
  authorization: string | null = "Bearer valid-token",
): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authorization !== null) headers.Authorization = authorization;
  return new Request("http://localhost/ai-coach-plan-preview", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("ai-coach-plan-preview handler", () => {
  it("converts a validated +60 candidate and invokes shadow exactly once", async () => {
    const harness = createHarness();
    const response = await harness.handler(request());

    expect(response.status).toBe(200);
    expect(harness.runShadowDecision).toHaveBeenCalledTimes(1);
    expect(harness.runShadowDecision).toHaveBeenCalledWith({
      client: harness.shadowClient,
      userId: "user-1",
      examProfileId,
      currentDate: "2026-08-19",
      trigger: "CAPACITY_INCREASE",
      hypotheticalCapacityEvent: {
        effectiveDate: "2026-08-20",
        deltaMinutes: 60,
      },
    });
  });

  it("converts a validated decrease magnitude to a negative delta", async () => {
    const harness = createHarness({ aiResult: capacityResult("DECREASE", 30) });
    await harness.handler(request());
    expect(harness.runShadowDecision).toHaveBeenCalledWith(expect.objectContaining({
      trigger: "CAPACITY_DECREASE",
      hypotheticalCapacityEvent: {
        effectiveDate: "2026-08-20",
        deltaMinutes: -30,
      },
    }));
  });

  it("does not invoke shadow for INVALID interpretation", async () => {
    const harness = createHarness({
      aiResult: {
        status: "INVALID",
        issues: [{ path: "$.evidence", code: "INVALID" }],
        interpretation: null,
        mapping: null,
      },
    });
    const response = await harness.handler(request());
    expect(response.status).toBe(200);
    expect((await response.json()).shadowPreview).toBeNull();
    expect(harness.runShadowDecision).not.toHaveBeenCalled();
    expect(harness.createShadowClient).not.toHaveBeenCalled();
  });

  it("does not invoke shadow when clarification is needed", async () => {
    const harness = createHarness({
      aiResult: {
        status: "NEEDS_CLARIFICATION",
        clarificationQuestion: "Günlük mü?",
        interpretation: { evidence: [] },
        mapping: null,
      },
    });
    const response = await harness.handler(request());
    expect((await response.json()).shadowPreview).toBeNull();
    expect(harness.runShadowDecision).not.toHaveBeenCalled();
  });

  it("does not invoke shadow for evidence-only output", async () => {
    const result = capacityResult();
    result.mapping.action = "EVIDENCE_ONLY";
    result.mapping.planningTriggerCandidate = null;
    const harness = createHarness({ aiResult: result });
    const response = await harness.handler(request());
    expect((await response.json()).shadowPreview).toBeNull();
    expect(harness.runShadowDecision).not.toHaveBeenCalled();
  });

  it("does not invoke shadow for targetMinutes-only capacity evidence", async () => {
    const result = capacityResult("INCREASE", null, 120);
    result.interpretation.evidence[0]!.direction = null as any;
    const harness = createHarness({ aiResult: result });
    const response = await harness.handler(request());
    expect((await response.json()).shadowPreview).toBeNull();
    expect(harness.runShadowDecision).not.toHaveBeenCalled();
  });

  it.each([null, "Basic token", "Bearer", "Bearer   "])(
    "rejects missing or malformed auth before AI: %s",
    async (authorization) => {
      const harness = createHarness();
      const response = await harness.handler(request(undefined, authorization));
      expect(response.status).toBe(401);
      expect(harness.createGateway).not.toHaveBeenCalled();
      expect(harness.executeAiStudyMessage).not.toHaveBeenCalled();
      expect(harness.runShadowDecision).not.toHaveBeenCalled();
    },
  );

  it("rejects an invalid auth token before AI", async () => {
    const harness = createHarness({ authError: true });
    expect((await harness.handler(request())).status).toBe(401);
    expect(harness.createGateway).not.toHaveBeenCalled();
    expect(harness.runShadowDecision).not.toHaveBeenCalled();
  });

  it("rejects an unowned profile before AI", async () => {
    const harness = createHarness({ owned: false });
    expect((await harness.handler(request())).status).toBe(403);
    expect(harness.createGateway).not.toHaveBeenCalled();
    expect(harness.createShadowClient).not.toHaveBeenCalled();
    expect(harness.runShadowDecision).not.toHaveBeenCalled();
  });

  it.each([
    "trigger",
    "currentDate",
    "deltaMinutes",
    "direction",
    "hypotheticalCapacityEvent",
    "plannerVersion",
    "apply",
    "scope",
  ])("rejects client-controlled planning field %s before AI", async (field) => {
    const harness = createHarness();
    const response = await harness.handler(request({
      examProfileId,
      message: "test",
      [field]: field === "apply" ? true : "injected",
    }));
    expect(response.status).toBe(400);
    expect(harness.createGateway).not.toHaveBeenCalled();
    expect(harness.runShadowDecision).not.toHaveBeenCalled();
  });

  it.each(["", "   "])("rejects blank message %j", async (message) => {
    const harness = createHarness();
    expect((await harness.handler(request({ examProfileId, message }))).status).toBe(400);
    expect(harness.createGateway).not.toHaveBeenCalled();
  });

  it("rejects oversized messages before AI", async () => {
    const harness = createHarness();
    const response = await harness.handler(request({
      examProfileId,
      message: "a".repeat(2_001),
    }));
    expect(response.status).toBe(400);
    expect(harness.createGateway).not.toHaveBeenCalled();
  });

  it("fails safely on inconsistent direction and trigger", async () => {
    const harness = createHarness({
      aiResult: capacityResult("DECREASE", 30, null, "CAPACITY_INCREASE"),
    });
    const response = await harness.handler(request());
    const bodyText = await response.text();
    expect(response.status).toBe(422);
    expect(bodyText).toContain("AI_SHADOW_CANDIDATE_INVALID");
    expect(harness.createShadowClient).not.toHaveBeenCalled();
    expect(harness.runShadowDecision).not.toHaveBeenCalled();
  });

  it("sanitizes shadow runner validation failures", async () => {
    const harness = createHarness({ shadowError: true });
    const response = await harness.handler(request());
    const bodyText = await response.text();
    expect(response.status).toBe(422);
    expect(bodyText).toContain("SHADOW_PREVIEW_REJECTED");
    expect(bodyText).not.toContain("database secret");
    expect(bodyText).not.toContain("internal stack");
  });

  it("returns explicit preview-only semantics without claiming an apply", async () => {
    const harness = createHarness();
    const response = await harness.handler(request());
    const body = await response.json();
    expect(body).toMatchObject({
      status: "VALID",
      mapping: { planMutationAllowed: false },
      shadowPreview: {
        previewOnly: true,
        decision: "READY_TO_APPLY",
        changedTaskCount: 2,
        validationValid: true,
        applyRecommended: true,
        evaluation: {
          availableMinutes: 2160,
          capacity: { grossMinutes: 2160, planningMinutes: 2055 },
          movedTaskCount: 2,
        },
      },
    });
    expect(body.shadowPreview).not.toHaveProperty("applied");
    expect(JSON.stringify(body)).not.toContain("apply_plan_revision");
  });
});
