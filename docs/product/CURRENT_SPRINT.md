# Current Sprint

Last updated: 2026-08-22

## Sprint 02 — Study Intent Semantics

Sprint status: `IN_PROGRESS`

Sprint objective: Make user study intent explicit and prevent extra study from silently changing unrelated planned work.

Sprint 01 closed on 2026-08-22 with `PLN-001` complete. Sprint 02 is specification-first and does not authorize implementation, schema changes, production mutation, deployment, or planner behavior changes.

## NOW

### `PLN-002` — Separate Planned Study / Extra Study / Substitution / Carryover semantics

- Priority: `P0`
- Status: `IN_PROGRESS`
- Phase: design/specification
- Current state: semantic and data-model design documented; implementation has not started

Current deliverable:

- [PLN-002 — Study Intent Semantics](specs/PLN-002_STUDY_INTENT_SEMANTICS.md)
- exact definitions for Planned Study, Extra Study, Substitution, and Carryover;
- separate planned-capacity, actual-time, and planned-credit semantics;
- recommended normalized allocation ledger and typed transitions;
- migration/backfill, UI, planner, API, audit, and invariant requirements.

The specification preserves the core [PLN-001](audits/PLN-001_ESRA_7_DAY_PLANNING_AUDIT.md) rule: Extra Study cannot silently modify unrelated planned work. `IN_PROGRESS` is intentional because no implementation, tests, migration, or rollout evidence exists yet.

The full item definition is in [PRODUCT_BACKLOG.md](PRODUCT_BACKLOG.md#pln-002--separate-planned-study--extra-study--substitution--carryover-semantics).

## NEXT

1. `PLN-003` — Study Block Duration Policy
2. `PLN-004` — Learning Stage Model

`NEXT` indicates intended sequence, not permission to start. Both items remain `TODO` while PLN-002 is designed and implemented through its safety gates.

## Do not start

- new AI Coach features;
- gamification;
- multi-user onboarding;
- large visual redesigns;
- new dashboards unrelated to planner debugging;
- planner behavior changes before PLN-002 implementation is explicitly authorized and its invariants are executable.

## Sprint guardrails

- Keep Planned Study, Extra Study, Substitution, Carryover, modality, and recording channel semantically distinct.
- Preserve the approved-plan denominator when Extra Study occurs.
- Require confirmation and stale-state protection for substitution.
- Preserve task identity/history for carryover and distinguish it from backlog.
- Represent historical ambiguity explicitly rather than inventing intent.
- Keep production read-only until an approved implementation and release phase.
- Stop and follow the [incident process](INCIDENT_PROCESS.md) if the audit exposes active data loss, accounting corruption, unsafe mutation, or another P0 condition.

## Previous sprint closure

Sprint 01 closed on 2026-08-22 because `PLN-001` meets every acceptance criterion and its evidence is reviewable:

1. `PLN-001` is `DONE` under the [Definition of Done](PRODUCT_BACKLOG.md#definition-of-done); implementation, release, and rollout evidence are not applicable to a read-only investigation.
2. Confirmed behavior, unexplained behavior, risks, hypotheses, and decisions are in the audit artifact.
3. `PLN-002` through `PLN-006` acceptance criteria were refined from evidence without weakening their invariants.
4. [METRICS.md](METRICS.md) already defines the provisional formulas used; the audit did not justify a roadmap or architecture-decision change.
5. `PLN-002` was selected as the next task and is now `IN_PROGRESS` in design/specification only.
