import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  AI_COACH_MESSAGE_MAX_LENGTH,
  createAiCoachInterpretHandler,
} from "./handler";

const examProfileId = "11111111-1111-4111-8111-111111111111";

const interpretation = Object.freeze({
  intent: "GENERAL_COACHING",
  confidence: 0.9,
  needsClarification: false,
  clarificationQuestion: null,
  effectiveDate: null,
  subjectHint: null,
  curriculumHint: null,
  reasonCode: null,
  evidence: [],
});

function createHarness(options: {
  authError?: boolean;
  owned?: boolean;
  lookupError?: boolean;
  gatewayError?: boolean;
  result?: unknown;
} = {}) {
  const filters: Array<[string, string]> = [];
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn((key: string, value: string) => {
      filters.push([key, value]);
      return chain;
    }),
    maybeSingle: vi.fn(async () => ({
      data: options.owned === false ? null : { id: examProfileId },
      error: options.lookupError ? { message: "sensitive database detail" } : null,
    })),
  };
  const client = {
    auth: {
      getUser: vi.fn(async () => options.authError
        ? { data: { user: null }, error: { message: "bad token" } }
        : { data: { user: { id: "user-1" } }, error: null }),
    },
    from: vi.fn((table: string) => {
      expect(table).toBe("exam_profiles");
      return chain;
    }),
  };
  const gateway = { interpretStudyMessage: vi.fn() };
  const createGateway = options.gatewayError
    ? vi.fn(() => {
        throw new Error("missing OPENAI_API_KEY sk-secret");
      })
    : vi.fn(() => gateway);
  const executeAiStudyMessage = vi.fn(async () => options.result ?? ({
    status: "VALID",
    interpretation,
    mapping: {
      action: "NO_REPLAN",
      planningTriggerCandidate: null,
      planMutationAllowed: false,
    },
    rawProviderPayload: "must-not-escape",
  }));
  const handler = createAiCoachInterpretHandler({
    createUserClient: vi.fn(() => client),
    createGateway,
    executeAiStudyMessage: executeAiStudyMessage as any,
    currentDate: () => "2026-08-19",
  });

  return { handler, client, createGateway, executeAiStudyMessage, filters };
}

function request(
  body: unknown = { examProfileId, message: "Bugün iyi çalıştım." },
  authorization: string | null = "Bearer valid-test-token",
): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authorization !== null) headers.Authorization = authorization;
  return new Request("http://localhost/ai-coach-interpret", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("ai-coach-interpret handler", () => {
  it.each([null, "Basic token", "Bearer", "Bearer   "])(
    "rejects missing or malformed authorization: %s",
    async (authorization) => {
      const { handler, createGateway } = createHarness();
      const response = await handler(request(undefined, authorization));
      expect(response.status).toBe(401);
      expect(createGateway).not.toHaveBeenCalled();
    },
  );

  it("rejects an invalid token", async () => {
    const { handler, createGateway } = createHarness({ authError: true });
    expect((await handler(request())).status).toBe(401);
    expect(createGateway).not.toHaveBeenCalled();
  });

  it.each([
    [[], "array body"],
    [{ examProfileId: "not-a-uuid", message: "ok" }, "invalid profile id"],
    [{ examProfileId, message: "ok", extra: true }, "unexpected field"],
  ])("rejects invalid input: %s (%s)", async (body) => {
    const { handler, createGateway } = createHarness();
    expect((await handler(request(body))).status).toBe(400);
    expect(createGateway).not.toHaveBeenCalled();
  });

  it.each(["", "   "])("rejects a blank message", async (message) => {
    const { handler, createGateway } = createHarness();
    expect((await handler(request({ examProfileId, message }))).status).toBe(400);
    expect(createGateway).not.toHaveBeenCalled();
  });

  it("rejects an oversized message", async () => {
    const { handler, createGateway } = createHarness();
    const response = await handler(request({
      examProfileId,
      message: "a".repeat(AI_COACH_MESSAGE_MAX_LENGTH + 1),
    }));
    expect(response.status).toBe(400);
    expect(createGateway).not.toHaveBeenCalled();
  });

  it("rejects a profile not owned by the caller before provider creation", async () => {
    const { handler, createGateway, filters } = createHarness({ owned: false });
    const response = await handler(request());
    expect(response.status).toBe(403);
    expect(filters).toEqual([
      ["id", examProfileId],
      ["user_id", "user-1"],
    ]);
    expect(createGateway).not.toHaveBeenCalled();
  });

  it("returns a sanitized valid interpretation and domain mapping", async () => {
    const { handler, executeAiStudyMessage } = createHarness();
    const response = await handler(request({
      examProfileId,
      message: "  Bugün iyi çalıştım.  ",
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "VALID",
      interpretation,
      mapping: { action: "NO_REPLAN", planMutationAllowed: false },
    });
    expect(body).not.toHaveProperty("rawProviderPayload");
    expect(executeAiStudyMessage).toHaveBeenCalledWith(expect.objectContaining({
      input: {
        message: "Bugün iyi çalıştım.",
        currentDate: "2026-08-19",
        locale: "tr-TR",
      },
    }));
  });

  it("returns clarification without a mapping", async () => {
    const { handler } = createHarness({
      result: {
        status: "NEEDS_CLARIFICATION",
        clarificationQuestion: "Hangi ders?",
        interpretation: { ...interpretation, needsClarification: true },
        mapping: null,
      },
    });
    const response = await handler(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "NEEDS_CLARIFICATION",
      clarificationQuestion: "Hangi ders?",
      mapping: null,
    });
  });

  it("returns sanitized provider failure", async () => {
    const { handler } = createHarness({
      result: {
        status: "GATEWAY_ERROR",
        error: { code: "RAW", message: "sk-secret provider detail" },
        interpretation: null,
        mapping: null,
      },
    });
    const response = await handler(request());
    const bodyText = await response.text();
    expect(response.status).toBe(503);
    expect(bodyText).toContain("AI_GATEWAY_FAILED");
    expect(bodyText).not.toContain("sk-secret");
  });

  it("fails safely when the provider key is absent", async () => {
    const { handler, executeAiStudyMessage } = createHarness({ gatewayError: true });
    const response = await handler(request());
    const bodyText = await response.text();
    expect(response.status).toBe(503);
    expect(bodyText).not.toContain("OPENAI_API_KEY");
    expect(bodyText).not.toContain("sk-secret");
    expect(executeAiStudyMessage).not.toHaveBeenCalled();
  });

  it("sanitizes an ownership lookup failure", async () => {
    const { handler, createGateway } = createHarness({ lookupError: true });
    const response = await handler(request());
    const bodyText = await response.text();
    expect(response.status).toBe(500);
    expect(bodyText).not.toContain("database detail");
    expect(createGateway).not.toHaveBeenCalled();
  });

  it("requires no mutation-capable or service-role client surface", () => {
    const handlerSource = readFileSync(new URL("./handler.ts", import.meta.url), "utf8");
    const indexSource = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    const providerSource = readFileSync(
      new URL("../_shared/ai-coach/openai-gateway.ts", import.meta.url),
      "utf8",
    );
    const runtimeSource = `${handlerSource}\n${indexSource}\n${providerSource}`;

    expect(runtimeSource).not.toMatch(/\.(insert|update|delete|upsert|rpc)\s*\(/);
    expect(runtimeSource).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(runtimeSource).not.toMatch(/apply_plan_revision|runPlanningV2ShadowDecision/);
    expect(runtimeSource).not.toMatch(/scheduler-worker|telegram-webhook/);
  });
});
