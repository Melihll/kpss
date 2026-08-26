# KPSS Koçu Product Roadmap

Status: Active

Last updated: 2026-08-26

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

[Sprint 01 — Planner Reality Audit](CURRENT_SPRINT.md)

- `NOW`: `PLN-001` — Esra 7-day Planning Reality Audit (`READY`, explicitly not started)
- `NEXT`: `PLN-002` — Study accounting semantics
- `NEXT`: `PLN-003` — Study Block Duration Policy

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

## After M1

No post-M1 milestone is committed or sequenced yet. Candidate directions may include deeper coaching, engagement mechanics, broader onboarding, and experience improvements, but they must be evaluated against the [product vision](PRODUCT_VISION.md), M1 evidence, and [metrics](METRICS.md) before entering `READY`.

The following must not start while M1 is incomplete unless required to resolve a P0 incident:

- new AI Coach features;
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
