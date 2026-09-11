# KPSS Koçu Product Roadmap

Status: Active

Last updated: 2026-09-10

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
- `ACTIVE SUB-PHASE`: 6B CoachContextV1. 6B.1, 6B.2, and the compact AI evidence projection/bounded detail work in 6B.3 are accepted; router/pricing and usage/cost telemetry remain.
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
| 6B | CoachContextV1 | `ACTIVE — 6B.3 ACCEPTED — LATER 6B REMAINS` | 6B.1 contract, 6B.2 adapters, and 6B.3 eight-scope evidence/six-kind bounded detail are accepted. Runtime wiring, router/pricing, and usage/cost telemetry remain. |
| 6C | Reactive Coach | `NOT_STARTED` | Deliver user-initiated Explain / Diagnose / Guide with grounding, fallbacks, and metering. |
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
