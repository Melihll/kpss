import {
  normalizeProactiveCoachSurfaceSessionIdV1,
  runProactiveCoachRuntimeV1,
  type ProactiveCoachRuntimeDependenciesV1,
  type ProactiveCoachRuntimeResultV1,
} from "./proactive-coach-runtime-v1.ts";

export const PROACTIVE_COACH_HTTP_V1_VERSION =
  "proactive-coach-http-v1" as const;

type Client = any;

export interface HandleProactiveCoachHttpInputV1 {
  readonly body: unknown;
  readonly contextClient: Client;
  readonly userId: string;
  readonly examProfileId: string;
  readonly currentDate: string;
  readonly requestId: string;
  readonly requestedAt: string;
  readonly dependencies?: Partial<ProactiveCoachRuntimeDependenciesV1> & {
    readonly run?: typeof runProactiveCoachRuntimeV1;
  };
}

export interface ProactiveCoachHttpResultV1 {
  readonly status: number;
  readonly body: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorResult(code: string, message: string, status: number): ProactiveCoachHttpResultV1 {
  return { status, body: { error: { code, message } } };
}

function boundarySafe(result: ProactiveCoachRuntimeResultV1): boolean {
  return result.presentationRecorded === false
    && result.authority.deterministicOnly === true
    && result.authority.clientIdentityAuthorityAllowed === false
    && result.authority.generatesProse === false
    && result.authority.dbWritesAllowed === false
    && result.authority.providerCallsAllowed === false
    && result.authority.llmCallsAllowed === false
    && result.authority.plannerPreviewAllowed === false
    && result.authority.plannerProposalAllowed === false
    && result.authority.plannerConfirmationAllowed === false
    && result.authority.plannerApplyAllowed === false
    && result.selection.authority.generatesProse === false
    && result.selection.authority.dbWritesAllowed === false
    && result.selection.authority.providerCallsAllowed === false
    && result.selection.authority.llmCallsAllowed === false
    && result.selection.authority.plannerProposalAllowed === false
    && result.selection.authority.plannerConfirmationAllowed === false
    && result.selection.authority.plannerApplyAllowed === false;
}

export async function handleProactiveCoachHttpV1(
  input: HandleProactiveCoachHttpInputV1,
): Promise<ProactiveCoachHttpResultV1> {
  if (!input.userId.trim() || !input.examProfileId.trim() || !input.requestId.trim()) {
    return errorResult(
      "PROACTIVE_COACH_SERVER_IDENTITY_INVALID",
      "Server-owned identity is required",
      500,
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.currentDate)) {
    return errorResult(
      "PROACTIVE_COACH_SERVER_DATE_INVALID",
      "Server-owned current date is invalid",
      500,
    );
  }
  if (!input.requestedAt.includes("T") || !Number.isFinite(Date.parse(input.requestedAt))) {
    return errorResult(
      "PROACTIVE_COACH_SERVER_TIME_INVALID",
      "Server-owned request time is invalid",
      500,
    );
  }
  if (!isRecord(input.body)) {
    return errorResult("INVALID_REQUEST", "JSON object required", 400);
  }
  if (Object.keys(input.body).some((key) => key !== "surfaceSessionId")) {
    return errorResult(
      "PROACTIVE_COACH_CLIENT_AUTHORITY_REFUSED",
      "Only surfaceSessionId is accepted",
      400,
    );
  }

  let surfaceSessionId: string;
  try {
    surfaceSessionId = normalizeProactiveCoachSurfaceSessionIdV1(
      input.body.surfaceSessionId,
    );
  } catch {
    return errorResult(
      "PROACTIVE_COACH_SURFACE_SESSION_ID_INVALID",
      "A bounded non-empty surfaceSessionId is required",
      400,
    );
  }

  const run = input.dependencies?.run ?? runProactiveCoachRuntimeV1;
  const { run: _ignored, ...runtimeDependencies } = input.dependencies ?? {};
  try {
    const runtime = await run({
      contextClient: input.contextClient,
      userId: input.userId,
      examProfileId: input.examProfileId,
      currentDate: input.currentDate,
      requestedAt: input.requestedAt,
      requestId: input.requestId,
      surfaceSessionId,
      dependencies: runtimeDependencies,
    });
    if (!boundarySafe(runtime)) {
      return errorResult(
        "PROACTIVE_COACH_BOUNDARY_CONTRACT_FAILED",
        "Read-only proactive authority contract failed",
        500,
      );
    }
    return {
      status: 200,
      body: {
        version: PROACTIVE_COACH_HTTP_V1_VERSION,
        status: "OK",
        runtime,
      },
    };
  } catch {
    return errorResult(
      "PROACTIVE_COACH_RUNTIME_UNAVAILABLE",
      "Proactive evaluation is unavailable and remains fail-closed",
      503,
    );
  }
}
