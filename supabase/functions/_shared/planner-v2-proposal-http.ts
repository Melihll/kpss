export type PlannerV2ProposalIdentity = Readonly<{
  recordId: string;
  proposalId: string;
  proposalFingerprint: string;
  snapshotFingerprint: string;
  plannerVersion: string;
}>;

export type PlannerV2ProposalPersistence = Readonly<{
  id: string;
  user_id: string;
  exam_profile_id: string;
  action_kind: string;
  status: string;
  confirmed_at: string | null;
  expires_at: string;
  planner_proposal_id: string;
  proposal_fingerprint: string;
  planner_snapshot_fingerprint: string;
  planner_version: string;
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDENTITY_KEYS = new Set([
  "recordId",
  "proposalId",
  "proposalFingerprint",
  "snapshotFingerprint",
  "plannerVersion",
]);
const AUTHORITY_KEYS = new Set([
  "userId",
  "actorUserId",
  "examProfileId",
  "actorExamProfileId",
  "serviceRoleKey",
]);

function fail(code: string): never {
  throw new Error(code);
}

export function parseExactPlannerV2ProposalIdentity(body: unknown): PlannerV2ProposalIdentity {
  if (!body || typeof body !== "object" || Array.isArray(body)) fail("PLANNER_V2_CONFIRMATION_IDENTITY_MISMATCH");
  const source = body as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    if (AUTHORITY_KEYS.has(key)) fail("PLANNER_V2_CLIENT_AUTHORITY_REFUSED");
    if (!IDENTITY_KEYS.has(key)) fail("PLANNER_V2_CONFIRMATION_IDENTITY_MISMATCH");
  }
  const exact = {
    recordId: typeof source.recordId === "string" ? source.recordId : "",
    proposalId: typeof source.proposalId === "string" ? source.proposalId : "",
    proposalFingerprint: typeof source.proposalFingerprint === "string" ? source.proposalFingerprint : "",
    snapshotFingerprint: typeof source.snapshotFingerprint === "string" ? source.snapshotFingerprint : "",
    plannerVersion: typeof source.plannerVersion === "string" ? source.plannerVersion : "",
  };
  if (!UUID.test(exact.recordId) || Object.values(exact).some((value) => !value || value !== value.trim())) {
    fail("PLANNER_V2_CONFIRMATION_IDENTITY_MISMATCH");
  }
  return Object.freeze(exact);
}

export function plannerV2LifecycleErrorCode(status: string): string {
  if (status === "expired") return "ACTION_PROPOSAL_EXPIRED";
  if (status === "stale") return "ACTION_PROPOSAL_STALE";
  if (status === "previewed" || status === "generated" || status === "pending") {
    return "PLANNER_V2_EXPLICIT_CONFIRMATION_REQUIRED";
  }
  if (status === "rejected" || status === "cancelled") return "ACTION_PROPOSAL_NOT_APPLYABLE";
  return "ACTION_PROPOSAL_NOT_PENDING";
}

export function assertExactPlannerV2ProposalPersistence(
  row: PlannerV2ProposalPersistence,
  exact: PlannerV2ProposalIdentity,
  mismatchCode: string,
) {
  if (
    row.id !== exact.recordId ||
    row.action_kind !== "planner_v2_week" ||
    row.planner_proposal_id !== exact.proposalId ||
    row.proposal_fingerprint !== exact.proposalFingerprint ||
    row.planner_snapshot_fingerprint !== exact.snapshotFingerprint ||
    row.planner_version !== exact.plannerVersion
  ) fail(mismatchCode);
}

export function assertAuthoritativePlannerV2Confirmation(
  row: PlannerV2ProposalPersistence,
  exact: PlannerV2ProposalIdentity,
) {
  assertExactPlannerV2ProposalPersistence(row, exact, "PLANNER_V2_CONFIRMATION_IDENTITY_MISMATCH");
  if (row.status !== "confirmed") fail(plannerV2LifecycleErrorCode(row.status));
  if (!row.confirmed_at || Number.isNaN(new Date(row.confirmed_at).getTime())) {
    fail("PLANNER_V2_CONFIRMATION_NOT_PERSISTED");
  }
  return Object.freeze({ ...exact, state: "confirmed" as const, confirmedAt: row.confirmed_at });
}

export function assertAuthoritativePlannerV2Apply(
  result: unknown,
  exact: PlannerV2ProposalIdentity,
) {
  if (!result || typeof result !== "object" || Array.isArray(result)) fail("PLANNER_V2_APPLY_RESULT_INVALID");
  const value = result as Record<string, unknown>;
  if (value.state === "expired") fail("ACTION_PROPOSAL_EXPIRED");
  if (value.state === "stale") fail("ACTION_PROPOSAL_STALE");
  if (
    value.recordId !== exact.recordId ||
    value.proposalId !== exact.proposalId ||
    value.state !== "applied" ||
    value.applied !== true
  ) fail("PLANNER_V2_APPLY_IDENTITY_MISMATCH");
  return result as Readonly<Record<string, unknown>>;
}
