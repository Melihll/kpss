# Current Sprint

Last updated: 2026-08-22

## Sprint 01 — Planner Reality Audit

Sprint status: `DONE`

Sprint objective: Understand how the current production planner actually behaves with Esra's real study behavior before changing planning logic.

This sprint is deliberately evidence-first. It does not authorize production mutation, planner changes, data repair, or the creation of synthetic activity in Esra's account.

## NOW

### `PLN-001` — Esra 7-day Planning Reality Audit

- Priority: `P0`
- Status: `DONE`
- Status transition: `READY → IN_PROGRESS → DONE`
- Current state: completed on 2026-08-22; production remained read-only

Completed evidence:

- planned versus actual study reconstructed;
- manual and extra study identified;
- capacity changes identified;
- plan revisions traced;
- task moves and backlog transitions traced;
- resource usage identified;
- unexplained planner behavior listed.

The reviewable artifact is [PLN-001 — Esra 7-Day Planning Reality Audit](audits/PLN-001_ESRA_7_DAY_PLANNING_AUDIT.md). It confirms the historical automatic displacement risk, disproves Turkish-caused Geography movement in this window, records the 30-minute new-topic and fragmentation baselines, and identifies the remaining semantic gaps.

The full item definition is in [PRODUCT_BACKLOG.md](PRODUCT_BACKLOG.md#pln-001--esra-7-day-planning-reality-audit).

## NEXT

1. `PLN-002` — Separate Planned Study / Extra Study / Substitution / Carryover semantics
2. `PLN-003` — Study Block Duration Policy

Recommended next single task: `PLN-002`. `NEXT` indicates intended sequence, not permission to start. Both items remain `TODO`; this sprint closure does not start implementation.

## Do not start

- new AI Coach features;
- gamification;
- multi-user onboarding;
- large visual redesigns;
- new dashboards unrelated to planner debugging;
- planner behavior changes before the reality audit is understood.

## Sprint guardrails

- Read production evidence only through approved, user-scoped, read-only paths.
- Do not mutate Esra's production data for analysis or convenience.
- Preserve timestamps, identifiers, revisions, and raw evidence needed to reconstruct decisions.
- Label inference separately from observed fact.
- Record gaps as unexplained behavior rather than filling them with assumptions.
- Stop and follow the [incident process](INCIDENT_PROCESS.md) if the audit exposes active data loss, accounting corruption, unsafe mutation, or another P0 condition.

## Sprint completion review

Sprint 01 closed on 2026-08-22 because `PLN-001` meets every acceptance criterion and its evidence is reviewable:

1. `PLN-001` is `DONE` under the [Definition of Done](PRODUCT_BACKLOG.md#definition-of-done); implementation, release, and rollout evidence are not applicable to a read-only investigation.
2. Confirmed behavior, unexplained behavior, risks, hypotheses, and decisions are in the audit artifact.
3. `PLN-002` through `PLN-006` acceptance criteria were refined from evidence without weakening their invariants.
4. [METRICS.md](METRICS.md) already defines the provisional formulas used; the audit did not justify a roadmap or architecture-decision change.
5. `PLN-002` is the recommended next single task and remains `TODO` until explicitly started.
