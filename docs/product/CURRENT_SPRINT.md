# Current Sprint

> **Authoritative current state - PLANNER_V2_COACH_INTEGRATION_6E_CLOSED_2026_09_19**
>
> - **Evre 6D Proactive Coach is CLOSED; `AIC-004` is DONE. Evre 6E Planner V2 Integration is CLOSED; `AIC-005` is DONE. Evre 6F Conversation Intelligence is `NOT_STARTED`; Evre 6G is `NOT_STARTED`.**
> - Accepted Evre 6E implementation baseline: `836e6443aa7072f674d0da452d952cfa072b7d7b`.
> - Evre 6E reuses canonical Planner evidence already carried through CoachContextV1 and adds a deterministic, fail-closed Planner explanation contract to the Reactive Coach path. No duplicate canonical Planner/workload/capacity truth engine was introduced.
> - The web exposes an explicit user-triggered Planner Preview CTA and reuses the existing canonical Planner V2 Preview flow. Coach message generation does not automatically run Preview and natural-language agreement is not Planner confirmation.
> - Acceptance is GREEN: focused 6E + 6D regression `129/129`; full non-integration `1362/1362` across `176/176` files; workspace typecheck PASS; AI Coach safety PASS; AI Coach plan-preview safety PASS; canonical Planner V2 read-only safety PASS.
> - New Coach-side automatic Preview, proposal creation, Confirm, Apply, task mutation, capacity mutation, and Planner mutation authority are all `0`.
> - This checkpoint adds `0` migrations and performs `0` production deploy/mutation/migration actions. Planner Confirm remains OFF. Planner Apply remains OFF.
> - **NEXT EXACT STEP:** Begin Evre 6F / Conversation Intelligence as one deliberately minimal V1 slice: bounded recent conversation context plus compact structured state/signals only. Do not build a generic long-term memory platform.
> - This block supersedes every older current-state, active-status, remaining-work, and next-step statement below. Older checkpoint sections remain historical evidence only.

> **Authoritative current state — PROACTIVE_COACH_6D_CLOSED_2026_09_19**
>
> - **Evre 6D Proactive Coach is CLOSED; `AIC-004` is DONE. Evre 6E Planner V2 Integration is `NOT_STARTED`.**
> - Accepted implementation baseline: `421de04e2c52c0bf7b0f296a679dfb9108db0030`.
> - Accepted implementation includes the deterministic selector, versioned materiality/actionability policy, canonical hysteresis, active-study protection, persisted presentation/control/clear state, server-owned runtime assembly, authenticated `POST /ai-coach/proactive`, deterministic cards, post-surface idempotent presentation recording, dismiss/snooze/disable-category controls, and the Today web surface.
> - `EVRE_6D_SHADOW_ACCEPTANCE = PASS`: `39/39` mandatory scenarios; launch positives `4/4`; healthy/no-intervention silence `4/4`; unresolved-materiality silence `4/4`; authority/freshness silence `6/6`; active-study protection PASS; user controls `3/3`; cooldown/attention `4/4`; hysteresis `6/6`; false positives `0`; wrong signal/evidence `0`.
> - Verification: focused proactive `140/140`; final matrix harness `32/32`; full non-integration `1341/1341` across `173/173` files; loopback local persistence `8/8`; workspace typecheck, AI Coach safety, and Planner safety PASS.
> - Unauthorized DB mutations, Planner/task/capacity mutations, provider calls, and LLM calls are all `0`. This closure checkpoint adds `0` migrations and performs `0` production deploy/mutation/migration actions. Planner Confirm and Apply remain OFF.
> - The four unresolved signal classes remain fail-closed silence; closing 6D does not authorize new signals, provider activation, Planner proposals, deployment, migration, Confirm, or Apply.
> - Evre 6E remains `NOT_STARTED`; it may begin only as a separate checkpoint preserving proposal-before-mutation, explicit confirmation, stale proposal rejection, Today protection, Confirm OFF, and Apply OFF until separately authorized.
> - This block supersedes every older current-state, active-status, remaining-work, and next-step statement below. Older checkpoint sections remain historical evidence only.


> **Active phase - PROACTIVE_COACH_6D_PERSISTENCE_CHECKPOINT_2026_09_19**
>
> - **6B Runtime Foundation and 6C Reactive Coach are CLOSED; AIC-003 is DONE.**
> - **6D Proactive Coach / AIC-004 remains ACTIVE / IN_PROGRESS and is not complete.**
> - Deterministic selection, versioned materiality/actionability, server-owned runtime-state contract, canonical hysteresis, and exact user/profile active-session authority are accepted.
> - Dedicated proactive-state persistence is accepted in local DEV at `7302b23f7686ef6703f25ae8e54fb3568c8d9749`. Migration `20260919120000_ai_coach_proactive_state_v1.sql` defines immutable server-recorded presentation history, profile-scoped user controls, and immutable server-owned clear observations.
> - Presentation and clear-observation writes are server-only. Dismiss, snooze, and category-disable controls use narrow authenticated ownership-bound RPCs. RLS, exact user/profile isolation, validation, idempotency, and immutable audit semantics are locally verified.
> - The read-only proactive runtime adapter loads presentation/control/clear state with exact user/profile filters, bounded reads, returned-row ownership validation, and fail-closed unavailable/ambiguous behavior. Active-study truth remains canonical from `study_sessions`.
> - Launch-enabled V1 signals remain `today_completed_as_planned`, `repeated_task_miss`, `recent_recovery`, and `planner_warning_present`. `today_partial_completion`, `subject_recent_completion_drop`, `schedule_capacity_change`, and `material_progress_stalled` remain deterministic fail-closed silence.
> - Persistence re-acceptance: runtime adapter unit `4/4`; focused persistence integration `8/8`. Final acceptance: full Vitest `1443/1443` across `185/185` files; full loopback integration `166/166` across `18/18` files; PostgreSQL lint PASS; workspace typecheck PASS; AI Coach plan-preview safety PASS; canonical Planner V2 read-only safety PASS.
> - Remaining 6D work: server/app-api runtime assembly and wiring; deterministic proactive card/templates plus web dismiss/snooze/disable controls; then shadow precision/actionability/silence acceptance.
> - Persistence migration is local DEV only. Production migration/deploy/mutation = `0`; provider/LLM activation = `0`; automatic Planner proposal/Preview/Confirm/Apply = `0`. Planner Confirm and Apply remain OFF.
> - **NEXT EXACT STEP:** wire the accepted proactive persistence into the server-owned AIC-004 runtime assembly without production activation. Rendering/web controls follow only after that boundary is GREEN.
> - This block supersedes older current-state, status, remaining-work, persistence-required, and next-step wording below it.


> **Active phase - PROACTIVE_COACH_6D_RUNTIME_HYSTERESIS_CHECKPOINT_2026_09_19**
>
> - **6B Runtime Foundation and 6C Reactive Coach are CLOSED; AIC-003 is DONE.**
> - **6D Proactive Coach / AIC-004 is ACTIVE / IN_PROGRESS and is not complete.**
> - Step 2A deterministic selector is accepted at `3481271b26fd0241d8ecd4a310e08ea85e5083c6`; its local-auth regression checkpoint is `888040011dc773a5a143b4d62d054623957495c3`.
> - Step 2B.3 versioned materiality/actionability policy is accepted at `c3d8fbe60a8dae4474a5d67ec547010b7fcbbcb2`; Step 2B.4 selector gating is accepted at `a0db5d8d0d5d1a80026e2f6906ae70c3f868470c`.
> - Runtime state, hysteresis, selector authority, and read-only active-session adapter checkpoints are `afff40f`, `2ba293f`, `df9da9f`, and `02d0fe6`.
> - V1 launch-enabled signals are `today_completed_as_planned`, `repeated_task_miss`, `recent_recovery`, and `planner_warning_present`. `today_partial_completion`, `subject_recent_completion_drop`, `schedule_capacity_change`, and `material_progress_stalled` remain deterministic fail-closed silence because their materiality/unit/source thresholds are unresolved.
> - Same-date completion and same recovery event do not re-fire. Repeated miss and Planner warning require canonical clear observations before re-arm; cooldown is never a substitute.
> - Active-study truth is read from `study_sessions` by exact authenticated user/profile under RLS. Missing/ambiguous authority, presentation history, user controls, or clear observations fail closed to silence.
> - Existing schema is insufficient for presentation/control/clear persistence. No migration was created; a separate reviewed local-only migration checkpoint is recommended.
> - Focused tests pass `78/78`; full non-integration passes `1273/1273` across `166/166` files; full loopback integration passes `158/158` across `17/17` files; workspace typecheck and AI Coach/Planner safety checks pass.
> - Production deployment/mutation, migrations/resets, provider/LLM calls, and automatic Planner proposal/Preview/Confirm/Apply calls for this checkpoint are all `0`. Planner Confirm and Apply remain OFF.
> - This block supersedes older current-state wording below it.




> **Controlled DEV acceptance CLOSED - REAL_SMOKE_ATTEMPT_5_GREEN_2026_09_13**
>
> - Attempt 5 completed the complete real controlled-DEV provider path successfully.
> - Real TCMB calls: `1`.
> - OpenAI input-token count: `1`, HTTP `200`, exact input tokens `4882`.
> - Count request id: `req_0ac3ad3a0b2f46cbbb2e2017bac58b47`.
> - OpenAI generation: `1`, HTTP `200`.
> - Generation request id: `req_1f2dbdd2d2e74b3c98e29eb1480db51c`.
> - Provider order: `count -> generation`.
> - Accounting order: `reserve -> markStarted -> settle`.
> - Accounting counters: reserve `1`, markStarted `1`, settle `1`, release `0`, reconcile `0`.
> - Provider usage: input `4882`, cached input `0`, output `153`, total `5035`.
> - Observed actualTryCost: `0.211052`.
> - Grounded response validation passed with `5` accepted source fact paths.
> - Response capability: `today_analysis`.
> - `noMutationPerformed = true`.
> - Production access, DB calls, Planner calls, task mutations, deploys, migrations, retries, and fallbacks: all `0`.
> - Secret cleanup, temporary harness cleanup, HEAD preservation, and clean-worktree post-check all passed.
> - Attempt 5 authorization is consumed. No further controlled-DEV smoke attempt is required for this acceptance gate.
> - **6B.6B.2 Controlled DEV Runtime Acceptance: CLOSED.**
> - **6B Runtime Foundation: CLOSED.**
> - Next product phase: **6C Reactive Coach**.
> - Production provider remains prohibited until separately authorized.
> - Confirm and Apply remain OFF.
> - This block supersedes older controlled-DEV current-state notes below it.


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


Last updated: 2026-09-19

## Sprint 02 — Evre 6B & Continuing Planning Foundations

Sprint status: `EVRE_6E_CLOSED — 6F_NOT_STARTED`

Sprint objective: Record the completed AIC-005 / Evre 6E Planner V2 Integration acceptance and begin only the deliberately minimal Evre 6F Conversation Intelligence V1 slice next.

Evre 5 Planner V2 / Planner Truth is closed. Evre 6A is closed and 6B.1–6B.6B.1 are accepted locally. 6B.6B.2 local acceptance is green and checkpointed on the feature branch: the controlled local-DEV authority chain, authoritative local route/pricing envelope, TCMB FX boundary, server-only credential boundary, real gateway adapter, exact-count billing identity, dedicated controlled-DEV cost authorization, and full A→Z mocked smoke are verified. No real provider call has been executed. Official `/responses/input_tokens` billing remains unresolved; `TEMP_DEV_COST_POLICY_2026_09_12` permits only a separately approved, observed-cost, single controlled local-DEV smoke while production remains prohibited. Current Coach runtime, production schema/data, deployments, and Planner gates remain unchanged. PLN-002 remains `IN_PROGRESS` pending natural Extra Study acceptance evidence.

## NOW

### `AIC-005` / Evre 6E - Planner V2 Integration

- Priority: `P0`
- Status: `DONE / CLOSED - FINAL ACCEPTANCE PASS`
- Accepted implementation baseline: `836e6443aa7072f674d0da452d952cfa072b7d7b`.
- Canonical Planner evidence is interpreted through the existing Coach context rather than recomputed by a competing planner.
- Reactive Coach can explain Planner state and expose an explicit Preview CTA through the existing Planner V2 Preview flow.
- Automatic Preview `0`; Coach proposal creation `0`; Confirm `0`; Apply `0`; Planner/task/capacity mutation authority `0`.
- Focused acceptance `129/129`; full non-integration `1362/1362` across `176/176` files; typecheck and AI Coach/Planner safety PASS.
- Production actions and migrations `0`; Confirm and Apply remain OFF.
- Next safe work: `AIC-006 / Evre 6F` minimal bounded conversation intelligence.

### `AIC-004` / Evre 6D — Proactive Coach

- Priority: `P1`
- Status: `DONE / CLOSED — FINAL SHADOW ACCEPTANCE PASS`
- Step 2A selector checkpoints: `3481271b26fd0241d8ecd4a310e08ea85e5083c6` and `888040011dc773a5a143b4d62d054623957495c3`.
- Step 2B checkpoints: materiality/actionability policy `c3d8fbe60a8dae4474a5d67ec547010b7fcbbcb2`; selector gate `a0db5d8d0d5d1a80026e2f6906ae70c3f868470c`.
- Runtime/hysteresis checkpoints: state contract `afff40f`; clear-condition policy `2ba293f`; selector enforcement `df9da9f`; active-session adapter `02d0fe6`.
- Launch-enabled V1: completed-as-planned, repeated task miss, recent recovery, and persisted Planner warning. Partial completion, completion drop, capacity change, and material stall remain fail-closed until source/unit/threshold semantics are approved.
- The selector enforces materiality before active-work and user-control/attention gates. It remains deterministic, in-app-only, prose-free, provider-free, mutation-free, and Planner-authority-free.
- Hysteresis semantics are explicit: date/event condition keys prevent duplicate completion/recovery firing; repeated miss requires same-task clear plus two later misses; Planner warning requires a zero-warning clear then a later warning. Cooldown alone never re-arms.
- The read-only active-session authority is `study_sessions` under exact authenticated user/profile filters and RLS. Unavailable or ambiguous reads suppress proactive presentation.
- Dedicated persisted presentation/control/clear state, server-owned runtime assembly, authenticated `POST /ai-coach/proactive`, deterministic cards, post-surface idempotent presentation recording, dismiss/snooze/disable controls, and the Today surface are accepted.
- Final closure baseline: `421de04e2c52c0bf7b0f296a679dfb9108db0030`; shadow matrix `39/39`, focused proactive `140/140`, final harness `32/32`, full non-integration `1341/1341` across `173/173` files, and loopback persistence `8/8` PASS.
- AIC-004 is closed with false positives `0`, wrong signal/evidence `0`, unauthorized mutations `0`, Planner/task/capacity mutations `0`, provider/LLM calls `0`, and production actions `0`. Confirm and Apply remain OFF.
- Evre 6E is CLOSED at accepted implementation baseline `836e6443aa7072f674d0da452d952cfa072b7d7b`. Next safe work is the minimal Evre 6F bounded-conversation V1 slice.

### `AIC-003` / Evre 6C — Reactive Coach

- Priority: `P1`
- Status: `DONE — 6C FINAL REACTIVE ACCEPTANCE CLOSED`
- 6C.1 request-routing checkpoint: `de972d6fd4ece0e6b1e6226232f28dcd3e7272dc`.
- 6C.2 executor checkpoint: `9a5bc840d8308a3426267ba7eb3c1b12b9b5a10b`.
- 6C.3A authenticated server/API boundary checkpoint: `c78becfe5137b360437ef33af4932ef7733ba317`.
- 6C.3B controlled DEV provider-read-only runtime checkpoint: `f86824ca307d3f0bc8c6ce821dcd06f7f8ec0f63`.
- Final 6C canonical acceptance checkpoint: `d6ac4f5370cffbbd6667b45d3790cd5f4971dea2`.
- Deterministic T0 requests make zero provider calls; read-only provider routes receive only server-selected capabilities.
- Canonical subject resolution, clarification, `COST_LIMITED`, `UNKNOWN_OR_BLOCKED`, and provider no-mutation guards are implemented.
- Final 6C acceptance evidence: canonical scenarios `20/20`; focused routing/executor `29/29`; complete AI Coach regression `205/205` across `20/20` files; full non-integration `1209/1209` across `161/161` files; workspace typecheck and mutation-authority audit PASS.
- Reactive Coach final acceptance is checkpointed and undeployed. Production provider activation, Planner/task/capacity mutation, Confirm, Apply, deploy, migration, and main push remain `0`.
- Current product slice: `AIC-005 / Evre 6E Planner V2 Integration` is `DONE / CLOSED` at accepted implementation baseline `836e6443aa7072f674d0da452d952cfa072b7d7b`. `AIC-006 / Evre 6F` is `NOT_STARTED`; production provider activation and Planner Confirm/Apply remain separately gated and OFF.


### `AIC-002` / Evre 6B — CoachContextV1

- Priority: `P0`
- Status: `IN_PROGRESS — 6B.6B.2 LOCAL_ACCEPTANCE_GREEN — SECOND_REAL_SMOKE_NOT_AUTHORIZED — REAL_SMOKE_ATTEMPT_1_COUNT_HTTP_400 — PRODUCTION ACTIVATION BLOCKED`
- Scope: disconnected read-only orchestration plus fail-closed DEV-only activation/secret/gateway, exact request and usage identity, deterministic TCMB acquisition, and reconciliation/smoke policy; no live AI runtime integration, real provider call, deploy, gate change, or production access.
- Authority state: read-only; Planner V2 Confirm OFF; Planner V2 Apply OFF.

Current deliverable/evidence:

- [AI Coach — CoachContextV1 Contract and Canonical Source Map](specs/AI_COACH_CONTEXT_V1.md);
- 6B.1 contract/source-map checkpoint `acd16ffb2263b5285b14bd7329ff4357d7971e00`;
- local canonical profile/task/session/material/workload/capacity/persisted-Planner adapters;
- explicit `canonical_selector_unavailable` and `pln002_completeness_unresolved` behavior;
- Planner protected/post-commitment capacity remains field-level unknown without a current authoritative reader;
- 30/30 focused tests; 42-task production-shaped internal canonical context = 52,716 bytes;
- real local Supabase integration test `1/1` PASS with total mutable-row delta `0` and Planner lifecycle-row delta `0`;
- 6B.3 adds an unconnected `CoachEvidenceViewV1` plus six-kind bounded detail resolver; all eight scopes are 56.9–97.8% smaller than the 52,716-byte internal context without deleting canonical truth;
- 6B.3 local Supabase acceptance is zero-mutation and profile-isolated; the compact evidence/detail contract is locally accepted.
- 6B.4 locally accepts an unconnected deterministic `CoachSignalCandidateV1` registry and source-owned freshness policy; it emits no prose, makes no model call, and creates no planning authority;
- high-volume signal set = 8 candidates / 13,598 bytes; `proactive_candidate` grows by 1,212 bytes to 22,501 bytes and remains 57.3% below the internal context.
- 6B.5 adds the unconnected central route, explicit fixture-only pricing/FX, immutable provider-attempt event, deterministic monthly accounting/preflight, and append-only local ledger contracts in [AI Coach — Central Router, Pricing, FX and Usage Ledger V1](specs/AI_COACH_ROUTER_COST_TELEMETRY_V1.md);
- the ledger migration is authored and tested only against loopback local Supabase; production remains untouched. A production-shaped official pricing candidate now exists, but unresolved billing treatment and missing live FX/operations keep provider eligibility false.
- 6B.6A adds the unconnected [Provider Runtime and Atomic Budget Safety V1](specs/AI_COACH_PROVIDER_RUNTIME_BUDGET_V1.md): production configuration resolves unavailable unless approved route/pricing/FX and complete billable-token-bound facts are supplied; atomic service-owned worst-case reservation serializes the user-wide Europe/Istanbul month ceiling; provider observation preserves missing usage as unknown; ledger and settlement share one transaction; and uncertain or upper-bound-violating outcomes require reconciliation.
- 6B.6A final local evidence is clean reset/lint PASS, focused provider/economics/config/gateway `46/46`, complete integration/RLS `156/156` including reservation `16/16`, complete non-integration `1,031/1,031`, and workspace typecheck PASS. Provider/network/runtime wiring and production mutation remain `0`.
- 6B.6B.1 adds the disconnected [Read-Only Provider Orchestrator V1](specs/AI_COACH_READ_ONLY_PROVIDER_ORCHESTRATOR_V1.md): an immutable server-owned text/JSON request, deterministic SHA-256 complete-request fingerprint, exact-count identity binding, conservative global-standard billing bound, atomic DB reservation, injected mocked provider attempt, defensive usage settlement, and source-path-grounded result.
- The 6B.6B.1 provider audit pinned documented GPT-5.4 snapshots/prices and blocked regional and >272K long-context paths. The 6B.6B.2 official audit now classifies the selected GPT-5.4 cache-write treatment as no-additional-charge while leaving `/responses/input_tokens` billing unresolved. TCMB indicative-selling provenance retains explicit non-binding and 96-hour fail-closed semantics.
- 6B.6B.1 acceptance: focused context/evidence/signal/economics/provider/orchestrator `139/139`, full loopback integration/RLS `157/157`, full non-integration `1,096/1,096`, workspace typecheck, local DB lint, all relevant safety scripts, docs consistency, bundle byte determinism, and diff check PASS. Real local orchestrator domain mutation delta `0`, Planner lifecycle/proposal delta `0`, and real provider network calls `0`.
- 6B.6B.2 pre-smoke foundation is defined in [Controlled DEV Runtime Pre-Smoke Foundation V1](specs/AI_COACH_CONTROLLED_DEV_RUNTIME_V1.md) and [One Controlled DEV Smoke and Reconciliation Runbook](specs/AI_COACH_DEV_SMOKE_RUNBOOK.md). It adds a central default-OFF/prod-prohibited server switch, closure-held server credential, fixed-origin injected-fetch gateway with zero automatic retries, strict usage and provider/request identity parsing, official-source TCMB acquisition with source-owned freshness, and critical reconciliation policy.
- The official audit still keeps `/responses/input_tokens` billing unresolved and does not independently authorize a provider call. `TEMP_DEV_COST_POLICY_2026_09_12` explicitly accepts that unresolved count-endpoint billing risk for exactly one separately approved local-DEV smoke while preserving token/cost/TRY telemetry, reservation, reconciliation, one-attempt/no-fallback limits, and production prohibition. The full mocked A→Z path is green; no live smoke has been performed.

### `AIC-001` / Evre 6A — Product / Authority / Cost Contract

- Priority: `P0`
- Status: `DONE`
- Phase: `EVRE_6A_CLOSED — FINAL_CONTRACT_ACCEPTED — DOCS_ONLY`
- Runtime state: unchanged; no implementation, deployment, migration, gate change, or production access.
- Authority state: Planner V2 Confirm OFF; Planner V2 Apply OFF.

Current deliverable:

- [AI Coach Evre 6 — Product, Authority & Cost Contract](specs/AI_COACH_EVRE_6_PRODUCT_AUTHORITY_COST_CONTRACT.md);
- Explain, Diagnose, Guide, Proactive Insight, proposal interpretation, daily/weekly analysis, and contextual-conversation capability boundaries;
- explicit deterministic-versus-LLM responsibility and non-authority invariants;
- 20 Turkish product scenarios with truth sources, allowed/forbidden behavior, proposal eligibility, and expected UX;
- deterministic proactive categories, eligibility, freshness, cooldown, dedupe, and attention-budget rules;
- normal-user `≤ 150–200 TL/month`, heavy-user `≤ 250 TL/month`, and hard `300 TL/month` model-cost contract;
- sub-phases 6A–6G with entry, exit, and authority states;
- ten final architecture decisions and explicit later-phase implementation dependencies.

The final review decisions are incorporated. All 20 scenarios were revalidated. New development cannot use the legacy Coach planning Apply path; CoachContext uses canonical Material Truth and Canonical Workload Engine; incomplete PLN-002 ahead/behind claims fail closed per field; telemetry begins in 6B and the hard governor completes in 6G; raw long-term conversation history is not stored by default; proactive behavior is in-app only and may stay silent; real plan effects require Planner V2 scenario/preview facts; router/pricing are centralized server-side; user-facing analysis avoids mastery/medical diagnosis; and Coach facts carry freshness/confidence/provenance/unknown semantics. AI teacher/tutoring/quiz/mastery features remain outside Evre 6.

### `PLN-002` — Separate Planned Study / Extra Study / Substitution / Carryover semantics

- Priority: `P0`
- Status: `IN_PROGRESS`
- Phase: production released; planned-study real-user acceptance PASS; extra-study real-user acceptance pending
- Current state: schema/model, planner semantics, API/UI behavior, auditability, and invariant coverage are released; planned-study natural-use acceptance passed on 2026-08-23, while extra-study natural-use acceptance remains pending

Current deliverable:

- [PLN-002 — Study Intent Semantics](specs/PLN-002_STUDY_INTENT_SEMANTICS.md)
- exact definitions for Planned Study, Extra Study, Substitution, and Carryover;
- separate planned-capacity, actual-time, and planned-credit semantics;
- recommended normalized allocation ledger and typed transitions;
- migration/backfill, UI, planner, API, audit, and invariant requirements.

The implementation preserves the core [PLN-001](audits/PLN-001_ESRA_7_DAY_PLANNING_AUDIT.md) rule: Extra Study cannot silently modify unrelated planned work. Local evidence is summarized in the [PLN-002 Implementation Decision](decisions/PLN-002_IMPLEMENTATION_DECISION.md). `IN_PROGRESS` remains intentional because planned-study acceptance has passed but extra-study authenticated real-user acceptance has not yet closed.

The full item definition is in [PRODUCT_BACKLOG.md](PRODUCT_BACKLOG.md#pln-002--separate-planned-study--extra-study--substitution--carryover-semantics).

### `PLN-003` — Study Block Duration Policy

- Priority: `P1`
- Status: `IN_PROGRESS`
- Phase: duration policy locally implemented and verified; production-authoritative stage-based activation pending
- Current state: `pln-003-v1` centralizes deterministic duration classes, preserves genuine remainders and user overrides, normalizes advisory AI recommendations, and keeps planner capacity separate from voluntary Extra Study.
- Production activation is intentionally limited: normal P48 inputs do not yet carry canonical `learning_stage` / `blockClass` metadata. PLN-003 must not infer learning stage from `work_mode` or resource role.

Verification evidence: targeted PLN-003 tests pass, full unit regression is `632/632`, integration/RLS is `101/101`, typecheck passes, the V1 planning bundle is regenerated, and bundle safety/reproducibility checks pass. `roadmap.test.ts` passes `11/11`, including four PLN-003 duration-aware schedule scenarios.

The full item definition is in [PRODUCT_BACKLOG.md](PRODUCT_BACKLOG.md#pln-003--study-block-duration-policy).

### `PLN-004` — Learning Stage Model

- Priority: `P1`
- Status: `IN_PROGRESS`
- Phase: `IMPLEMENTED_LOCAL_VERIFIED`; production-authoritative activation gated
- Verification: PLN-004 targeted domain tests `22/22` PASS; non-integration repository regression `654/654` across `95/95` files PASS; domain typecheck PASS.
- Scope implemented locally: deterministic stage state/eligibility, prerequisite rules, prior evidence, skip safety, remediation, material-progress separation, canonical material evidence adapter, and subject-agnostic material-evidence-to-stage flow.
- Integration/RLS suites were not rerun in this shell because local Supabase environment variables were unavailable; this checkpoint introduces no database migration or production mutation path.

The next active product-foundation task is `MAT-001`, which supplies the exact page/test/video material model required before stage-aware planner activation.

### Planner V2 canonical shadow (W5)

- Phase: engineering shadow implemented; production mutation/runtime activation prohibited.
- Scope: deterministic canonical proposal, exact capacity, whole-material boundaries, blocked/unmet demand, current-day/user-commitment protection, stable staleness fingerprints, and read-only legacy comparison.
- Production evaluation uses a separate strictly read-only runner; it cannot write diagnostic rows or call Apply.
- W6 proposal Apply, PLN-003/004/005 production authority, and PLN-010 rollout remain separately gated.

### Planner V2 proposal lifecycle reliability (Evre 5)

- Phase: `CLOSED`. Engineering, exact-profile production acceptance, and final Week/Today real-user observation are complete. Production Confirm and Apply are OFF.
- Each explicit preview now receives a distinct lifecycle attempt record and idempotency key while deterministic proposal/snapshot fingerprints remain unchanged. Terminal attempts are never resurrected.
- Local rebuilds reproduce the existing hosted `service_role` CRUD baseline for `weekly_plans`, `tasks`, `task_resource_units`, and `task_progress`; proposal-table authority remains unchanged.
- A confirmed proposal that expires before Apply atomically clears `confirmed_at` as it enters `expired`, preserving the strict confirmation-state constraint.
- Verification: focused lifecycle/security/HTTP `26/26`, Planner V2 lifecycle DB integration `16/16`, all integration `132/132`, full non-integration `949/949`, workspace typecheck, Planner V2 safety checks, local PostgreSQL lint, and diff check PASS.
- Production acceptance: preview PASS, exact confirmation PASS, and one meaningful atomic Apply PASS for lifecycle record `805be0cb-7d68-4b12-8df9-7b14f52a852e`. The transaction created one 22-minute canonical YouTube task on 2026-09-08, replaced zero tasks, advanced the weekly plan from `2662 / 2662 / 2640` generation 3 to `2662 / 2662 / 2662` generation 4, and preserved past, Today, and 41 protected manual future tasks.
- Duplicate protection PASS: the exact canonical workload has one active task after Apply, not more than one. Study sessions were unchanged. Confirm and Apply were disabled immediately after the pilot and remain OFF; preview remains exact-profile-only.
- Final real-user observation PASS on 2026-09-08: the 22-minute canonical task appeared correctly on both Week and Today before start; database state remained `ready` with zero task progress/sessions, exact canonical linkage, duplicate count one, and plan `2662 / 2662 / 2662` generation 4. Natural work on three other Today tasks was fully explained by linked sessions; no future manual-task or observation-caused mutation occurred.
- Final classification: `EVRE_5_PLANNER_V2_PLANNER_TRUTH_CLOSED`.

## NEXT

1. Keep production provider eligibility false. For local DEV only, retain `TEMP_DEV_COST_POLICY_2026_09_12`: unresolved count-endpoint billing may be accepted only by the server-owned exact-scope activation for one separately approved observed-cost smoke
2. Checkpoint the green 6B.6B.2 local acceptance, then authorize exactly one bounded real DEV smoke only as a separate explicit task after real TCMB, server-secret, identity/allowlist, and operator checklist preflight are green
3. Close `PLN-002` natural Extra Study authenticated real-user acceptance when real usage provides evidence
4. Keep `PLN-004` production-authoritative activation gated while MAT-001/PLN-005 inputs mature
5. Re-evaluate PLN-003 production-authoritative duration activation only after canonical learning-stage, material, and resource-role inputs exist

`NEXT` indicates intended sequence, not permission to deploy. Stage-dependent duration activation remains separately gated.
## Do not start

- live/current Coach product runtime wiring or a real provider call without separate explicit authorization; 6B.6B.2 local acceptance permits only the controlled DEV policy/preflight path and grants no production or user-facing runtime activation;
- 6D-6G work before their documented entry conditions;
- AI teacher, tutoring, quiz, mock, grading, or mastery features in Evre 6;
- any Coach task/capacity/material/progress/stage mutation or non-canonical planning Apply path;
- gamification;
- multi-user onboarding;
- large visual redesigns;
- new dashboards unrelated to planner debugging;
- production-authoritative PLN-003 stage-based duration activation before canonical learning-stage/material/resource-role gates and a separate release decision.

## Sprint guardrails

- Keep Planned Study, Extra Study, Substitution, Carryover, modality, and recording channel semantically distinct.
- Preserve the approved-plan denominator when Extra Study occurs.
- Require confirmation and stale-state protection for substitution.
- Preserve task identity/history for carryover and distinguish it from backlog.
- Represent historical ambiguity explicitly rather than inventing intent.
- Keep unapproved stage-dependent PLN-003 planner behavior out of production until canonical inputs exist and a separately approved release phase is completed.
- Keep AI provider output untrusted and advisory; deterministic sources own all quantities, eligibility, lifecycle, and mutations.
- Use no LLM for deterministic calculations or unambiguous scope routing.
- Start metering every Evre 6 model call in 6B; complete automatic pre-call reservation and the `300 TL/month` per-user hard governor by the 6G exit.
- Keep model routing, provider pricing, and versioned TRY estimation centralized server-side.
- Use canonical Material Truth and Canonical Workload Engine in CoachContext; never fall back to legacy top-three material/workload projections.
- Fail definitive ahead/behind claims closed to unknown when PLN-002 semantics are insufficient, while keeping independently known Coach facts available.
- Keep proactive Coach in-app only with attention budget, category cooldown, dedupe, and valid silence.
- Do not store raw long-term conversation history by default; use short recent context plus compact structured state/signals.
- State real plan effects only from a fresh deterministic Planner V2 scenario/preview.
- Route every future Coach planning Apply through the canonical Planner V2 lifecycle; conversation text never confirms or applies.
- Keep Planner V2 Confirm and Apply OFF after 6A closure unless separately approved.
- Stop and follow the [incident process](INCIDENT_PROCESS.md) if the audit exposes active data loss, accounting corruption, unsafe mutation, or another P0 condition.

## Previous sprint closure

Sprint 01 closed on 2026-08-22 because `PLN-001` meets every acceptance criterion and its evidence is reviewable:

1. `PLN-001` is `DONE` under the [Definition of Done](PRODUCT_BACKLOG.md#definition-of-done); implementation, release, and rollout evidence are not applicable to a read-only investigation.
2. Confirmed behavior, unexplained behavior, risks, hypotheses, and decisions are in the audit artifact.
3. `PLN-002` through `PLN-006` acceptance criteria were refined from evidence without weakening their invariants.
4. [METRICS.md](METRICS.md) already defines the provisional formulas used; the audit did not justify a roadmap or architecture-decision change.
5. `PLN-002` was selected as the next task and entered `IN_PROGRESS` in design/specification.
