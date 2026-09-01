export type PlannerV2ProposalIdentity = Readonly<{
  recordId: string;
  proposalId: string;
  proposalFingerprint: string;
  snapshotFingerprint: string;
  plannerVersion: string;
}>;

export type ConfirmedPlannerV2Proposal = PlannerV2ProposalIdentity & Readonly<{
  state: "confirmed";
  confirmedAt: string;
}>;

export type AppliedPlannerV2Proposal = Readonly<{
  recordId: string;
  proposalId: string;
  state: "applied";
  applied: true;
  createdTaskIds: readonly string[];
  replacedTaskIds: readonly string[];
  plannedMinutes: number;
  idempotent: boolean;
}>;

function fail(code: string): never {
  throw new Error(code);
}

export function exactPlannerV2ProposalIdentity(value: unknown): PlannerV2ProposalIdentity {
  if (!value || typeof value !== "object") fail("PLANNER_V2_CONFIRMATION_IDENTITY_MISMATCH");
  const source = value as Record<string, unknown>;
  const exact = {
    recordId: source.recordId,
    proposalId: source.proposalId,
    proposalFingerprint: source.proposalFingerprint,
    snapshotFingerprint: source.snapshotFingerprint,
    plannerVersion: source.plannerVersion,
  };
  if (Object.values(exact).some((item) => typeof item !== "string" || !item)) {
    fail("PLANNER_V2_CONFIRMATION_IDENTITY_MISMATCH");
  }
  return Object.freeze(exact as PlannerV2ProposalIdentity);
}

export function confirmationFailureMessage(code: string): string {
  if (code === "ACTION_PROPOSAL_EXPIRED") return "Önerinin süresi doldu. Yeni önizleme oluştur.";
  if (code === "ACTION_PROPOSAL_STALE") return "Plan koşulları değişti. Yeni önizleme oluştur.";
  if (code === "PLANNER_V2_CONFIRMATION_IDENTITY_MISMATCH") return "Öneri kimliği değişti. Yeni önizleme oluştur.";
  if (code === "ACTION_PROPOSAL_NOT_PENDING" || code === "ACTION_PROPOSAL_NOT_APPLYABLE") {
    return "Öneri artık onaylanabilir değil. Yeni önizleme oluştur.";
  }
  return "Öneri onaylanamadı. Yeni önizleme oluşturup tekrar deneyin.";
}

export function deriveConfirmedPlannerV2State(
  response: unknown,
  expected: PlannerV2ProposalIdentity,
): ConfirmedPlannerV2Proposal {
  if (!response || typeof response !== "object") fail("PLANNER_V2_CONFIRMATION_NOT_PERSISTED");
  const confirmation = (response as { confirmation?: unknown }).confirmation;
  if (!confirmation || typeof confirmation !== "object") fail("PLANNER_V2_CONFIRMATION_NOT_PERSISTED");
  const value = confirmation as Record<string, unknown>;
  if (value.state === "expired") fail("ACTION_PROPOSAL_EXPIRED");
  if (value.state === "stale") fail("ACTION_PROPOSAL_STALE");
  if (value.state === "rejected") fail("ACTION_PROPOSAL_NOT_APPLYABLE");
  if (
    value.state !== "confirmed" ||
    value.recordId !== expected.recordId ||
    value.proposalId !== expected.proposalId ||
    value.proposalFingerprint !== expected.proposalFingerprint ||
    value.snapshotFingerprint !== expected.snapshotFingerprint ||
    value.plannerVersion !== expected.plannerVersion
  ) fail("PLANNER_V2_CONFIRMATION_IDENTITY_MISMATCH");
  if (typeof value.confirmedAt !== "string" || Number.isNaN(new Date(value.confirmedAt).getTime())) {
    fail("PLANNER_V2_CONFIRMATION_NOT_PERSISTED");
  }
  return value as ConfirmedPlannerV2Proposal;
}

export function canApplyPlannerV2Proposal(
  capability: { applyEnabled: boolean } | null,
  confirmation: ConfirmedPlannerV2Proposal | null,
): boolean {
  return capability?.applyEnabled === true && confirmation?.state === "confirmed";
}

export function deriveAppliedPlannerV2State(
  response: unknown,
  expected: PlannerV2ProposalIdentity,
): AppliedPlannerV2Proposal {
  if (!response || typeof response !== "object") fail("PLANNER_V2_APPLY_RESULT_INVALID");
  const application = (response as { application?: unknown }).application;
  if (!application || typeof application !== "object") fail("PLANNER_V2_APPLY_RESULT_INVALID");
  const value = application as Record<string, unknown>;
  if (value.state === "expired") fail("ACTION_PROPOSAL_EXPIRED");
  if (value.state === "stale") fail("ACTION_PROPOSAL_STALE");
  if (
    value.recordId !== expected.recordId ||
    value.proposalId !== expected.proposalId ||
    value.state !== "applied" ||
    value.applied !== true ||
    !Array.isArray(value.createdTaskIds) ||
    !Array.isArray(value.replacedTaskIds) ||
    typeof value.plannedMinutes !== "number" ||
    typeof value.idempotent !== "boolean"
  ) fail("PLANNER_V2_APPLY_IDENTITY_MISMATCH");
  return value as unknown as AppliedPlannerV2Proposal;
}
