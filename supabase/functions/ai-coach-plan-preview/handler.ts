import { loadAiCoachMaterialContext } from "../_shared/ai-coach/material-context.ts";
import { AI_COACH_MESSAGE_MAX_LENGTH } from "../ai-coach-interpret/handler.ts";

type Client = any;

interface AiGatewayLike {
  interpretStudyMessage(input: StudyMessageInput): Promise<unknown>;
}

interface MaterialCoachingContextInput {
  readonly resourceName: string;
  readonly remainingPages: number | null;
  readonly remainingVideoMinutes: number | null;
  readonly totalRemainingMinutes: number;
  readonly focus: "PAGE" | "VIDEO" | "MIXED" | "COMPLETE";
}

interface StudyMessageInput {
  readonly message: string;
  readonly currentDate: string;
  readonly locale: "tr-TR";
  readonly materialContext?: readonly MaterialCoachingContextInput[];
}

interface AiInterpretationLike {
  readonly evidence: readonly unknown[];
}

interface AiMappingLike {
  readonly action: string;
  readonly planningTriggerCandidate: string | null;
  readonly [key: string]: unknown;
}

type ExecutionResult =
  | {
      readonly status: "VALID";
      readonly interpretation: AiInterpretationLike;
      readonly mapping: AiMappingLike;
    }
  | {
      readonly status: "NEEDS_CLARIFICATION";
      readonly clarificationQuestion: string;
      readonly interpretation: unknown;
      readonly mapping: null;
    }
  | {
      readonly status: "INVALID";
      readonly issues: readonly unknown[];
      readonly interpretation: null;
      readonly mapping: null;
    }
  | {
      readonly status: "GATEWAY_ERROR";
      readonly error: unknown;
      readonly interpretation: null;
      readonly mapping: null;
    };

type CapacityTrigger = "CAPACITY_INCREASE" | "CAPACITY_DECREASE";

interface ShadowDecisionResult {
  readonly snapshotId: string;
  readonly snapshotHash: string;
  readonly decision: string;
  readonly changedTaskCount: number;
  readonly validationValid: boolean;
  readonly applyRecommended: boolean;
  readonly proposal: {
    readonly moves: readonly {
      readonly taskId: string;
      readonly fromDate: string;
      readonly toDate: string;
      readonly reasonCodes: readonly string[];
    }[];
    readonly backlog: readonly {
      readonly taskId: string;
      readonly fromDate: string | null;
      readonly reasonCodes: readonly string[];
    }[];
  };
  readonly evaluation: {
    readonly currentPlan: {
      readonly feasible: boolean;
      readonly issueCodes: readonly string[];
      readonly availableMinutes: number;
      readonly planningBudgetMinutes: number;
      readonly reserveMinutes: number;
    };
    readonly v2: {
      readonly movedTaskIds: readonly string[];
      readonly backlogTaskIds: readonly string[];
    };
    readonly stability: {
      readonly changeRatio: number;
    };
    readonly capacity: {
      readonly grossMinutes: number;
      readonly reserveMinutes: number;
      readonly planningMinutes: number;
      readonly remainingMinutes: number;
    };
  };
}

interface ShadowPreviewChange {
  readonly changeType: "MOVE" | "BACKLOG";
  readonly taskId: string;
  readonly subjectName: string | null;
  readonly title: string;
  readonly resourceName: string | null;
  readonly remainingMinutes: number;
  readonly fromDate: string | null;
  readonly toDate: string | null;
  readonly reasonCodes: readonly string[];
}

interface AiCoachPlanPreviewDependencies {
  readonly createUserClient: (authorization: string) => Client;
  readonly createShadowClient: () => Client;
  readonly createGateway: () => AiGatewayLike;
  readonly executeAiStudyMessage: (request: {
    readonly gateway: AiGatewayLike;
    readonly input: StudyMessageInput;
  }) => Promise<ExecutionResult>;
  readonly runShadowDecision: (input: {
    readonly client: Client;
    readonly userId: string;
    readonly examProfileId: string;
    readonly currentDate: string;
    readonly trigger: CapacityTrigger;
    readonly hypotheticalCapacityEvent: {
      readonly effectiveDate: string;
      readonly deltaMinutes: number;
    };
  }) => Promise<ShadowDecisionResult>;
  readonly loadCurrentGrossCapacity: (input: {
    readonly client: Client;
    readonly userId: string;
    readonly examProfileId: string;
    readonly currentDate: string;
    readonly effectiveDate: string;
  }) => Promise<number>;
  readonly currentDate?: () => string;
}

type CapacityAdapterResult =
  | { readonly kind: "NO_PREVIEW" }
  | { readonly kind: "INVALID_CANDIDATE" }
  | {
      readonly kind: "TARGET";
      readonly effectiveDate: string;
      readonly targetMinutes: number;
    }
  | {
      readonly kind: "PREVIEW";
      readonly trigger: CapacityTrigger;
      readonly event: {
        readonly effectiveDate: string;
        readonly deltaMinutes: number;
      };
    };

interface TargetCapacityResolution {
  readonly source: "TARGET_MINUTES";
  readonly effectiveDate: string;
  readonly targetMinutes: number;
  readonly currentGrossMinutes: number;
  readonly deltaMinutes: number;
  readonly trigger: CapacityTrigger | null;
  readonly noChange: boolean;
}

const corsHeaders = Object.freeze({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(code: string, message: string, status: number): Response {
  return json({ error: { code, message } }, status);
}

function providerFailureResponse(): Response {
  return json({
    status: "GATEWAY_ERROR",
    error: {
      code: "AI_GATEWAY_FAILED",
      message: "AI interpretation is temporarily unavailable.",
    },
    interpretation: null,
    mapping: null,
    shadowPreview: null,
  }, 503);
}

function istanbulDate(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function ownsProfile(
  client: Client,
  userId: string,
  examProfileId: string,
): Promise<boolean> {
  const result = await client
    .from("exam_profiles")
    .select("id")
    .eq("id", examProfileId)
    .eq("user_id", userId)
    .maybeSingle();

  if (result.error) throw new Error("EXAM_PROFILE_OWNERSHIP_LOOKUP_FAILED");
  return Boolean(result.data);
}

function capacityAdapter(result: Extract<ExecutionResult, { status: "VALID" }>): CapacityAdapterResult {
  const capacityEvidence = result.interpretation.evidence.filter(
    (item) => isRecord(item) && item.type === "CAPACITY_CHANGE_REQUEST",
  );
  if (capacityEvidence.length === 0) return { kind: "NO_PREVIEW" };
  if (capacityEvidence.length !== 1) return { kind: "INVALID_CANDIDATE" };

  const evidence = capacityEvidence[0]!;
  const direction = evidence.direction;
  const deltaMinutes = evidence.deltaMinutes;
  const targetMinutes = evidence.targetMinutes;
  const effectiveDate = evidence.effectiveDate;

  if (typeof effectiveDate !== "string" || effectiveDate === "") {
    return { kind: "INVALID_CANDIDATE" };
  }

  if (
    targetMinutes !== null &&
    targetMinutes !== undefined
  ) {
    if (
      direction !== null && direction !== undefined ||
      deltaMinutes !== null && deltaMinutes !== undefined ||
      typeof targetMinutes !== "number" ||
      !Number.isFinite(targetMinutes) ||
      !Number.isInteger(targetMinutes) ||
      targetMinutes < 0 ||
      result.mapping.action !== "EVIDENCE_ONLY" ||
      result.mapping.planningTriggerCandidate !== null
    ) {
      return { kind: "INVALID_CANDIDATE" };
    }

    return {
      kind: "TARGET",
      effectiveDate,
      targetMinutes,
    };
  }

  if (result.mapping.action !== "PLANNING_TRIGGER_CANDIDATE") {
    return { kind: "NO_PREVIEW" };
  }

  const trigger = result.mapping.planningTriggerCandidate;
  if (trigger !== "CAPACITY_INCREASE" && trigger !== "CAPACITY_DECREASE") {
    return { kind: "INVALID_CANDIDATE" };
  }

  if (
    (direction !== "INCREASE" && direction !== "DECREASE") ||
    typeof deltaMinutes !== "number" ||
    !Number.isFinite(deltaMinutes) ||
    !Number.isInteger(deltaMinutes) ||
    deltaMinutes <= 0
  ) {
    return { kind: "INVALID_CANDIDATE" };
  }

  const expectedTrigger: CapacityTrigger = direction === "INCREASE"
    ? "CAPACITY_INCREASE"
    : "CAPACITY_DECREASE";
  if (trigger !== expectedTrigger) return { kind: "INVALID_CANDIDATE" };

  return {
    kind: "PREVIEW",
    trigger,
    event: {
      effectiveDate,
      deltaMinutes: direction === "INCREASE" ? deltaMinutes : -deltaMinutes,
    },
  };
}

function noPreviewResponse(result: Exclude<ExecutionResult, { status: "GATEWAY_ERROR" }>): Response {
  if (result.status === "INVALID") {
    return json({
      status: result.status,
      issues: result.issues,
      interpretation: null,
      mapping: null,
      shadowPreview: null,
    });
  }
  if (result.status === "NEEDS_CLARIFICATION") {
    return json({
      status: result.status,
      clarificationQuestion: result.clarificationQuestion,
      interpretation: result.interpretation,
      mapping: null,
      shadowPreview: null,
    });
  }
  return json({
    status: result.status,
    interpretation: result.interpretation,
    mapping: result.mapping,
    shadowPreview: null,
  });
}

function nestedName(value: unknown): string | null {
  if (Array.isArray(value)) {
    const first = value[0];
    return isRecord(first) && typeof first.name === "string" ? first.name : null;
  }
  return isRecord(value) && typeof value.name === "string" ? value.name : null;
}

function completedMinutes(value: unknown): number {
  const row = Array.isArray(value) ? value[0] : value;
  if (!isRecord(row)) return 0;
  const raw = row.completed_minutes;
  return typeof raw === "number" && Number.isFinite(raw) ? Math.max(0, raw) : 0;
}

async function loadShadowPreviewChanges(
  client: Client,
  userId: string,
  examProfileId: string,
  result: ShadowDecisionResult,
): Promise<readonly ShadowPreviewChange[]> {
  const proposalChanges = [
    ...result.proposal.moves.map((move) => ({
      changeType: "MOVE" as const,
      taskId: move.taskId,
      fromDate: move.fromDate,
      toDate: move.toDate,
      reasonCodes: move.reasonCodes,
    })),
    ...result.proposal.backlog.map((item) => ({
      changeType: "BACKLOG" as const,
      taskId: item.taskId,
      fromDate: item.fromDate,
      toDate: null,
      reasonCodes: item.reasonCodes,
    })),
  ];
  if (proposalChanges.length === 0) return Object.freeze([]);

  const taskIds = [...new Set(proposalChanges.map((item) => item.taskId))];
  const taskResult = await client
    .from("tasks")
    .select("id,title,estimated_minutes,subjects(name),resources(name),task_progress(completed_minutes)")
    .eq("user_id", userId)
    .eq("exam_profile_id", examProfileId)
    .in("id", taskIds);

  if (taskResult.error) throw new Error("AI_COACH_TASK_PREVIEW_LOOKUP_FAILED");

  const rows = new Map<string, Record<string, unknown>>();
  for (const raw of taskResult.data ?? []) {
    if (isRecord(raw) && typeof raw.id === "string") rows.set(raw.id, raw);
  }

  const seen = new Set<string>();
  const changes: ShadowPreviewChange[] = [];
  for (const item of proposalChanges) {
    if (seen.has(item.taskId)) continue;
    seen.add(item.taskId);

    const row = rows.get(item.taskId);
    if (!row || typeof row.title !== "string") continue;
    const estimated = typeof row.estimated_minutes === "number" && Number.isFinite(row.estimated_minutes)
      ? Math.max(0, row.estimated_minutes)
      : 0;

    changes.push(Object.freeze({
      changeType: item.changeType,
      taskId: item.taskId,
      subjectName: nestedName(row.subjects),
      title: row.title,
      resourceName: nestedName(row.resources),
      remainingMinutes: Math.max(0, estimated - completedMinutes(row.task_progress)),
      fromDate: item.fromDate,
      toDate: item.toDate,
      reasonCodes: Object.freeze([...item.reasonCodes]),
    }));
  }

  return Object.freeze(changes);
}

function shadowPreview(
  result: ShadowDecisionResult,
  changes: readonly ShadowPreviewChange[],
): Record<string, unknown> {
  return {
    previewOnly: true,
    snapshotId: result.snapshotId,
    snapshotHash: result.snapshotHash,
    decision: result.decision,
    changedTaskCount: result.changedTaskCount,
    validationValid: result.validationValid,
    applyRecommended: result.applyRecommended,
    changes,
    changeDetailsComplete: changes.length === result.changedTaskCount,
    evaluation: {
      currentPlanFeasible: result.evaluation.currentPlan.feasible,
      issueCodes: result.evaluation.currentPlan.issueCodes,
      availableMinutes: result.evaluation.currentPlan.availableMinutes,
      planningBudgetMinutes: result.evaluation.currentPlan.planningBudgetMinutes,
      reserveMinutes: result.evaluation.currentPlan.reserveMinutes,
      capacity: result.evaluation.capacity,
      changeRatio: result.evaluation.stability.changeRatio,
      movedTaskCount: result.evaluation.v2.movedTaskIds.length,
      backlogTaskCount: result.evaluation.v2.backlogTaskIds.length,
    },
  };
}

export function createAiCoachPlanPreviewHandler(
  dependencies: AiCoachPlanPreviewDependencies,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (request.method !== "POST") {
      return errorResponse("METHOD_NOT_ALLOWED", "POST required", 405);
    }

    const authorization = request.headers.get("Authorization");
    if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) {
      return errorResponse("UNAUTHORIZED", "Valid Bearer authorization required", 401);
    }

    let body: Record<string, unknown>;
    try {
      const parsed = await request.json();
      if (!isRecord(parsed)) {
        return errorResponse("INVALID_REQUEST", "JSON object required", 400);
      }
      body = parsed;
    } catch {
      return errorResponse("INVALID_JSON", "Valid JSON required", 400);
    }

    if (Object.keys(body).some((key) => !["examProfileId", "message"].includes(key))) {
      return errorResponse(
        "INVALID_REQUEST",
        "Only examProfileId and message are accepted",
        400,
      );
    }
    if (!isUuid(body.examProfileId)) {
      return errorResponse("INVALID_EXAM_PROFILE_ID", "Valid examProfileId required", 400);
    }
    if (typeof body.message !== "string" || body.message.trim() === "") {
      return errorResponse("INVALID_MESSAGE", "Non-blank message required", 400);
    }
    if (body.message.length > AI_COACH_MESSAGE_MAX_LENGTH) {
      return errorResponse("MESSAGE_TOO_LONG", "Message exceeds 2000 characters", 400);
    }

    let userId: string;
    let userClient: Client;
    try {
      userClient = dependencies.createUserClient(authorization);
      const authResult = await userClient.auth.getUser();
      const user = authResult.data?.user;
      if (authResult.error || !user) {
        return errorResponse("UNAUTHORIZED", "Invalid token", 401);
      }
      userId = user.id;
      if (!(await ownsProfile(userClient, userId, body.examProfileId))) {
        return errorResponse("FORBIDDEN", "Exam profile not owned by caller", 403);
      }
    } catch {
      return errorResponse("AI_COACH_PLAN_PREVIEW_FAILED", "Request could not be processed", 500);
    }

    const currentDate = (dependencies.currentDate ?? istanbulDate)();

    let materialContext: readonly MaterialCoachingContextInput[] = [];
    try {
      materialContext = await loadAiCoachMaterialContext(
        userClient,
        userId,
        body.examProfileId,
      );
    } catch {
      console.warn("AI_COACH_MATERIAL_CONTEXT_LOOKUP_FAILED");
    }

    let aiResult: ExecutionResult;
    try {
      aiResult = await dependencies.executeAiStudyMessage({
        gateway: dependencies.createGateway(),
        input: {
          message: body.message.trim(),
          currentDate,
          locale: "tr-TR",
          materialContext,
        },
      });
    } catch {
      return providerFailureResponse();
    }

    if (aiResult.status === "GATEWAY_ERROR") return providerFailureResponse();
    if (aiResult.status !== "VALID") return noPreviewResponse(aiResult);

    const adapted = capacityAdapter(aiResult);
    if (adapted.kind === "NO_PREVIEW") return noPreviewResponse(aiResult);
    if (adapted.kind === "INVALID_CANDIDATE") {
      return json({
        status: "VALID",
        interpretation: aiResult.interpretation,
        mapping: aiResult.mapping,
        shadowPreview: null,
        error: {
          code: "AI_SHADOW_CANDIDATE_INVALID",
          message: "Validated capacity candidate is inconsistent.",
        },
      }, 422);
    }

    let previewTrigger: CapacityTrigger;
    let previewEvent: { readonly effectiveDate: string; readonly deltaMinutes: number };
    let capacityResolution: TargetCapacityResolution | null = null;

    if (adapted.kind === "TARGET") {
      let currentGrossMinutes: number;
      try {
        currentGrossMinutes = await dependencies.loadCurrentGrossCapacity({
          client: userClient,
          userId,
          examProfileId: body.examProfileId,
          currentDate,
          effectiveDate: adapted.effectiveDate,
        });
      } catch {
        return json({
          status: "VALID",
          interpretation: aiResult.interpretation,
          mapping: aiResult.mapping,
          capacityResolution: null,
          shadowPreview: null,
          error: {
            code: "TARGET_CAPACITY_RESOLUTION_FAILED",
            message: "Current daily capacity could not be resolved safely.",
          },
        }, 422);
      }

      if (!Number.isFinite(currentGrossMinutes) || currentGrossMinutes < 0) {
        return json({
          status: "VALID",
          interpretation: aiResult.interpretation,
          mapping: aiResult.mapping,
          capacityResolution: null,
          shadowPreview: null,
          error: {
            code: "TARGET_CAPACITY_RESOLUTION_FAILED",
            message: "Current daily capacity could not be resolved safely.",
          },
        }, 422);
      }

      const normalizedCurrentGross = Math.round(currentGrossMinutes);
      const deltaMinutes = adapted.targetMinutes - normalizedCurrentGross;
      const trigger = deltaMinutes === 0
        ? null
        : deltaMinutes > 0
        ? "CAPACITY_INCREASE"
        : "CAPACITY_DECREASE";

      capacityResolution = Object.freeze({
        source: "TARGET_MINUTES",
        effectiveDate: adapted.effectiveDate,
        targetMinutes: adapted.targetMinutes,
        currentGrossMinutes: normalizedCurrentGross,
        deltaMinutes,
        trigger,
        noChange: deltaMinutes === 0,
      });

      if (deltaMinutes === 0) {
        return json({
          status: "VALID",
          interpretation: aiResult.interpretation,
          mapping: aiResult.mapping,
          capacityResolution,
          shadowPreview: null,
        });
      }

      previewTrigger = trigger!;
      previewEvent = {
        effectiveDate: adapted.effectiveDate,
        deltaMinutes,
      };
    } else {
      previewTrigger = adapted.trigger;
      previewEvent = adapted.event;
    }

    try {
      const result = await dependencies.runShadowDecision({
        client: dependencies.createShadowClient(),
        userId,
        examProfileId: body.examProfileId,
        currentDate,
        trigger: previewTrigger,
        hypotheticalCapacityEvent: previewEvent,
      });
      let changes: readonly ShadowPreviewChange[] = Object.freeze([]);
      try {
        changes = await loadShadowPreviewChanges(
          userClient,
          userId,
          body.examProfileId,
          result,
        );
      } catch {
        console.error("AI_COACH_PREVIEW_DETAIL_LOOKUP_FAILED");
      }

      return json({
        status: "VALID",
        interpretation: aiResult.interpretation,
        mapping: aiResult.mapping,
        capacityResolution,
        shadowPreview: shadowPreview(result, changes),
      });
    } catch {
      return json({
        status: "VALID",
        interpretation: aiResult.interpretation,
        mapping: aiResult.mapping,
        capacityResolution,
        shadowPreview: null,
        error: {
          code: "SHADOW_PREVIEW_REJECTED",
          message: "Capacity preview could not be evaluated.",
        },
      }, 422);
    }
  };
}
