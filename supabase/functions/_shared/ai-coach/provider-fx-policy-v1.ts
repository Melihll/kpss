import {
  AI_FX_POLICY_V1_VERSION,
  type AiFxSnapshotV1,
} from "../../../../packages/domain/src/ai-coach/ai-economics-v1.ts";

export const AI_T_C_M_B_USD_TRY_FX_POLICY_V1_VERSION =
  "ai-tcmb-usd-try-fx-policy-v1" as const;

export const AI_T_C_M_B_USD_TRY_SOURCE_V1 =
  "https://www.tcmb.gov.tr/wps/wcm/connect/TR/TCMB%2BTR/Main%2BMenu/Istatistikler/Doviz%2BKurlari" as const;

export const AI_T_C_M_B_USD_TRY_SOURCE_ID_V1 =
  "tcmb-indicative-usd-try-selling-rate" as const;

/**
 * Maximum runtime age of an approved FX snapshot.
 *
 * 96 hours permits ordinary weekend continuity while remaining bounded.
 * If no approved TCMB snapshot is refreshed within this window,
 * production AI cost authorization must fail closed.
 */
export const AI_T_C_M_B_USD_TRY_MAX_AGE_SECONDS_V1 =
  96 * 60 * 60;

export const AI_T_C_M_B_USD_TRY_FX_POLICY_V1 = Object.freeze({
  version: AI_T_C_M_B_USD_TRY_FX_POLICY_V1_VERSION,

  authority: "tcmb_official_exchange_rates" as const,

  sourceUrl: AI_T_C_M_B_USD_TRY_SOURCE_V1,
  sourceId: AI_T_C_M_B_USD_TRY_SOURCE_ID_V1,

  baseCurrency: "USD" as const,
  quoteCurrency: "TRY" as const,

  /**
   * We use the official USD/TRY selling-side rate as the approved
   * conversion basis because it is conservative relative to the
   * buying side for TRY cost authorization.
   */
  rateBasis: "indicative_selling" as const,

  maxAgeSeconds: AI_T_C_M_B_USD_TRY_MAX_AGE_SECONDS_V1,

  acquisitionMode: "server_side_versioned_snapshot" as const,

  refreshPolicy: "refresh_when_new_official_rate_is_available" as const,

  requestTimeNetworkFetchAllowed: false as const,

  staleBehavior: "fail_closed" as const,

  fixtureAllowedInProduction: false as const,
});

export interface CreateApprovedTcmbUsdTrySnapshotInputV1 {
  readonly snapshotVersion: string;

  /**
   * Authoritatively acquired TCMB USD/TRY selling-side rate.
   * The acquisition job is deliberately NOT implemented here.
   */
  readonly rate: number;

  /**
   * Instant representing the source rate's effective timestamp/date
   * normalized by the server-side acquisition process.
   */
  readonly effectiveAt: string;

  /**
   * Instant when our server-side process loaded and approved it.
   */
  readonly loadedAt: string;
}

function isIsoInstant(value: string): boolean {
  return value.includes("T") && Number.isFinite(Date.parse(value));
}

export function createApprovedTcmbUsdTryFxSnapshotV1(
  input: CreateApprovedTcmbUsdTrySnapshotInputV1,
): AiFxSnapshotV1 {
  if (
    typeof input.snapshotVersion !== "string" ||
    !input.snapshotVersion.trim()
  ) {
    throw new Error("AI_TCMB_FX_SNAPSHOT_VERSION_REQUIRED");
  }

  if (!Number.isFinite(input.rate) || input.rate <= 0) {
    throw new Error("AI_TCMB_FX_RATE_INVALID");
  }

  if (
    !isIsoInstant(input.effectiveAt) ||
    !isIsoInstant(input.loadedAt)
  ) {
    throw new Error("AI_TCMB_FX_TIMESTAMP_INVALID");
  }

  if (Date.parse(input.loadedAt) < Date.parse(input.effectiveAt)) {
    throw new Error("AI_TCMB_FX_LOAD_BEFORE_EFFECTIVE");
  }

  return Object.freeze({
    policyVersion: AI_FX_POLICY_V1_VERSION,

    snapshotVersion: input.snapshotVersion,

    source: AI_T_C_M_B_USD_TRY_SOURCE_ID_V1,
    sourceKind: "authoritative_config",

    baseCurrency: "USD",
    quoteCurrency: "TRY",

    rate: input.rate,

    effectiveAt: input.effectiveAt,
    loadedAt: input.loadedAt,

    maxAgeSeconds: AI_T_C_M_B_USD_TRY_MAX_AGE_SECONDS_V1,
  });
}

export type AiTcmbFxSnapshotValidationV1 =
  | {
      readonly valid: true;
      readonly reason: null;
    }
  | {
      readonly valid: false;
      readonly reason:
        | "invalid_policy"
        | "invalid_source"
        | "invalid_currency"
        | "invalid_rate"
        | "invalid_timestamp"
        | "future_snapshot"
        | "stale_snapshot";
    };

export function validateApprovedTcmbUsdTryFxSnapshotV1(
  snapshot: AiFxSnapshotV1,
  evaluatedAt: string,
): AiTcmbFxSnapshotValidationV1 {
  if (!isIsoInstant(evaluatedAt)) {
    throw new Error("AI_TCMB_FX_EVALUATED_AT_INVALID");
  }

  if (snapshot.policyVersion !== AI_FX_POLICY_V1_VERSION) {
    return { valid: false, reason: "invalid_policy" };
  }

  if (
    snapshot.sourceKind !== "authoritative_config" ||
    snapshot.source !== AI_T_C_M_B_USD_TRY_SOURCE_ID_V1
  ) {
    return { valid: false, reason: "invalid_source" };
  }

  if (
    snapshot.baseCurrency !== "USD" ||
    snapshot.quoteCurrency !== "TRY"
  ) {
    return { valid: false, reason: "invalid_currency" };
  }

  if (!Number.isFinite(snapshot.rate) || snapshot.rate <= 0) {
    return { valid: false, reason: "invalid_rate" };
  }

  if (
    !isIsoInstant(snapshot.effectiveAt) ||
    !isIsoInstant(snapshot.loadedAt) ||
    snapshot.maxAgeSeconds !== AI_T_C_M_B_USD_TRY_MAX_AGE_SECONDS_V1 ||
    Date.parse(snapshot.loadedAt) < Date.parse(snapshot.effectiveAt)
  ) {
    return { valid: false, reason: "invalid_timestamp" };
  }

  const evaluatedMs = Date.parse(evaluatedAt);
  const effectiveMs = Date.parse(snapshot.effectiveAt);
  const loadedMs = Date.parse(snapshot.loadedAt);

  if (effectiveMs > evaluatedMs || loadedMs > evaluatedMs) {
    return { valid: false, reason: "future_snapshot" };
  }

  if (
    evaluatedMs - effectiveMs >
    AI_T_C_M_B_USD_TRY_MAX_AGE_SECONDS_V1 * 1_000
  ) {
    return { valid: false, reason: "stale_snapshot" };
  }

  return { valid: true, reason: null };
}