export const AI_PROVIDER_RECONCILIATION_POLICY_V1_VERSION =
  "ai-provider-reconciliation-policy-v1" as const;

export const AI_PROVIDER_RECONCILIATION_CASES_V1 = Object.freeze({
  provider_outcome_unknown_after_timeout: Object.freeze({
    severity: "critical" as const,
    blockUserMonth: true as const,
    automaticRetryAllowed: false as const,
    automaticReleaseAllowed: false as const,
    releaseRule: "settle_from_authoritative_provider_result_or_operator_verified_no_charge",
  }),
  actual_cost_exceeds_reservation: Object.freeze({
    severity: "critical" as const,
    blockUserMonth: true as const,
    automaticRetryAllowed: false as const,
    automaticReleaseAllowed: false as const,
    releaseRule: "operator_reconcile_invariant_and_preserve_actual_cost",
  }),
  provider_usage_malformed: Object.freeze({
    severity: "critical" as const,
    blockUserMonth: true as const,
    automaticRetryAllowed: false as const,
    automaticReleaseAllowed: false as const,
    releaseRule: "settle_from_authoritative_usage_or_keep_reserved_maximum_committed",
  }),
  request_identity_mismatch: Object.freeze({
    severity: "critical" as const,
    blockUserMonth: true as const,
    automaticRetryAllowed: false as const,
    automaticReleaseAllowed: false as const,
    releaseRule: "operator_verify_provider_request_and_internal_identity_chain",
  }),
  missing_usage_after_possible_execution: Object.freeze({
    severity: "critical" as const,
    blockUserMonth: true as const,
    automaticRetryAllowed: false as const,
    automaticReleaseAllowed: false as const,
    releaseRule: "settle_from_authoritative_usage_or_keep_reserved_maximum_committed",
  }),
  duplicate_or_ambiguous_provider_result: Object.freeze({
    severity: "critical" as const,
    blockUserMonth: true as const,
    automaticRetryAllowed: false as const,
    automaticReleaseAllowed: false as const,
    releaseRule: "operator_dedupe_by_attempt_and_provider_request_identity",
  }),
  definitively_not_started: Object.freeze({
    severity: "warning" as const,
    blockUserMonth: false as const,
    automaticRetryAllowed: false as const,
    automaticReleaseAllowed: true as const,
    releaseRule: "release_only_when_transport_proves_no_provider_execution",
  }),
});
