# PLN-002 Implementation Decision

Date: 2026-08-22
Status: `IMPLEMENTED_RELEASE_PENDING`

## Decision

Implement the approved study-intent model with separate normalized records for study allocation, explicit substitution, and carryover. Study modality remains on the session and is not reused as accounting intent.

The implementation recognizes four distinct semantics:

- planned study records actual minutes and caps planned credit at the remaining obligation;
- extra study records actual progress with zero planned credit and cannot mutate unrelated planned work;
- substitution requires a user-confirmed, stale-protected proposal that names both the replacement work and source task;
- carryover moves the same task identity to a later date and records its reason, initiator, and before/after lineage.

Historical sessions are left untouched. Rows without truthful intent evidence remain without an allocation rather than receiving invented intent.

## Persistence and safety

Migration `20260822120000_study_intent_semantics.sql` adds:

- `study_session_allocations` for actual minutes, planned credit, intent, target evidence, and idempotency;
- `study_substitutions` for confirmed replacement/source relationships and audit state;
- `task_carryovers` for same-task date lineage and retry-safe audit history;
- own-row read policies, server-authoritative writes, foreign keys, query indexes, and uniqueness constraints;
- idempotent session-accounting and confirmed-action functions with user/profile/plan scope and stale-state checks.

No shipped migration was rewritten, no historical row was backfilled with inferred intent, and no production SQL or deployment was executed.

## Product behavior

Task-linked starts infer planned intent. An unplanned study entry asks whether the work was extra or replaced a planned task. Extra is recorded immediately as factual study; replacement proceeds through Preview → Explain → Confirm → Apply. Carryover preview remains read-only and apply occurs only after a separate confirmation.

Daily capacity and replanning subtract planned credit, not raw actual time. Actual, planned actual, planned credit, extra, unknown, and nominal overage remain separately observable. Telegram capacity changes use the same planned-credit denominator.

## Verification evidence

- targeted PLN-002/domain tests: 32 passed;
- full Vitest suite: 617 passed across 91 files;
- local integration/RLS suite: 101 passed across 10 files;
- fresh local migration replay: passed;
- domain and web typechecks: passed;
- web production build: passed;
- Edge planning, Planning V2, and AI Coach bundles: passed;
- app Edge smoke and Telegram study smoke: passed;
- AI Coach and plan-preview safety: passed with zero real-plan mutations;
- Planning V2 shadow smoke and safety: passed with zero real-plan mutations;
- P0 overlap/touching and zero implicit study-deviation Apply regressions: passed.

## Release state

The canonical implementation is release-ready locally. The backlog remains `IN_PROGRESS` under the repository Definition of Done because production/release verification and real-user observation require a separate decision. Recommended next work is that release decision and controlled rollout-readiness review; `PLN-003` has not started.
