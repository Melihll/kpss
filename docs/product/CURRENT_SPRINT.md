# Current Sprint

Last updated: 2026-08-23

## Sprint 02 — Planning Semantics & Duration Policy

Sprint status: `IN_PROGRESS`

Sprint objective: Close PLN-002 real-user acceptance safely while implementing and verifying PLN-003 duration-policy foundations without introducing unapproved production behavior.

Sprint 01 closed on 2026-08-22 with `PLN-001` complete. PLN-002 has been released to production and remains `IN_PROGRESS` pending authenticated real-user acceptance evidence. PLN-003 has completed local implementation and verification; its production rollout still requires a separate release decision.

## NOW

### `PLN-002` — Separate Planned Study / Extra Study / Substitution / Carryover semantics

- Priority: `P0`
- Status: `IN_PROGRESS`
- Phase: production released; authenticated real-user acceptance pending
- Current state: schema/model, planner semantics, API/UI behavior, auditability, and invariant coverage are released; final natural-use acceptance evidence is still pending

Current deliverable:

- [PLN-002 — Study Intent Semantics](specs/PLN-002_STUDY_INTENT_SEMANTICS.md)
- exact definitions for Planned Study, Extra Study, Substitution, and Carryover;
- separate planned-capacity, actual-time, and planned-credit semantics;
- recommended normalized allocation ledger and typed transitions;
- migration/backfill, UI, planner, API, audit, and invariant requirements.

The implementation preserves the core [PLN-001](audits/PLN-001_ESRA_7_DAY_PLANNING_AUDIT.md) rule: Extra Study cannot silently modify unrelated planned work. Local evidence is summarized in the [PLN-002 Implementation Decision](decisions/PLN-002_IMPLEMENTATION_DECISION.md). `IN_PROGRESS` remains intentional because final authenticated real-user acceptance has not yet closed.

The full item definition is in [PRODUCT_BACKLOG.md](PRODUCT_BACKLOG.md#pln-002--separate-planned-study--extra-study--substitution--carryover-semantics).

### `PLN-003` — Study Block Duration Policy

- Priority: `P1`
- Status: `IN_PROGRESS`
- Phase: local implementation and verification complete; production rollout pending
- Current state: `pln-003-v1` centralizes deterministic duration classes, preserves genuine remainders and user overrides, normalizes advisory AI recommendations, and keeps planner capacity separate from voluntary Extra Study.
- Production activation is intentionally limited: normal P48 inputs do not yet carry canonical `learning_stage` / `blockClass` metadata. PLN-003 must not infer learning stage from `work_mode` or resource role.

Verification evidence: targeted PLN-003 tests pass, full unit regression is `632/632`, integration/RLS is `101/101`, typecheck passes, the V1 planning bundle is regenerated, and bundle safety/reproducibility checks pass. `roadmap.test.ts` passes `11/11`, including four PLN-003 duration-aware schedule scenarios.

The full item definition is in [PRODUCT_BACKLOG.md](PRODUCT_BACKLOG.md#pln-003--study-block-duration-policy).

## NEXT

1. Close `PLN-002` authenticated real-user acceptance
2. Separate `PLN-003` release-readiness decision
3. `PLN-004` — Learning Stage Model

`NEXT` indicates intended sequence, not permission to deploy. PLN-003 production rollout requires a separate release decision.

## Do not start

- new AI Coach features;
- gamification;
- multi-user onboarding;
- large visual redesigns;
- new dashboards unrelated to planner debugging;
- PLN-003 production deployment or rollout before its separate release decision.

## Sprint guardrails

- Keep Planned Study, Extra Study, Substitution, Carryover, modality, and recording channel semantically distinct.
- Preserve the approved-plan denominator when Extra Study occurs.
- Require confirmation and stale-state protection for substitution.
- Preserve task identity/history for carryover and distinguish it from backlog.
- Represent historical ambiguity explicitly rather than inventing intent.
- Keep unapproved PLN-003 planner behavior out of production until a separately approved release phase.
- Stop and follow the [incident process](INCIDENT_PROCESS.md) if the audit exposes active data loss, accounting corruption, unsafe mutation, or another P0 condition.

## Previous sprint closure

Sprint 01 closed on 2026-08-22 because `PLN-001` meets every acceptance criterion and its evidence is reviewable:

1. `PLN-001` is `DONE` under the [Definition of Done](PRODUCT_BACKLOG.md#definition-of-done); implementation, release, and rollout evidence are not applicable to a read-only investigation.
2. Confirmed behavior, unexplained behavior, risks, hypotheses, and decisions are in the audit artifact.
3. `PLN-002` through `PLN-006` acceptance criteria were refined from evidence without weakening their invariants.
4. [METRICS.md](METRICS.md) already defines the provisional formulas used; the audit did not justify a roadmap or architecture-decision change.
5. `PLN-002` was selected as the next task and entered `IN_PROGRESS` in design/specification.
