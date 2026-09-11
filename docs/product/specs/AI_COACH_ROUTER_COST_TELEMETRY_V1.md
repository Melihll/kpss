# AI Coach — Central Router, Pricing, FX and Usage Ledger V1

Status: `EVRE_6B.5_LOCAL_ACCEPTED — TEST_FIXTURE_PRICING_ONLY — NO_RUNTIME_WIRING — NO_PRODUCTION_MIGRATION — CONFIRM_OFF — APPLY_OFF`

Contract versions:

- router: `ai-model-router-v1`;
- evidence estimate: `ai-evidence-estimate-v1`;
- pricing catalog contract: `ai-pricing-catalog-v1`;
- FX policy: `ai-fx-policy-v1`;
- usage event: `ai-usage-event-v1`;
- monthly budget policy: `ai-monthly-budget-policy-v1`;
- cost preflight: `ai-cost-preflight-v1`.

## 1. Scope and non-goals

6B.5 establishes the centralized server-owned selection, price lookup, FX snapshot, provider-attempt event, append-only persistence, monthly accounting, and preflight contracts before any new Coach runtime LLM wiring.

It does not connect `CoachEvidenceViewV1` to a provider, change current Coach prompts/models/responses, call an LLM, enable proactive delivery, create Planner proposals, run Preview/Confirm/Apply, deploy, apply a production migration, access production, or change gates. The migration is authored and tested against loopback local Supabase only.

## 2. Architecture and authority

```text
Coach capability + bounded operational metadata
  -> central routeAiCapabilityV1
  -> versioned route catalog
  -> versioned pricing catalog + immutable FX snapshot
  -> later provider attempt (not wired in 6B.5)
  -> server-owned AiUsageEventV1 construction
  -> record_ai_usage_event_v1
  -> append-only ai_usage_events ledger
  -> deterministic monthly accounting / preflight
```

No feature may choose a provider, model, tier, token ceiling, timeout, retry, fallback, or pricing version independently. Router input has no raw user text and rejects unknown fields. Route output is a decision, not a provider call. Clients cannot override route fields or write cost/usage facts.

## 3. Capability and tier registry

| Capability | Normal default | Notes |
| --- | --- | --- |
| `deterministic_signal_evaluation` | `no_model` | Valid deterministic path; zero provider attempt. |
| `intent_extraction` | `economy` | Bounded structured extraction. |
| `short_explanation` | `economy` | Short grounded explanation. |
| `today_analysis` | `standard` | Today factual analysis. |
| `week_analysis` | `strong` | Week evidence is a cost-watch scope. |
| `subject_analysis` | `standard` | One owned subject scope. |
| `planner_explanation` | `standard` | Persisted Planner facts only; no planning authority. |
| `proactive_explanation` | `economy` | Eligibility is not delivery; 6D controls remain absent. |
| `conversation_summary` | `economy` | Future compact structured state, not raw long-term history. |
| `complex_status_analysis` | `strong` | High-complexity grounded status analysis. |

Tier meanings:

- `no_model`: deterministic response or fail-closed blocked route;
- `economy`: lowest centrally configured provider route;
- `standard`: normal analysis route;
- `strong`: complex/large evidence route.

Budget-aware routing is deterministic. `watch` caps strong at standard; `constrained` permits only the centrally configured economy route; `hard_limit` and unknown budget block a model route. These decisions are not connected to current user behavior in 6B.5. A large evidence class, long response class, or high complexity may raise the normal tier by one before budget caps.

The committed route catalog is named `AI_ROUTE_CATALOG_V1_TEST_FIXTURE`. Its provider and model identifiers are fixtures, not production choices. Every router request must declare `runtimeEnvironment`; a `production` request rejects any route catalog not explicitly marked `production`. There is no default environment and therefore no path that silently promotes a fixture catalog into production authority.

## 4. Evidence-size integration

`estimateAiEvidenceV1` accepts UTF-8 serialized bytes and uses the byte count itself as a conservative token upper-bound estimate. No provider tokenizer/API is called.

| Class | Bytes |
| --- | ---: |
| `small` | `0–16,384` |
| `medium` | `16,385–32,768` |
| `large` | `32,769–65,536` |

`>= 24,576` bytes is cost-watch. Therefore the accepted `week_progress` (`27,820`) and `general_status` (`28,553`) evidence views are medium and cost-watch. Routing does not delete truth to force a cheaper route.

## 5. Versioned pricing catalog

Each catalog has a contract version, immutable version identifier, environment, and effective-from instant. Entries are scoped by provider/model and carry effective interval, native billing currency, input price per million tokens, optional cached-input price, output price, and source kind.

Missing provider/model/version/effective pricing is `unpriced`; it never becomes zero. Cached usage with no cached-input price is also `unpriced`. Provider-reported token usage distinguishes total input, cached input as a subset, output, and total tokens.

Only clearly labelled `AI_PRICING_CATALOG_V1_TEST_FIXTURE` values exist in 6B.5. No value claims to be current official provider pricing. For a production route, a non-production catalog or an entry not marked `authoritative_config` yields explicit `unpriced(authoritative_production_pricing_unavailable)` with a null amount. Authoritative production values remain required before runtime use; there is no zero-price or dummy-price fallback.

## 6. FX and historical cost policy

Native provider cost preserves catalog version, native currency, total amount, and uncached-input/cached-input/output components. The TRY estimate additionally freezes:

- FX policy and snapshot versions;
- source and source kind;
- base/quote currencies;
- rate;
- effective instant;
- calculated TRY amount.

Changing a later price catalog or FX snapshot creates a new event result and never rewrites an old row. Missing or mismatched FX makes TRY cost explicit `unknown`; it does not fall back to zero. A production route requires an FX snapshot marked `authoritative_config`; null or fixture FX yields `unknown(authoritative_production_fx_unavailable)`. 6B.5 adds no external FX dependency and uses a labelled test fixture only.

## 7. `AiUsageEventV1`

One row represents one actual provider attempt. Initial, retry, fallback, and later summarization attempts each require a distinct `providerAttemptId`. An identical repeated write is idempotent; conflicting reuse fails.

The event records:

- user and optional exam-profile identity;
- Coach capability, request ID, and correlation ID;
- router/catalog versions, provider, model, tier, and route reason;
- reported/unavailable input, cached-input, output, and total tokens;
- start/completion, derived latency, status, retry number, fallback relationship, and sanitized error category;
- pricing version, native cost state/components/currency;
- FX snapshot and immutable TRY estimate;
- Istanbul accounting month;
- explicit privacy flags showing raw prompt, raw conversation, and full CoachContext are not stored.

Usage-unavailable or price-unavailable attempts remain measurable but make cost accounting unknown. They are not silently recorded as zero-cost calls.

## 8. Append-only ledger and security

Migration `20260911150000_ai_usage_ledger_v1.sql` creates `public.ai_usage_events` and `record_ai_usage_event_v1(jsonb)`.

- Table schema contains only allowlisted operational metadata; there are no prompt, message, conversation, CoachContext, API-key, or secret columns.
- `(exam_profile_id,user_id)` references the owned profile pair.
- `provider_attempt_id` is globally unique; an advisory lock plus fingerprint provides idempotency and conflict rejection.
- Core usage/cost rows are immutable; UPDATE and DELETE trigger `AI_USAGE_EVENT_IMMUTABLE`, including service-role attempts.
- Authenticated clients receive SELECT only under own-user RLS.
- Authenticated/anon/public roles cannot INSERT and cannot execute the recording RPC.
- Only service role may execute the RPC; the RPC rejects unknown/missing payload fields and mismatched profile ownership.
- SQL constraints independently validate token arithmetic, latency, status/error pairing, cost component totals, TRY × FX arithmetic, and accounting month.

The server adapter serializes exactly the allowlisted ledger payload and invokes the one recording RPC. It exposes no arbitrary table-write or query surface.

## 9. Monthly budget accounting

Thresholds come directly from the Evre 6 product contract:

| State/target | TRY committed spend (`actual + active reservation`) |
| --- | ---: |
| normal target | `< 150` |
| `watch` | `>= 150` and `< 200` |
| `constrained` | `>= 200` and `< 300` |
| heavy-user target | `<= 250` |
| `hard_limit` | `>= 300` |

The accounting period is the half-open Europe/Istanbul calendar-month interval `[local month start 00:00, next local month start 00:00)`. For example, September 2026 is `2026-09-01 00:00 Europe/Istanbul` through, but excluding, `2026-10-01 00:00 Europe/Istanbul` (`2026-08-31T21:00:00Z` through, but excluding, `2026-09-30T21:00:00Z`). Boundary conversion is deterministic and tested immediately before and at both boundaries.

The deterministic summary returns current-month actual TRY spend, active reserved TRY, committed TRY, remaining hard-budget amount, utilization, unique attempt count, duplicate count, and unpriced attempt count. `examProfileId: null` means the required user-wide hard-ceiling scope and includes every profile; a concrete profile ID produces a profile breakdown only. Any unpriced attempt makes monetary totals and budget state unknown/fail-closed. The automatic production hard governor remains a 6G exit criterion.

## 10. Preflight and reservations

`preflightAiCostV1` calculates an upper bound from the selected route, conservative evidence token estimate, bounded operational overhead, route maximum output tokens, pricing version, FX snapshot, and remaining monthly budget. Estimated/pre-authorized and actual billed usage are distinct types and records.

The result may produce a deterministic reservation proposal, but reservation persistence is explicitly `not_implemented_in_6b5`. This does not block 6B.5 because no live Coach runtime uses this router and no provider is called.

Persistent atomic user-month budget reservation is a **hard precondition** before 6B.6 may activate real provider calls or concurrent runtime use. Authorization and reservation must occur atomically against the user-wide Europe/Istanbul month balance, and completion/failure must consume or release that reservation safely. Otherwise two concurrent requests could independently authorize against the same remaining amount and exceed the `300 TL` ceiling. Unknown price, unknown budget, blocked route, hard limit, or estimate exceeding remaining budget returns `allowed: false`; there is no hidden unlimited fallback.

## 11. Historical provider audit

Current historical runtime remains unchanged:

- `supabase/functions/_shared/ai-coach/openai-gateway.ts` hard-codes default `OPENAI_AI_COACH_MODEL = "gpt-5.4-nano"`, output limit `800`, timeout `12,000 ms`, OpenAI Responses endpoint, and no retry.
- `supabase/functions/ai-coach-interpret/index.ts` and `supabase/functions/ai-coach-plan-preview/index.ts` construct `OpenAiGatewayV1` directly from `OPENAI_API_KEY`.
- The gateway returns parsed structured output only. Although provider responses may contain usage metadata, the current implementation does not extract or return token usage, provider request identity, price, or cost.
- Reusable pieces are `store: false`, bounded JSON Schema output, timeout/abort behavior, sanitized failures, and existing authentication/profile ownership checks.
- A later separately approved 6B.6/6C scope must replace direct model selection with the central route decision, expose per-attempt provider usage/identity, wrap retries/fallbacks as separate attempts, and record the ledger. 6B.5 does none of that wiring.

## 12. Local acceptance matrix

Unit and local-Supabase tests cover deterministic routes; no-model; economy/standard/strong; size boundaries; production rejection of fixture routing/pricing/FX; unpriced failure without zero fallback; cached pricing; separate retry/fallback attempts; idempotent dedupe; immutable FX/pricing history; Europe/Istanbul month-start/month-end UTC boundaries; monthly aggregation and all budget states; preflight reservation proposal; user/profile isolation; forged client cost rejection; and absence of raw prompt/context storage.

Local evidence on 2026-09-11:

- clean migration replay and local PostgreSQL lint PASS;
- focused AI Coach/router/Planner-safety regressions `159/159` PASS (including economics/router `18/18`) and complete non-integration regressions `1,020/1,020` PASS;
- complete local integration/RLS suite `140/140` PASS;
- workspace domain/web typecheck PASS;
- ledger acceptance inserted four intentional unique local provider-attempt fixtures, deduplicated the repeated attempt, and left Planner mutation delta `0`;
- static safety: domain provider calls `0`, domain DB calls `0`, domain Planner calls `0`, runtime router wiring `0`, adapter arbitrary table writes `0`, and forbidden ledger columns `0`;
- generated `ai-coach.bundle.js` is deterministic at SHA-256 `BAEF5AA348F9A26248DE458EEE69646FF20DBAE6538F7D7047990A605A954DCB`.

The migration is local-only and remains unapplied to production. 6B is not complete while authoritative production route/pricing/FX config, persistent atomic reservation, actual gateway metering, runtime integration, observability/reconciliation, and 6G enforcement remain open. Persistent reservation is mandatory before 6B.6 provider activation, not an optional later design choice.

6B.6A follow-on: [Provider Runtime and Atomic Budget Safety V1](AI_COACH_PROVIDER_RUNTIME_BUDGET_V1.md) locally implements complete billable-token-bound gating, persistent worst-case reservation, defensive observation, transactional settlement, reconciliation, and production-configuration fail-closed boundaries. It does not supply current authoritative production route/pricing/FX/billable-bound facts, wire a provider runtime, apply a production migration, or complete 6B.
