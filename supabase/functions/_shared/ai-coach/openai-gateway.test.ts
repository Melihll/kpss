import { describe, expect, it, vi } from "vitest";
import { executeAiStudyMessageV1 } from "../ai-coach.bundle.js";
import {
  OPENAI_AI_COACH_MAX_OUTPUT_TOKENS,
  OPENAI_AI_COACH_MODEL,
  OpenAiGatewayV1,
} from "./openai-gateway";

const input = Object.freeze({
  message: "Yarından itibaren günde bir saat daha çalışabilirim.",
  currentDate: "2026-08-19",
  locale: "tr-TR",
});

function capacityInterpretation(overrides: Record<string, unknown> = {}) {
  return {
    intent: "CAPACITY_CHANGE",
    confidence: 0.98,
    needsClarification: false,
    clarificationQuestion: null,
    effectiveDate: "2026-08-20",
    subjectHint: null,
    curriculumHint: null,
    reasonCode: "LEARNER_CAPACITY_INCREASE",
    evidence: [{
      type: "CAPACITY_CHANGE_REQUEST",
      confidence: 0.98,
      effectiveDate: "2026-08-20",
      subjectHint: null,
      curriculumHint: null,
      reasonCode: "LEARNER_CAPACITY_INCREASE",
      direction: "INCREASE",
      deltaMinutes: 60,
      targetMinutes: null,
    }],
    ...overrides,
  };
}

function completedResponse(value: unknown): Response {
  return new Response(JSON.stringify({
    status: "completed",
    output: [{
      type: "message",
      status: "completed",
      content: [{ type: "output_text", text: JSON.stringify(value) }],
    }],
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

function gateway(fetchImpl: typeof fetch, timeoutMs = 12_000) {
  return new OpenAiGatewayV1({
    apiKey: "sk-test-secret-never-leak",
    fetchImpl,
    timeoutMs,
  });
}

describe("OpenAiGatewayV1", () => {
  it("uses the bounded Responses API contract and produces a valid deterministic mapping", async () => {
    const fetchMock = vi.fn(async () => completedResponse(capacityInterpretation()));
    const adapter = gateway(fetchMock as typeof fetch);

    const first = await executeAiStudyMessageV1({ gateway: adapter, input });
    const second = await executeAiStudyMessageV1({ gateway: adapter, input });

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      status: "VALID",
      mapping: {
        planningTriggerCandidate: "CAPACITY_INCREASE",
        planMutationAllowed: false,
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const request = JSON.parse(String(init.body));
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(init.method).toBe("POST");
    expect(request).toMatchObject({
      model: OPENAI_AI_COACH_MODEL,
      store: false,
      reasoning: { effort: "none" },
      max_output_tokens: OPENAI_AI_COACH_MAX_OUTPUT_TOKENS,
      text: { format: { type: "json_schema", strict: true } },
    });
    expect(request).not.toHaveProperty("tools");
    expect(request.input).toHaveLength(1);
  });

  it("preserves a clarification result without mapping it", async () => {
    const interpretation = capacityInterpretation({
      needsClarification: true,
      clarificationQuestion: "Artış günlük mü, haftalık mı?",
      evidence: [{
        type: "CAPACITY_CHANGE_REQUEST",
        confidence: 0.7,
        effectiveDate: null,
        subjectHint: null,
        curriculumHint: null,
        reasonCode: null,
        direction: null,
        deltaMinutes: null,
        targetMinutes: null,
      }],
    });
    const result = await executeAiStudyMessageV1({
      gateway: gateway(vi.fn(async () => completedResponse(interpretation)) as typeof fetch),
      input,
    });

    expect(result).toMatchObject({
      status: "NEEDS_CLARIFICATION",
      clarificationQuestion: "Artış günlük mü, haftalık mı?",
      mapping: null,
    });
  });

  it("leaves parseable but domain-invalid output at the validation boundary", async () => {
    const result = await executeAiStudyMessageV1({
      gateway: gateway(vi.fn(async () => completedResponse(
        capacityInterpretation({ confidence: 2 }),
      )) as typeof fetch),
      input,
    });

    expect(result.status).toBe("INVALID");
  });

  it("sanitizes malformed structured JSON", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      status: "completed",
      output: [{
        type: "message",
        content: [{ type: "output_text", text: "{not-json" }],
      }],
    }), { status: 200 }));

    const result = await executeAiStudyMessageV1({
      gateway: gateway(fetchMock as typeof fetch),
      input,
    });
    expect(result).toEqual({
      status: "GATEWAY_ERROR",
      error: {
        code: "AI_GATEWAY_FAILED",
        message: "AI interpretation is temporarily unavailable.",
      },
      interpretation: null,
      mapping: null,
    });
  });

  it.each([401, 403, 429, 500])("sanitizes HTTP %s without retries", async (status) => {
    const fetchMock = vi.fn(async () => new Response(
      `provider failure sk-test-secret-never-leak ${status}`,
      { status },
    ));
    const result = await executeAiStudyMessageV1({
      gateway: gateway(fetchMock as typeof fetch),
      input,
    });

    expect(result.status).toBe("GATEWAY_ERROR");
    expect(JSON.stringify(result)).not.toContain("sk-test-secret-never-leak");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sanitizes network failures without leaking their message", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("socket failed with sk-test-secret-never-leak");
    });
    const result = await executeAiStudyMessageV1({
      gateway: gateway(fetchMock as typeof fetch),
      input,
    });

    expect(result.status).toBe("GATEWAY_ERROR");
    expect(JSON.stringify(result)).not.toContain("socket failed");
  });

  it("aborts at the configured timeout", async () => {
    const fetchMock = vi.fn((_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("request timed out", "AbortError")));
      }));
    const result = await executeAiStudyMessageV1({
      gateway: gateway(fetchMock as typeof fetch, 5),
      input,
    });

    expect(result.status).toBe("GATEWAY_ERROR");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["failed", "incomplete", "cancelled"])(
    "rejects a non-completed %s response",
    async (status) => {
      const fetchMock = vi.fn(async () => new Response(JSON.stringify({
        status,
        output: [],
      }), { status: 200 }));
      const result = await executeAiStudyMessageV1({
        gateway: gateway(fetchMock as typeof fetch),
        input,
      });
      expect(result.status).toBe("GATEWAY_ERROR");
    },
  );

  it("rejects empty output", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      status: "completed",
      output: [],
    }), { status: 200 }));
    const result = await executeAiStudyMessageV1({
      gateway: gateway(fetchMock as typeof fetch),
      input,
    });
    expect(result.status).toBe("GATEWAY_ERROR");
  });

  it("accepts the same structured text when a response exposes both representations", async () => {
    const text = JSON.stringify(capacityInterpretation());
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      status: "completed",
      output_text: text,
      output: [{
        type: "message",
        content: [{ type: "output_text", text }],
      }],
    }), { status: 200 }));
    const result = await executeAiStudyMessageV1({
      gateway: gateway(fetchMock as typeof fetch),
      input,
    });
    expect(result.status).toBe("VALID");
  });

  it("rejects refusals", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      status: "completed",
      output: [{
        type: "message",
        content: [{ type: "refusal", refusal: "Cannot comply" }],
      }],
    }), { status: 200 }));
    const result = await executeAiStudyMessageV1({
      gateway: gateway(fetchMock as typeof fetch),
      input,
    });
    expect(result.status).toBe("GATEWAY_ERROR");
  });

  it("rejects an absent API key before any request", () => {
    expect(() => new OpenAiGatewayV1({ apiKey: "  " })).toThrow("OPENAI_GATEWAY_FAILED");
  });
});
