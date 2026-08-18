import { describe, expect, it } from "vitest";
import {
  executeAiStudyMessageV1,
  type AiGatewayV1,
} from "./index";

const input = {
  message: "Yarın 60 dakika daha çalışabilirim.",
  currentDate: "2026-08-18",
  locale: "tr-TR",
} as const;

function staticGateway(output: unknown): AiGatewayV1 {
  return {
    async interpretStudyMessage() {
      return output;
    },
  };
}

const validIncrease = {
  intent: "CAPACITY_CHANGE",
  confidence: 0.98,
  needsClarification: false,
  effectiveDate: "2026-08-19",
  evidence: [{
    type: "CAPACITY_CHANGE_REQUEST",
    confidence: 0.98,
    direction: "INCREASE",
    deltaMinutes: 60,
    effectiveDate: "2026-08-19",
  }],
};

describe("AI gateway safe execution boundary V1", () => {
  it("returns a non-mutating capacity-increase candidate for valid output", async () => {
    const result = await executeAiStudyMessageV1({
      gateway: staticGateway(validIncrease),
      input,
    });

    expect(result.status).toBe("VALID");
    if (result.status !== "VALID") throw new Error("expected valid result");
    expect(result.mapping.planningTriggerCandidate).toBe("CAPACITY_INCREASE");
    expect(result.mapping.planMutationAllowed).toBe(false);
  });

  it("stops malformed output at INVALID without interpretation or mapping", async () => {
    const result = await executeAiStudyMessageV1({
      gateway: staticGateway({
        intent: "MOVE_TASKS_NOW",
        confidence: 1,
        needsClarification: false,
        evidence: [],
      }),
      input,
    });

    expect(result.status).toBe("INVALID");
    if (result.status !== "INVALID") throw new Error("expected invalid result");
    expect(result.interpretation).toBeNull();
    expect(result.mapping).toBeNull();
    expect(result.issues.some((issue) => issue.code === "UNKNOWN_INTENT")).toBe(true);
  });

  it("returns clarification without producing a mapping", async () => {
    const result = await executeAiStudyMessageV1({
      gateway: staticGateway({
        intent: "CAPACITY_CHANGE",
        confidence: 0.7,
        needsClarification: true,
        clarificationQuestion: "Kaç dakika daha çalışabilirsiniz?",
        evidence: [{
          type: "CAPACITY_CHANGE_REQUEST",
          confidence: 0.7,
          direction: "INCREASE",
        }],
      }),
      input,
    });

    expect(result.status).toBe("NEEDS_CLARIFICATION");
    if (result.status !== "NEEDS_CLARIFICATION") {
      throw new Error("expected clarification result");
    }
    expect(result.clarificationQuestion).toBe("Kaç dakika daha çalışabilirsiniz?");
    expect(result.mapping).toBeNull();
  });

  it("sanitizes gateway rejection without leaking provider internals", async () => {
    const gateway: AiGatewayV1 = {
      async interpretStudyMessage() {
        throw new Error("secret-token=provider-internal-value");
      },
    };
    const result = await executeAiStudyMessageV1({ gateway, input });

    expect(result).toEqual({
      status: "GATEWAY_ERROR",
      error: {
        code: "AI_GATEWAY_FAILED",
        message: "AI interpretation is temporarily unavailable.",
      },
      interpretation: null,
      mapping: null,
    });
    expect(JSON.stringify(result)).not.toContain("provider-internal-value");
  });

  it("is deterministic for the same input and static gateway output", async () => {
    const gateway = staticGateway(validIncrease);
    const first = await executeAiStudyMessageV1({ gateway, input });
    const second = await executeAiStudyMessageV1({ gateway, input });
    expect(first).toEqual(second);
  });
});
