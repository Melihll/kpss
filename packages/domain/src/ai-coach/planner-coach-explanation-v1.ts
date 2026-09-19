import type {
  CoachContextV1Fact,
  CoachContextV1PlannerExplanationFact,
  CoachContextV1PlannerState,
  CoachContextV1Provenance,
} from "./coach-context-v1";

export const PLANNER_COACH_EXPLANATION_V1_VERSION =
  "planner-coach-explanation-v1" as const;

export const PLANNER_COACH_PREVIEW_HREF =
  "/week#planner-v2-preview" as const;

export type PlannerCoachPreviewCapabilityV1 =
  | Readonly<{
      availability: "known";
      previewEnabled: true;
      reasonCode: "canonical_preview_enabled";
    }>
  | Readonly<{
      availability: "known";
      previewEnabled: false;
      reasonCode: "canonical_preview_disabled";
    }>
  | Readonly<{
      availability: "unknown";
      previewEnabled: false;
      reasonCode: "canonical_preview_capability_unknown";
    }>;

export type PlannerCoachExplanationStateV1 =
  | "CURRENT_PREVIEW"
  | "NO_CURRENT_PREVIEW"
  | "STALE_OR_EXPIRED"
  | "UNKNOWN_OR_BLOCKED";

export type PlannerCoachPreviewActionV1 =
  | Readonly<{
      availability: "available";
      action: "open_existing_planner_v2_preview";
      label: "Planı önizle";
      href: typeof PLANNER_COACH_PREVIEW_HREF;
      reasonCode:
        | "current_preview_review_available"
        | "new_preview_available";
      requiresExplicitUserAction: true;
      autoRunPreview: false;
      confirmsProposal: false;
      appliesProposal: false;
    }>
  | Readonly<{
      availability: "unavailable";
      action: null;
      label: null;
      href: null;
      reasonCode:
        | "canonical_preview_capability_unknown"
        | "canonical_preview_disabled"
        | "planner_evidence_stale"
        | "planner_evidence_unknown"
        | "planner_evidence_blocked";
      requiresExplicitUserAction: true;
      autoRunPreview: false;
      confirmsProposal: false;
      appliesProposal: false;
    }>;

export interface PlannerCoachExplanationV1 {
  readonly version: typeof PLANNER_COACH_EXPLANATION_V1_VERSION;
  readonly state: PlannerCoachExplanationStateV1;
  readonly answer: string;
  readonly currentPreviewExists: boolean;
  readonly lifecycleState: CoachContextV1PlannerState["lifecycleState"] | null;
  readonly canonicalWarningCodes: readonly string[];
  readonly explanationFacts: readonly CoachContextV1PlannerExplanationFact[];
  readonly sourceFactPaths: readonly string[];
  readonly acknowledgedUnknowns: readonly string[];
  readonly staleOrBlockedWarnings: readonly string[];
  readonly provenance: readonly CoachContextV1Provenance[];
  readonly asOf: string | null;
  readonly previewAction: PlannerCoachPreviewActionV1;
  readonly authority: Readonly<{
    mode: "interpretation_and_navigation_only";
    plannerMutationAllowed: false;
    taskMutationAllowed: false;
    capacityMutationAllowed: false;
    proposalCreationAllowed: false;
    confirmationAllowed: false;
    applyAllowed: false;
  }>;
}

export interface BuildPlannerCoachExplanationV1Input {
  readonly planner: CoachContextV1Fact<CoachContextV1PlannerState>;
  readonly previewCapability: PlannerCoachPreviewCapabilityV1;
  readonly now: string;
}

const AUTHORITY = Object.freeze({
  mode: "interpretation_and_navigation_only" as const,
  plannerMutationAllowed: false as const,
  taskMutationAllowed: false as const,
  capacityMutationAllowed: false as const,
  proposalCreationAllowed: false as const,
  confirmationAllowed: false as const,
  applyAllowed: false as const,
});

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function unavailableAction(
  reasonCode: Extract<PlannerCoachPreviewActionV1, { availability: "unavailable" }>["reasonCode"],
): PlannerCoachPreviewActionV1 {
  return {
    availability: "unavailable",
    action: null,
    label: null,
    href: null,
    reasonCode,
    requiresExplicitUserAction: true,
    autoRunPreview: false,
    confirmsProposal: false,
    appliesProposal: false,
  };
}

function availableAction(
  reasonCode: Extract<PlannerCoachPreviewActionV1, { availability: "available" }>["reasonCode"],
): PlannerCoachPreviewActionV1 {
  return {
    availability: "available",
    action: "open_existing_planner_v2_preview",
    label: "Planı önizle",
    href: PLANNER_COACH_PREVIEW_HREF,
    reasonCode,
    requiresExplicitUserAction: true,
    autoRunPreview: false,
    confirmsProposal: false,
    appliesProposal: false,
  };
}

function capabilityAction(
  capability: PlannerCoachPreviewCapabilityV1,
  reasonCode: Extract<PlannerCoachPreviewActionV1, { availability: "available" }>["reasonCode"],
): PlannerCoachPreviewActionV1 {
  if (capability.availability === "unknown") {
    return unavailableAction("canonical_preview_capability_unknown");
  }
  return capability.previewEnabled
    ? availableAction(reasonCode)
    : unavailableAction("canonical_preview_disabled");
}

function result(
  input: Omit<PlannerCoachExplanationV1, "version" | "authority">,
): PlannerCoachExplanationV1 {
  return deepFreeze({
    version: PLANNER_COACH_EXPLANATION_V1_VERSION,
    ...input,
    authority: AUTHORITY,
  });
}

export function buildPlannerCoachExplanationV1(
  input: BuildPlannerCoachExplanationV1Input,
): PlannerCoachExplanationV1 {
  if (!Number.isFinite(Date.parse(input.now))) {
    throw new Error("PLANNER_COACH_EXPLANATION_NOW_INVALID");
  }

  const planner = input.planner;

  if (planner.availability === "stale") {
    return result({
      state: "STALE_OR_EXPIRED",
      answer: "Planner kanıtı güncel değil. Eski kanıta dayanarak planın hakkında sonuç veya önizleme vaadi üretmiyorum.",
      currentPreviewExists: false,
      lifecycleState: planner.value?.lifecycleState ?? null,
      canonicalWarningCodes: [],
      explanationFacts: [],
      sourceFactPaths: [],
      acknowledgedUnknowns: ["planner"],
      staleOrBlockedWarnings: ["planner"],
      provenance: planner.provenance,
      asOf: planner.freshness.asOf,
      previewAction: unavailableAction("planner_evidence_stale"),
    });
  }

  if (planner.availability === "unknown" || planner.availability === "blocked") {
    const blocked = planner.availability === "blocked";
    return result({
      state: "UNKNOWN_OR_BLOCKED",
      answer: "Planner durumu şu anda canonical kanıtla doğrulanamıyor. Planın hakkında sonuç uydurmuyorum.",
      currentPreviewExists: false,
      lifecycleState: null,
      canonicalWarningCodes: [],
      explanationFacts: [],
      sourceFactPaths: [],
      acknowledgedUnknowns: ["planner"],
      staleOrBlockedWarnings: blocked ? ["planner"] : [],
      provenance: planner.provenance,
      asOf: planner.freshness.asOf,
      previewAction: unavailableAction(blocked ? "planner_evidence_blocked" : "planner_evidence_unknown"),
    });
  }

  if (planner.availability === "not_applicable") {
    const previewAction = capabilityAction(input.previewCapability, "new_preview_available");
    return result({
      state: "NO_CURRENT_PREVIEW",
      answer: previewAction.availability === "available"
        ? "Doğrulanmış güncel bir Planner önizlemesi yok. Planın hakkında sonuç uydurmuyorum; istersen mevcut Planner V2 önizleme akışını açabilirsin."
        : "Doğrulanmış güncel bir Planner önizlemesi yok. Planın hakkında sonuç uydurmuyorum ve mevcut capability ile önizleme sunulamıyor.",
      currentPreviewExists: false,
      lifecycleState: null,
      canonicalWarningCodes: [],
      explanationFacts: [],
      sourceFactPaths: [],
      acknowledgedUnknowns: ["planner.currentPreview"],
      staleOrBlockedWarnings: [],
      provenance: planner.provenance,
      asOf: planner.freshness.asOf,
      previewAction,
    });
  }

  const value = planner.value;
  const expiresAt = Date.parse(value.expiresAt);
  const expired = value.lifecycleState === "stale"
    || value.lifecycleState === "expired"
    || (!Number.isFinite(expiresAt) || expiresAt <= Date.parse(input.now));

  if (expired) {
    return result({
      state: "STALE_OR_EXPIRED",
      answer: "Planner önizlemesi eskimiş veya süresi dolmuş. Bu kanıta dayanarak güncel plan sonucu üretmiyorum.",
      currentPreviewExists: false,
      lifecycleState: value.lifecycleState,
      canonicalWarningCodes: [],
      explanationFacts: [],
      sourceFactPaths: [],
      acknowledgedUnknowns: ["planner.currentPreview"],
      staleOrBlockedWarnings: ["planner"],
      provenance: planner.provenance,
      asOf: planner.freshness.asOf,
      previewAction: unavailableAction("planner_evidence_stale"),
    });
  }

  const currentPreviewExists = value.lifecycleState === "generated"
    || value.lifecycleState === "previewed"
    || value.lifecycleState === "confirmed";
  const warningCodes = [...new Set(value.warnings)].sort();
  const previewAction = capabilityAction(
    input.previewCapability,
    currentPreviewExists ? "current_preview_review_available" : "new_preview_available",
  );

  if (!currentPreviewExists) {
    return result({
      state: "NO_CURRENT_PREVIEW",
      answer: previewAction.availability === "available"
        ? "Planner lifecycle kanıtı mevcut, ancak incelenebilir güncel bir önizleme yok. İstersen mevcut Planner V2 önizleme akışını açabilirsin."
        : "Planner lifecycle kanıtı mevcut, ancak incelenebilir güncel bir önizleme yok ve mevcut capability ile önizleme sunulamıyor.",
      currentPreviewExists: false,
      lifecycleState: value.lifecycleState,
      canonicalWarningCodes: [],
      explanationFacts: [],
      sourceFactPaths: ["planner.value.lifecycleState"],
      acknowledgedUnknowns: ["planner.currentPreview"],
      staleOrBlockedWarnings: [],
      provenance: planner.provenance,
      asOf: planner.freshness.asOf,
      previewAction,
    });
  }

  return result({
    state: "CURRENT_PREVIEW",
    answer: warningCodes.length > 0
      ? `Planner'ın güncel önizlemesinde ${warningCodes.length} canonical uyarı var. Ayrıntılar mevcut Planner kanıtından gelir; planında değişiklik yapılmadı.`
      : "Planner'ın güncel önizlemesi var ve canonical uyarı bulunmuyor. Planında değişiklik yapılmadı.",
    currentPreviewExists: true,
    lifecycleState: value.lifecycleState,
    canonicalWarningCodes: warningCodes,
    explanationFacts: value.explanationFacts,
    sourceFactPaths: [
      "planner.value.lifecycleState",
      "planner.value.warnings",
      "planner.value.explanationFacts",
      "planner.value.expiresAt",
    ],
    acknowledgedUnknowns: [],
    staleOrBlockedWarnings: [],
    provenance: planner.provenance,
    asOf: planner.freshness.asOf,
    previewAction,
  });
}
