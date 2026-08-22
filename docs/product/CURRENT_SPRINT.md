# Current Sprint

Last updated: 2026-08-22

## Sprint 01 — Planner Reality Audit

Sprint status: `READY`

Sprint objective: Understand how the current production planner actually behaves with Esra's real study behavior before changing planning logic.

This sprint is deliberately evidence-first. It does not authorize production mutation, planner changes, data repair, or the creation of synthetic activity in Esra's account.

## NOW

### `PLN-001` — Esra 7-day Planning Reality Audit

- Priority: `P0`
- Status: `READY`
- Start condition: explicit approval to begin the audit
- Current state: not started by this documentation task

Expected evidence when the item is eventually completed:

- planned versus actual study reconstructed;
- manual and extra study identified;
- capacity changes identified;
- plan revisions traced;
- task moves and backlog transitions traced;
- resource usage identified;
- unexplained planner behavior listed.

The full item definition is in [PRODUCT_BACKLOG.md](PRODUCT_BACKLOG.md#pln-001--esra-7-day-planning-reality-audit).

## NEXT

1. `PLN-002` — Separate Planned Study / Extra Study / Substitution / Carryover semantics
2. `PLN-003` — Study Block Duration Policy

`NEXT` indicates intended sequence, not permission to start. Both items remain `TODO` until the sprint owner moves them through the backlog workflow.

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

Sprint 01 can close only when `PLN-001` meets every acceptance criterion and its evidence is reviewable. At close:

1. update `PLN-001` to `DONE` only if the [Definition of Done](PRODUCT_BACKLOG.md#definition-of-done) is satisfied;
2. summarize confirmed behavior, unexplained behavior, risks, and decisions;
3. refine `PLN-002` and `PLN-003` from the evidence without weakening their invariants;
4. update [ROADMAP.md](ROADMAP.md), [METRICS.md](METRICS.md), and [ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md) if the evidence changes product assumptions;
5. choose the next single `NOW` item explicitly.
