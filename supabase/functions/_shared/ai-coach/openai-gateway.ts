import {
  buildAiCoachSystemPromptV1,
} from "../ai-coach.bundle.js";

export const OPENAI_AI_COACH_MODEL = "gpt-5.4-nano";
export const OPENAI_AI_COACH_TIMEOUT_MS = 12_000;
export const OPENAI_AI_COACH_MAX_OUTPUT_TOKENS = 800;

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface OpenAiStudyMessageInputV1 {
  readonly message: string;
  readonly currentDate: string;
  readonly locale?: string;
  readonly knownSubjects?: readonly string[];
  readonly knownCurriculumLabels?: readonly string[];
  readonly materialContext?: readonly {
    readonly resourceName: string;
    readonly remainingPages: number | null;
    readonly remainingVideoMinutes: number | null;
    readonly totalRemainingMinutes: number;
    readonly focus: "PAGE" | "VIDEO" | "MIXED" | "COMPLETE";
  }[];
}

export interface OpenAiGatewayV1Options {
  readonly apiKey: string;
  readonly fetchImpl?: FetchLike;
  readonly baseUrl?: string;
  readonly model?: string;
  readonly timeoutMs?: number;
}

const nullableString = Object.freeze({
  anyOf: [
    { type: "string", maxLength: 500 },
    { type: "null" },
  ],
});

const nullableDate = Object.freeze({
  anyOf: [
    {
      type: "string",
      pattern: "^\\d{4}-\\d{2}-\\d{2}$",
    },
    { type: "null" },
  ],
});

const evidenceBaseProperties = Object.freeze({
  confidence: {
    type: "number",
    minimum: 0,
    maximum: 1,
  },
  effectiveDate: nullableDate,
  subjectHint: nullableString,
  curriculumHint: nullableString,
  reasonCode: nullableString,
});

const evidenceBaseRequired = Object.freeze([
  "type",
  "confidence",
  "effectiveDate",
  "subjectHint",
  "curriculumHint",
  "reasonCode",
]);

export const AI_COACH_INTERPRETATION_JSON_SCHEMA_V1 = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: [
    "intent",
    "confidence",
    "needsClarification",
    "clarificationQuestion",
    "effectiveDate",
    "subjectHint",
    "curriculumHint",
    "reasonCode",
    "evidence",
    "materialCoachingSummary",
  ],
  properties: {
    intent: {
      type: "string",
      enum: [
        "STUDY_FEEDBACK",
        "CAPACITY_CHANGE",
        "MASTERY_FEEDBACK",
        "MISSED_STUDY",
        "GENERAL_COACHING",
      ],
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
    },
    needsClarification: { type: "boolean" },
    clarificationQuestion: nullableString,
    effectiveDate: nullableDate,
    subjectHint: nullableString,
    curriculumHint: nullableString,
    reasonCode: nullableString,
    materialCoachingSummary: nullableString,
    evidence: {
      type: "array",
      maxItems: 8,
      items: {
        anyOf: [
          {
            type: "object",
            additionalProperties: false,
            required: evidenceBaseRequired,
            properties: {
              type: {
                type: "string",
                enum: [
                  "STUDY_DIFFICULTY",
                  "COGNITIVE_FATIGUE",
                  "STUDY_PROGRESS_NOTE",
                  "MASTERY_SELF_REPORT",
                  "MISSED_STUDY_REASON",
                  "GENERAL_COACH_MESSAGE",
                ],
              },
              ...evidenceBaseProperties,
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: [
              ...evidenceBaseRequired,
              "direction",
              "deltaMinutes",
              "targetMinutes",
            ],
            properties: {
              type: {
                type: "string",
                enum: ["CAPACITY_CHANGE_REQUEST"],
              },
              ...evidenceBaseProperties,
              direction: {
                anyOf: [
                  {
                    type: "string",
                    enum: ["INCREASE", "DECREASE"],
                  },
                  { type: "null" },
                ],
              },
              deltaMinutes: {
                anyOf: [
                  { type: "integer", minimum: 1 },
                  { type: "null" },
                ],
              },
              targetMinutes: {
                anyOf: [
                  { type: "integer", minimum: 0 },
                  { type: "null" },
                ],
              },
            },
          },
        ],
      },
    },
  },
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function providerFailure(): Error {
  return new Error("OPENAI_GATEWAY_FAILED");
}

function extractStructuredText(payload: unknown): string {
  if (!isRecord(payload) || payload.status !== "completed") {
    throw providerFailure();
  }

  const candidates: string[] = [];

  if (typeof payload.output_text === "string") {
    candidates.push(payload.output_text);
  }

  if (Array.isArray(payload.output)) {
    for (const outputItem of payload.output) {
      if (!isRecord(outputItem) || outputItem.type !== "message") continue;
      if (!Array.isArray(outputItem.content)) continue;

      for (const content of outputItem.content) {
        if (!isRecord(content)) continue;
        if (content.type === "refusal") throw providerFailure();
        if (content.type === "output_text" && typeof content.text === "string") {
          candidates.push(content.text);
        }
      }
    }
  }

  const usable = [...new Set(
    candidates.map((value) => value.trim()).filter(Boolean),
  )];
  if (usable.length !== 1) throw providerFailure();
  return usable[0]!;
}

export class OpenAiGatewayV1 {
  readonly #apiKey: string;
  readonly #fetchImpl: FetchLike;
  readonly #endpoint: string;
  readonly #model: string;
  readonly #timeoutMs: number;

  constructor(options: OpenAiGatewayV1Options) {
    if (!options.apiKey.trim()) throw providerFailure();
    if (!Number.isFinite(options.timeoutMs ?? OPENAI_AI_COACH_TIMEOUT_MS) ||
        (options.timeoutMs ?? OPENAI_AI_COACH_TIMEOUT_MS) <= 0) {
      throw providerFailure();
    }

    this.#apiKey = options.apiKey;
    this.#fetchImpl = options.fetchImpl ?? fetch;
    this.#endpoint = `${(options.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "")}/responses`;
    this.#model = options.model ?? OPENAI_AI_COACH_MODEL;
    this.#timeoutMs = options.timeoutMs ?? OPENAI_AI_COACH_TIMEOUT_MS;
  }

  async interpretStudyMessage(
    input: OpenAiStudyMessageInputV1,
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);

    try {
      const response = await this.#fetchImpl(this.#endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.#apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.#model,
          store: false,
          reasoning: { effort: "none" },
          max_output_tokens: OPENAI_AI_COACH_MAX_OUTPUT_TOKENS,
          instructions: buildAiCoachSystemPromptV1(),
          input: [{
            role: "user",
            content: [{
              type: "input_text",
              text: JSON.stringify({
                message: input.message,
                currentDate: input.currentDate,
                locale: input.locale ?? "tr-TR",
                knownSubjects: input.knownSubjects ?? [],
                knownCurriculumLabels: input.knownCurriculumLabels ?? [],
                ...(input.materialContext?.length
                  ? { materialContext: input.materialContext }
                  : {}),
              }),
            }],
          }],
          text: {
            format: {
              type: "json_schema",
              name: "ai_coach_interpretation_v1",
              strict: true,
              schema: AI_COACH_INTERPRETATION_JSON_SCHEMA_V1,
            },
          },
        }),
      });

      if (!response.ok) throw providerFailure();

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw providerFailure();
      }

      const structuredText = extractStructuredText(payload);
      try {
        return JSON.parse(structuredText) as unknown;
      } catch {
        throw providerFailure();
      }
    } catch {
      throw providerFailure();
    } finally {
      clearTimeout(timeout);
    }
  }
}
