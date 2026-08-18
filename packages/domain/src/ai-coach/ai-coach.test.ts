import { describe, expect, it } from "vitest";
import {
  buildAiCoachSystemPromptV1,
  mapAiInterpretationToDomainEventV1,
  type AiGatewayV1,
  type StudyMessageInputV1,
  validateAiInterpretationV1,
} from "./index";

function gatewayFor(responses: Readonly<Record<string, unknown>>): AiGatewayV1 {
  return {
    async interpretStudyMessage(input: StudyMessageInputV1): Promise<unknown> {
      return responses[input.message];
    },
  };
}

function base(overrides: Record<string, unknown> = {}) {
  return {
    intent: "GENERAL_COACHING",
    confidence: 0.9,
    needsClarification: false,
    evidence: [],
    ...overrides,
  };
}

async function interpret(
  message: string,
  raw: unknown,
) {
  const gateway = gatewayFor({ [message]: raw });
  const providerOutput = await gateway.interpretStudyMessage({
    message,
    currentDate: "2026-08-18",
    locale: "tr-TR",
  });
  return validateAiInterpretationV1(providerOutput);
}

describe("AI Coach Foundation V1", () => {
  it("keeps vague fatigue and lighter-day feedback at clarification only", async () => {
    const result = await interpret(
      "Bugün matematik beni çok yordu, yarın biraz daha hafif gidelim.",
      base({
        intent: "STUDY_FEEDBACK",
        confidence: 0.82,
        needsClarification: true,
        clarificationQuestion: "Yarın çalışma sürenizi kaç dakika azaltalım?",
        subjectHint: "Matematik",
        evidence: [
          {
            type: "COGNITIVE_FATIGUE",
            confidence: 0.95,
            subjectHint: "Matematik",
            reasonCode: "USER_REPORTED_FATIGUE",
          },
          {
            type: "CAPACITY_CHANGE_REQUEST",
            confidence: 0.7,
            direction: "DECREASE",
            effectiveDate: "2026-08-19",
            reasonCode: "VAGUE_LIGHTER_DAY_REQUEST",
          },
        ],
      }),
    );

    expect(result.status).toBe("NEEDS_CLARIFICATION");
    if (!result.value) throw new Error("validated interpretation missing");
    const mapped = mapAiInterpretationToDomainEventV1(result.value);
    expect(mapped.action).toBe("NO_REPLAN");
    expect(mapped.planningTriggerCandidate).toBeNull();
    expect(mapped.planMutationAllowed).toBe(false);
  });

  it("maps an explicit +60 request to a capacity-increase candidate", async () => {
    const result = await interpret(
      "Yarın 60 dakika daha çalışabilirim.",
      base({
        intent: "CAPACITY_CHANGE",
        effectiveDate: "2026-08-19",
        evidence: [{
          type: "CAPACITY_CHANGE_REQUEST",
          confidence: 0.98,
          direction: "INCREASE",
          deltaMinutes: 60,
          effectiveDate: "2026-08-19",
        }],
      }),
    );

    expect(result.status).toBe("VALID");
    if (!result.value) throw new Error("validated interpretation missing");
    const capacity = result.value.evidence[0];
    expect(capacity).toMatchObject({ deltaMinutes: 60, targetMinutes: null });
    expect(
      mapAiInterpretationToDomainEventV1(result.value).planningTriggerCandidate,
    ).toBe("CAPACITY_INCREASE");
  });

  it("preserves two hours as targetMinutes=120 rather than a delta", async () => {
    const result = await interpret(
      "Bugün 2 saat çalışabilirim.",
      base({
        intent: "CAPACITY_CHANGE",
        evidence: [{
          type: "CAPACITY_CHANGE_REQUEST",
          confidence: 0.97,
          targetMinutes: 120,
          effectiveDate: "2026-08-18",
        }],
      }),
    );

    expect(result.status).toBe("VALID");
    if (!result.value) throw new Error("validated interpretation missing");
    expect(result.value.evidence[0]).toMatchObject({
      direction: null,
      targetMinutes: 120,
      deltaMinutes: null,
    });
  });

  it("maps explicit EBOB difficulty to evidence only", async () => {
    const result = await interpret(
      "Matematikte EBOB'u hiç anlamadım.",
      base({
        intent: "MASTERY_FEEDBACK",
        subjectHint: "Matematik",
        curriculumHint: "EBOB",
        evidence: [{
          type: "STUDY_DIFFICULTY",
          confidence: 0.99,
          subjectHint: "Matematik",
          curriculumHint: "EBOB",
          reasonCode: "USER_REPORTED_NOT_UNDERSTOOD",
        }],
      }),
    );

    expect(result.status).toBe("VALID");
    if (!result.value) throw new Error("validated interpretation missing");
    const mapped = mapAiInterpretationToDomainEventV1(result.value);
    expect(mapped.action).toBe("EVIDENCE_ONLY");
    expect(mapped.planningTriggerCandidate).toBeNull();
  });

  it("represents cannot-study feedback as evidence and a non-mutating decrease candidate", async () => {
    const result = await interpret(
      "Bugün çalışamayacağım.",
      base({
        intent: "MISSED_STUDY",
        evidence: [
          {
            type: "CAPACITY_CHANGE_REQUEST",
            confidence: 0.99,
            targetMinutes: 0,
            effectiveDate: "2026-08-18",
          },
          {
            type: "MISSED_STUDY_REASON",
            confidence: 0.8,
            effectiveDate: "2026-08-18",
          },
        ],
      }),
    );

    expect(result.status).toBe("VALID");
    if (!result.value) throw new Error("validated interpretation missing");
    const mapped = mapAiInterpretationToDomainEventV1(result.value);
    expect(mapped.action).toBe("EVIDENCE_ONLY");
    expect(mapped.planningTriggerCandidate).toBeNull();
    expect(mapped.requiresDeterministicReview).toBe(true);
    expect(mapped.planMutationAllowed).toBe(false);
  });

  it("rejects malformed and unknown provider output safely", () => {
    expect(validateAiInterpretationV1("not-json").status).toBe("INVALID");
    const unknown = validateAiInterpretationV1(base({
      intent: "MOVE_TASKS_NOW",
      evidence: [{ type: "APPLY_PLAN", confidence: 1 }],
    }));
    expect(unknown.status).toBe("INVALID");
    expect(unknown.issues.map((item) => item.code)).toEqual(
      expect.arrayContaining(["UNKNOWN_INTENT", "UNKNOWN_EVIDENCE_TYPE"]),
    );
  });

  it("rejects confidence above one instead of silently trusting it", () => {
    const result = validateAiInterpretationV1(base({ confidence: 1.2 }));
    expect(result.status).toBe("INVALID");
    expect(result.issues.some((item) => item.code === "INVALID_CONFIDENCE")).toBe(true);
  });

  it("rejects unknown fields, invalid dates, negative minutes, and ambiguous amounts", () => {
    const result = validateAiInterpretationV1(base({
      intent: "CAPACITY_CHANGE",
      plannerAction: "MOVE_TASK",
      evidence: [{
        type: "CAPACITY_CHANGE_REQUEST",
        confidence: 1,
        direction: "DECREASE",
        effectiveDate: "2026-02-30",
        deltaMinutes: -30,
        targetMinutes: 60,
      }],
    }));
    expect(result.status).toBe("INVALID");
    expect(result.issues.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "UNKNOWN_FIELD",
        "INVALID_DATE",
        "INVALID_MINUTES",
      ]),
    );

    const ambiguous = validateAiInterpretationV1(base({
      intent: "CAPACITY_CHANGE",
      evidence: [{
        type: "CAPACITY_CHANGE_REQUEST",
        confidence: 1,
        direction: "INCREASE",
        deltaMinutes: 30,
        targetMinutes: 120,
      }],
    }));
    expect(ambiguous.status).toBe("INVALID");
    expect(ambiguous.issues.some((item) => item.code === "AMBIGUOUS_CAPACITY")).toBe(true);
  });

  it("maps the same validated interpretation deterministically", () => {
    const validated = validateAiInterpretationV1(base({
      intent: "CAPACITY_CHANGE",
      evidence: [{
        type: "CAPACITY_CHANGE_REQUEST",
        confidence: 0.9,
        direction: "INCREASE",
        deltaMinutes: 60,
      }],
    }));
    if (!validated.value) throw new Error("validated interpretation missing");
    expect(mapAiInterpretationToDomainEventV1(validated.value)).toEqual(
      mapAiInterpretationToDomainEventV1(validated.value),
    );
  });

  it("builds a provider-neutral prompt with explicit planning prohibitions", () => {
    const prompt = buildAiCoachSystemPromptV1();
    expect(prompt).toContain("Return one JSON object only");
    expect(prompt).toContain("Never calculate a study plan");
    expect(prompt).toContain("Never choose, move, cancel, create, or apply tasks");
    expect(prompt).toContain("Do not invent user facts");
    expect(prompt).not.toContain("OpenAI");
  });
});
