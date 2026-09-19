import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { CoachSignalCandidateV1 } from "../../../../packages/domain/src/ai-coach/coach-signal-v1.ts";
import {
  handleProactiveCoachActionHttpV1,
  PROACTIVE_COACH_SNOOZE_DURATION_MS,
} from "./proactive-coach-actions-http-v1.ts";

const USER = "user-server-owned";
const PROFILE = "profile-server-owned";
const NOW = "2026-09-19T09:00:00.000Z";
const TOKEN = "proactive-fingerprint-v1|today-completed";

function selectedCandidate(): CoachSignalCandidateV1 {
  return {
    version: "coach-signal-candidate-v1",
    signalType: "today_completed_as_planned",
    severity: "info",
    importance: "medium",
    subjectId: null,
    date: "2026-09-19",
    reasonCode: "today_all_tasks_completed_with_planned_credit",
    sourceFactPaths: ["today.value.summary"],
    asOf: NOW,
    freshness: { state: "fresh", asOf: NOW, expiresAt: null },
    confidence: "high",
    evidence: { completedTaskCount: 2, plannedMinutes: 60, plannedCreditMinutes: 60 },
    provenance: [{ source: "planning_task_state_v1", recordIds: ["task-1"], asOf: NOW }],
    dedupeKey: "today-completed",
    eligibility: { reactiveExplanation: true, proactiveCandidate: true, attentionCategory: "progress", cooldownClass: "daily", silenceAllowed: true },
    authority: {
      mode: "factual_signal_only_read_only",
      createsProductTruth: false,
      generatesProse: false,
      dbWritesAllowed: false,
      workloadCalculationAllowed: false,
      plannerPreviewAllowed: false,
      plannerProposalAllowed: false,
      plannerConfirmationAllowed: false,
      plannerApplyAllowed: false,
      llmCallsAllowed: false,
      providerCallsAllowed: false,
    },
  };
}

function runtime(token = TOKEN) {
  return {
    version: "proactive-coach-runtime-v1",
    sourceContext: { version: "coach-context-v1", requestId: "request-actions" },
    signalSet: { version: "coach-signal-set-v1", returnedCount: 1, availableCount: 1, truncated: false },
    selection: {
      version: "proactive-coach-selection-v1",
      evaluatedAt: NOW,
      currentDate: "2026-09-19",
      outcome: "selected",
      selectedCandidate: selectedCandidate(),
      selectedFingerprint: token,
      selectedConditionKey: "today_completed_as_planned:2026-09-19",
      suppressions: [],
      authority: {
        mode: "deterministic_in_app_selection_only",
        inAppOnly: true,
        generatesProse: false,
        llmCallsAllowed: false,
        providerCallsAllowed: false,
        dbWritesAllowed: false,
        plannerProposalAllowed: false,
        plannerConfirmationAllowed: false,
        plannerApplyAllowed: false,
      },
    },
    presentationRecorded: false,
    authority: {
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
    },
  } as const;
}

function persisted() {
  return {
    id: "presentation-1",
    userId: USER,
    examProfileId: PROFILE,
    signalType: "today_completed_as_planned" as const,
    attentionCategory: "progress" as const,
    fingerprint: TOKEN,
    conditionKey: "today_completed_as_planned:2026-09-19",
    calendarDate: "2026-09-19",
    surfaceSessionId: "today-surface",
    templateVersion: "proactive-coach-card-template-v1",
    presentedAt: NOW,
  };
}

function input(action: "presented" | "dismiss" | "snooze" | "disable_category", dependencies: Record<string, unknown> = {}) {
  return {
    action,
    body: { surfaceSessionId: "today-surface", presentationToken: TOKEN },
    contextClient: Object.freeze({ actor: true }),
    serviceClient: Object.freeze({ service: true }),
    userId: USER,
    examProfileId: PROFILE,
    currentDate: "2026-09-19",
    requestId: "request-actions",
    requestedAt: NOW,
    dependencies,
  } as any;
}

describe("Proactive Coach narrow presentation/control HTTP boundary", () => {
  it("F/G. read-only selection alone writes zero; verified surfaced card records exactly once", async () => {
    const recordPresentation = vi.fn(async () => ({ presentationId: "presentation-1", idempotent: false, presentedAt: NOW }));
    expect(recordPresentation).not.toHaveBeenCalled();

    const result = await handleProactiveCoachActionHttpV1(input("presented", {
      findPresentation: vi.fn(async () => null),
      runRuntime: vi.fn(async () => runtime()),
      recordPresentation,
    }));
    expect(result).toMatchObject({ status: 201, body: { status: "PRESENTATION_RECORDED", idempotent: false } });
    expect(recordPresentation).toHaveBeenCalledTimes(1);
    expect(recordPresentation).toHaveBeenCalledWith({
      serviceClient: input("presented").serviceClient,
      args: {
        p_user_id: USER,
        p_exam_profile_id: PROFILE,
        p_signal_type: "today_completed_as_planned",
        p_attention_category: "progress",
        p_fingerprint: TOKEN,
        p_condition_key: "today_completed_as_planned:2026-09-19",
        p_materiality_policy_version: "proactive-coach-materiality-policy-v1",
        p_calendar_date: "2026-09-19",
        p_surface_session_id: "today-surface",
        p_template_version: "proactive-coach-card-template-v1",
      },
    });
  });

  it("H. treats a retry as idempotent and performs no second presentation write", async () => {
    const recordPresentation = vi.fn();
    const runRuntime = vi.fn();
    const result = await handleProactiveCoachActionHttpV1(input("presented", {
      findPresentation: vi.fn(async () => persisted()),
      runRuntime,
      recordPresentation,
    }));
    expect(result).toMatchObject({ status: 200, body: { presentationId: "presentation-1", idempotent: true } });
    expect(recordPresentation).not.toHaveBeenCalled();
    expect(runRuntime).not.toHaveBeenCalled();
  });

  it("I. rejects stale/changed or silent selection before persistence", async () => {
    const recordPresentation = vi.fn();
    const changed = await handleProactiveCoachActionHttpV1(input("presented", {
      findPresentation: vi.fn(async () => null),
      runRuntime: vi.fn(async () => runtime("different-token")),
      recordPresentation,
    }));
    expect(changed).toMatchObject({ status: 409, body: { error: { code: "PROACTIVE_COACH_PRESENTATION_SELECTION_CHANGED" } } });

    const silentRuntime = structuredClone(runtime()) as any;
    silentRuntime.selection.outcome = "silence";
    silentRuntime.selection.selectedCandidate = null;
    silentRuntime.selection.selectedFingerprint = null;
    silentRuntime.selection.selectedConditionKey = null;
    const silent = await handleProactiveCoachActionHttpV1(input("presented", {
      findPresentation: vi.fn(async () => null),
      runRuntime: vi.fn(async () => silentRuntime),
      recordPresentation,
    }));
    expect(silent.status).toBe(409);
    expect(recordPresentation).not.toHaveBeenCalled();
  });

  it("J/N. rejects authority injection and scopes lookups to server user/profile", async () => {
    const findPresentation = vi.fn(async () => persisted());
    const applyControl = vi.fn(async () => ({ controlId: "control-1" }));
    const injected = await handleProactiveCoachActionHttpV1({
      ...input("dismiss", { findPresentation, applyControl }),
      body: { surfaceSessionId: "today-surface", presentationToken: TOKEN, userId: "forged", fingerprint: "forged", signalType: "forged" },
    });
    expect(injected.status).toBe(400);
    expect(findPresentation).not.toHaveBeenCalled();

    await handleProactiveCoachActionHttpV1(input("dismiss", { findPresentation, applyControl }));
    expect(findPresentation).toHaveBeenCalledWith({
      contextClient: input("dismiss").contextClient,
      userId: USER,
      examProfileId: PROFILE,
      surfaceSessionId: "today-surface",
      presentationToken: TOKEN,
    });
  });

  it("K-M. invokes only the three accepted authenticated control RPC contracts", async () => {
    const applyControl = vi.fn(async () => ({ controlId: "control-1" }));
    for (const action of ["dismiss", "snooze", "disable_category"] as const) {
      const result = await handleProactiveCoachActionHttpV1(input(action, {
        findPresentation: vi.fn(async () => persisted()),
        applyControl,
      }));
      expect(result).toMatchObject({ status: 200, body: { status: "CONTROL_APPLIED", action } });
    }
    expect(applyControl.mock.calls.map(([value]) => value.rpcName)).toEqual([
      "dismiss_ai_coach_proactive_fingerprint_v1",
      "snooze_ai_coach_proactive_category_v1",
      "set_ai_coach_proactive_category_disabled_v1",
    ]);
    expect(applyControl.mock.calls[0]![0].args).toEqual({ p_exam_profile_id: PROFILE, p_fingerprint: TOKEN });
    expect(applyControl.mock.calls[1]![0].args).toEqual({
      p_exam_profile_id: PROFILE,
      p_attention_category: "progress",
      p_snoozed_until: new Date(Date.parse(NOW) + PROACTIVE_COACH_SNOOZE_DURATION_MS).toISOString(),
    });
    expect(applyControl.mock.calls[2]![0].args).toEqual({ p_exam_profile_id: PROFILE, p_attention_category: "progress", p_disabled: true });
  });

  it("fails closed when a verified surfaced presentation or write authority is unavailable", async () => {
    const missing = await handleProactiveCoachActionHttpV1(input("dismiss", { findPresentation: vi.fn(async () => null) }));
    expect(missing).toMatchObject({ status: 409, body: { error: { code: "PROACTIVE_COACH_PRESENTATION_NOT_FOUND" } } });
    const unavailable = await handleProactiveCoachActionHttpV1(input("dismiss", { findPresentation: vi.fn(async () => { throw new Error("READ_FAILED"); }) }));
    expect(unavailable.status).toBe(503);
  });

  it("P-S. introduces no Planner/task/capacity/provider/LLM execution path", () => {
    const source = fs.readFileSync(new URL("proactive-coach-actions-http-v1.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/buildPlannerV2Preview|create_planner_v2_proposal|confirm_planner|apply_planner/);
    expect(source).not.toMatch(/tasks?\.(insert|update|upsert|delete)|capacity\.(insert|update|upsert|delete)/);
    expect(source).not.toMatch(/openai|anthropic|responses\.create|chat\.completions|generateText/i);
  });

  it("wires only the four narrow action routes with server-owned actor/profile/time", () => {
    const source = fs.readFileSync(new URL("../../app-api/index.ts", import.meta.url), "utf8");
    for (const route of ["presented", "dismiss", "snooze", "disable-category"]) {
      expect(source).toContain(`\"/ai-coach/proactive/${route}\"`);
    }
    const block = source.match(/const proactiveActionByRoute[\s\S]*?return json\(result\.body, result\.status\);\n    \}/)?.[0] ?? "";
    expect(block).toContain("contextClient: client");
    expect(block).toContain("serviceClient");
    expect(block).toContain("userId");
    expect(block).toContain("examProfileId: profile.id");
    expect(block).toContain("currentDate: today");
    expect(block).not.toMatch(/body\.(userId|profileId|examProfileId|signalType|fingerprint|attentionCategory|currentDate|requestedAt)/);
  });
});
