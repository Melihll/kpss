# AI Coach — One Controlled DEV Smoke and Reconciliation Runbook

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


Status: `ATTEMPT_1_STOPPED_AT_COUNT_HTTP_400 — READY_FOR_SEPARATE_EXPLICIT_DEV_SMOKE_AUTHORIZATION — INPUT_COUNT_BILLING_UNRESOLVED — PRODUCTION_PROHIBITED`

## Preconditions — every item must be green

- Separate written approval for exactly one DEV smoke.
- Central server switch set only for `local_dev` + `one_controlled_dev_smoke_v1`.
- One exact server-side user/profile allowlist; no production identity or data.
- `OPENAI_API_KEY` present only in the server secret store and never printed.
- `TEMP_DEV_COST_POLICY_2026_09_12` is explicitly active for this one controlled local-DEV observation, and the server-owned activation reports `inputCountBillingAuthority=explicitly_accepted_unresolved_dev`. The count-endpoint billing fact itself remains **UNRESOLVED** and must not be represented as free.
- Selected GPT-5.4 pinned model, global standard service, and official frozen pricing version match.
- Fresh approved TCMB USD/TRY `ForexSelling` snapshot passes the 96-hour policy.
- `today_analysis` / `today_explain`; evidence `<=16,384` bytes; exact complete input `<=200,000`; `max_output_tokens=900`.
- Atomic user-wide Europe/Istanbul month reservation proves committed amount plus new worst case `<=300 TRY`.
- One attempt, zero automatic retries, zero fallback, no tools, `store:false`.
- Local DB and ledger/RLS acceptance green; production runtime remains disabled.

## Execution checklist — run only after separate explicit real-smoke authorization

1. Record internal request, correlation, reservation, attempt, and count client-request IDs.
2. Revalidate switch, environment, allowlist, billing gate, pricing, FX, and current user-month state.
3. Send the immutable count request once; capture provider `x-request-id`.
4. Verify exact count/fingerprint/model/client-request identity.
5. Calculate the generation maximum from exact count + output cap + frozen pricing/FX.
6. Atomically reserve the generation maximum in the canonical DB RPC.
7. Mark the one attempt in flight.
8. Send the identical fingerprinted generation request once; capture `X-Client-Request-Id`, `x-request-id`, and response resource ID.
9. Parse usage strictly and verify count, output bound, billable classes, identities, and actual `<=` reservation.
10. Atomically write the immutable ledger event and settle; validate grounded response without any domain/Planner mutation.
11. Turn the switch OFF immediately.
12. Inspect reservation, ledger, user-month committed cost, and safety counters; retain no raw prompt/context/key.

## Reconciliation matrix

| Case | Immediate state | Retry | Release/settle rule |
| --- | --- | --- | --- |
| Timeout/network loss after possible provider receipt | `reconciliation_required`; block user-month | Do not retry automatically | Settle from authoritative provider result or operator-verified no-charge evidence. |
| Actual cost above reservation | Critical invariant violation; preserve actual; block user-month | Never retry automatically | Investigate billing/request contract; reconcile without hiding spend. |
| Malformed or missing usage after possible execution | `reconciliation_required`; reserve stays committed | Do not retry | Obtain authoritative usage or retain reserved maximum. Never settle zero. |
| Fingerprint/model/client/provider request identity mismatch | Critical; block user-month | Do not retry | Match provider and internal records before any settlement. |
| Duplicate or ambiguous result | Keep immutable first record; block when identity cannot be proven | Do not create a new attempt silently | Dedupe by internal attempt + provider HTTP request identity. |
| Transport proves provider attempt never started | Release permitted | A later retry needs a new attempt and reservation | Release with `provider_attempt_not_started`; never reuse identity. |

Operator-visible records must include reason code, severity, user/accounting month, reservation/attempt/request/correlation identities, model/route/pricing/FX versions, provider request IDs when available, fingerprint, timestamps, and safe next action. They must not include API keys or raw prompt/context.

## Stop conditions

Stop without a provider retry if any precondition changes, the explicit unresolved-billing risk acceptance is missing/malformed, count fails, FX is stale, reservation is denied, request identity drifts, usage is malformed, provider outcome is unknown, actual exceeds reservation, any domain/Planner mutation appears, or the kill switch cannot be confirmed OFF.
