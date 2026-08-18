export const PLANNING_V2_SHADOW_TRIGGERS = Object.freeze([
  "STUDY_COMPLETED",
  "STUDY_DEVIATION",
  "CAPACITY_INCREASE",
  "CAPACITY_DECREASE",
  "MISSED_DAY",
  "MASTERY_CHANGE",
  "WEEKLY_REVIEW",
  "MANUAL_REPLAN",
] as const);

type PlanningV2ShadowTrigger =
  (typeof PLANNING_V2_SHADOW_TRIGGERS)[number];

type Client = any;

interface ShadowDecisionResult {
  readonly snapshotId: string;
  readonly snapshotHash: string;
  readonly decision: string;
  readonly changedTaskCount: number;
  readonly validationValid: boolean;
  readonly applyRecommended: boolean;
  readonly evaluation: {
    readonly currentPlan: {
      readonly feasible: boolean;
      readonly issueCodes: readonly string[];
    };
    readonly v2: {
      readonly movedTaskIds: readonly string[];
      readonly backlogTaskIds: readonly string[];
    };
    readonly stability: {
      readonly changeRatio: number;
    };
  };
}

interface PlanningV2ShadowHandlerDependencies {
  readonly createUserClient: (authorization: string) => Client;
  readonly createServiceClient: () => Client;
  readonly runShadowDecision: (input: {
    readonly client: Client;
    readonly userId: string;
    readonly examProfileId: string;
    readonly currentDate: string;
    readonly trigger: PlanningV2ShadowTrigger;
  }) => Promise<ShadowDecisionResult>;
  readonly currentDate?: () => string;
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
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function errorResponse(
  code: string,
  message: string,
  status: number,
): Response {
  return json({ error: { code, message } }, status);
}

function istanbulDate(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return `${value.year}-${value.month}-${value.day}`;
}

function isIsoDate(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function isTrigger(
  value: unknown,
): value is PlanningV2ShadowTrigger {
  return (
    typeof value === "string" &&
    (PLANNING_V2_SHADOW_TRIGGERS as readonly string[]).includes(value)
  );
}

async function ownsActiveProfile(
  client: Client,
  userId: string,
  examProfileId: string,
): Promise<boolean> {
  const result = await client
    .from("exam_profiles")
    .select("id")
    .eq("id", examProfileId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (result.error) {
    throw new Error("EXAM_PROFILE_OWNERSHIP_LOOKUP_FAILED");
  }

  return Boolean(result.data);
}

export function createPlanningV2ShadowHandler(
  dependencies: PlanningV2ShadowHandlerDependencies,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({
          error: {
            code: "METHOD_NOT_ALLOWED",
            message: "POST required",
          },
        }),
        {
          status: 405,
          headers: {
            ...corsHeaders,
            Allow: "POST, OPTIONS",
            "Content-Type": "application/json",
          },
        },
      );
    }

    const authorization = request.headers.get("Authorization");
    if (!authorization) {
      return errorResponse(
        "UNAUTHORIZED",
        "Authorization required",
        401,
      );
    }

    let body: Record<string, unknown>;
    try {
      const parsed = await request.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return errorResponse("INVALID_REQUEST", "JSON object required", 400);
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return errorResponse("INVALID_JSON", "Valid JSON required", 400);
    }

    const unexpectedFields = Object.keys(body).filter(
      (key) => !["examProfileId", "trigger", "currentDate"].includes(key),
    );
    if (unexpectedFields.length > 0) {
      return errorResponse(
        "INVALID_REQUEST",
        "Only examProfileId, trigger, and currentDate are accepted",
        400,
      );
    }

    const examProfileId = body.examProfileId;
    if (typeof examProfileId !== "string" || examProfileId.trim() === "") {
      return errorResponse(
        "INVALID_EXAM_PROFILE_ID",
        "examProfileId is required",
        400,
      );
    }

    if (!isTrigger(body.trigger)) {
      return errorResponse("INVALID_TRIGGER", "Unsupported trigger", 400);
    }

    const currentDate = body.currentDate ??
      (dependencies.currentDate ?? istanbulDate)();
    if (!isIsoDate(currentDate)) {
      return errorResponse(
        "INVALID_CURRENT_DATE",
        "currentDate must be YYYY-MM-DD",
        400,
      );
    }

    try {
      const userClient = dependencies.createUserClient(authorization);
      const authResult = await userClient.auth.getUser();
      const user = authResult.data?.user;

      if (authResult.error || !user) {
        return errorResponse("UNAUTHORIZED", "Invalid token", 401);
      }

      if (
        !(await ownsActiveProfile(
          userClient,
          user.id,
          examProfileId,
        ))
      ) {
        return errorResponse(
          "FORBIDDEN",
          "Active exam profile not owned by caller",
          403,
        );
      }

      const result = await dependencies.runShadowDecision({
        client: dependencies.createServiceClient(),
        userId: user.id,
        examProfileId,
        currentDate,
        trigger: body.trigger,
      });

      return json({
        shadow: true,
        snapshotId: result.snapshotId,
        snapshotHash: result.snapshotHash,
        decision: result.decision,
        changedTaskCount: result.changedTaskCount,
        validationValid: result.validationValid,
        applyRecommended: result.applyRecommended,
        evaluation: {
          currentPlanFeasible: result.evaluation.currentPlan.feasible,
          issueCodes: result.evaluation.currentPlan.issueCodes,
          changeRatio: result.evaluation.stability.changeRatio,
          movedTaskCount: result.evaluation.v2.movedTaskIds.length,
          backlogTaskCount: result.evaluation.v2.backlogTaskIds.length,
        },
      });
    } catch (caught) {
      console.error(
        "PLANNING_V2_SHADOW_FAILED",
        caught instanceof Error ? caught.message : "unknown error",
      );
      return errorResponse(
        "PLANNING_V2_SHADOW_FAILED",
        "Shadow decision failed",
        500,
      );
    }
  };
}
