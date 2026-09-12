# AI Coach — Controlled DEV Runtime Pre-Smoke Foundation V1

> **Current controlled-DEV state - REAL_SMOKE_ATTEMPT_4_GROUNDING_STOP_2026_09_12**
>
> - Attempt 4 reached the full real provider transport and accounting path.
> - Real TCMB calls: `1`.
> - Real OpenAI input-token count calls: `1`; HTTP status `200`.
> - Exact input tokens: `2716`.
> - Count provider request id: `req_b3eb7177ea0349fda7d480f05cea7502`.
> - Real OpenAI generation calls: `1`; HTTP status `200`.
> - Generation provider request id: `req_658551d2cc8e4f0abe40a06c3f1b298b`.
> - Provider order: `count -> generation`.
> - Accounting order: `reserve -> markStarted -> settle`.
> - Accounting counters: reserve `1`, markStarted `1`, settle `1`, release `0`, reconcile `0`.
> - Production access, DB calls, Planner calls, task mutations, deploys, migrations, retries, and fallbacks: all `0`.
> - Execution stopped fail-closed only at grounded response validation with `GROUNDED_COACH_RESPONSE_HALLUCINATED_FACT_REFERENCE`.
> - Root cause: the prompt required exact fact references but the request payload did not expose the validator's exact allowed reference catalog.
> - Offline repair now sends deterministic `referenceCatalog.sourceFactPaths`, `referenceCatalog.acknowledgedUnknownPaths`, and `referenceCatalog.staleOrBlockedWarningPaths` to the model.
> - Grounding validator strictness remains unchanged; fabricated or out-of-catalog paths are still rejected.
> - Focused grounding repair acceptance: `55/55` tests PASS; typecheck PASS; AI economics safety PASS; AI Coach safety PASS.
> - Attempt 4 authorization is consumed. No automatic rerun is authorized.
> - Any next real provider execution is Attempt 5 and requires new explicit operator authorization.
> - Production provider remains prohibited. Current Coach runtime remains disconnected. 6C remains `NOT_STARTED`. Confirm and Apply remain OFF.
> - This block supersedes older current-state wording below it.


> **Current controlled-DEV state - REAL_SMOKE_ATTEMPT_3_COST_TIME_STOP_2026_09_12**
>
> - Attempt 3 real controlled-DEV execution reached the repaired OpenAI input-token count boundary successfully.
> - Real TCMB calls: `1`.
> - Real OpenAI input-token count calls: `1`.
> - OpenAI input-token count HTTP status: `200`.
> - Count provider request id: `req_13e199b81c404d9da2e281ae71c5b241`.
> - Real OpenAI generation calls: `0`.
> - Accounting reserve / mark-started / settle / release / reconcile: `0 / 0 / 0 / 0 / 0`.
> - Execution stopped fail-closed at local controlled-DEV cost authorization with `AI_CONTROLLED_DEV_COST_BOUND_INVALID`.
> - Root cause: the exact count proof is observed at `countedAt`, but controlled-DEV cost authorization evaluated the proof at the earlier request start time (`requestedAt`). Real network latency therefore made a valid proof appear future-dated.
> - Focused offline repair changes controlled-DEV cost authorization evaluation from `input.requestedAt` to `counted.countedAt`.
> - Regression coverage now explicitly models a real count observation occurring after request start.
> - Focused repair acceptance: `48/48` tests PASS; typecheck PASS; AI economics safety PASS; AI Coach safety PASS.
> - Attempt 3 authorization is consumed. No automatic rerun is authorized.
> - Any next real provider execution is Attempt 4 and requires new explicit operator authorization.
> - Production provider remains prohibited. Current Coach runtime remains disconnected. 6C remains `NOT_STARTED`. Confirm and Apply remain OFF.
> - This block supersedes older current-state wording below it.


> **Current controlled-DEV state - REAL_SMOKE_ATTEMPT_2_HARNESS_DISCOVERY_FAILURE_2026_09_12**
>
> - Attempt 2 received explicit operator authorization, but the temporary Vitest harness was created under `scripts/`, which is outside the repository's configured Vitest include paths.
> - Vitest stopped with `No test files found` before the test body executed.
> - Attempt 2 real TCMB calls: `0`.
> - Attempt 2 real OpenAI input-token count calls: `0`.
> - Attempt 2 real OpenAI generation calls: `0`.
> - Database calls, Planner calls, task mutations, production access, deploys, and migrations: `0`.
> - Attempt 2 therefore did **not** test the repaired provider contract and did **not** create a new real provider attempt.
> - The Attempt 2 operational authorization is consumed under the no-automatic-rerun rule.
> - Any next real provider execution requires a new explicit authorization and must use a Vitest-discoverable temporary harness under `supabase/functions/_shared/ai-coach/**/*.test.ts`.
> - Provider repair remains locally GREEN and committed. Production provider remains prohibited. Current Coach runtime remains disconnected. 6C remains `NOT_STARTED`. Confirm and Apply remain OFF.
> - This block supersedes older current-state wording below it.


> **Current controlled-DEV state - REAL_SMOKE_ATTEMPT_1_2026_09_12**
>
> - The first explicitly authorized real controlled-DEV smoke attempt is consumed.
> - Real OpenAI input-token calls in attempt 1: `1`.
> - The input-token request returned HTTP `400` and failed closed as `count_http_error`.
> - Provider request id: `req_ee35d869741f444c8de988f93b0f9bec`.
> - Real generation calls in attempt 1: `0`.
> - Reservation / mark-started / settlement / release / reconciliation: `0 / 0 / 0 / 0 / 0`.
> - Database calls, Planner calls, task mutations, production access, deploys, and migrations caused by the smoke: `0`.
> - The offline provider-contract repair is focused-GREEN. The strict provider schema surface was reduced while stronger deterministic local validation remains enforced.
> - Safe provider error `type/code/param` diagnostics are now implemented locally; provider message text is not surfaced.
> - A second real provider smoke is **NOT AUTHORIZED**.
> - Production provider activation remains prohibited. Current Coach runtime remains disconnected. 6C remains `NOT_STARTED`. Confirm and Apply remain OFF.
> - This current-state block supersedes older pre-smoke wording later in this document.


Status: `EVRE_6B.6B.2_LOCAL_ACCEPTANCE_GREEN — INPUT_COUNT_BILLING_UNRESOLVED — SECOND_REAL_SMOKE_NOT_AUTHORIZED — REAL_SMOKE_ATTEMPT_1_COUNT_HTTP_400 — PRODUCTION_DISABLED — CONFIRM_OFF — APPLY_OFF`

Contract versions: `ai-provider-runtime-activation-v1`, `openai-server-secret-v1`, `openai-dev-gateway-v1`, `ai-openai-billing-audit-v1-2026-09-12`, `ai-tcmb-fx-acquisition-v1`, `ai-provider-reconciliation-policy-v1`, and `ai-coach-dev-smoke-policy-v1`.

## 1. Decision

6B.6B.2 prepares the server-only boundary for one future explicitly authorized DEV provider smoke. It does not make that call, connect the current Coach endpoint, authorize production, deploy, push, commit, or change Planner gates.

The official OpenAI audit remains fail-closed as an authority source: current documentation describes `POST /responses/input_tokens` and its result but does not explicitly resolve whether that counting call is billed. `TEMP_DEV_COST_POLICY_2026_09_12` does not relabel that uncertainty as free; instead, it allows exactly one separately approved, server-owned, identity-bound local-DEV smoke to explicitly accept the unresolved count-endpoint billing risk while retaining telemetry, reservation, reconciliation, and observed-cost evidence. Production remains independently prohibited.

## 2. Official OpenAI billing decision table

Audit date: 2026-09-12. Only current official OpenAI documentation was used.

| Fact | Decision | Evidence | Runtime consequence |
| --- | --- | --- | --- |
| `POST /responses/input_tokens` exists and returns complete Responses input tokens | `VERIFIED` | [Input Tokens API](https://developers.openai.com/api/reference/typescript/resources/responses/subresources/input_tokens) | Exact complete-request count is the required generation input bound. |
| Count endpoint cost/no-cost treatment | `UNRESOLVED` | The official endpoint reference states no explicit billing treatment. | Official audit alone authorizes no call. Under `TEMP_DEV_COST_POLICY_2026_09_12`, exactly one separately approved controlled local-DEV smoke may explicitly accept the unresolved risk; production remains blocked. |
| GPT-5.4 separate cache-write charge | `NOT APPLICABLE` | [Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching) assigns the 1.25× write charge to GPT-5.6 and later; GPT-5.4 has no additional write charge. | Selected GPT-5.4 routes do not add a separate write component. A surprising non-zero `cache_write_tokens` value is an invariant violation, not ordinary billing. |
| Cached input pricing | `VERIFIED` | [GPT-5.4 model](https://developers.openai.com/api/docs/models/gpt-5.4) and the corresponding mini/nano model pages publish cached-input rates. | Actual cached tokens use the frozen matching cached-input rate; reservation never assumes a cache hit. |
| Responses usage fields | `VERIFIED` | [Responses create](https://developers.openai.com/api/reference/cli/resources/responses/methods/create) and prompt-caching guidance expose input, cached/cache-write detail, output, reasoning detail, and total. | Missing/malformed/subset/total/unknown-class evidence is reconciliation-required. |
| `max_output_tokens` covers visible and reasoning output together | `VERIFIED` | Responses create reference. | One route-owned limit bounds both output categories, priced at output rate. |
| Request identity | `VERIFIED` | [API overview](https://developers.openai.com/api/reference/overview) defines provider `x-request-id` and explicit caller `X-Client-Request-Id`. | The two identifiers stay distinct; a Responses resource `id` is not mislabeled as the HTTP request ID. |

No inference is made from documentation silence.

## 3. Central activation and secrets

`resolveAiProviderRuntimeActivationV1` is the sole real-provider activation decision:

- `AI_PROVIDER_RUNTIME_ENABLED` is absent/false by default;
- malformed values fail closed;
- production is unconditionally prohibited;
- environment and scope must match exactly;
- one server-configured user/profile pair must match;
- the official billing gate must be complete;
- request bodies and user text are not accepted as activation input.

Mock transports remain available to local/test acceptance without enabling real provider traffic. For controlled `local_dev`, an otherwise valid exact-scope server configuration may resolve available only when the server-owned unresolved-count-billing risk flag is explicitly `true`; malformed, missing, wrong-identity, wrong-scope, and production configurations remain unavailable. The official billing audit itself still grants no provider-call authority.

`OPENAI_API_KEY` is read only by the Supabase server boundary. The credential is kept in a closure, serializes to a redacted marker, is never written to the ledger or reservation, and missing/malformed values fail closed. No browser/client import, committed `.env`, or production-secret change is authorized.

## 4. Direct non-production gateway

`openai-dev-gateway-v1.ts` implements exactly two fixed-origin operations through mandatory injected `fetch`:

1. `POST https://api.openai.com/v1/responses/input_tokens`;
2. `POST https://api.openai.com/v1/responses`.

The gateway has no arbitrary URL option and no global fetch default. It requires a central activation capability and server credential, validates the complete immutable request fingerprint before each call, sends an explicit unique ASCII `X-Client-Request-Id`, captures provider `x-request-id`, uses `AbortController` timeouts, and performs zero automatic retries.

Generation sends the already accepted request: pinned model, exact `max_output_tokens`, `store:false`, `background:false`, `truncation:disabled`, `service_tier:default`, strict structured output, reasoning `none`, and no tools/web/file/function surface. Count and generation serialize their corresponding projections of that same immutable request. A post-count change fails before provider entry.

Timeout/network ambiguity after fetch begins is `outcome_unknown`; it is not treated as definitely free. Count failure prevents generation. A generation ambiguity enters reconciliation and cannot be retried automatically. A received generation HTTP error is a known transport outcome, not a thrown-away response: its status, provider request ID, payload, and any usage continue through strict accounting/reconciliation so cost is never fabricated as zero.

## 5. Usage and identity fidelity

The provider parser requires non-negative integer `input_tokens`, `cached_tokens`, `output_tokens`, `reasoning_tokens`, and `total_tokens`. It captures `cache_write_tokens` when the provider returns it; absence is valid for the selected GPT-5.4 no-additional-charge contract, while malformed or non-zero values fail closed. Required arithmetic is:

```text
cached_tokens <= input_tokens
reasoning_tokens <= output_tokens
total_tokens = input_tokens + output_tokens
```

Required input/output detail objects and their cached/reasoning fields may not disappear. Unknown usage/detail fields, a malformed or non-zero GPT-5.4 cache-write count, invalid arithmetic, or missing usage makes provider usage unavailable and forces reconciliation. Actual cost is never derived from the preflight estimate.

Identity remains explicit across internal request ID, correlation ID, reservation ID, provider attempt ID, count client request ID, count provider request ID, generation client request ID, provider HTTP request ID, provider response resource ID, model, route/pricing/FX versions, and complete request fingerprint. The orchestrator rejects count client-ID, fingerprint/model, generation client-ID, or provider request-ID mismatch before settlement. The DB settlement RPC remains authoritative for cross-user/profile/request/correlation/attempt/route/model/pricing/FX equality and idempotency.

## 6. TCMB FX acquisition and ownership

`provider-fx-acquisition-v1.ts` accepts the official `https://www.tcmb.gov.tr/kurlar/today.xml` source only. It deterministically requires one USD row and positive `ForexSelling`, derives the dated 15:30 Europe/Istanbul publication instant as `effectiveAt`, and records the actual acquisition time as `loadedAt`.

Reloading an old bulletin changes `loadedAt` only. It does not advance `effectiveAt` and therefore cannot reset freshness. Missing/duplicate/malformed rows, invalid timestamps, non-positive rates, and stale snapshots fail closed. Tests use local XML fixtures and injected fetch; no network is used.

Update ownership is `server_side_scheduled_config_acquisition`. Browser, user request, Coach prompt, Planner, and arbitrary endpoint caller are excluded. No production scheduler is deployed in this phase.

## 7. Reconciliation contract

The operational reason registry covers unknown provider outcome after timeout, actual cost above reservation, malformed usage, identity mismatch, missing usage after possible execution, duplicate/ambiguous result, and definitely-not-started attempts.

All possible-execution/identity/cost cases are critical, block future calls for the affected user/month, preserve the immutable accounting trail, prohibit fabricated zero settlement, prohibit automatic retry/release, and require authoritative provider evidence or operator reconciliation. Only a transport-proven `not_started` attempt may release automatically. See [DEV smoke and reconciliation runbook](AI_COACH_DEV_SMOKE_RUNBOOK.md).

## 8. Hard-cost proof

For the selected text-only global-standard GPT-5.4 generation request:

```text
uncachedInputTokens = input_tokens - cached_tokens
actualUSD = uncachedInputTokens × inputRate
          + cached_tokens × cachedInputRate
          + output_tokens × outputRate

generationMaxUSD = exactCompleteInputTokens × ordinaryInputRate
                 + max_output_tokens × outputRate

generationMaxTRY = ceil_to_micro_try(generationMaxUSD × frozen USD/TRY)
```

There is no separate GPT-5.4 cache-write charge. The reservation assumes no cache hit, so cached input cannot increase the generation maximum. Reasoning is included within output tokens and the one output limit.

The canonical DB RPC atomically enforces:

```text
settled user-month TRY
+ active/reconciliation reservations
+ new generationMaxTRY
<= 300 TRY
```

The generation-cost reservation proof remains complete for the modeled Responses request, while the count endpoint's own billing remains unresolved and is not represented as zero/free. `TEMP_DEV_COST_POLICY_2026_09_12` temporarily permits exactly one separately approved controlled local-DEV smoke to observe that unknown cost in practice. This exception is DEV-only, server-owned, identity-bound, one-attempt/no-fallback, fully metered, and does not weaken production cost requirements.

## 9. One future DEV smoke policy

The defined but unexecuted candidate is exactly one authenticated local-DEV `today_analysis` using `today_explain`, the centrally required `standard` route, at most 16,384 evidence bytes, at most 200,000 exact complete input tokens, and exactly 900 combined output/reasoning tokens. It requires the central kill switch, exact allowlist, server key, fresh authoritative TCMB snapshot, exact count, atomic reservation, one provider attempt, no fallback, no automatic retry, no mutations, no Planner action, no production data, and post-attempt ledger/reservation inspection.

Current status is `SECOND_REAL_SMOKE_NOT_AUTHORIZED`: local technical acceptance and full mocked A→Z execution are green, but no real provider call has occurred. The remaining gate is a separate explicit real-smoke authorization plus real TCMB/server-secret/operator preflight. Production is independently ineligible and would still require approved migration/deployment/runtime/gate scope after any DEV evidence.

## 10. Authority state

- Current production Coach runtime: unchanged.
- Real provider calls: `0`; runtime inactive.
- Production provider eligibility: `false`.
- Planner Preview/Confirm/Apply calls: `0`; Confirm OFF; Apply OFF.
- Product/task/session/material/capacity/Planner mutations: `0`.
