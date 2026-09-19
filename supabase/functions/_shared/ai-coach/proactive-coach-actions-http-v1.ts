import {
  PROACTIVE_COACH_MATERIALITY_POLICY_V1_VERSION,
} from "../../../../packages/domain/src/ai-coach/proactive-coach-materiality-policy-v1.ts";
import {
  presentProactiveCoachCardV1,
} from "../../../../packages/domain/src/ai-coach/proactive-coach-card-v1.ts";
import {
  normalizeProactiveCoachSurfaceSessionIdV1,
  runProactiveCoachRuntimeV1,
} from "./proactive-coach-runtime-v1.ts";

export const PROACTIVE_COACH_ACTIONS_HTTP_V1_VERSION =
  "proactive-coach-actions-http-v1" as const;
export const PROACTIVE_COACH_SNOOZE_DURATION_MS = 24 * 60 * 60 * 1000;

export type ProactiveCoachWriteActionV1 =
  | "presented"
  | "dismiss"
  | "snooze"
  | "disable_category";

type Client = any;

interface PersistedPresentationV1 {
  readonly id: string;
  readonly userId: string;
  readonly examProfileId: string;
  readonly signalType: "today_completed_as_planned" | "repeated_task_miss" | "recent_recovery" | "planner_warning_present";
  readonly attentionCategory: "progress" | "consistency" | "planner";
  readonly fingerprint: string;
  readonly conditionKey: string;
  readonly calendarDate: string;
  readonly surfaceSessionId: string;
  readonly templateVersion: string | null;
  readonly presentedAt: string;
}

interface ProactiveCoachActionsDependenciesV1 {
  readonly runRuntime: typeof runProactiveCoachRuntimeV1;
  readonly findPresentation: (input: {
    readonly contextClient: Client;
    readonly userId: string;
    readonly examProfileId: string;
    readonly surfaceSessionId: string;
    readonly presentationToken: string;
  }) => Promise<PersistedPresentationV1 | null>;
  readonly recordPresentation: (input: {
    readonly serviceClient: Client;
    readonly args: Readonly<Record<string, unknown>>;
  }) => Promise<{ readonly presentationId: string; readonly idempotent: boolean; readonly presentedAt: string }>;
  readonly applyControl: (input: {
    readonly contextClient: Client;
    readonly rpcName: string;
    readonly args: Readonly<Record<string, unknown>>;
  }) => Promise<Record<string, unknown>>;
}

export interface HandleProactiveCoachActionHttpInputV1 {
  readonly action: ProactiveCoachWriteActionV1;
  readonly body: unknown;
  readonly contextClient: Client;
  readonly serviceClient: Client;
  readonly userId: string;
  readonly examProfileId: string;
  readonly currentDate: string;
  readonly requestId: string;
  readonly requestedAt: string;
  readonly dependencies?: Partial<ProactiveCoachActionsDependenciesV1>;
}

export interface ProactiveCoachActionHttpResultV1 {
  readonly status: number;
  readonly body: unknown;
}

const SIGNALS = new Set([
  "today_completed_as_planned",
  "repeated_task_miss",
  "recent_recovery",
  "planner_warning_present",
]);
const CATEGORIES = new Set(["progress", "consistency", "planner"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function parsePresentation(row: any, scope: {
  readonly userId: string;
  readonly examProfileId: string;
  readonly surfaceSessionId: string;
  readonly presentationToken: string;
}): PersistedPresentationV1 {
  if (
    row?.user_id !== scope.userId
    || row?.exam_profile_id !== scope.examProfileId
    || row?.surface_session_id !== scope.surfaceSessionId
    || row?.fingerprint !== scope.presentationToken
    || typeof row?.id !== "string" || !row.id.trim()
    || !SIGNALS.has(row?.signal_type)
    || !CATEGORIES.has(row?.attention_category)
    || typeof row?.condition_key !== "string" || !row.condition_key.trim()
    || typeof row?.calendar_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.calendar_date)
    || (row?.template_version !== null && typeof row?.template_version !== "string")
    || !validTimestamp(row?.presented_at)
  ) throw new Error("PROACTIVE_COACH_PRESENTATION_ROW_INVALID");
  return {
    id: row.id,
    userId: row.user_id,
    examProfileId: row.exam_profile_id,
    signalType: row.signal_type,
    attentionCategory: row.attention_category,
    fingerprint: row.fingerprint,
    conditionKey: row.condition_key,
    calendarDate: row.calendar_date,
    surfaceSessionId: row.surface_session_id,
    templateVersion: row.template_version,
    presentedAt: row.presented_at,
  };
}

async function findPresentation(input: Parameters<ProactiveCoachActionsDependenciesV1["findPresentation"]>[0]): Promise<PersistedPresentationV1 | null> {
  const result = await input.contextClient
    .from("ai_coach_proactive_presentations")
    .select("id,user_id,exam_profile_id,signal_type,attention_category,fingerprint,condition_key,calendar_date,surface_session_id,template_version,presented_at")
    .eq("user_id", input.userId)
    .eq("exam_profile_id", input.examProfileId)
    .eq("surface_session_id", input.surfaceSessionId)
    .eq("fingerprint", input.presentationToken)
    .order("presented_at", { ascending: false })
    .limit(2);
  if (result.error) throw result.error;
  if (!Array.isArray(result.data)) throw new Error("PROACTIVE_COACH_PRESENTATION_READ_INVALID");
  if (result.data.length > 1) throw new Error("PROACTIVE_COACH_PRESENTATION_AUTHORITY_AMBIGUOUS");
  return result.data.length === 0 ? null : parsePresentation(result.data[0], input);
}

async function rpcResult(client: Client, name: string, args: Readonly<Record<string, unknown>>): Promise<Record<string, unknown>> {
  const result = await client.rpc(name, args);
  if (result.error) throw result.error;
  if (!isRecord(result.data)) throw new Error("PROACTIVE_COACH_WRITE_RESULT_INVALID");
  return result.data;
}

const DEFAULT_DEPENDENCIES: ProactiveCoachActionsDependenciesV1 = {
  runRuntime: runProactiveCoachRuntimeV1,
  findPresentation,
  recordPresentation: async ({ serviceClient, args }) => {
    const data = await rpcResult(serviceClient, "record_ai_coach_proactive_presentation_v1", args);
    if (
      typeof data.presentationId !== "string"
      || typeof data.idempotent !== "boolean"
      || !validTimestamp(data.presentedAt)
    ) throw new Error("PROACTIVE_COACH_PRESENTATION_WRITE_RESULT_INVALID");
    return {
      presentationId: data.presentationId,
      idempotent: data.idempotent,
      presentedAt: data.presentedAt,
    };
  },
  applyControl: async ({ contextClient, rpcName, args }) => rpcResult(contextClient, rpcName, args),
};

function errorResult(code: string, message: string, status: number): ProactiveCoachActionHttpResultV1 {
  return { status, body: { error: { code, message } } };
}

function parseBody(body: unknown): { readonly surfaceSessionId: string; readonly presentationToken: string } | null {
  if (!isRecord(body) || Object.keys(body).some((key) => !["surfaceSessionId", "presentationToken"].includes(key))) return null;
  let surfaceSessionId: string;
  try {
    surfaceSessionId = normalizeProactiveCoachSurfaceSessionIdV1(body.surfaceSessionId);
  } catch {
    return null;
  }
  if (typeof body.presentationToken !== "string") return null;
  const presentationToken = body.presentationToken.trim();
  if (!presentationToken || presentationToken.length > 4096 || /[\u0000-\u001f\u007f]/u.test(presentationToken)) return null;
  return { surfaceSessionId, presentationToken };
}

export async function handleProactiveCoachActionHttpV1(
  input: HandleProactiveCoachActionHttpInputV1,
): Promise<ProactiveCoachActionHttpResultV1> {
  if (!input.userId.trim() || !input.examProfileId.trim() || !input.requestId.trim()) {
    return errorResult("PROACTIVE_COACH_SERVER_IDENTITY_INVALID", "Server-owned identity is required", 500);
  }
  const now = new Date(input.requestedAt);
  if (Number.isNaN(now.getTime()) || !input.requestedAt.includes("T") || !/^\d{4}-\d{2}-\d{2}$/.test(input.currentDate)) {
    return errorResult("PROACTIVE_COACH_SERVER_TIME_INVALID", "Server-owned date/time is invalid", 500);
  }
  const parsed = parseBody(input.body);
  if (!parsed) {
    return errorResult(
      "PROACTIVE_COACH_CLIENT_AUTHORITY_REFUSED",
      "Only bounded surfaceSessionId and presentationToken are accepted",
      400,
    );
  }
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...input.dependencies };

  try {
    const existing = await dependencies.findPresentation({
      contextClient: input.contextClient,
      userId: input.userId,
      examProfileId: input.examProfileId,
      ...parsed,
    });

    if (input.action === "presented") {
      if (existing) {
        return {
          status: 200,
          body: {
            version: PROACTIVE_COACH_ACTIONS_HTTP_V1_VERSION,
            status: "PRESENTATION_RECORDED",
            presentationId: existing.id,
            idempotent: true,
            presentedAt: existing.presentedAt,
          },
        };
      }

      const runtime = await dependencies.runRuntime({
        contextClient: input.contextClient,
        userId: input.userId,
        examProfileId: input.examProfileId,
        currentDate: input.currentDate,
        requestedAt: input.requestedAt,
        requestId: input.requestId,
        surfaceSessionId: parsed.surfaceSessionId,
      });
      const selection = runtime.selection;
      const card = presentProactiveCoachCardV1(selection);
      if (
        selection.outcome !== "selected"
        || selection.selectedCandidate === null
        || selection.selectedFingerprint !== parsed.presentationToken
        || !selection.selectedConditionKey?.trim()
        || selection.currentDate !== input.currentDate
        || card === null
      ) {
        return errorResult(
          "PROACTIVE_COACH_PRESENTATION_SELECTION_CHANGED",
          "The selected proactive card is no longer current",
          409,
        );
      }
      const candidate = selection.selectedCandidate;
      const recorded = await dependencies.recordPresentation({
        serviceClient: input.serviceClient,
        args: {
          p_user_id: input.userId,
          p_exam_profile_id: input.examProfileId,
          p_signal_type: candidate.signalType,
          p_attention_category: candidate.eligibility.attentionCategory,
          p_fingerprint: selection.selectedFingerprint,
          p_condition_key: selection.selectedConditionKey,
          p_materiality_policy_version: PROACTIVE_COACH_MATERIALITY_POLICY_V1_VERSION,
          p_calendar_date: selection.currentDate,
          p_surface_session_id: parsed.surfaceSessionId,
          p_template_version: card.templateVersion,
        },
      });
      return {
        status: 201,
        body: {
          version: PROACTIVE_COACH_ACTIONS_HTTP_V1_VERSION,
          status: "PRESENTATION_RECORDED",
          ...recorded,
        },
      };
    }

    if (!existing) {
      return errorResult(
        "PROACTIVE_COACH_PRESENTATION_NOT_FOUND",
        "A verified surfaced card is required",
        409,
      );
    }

    const control = input.action === "dismiss"
      ? await dependencies.applyControl({
          contextClient: input.contextClient,
          rpcName: "dismiss_ai_coach_proactive_fingerprint_v1",
          args: { p_exam_profile_id: input.examProfileId, p_fingerprint: existing.fingerprint },
        })
      : input.action === "snooze"
        ? await dependencies.applyControl({
            contextClient: input.contextClient,
            rpcName: "snooze_ai_coach_proactive_category_v1",
            args: {
              p_exam_profile_id: input.examProfileId,
              p_attention_category: existing.attentionCategory,
              p_snoozed_until: new Date(now.getTime() + PROACTIVE_COACH_SNOOZE_DURATION_MS).toISOString(),
            },
          })
        : await dependencies.applyControl({
            contextClient: input.contextClient,
            rpcName: "set_ai_coach_proactive_category_disabled_v1",
            args: { p_exam_profile_id: input.examProfileId, p_attention_category: existing.attentionCategory, p_disabled: true },
          });

    return {
      status: 200,
      body: {
        version: PROACTIVE_COACH_ACTIONS_HTTP_V1_VERSION,
        status: "CONTROL_APPLIED",
        action: input.action,
        control,
      },
    };
  } catch {
    return errorResult(
      "PROACTIVE_COACH_WRITE_AUTHORITY_UNAVAILABLE",
      "Proactive presentation/control authority is unavailable",
      503,
    );
  }
}
