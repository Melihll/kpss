# Current Sprint

Last updated: 2026-09-10

## Sprint 02 — Evre 6B & Continuing Planning Foundations

Sprint status: `IN_PROGRESS`

Sprint objective: Wire and verify the versioned CoachContextV1 canonical read-only adapter without changing AI runtime behavior, production state, migrations, or gates.

Evre 5 Planner V2 / Planner Truth is closed. Evre 6A is closed and 6B.1 is accepted at commit `acd16ffb2263b5285b14bd7329ff4357d7971e00`. Evre 6B.2 canonical read-only adapter acceptance is green against the real local Supabase database. AI runtime wiring, production, migrations, and gates remain unchanged. PLN-002 remains `IN_PROGRESS` pending natural Extra Study acceptance evidence.

## NOW

### `AIC-002` / Evre 6B — CoachContextV1

- Priority: `P0`
- Status: `IN_PROGRESS — 6B.2 LOCAL_DB_ACCEPTED — 6B.3 NEXT`
- Scope: unconnected server-side read adapters and tests only; no AI runtime integration, provider/model/prompt change, telemetry implementation, migration, deploy, gate change, or production access.
- Authority state: read-only; Planner V2 Confirm OFF; Planner V2 Apply OFF.

Current deliverable/evidence:

- [AI Coach — CoachContextV1 Contract and Canonical Source Map](specs/AI_COACH_CONTEXT_V1.md);
- 6B.1 contract/source-map checkpoint `acd16ffb2263b5285b14bd7329ff4357d7971e00`;
- local canonical profile/task/session/material/workload/capacity/persisted-Planner adapters;
- explicit `canonical_selector_unavailable` and `pln002_completeness_unresolved` behavior;
- Planner protected/post-commitment capacity remains field-level unknown without a current authoritative reader;
- 30/30 focused tests; 42-task production-shaped internal canonical context = 52,716 bytes;
- real local Supabase integration test `1/1` PASS with total mutable-row delta `0` and Planner lifecycle-row delta `0`;
- 6B.3 must add a compact allowlisted LLM-facing projection with on-demand detail retrieval; it must not reduce or fabricate the internal canonical truth envelope.

### `AIC-001` / Evre 6A — Product / Authority / Cost Contract

- Priority: `P0`
- Status: `DONE`
- Phase: `EVRE_6A_CLOSED — FINAL_CONTRACT_ACCEPTED — DOCS_ONLY`
- Runtime state: unchanged; no implementation, deployment, migration, gate change, or production access.
- Authority state: Planner V2 Confirm OFF; Planner V2 Apply OFF.

Current deliverable:

- [AI Coach Evre 6 — Product, Authority & Cost Contract](specs/AI_COACH_EVRE_6_PRODUCT_AUTHORITY_COST_CONTRACT.md);
- Explain, Diagnose, Guide, Proactive Insight, proposal interpretation, daily/weekly analysis, and contextual-conversation capability boundaries;
- explicit deterministic-versus-LLM responsibility and non-authority invariants;
- 20 Turkish product scenarios with truth sources, allowed/forbidden behavior, proposal eligibility, and expected UX;
- deterministic proactive categories, eligibility, freshness, cooldown, dedupe, and attention-budget rules;
- normal-user `≤ 150–200 TL/month`, heavy-user `≤ 250 TL/month`, and hard `300 TL/month` model-cost contract;
- sub-phases 6A–6G with entry, exit, and authority states;
- ten final architecture decisions and explicit later-phase implementation dependencies.

The final review decisions are incorporated. All 20 scenarios were revalidated. New development cannot use the legacy Coach planning Apply path; CoachContext uses canonical Material Truth and Canonical Workload Engine; incomplete PLN-002 ahead/behind claims fail closed per field; telemetry begins in 6B and the hard governor completes in 6G; raw long-term conversation history is not stored by default; proactive behavior is in-app only and may stay silent; real plan effects require Planner V2 scenario/preview facts; router/pricing are centralized server-side; user-facing analysis avoids mastery/medical diagnosis; and Coach facts carry freshness/confidence/provenance/unknown semantics. AI teacher/tutoring/quiz/mastery features remain outside Evre 6.

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

### Planner V2 canonical shadow (W5)

- Phase: engineering shadow implemented; production mutation/runtime activation prohibited.
- Scope: deterministic canonical proposal, exact capacity, whole-material boundaries, blocked/unmet demand, current-day/user-commitment protection, stable staleness fingerprints, and read-only legacy comparison.
- Production evaluation uses a separate strictly read-only runner; it cannot write diagnostic rows or call Apply.
- W6 proposal Apply, PLN-003/004/005 production authority, and PLN-010 rollout remain separately gated.

### Planner V2 proposal lifecycle reliability (Evre 5)

- Phase: `CLOSED`. Engineering, exact-profile production acceptance, and final Week/Today real-user observation are complete. Production Confirm and Apply are OFF.
- Each explicit preview now receives a distinct lifecycle attempt record and idempotency key while deterministic proposal/snapshot fingerprints remain unchanged. Terminal attempts are never resurrected.
- Local rebuilds reproduce the existing hosted `service_role` CRUD baseline for `weekly_plans`, `tasks`, `task_resource_units`, and `task_progress`; proposal-table authority remains unchanged.
- A confirmed proposal that expires before Apply atomically clears `confirmed_at` as it enters `expired`, preserving the strict confirmation-state constraint.
- Verification: focused lifecycle/security/HTTP `26/26`, Planner V2 lifecycle DB integration `16/16`, all integration `132/132`, full non-integration `949/949`, workspace typecheck, Planner V2 safety checks, local PostgreSQL lint, and diff check PASS.
- Production acceptance: preview PASS, exact confirmation PASS, and one meaningful atomic Apply PASS for lifecycle record `805be0cb-7d68-4b12-8df9-7b14f52a852e`. The transaction created one 22-minute canonical YouTube task on 2026-09-08, replaced zero tasks, advanced the weekly plan from `2662 / 2662 / 2640` generation 3 to `2662 / 2662 / 2662` generation 4, and preserved past, Today, and 41 protected manual future tasks.
- Duplicate protection PASS: the exact canonical workload has one active task after Apply, not more than one. Study sessions were unchanged. Confirm and Apply were disabled immediately after the pilot and remain OFF; preview remains exact-profile-only.
- Final real-user observation PASS on 2026-09-08: the 22-minute canonical task appeared correctly on both Week and Today before start; database state remained `ready` with zero task progress/sessions, exact canonical linkage, duplicate count one, and plan `2662 / 2662 / 2662` generation 4. Natural work on three other Today tasks was fully explained by linked sessions; no future manual-task or observation-caused mutation occurred.
- Final classification: `EVRE_5_PLANNER_V2_PLANNER_TRUTH_CLOSED`.

## NEXT

1. Define and verify 6B.3 compact allowlisted LLM-facing projection and on-demand detail strategy without dropping internal canonical truth
2. Continue later 6B work for centralized server-side router/pricing and AI usage/cost telemetry under a separate bounded scope
3. Do not connect the AI runtime until the relevant 6B scope is separately approved and accepted
4. Close `PLN-002` natural Extra Study authenticated real-user acceptance when real usage provides evidence
5. Keep `PLN-004` production-authoritative activation gated while MAT-001/PLN-005 inputs mature
6. Re-evaluate PLN-003 production-authoritative duration activation only after canonical learning-stage, material, and resource-role inputs exist

`NEXT` indicates intended sequence, not permission to deploy. Stage-dependent duration activation remains separately gated.
## Do not start

- AI runtime wiring before a separately approved 6B.3 projection/telemetry scope and its acceptance;
- 6C–6G work before their documented entry conditions;
- AI teacher, tutoring, quiz, mock, grading, or mastery features in Evre 6;
- any Coach task/capacity/material/progress/stage mutation or non-canonical planning Apply path;
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
- Keep AI provider output untrusted and advisory; deterministic sources own all quantities, eligibility, lifecycle, and mutations.
- Use no LLM for deterministic calculations or unambiguous scope routing.
- Start metering every Evre 6 model call in 6B; complete automatic pre-call reservation and the `300 TL/month` per-user hard governor by the 6G exit.
- Keep model routing, provider pricing, and versioned TRY estimation centralized server-side.
- Use canonical Material Truth and Canonical Workload Engine in CoachContext; never fall back to legacy top-three material/workload projections.
- Fail definitive ahead/behind claims closed to unknown when PLN-002 semantics are insufficient, while keeping independently known Coach facts available.
- Keep proactive Coach in-app only with attention budget, category cooldown, dedupe, and valid silence.
- Do not store raw long-term conversation history by default; use short recent context plus compact structured state/signals.
- State real plan effects only from a fresh deterministic Planner V2 scenario/preview.
- Route every future Coach planning Apply through the canonical Planner V2 lifecycle; conversation text never confirms or applies.
- Keep Planner V2 Confirm and Apply OFF after 6A closure unless separately approved.
- Stop and follow the [incident process](INCIDENT_PROCESS.md) if the audit exposes active data loss, accounting corruption, unsafe mutation, or another P0 condition.

## Previous sprint closure

Sprint 01 closed on 2026-08-22 because `PLN-001` meets every acceptance criterion and its evidence is reviewable:

1. `PLN-001` is `DONE` under the [Definition of Done](PRODUCT_BACKLOG.md#definition-of-done); implementation, release, and rollout evidence are not applicable to a read-only investigation.
2. Confirmed behavior, unexplained behavior, risks, hypotheses, and decisions are in the audit artifact.
3. `PLN-002` through `PLN-006` acceptance criteria were refined from evidence without weakening their invariants.
4. [METRICS.md](METRICS.md) already defines the provisional formulas used; the audit did not justify a roadmap or architecture-decision change.
5. `PLN-002` was selected as the next task and entered `IN_PROGRESS` in design/specification.
