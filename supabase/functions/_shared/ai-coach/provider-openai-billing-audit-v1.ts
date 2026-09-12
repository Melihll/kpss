export const AI_OPENAI_BILLING_AUDIT_V1_VERSION =
  "ai-openai-billing-audit-v1-2026-09-12" as const;

export type AiOpenAiBillingAuditStatusV1 =
  | "verified"
  | "unresolved"
  | "not_applicable";

export interface AiOpenAiBillingAuditDecisionV1 {
  readonly fact: string;
  readonly status: AiOpenAiBillingAuditStatusV1;
  readonly decision: string;
  readonly sourceUrls: readonly string[];
  readonly runtimeConsequence: string;
}

const INPUT_COUNT_REFERENCE =
  "https://developers.openai.com/api/reference/typescript/resources/responses/subresources/input_tokens";
const RESPONSES_CREATE_REFERENCE =
  "https://developers.openai.com/api/reference/cli/resources/responses/methods/create";
const API_OVERVIEW_REFERENCE =
  "https://developers.openai.com/api/reference/overview";
const PROMPT_CACHING_REFERENCE =
  "https://developers.openai.com/api/docs/guides/prompt-caching";
const GPT54_MODEL_REFERENCE =
  "https://developers.openai.com/api/docs/models/gpt-5.4";

/**
 * Current official-document audit. Silence is not converted into a billing
 * fact. In particular, the input-token count endpoint is documented but its
 * cost/no-cost treatment is not stated in the reviewed official sources.
 */
export const AI_OPENAI_BILLING_AUDIT_V1 = Object.freeze({
  version: AI_OPENAI_BILLING_AUDIT_V1_VERSION,
  reviewedAt: "2026-09-12T00:00:00.000Z",
  selectedModelFamily: "gpt-5.4",
  decisions: Object.freeze([
    Object.freeze({
      fact: "responses_input_token_count_endpoint_exists",
      status: "verified",
      decision: "POST /responses/input_tokens returns a complete Responses input token count.",
      sourceUrls: Object.freeze([INPUT_COUNT_REFERENCE]),
      runtimeConsequence: "The endpoint is the exact complete-request counting boundary.",
    }),
    Object.freeze({
      fact: "responses_input_token_count_endpoint_billing",
      status: "unresolved",
      decision: "No explicit official cost or no-cost statement was found.",
      sourceUrls: Object.freeze([INPUT_COUNT_REFERENCE]),
      runtimeConsequence: "Real DEV and production count calls remain prohibited before a separately approved modeled treatment exists.",
    }),
    Object.freeze({
      fact: "gpt54_distinct_cache_write_charge",
      status: "not_applicable",
      decision: "Official prompt-caching guidance assigns the separate 1.25x cache-write charge to GPT-5.6 and later; GPT-5.4 has no additional cache-write charge.",
      sourceUrls: Object.freeze([PROMPT_CACHING_REFERENCE, GPT54_MODEL_REFERENCE]),
      runtimeConsequence: "Selected GPT-5.4 routes reserve uncached input at the ordinary rate; a non-zero cache_write_tokens report is still treated as an unexpected invariant violation.",
    }),
    Object.freeze({
      fact: "responses_usage_fields",
      status: "verified",
      decision: "Responses usage exposes input, cached-input detail, cache-write detail, output, reasoning-output detail, and total tokens.",
      sourceUrls: Object.freeze([RESPONSES_CREATE_REFERENCE, PROMPT_CACHING_REFERENCE]),
      runtimeConsequence: "Malformed arithmetic or an unknown billable class fails closed into reconciliation.",
    }),
    Object.freeze({
      fact: "responses_max_output_tokens",
      status: "verified",
      decision: "max_output_tokens is one upper bound covering visible output and reasoning tokens together.",
      sourceUrls: Object.freeze([RESPONSES_CREATE_REFERENCE]),
      runtimeConsequence: "The route-owned value is the complete output/reasoning reservation bound.",
    }),
    Object.freeze({
      fact: "openai_request_identity_headers",
      status: "verified",
      decision: "x-request-id is provider-generated; X-Client-Request-Id is caller-supplied, explicit, ASCII-only, at most 512 characters, and should be unique.",
      sourceUrls: Object.freeze([API_OVERVIEW_REFERENCE]),
      runtimeConsequence: "Both internal client request identity and provider x-request-id are captured without confusing the Responses resource id with the HTTP request id.",
    }),
  ] satisfies readonly AiOpenAiBillingAuditDecisionV1[]),
  inputCountEndpointBilling: "unresolved" as const,
  selectedRoutesCacheWriteTreatment: "documented_no_additional_charge" as const,
  realDevSmokeBillingEligible: false as const,
  productionBillingEligible: false as const,
});

export const AI_OPENAI_REAL_DEV_SMOKE_BILLING_ELIGIBLE_V1 = false as const;
export const AI_OPENAI_PRODUCTION_BILLING_ELIGIBLE_V1 = false as const;
