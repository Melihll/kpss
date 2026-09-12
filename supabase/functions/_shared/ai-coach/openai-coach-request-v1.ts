import type {
  AiCoachCapabilityV1,
  AiModelRouteDecisionV1,
} from "../../../../packages/domain/src/ai-coach/ai-economics-v1.ts";
import type {
  CoachEvidenceViewV1,
} from "../../../../packages/domain/src/ai-coach/coach-evidence-view-v1.ts";

export const OPENAI_COACH_REQUEST_V1_VERSION = "openai-coach-request-v1" as const;
export const OPENAI_COACH_REQUEST_FINGERPRINT_V1_VERSION = "openai-coach-request-fingerprint-v1" as const;
export const READ_ONLY_COACH_PROMPT_V1_VERSION = "read-only-coach-prompt-v1" as const;
export const GROUNDED_COACH_RESPONSE_V1_VERSION = "grounded-coach-response-v1" as const;

export const OPENAI_COACH_SUPPORTED_CAPABILITIES_V1 = [
  "today_analysis",
  "subject_analysis",
  "week_analysis",
  "planner_explanation",
  "complex_status_analysis",
] as const satisfies readonly AiCoachCapabilityV1[];

export type OpenAiCoachSupportedCapabilityV1 =
  (typeof OPENAI_COACH_SUPPORTED_CAPABILITIES_V1)[number];

export const OPENAI_COACH_RESPONSE_SCHEMA_V1 = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: [
    "answer",
    "sourceFactPaths",
    "acknowledgedUnknowns",
    "staleOrBlockedWarnings",
  ],
  properties: {
    answer: { type: "string" },
    sourceFactPaths: {
      type: "array",
      maxItems: 32,
      items: { type: "string" },
    },
    acknowledgedUnknowns: {
      type: "array",
      maxItems: 32,
      items: { type: "string" },
    },
    staleOrBlockedWarnings: {
      type: "array",
      maxItems: 32,
      items: { type: "string" },
    },
  },
} as const);

export interface OpenAiCoachResponseBodyV1 {
  readonly model: string;
  readonly instructions: string;
  readonly input: readonly [{
    readonly role: "user";
    readonly content: readonly [{
      readonly type: "input_text";
      readonly text: string;
    }];
  }];
  readonly max_output_tokens: number;
  readonly reasoning: Readonly<{ readonly effort: "none" }>;
  readonly text: Readonly<{
    readonly format: Readonly<{
      readonly type: "json_schema";
      readonly name: "grounded_coach_response_v1";
      readonly strict: true;
      readonly schema: typeof OPENAI_COACH_RESPONSE_SCHEMA_V1;
    }>;
    readonly verbosity: "low";
  }>;
  readonly tools: readonly [];
  readonly tool_choice: "none";
  readonly parallel_tool_calls: false;
  readonly store: false;
  readonly truncation: "disabled";
  readonly background: false;
  readonly service_tier: "default";
}

/** Fields accepted by POST /responses/input_tokens for this contract. */
export interface OpenAiCoachInputCountBodyV1 {
  readonly model: string;
  readonly instructions: string;
  readonly input: OpenAiCoachResponseBodyV1["input"];
  readonly reasoning: OpenAiCoachResponseBodyV1["reasoning"];
  readonly text: OpenAiCoachResponseBodyV1["text"];
  readonly tools: readonly [];
  readonly tool_choice: "none";
  readonly parallel_tool_calls: false;
  readonly truncation: "disabled";
}

export interface OpenAiCoachRequestV1 {
  readonly version: typeof OPENAI_COACH_REQUEST_V1_VERSION;
  readonly provider: "openai";
  readonly endpointClass: "global_standard";
  readonly capability: OpenAiCoachSupportedCapabilityV1;
  readonly evidenceVersion: CoachEvidenceViewV1["version"];
  readonly signalVersion: "coach-signal-candidate-v1" | null;
  readonly responseBody: OpenAiCoachResponseBodyV1;
  readonly inputCountBody: OpenAiCoachInputCountBodyV1;
  readonly authority: Readonly<{
    readonly serverOwnedModel: true;
    readonly textOnly: true;
    readonly structuredOutputOnly: true;
    readonly toolsAllowed: false;
    readonly storedByProvider: false;
    readonly truncationAllowed: false;
    readonly mutationAllowed: false;
  }>;
}

export interface OpenAiCoachRequestFingerprintV1 {
  readonly version: typeof OPENAI_COACH_REQUEST_FINGERPRINT_V1_VERSION;
  readonly algorithm: "SHA-256";
  readonly value: string;
  readonly canonicalRequest: string;
  readonly coverage: "complete_generation_request";
  readonly modelId: string;
}

export interface GroundedCoachResponseV1 {
  readonly version: typeof GROUNDED_COACH_RESPONSE_V1_VERSION;
  readonly capability: OpenAiCoachSupportedCapabilityV1;
  readonly answer: string;
  readonly sourceFactPaths: readonly string[];
  readonly acknowledgedUnknowns: readonly string[];
  readonly staleOrBlockedWarnings: readonly string[];
  readonly evidenceVersion: CoachEvidenceViewV1["version"];
  readonly signalVersion: "coach-signal-candidate-v1" | null;
  readonly noMutationPerformed: true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("OPENAI_COACH_REQUEST_NONFINITE_NUMBER");
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) throw new Error("OPENAI_COACH_REQUEST_UNSERIALIZABLE_VALUE");
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => {
      if (value[key] === undefined) throw new Error("OPENAI_COACH_REQUEST_UNDEFINED_VALUE");
      return [key, canonicalize(value[key])];
    }),
  );
}

export function stableCanonicalJsonV1(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function promptInstructions(locale: string): string {
  const language = locale.toLowerCase().startsWith("tr") ? "Türkçe" : locale;
  return [
    `Sözleşme: ${READ_ONLY_COACH_PROMPT_V1_VERSION}.`,
    `Yanıt dili: ${language}.`,
    "Yalnız sağlanan kanıt ve sinyal adaylarını kullan.",
    "Bilinmeyeni bilinen, stale veriyi güncel, blocked veriyi kesin gerçek gibi sunma.",
    "Kanonik sonraki işi, workload'u, görev tarihini, kapasiteyi veya Planner sonucunu hesaplama ya da uydurma.",
    "PLN-002 engeli varken ahead/on-track/behind iddiası kurma.",
    "Görev, plan veya kapasite değiştirildiğini söyleme; bu akış salt okunurdur.",
    "Öğretmenlik, özel ders, quiz ve mastery özellikleri kapsam dışıdır.",
    "Kullanıcı dilinde yalnız durum analizi, ilerleme değerlendirmesi, ders dengesi, çalışma eğilimi ve plan riski ifadelerini kullan; tıbbi veya mastery tanısı dili kullanma.",
    "Her olgusal iddia için yalnız sağlanan sourceFactPaths listesinden referans ver.",
    "Kısa ve yararlı ol; kanıt yeterli değilse sessiz/temkinli kalmak geçerlidir.",
  ].join("\n");
}

export function buildOpenAiCoachRequestV1(input: {
  readonly route: AiModelRouteDecisionV1;
  readonly capability: OpenAiCoachSupportedCapabilityV1;
  readonly evidence: CoachEvidenceViewV1;
  readonly locale: string;
}): OpenAiCoachRequestV1 {
  if (!OPENAI_COACH_SUPPORTED_CAPABILITIES_V1.includes(input.capability)) {
    throw new Error("OPENAI_COACH_CAPABILITY_UNSUPPORTED");
  }
  if (
    input.route.capability !== input.capability
    || input.route.disposition !== "model"
    || input.route.provider !== "openai"
    || input.route.modelId === null
    || input.route.tier === "no_model"
  ) throw new Error("OPENAI_COACH_ROUTE_INVALID");
  if (!input.locale.trim()) throw new Error("OPENAI_COACH_LOCALE_REQUIRED");

  const signalVersion = input.evidence.evidence.signalCandidates?.length
    ? "coach-signal-candidate-v1" as const
    : null;
  const evidencePayload = {
    capability: input.capability,
    evidenceVersion: input.evidence.version,
    signalVersion,
    evidence: input.evidence,
  };
  const responseBody: OpenAiCoachResponseBodyV1 = {
    model: input.route.modelId,
    instructions: promptInstructions(input.locale),
    input: [{
      role: "user",
      content: [{ type: "input_text", text: stableCanonicalJsonV1(evidencePayload) }],
    }],
    max_output_tokens: input.route.maxOutputTokens,
    reasoning: { effort: "none" },
    text: {
      format: {
        type: "json_schema",
        name: "grounded_coach_response_v1",
        strict: true,
        schema: OPENAI_COACH_RESPONSE_SCHEMA_V1,
      },
      verbosity: "low",
    },
    tools: [],
    tool_choice: "none",
    parallel_tool_calls: false,
    store: false,
    truncation: "disabled",
    background: false,
    service_tier: "default",
  };
  const inputCountBody: OpenAiCoachInputCountBodyV1 = {
    model: responseBody.model,
    instructions: responseBody.instructions,
    input: responseBody.input,
    reasoning: responseBody.reasoning,
    text: responseBody.text,
    tools: responseBody.tools,
    tool_choice: responseBody.tool_choice,
    parallel_tool_calls: responseBody.parallel_tool_calls,
    truncation: responseBody.truncation,
  };
  return deepFreeze({
    version: OPENAI_COACH_REQUEST_V1_VERSION,
    provider: "openai",
    endpointClass: "global_standard",
    capability: input.capability,
    evidenceVersion: input.evidence.version,
    signalVersion,
    responseBody,
    inputCountBody,
    authority: {
      serverOwnedModel: true,
      textOnly: true,
      structuredOutputOnly: true,
      toolsAllowed: false,
      storedByProvider: false,
      truncationAllowed: false,
      mutationAllowed: false,
    },
  });
}

export async function fingerprintOpenAiCoachRequestV1(
  request: OpenAiCoachRequestV1,
): Promise<OpenAiCoachRequestFingerprintV1> {
  if (request.version !== OPENAI_COACH_REQUEST_V1_VERSION) {
    throw new Error("OPENAI_COACH_REQUEST_VERSION_UNSUPPORTED");
  }
  const canonicalRequest = stableCanonicalJsonV1(request);
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalRequest),
  );
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return deepFreeze({
    version: OPENAI_COACH_REQUEST_FINGERPRINT_V1_VERSION,
    algorithm: "SHA-256",
    value: `sha256:${hex}`,
    canonicalRequest,
    coverage: "complete_generation_request",
    modelId: request.responseBody.model,
  });
}

function collectSuppliedPaths(value: unknown, path: string, output: Set<string>): void {
  if (
    path
    && (!isRecord(value) && !Array.isArray(value)
      || (isRecord(value) && typeof value.availability === "string"))
  ) output.add(path);
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectSuppliedPaths(item, `${path}[${index}]`, output));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    collectSuppliedPaths(child, path ? `${path}.${key}` : key, output);
  }
}

export function suppliedCoachEvidenceFactPathsV1(evidence: CoachEvidenceViewV1): readonly string[] {
  const output = new Set<string>();
  collectSuppliedPaths(evidence.evidence, "evidence", output);
  return Object.freeze([...output].sort());
}

function stringArray(value: unknown, error: string): readonly string[] {
  if (!Array.isArray(value) || value.length > 32 || value.some((item) => typeof item !== "string" || !item.trim() || item.length > 512)) {
    throw new Error(error);
  }
  const normalized = value.map((item) => String(item));
  if (new Set(normalized).size !== normalized.length) throw new Error(error);
  return normalized;
}

export function validateGroundedCoachResponseV1(input: {
  readonly capability: OpenAiCoachSupportedCapabilityV1;
  readonly evidence: CoachEvidenceViewV1;
  readonly providerValue: unknown;
}): GroundedCoachResponseV1 {
  if (!isRecord(input.providerValue)) throw new Error("GROUNDED_COACH_RESPONSE_INVALID");
  const exactKeys = ["acknowledgedUnknowns", "answer", "sourceFactPaths", "staleOrBlockedWarnings"];
  if (JSON.stringify(Object.keys(input.providerValue).sort()) !== JSON.stringify(exactKeys)) {
    throw new Error("GROUNDED_COACH_RESPONSE_UNKNOWN_FIELD");
  }
  if (typeof input.providerValue.answer !== "string" || !input.providerValue.answer.trim() || input.providerValue.answer.length > 4_000) {
    throw new Error("GROUNDED_COACH_RESPONSE_ANSWER_INVALID");
  }
  const sourceFactPaths = stringArray(input.providerValue.sourceFactPaths, "GROUNDED_COACH_RESPONSE_FACT_REFS_INVALID");
  const acknowledgedUnknowns = stringArray(input.providerValue.acknowledgedUnknowns, "GROUNDED_COACH_RESPONSE_UNKNOWNS_INVALID");
  const staleOrBlockedWarnings = stringArray(input.providerValue.staleOrBlockedWarnings, "GROUNDED_COACH_RESPONSE_WARNINGS_INVALID");
  const supplied = new Set(suppliedCoachEvidenceFactPathsV1(input.evidence));
  if (sourceFactPaths.some((path) => !supplied.has(path))) {
    throw new Error("GROUNDED_COACH_RESPONSE_HALLUCINATED_FACT_REFERENCE");
  }
  const unknownPaths = new Set(input.evidence.unknowns.map((item) => item.path));
  if (acknowledgedUnknowns.some((path) => !unknownPaths.has(path))) {
    throw new Error("GROUNDED_COACH_RESPONSE_HALLUCINATED_UNKNOWN_REFERENCE");
  }
  const blockedOrStale = new Set(
    input.evidence.unknowns
      .filter((item) => item.availability === "blocked" || item.availability === "stale")
      .map((item) => item.path),
  );
  if (staleOrBlockedWarnings.some((path) => !blockedOrStale.has(path))) {
    throw new Error("GROUNDED_COACH_RESPONSE_HALLUCINATED_WARNING_REFERENCE");
  }
  return deepFreeze({
    version: GROUNDED_COACH_RESPONSE_V1_VERSION,
    capability: input.capability,
    answer: input.providerValue.answer,
    sourceFactPaths,
    acknowledgedUnknowns,
    staleOrBlockedWarnings,
    evidenceVersion: input.evidence.version,
    signalVersion: input.evidence.evidence.signalCandidates?.length
      ? "coach-signal-candidate-v1"
      : null,
    noMutationPerformed: true,
  });
}

export function extractOpenAiStructuredResponseValueV1(payload: unknown): unknown {
  if (!isRecord(payload) || !Array.isArray(payload.output)) {
    throw new Error("OPENAI_COACH_PROVIDER_OUTPUT_INVALID");
  }
  const texts: string[] = [];
  for (const item of payload.output) {
    if (!isRecord(item) || item.type !== "message" || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (isRecord(content) && content.type === "output_text" && typeof content.text === "string") {
        texts.push(content.text);
      }
    }
  }
  if (texts.length !== 1) throw new Error("OPENAI_COACH_PROVIDER_OUTPUT_INVALID");
  try {
    return JSON.parse(texts[0]);
  } catch {
    throw new Error("OPENAI_COACH_PROVIDER_OUTPUT_INVALID");
  }
}
