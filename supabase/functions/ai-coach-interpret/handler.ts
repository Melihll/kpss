type Client = any;

interface AiGatewayLike {
  interpretStudyMessage(input: StudyMessageInput): Promise<unknown>;
}

interface StudyMessageInput {
  readonly message: string;
  readonly currentDate: string;
  readonly locale: "tr-TR";
}

type ExecutionResult =
  | {
      readonly status: "VALID";
      readonly interpretation: unknown;
      readonly mapping: unknown;
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

interface AiCoachInterpretHandlerDependencies {
  readonly createUserClient: (authorization: string) => Client;
  readonly createGateway: () => AiGatewayLike;
  readonly executeAiStudyMessage: (request: {
    readonly gateway: AiGatewayLike;
    readonly input: StudyMessageInput;
  }) => Promise<ExecutionResult>;
  readonly currentDate?: () => string;
}

export const AI_COACH_MESSAGE_MAX_LENGTH = 2_000;

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

  if (result.error) {
    throw new Error("EXAM_PROFILE_OWNERSHIP_LOOKUP_FAILED");
  }

  return Boolean(result.data);
}

function safeExecutionResponse(result: ExecutionResult): Response {
  switch (result.status) {
    case "VALID":
      return json({
        status: result.status,
        interpretation: result.interpretation,
        mapping: result.mapping,
      });
    case "NEEDS_CLARIFICATION":
      return json({
        status: result.status,
        clarificationQuestion: result.clarificationQuestion,
        interpretation: result.interpretation,
        mapping: null,
      });
    case "INVALID":
      return json({
        status: result.status,
        issues: result.issues,
        interpretation: null,
        mapping: null,
      });
    case "GATEWAY_ERROR":
      return providerFailureResponse();
  }
}

export function createAiCoachInterpretHandler(
  dependencies: AiCoachInterpretHandlerDependencies,
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
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return errorResponse("INVALID_REQUEST", "JSON object required", 400);
      }
      body = parsed as Record<string, unknown>;
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

    let userClient: Client;
    let userId: string;
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
      return errorResponse("AI_COACH_INTERPRET_FAILED", "Request could not be processed", 500);
    }

    try {
      const result = await dependencies.executeAiStudyMessage({
        gateway: dependencies.createGateway(),
        input: {
          message: body.message.trim(),
          currentDate: (dependencies.currentDate ?? istanbulDate)(),
          locale: "tr-TR",
        },
      });
      return safeExecutionResponse(result);
    } catch {
      return providerFailureResponse();
    }
  };
}
