# Current Sprint

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


Last updated: 2026-09-12

## Sprint 02 — Evre 6B & Continuing Planning Foundations

Sprint status: `IN_PROGRESS`

Sprint objective: Build and verify the versioned CoachContextV1 plus its disconnected, read-only provider orchestration foundation without changing live AI runtime behavior, production state/schema, or gates.

Evre 5 Planner V2 / Planner Truth is closed. Evre 6A is closed and 6B.1–6B.6B.1 are accepted locally. 6B.6B.2 local acceptance is green and checkpointed on the feature branch: the controlled local-DEV authority chain, authoritative local route/pricing envelope, TCMB FX boundary, server-only credential boundary, real gateway adapter, exact-count billing identity, dedicated controlled-DEV cost authorization, and full A→Z mocked smoke are verified. No real provider call has been executed. Official `/responses/input_tokens` billing remains unresolved; `TEMP_DEV_COST_POLICY_2026_09_12` permits only a separately approved, observed-cost, single controlled local-DEV smoke while production remains prohibited. Current Coach runtime, production schema/data, deployments, and Planner gates remain unchanged. PLN-002 remains `IN_PROGRESS` pending natural Extra Study acceptance evidence.

## NOW

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
- 6C–6G work before their documented entry conditions;
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
