# AI Coach — Provider Runtime and Atomic Budget Safety V1

Status: `EVRE_6B.6A_LOCAL_ACCEPTED — PRODUCTION_CONFIG_UNAVAILABLE — NO_RUNTIME_WIRING — NO_PRODUCTION_MIGRATION — CONFIRM_OFF — APPLY_OFF`

Contract versions:

- production configuration: `ai-provider-runtime-config-v1`;
- route decision: `ai-model-router-v1`;
- pricing catalog: `ai-pricing-catalog-v1`;
- FX policy: `ai-fx-policy-v1`;
- provider observation: `ai-provider-attempt-observation-v1`;
- usage event: `ai-usage-event-v1`;
- persistent reservation storage/RPC: `ai-budget-reservation-v1`.

## 1. Scope and release state

6B.6A implements the server-side safety foundation required before a later real provider runtime can be considered. It does not wire `CoachEvidenceViewV1` into user-facing Coach responses, change prompts/models/current provider behavior, make a provider call, enable proactive delivery, deploy, apply a production migration, access production, change gates, or invoke Planner Preview/Confirm/Apply.

The exact intended chain is:

```text
Coach capability
  -> authoritative server-side router configuration
  -> versioned authoritative pricing + FX snapshot
  -> atomic user-month reservation
  -> provider attempt
  -> defensive usage/request-id extraction
  -> immutable usage ledger
  -> atomic settlement or explicit reconciliation
```

This chain is contractual and locally tested but not connected to the current Coach runtime. 6B and all later phases remain incomplete.

## 2. Production route authority

`resolveProductionAiRuntimeConfigV1` is the single production configuration boundary. It requires a production-only, versioned route catalog with provider/model/tier mappings, max output tokens, timeout, retry/fallback policy, pricing-version reference, effective time, and a complete capability-to-allowed-tier registry. It also requires server-approved source, verification, verification time, and load time metadata.

Every callable production route must additionally have one authoritative billable-bound contract. That contract must cover the complete request payload; place a server-enforced upper bound on input tokens; confirm that the provider-enforced output limit includes visible and reasoning output; map reasoning tokens to the authoritative output price; enumerate input, cached-input, output, and reasoning-output as covered classes; and declare no uncovered billable token class. UTF-8 evidence bytes remain a conservative planning estimate only and are not accepted as this production billing proof.

No production route catalog or model identifiers are embedded in 6B.6A. `null`, fixture, non-production, incomplete, future-effective, unverified, or billing-unbounded input resolves to explicit unavailable state. Feature code and clients cannot select provider, model, tier, pricing version, retry, fallback, or reservation amount. The current user-facing Coach runtime does not use this resolver yet.

Authoritative current provider/model facts were not available in the repository and were not invented. Production route status is therefore `production_config_missing` until an approved server-side source is supplied and operationally reviewed.

## 3. Pricing and FX authority

Every production route must have a matching effective pricing entry marked `authoritative_config`, with positive input/output prices, optional non-negative cached-input price, native currency, pricing version, and source metadata. Test fixture catalogs cannot satisfy the production resolver. Missing, invalid, mismatched, or non-authoritative pricing makes the production runtime unavailable; no zero or guessed fallback exists.

The FX boundary requires provider currency to TRY, a positive rate, snapshot/source/version identity, effective time, load time, and a positive maximum age. Production accepts only `authoritative_config` snapshots that are effective, loaded no earlier than their effective time, not future-loaded, and fresh at evaluation time. Missing, fixture, invalid, or stale FX fails closed. Provider requests do not fetch FX from the internet.

No approved production pricing catalog or FX source/update mechanism is included. The operator must later provide versioned server configuration, approval evidence, refresh ownership, alerting, and rotation policy. Historical ledger rows retain the exact pricing and FX facts used for each attempt.

## 4. Persistent user-wide reservation

Migration `20260911170000_ai_provider_runtime_reservations_v1.sql` adds `ai_budget_reservations` and append-only `ai_budget_reservation_events`. A reservation records:

- reservation/user/profile identity;
- Europe/Istanbul accounting month plus exact UTC month boundaries;
- route, route-catalog, pricing, FX-policy, and FX-snapshot versions;
- authoritative billable-bound version and its calculated worst-case TRY commitment;
- request/correlation identity;
- provider-attempt binding and state;
- status, actual TRY amount, usage-event reference, reconciliation reason, and timestamps;
- input and event fingerprints for idempotency/audit.

The hard ceiling is user-wide, including every profile owned by that user. A profile ID is attribution only. Budget states stay `<150 normal`, `150–<200 watch`, `200–<300 constrained`, and `>=300 hard_limit`; the 250 TL heavy-user value is a target, not an extra allowance.

The accounting window is the half-open Europe/Istanbul calendar month. September 2026 is `[2026-08-31T21:00:00Z, 2026-09-30T21:00:00Z)`.

## 5. Atomic concurrency authority

`reserve_ai_budget_v1` runs with service authority and takes a transaction-scoped advisory lock derived from `(user_id, Istanbul accounting month)`. Under that serialized lock it:

1. validates the exact payload and profile ownership;
2. resolves expired unstarted reservations and marks expired in-flight work for reconciliation;
3. rejects a month containing unknown usage cost;
4. sums immutable actual usage cost plus active/reconciliation reservation commitments;
5. inserts the server-authorized worst-case commitment only when the result is at most 300 TRY.

The calculation and insert occur in one database transaction. Competing requests cannot independently authorize the same remaining amount. Identical reservation IDs are idempotent; conflicting reuse fails.

## 6. Lifecycle and recovery

Lifecycle states are:

```text
reserved -> settled
reserved -> released
reserved -> expired
reserved -> reconciliation_required
```

Provider-attempt state is separately `not_started`, `in_flight`, `completed`, or `outcome_unknown`.

- A failure before a provider attempt releases the reservation.
- A known actual attempt cost settles once; unused reserved capacity is released implicitly because only actual ledger cost remains committed.
- A known actual cost above its authorized worst-case reservation is an invariant failure. The immutable actual attempt remains recorded, the reservation becomes `reconciliation_required`, and every new reservation for that user-month fails closed with `cost_bound_invariant_violation` until operational reconciliation. It is never treated as normal headroom.
- Missing usage/cost or an uncertain in-flight timeout enters `reconciliation_required`; it is never silently released or counted as zero.
- Expired unstarted reservations become `expired`; expired in-flight attempts become `reconciliation_required`.
- A late known provider result within the authorized maximum may atomically move an unresolved timeout from `reconciliation_required` to `settled`. Until then reconciliation commitments continue consuming their reserved maximum, and unknown ledger cost or a worst-case-bound violation blocks new reservations for that user-month.

`record_ai_usage_and_settle_reservation_v1` locks the reservation, requires exact user/profile/request/correlation/attempt plus route/catalog/provider/model/tier/pricing/FX identity parity, records the immutable usage event, and updates settlement/reconciliation in the same transaction. If identity differs or any later settlement step fails, the ledger insert rolls back. Repeating a completed attempt is idempotent; retries and fallbacks use separate attempt and reservation identities.

`authorizeProductionProviderCostMaximumV1` calculates the reservation maximum only from the resolved route, its billable-token upper bounds, the matching authoritative price entry, and the frozen FX snapshot. It prices the entire input bound at the more expensive of cached or uncached input rates and prices the entire output/reasoning bound at the output rate. The reservation adapter rejects route/config/version/bound mismatches and rejects fixture authority in production.

## 7. Provider observation and ledger linkage

`extractOpenAiProviderAttemptObservationV1` defensively extracts response-body or response-header request identity, provider status, HTTP status, input/cached-input/output/total tokens, timing, attempt/retry number, and fallback linkage. It stores no raw provider payload.

Provider shapes are treated as untrusted. Missing or inconsistent required token counts produce an all-null `provider_usage_unavailable` observation; missing cached-token detail alone remains nullable and is conservatively priced as ordinary input. Missing usage is never zero usage. `providerObservationToUsageEventAttemptV1` maps the sanitized observation into the server-owned `AiUsageEventV1` attempt fields. The usage event freezes provider request identity, pricing version, native cost, FX snapshot, TRY estimate, and execution metadata.

No parsing function performs network I/O, and the current gateway only re-exports the parser; it does not invoke it in the user-facing runtime.

## 8. Security and authority

- Only `service_role` may reserve, start an attempt, release, reconcile, expire, or atomically record-and-settle.
- Public, anonymous, and authenticated roles cannot execute mutation RPCs or write reservation tables.
- RLS permits users to read only their own reservation facts; operational views are service-owned.
- RPCs validate exact allowlists and profile ownership. Clients cannot forge route, model, tokens, price, FX, cost, attempt, or settlement facts.
- Reservation/event schemas contain no raw prompt, message, conversation, Coach evidence/context, API key, or secret.
- Financial usage rows are immutable; reservation transitions emit append-only audit events.
- The foundation creates no Planner proposal and has no Preview, Confirm, Apply, capacity, workload, or task mutation authority.

## 9. Read-only operations

The migration defines service-owned read-only views for:

- stuck or expired reservations;
- reconciliation-required states;
- usage without settled reservation;
- attempted reservation without usage;
- unknown usage/cost;
- estimated-versus-actual deltas;
- monthly user settled, reserved, committed, and reconciliation totals;
- route/model attempt and cost distribution.

No admin UI is added. Later operations must assign reconciliation ownership and alerting before activation.

## 10. Local acceptance

Local acceptance uses only loopback Supabase (`127.0.0.1:54321` API, `127.0.0.1:54322` PostgreSQL). It covers:

- production rejection of missing/fixture/unverified route, pricing, and stale FX configuration;
- injected synthetic authoritative configuration for contract testing only;
- defensive usage/request-ID extraction and missing-usage semantics;
- two-request and many-request atomic contention;
- exact `290 + 10 = 300` acceptance and `290 + 10.01` rejection, plus concurrent 300 TRY saturation;
- idempotency, expiry, release, settlement, retry/fallback, and reconciliation;
- transaction rollback when settlement fails after the nested ledger write;
- Europe/Istanbul month boundaries;
- separate-user isolation and same-user multi-profile shared ceiling;
- client/RLS/service authority and raw-content rejection.

Accepted local evidence on 2026-09-11:

- clean local migration reset PASS and PostgreSQL lint PASS;
- provider/economics/config/gateway focused tests `45/45` PASS;
- complete integration/RLS suite `156/156` PASS, including reservation acceptance `16/16`;
- focused provider/economics/config/gateway tests `46/46` PASS and complete non-integration regression `1,031/1,031` PASS;
- workspace domain/web typecheck PASS;
- safety counters: domain provider calls `0`, provider-boundary network calls `0`, runtime-router wiring `0`, arbitrary reservation writes `0`, forbidden content columns `0`;
- generated AI Coach bundle rebuilt from source with the canonical repository script.

## 11. Remaining activation blockers

6B.6A is not sufficient to make a real provider call. Before a later separately approved runtime scope may do so, all of the following remain mandatory:

1. approved current production route/provider/model configuration and evidence;
2. approved production pricing catalog and update ownership;
3. approved FX source, refresh mechanism, staleness monitoring, and current snapshot;
4. a server-side orchestrator that enforces the entire route → price/FX → reserve → attempt → ledger → settle/reconcile chain;
5. complete-payload input-bound enforcement and provider output/reasoning-limit enforcement before the network call;
6. provider gateway metering wired so no network attempt can bypass an accepted reservation;
7. operational reconciliation/alerting and failure-runbook acceptance;
8. separately approved production migration, deployment, secrets/configuration, and limited-release verification.

Until then production configuration remains unavailable and the user-facing runtime remains unchanged.
