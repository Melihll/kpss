import {
  mapAiInterpretationToDomainEventV1,
  type AiDomainEventCandidateV1,
} from "./event-mapper";
import type {
  AiGatewayV1,
  AiInterpretationV1,
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

  return Object.freeze({
    status: "VALID",
    interpretation: validation.value,
    mapping: mapAiInterpretationToDomainEventV1(validation.value),
  });
}
