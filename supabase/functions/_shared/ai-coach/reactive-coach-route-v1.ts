import type {
  OpenAiCoachSupportedCapabilityV1,
} from "./openai-coach-request-v1.ts";

import {
  isCoachConversationFollowUpV1,
} from "../ai-coach.bundle.js";

import type {
  CoachConversationInputV1,
} from "../../../../packages/domain/src/ai-coach/conversation-intelligence-v1.ts";

export const REACTIVE_COACH_ROUTE_V1_VERSION =
  "reactive-coach-route-v1" as const;

export const REACTIVE_COACH_UX_STATES_V1 = [
  "FACT",
  "EXPLANATION",
  "HYPOTHESIS",
  "NEEDS_CLARIFICATION",
  "UNKNOWN_OR_BLOCKED",
  "PROPOSAL_AVAILABLE",
  "PROPOSAL_UNAVAILABLE",
  "STALE_OR_EXPIRED",
  "COST_LIMITED",
  "OUT_OF_SCOPE",
] as const;

export type ReactiveCoachUxStateV1 =
  (typeof REACTIVE_COACH_UX_STATES_V1)[number];

export type ReactiveCoachExecutionTierV1 =
  | "T0_DETERMINISTIC"
  | "PROVIDER_READ_ONLY";

export type ReactiveCoachDeterministicKindV1 =
  | "today_progress"
  | "planner_state_explanation"
  | "out_of_scope_teaching"
  | "out_of_scope_quiz"
  | "planning_change_unavailable"
  | "apply_unavailable"
  | "fatigue_clarification"
  | "material_creation_unavailable"
  | "contextual_correction_unresolved";

export type ReactiveCoachRouteReasonV1 =
  | "exact_today_progress_is_deterministic"
  | "planner_state_uses_canonical_deterministic_explanation"
  | "teaching_is_out_of_scope"
  | "quiz_is_out_of_scope"
  | "chat_apply_has_no_authority"
  | "planning_mutation_requires_future_canonical_flow"
  | "planner_reason_requires_grounded_explanation"
  | "week_question_requires_grounded_analysis"
  | "today_question_requires_grounded_analysis"
  | "subject_question_requires_grounded_analysis"
  | "fatigue_requires_explicit_capacity"
  | "material_creation_requires_reviewed_flow"
  | "contextual_correction_requires_bounded_referent"
  | "proposal_diff_requires_grounded_explanation"
  | "general_question_requires_grounded_analysis";

export interface ReactiveCoachRouteDecisionV1 {
  readonly version:
    typeof REACTIVE_COACH_ROUTE_V1_VERSION;

  readonly state:
    ReactiveCoachUxStateV1;

  readonly executionTier:
    ReactiveCoachExecutionTierV1;

  readonly capability:
    OpenAiCoachSupportedCapabilityV1 | null;

  readonly deterministicKind:
    ReactiveCoachDeterministicKindV1 | null;

  readonly reasonCode:
    ReactiveCoachRouteReasonV1;

  readonly requiresCanonicalContext:
    boolean;

  readonly providerCallAllowed:
    boolean;

  readonly authority: Readonly<{
    readonly serverOwnedSelection: true;
    readonly rawUserTextStored: false;
    readonly plannerMutationAllowed: false;
    readonly taskMutationAllowed: false;
    readonly capacityMutationAllowed: false;
    readonly confirmationAllowed: false;
    readonly applyAllowed: false;
  }>;
}

const SUBJECT_TERMS = Object.freeze([
  "matematik",
  "turkce",
  "tarih",
  "cografya",
  "vatandaslik",
  "hukuk",
  "maliye",
  "muhasebe",
  "iktisat",
] as const);

function deepFreeze<T>(value: T): T {
  if (
    value !== null
    && typeof value === "object"
    && !Object.isFrozen(value)
  ) {
    Object.freeze(value);

    for (
      const child
      of Object.values(
        value as Record<string, unknown>,
      )
    ) {
      deepFreeze(child);
    }
  }

  return value;
}

function searchableMessage(
  message: string,
): string {
  return message
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll("ı", "i")
    .toLocaleLowerCase("tr-TR")
    .replace(/\s+/g, " ")
    .trim();
}

function containsAny(
  value: string,
  candidates: readonly string[],
): boolean {
  return candidates.some(
    (candidate) =>
      value.includes(candidate),
  );
}

function decision(
  input: Omit<
    ReactiveCoachRouteDecisionV1,
    "version" | "authority"
  >,
): ReactiveCoachRouteDecisionV1 {
  return deepFreeze({
    version:
      REACTIVE_COACH_ROUTE_V1_VERSION,

    ...input,

    authority: {
      serverOwnedSelection: true,
      rawUserTextStored: false,
      plannerMutationAllowed: false,
      taskMutationAllowed: false,
      capacityMutationAllowed: false,
      confirmationAllowed: false,
      applyAllowed: false,
    },
  });
}

export function routeReactiveCoachRequestV1(
  rawMessage: string,
  conversation: CoachConversationInputV1 | null = null,
): ReactiveCoachRouteDecisionV1 {
  if (
    typeof rawMessage !== "string"
    || !rawMessage.trim()
  ) {
    throw new Error(
      "REACTIVE_COACH_MESSAGE_REQUIRED",
    );
  }

  if (rawMessage.length > 2_000) {
    throw new Error(
      "REACTIVE_COACH_MESSAGE_TOO_LONG",
    );
  }

  const message =
    searchableMessage(rawMessage);

  if (
    isCoachConversationFollowUpV1(message)
    && conversation
    && conversation.recentTurns.length > 0
  ) {
    const previousUser =
      [...conversation.recentTurns]
        .reverse()
        .find(
          (turn) =>
            turn.role === "user",
        );

    if (previousUser) {
      const previous =
        searchableMessage(
          previousUser.text,
        );

      if (
        SUBJECT_TERMS.some(
          (term) =>
            previous.includes(term),
        )
      ) {
        return decision({
          state: "EXPLANATION",
          executionTier:
            "PROVIDER_READ_ONLY",
          capability:
            "subject_analysis",
          deterministicKind:
            null,
          reasonCode:
            "subject_question_requires_grounded_analysis",
          requiresCanonicalContext:
            true,
          providerCallAllowed:
            true,
        });
      }

      if (
        previous.includes("planner")
        || previous.includes("plan")
      ) {
        return decision({
          state: "EXPLANATION",
          executionTier:
            "T0_DETERMINISTIC",
          capability:
            null,
          deterministicKind:
            "planner_state_explanation",
          reasonCode:
            "planner_state_uses_canonical_deterministic_explanation",
          requiresCanonicalContext:
            true,
          providerCallAllowed:
            false,
        });
      }

      if (previous.includes("bugun")) {
        return decision({
          state: "EXPLANATION",
          executionTier:
            "PROVIDER_READ_ONLY",
          capability:
            "today_analysis",
          deterministicKind:
            null,
          reasonCode:
            "today_question_requires_grounded_analysis",
          requiresCanonicalContext:
            true,
          providerCallAllowed:
            true,
        });
      }

      if (previous.includes("hafta")) {
        return decision({
          state: "EXPLANATION",
          executionTier:
            "PROVIDER_READ_ONLY",
          capability:
            "week_analysis",
          deterministicKind:
            null,
          reasonCode:
            "week_question_requires_grounded_analysis",
          requiresCanonicalContext:
            true,
          providerCallAllowed:
            true,
        });
      }

      return decision({
        state: "EXPLANATION",
        executionTier:
          "PROVIDER_READ_ONLY",
        capability:
          "complex_status_analysis",
        deterministicKind:
          null,
        reasonCode:
          "general_question_requires_grounded_analysis",
        requiresCanonicalContext:
          true,
        providerCallAllowed:
          true,
      });
    }
  }

  const quizRequest =
    containsAny(message, [
      "quiz",
      "mini quiz",
      "soru hazirla",
      "soru uret",
      "test hazirla",
      "test olustur",
      "deneme hazirla",
    ]);

  if (quizRequest) {
    return decision({
      state: "OUT_OF_SCOPE",
      executionTier:
        "T0_DETERMINISTIC",
      capability: null,
      deterministicKind:
        "out_of_scope_quiz",
      reasonCode:
        "quiz_is_out_of_scope",
      requiresCanonicalContext: false,
      providerCallAllowed: false,
    });
  }

  const teachingRequest =
    /\b(konusunu anlat|konuyu anlat|dersi anlat|ders anlat|ogret|soru coz|cozumunu anlat)\b/
      .test(message);

  if (teachingRequest) {
    return decision({
      state: "OUT_OF_SCOPE",
      executionTier:
        "T0_DETERMINISTIC",
      capability: null,
      deterministicKind:
        "out_of_scope_teaching",
      reasonCode:
        "teaching_is_out_of_scope",
      requiresCanonicalContext: false,
      providerCallAllowed: false,
    });
  }

  const chatApplyAttempt =
    /\b(uygula|onayla)\b/
      .test(message)
    || /^(evet|tamam)$/.test(message);

  if (chatApplyAttempt) {
    return decision({
      state:
        "PROPOSAL_UNAVAILABLE",
      executionTier:
        "T0_DETERMINISTIC",
      capability: null,
      deterministicKind:
        "apply_unavailable",
      reasonCode:
        "chat_apply_has_no_authority",
      requiresCanonicalContext: false,
      providerCallAllowed: false,
    });
  }

  const materialCreationRequest =
    containsAny(message, [
      "kaynaklara ekle",
      "kaynaklara ekley",
      "kaynak ekle",
      "kaynak olarak ekle",
    ]);

  if (materialCreationRequest) {
    return decision({
      state:
        "UNKNOWN_OR_BLOCKED",
      executionTier:
        "T0_DETERMINISTIC",
      capability: null,
      deterministicKind:
        "material_creation_unavailable",
      reasonCode:
        "material_creation_requires_reviewed_flow",
      requiresCanonicalContext: false,
      providerCallAllowed: false,
    });
  }

  const fatigueWithoutMeasurableCapacity =
    message.includes("yorgun")
    && containsAny(message, [
      "en hafif",
      "hafif dersi",
      "dersi birak",
      "gorevi birak",
    ]);

  if (fatigueWithoutMeasurableCapacity) {
    return decision({
      state:
        "NEEDS_CLARIFICATION",
      executionTier:
        "T0_DETERMINISTIC",
      capability: null,
      deterministicKind:
        "fatigue_clarification",
      reasonCode:
        "fatigue_requires_explicit_capacity",
      requiresCanonicalContext: false,
      providerCallAllowed: false,
    });
  }

  const contextualCorrectionRequest =
    message.includes(" degil ")
    && containsAny(message, [
      " onu ",
      " bunu ",
      "onu cuma",
      "bunu cuma",
      "onu yarin",
      "bunu yarin",
    ])
    && containsAny(message, [
      "olsun",
      "yapalim",
    ]);

  if (contextualCorrectionRequest) {
    return decision({
      state:
        "NEEDS_CLARIFICATION",
      executionTier:
        "T0_DETERMINISTIC",
      capability: null,
      deterministicKind:
        "contextual_correction_unresolved",
      reasonCode:
        "contextual_correction_requires_bounded_referent",
      requiresCanonicalContext: false,
      providerCallAllowed: false,
    });
  }
  const planningMutationRequest =
    /\b(tasi|iptal et|plani duzelt|planimi duzelt|calisamayacagim|calisamam)\b/
      .test(message)
    || containsAny(message, [
      "daha az vaktim",
      "daha fazla vaktim",
      "daha vaktim var",
    ])
    || /\btoplam\s+\d+\s*(dk|dakika|saat)\s+calisabilirim\b/
      .test(message);

  if (planningMutationRequest) {
    return decision({
      state:
        "PROPOSAL_UNAVAILABLE",
      executionTier:
        "T0_DETERMINISTIC",
      capability: null,
      deterministicKind:
        "planning_change_unavailable",
      reasonCode:
        "planning_mutation_requires_future_canonical_flow",
      requiresCanonicalContext: false,
      providerCallAllowed: false,
    });
  }

  const plannerStateQuestion =
    containsAny(message, [
      "planimda sorun var mi",
      "neden plan onizleme oneriyorsun",
      "planner ne goruyor",
      "bu hafta plani yenilemeli miyim",
      "plani yenilemeli miyim",
    ]);

  if (plannerStateQuestion) {
    return decision({
      state: "EXPLANATION",
      executionTier: "T0_DETERMINISTIC",
      capability: "planner_explanation",
      deterministicKind: "planner_state_explanation",
      reasonCode: "planner_state_uses_canonical_deterministic_explanation",
      requiresCanonicalContext: true,
      providerCallAllowed: false,
    });
  }

  const proposalDiffQuestion =
    containsAny(message, [
      "oneri",
      "proposal",
    ])
    && containsAny(message, [
      "neyi degistirecek",
      "tam olarak neyi",
      "ne degisecek",
      "ne degistiriyor",
      "farki ne",
    ]);

  if (proposalDiffQuestion) {
    return decision({
      state: "EXPLANATION",
      executionTier:
        "PROVIDER_READ_ONLY",
      capability:
        "planner_explanation",
      deterministicKind: null,
      reasonCode:
        "proposal_diff_requires_grounded_explanation",
      requiresCanonicalContext: true,
      providerCallAllowed: true,
    });
  }
  const todayProgressQuestion =
    message.includes("bugun")
    && containsAny(message, [
      "kac dakika calistim",
      "ne kadar calistim",
      "plandan ne kaldi",
      "planda ne kaldi",
    ]);

  if (todayProgressQuestion) {
    return decision({
      state: "FACT",
      executionTier:
        "T0_DETERMINISTIC",
      capability:
        "today_analysis",
      deterministicKind:
        "today_progress",
      reasonCode:
        "exact_today_progress_is_deterministic",
      requiresCanonicalContext: true,
      providerCallAllowed: false,
    });
  }

  const plannerReasonQuestion =
    message.includes("neden")
    && containsAny(message, [
      "gorev",
      "kondu",
      "koydun",
      "yerlesti",
      "yerlesmedi",
      "bosluk",
    ]);

  if (plannerReasonQuestion) {
    return decision({
      state: "EXPLANATION",
      executionTier:
        "PROVIDER_READ_ONLY",
      capability:
        "planner_explanation",
      deterministicKind: null,
      reasonCode:
        "planner_reason_requires_grounded_explanation",
      requiresCanonicalContext: true,
      providerCallAllowed: true,
    });
  }

  if (
    containsAny(message, [
      "bu hafta",
      "haftalik",
      "hafta",
    ])
  ) {
    return decision({
      state: "EXPLANATION",
      executionTier:
        "PROVIDER_READ_ONLY",
      capability:
        "week_analysis",
      deterministicKind: null,
      reasonCode:
        "week_question_requires_grounded_analysis",
      requiresCanonicalContext: true,
      providerCallAllowed: true,
    });
  }

  if (message.includes("bugun")) {
    return decision({
      state: "EXPLANATION",
      executionTier:
        "PROVIDER_READ_ONLY",
      capability:
        "today_analysis",
      deterministicKind: null,
      reasonCode:
        "today_question_requires_grounded_analysis",
      requiresCanonicalContext: true,
      providerCallAllowed: true,
    });
  }

  if (
    containsAny(
      message,
      SUBJECT_TERMS,
    )
  ) {
    return decision({
      state: "EXPLANATION",
      executionTier:
        "PROVIDER_READ_ONLY",
      capability:
        "subject_analysis",
      deterministicKind: null,
      reasonCode:
        "subject_question_requires_grounded_analysis",
      requiresCanonicalContext: true,
      providerCallAllowed: true,
    });
  }

  return decision({
    state: "EXPLANATION",
    executionTier:
      "PROVIDER_READ_ONLY",
    capability:
      "complex_status_analysis",
    deterministicKind: null,
    reasonCode:
      "general_question_requires_grounded_analysis",
    requiresCanonicalContext: true,
    providerCallAllowed: true,
  });
}
