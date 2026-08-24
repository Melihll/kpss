# Current Sprint

Last updated: 2026-08-23

## Sprint 02 — Planning Semantics & Duration Policy

Sprint status: `IN_PROGRESS`

Sprint objective: Close PLN-002 natural Extra Study acceptance safely while specifying PLN-004 learning-stage and MAT-001 exact-material foundations, without activating unapproved production-authoritative stage-dependent planner behavior.

Sprint 01 closed on 2026-08-22 with `PLN-001` complete. PLN-002 has been released to production; planned-study authenticated real-user acceptance passed on 2026-08-23, and the item remains `IN_PROGRESS` pending natural Extra Study acceptance evidence. PLN-003 duration-policy foundations are locally implemented and verified. The P48 planned-credit accounting correction has been deployed and is observing, while production-authoritative stage-based duration activation remains intentionally gated.

## NOW

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
## NEXT

1. Close `PLN-002` natural Extra Study authenticated real-user acceptance when real usage provides evidence
2. `PLN-004` — Learning Stage Model locally verified; keep production-authoritative activation gated
3. `MAT-001` — Canonical Material Content & Progress — NOW
4. Specify `PLN-005` — Resource Role Model
5. Re-evaluate PLN-003 production-authoritative duration activation only after canonical learning-stage, material, and resource-role inputs exist

`NEXT` indicates intended sequence, not permission to deploy. Stage-dependent duration activation remains separately gated.
## Do not start

- new AI Coach features;
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
- Stop and follow the [incident process](INCIDENT_PROCESS.md) if the audit exposes active data loss, accounting corruption, unsafe mutation, or another P0 condition.

## Previous sprint closure

Sprint 01 closed on 2026-08-22 because `PLN-001` meets every acceptance criterion and its evidence is reviewable:

1. `PLN-001` is `DONE` under the [Definition of Done](PRODUCT_BACKLOG.md#definition-of-done); implementation, release, and rollout evidence are not applicable to a read-only investigation.
2. Confirmed behavior, unexplained behavior, risks, hypotheses, and decisions are in the audit artifact.
3. `PLN-002` through `PLN-006` acceptance criteria were refined from evidence without weakening their invariants.
4. [METRICS.md](METRICS.md) already defines the provisional formulas used; the audit did not justify a roadmap or architecture-decision change.
5. `PLN-002` was selected as the next task and entered `IN_PROGRESS` in design/specification.
