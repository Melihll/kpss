export const PLANNER_V2_PREVIEW_CAPABILITY_ENV = "PLANNER_V2_PREVIEW_V1_PROFILE_IDS" as const;
export const PLANNER_V2_CONFIRM_CAPABILITY_ENV = "PLANNER_V2_CONFIRM_V1_PROFILE_IDS" as const;
export const PLANNER_V2_APPLY_CAPABILITY_ENV = "PLANNER_V2_APPLY_V1_PROFILE_IDS" as const;

const PROFILE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function exactProfileAllowlist(
  configuredProfileIds: string | null | undefined,
): ReadonlySet<string> | null {
  if (!configuredProfileIds?.trim()) return null;
  const values = configuredProfileIds
    .split(",")
    .map((value) => value.trim());
  if (values.length === 0 || values.some((value) => !value || value === "*" || !PROFILE_UUID.test(value))) return null;
  return new Set(values.map((value) => value.toLowerCase()));
}

export function isPlannerV2PreviewEnabled(
  configuredPreviewProfileIds: string | null | undefined,
  examProfileId: string,
): boolean {
  const allowlist = exactProfileAllowlist(configuredPreviewProfileIds);
  return Boolean(allowlist && PROFILE_UUID.test(examProfileId) && allowlist.has(examProfileId.toLowerCase()));
}

export function isPlannerV2ConfirmEnabled(
  configuredPreviewProfileIds: string | null | undefined,
  configuredConfirmProfileIds: string | null | undefined,
  examProfileId: string,
): boolean {
  return isPlannerV2PreviewEnabled(configuredPreviewProfileIds, examProfileId)
    && Boolean(exactProfileAllowlist(configuredConfirmProfileIds)?.has(examProfileId.toLowerCase()));
}

export function isPlannerV2ApplyEnabled(
  configuredPreviewProfileIds: string | null | undefined,
  configuredApplyProfileIds: string | null | undefined,
  examProfileId: string,
): boolean {
  return isPlannerV2PreviewEnabled(configuredPreviewProfileIds, examProfileId)
    && Boolean(exactProfileAllowlist(configuredApplyProfileIds)?.has(examProfileId.toLowerCase()));
}

export function plannerV2ProposalCapabilities(
  configuredPreviewProfileIds: string | null | undefined,
  configuredConfirmProfileIds: string | null | undefined,
  configuredApplyProfileIds: string | null | undefined,
  examProfileId: string,
) {
  const previewEnabled = isPlannerV2PreviewEnabled(configuredPreviewProfileIds, examProfileId);
  const confirmationEnabled = previewEnabled && isPlannerV2ConfirmEnabled(
    configuredPreviewProfileIds,
    configuredConfirmProfileIds,
    examProfileId,
  );
  const applyEnabled = previewEnabled && isPlannerV2ApplyEnabled(
    configuredPreviewProfileIds,
    configuredApplyProfileIds,
    examProfileId,
  );
  return {
    enabled: previewEnabled,
    previewEnabled,
    confirmationEnabled,
    applyEnabled,
    productionMutationAuthority: applyEnabled,
  };
}
