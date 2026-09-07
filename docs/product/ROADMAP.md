# KPSS Koçu Product Roadmap

Status: Active

Last updated: 2026-09-07

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

- `NOW`: bounded Evre 5 Planner V2 post-pilot observation/closure; engineering and exact-profile production acceptance are complete.
- `NEXT MACRO PHASE`: Evre 6 AI Coach discovery/specification under a separately approved scope.
- `CONTINUING FOUNDATIONS`: natural `PLN-002` Extra Study acceptance and gated `PLN-003`/`PLN-004`/`MAT-001`/`PLN-005` maturity work.

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

Evre 5 engineering and production acceptance are complete. A short bounded observation/closure remains and does not authorize broader Planner V2 rollout. Evre 6 AI Coach is the next macro phase, beginning with a separately scoped discovery/specification decision rather than production authority.

## After M1

Evre 6 AI Coach is the next named macro phase after the bounded Evre 5 closure. Its concrete milestone, acceptance criteria, runtime authority, and release sequence are not yet approved; they must be evaluated against the [product vision](PRODUCT_VISION.md), M1 evidence, and [metrics](METRICS.md) before implementation or production activation.

The following must not start while M1 is incomplete unless required to resolve a P0 incident:

- unscoped AI Coach implementation or production activation before the Evre 6 brief and approval;
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
