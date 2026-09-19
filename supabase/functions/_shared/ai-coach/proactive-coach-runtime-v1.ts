import {
  buildCoachSignalSetV1,
  type CoachSignalSetV1,
} from "../../../../packages/domain/src/ai-coach/coach-signal-v1.ts";
import {
  selectProactiveCoachInsightV1,
  type ProactiveCoachSelectionV1,
} from "../../../../packages/domain/src/ai-coach/proactive-coach-selection-v1.ts";
import type { CoachContextV1 } from "../../../../packages/domain/src/ai-coach/coach-context-v1.ts";
import { loadCoachContextV1ReadOnly } from "../coach-context-v1-readonly.ts";
import { loadProactiveCoachRuntimeStateV1ReadOnly } from "../proactive-coach-runtime-state-readonly.ts";

export const PROACTIVE_COACH_RUNTIME_V1_VERSION =
  "proactive-coach-runtime-v1" as const;

export const PROACTIVE_COACH_SURFACE_SESSION_ID_MAX_LENGTH = 256;

type Client = any;

export interface ProactiveCoachRuntimeDependenciesV1 {
  readonly loadContext: typeof loadCoachContextV1ReadOnly;
  readonly buildSignals: typeof buildCoachSignalSetV1;
  readonly loadRuntimeState: typeof loadProactiveCoachRuntimeStateV1ReadOnly;
  readonly select: typeof selectProactiveCoachInsightV1;
}

export interface RunProactiveCoachRuntimeInputV1 {
  readonly contextClient: Client;
  /** Authenticated server-derived user identity. */
  readonly userId: string;
  /** Authenticated server-derived active profile identity. */
  readonly examProfileId: string;
  /** Server-derived user-local date. */
  readonly currentDate: string;
  /** Server-derived request timestamp. */
  readonly requestedAt: string;
  readonly requestId: string;
  /** Non-authoritative, bounded in-app correlation/attention key. */
  readonly surfaceSessionId: string;
  readonly dependencies?: Partial<ProactiveCoachRuntimeDependenciesV1>;
}

export interface ProactiveCoachRuntimeResultV1 {
  readonly version: typeof PROACTIVE_COACH_RUNTIME_V1_VERSION;
  readonly sourceContext: {
    readonly version: CoachContextV1["version"];
    readonly requestId: string;
  };
  readonly signalSet: {
    readonly version: CoachSignalSetV1["version"];
    readonly returnedCount: number;
    readonly availableCount: number;
    readonly truncated: boolean;
  };
  /** Accepted deterministic selector result; no second selection model. */
  readonly selection: ProactiveCoachSelectionV1;
  readonly presentationRecorded: false;
  readonly authority: {
    readonly mode: "server_owned_read_only_proactive_selection";
    readonly deterministicOnly: true;
    readonly clientIdentityAuthorityAllowed: false;
    readonly generatesProse: false;
    readonly dbWritesAllowed: false;
    readonly providerCallsAllowed: false;
    readonly llmCallsAllowed: false;
    readonly plannerPreviewAllowed: false;
    readonly plannerProposalAllowed: false;
    readonly plannerConfirmationAllowed: false;
    readonly plannerApplyAllowed: false;
  };
}

const DEFAULT_DEPENDENCIES: ProactiveCoachRuntimeDependenciesV1 = {
  loadContext: loadCoachContextV1ReadOnly,
  buildSignals: buildCoachSignalSetV1,
  loadRuntimeState: loadProactiveCoachRuntimeStateV1ReadOnly,
  select: selectProactiveCoachInsightV1,
};

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function text(value: string): boolean {
  return value.trim().length > 0;
}

export function normalizeProactiveCoachSurfaceSessionIdV1(value: unknown): string {
  if (typeof value !== "string") throw new Error("PROACTIVE_COACH_SURFACE_SESSION_ID_INVALID");
  const normalized = value.normalize("NFC").trim();
  if (
    normalized.length === 0
    || [...normalized].length > PROACTIVE_COACH_SURFACE_SESSION_ID_MAX_LENGTH
    || /[\u0000-\u001f\u007f]/u.test(normalized)
  ) throw new Error("PROACTIVE_COACH_SURFACE_SESSION_ID_INVALID");
  return normalized;
}

function authority(): ProactiveCoachRuntimeResultV1["authority"] {
  return {
    mode: "server_owned_read_only_proactive_selection",
    deterministicOnly: true,
    clientIdentityAuthorityAllowed: false,
    generatesProse: false,
    dbWritesAllowed: false,
    providerCallsAllowed: false,
    llmCallsAllowed: false,
    plannerPreviewAllowed: false,
    plannerProposalAllowed: false,
    plannerConfirmationAllowed: false,
    plannerApplyAllowed: false,
  };
}

/**
 * Assemble accepted read-only truth, deterministic signals, persisted runtime
 * authority and the accepted selector. Selection is intentionally not a
 * presentation and therefore performs no persistence.
 */
export async function runProactiveCoachRuntimeV1(
  input: RunProactiveCoachRuntimeInputV1,
): Promise<ProactiveCoachRuntimeResultV1> {
  if (!text(input.userId) || !text(input.examProfileId) || !text(input.requestId)) {
    throw new Error("PROACTIVE_COACH_SERVER_IDENTITY_INVALID");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.currentDate)) {
    throw new Error("PROACTIVE_COACH_SERVER_DATE_INVALID");
  }
  const now = new Date(input.requestedAt);
  if (Number.isNaN(now.getTime()) || !input.requestedAt.includes("T")) {
    throw new Error("PROACTIVE_COACH_SERVER_TIME_INVALID");
  }
  const surfaceSessionId = normalizeProactiveCoachSurfaceSessionIdV1(input.surfaceSessionId);
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...input.dependencies };

  const context = await dependencies.loadContext({
    client: input.contextClient,
    userId: input.userId,
    requestId: input.requestId,
    now,
  });
  if (
    context.userId !== input.userId
    || context.examProfileId !== input.examProfileId
    || context.currentDate !== input.currentDate
    || context.generatedAt !== now.toISOString()
  ) throw new Error("PROACTIVE_COACH_CONTEXT_AUTHORITY_MISMATCH");

  const signals = dependencies.buildSignals(context, { proactiveOnly: true });
  const runtimeState = await dependencies.loadRuntimeState({
    client: input.contextClient,
    userId: input.userId,
    examProfileId: input.examProfileId,
    currentDate: input.currentDate,
    surfaceSessionId,
    now,
  });
  const selection = dependencies.select(signals.candidates, runtimeState);

  return deepFreeze({
    version: PROACTIVE_COACH_RUNTIME_V1_VERSION,
    sourceContext: {
      version: context.version,
      requestId: context.requestId,
    },
    signalSet: {
      version: signals.version,
      returnedCount: signals.collection.returnedCount,
      availableCount: signals.collection.availableCount,
      truncated: signals.collection.truncated,
    },
    selection,
    presentationRecorded: false,
    authority: authority(),
  });
}
