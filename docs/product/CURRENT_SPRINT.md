# Current Sprint

Last updated: 2026-08-22

## Sprint 02 — Study Intent Semantics

Sprint status: `IN_PROGRESS`

Sprint objective: Make user study intent explicit and prevent extra study from silently changing unrelated planned work.

Sprint 01 closed on 2026-08-22 with `PLN-001` complete. Sprint 02 has completed its authorized local implementation phase. Production mutation, deployment, and rollout still require a separate release decision.

## NOW

### `PLN-002` — Separate Planned Study / Extra Study / Substitution / Carryover semantics

- Priority: `P0`
- Status: `IN_PROGRESS`
- Phase: implementation complete; release verification pending
- Current state: schema/model, planner semantics, API/UI behavior, auditability, and invariant coverage are locally verified; production is unchanged

Current deliverable:

- [PLN-002 — Study Intent Semantics](specs/PLN-002_STUDY_INTENT_SEMANTICS.md)
- exact definitions for Planned Study, Extra Study, Substitution, and Carryover;
- separate planned-capacity, actual-time, and planned-credit semantics;
- recommended normalized allocation ledger and typed transitions;
- migration/backfill, UI, planner, API, audit, and invariant requirements.

The implementation preserves the core [PLN-001](audits/PLN-001_ESRA_7_DAY_PLANNING_AUDIT.md) rule: Extra Study cannot silently modify unrelated planned work. Local evidence is summarized in the [PLN-002 Implementation Decision](decisions/PLN-002_IMPLEMENTATION_DECISION.md). `IN_PROGRESS` remains intentional because release/production verification is not part of this implementation task and has not occurred.

The full item definition is in [PRODUCT_BACKLOG.md](PRODUCT_BACKLOG.md#pln-002--separate-planned-study--extra-study--substitution--carryover-semantics).

## NEXT

1. Separate `PLN-002` release decision and controlled rollout-readiness review
2. `PLN-003` — Study Block Duration Policy
3. `PLN-004` — Learning Stage Model

`NEXT` indicates intended sequence, not permission to start. No production rollout or `PLN-003` work begins without separate authorization.

## Do not start

- new AI Coach features;
- gamification;
- multi-user onboarding;
- large visual redesigns;
- new dashboards unrelated to planner debugging;
- production deployment or migration before the separate PLN-002 release decision.

## Sprint guardrails

- Keep Planned Study, Extra Study, Substitution, Carryover, modality, and recording channel semantically distinct.
- Preserve the approved-plan denominator when Extra Study occurs.
- Require confirmation and stale-state protection for substitution.
- Preserve task identity/history for carryover and distinguish it from backlog.
- Represent historical ambiguity explicitly rather than inventing intent.
- Keep production unchanged until a separately approved release phase.
- Stop and follow the [incident process](INCIDENT_PROCESS.md) if the audit exposes active data loss, accounting corruption, unsafe mutation, or another P0 condition.

## Previous sprint closure

Sprint 01 closed on 2026-08-22 because `PLN-001` meets every acceptance criterion and its evidence is reviewable:

1. `PLN-001` is `DONE` under the [Definition of Done](PRODUCT_BACKLOG.md#definition-of-done); implementation, release, and rollout evidence are not applicable to a read-only investigation.
2. Confirmed behavior, unexplained behavior, risks, hypotheses, and decisions are in the audit artifact.
3. `PLN-002` through `PLN-006` acceptance criteria were refined from evidence without weakening their invariants.
4. [METRICS.md](METRICS.md) already defines the provisional formulas used; the audit did not justify a roadmap or architecture-decision change.
5. `PLN-002` was selected as the next task and is now `IN_PROGRESS` in design/specification only.
