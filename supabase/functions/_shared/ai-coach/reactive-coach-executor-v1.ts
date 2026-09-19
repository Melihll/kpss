import type {
  CoachContextV1,
} from "../../../../packages/domain/src/ai-coach/coach-context-v1.ts";

import type {
  CoachConversationInputV1,
} from "../../../../packages/domain/src/ai-coach/conversation-intelligence-v1.ts";

import type {
  PlannerCoachExplanationV1,
  PlannerCoachPreviewCapabilityV1,
} from "../../../../packages/domain/src/ai-coach/planner-coach-explanation-v1.ts";

import {
  buildCoachConversationLanguageContextV1,
  buildPlannerCoachExplanationV1,
  resolveCoachConversationReferentV1,
} from "../ai-coach.bundle.js";

import {
  loadCoachContextV1ReadOnly,
} from "../coach-context-v1-readonly.ts";

import {
  runReadOnlyCoachCapabilityV1,
  type ReadOnlyCoachCapabilityResultV1,
  type RunReadOnlyCoachCapabilityInputV1,
} from "./read-only-coach-orchestrator-v1.ts";

import type {
  OpenAiCoachSupportedCapabilityV1,
} from "./openai-coach-request-v1.ts";

import {
  routeReactiveCoachRequestV1,
  type ReactiveCoachDeterministicKindV1,
  type ReactiveCoachRouteDecisionV1,
  type ReactiveCoachUxStateV1,
} from "./reactive-coach-route-v1.ts";


export const REACTIVE_COACH_EXECUTOR_V1_VERSION =
  "reactive-coach-executor-v1" as const;


type Client = any;


export type ReactiveCoachContextLoaderV1 =
  typeof loadCoachContextV1ReadOnly;


export type ReactiveCoachProviderRunnerV1 = (
  input: RunReadOnlyCoachCapabilityInputV1,
) => Promise<ReadOnlyCoachCapabilityResultV1>;


export interface ReactiveCoachExecutorDependenciesV1 {
  readonly loadContext:
    ReactiveCoachContextLoaderV1;

  readonly runProvider:
    ReactiveCoachProviderRunnerV1;
}


export type ReactiveCoachProviderExecutionInputV1 =
  Omit<
    RunReadOnlyCoachCapabilityInputV1,
    | "contextClient"
    | "userId"
    | "examProfileId"
    | "capability"
    | "subjectId"
    | "requestId"
    | "requestedAt"
  >;


export interface ExecuteReactiveCoachRequestInputV1 {
  readonly contextClient:
    Client;

  readonly userId:
    string;

  readonly examProfileId:
    string;

  readonly rawMessage:
    string;

  readonly conversation?:
    CoachConversationInputV1 | null;

  readonly requestId:
    string;

  readonly requestedAt:
    string;

  readonly plannerPreviewCapability?:
    PlannerCoachPreviewCapabilityV1;

  readonly provider?:
    ReactiveCoachProviderExecutionInputV1;

  readonly dependencies?:
    Partial<
      ReactiveCoachExecutorDependenciesV1
    >;
}


export interface ReactiveCoachAnswerV1 {
  readonly state:
    ReactiveCoachUxStateV1;

  readonly executionTier:
    ReactiveCoachRouteDecisionV1["executionTier"];

  readonly capability:
    OpenAiCoachSupportedCapabilityV1 | null;

  readonly deterministicKind:
    ReactiveCoachDeterministicKindV1 | null;

  readonly answer:
    string;

  readonly sourceFactPaths:
    readonly string[];

  readonly acknowledgedUnknowns:
    readonly string[];

  readonly staleOrBlockedWarnings:
    readonly string[];

  readonly providerAttempted:
    boolean;

  readonly providerUsed:
    boolean;

  readonly noMutationPerformed:
    true;

  readonly plannerExplanation?:
    PlannerCoachExplanationV1;
}


export interface ReactiveCoachExecutionResultV1 {
  readonly version:
    typeof REACTIVE_COACH_EXECUTOR_V1_VERSION;

  readonly route:
    ReactiveCoachRouteDecisionV1;

  readonly response:
    ReactiveCoachAnswerV1;

  readonly provider:
    | null
    | Readonly<{
        readonly accounting:
          ReadOnlyCoachCapabilityResultV1["accounting"];

        readonly observability:
          ReadOnlyCoachCapabilityResultV1["observability"];
      }>;
}


const DEFAULT_DEPENDENCIES:
  ReactiveCoachExecutorDependenciesV1 = {
    loadContext:
      loadCoachContextV1ReadOnly,

    runProvider:
      runReadOnlyCoachCapabilityV1,
  };


function deepFreeze<T>(
  value: T,
): T {
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
    .replaceAll("\u0131", "i")
    .toLocaleLowerCase("tr-TR")
    .replace(/\s+/g, " ")
    .trim();
}


function assertContextIdentity(
  context: CoachContextV1,
  input: ExecuteReactiveCoachRequestInputV1,
): void {
  if (
    context.userId !== input.userId
    || context.examProfileId
      !== input.examProfileId
  ) {
    throw new Error(
      "REACTIVE_COACH_CONTEXT_SCOPE_MISMATCH",
    );
  }
}


function staticDeterministicAnswer(
  route: ReactiveCoachRouteDecisionV1,
): ReactiveCoachAnswerV1 {
  if (
    route.deterministicKind
      === "out_of_scope_teaching"
  ) {
    return deepFreeze({
      state:
        "OUT_OF_SCOPE",

      executionTier:
        "T0_DETERMINISTIC",

      capability:
        null,

      deterministicKind:
        "out_of_scope_teaching",

      answer:
        "Bu Coach s\u00fcr\u00fcm\u00fcnde konu anlat\u0131m\u0131 ve \u00f6zel ders kapsam d\u0131\u015f\u0131. \u00c7al\u0131\u015fma plan\u0131n, ilerlemen ve \u00e7al\u0131\u015fma durumun hakk\u0131nda yard\u0131mc\u0131 olabilirim.",

      sourceFactPaths: [],
      acknowledgedUnknowns: [],
      staleOrBlockedWarnings: [],

      providerAttempted:
        false,

      providerUsed:
        false,

      noMutationPerformed:
        true,
    });
  }

  if (
    route.deterministicKind
      === "out_of_scope_quiz"
  ) {
    return deepFreeze({
      state:
        "OUT_OF_SCOPE",

      executionTier:
        "T0_DETERMINISTIC",

      capability:
        null,

      deterministicKind:
        "out_of_scope_quiz",

      answer:
        "Bu Coach s\u00fcr\u00fcm\u00fcnde quiz ve soru \u00fcretimi kapsam d\u0131\u015f\u0131. Plan\u0131n\u0131, ilerlemeni ve \u00e7al\u0131\u015fma durumunu de\u011ferlendirebilirim.",

      sourceFactPaths: [],
      acknowledgedUnknowns: [],
      staleOrBlockedWarnings: [],

      providerAttempted:
        false,

      providerUsed:
        false,

      noMutationPerformed:
        true,
    });
  }

  if (
    route.deterministicKind
      === "apply_unavailable"
  ) {
    return deepFreeze({
      state:
        "PROPOSAL_UNAVAILABLE",

      executionTier:
        "T0_DETERMINISTIC",

      capability:
        null,

      deterministicKind:
        "apply_unavailable",

      answer:
        "Sohbet mesaj\u0131 Confirm veya Apply yetkisi vermez. Bu istek plan\u0131nda veya g\u00f6revlerinde de\u011fi\u015fiklik yapmad\u0131.",

      sourceFactPaths: [],
      acknowledgedUnknowns: [],
      staleOrBlockedWarnings: [],

      providerAttempted:
        false,

      providerUsed:
        false,

      noMutationPerformed:
        true,
    });
  }

  if (
    route.deterministicKind
      === "planning_change_unavailable"
  ) {
    return deepFreeze({
      state:
        "PROPOSAL_UNAVAILABLE",

      executionTier:
        "T0_DETERMINISTIC",

      capability:
        null,

      deterministicKind:
        "planning_change_unavailable",

      answer:
        "Reactive Coach do\u011frudan g\u00f6rev, plan veya kapasite de\u011fi\u015ftirmez. Plan de\u011fi\u015fikli\u011fi yaln\u0131zca canonical Planner proposal ve confirmation ak\u0131\u015f\u0131ndan ge\u00e7ebilir.",

      sourceFactPaths: [],
      acknowledgedUnknowns: [],
      staleOrBlockedWarnings: [],

      providerAttempted:
        false,

      providerUsed:
        false,

      noMutationPerformed:
        true,
    });
  }

  if (
    route.deterministicKind
      === "fatigue_clarification"
  ) {
    return deepFreeze({
      state:
        "NEEDS_CLARIFICATION",
      executionTier:
        "T0_DETERMINISTIC",
      capability: null,
      deterministicKind:
        "fatigue_clarification",
      answer:
        "Hangi görevi bırakacağıma karar veremem ve yorgunluk ifadesini bir kapasite sayısına çeviremem. Bugün toplam kaç dakika ayırabileceğini açıkça belirt. Planın değişmedi.",
      sourceFactPaths: [],
      acknowledgedUnknowns: [],
      staleOrBlockedWarnings: [],
      providerAttempted: false,
      providerUsed: false,
      noMutationPerformed: true,
    });
  }

  if (
    route.deterministicKind
      === "material_creation_unavailable"
  ) {
    return deepFreeze({
      state:
        "UNKNOWN_OR_BLOCKED",
      executionTier:
        "T0_DETERMINISTIC",
      capability: null,
      deterministicKind:
        "material_creation_unavailable",
      answer:
        "Reactive Coach yeni bir kitabı veya kaynağı canonical materyal kataloğuna eklemez. Mevcut eşleşme ya da ayrı incelenmiş materyal akışı gerekir. Kaynaklarda değişiklik yapılmadı.",
      sourceFactPaths: [],
      acknowledgedUnknowns: [
        "canonical_material_match",
      ],
      staleOrBlockedWarnings: [],
      providerAttempted: false,
      providerUsed: false,
      noMutationPerformed: true,
    });
  }

  if (
    route.deterministicKind
      === "contextual_correction_unresolved"
  ) {
    return deepFreeze({
      state:
        "NEEDS_CLARIFICATION",
      executionTier:
        "T0_DETERMINISTIC",
      capability: null,
      deterministicKind:
        "contextual_correction_unresolved",
      answer:
        "Bu mesajdaki referansı önceki konuşma durumuna güvenle bağlayamıyorum. Gün, hedef süre ve istediğin değişikliği açıkça yeniden belirt. Mevcut öneri ve plan değişmedi.",
      sourceFactPaths: [],
      acknowledgedUnknowns: [
        "conversation_referent",
      ],
      staleOrBlockedWarnings: [],
      providerAttempted: false,
      providerUsed: false,
      noMutationPerformed: true,
    });
  }

  throw new Error(
    "REACTIVE_COACH_DETERMINISTIC_KIND_UNSUPPORTED",
  );
}


function todayProgressAnswer(
  context: CoachContextV1,
): ReactiveCoachAnswerV1 {
  const fact =
    context.today;

  if (
    fact.availability !== "known"
    || fact.value === null
  ) {
    const stale =
      fact.availability === "stale";

    return deepFreeze({
      state:
        stale
          ? "STALE_OR_EXPIRED"
          : "UNKNOWN_OR_BLOCKED",

      executionTier:
        "T0_DETERMINISTIC",

      capability:
        "today_analysis",

      deterministicKind:
        "today_progress",

      answer:
        stale
          ? "Bug\u00fcn\u00fcn plan ve \u00e7al\u0131\u015fma verisi g\u00fcncel de\u011fil. Bu nedenle dakika veya kalan i\u015f bilgisi uydurmuyorum."
          : "Bug\u00fcn\u00fcn plan ve \u00e7al\u0131\u015fma verisi \u015fu anda do\u011frulanam\u0131yor. Bu nedenle dakika veya kalan i\u015f bilgisi uydurmuyorum.",

      sourceFactPaths: [],

      acknowledgedUnknowns: [
        "today",
      ],

      staleOrBlockedWarnings:
        stale
          ? ["today"]
          : [],

      providerAttempted:
        false,

      providerUsed:
        false,

      noMutationPerformed:
        true,
    });
  }

  const today =
    fact.value;

  const actualMinutes =
    today.study.actualMinutes;

  const plannedMinutes =
    today.summary.plannedMinutes;

  const remainingMinutes =
    today.summary.remainingMinutes;

  const openTaskCount =
    today.summary.openTaskCount;

  const answer =
    "Bug\u00fcn "
    + actualMinutes
    + " dakika \u00e7al\u0131\u015ft\u0131n. Bug\u00fcnk\u00fc planda "
    + plannedMinutes
    + " dakika vard\u0131; "
    + remainingMinutes
    + " dakika ve "
    + openTaskCount
    + " a\u00e7\u0131k g\u00f6rev kald\u0131.";

  return deepFreeze({
    state:
      "FACT",

    executionTier:
      "T0_DETERMINISTIC",

    capability:
      "today_analysis",

    deterministicKind:
      "today_progress",

    answer,

    sourceFactPaths: [
      "today.value.study.actualMinutes",
      "today.value.summary.plannedMinutes",
      "today.value.summary.remainingMinutes",
      "today.value.summary.openTaskCount",
    ],

    acknowledgedUnknowns: [],
    staleOrBlockedWarnings: [],

    providerAttempted:
      false,

    providerUsed:
      false,

    noMutationPerformed:
      true,
  });
}


function plannerStateExplanationAnswer(
  context: CoachContextV1,
  input: ExecuteReactiveCoachRequestInputV1,
): ReactiveCoachAnswerV1 {
  const explanation =
    buildPlannerCoachExplanationV1({
      planner:
        context.planner,

      previewCapability:
        input.plannerPreviewCapability
        ?? {
          availability: "unknown",
          previewEnabled: false,
          reasonCode:
            "canonical_preview_capability_unknown",
        },

      now:
        input.requestedAt,
    });

  const state:
    ReactiveCoachUxStateV1 =
      explanation.state
        === "STALE_OR_EXPIRED"
        ? "STALE_OR_EXPIRED"
        : explanation.state
          === "UNKNOWN_OR_BLOCKED"
          ? "UNKNOWN_OR_BLOCKED"
          : "EXPLANATION";

  return deepFreeze({
    state,
    executionTier:
      "T0_DETERMINISTIC",
    capability:
      "planner_explanation",
    deterministicKind:
      "planner_state_explanation",
    answer:
      explanation.answer,
    sourceFactPaths:
      explanation.sourceFactPaths,
    acknowledgedUnknowns:
      explanation.acknowledgedUnknowns,
    staleOrBlockedWarnings:
      explanation.staleOrBlockedWarnings,
    providerAttempted:
      false,
    providerUsed:
      false,
    noMutationPerformed:
      true,
    plannerExplanation:
      explanation,
  });
}


function resolveSubjectId(
  context: CoachContextV1,
  rawMessage: string,
): string | null {
  const normalizedMessage =
    searchableMessage(
      rawMessage,
    );

  const matches =
    context.subjects.filter(
      (subject) => {
        const normalizedName =
          searchableMessage(
            subject.subjectName,
          );

        return (
          normalizedName.length > 0
          && normalizedMessage.includes(
            normalizedName,
          )
        );
      },
    );

  if (matches.length !== 1) {
    return null;
  }

  return matches[0].subjectId;
}


function subjectClarificationResult(
  route: ReactiveCoachRouteDecisionV1,
): ReactiveCoachExecutionResultV1 {
  return deepFreeze({
    version:
      REACTIVE_COACH_EXECUTOR_V1_VERSION,

    route,

    response: {
      state:
        "NEEDS_CLARIFICATION",

      executionTier:
        "T0_DETERMINISTIC",

      capability:
        "subject_analysis",

      deterministicKind:
        null,

      answer:
        "Hangi ders i\u00e7in durum analizi istedi\u011fini canonical ders listesiyle g\u00fcvenle e\u015fle\u015ftiremedim. Dersi a\u00e7\u0131k\u00e7a belirt.",

      sourceFactPaths: [],
      acknowledgedUnknowns: [],
      staleOrBlockedWarnings: [],

      providerAttempted:
        false,

      providerUsed:
        false,

      noMutationPerformed:
        true,
    },

    provider:
      null,
  });
}


function safeProviderFailureResult(
  route: ReactiveCoachRouteDecisionV1,
  error: unknown,
): ReactiveCoachExecutionResultV1 {
  const message =
    error instanceof Error
      ? error.message.toUpperCase()
      : "";

  const costLimited =
    message.includes("BUDGET")
    || message.includes("COST")
    || message.includes("HARD_LIMIT")
    || message.includes("NOT_RESERVABLE");

  return deepFreeze({
    version:
      REACTIVE_COACH_EXECUTOR_V1_VERSION,

    route,

    response: {
      state:
        costLimited
          ? "COST_LIMITED"
          : "UNKNOWN_OR_BLOCKED",

      executionTier:
        "PROVIDER_READ_ONLY",

      capability:
        route.capability,

      deterministicKind:
        null,

      answer:
        costLimited
          ? "Bu analiz i\u00e7in model kullan\u0131m\u0131 \u015fu anda maliyet s\u0131n\u0131r\u0131 nedeniyle a\u00e7\u0131lam\u0131yor. Herhangi bir plan veya g\u00f6rev de\u011fi\u015fikli\u011fi yap\u0131lmad\u0131."
          : "Bu analizi \u015fu anda g\u00fcvenilir bi\u00e7imde tamamlayam\u0131yorum. Eksik sonucu tahmin etmiyorum ve herhangi bir plan veya g\u00f6rev de\u011fi\u015fikli\u011fi yapm\u0131yorum.",

      sourceFactPaths: [],

      acknowledgedUnknowns: [
        "provider_response",
      ],

      staleOrBlockedWarnings: [],

      providerAttempted:
        true,

      providerUsed:
        false,

      noMutationPerformed:
        true,
    },

    provider:
      null,
  });
}


function providerSuccessState(
  route: ReactiveCoachRouteDecisionV1,
  result: ReadOnlyCoachCapabilityResultV1,
): ReactiveCoachUxStateV1 {
  if (
    result.response.staleOrBlockedWarnings
      .length > 0
  ) {
    return "STALE_OR_EXPIRED";
  }

  if (
    result.response.sourceFactPaths.length === 0
    && result.response.acknowledgedUnknowns
      .length > 0
  ) {
    return "UNKNOWN_OR_BLOCKED";
  }

  return route.state;
}


export async function executeReactiveCoachRequestV1(
  input: ExecuteReactiveCoachRequestInputV1,
): Promise<ReactiveCoachExecutionResultV1> {
  if (
    !input.userId.trim()
    || !input.examProfileId.trim()
    || !input.requestId.trim()
  ) {
    throw new Error(
      "REACTIVE_COACH_IDENTITY_REQUIRED",
    );
  }

  if (
    Number.isNaN(
      Date.parse(
        input.requestedAt,
      ),
    )
  ) {
    throw new Error(
      "REACTIVE_COACH_REQUESTED_AT_INVALID",
    );
  }

  const route =
    routeReactiveCoachRequestV1(
      input.rawMessage,
      input.conversation ?? null,
    );

  const dependencies:
    ReactiveCoachExecutorDependenciesV1 = {
      ...DEFAULT_DEPENDENCIES,
      ...input.dependencies,
    };

  if (
    route.executionTier
      === "T0_DETERMINISTIC"
    && route.requiresCanonicalContext
      === false
  ) {
    return deepFreeze({
      version:
        REACTIVE_COACH_EXECUTOR_V1_VERSION,

      route,

      response:
        staticDeterministicAnswer(
          route,
        ),

      provider:
        null,
    });
  }

  const context =
    await dependencies.loadContext({
      client:
        input.contextClient,

      userId:
        input.userId,

      requestId:
        input.requestId,

      now:
        new Date(
          input.requestedAt,
        ),
    });

  assertContextIdentity(
    context,
    input,
  );

  const conversationResolution =
    await resolveCoachConversationReferentV1({
      context,
      currentMessage:
        input.rawMessage,
      conversation:
        input.conversation
        ?? null,
    });

  if (
    route.executionTier
      === "T0_DETERMINISTIC"
  ) {
    const response =
      route.deterministicKind
        === "today_progress"
        ? todayProgressAnswer(
            context,
          )
        : route.deterministicKind
            === "planner_state_explanation"
          ? plannerStateExplanationAnswer(
              context,
              input,
            )
          : null;

    if (response === null) {
      throw new Error(
        "REACTIVE_COACH_CONTEXTUAL_T0_KIND_UNSUPPORTED",
      );
    }

    return deepFreeze({
      version:
        REACTIVE_COACH_EXECUTOR_V1_VERSION,

      route,

      response,

      provider:
        null,
    });
  }

  if (
    route.providerCallAllowed !== true
    || route.capability === null
  ) {
    throw new Error(
      "REACTIVE_COACH_PROVIDER_ROUTE_INVALID",
    );
  }

  let subjectId:
    string | undefined;

  if (
    route.capability
      === "subject_analysis"
  ) {
    const explicitSubjectId =
      resolveSubjectId(
        context,
        input.rawMessage,
      );

    const conversationalSubjectId =
      conversationResolution.status
        === "resolved"
      && conversationResolution
        .referent.kind
        === "subject"
        ? conversationResolution
          .referent.subjectId
        : null;

    const resolvedSubjectId =
      explicitSubjectId
      ?? conversationalSubjectId;

    if (
      resolvedSubjectId === null
      || (
        explicitSubjectId === null
        && conversationResolution
          .status === "ambiguous"
      )
    ) {
      return subjectClarificationResult(
        route,
      );
    }

    subjectId =
      resolvedSubjectId;
  }

  if (!input.provider) {
    throw new Error(
      "REACTIVE_COACH_PROVIDER_INPUT_REQUIRED",
    );
  }

  let providerResult:
    ReadOnlyCoachCapabilityResultV1;

  try {
    providerResult =
      await dependencies.runProvider({
        ...input.provider,

        contextClient:
          input.contextClient,

        userId:
          input.userId,

        examProfileId:
          input.examProfileId,

        capability:
          route.capability,

        ...(subjectId
          ? { subjectId }
          : {}),

        requestId:
          input.requestId,

        requestedAt:
          input.requestedAt,

        conversation:
          buildCoachConversationLanguageContextV1({
            currentMessage:
              input.rawMessage,
            conversation:
              input.conversation
              ?? null,
            resolution:
              conversationResolution,
          }),

        dependencies: {
          ...input.provider.dependencies,

          loadContext:
            async () => context,
        },
      });
  }
  catch (error) {
    return safeProviderFailureResult(
      route,
      error,
    );
  }

  if (
    providerResult.noMutationPerformed
      !== true
  ) {
    throw new Error(
      "REACTIVE_COACH_PROVIDER_MUTATION_GUARD_FAILED",
    );
  }

  if (
    providerResult.response.capability
      !== route.capability
  ) {
    throw new Error(
      "REACTIVE_COACH_PROVIDER_CAPABILITY_MISMATCH",
    );
  }

  return deepFreeze({
    version:
      REACTIVE_COACH_EXECUTOR_V1_VERSION,

    route,

    response: {
      state:
        providerSuccessState(
          route,
          providerResult,
        ),

      executionTier:
        "PROVIDER_READ_ONLY",

      capability:
        providerResult.response.capability,

      deterministicKind:
        null,

      answer:
        providerResult.response.answer,

      sourceFactPaths:
        providerResult.response
          .sourceFactPaths,

      acknowledgedUnknowns:
        providerResult.response
          .acknowledgedUnknowns,

      staleOrBlockedWarnings:
        providerResult.response
          .staleOrBlockedWarnings,

      providerAttempted:
        true,

      providerUsed:
        true,

      noMutationPerformed:
        true,
    },

    provider: {
      accounting:
        providerResult.accounting,

      observability:
        providerResult.observability,
    },
  });
}
