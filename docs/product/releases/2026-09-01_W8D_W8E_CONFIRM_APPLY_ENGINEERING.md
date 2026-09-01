# W8D Confirm Correction + W8E Controlled Apply Engineering

Date: 2026-09-01

Source baseline: `0cdd49db7778735bd096ac60c492624041ffbc76`

Scope: local engineering and read-only production verification only

## Incident and correction

Historical proposal `19ade727-e534-4be1-bdb0-3c7b6e505af0` is expired, with `confirmed_at = null`. Its database confirmation function returned `{ state: "expired", confirmed: false }` as a successful JSON RPC result. The app-api forwarded that result as HTTP 200, and the web discarded the response body and set a local success boolean. That local boolean disabled the button and rendered a false confirmed message.

The candidate removes that optimistic state. App-api parses only the exact record/proposal/fingerprint/snapshot/planner identity, invokes confirmation, rereads the owned lifecycle row, and returns success only for exact persisted `confirmed` state with non-null `confirmed_at`. The web validates the same exact authoritative response before entering confirmed state. Expired, stale, rejected/non-pending, and identity-conflict outcomes show deterministic regenerate guidance and never show success.

Reload does not manufacture historical confirmation: the panel starts without local proposal state and only displays confirmation for an exact response belonging to the preview currently in memory. No new historical-proposal endpoint was introduced.

## Controlled Apply boundary

`PLANNER_V2_APPLY_V1_PROFILE_IDS` is a separate exact UUID allowlist. Missing, blank, malformed, empty-entry, mixed-invalid, or wildcard configuration fails closed. Whitespace is trimmed and duplicates are harmless. Apply requires preview eligibility but does not inherit authority from confirmation.

`POST /planner-v2/apply`:

1. verifies the human JWT through the normal app-api entry;
2. derives the user and active owned exam profile server-side;
3. refuses any client-supplied actor/profile/service authority and accepts only the five exact proposal identity fields;
4. loads the exact owned Planner V2 lifecycle row and requires confirmed persistence (or an exact already-applied replay);
5. reruns the read-only canonical Planner V2 adapter and compares plan identity, generation, and component freshness;
6. invokes the existing service-role-only atomic Apply RPC with server-derived actor bindings;
7. returns only an exact authoritative applied result.

The database remains the only mutation boundary. It preserves the established ownership, expiry/freshness, plan-generation/database-fingerprint, exact daily/weekly capacity, current-day protection, retained task, replacement scope, canonical identity/boundary, unknown-workload refusal, uniqueness, rollback, and idempotency checks. No client multi-write or fallback-minute path exists.

The Week UI exposes Apply only after an exact persisted confirmation and only while Apply capability is ON. Neither confirmed nor applied state is optimistic.

## Current-week bootstrap audit

The active P48 strategy has no plan for 2026-08-31 through 2026-09-06 because it has zero active recurring availability rows and zero week-specific daily capacity overrides. A positive strategy target is not treated as capacity by itself. This is expected fail-closed behavior.

- Weekly plans are lazily auto-created by the existing Week/Today `ensureWeek` path when capacity exists.
- Recurring `weekly_availability` rows carry forward across weeks; there are currently none to carry.
- The existing generator correctly raises `P48_CAPACITY_SOURCE_MISSING` rather than inventing minutes.
- Safest supported future action: Settings → Weekly capacity → Edit; add and save recurring windows; then open Week. That invokes the existing authenticated `POST /p48/week/generate` flow. Do not edit the database directly.

No bootstrap action was executed in production.

## Verification and release boundary

- focused confirm/Apply/capability/lifecycle/security: `86/86` across `5/5` files PASS;
- targeted canonical Planner V2/planning/capacity/P48: `451/451` across `56/56` files PASS;
- dedicated local authenticated HTTP matrix: PASS, including expired-before-click, gate OFF, previewed denial, unauthenticated/foreign/client-actor denial, exact Apply, and idempotent replay;
- local integration/RLS/transaction: `130/130` across `13/13` files PASS;
- full non-integration: `939/939` across `135/135` files PASS;
- domain and web typechecks: PASS;
- explicit production-target web/domain build: PASS; configured production Supabase host present, configured loopback target absent, and service-role material absent;
- app-api local Edge serve/bundle path, Planner V2 bundle/read-only safety, client secret scan, and local PostgreSQL lint: PASS;
- migration required: NO.

Production was not deployed or mutated. Read-only CLI refresh reports app-api v36 ACTIVE and zero pending migrations. Preview remains exact-profile-only; confirmation is OFF; `PLANNER_V2_APPLY_V1_PROFILE_IDS` is absent/OFF; canonical planner and evidence shadow are OFF. The expired historical proposal was not reused.

## Next fresh pilot sequence

`sanctioned current-week capacity → current plan → one fresh preview → read-only audit → exact confirm → persisted-confirm audit → exact Apply gate ON → one Apply → read-only audit → Apply gate OFF`

Every production step requires its own explicit release/activation approval. The historical expired proposal is permanently ineligible.
