import {
  mapAiInterpretationToDomainEventV1,
  type AiDomainEventCandidateV1,
} from "./event-mapper";
import type {
  AiGatewayV1,
  AiInterpretationV1,
  AiMaterialCoachingContextV1,
  AiValidationIssueV1,
  StudyMessageInputV1,
} from "./types";
import {
  validateAiInterpretationV1,
} from "./validation";

export type AiStudyMessageExecutionResultV1 =
  | {
      readonly status: "VALID";
      readonly interpretation: AiInterpretationV1;
      readonly mapping: AiDomainEventCandidateV1;
    }
  | {
      readonly status: "NEEDS_CLARIFICATION";
      readonly clarificationQuestion: string;
      readonly interpretation: AiInterpretationV1;
      readonly mapping: null;
    }
  | {
      readonly status: "INVALID";
      readonly issues: readonly AiValidationIssueV1[];
      readonly interpretation: null;
      readonly mapping: null;
    }
  | {
      readonly status: "GATEWAY_ERROR";
      readonly error: {
        readonly code: "AI_GATEWAY_FAILED";
        readonly message: "AI interpretation is temporarily unavailable.";
      };
      readonly interpretation: null;
      readonly mapping: null;
    };

function materialSummaryIssue(
  interpretation: AiInterpretationV1,
  context: readonly AiMaterialCoachingContextV1[] | undefined,
): AiValidationIssueV1 | null {
  const summary = interpretation.materialCoachingSummary?.trim() ?? "";
  if (!summary) return null;

  if (!context?.length) {
    return Object.freeze({
      path: "$.materialCoachingSummary",
      code: "MATERIAL_CONTEXT_REQUIRED",
      message: "Material coaching requires deterministic material context.",
    });
  }

  if (summary.includes("%")) {
    return Object.freeze({
      path: "$.materialCoachingSummary",
      code: "UNSUPPORTED_MATERIAL_PERCENT",
      message: "Material coaching must not invent progress percentages.",
    });
  }

  const allowedNumbers = new Set<string>();
  for (const item of context) {
    for (const value of [
      item.remainingPages,
      item.remainingVideoMinutes,
      item.totalRemainingMinutes,
    ]) {
      if (typeof value === "number" && Number.isFinite(value)) {
        allowedNumbers.add(String(Math.max(0, Math.round(value))));
      }
    }
    for (const token of item.resourceName.match(/\d+/g) ?? []) {
      allowedNumbers.add(String(Number(token)));
    }
  }

  for (const token of summary.match(/\d+/g) ?? []) {
    if (!allowedNumbers.has(String(Number(token)))) {
      return Object.freeze({
        path: "$.materialCoachingSummary",
        code: "UNSUPPORTED_MATERIAL_NUMBER",
        message: "Material coaching may only repeat deterministic material numbers.",
      });
    }
  }

  return null;
}

export interface ExecuteAiStudyMessageInputV1 {
  readonly gateway: AiGatewayV1;
  readonly input: StudyMessageInputV1;
}

export async function executeAiStudyMessageV1(
  request: ExecuteAiStudyMessageInputV1,
): Promise<AiStudyMessageExecutionResultV1> {
  let untrustedProviderOutput: unknown;

  try {
    untrustedProviderOutput = await request.gateway.interpretStudyMessage(
      request.input,
    );
  } catch {
    return Object.freeze({
      status: "GATEWAY_ERROR",
      error: Object.freeze({
        code: "AI_GATEWAY_FAILED",
        message: "AI interpretation is temporarily unavailable.",
      }),
      interpretation: null,
      mapping: null,
    });
  }

  const validation = validateAiInterpretationV1(untrustedProviderOutput);

  if (validation.status === "INVALID") {
    return Object.freeze({
      status: "INVALID",
      issues: validation.issues,
      interpretation: null,
      mapping: null,
    });
  }

  if (validation.status === "NEEDS_CLARIFICATION") {
    return Object.freeze({
      status: "NEEDS_CLARIFICATION",
      clarificationQuestion:
        validation.value.clarificationQuestion ??
        "Please clarify your study request.",
      interpretation: validation.value,
      mapping: null,
    });
  }

  const materialIssue = materialSummaryIssue(
    validation.value,
    request.input.materialContext,
  );
  if (materialIssue) {
    return Object.freeze({
      status: "INVALID",
      issues: Object.freeze([materialIssue]),
      interpretation: null,
      mapping: null,
    });
  }

  return Object.freeze({
    status: "VALID",
    interpretation: validation.value,
    mapping: mapAiInterpretationToDomainEventV1(validation.value),
  });
}
