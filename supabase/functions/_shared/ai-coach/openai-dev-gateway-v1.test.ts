import { describe, expect, it, vi } from "vitest";
import {
  buildCoachContextV1,
  estimateAiEvidenceV1,
  projectCoachEvidenceViewV1,
  routeAiCapabilityV1,
} from "../ai-coach.bundle.js";
import { coachContextV1Fixture } from "../../../../packages/domain/src/ai-coach/fixtures/coach-context-v1.ts";
import { buildOpenAiCoachRequestV1, fingerprintOpenAiCoachRequestV1 } from "./openai-coach-request-v1.ts";
import { createOpenAiDevGatewayV1, OpenAiDevGatewayErrorV1, openAiDevGatewayAsOrchestratorTransportsV1 } from "./openai-dev-gateway-v1.ts";
import { loadOpenAiServerCredentialV1 } from "./openai-server-secret-v1.ts";
import { AI_OPENAI_ROUTE_CATALOG_V1 } from "./provider-runtime-catalog-v1.ts";
import { resolveAiProviderRuntimeActivationV1 } from "./provider-runtime-activation-v1.ts";

const TEST_CONFIG = {
  AI_PROVIDER_RUNTIME_ENABLED: "true",
  AI_PROVIDER_RUNTIME_ENVIRONMENT: "test",
  AI_PROVIDER_RUNTIME_SCOPE: "mock_test_only",
  AI_PROVIDER_RUNTIME_ALLOWED_USER_ID: "user-dev",
  AI_PROVIDER_RUNTIME_ALLOWED_PROFILE_ID: "profile-dev",
};
const TEST_GATE = {
  authority: "test_fixture" as const,
  auditVersion: "test_fixture" as const,
  inputCountEndpointBilling: "test_fixture_no_charge" as const,
};

function activation() {
  return resolveAiProviderRuntimeActivationV1({ deploymentEnvironment: "test", serverConfig: TEST_CONFIG, userId: "user-dev", examProfileId: "profile-dev", billingGate: TEST_GATE });
}

async function immutableRequest() {
  const context = buildCoachContextV1(coachContextV1Fixture("healthy_normal_week"));
  const evidence = projectCoachEvidenceViewV1(context, { scope: "today_explain", capability: "explain" });
  const route = routeAiCapabilityV1({
    runtimeEnvironment: "production", capability: "today_analysis",
    evidence: estimateAiEvidenceV1(new TextEncoder().encode(JSON.stringify(evidence)).byteLength),
    expectedResponse: "medium", budgetState: "normal",
  }, AI_OPENAI_ROUTE_CATALOG_V1);
  const request = buildOpenAiCoachRequestV1({ route, capability: "today_analysis", evidence, locale: "tr-TR" });
  return { request, fingerprint: await fingerprintOpenAiCoachRequestV1(request) };
}

function credential() {
  return loadOpenAiServerCredentialV1({ OPENAI_API_KEY: "sk-test-only-12345678901234567890" });
}

describe("6B.6B.2 direct OpenAI DEV gateway with mocked HTTP", () => {
  it("rejects construction without an available central activation", () => {
    const disabled = resolveAiProviderRuntimeActivationV1({ deploymentEnvironment: "test", serverConfig: {}, userId: "user-dev", examProfileId: "profile-dev", billingGate: TEST_GATE });
    expect(() => createOpenAiDevGatewayV1({ activation: disabled, credential: credential(), fetchImpl: vi.fn() })).toThrow("runtime_not_authorized");
  });

  it("sends the exact immutable count body to the fixed endpoint and captures both request IDs", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const gateway = createOpenAiDevGatewayV1({
      activation: activation(), credential: credential(),
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        return new Response(JSON.stringify({ object: "response.input_tokens", input_tokens: 1234 }), { status: 200, headers: { "x-request-id": "req_count_1" } });
      },
      now: () => new Date("2026-09-12T10:00:00.000Z"),
    });
    const { request, fingerprint } = await immutableRequest();
    const result = await gateway.countInputTokens({ request, fingerprint, clientRequestId: "count:request-1" });
    expect(result).toMatchObject({ inputTokens: 1234, providerRequestId: "req_count_1", clientRequestId: "count:request-1", requestFingerprint: fingerprint.value });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.openai.com/v1/responses/input_tokens");
    expect(JSON.parse(String(calls[0].init.body))).toEqual(request.inputCountBody);
    expect((calls[0].init.headers as Record<string, string>)["X-Client-Request-Id"]).toBe("count:request-1");
  });

  it("uses the same fingerprinted request for generation with store false, no tools, and an explicit output cap", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const gateway = createOpenAiDevGatewayV1({
      activation: activation(), credential: credential(),
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        return new Response(JSON.stringify({ id: "resp_1", status: "completed" }), { status: 200, headers: { "x-request-id": "req_response_1" } });
      },
      now: () => new Date("2026-09-12T10:00:00.000Z"),
    });
    const { request, fingerprint } = await immutableRequest();
    const result = await gateway.createResponse({ request, fingerprint, providerAttemptId: "attempt-1", clientRequestId: "attempt:attempt-1" });
    expect(result).toMatchObject({ outcome: "known", providerRequestId: "req_response_1", clientRequestId: "attempt:attempt-1" });
    expect(calls[0].url).toBe("https://api.openai.com/v1/responses");
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({ store: false, tools: [], tool_choice: "none", max_output_tokens: 900, model: "gpt-5.4-mini-2026-03-17" });
  });

  it("rejects a changed request before any mocked HTTP call", async () => {
    const fetchImpl = vi.fn();
    const gateway = createOpenAiDevGatewayV1({ activation: activation(), credential: credential(), fetchImpl });
    const { request, fingerprint } = await immutableRequest();
    const changed = { ...request, responseBody: { ...request.responseBody, max_output_tokens: 901 } };
    await expect(gateway.countInputTokens({ request: changed as any, fingerprint, clientRequestId: "count:request-1" })).rejects.toThrow("request_changed");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects malformed client request identity before network", async () => {
    const fetchImpl = vi.fn();
    const gateway = createOpenAiDevGatewayV1({ activation: activation(), credential: credential(), fetchImpl });
    const { request, fingerprint } = await immutableRequest();
    await expect(gateway.countInputTokens({ request, fingerprint, clientRequestId: "line\nbreak" })).rejects.toThrow("request_identity_invalid");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("classifies a count timeout as outcome unknown and makes one request only", async () => {
    const fetchImpl = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    }));
    const gateway = createOpenAiDevGatewayV1({ activation: activation(), credential: credential(), fetchImpl, countTimeoutMs: 1_000 });
    const { request, fingerprint } = await immutableRequest();
    const error = await gateway.countInputTokens({ request, fingerprint, clientRequestId: "count:request-1" }).catch((value) => value);
    expect(error).toBeInstanceOf(OpenAiDevGatewayErrorV1);
    expect(error).toMatchObject({ code: "count_timeout_outcome_unknown", providerOutcome: "unknown" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("classifies a generation timeout as reconciliation-required outcome unknown", async () => {
    const fetchImpl = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    }));
    const gateway = createOpenAiDevGatewayV1({ activation: activation(), credential: credential(), fetchImpl, generationTimeoutMs: 1_000 });
    const { request, fingerprint } = await immutableRequest();
    await expect(gateway.createResponse({ request, fingerprint, providerAttemptId: "attempt-1", clientRequestId: "attempt:attempt-1" })).resolves.toMatchObject({ outcome: "unknown", reason: "timeout_billing_unknown" });
  });

  it("fails closed on malformed count usage and known HTTP errors", async () => {
    const { request, fingerprint } = await immutableRequest();
    const malformed = createOpenAiDevGatewayV1({ activation: activation(), credential: credential(), fetchImpl: async () => new Response(JSON.stringify({ object: "response.input_tokens", input_tokens: -1 }), { status: 200 }) });
    await expect(malformed.countInputTokens({ request, fingerprint, clientRequestId: "count:request-1" })).rejects.toThrow("count_response_invalid");
    const httpError = createOpenAiDevGatewayV1({ activation: activation(), credential: credential(), fetchImpl: async () => new Response(JSON.stringify({ error: { message: "must-not-surface", type: "invalid_request_error", code: "invalid_json_schema", param: "text.format.schema" } }), { status: 429, headers: { "x-request-id": "req_429" } }) });
    await expect(httpError.countInputTokens({ request, fingerprint, clientRequestId: "count:request-2" })).rejects.toMatchObject({ code: "count_http_error", httpStatus: 429, providerRequestId: "req_429", providerErrorType: "invalid_request_error", providerErrorCode: "invalid_json_schema", providerErrorParam: "text.format.schema" });
  });

  it("returns a known generation HTTP outcome so usage and request identity reach reconciliation", async () => {
    const { request, fingerprint } = await immutableRequest();
    const gateway = createOpenAiDevGatewayV1({
      activation: activation(),
      credential: credential(),
      fetchImpl: async () => new Response("{}", { status: 503, headers: { "x-request-id": "req_response_503" } }),
    });
    await expect(gateway.createResponse({ request, fingerprint, providerAttemptId: "attempt-503", clientRequestId: "attempt:attempt-503" })).resolves.toMatchObject({
      outcome: "known",
      httpStatus: 503,
      providerRequestId: "req_response_503",
    });
  });

  it("exposes adapter methods without retries or an arbitrary URL surface", () => {
    const gateway = createOpenAiDevGatewayV1({ activation: activation(), credential: credential(), fetchImpl: vi.fn() });
    expect(gateway.automaticRetryCount).toBe(0);
    expect(openAiDevGatewayAsOrchestratorTransportsV1(gateway)).toMatchObject({ inputCountTransport: { count: expect.any(Function) }, generationTransport: { execute: expect.any(Function) } });
    expect(gateway).not.toHaveProperty("baseUrl");
  });
});
