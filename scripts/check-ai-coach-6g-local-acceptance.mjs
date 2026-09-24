import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root =
  resolve(
    fileURLToPath(
      new URL(
        "..",
        import.meta.url,
      ),
    ),
  );

const read = (path) =>
  readFileSync(
    resolve(
      root,
      path,
    ),
    "utf8",
  );

const contract =
  read(
    "docs/product/PRODUCT_BACKLOG.md",
  );

const reservationMigration =
  read(
    "supabase/migrations/20260911170000_ai_provider_runtime_reservations_v1.sql",
  );

const runtimeConfig =
  read(
    "supabase/functions/_shared/ai-coach/provider-runtime-config-v1.ts",
  );

const orchestrator =
  read(
    "supabase/functions/_shared/ai-coach/read-only-coach-orchestrator-v1.ts",
  );

const billingAudit =
  read(
    "supabase/functions/_shared/ai-coach/provider-openai-billing-audit-v1.ts",
  );

const billingBound =
  read(
    "supabase/functions/_shared/ai-coach/provider-openai-billing-bound-v1.ts",
  );

const activation =
  read(
    "supabase/functions/_shared/ai-coach/provider-runtime-activation-v1.ts",
  );

const economicsSafety =
  read(
    "scripts/check-ai-economics-v1-safety.mjs",
  );

let failed = false;

function requireMarker(
  name,
  source,
  marker,
) {
  const found =
    source.includes(
      marker,
    );

  console.log(
    `${name}=${found ? "PASS" : "FAIL"}`,
  );

  if (!found) {
    console.error(
      `MISSING_MARKER:${name}:${marker}`,
    );

    failed = true;
  }
}

function requireRegex(
  name,
  source,
  regex,
) {
  const found =
    regex.test(
      source,
    );

  console.log(
    `${name}=${found ? "PASS" : "FAIL"}`,
  );

  if (!found) {
    console.error(
      `MISSING_PATTERN:${name}`,
    );

    failed = true;
  }
}

console.log(
  "=== AIC-007 CONTRACT ===",
);

requireMarker(
  "CONTRACT_AIC007",
  contract,
  "## `AIC-007` / Evre 6G",
);

requireMarker(
  "CONTRACT_P0_ZERO",
  contract,
  "P0 authority violations, cross-user leakage, invented workload/material, and false Apply-success claims are zero.",
);

requireRegex(
  "CONTRACT_NORMAL_P90",
  contract,
  /Normal-user projected p90 is `\u2264 200 TL\/month`/,
);

requireRegex(
  "CONTRACT_HEAVY_P90",
  contract,
  /heavy-user projected p90 is `\u2264 250 TL\/month`/,
);

requireMarker(
  "CONTRACT_HARD_300",
  contract,
  "no path exceeds `300 TL/month`",
);

requireMarker(
  "CONTRACT_LEDGER",
  contract,
  "Every model call is ledgered/reconciled",
);

requireMarker(
  "CONTRACT_PRODUCTION_SEPARATE",
  contract,
  "Limited exact-profile production acceptance",
);


console.log(
  "=== HARD GOVERNOR ===",
);

requireMarker(
  "GOVERNOR_USER_MONTH_LOCK",
  reservationMigration,
  "pg_advisory_xact_lock",
);

requireMarker(
  "GOVERNOR_TIMEZONE",
  reservationMigration,
  "Europe/Istanbul",
);

requireMarker(
  "GOVERNOR_UNKNOWN_COST_FAIL_CLOSED",
  reservationMigration,
  "usage_cost_unknown",
);

requireMarker(
  "GOVERNOR_BOUND_INVARIANT_FAIL_CLOSED",
  reservationMigration,
  "cost_bound_invariant_violation",
);

requireRegex(
  "GOVERNOR_EXACT_300",
  reservationMigration,
  /v_spent\s*\+\s*v_reserved\s*\+\s*v_estimated\s*>\s*300/,
);

requireMarker(
  "GOVERNOR_RECONCILIATION_COUNTS_RESERVED",
  reservationMigration,
  "status in ('reserved','reconciliation_required')",
);

requireMarker(
  "GOVERNOR_SETTLEMENT_RPC",
  reservationMigration,
  "record_ai_usage_and_settle_reservation_v1",
);

requireMarker(
  "GOVERNOR_ACTUAL_OVER_RESERVED_RECONCILES",
  reservationMigration,
  "actual_cost_exceeds_reservation",
);

requireMarker(
  "GOVERNOR_MONTHLY_OBSERVABILITY",
  reservationMigration,
  "ai_monthly_user_cost_v1",
);

requireMarker(
  "GOVERNOR_HEALTH_OBSERVABILITY",
  reservationMigration,
  "ai_budget_reservation_health_v1",
);


console.log(
  "=== PROVIDER MAXIMUM AUTHORIZATION ===",
);

requireMarker(
  "PROVIDER_SERVER_COST_AUTHORITY",
  runtimeConfig,
  "authorizeProductionProviderCostMaximumV1",
);

requireMarker(
  "PROVIDER_MAXIMUM_REJECTS_ABOVE_300",
  runtimeConfig,
  "AI_PRODUCTION_COST_MAXIMUM_NOT_RESERVABLE",
);


console.log(
  "=== RUNTIME ACCOUNTING LIFECYCLE ===",
);

requireMarker(
  "ORCHESTRATOR_RESERVE",
  orchestrator,
  "accounting.reserve",
);

requireMarker(
  "ORCHESTRATOR_MARK_STARTED",
  orchestrator,
  "accounting.markStarted",
);

requireMarker(
  "ORCHESTRATOR_SETTLE",
  orchestrator,
  "accounting.settle",
);

requireMarker(
  "ORCHESTRATOR_RELEASE",
  orchestrator,
  "accounting.release",
);

requireMarker(
  "ORCHESTRATOR_RECONCILE",
  orchestrator,
  "accounting.reconcile",
);

requireMarker(
  "ORCHESTRATOR_USAGE_RECORDED",
  orchestrator,
  "usageEventRecorded: true",
);

requireMarker(
  "ORCHESTRATOR_NO_MUTATION",
  orchestrator,
  "noMutationPerformed: true",
);

requireMarker(
  "ORCHESTRATOR_REQUEST_ID",
  orchestrator,
  "requestId: input.requestId",
);

requireMarker(
  "ORCHESTRATOR_CORRELATION_ID",
  orchestrator,
  "correlationId: input.correlationId",
);

requireMarker(
  "ORCHESTRATOR_PRICING_VERSION",
  orchestrator,
  "pricingVersion: route.pricingVersion",
);

requireMarker(
  "ORCHESTRATOR_FX_VERSION",
  orchestrator,
  "fxSnapshotVersion: input.fxSnapshot.snapshotVersion",
);


console.log(
  "=== PRODUCTION FAIL-CLOSED ===",
);

requireRegex(
  "PRODUCTION_BILLING_ELIGIBLE_FALSE",
  billingAudit,
  /AI_OPENAI_PRODUCTION_BILLING_ELIGIBLE_V1\s*=\s*false/,
);

requireRegex(
  "PRODUCTION_INPUT_BOUND_FALSE",
  billingBound,
  /AI_OPENAI_PRODUCTION_INPUT_BOUND_PROVEN_V1\s*=\s*false/,
);

requireRegex(
  "PRODUCTION_BOUNDS_EMPTY",
  billingBound,
  /AI_OPENAI_PRODUCTION_BILLING_BOUNDS_V1[\s\S]{0,100}Object\.freeze\(\[\]\)/,
);

requireMarker(
  "PRODUCTION_ACTIVATION_PROHIBITED",
  activation,
  'return unavailable("production_prohibited")',
);

requireMarker(
  "PRODUCTION_ORCHESTRATOR_DISABLED",
  orchestrator,
  "READ_ONLY_COACH_PRODUCTION_RUNTIME_DISABLED",
);

requireMarker(
  "ECONOMICS_SAFETY_REQUIRES_PRODUCTION_FALSE",
  economicsSafety,
  '"productionAllowed: false"',
);


console.log(
  "=== 6G-A STATUS ===",
);

console.log(
  "LOCAL_HARD_GOVERNOR=ACCEPTED",
);

console.log(
  "LOCAL_LEDGER_RECONCILIATION=ACCEPTED",
);

console.log(
  "LOCAL_OBSERVABILITY=ACCEPTED",
);

console.log(
  "PRODUCTION_BILLING_ELIGIBLE=false",
);

console.log(
  "PRODUCTION_RUNTIME_ALLOWED=false",
);

console.log(
  "NORMAL_USER_PROJECTED_P90=UNPROVEN",
);

console.log(
  "HEAVY_USER_PROJECTED_P90=UNPROVEN",
);

console.log(
  "EXACT_PROFILE_PRODUCTION_ACCEPTANCE=NOT_RUN",
);

console.log(
  "PRODUCTION_RELEASE_AUTHORITY=NOT_GRANTED",
);

if (failed) {
  process.exit(1);
}

console.log(
  "EVRE_6G_A_LOCAL_READINESS_OK",
);
