import type {
  AiStudyMessageExecutionResultV1,
  ProactiveCoachCardActionV1,
  ProactiveCoachCardV1,
  ProactiveCoachSelectionV1,
} from "@kpss-coach/domain";
import { presentProactiveCoachCardV1 } from "@kpss-coach/domain";
import { AppApiError, callAppApi } from "./app-api";
import { supabase } from "./supabase";

export interface AiCoachShadowPreviewChange {
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

export interface AiCoachShadowPreview {
  readonly previewOnly: true;
  readonly snapshotId: string;
  readonly snapshotHash: string;
  readonly decision: string;
  readonly changedTaskCount: number;
  readonly validationValid: boolean;
  readonly applyRecommended: boolean;
  readonly changes?: readonly AiCoachShadowPreviewChange[];
  readonly changeDetailsComplete?: boolean;
  readonly evaluation: {
    readonly currentPlanFeasible: boolean;
    readonly issueCodes: readonly string[];
    readonly availableMinutes: number;
    readonly planningBudgetMinutes: number;
    readonly reserveMinutes: number;
    readonly capacity: {
      readonly grossMinutes: number;
      readonly reserveMinutes: number;
      readonly planningMinutes: number;
      readonly remainingMinutes: number;
    };
    readonly changeRatio: number;
    readonly movedTaskCount: number;
    readonly backlogTaskCount: number;
  };
}


export interface AiCoachTargetCapacityResolution {
  readonly source: "TARGET_MINUTES";
  readonly effectiveDate: string;
  readonly targetMinutes: number;
  readonly currentGrossMinutes: number;
  readonly deltaMinutes: number;
  readonly trigger: "CAPACITY_INCREASE" | "CAPACITY_DECREASE" | null;
  readonly noChange: boolean;
}

export interface AiCoachPreviewApiError {
  readonly code: string;
  readonly message: string;
}

export interface AiCoachConfirmationProposal {
  readonly proposalId: string;
  readonly actionKind: "capacity_change";
  readonly expiresAt: string;
  readonly planGenerationVersion: number;
}

export interface AiCoachApplyResponse {
  readonly proposalId: string;
  readonly actionKind: "capacity_change";
  readonly scheduleExceptionCreated: boolean;
  readonly changes: readonly AiCoachShadowPreviewChange[];
  readonly idempotent?: boolean;
  readonly refresh: readonly string[];
}

type ValidExecution = Extract<AiStudyMessageExecutionResultV1, { status: "VALID" }>;
type ClarificationExecution = Extract<AiStudyMessageExecutionResultV1, { status: "NEEDS_CLARIFICATION" }>;
type InvalidExecution = Extract<AiStudyMessageExecutionResultV1, { status: "INVALID" }>;
type GatewayExecution = Extract<AiStudyMessageExecutionResultV1, { status: "GATEWAY_ERROR" }>;

export type AiCoachPlanPreviewResponse =
  | (ValidExecution & {
      readonly capacityResolution?: AiCoachTargetCapacityResolution | null;
      readonly shadowPreview: AiCoachShadowPreview | null;
      readonly confirmation?: AiCoachConfirmationProposal | null;
      readonly confirmationError?: AiCoachPreviewApiError | null;
      readonly error?: AiCoachPreviewApiError;
    })
  | (ClarificationExecution & { readonly shadowPreview: null })
  | (InvalidExecution & { readonly shadowPreview: null })
  | (GatewayExecution & { readonly shadowPreview: null });

interface ErrorEnvelope {
  readonly error?: AiCoachPreviewApiError;
}

interface ProactiveCoachEvaluationResponseV1 {
  readonly version: "proactive-coach-http-v1";
  readonly status: "OK";
  readonly runtime: {
    readonly selection: ProactiveCoachSelectionV1;
  };
}

export interface ProactiveCoachActionResponseV1 {
  readonly version: "proactive-coach-actions-http-v1";
  readonly status: "PRESENTATION_RECORDED" | "CONTROL_APPLIED";
  readonly idempotent?: boolean;
  readonly presentationId?: string;
  readonly presentedAt?: string;
  readonly action?: "dismiss" | "snooze" | "disable_category";
}

function normalizeSurfaceSessionId(value: string): string {
  const normalized = value.normalize("NFC").trim();
  if (!normalized || [...normalized].length > 256 || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new AppApiError("PROACTIVE_COACH_SURFACE_SESSION_ID_INVALID", "Koç yüzeyi doğrulanamadı.");
  }
  return normalized;
}

export async function loadProactiveCoachCard(
  surfaceSessionId: string,
): Promise<ProactiveCoachCardV1 | null> {
  const response = await callAppApi<ProactiveCoachEvaluationResponseV1>("/ai-coach/proactive", {
    method: "POST",
    body: { surfaceSessionId: normalizeSurfaceSessionId(surfaceSessionId) },
  });
  return presentProactiveCoachCardV1(response.runtime.selection);
}

export async function recordProactiveCoachPresentation(
  surfaceSessionId: string,
  presentationToken: string,
): Promise<ProactiveCoachActionResponseV1> {
  return callProactiveCoachAction("presented", surfaceSessionId, presentationToken);
}

export async function applyProactiveCoachCardAction(
  action: ProactiveCoachCardActionV1,
  surfaceSessionId: string,
  presentationToken: string,
): Promise<ProactiveCoachActionResponseV1> {
  const path = action === "snooze_24h"
    ? "snooze"
    : action === "disable_category"
      ? "disable-category"
      : action;
  return callProactiveCoachAction(path, surfaceSessionId, presentationToken);
}

async function callProactiveCoachAction(
  path: "presented" | "dismiss" | "snooze" | "disable-category",
  surfaceSessionId: string,
  presentationToken: string,
): Promise<ProactiveCoachActionResponseV1> {
  const token = presentationToken.trim();
  if (!token || token.length > 4096) {
    throw new AppApiError("PROACTIVE_COACH_PRESENTATION_TOKEN_INVALID", "Koç kartı doğrulanamadı.");
  }
  return callAppApi<ProactiveCoachActionResponseV1>(`/ai-coach/proactive/${path}`, {
    method: "POST",
    body: {
      surfaceSessionId: normalizeSurfaceSessionId(surfaceSessionId),
      presentationToken: token,
    },
  });
}

function hasPreviewStatus(value: unknown): value is AiCoachPlanPreviewResponse {
  if (!value || typeof value !== "object") return false;
  const status = (value as { status?: unknown }).status;
  return status === "VALID" ||
    status === "NEEDS_CLARIFICATION" ||
    status === "INVALID" ||
    status === "GATEWAY_ERROR";
}

/**
 * Calls the authenticated, preview-only AI → Planning V2 edge function.
 * The client sends only examProfileId + message. It never sends planner state,
 * dates, capacity math or an apply instruction.
 */
export async function callAiCoachPreview(
  examProfileId: string,
  message: string,
): Promise<AiCoachPlanPreviewResponse> {
  const normalizedMessage = message.trim();
  if (!examProfileId) {
    throw new AppApiError("INVALID_EXAM_PROFILE_ID", "Çalışma profili bulunamadı.");
  }
  if (!normalizedMessage) {
    throw new AppApiError("INVALID_MESSAGE", "Koça göndermek için bir mesaj yazın.");
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session) {
    throw new AppApiError("UNAUTHORIZED", "Oturum bulunamadı.");
  }

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-coach-plan-preview`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        examProfileId,
        message: normalizedMessage,
      }),
    },
  );

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new AppApiError("AI_COACH_INVALID_RESPONSE", "Koç yanıtı okunamadı.");
  }

  // The endpoint intentionally returns structured preview states for some
  // non-2xx responses (for example safe gateway/shadow rejection). Preserve
  // those states so the UI can render them without weakening backend safety.
  if (hasPreviewStatus(payload)) return payload;

  const errorPayload = payload as ErrorEnvelope;
  if (!response.ok) {
    throw new AppApiError(
      errorPayload.error?.code ?? "AI_COACH_PREVIEW_FAILED",
      errorPayload.error?.message ?? "Koç önizlemesi oluşturulamadı.",
    );
  }

  throw new AppApiError("AI_COACH_INVALID_RESPONSE", "Koç beklenmeyen bir yanıt döndürdü.");
}
