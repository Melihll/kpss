# KPSS Koçu Product Roadmap

> **Active phase - REACTIVE_COACH_6C1_ROUTING_FOUNDATION_2026_09_13**
>
> - **6B Runtime Foundation is CLOSED** at checkpoint `50ded37fe0426a2489a3112c197fbafe9d876f9b`.
> - **6C Reactive Coach is ACTIVE.**
> - 6C.1 introduces a pure server-owned request-routing contract only; it does not expose a user-facing provider runtime.
> - Deterministic Today-fact, out-of-scope teaching/quiz, chat-Apply, and unsupported planning-change requests remain T0 with zero provider authority.
> - In-scope analysis requests map only to existing read-only capabilities: `today_analysis`, `week_analysis`, `subject_analysis`, `planner_explanation`, or `complex_status_analysis`.
> - The route decision stores no raw user text and grants no Planner/task/capacity mutation, confirmation, or Apply authority.
> - Legacy `ai-coach-plan-preview` / generic Apply is not a new 6C truth or mutation path.
> - Production provider remains prohibited. Confirm and Apply remain OFF.
> - 6D-6G remain NOT_STARTED.
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


Status: Active

Last updated: 2026-09-13

## Roadmap rules

The roadmap is outcome-led, not date-led. A milestone advances only when its exit criteria are met; code completion alone is insufficient. The detailed unit of work is the [product backlog](PRODUCT_BACKLOG.md), and the active commitment is the [current sprint](CURRENT_SPRINT.md).

Priority order is:

1. protect data, accounting, and user intent;
2. make the planning model correct and explainable;
3. verify behavior with real and simulated evidence;
4. expand product capability only after the foundation is trustworthy.

## Current milestone: M1 — Planning Correctness & Study Model

### Goal

Make Esra's daily and weekly study plans pedagogically sensible, predictable, explainable, and safe.

### Why now

The core product loop depends on trust in the plan. New capabilities amplify risk if planned study, extra study, substitution, carryover, learning stages, resource roles, duration, and task movement do not yet have reliable semantics.

### Scope

M1 comprises `PLN-001` through `PLN-010` plus `MAT-001`:

| Sequence | Capability | Backlog item |
| --- | --- | --- |
| 1 | Establish production planning reality | `PLN-001` |
| 2 | Define study accounting semantics | `PLN-002` |
| 3 | Define duration by study type and stage | `PLN-003` |
| 4 | Represent Learn → Practice → Review / Reinforcement | `PLN-004` |
| 5 | Represent exact material content and progress | `MAT-001` |
| 6 | Represent resource roles | `PLN-005` |
| 7 | Control daily fragmentation and switching | `PLN-006` |
| 8 | Explain planner decisions | `PLN-007` |
| 9 | Test real and synthetic scenarios | `PLN-008` |
| 10 | Compare safely in shadow mode | `PLN-009` |
| 11 | Roll out under controlled production gates | `PLN-010` |

The authoritative descriptions and acceptance criteria are in [PRODUCT_BACKLOG.md](PRODUCT_BACKLOG.md).

### Exit criteria

M1 is complete only when:

- planned study, extra study, substitution, and carryover have distinct, verified semantics;
- learning stage, exact material scope, and resource role participate in planning decisions;
- Today and Week plans can expose exact topic/resource-unit destinations when canonical material data is available;
- duration policy is stage-aware and does not assume every subject is 60 minutes;
- unnecessary fragments and subject switches are controlled;
- task placements, moves, duration changes, backlog, carryover, and the effect of extra study are explainable;
- real Esra scenarios and synthetic edge cases pass the simulation suite;
- shadow evaluation demonstrates safety and a justified improvement over current production behavior;
- production rollout completes seven days of normal Esra usage without planner-caused manual database repair;
- relevant automated tests, release verification, observability, and real-user verification satisfy the [Definition of Done](PRODUCT_BACKLOG.md#definition-of-done);
- all ten [planner product invariants](PRODUCT_VISION.md#planner-product-invariants) remain true.

## Now

[Current sprint](CURRENT_SPRINT.md)

- `CLOSED`: Evre 5 Planner V2 / Planner Truth engineering, exact-profile production acceptance, and final Week/Today real-user observation.
- `ACTIVE MACRO PHASE`: Evre 6 AI Coach.
- `CLOSED SUB-PHASE`: 6A Product / Authority / Cost Contract; final decisions accepted, docs only, runtime unchanged, production Confirm OFF, Apply OFF.
- `ACTIVE SUB-PHASE`: 6B CoachContextV1. 6B.1–6B.6B.1 are accepted locally; 6B.6B.2 local acceptance is green and checkpointed on the feature branch. The controlled local-DEV authority chain, gateway, exact count identity, dedicated cost authorization, authoritative local catalogs, TCMB boundary, reconciliation policy, and full A→Z mocked smoke are verified while current Coach remains disconnected. `TEMP_DEV_COST_POLICY_2026_09_12` permits only a separately approved single observed-cost local-DEV smoke despite unresolved `/responses/input_tokens` billing; production eligibility remains false.
- `CONTINUING FOUNDATIONS`: natural `PLN-002` Extra Study acceptance and gated `PLN-003`/`PLN-004`/`MAT-001`/`PLN-005` maturity work.

## Evre 6 — AI Coach

### Goal

Make KPSS Koçu a context-aware coach that explains product facts and Planner V2 decisions, performs evidence-backed durum analizi / ilerleme değerlendirmesi, guides the user's next decision, surfaces controlled in-app proactive insights, and sustains safe contextual conversation without becoming a teacher, planner, or mutation authority.

The normative product, truth, authority, scenario, proactive, cost, and phase contract is [AI Coach Evre 6 — Product, Authority & Cost Contract](specs/AI_COACH_EVRE_6_PRODUCT_AUTHORITY_COST_CONTRACT.md). The 6B.1 typed context and canonical source matrix are in [AI Coach — CoachContextV1 Contract and Canonical Source Map](specs/AI_COACH_CONTEXT_V1.md).

### Authority boundary

- AI interprets, explains, diagnoses, and guides; deterministic services own facts and calculations.
- AI cannot create, move, cancel, complete, or apply tasks; calculate canonical workload/capacity; invent materials; or mutate capacity, progress, stage, or plan state.
- New development does not use the legacy Coach planning Apply path. Every Coach-originated planning mutation must converge on the canonical Planner V2 `snapshot → proposal → preview → exact confirmation → freshness → transactional Apply` lifecycle.
- CoachContextV1 uses canonical Material Truth and the Canonical Workload Engine; legacy top-three material/workload projections are not Evre 6 truth sources.
- Real plan effects may be stated only from a deterministic Planner V2 scenario/preview. Facts carry freshness, confidence/authority, provenance, and unknown semantics where applicable.
- Until PLN-002 is sufficient, definitive ahead/behind claims fail closed to unknown without blocking other Coach capabilities.
- Proactive Coach is in-app only and may remain silent under attention, cooldown, dedupe, freshness, confidence, or cost limits.
- Model routing/pricing is centralized server-side; usage/cost telemetry begins in 6B and the 300 TL monthly hard governor is a 6G exit criterion.
- Raw long-term conversation history is not stored by default; 6F uses short recent context plus compact structured state/signals.
- Conversation text never carries Confirm or Apply authority.
- AI teacher/tutoring/quiz/mastery features are outside Evre 6.
- Production Confirm and Apply remain OFF. Evre 6A changes no runtime, migration, gate, or production state.

### Sub-phases

| Sequence | Sub-phase | Status | Outcome |
| --- | --- | --- | --- |
| 6A | Product / Authority / Cost Contract | `CLOSED` | Final product outcomes, truth sources, non-authority, 20 scenarios, proactive triggers, cost envelope, and phase gates accepted. |
| 6B | CoachContextV1 | `CLOSED` | Controlled DEV runtime acceptance completed; canonical context/evidence, routing/pricing, telemetry, provider safety, and real controlled-DEV acceptance are closed. Production provider remains prohibited. |
| 6C | Reactive Coach | `ACTIVE - 6C.1 REQUEST ROUTING FOUNDATION` | Build user-initiated Explain / Diagnose / Guide with deterministic T0 routing, canonical grounding, safe fallbacks, and no mutation authority. |
| 6D | Proactive Coach | `NOT_STARTED` | Add deterministic in-app triggers, cooldowns, dedupe, attention controls, and valid silence. |
| 6E | Planner V2 integration | `NOT_STARTED` | Route every Coach planning mutation to the one canonical Planner V2 lifecycle. |
| 6F | Conversation Intelligence | `NOT_STARTED` | Add short recent context plus compact structured state/signals without long-term raw history or authority transfer. |
| 6G | Eval / Cost / Production Acceptance | `NOT_STARTED` | Complete the 300 TL hard governor and prove safety, groundedness, UX, cost, observability, and limited production acceptance. |

Phase progression is gated by reviewed exit evidence. Listing a later phase does not authorize implementation, deployment, production access, or gate activation.

## Later within M1

After the audit and foundational semantics:

- model learning stages, exact material content/progress, and resource roles (`PLN-004`, `MAT-001`, `PLN-005`);
- improve daily plan shape and explanation (`PLN-006`, `PLN-007`);
- prove behavior through simulation and shadow comparison (`PLN-008`, `PLN-009`);
- perform a gated rollout (`PLN-010`).

Items may be refined or split as evidence appears, but their acceptance criteria cannot be silently weakened.

### 2026-08-25 MAT-001 Phase 4 checkpoint

Canonical Workload Engine engineering is complete. Exact video workload, accepted-W2 physical calibration, deterministic readiness/confidence, robust median pace, in-memory structural workload, read-only diagnostics, blocked unknowns, and the Planner V2 handoff are implemented and verified. Production data maturity remains in progress: the exact-profile capture pilot is active, accepted W2 evidence is currently zero, evidence-shadow and canonical planning remain OFF, and no physical coverage is claimed calibrated.

Planner V2 shadow work may proceed against the explicit handoff contract while unknown/low-confidence physical material stays blocked. Production activation remains governed by later shadow, simulation, and controlled-rollout gates.

### 2026-08-26 Planner V2 W5 checkpoint

The canonical deterministic proposal engine, stable staleness fingerprints, exact-capacity/whole-material policy, current-day and user-commitment protection, explicit blocked/unmet demand, and legacy comparison are implemented in shadow. The production evaluator is strictly read-only and does not use the existing diagnostic-persistence route. This advances planner simulation/shadow foundations (`PLN-008`/`PLN-009`) but does not complete their natural-evidence acceptance or authorize `PLN-010` rollout. Canonical planner runtime remains OFF; W6 Apply requires a separate design and release decision.

### 2026-08-26 Planner V2 W6 checkpoint

The deterministic Preview → Explain → exact Confirm → freshness → atomic Apply-candidate lifecycle is implemented and locally verified. The candidate persists canonical task identity, protects current-day/manual/locked/in-progress/completed work, scopes replacement to named future Planner V2 work, rechecks freshness/capacity transactionally, and is rollback-safe and idempotent. This advances `PLN-009` engineering but does not authorize `PLN-010`: the required migration is undeployed, the exact-profile capability defaults OFF, no Apply HTTP route exists, and production runtime remains unchanged.

### 2026-09-07 Planner V2 Evre 5 production acceptance checkpoint

Planner V2 Preview, exact Confirm, and one meaningful future-only Apply completed successfully for the approved exact profile. Lifecycle record `805be0cb-7d68-4b12-8df9-7b14f52a852e` created exactly one 22-minute canonical YouTube task on 2026-09-08, replaced zero tasks, preserved all past, Today, and protected manual future work, left study sessions unchanged, and advanced the weekly plan exactly once to generation 4. Active canonical duplicate count is exactly one. Confirm and Apply returned to OFF immediately after the pilot; preview remains exact-profile-only.

### 2026-09-08 Planner V2 Evre 5 final closure

The applied canonical task remained `ready` and appeared correctly on both production Week and Today before start, with the accepted 2026-09-08 date, 22-minute duration, linked Mathematics video material, and exact canonical identity. Database observation reconfirmed one active canonical task, zero task progress/sessions, and weekly plan `2662 / 2662 / 2662` generation 4. Other Today-task changes were explained by natural linked sessions; no future manual-task or observation-window mutation occurred. Confirm and Apply remained OFF.

Evre 5 Planner V2 / Planner Truth is `CLOSED`. This closure does not complete the separate seven-day `PLN-010` rollout criterion or authorize broader Planner V2 exposure. At the 2026-09-08 closure, Evre 6 AI Coach became the next macro phase; 6A is now closed under a docs-only final-contract scope, with 6B next and not started.

## Evre 6 sequencing and continuing M1 foundations

Evre 6 AI Coach has closed 6A after the completed Evre 5 closure. Its final milestone, acceptance criteria, authority boundary, cost envelope, and release sequence are recorded in the dedicated contract. 6B requires a separate implementation scope. Continuing M1 foundation items remain tracked and gated rather than being silently closed by this sequencing decision.

The following must not start unless its preceding Evre 6 phase gates and continuing foundation dependencies are met, except where required to resolve a P0 incident:

- AI Coach implementation or production activation beyond the active, approved sub-phase;
- gamification;
- multi-user onboarding;
- large visual redesigns;
- dashboards unrelated to planner debugging.

## Roadmap change control

A roadmap change must state:

- the new evidence or constraint;
- the affected milestone or ordering;
- any changed acceptance or exit criteria;
- the safety and metric impact;
- the decision owner and date.

Changes that alter an architectural boundary must also update [ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md). Changes that alter production risk must update the [release](RELEASE_PROCESS.md) or [incident](INCIDENT_PROCESS.md) process as appropriate.
