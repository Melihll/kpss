# KPSS Koçu Architecture Decisions

Status: Active decision index

Last updated: 2026-08-22

## Purpose

This file records high-level, existing product architecture boundaries that product planning must respect. It is not a substitute for implementation specifications, migrations, tests, or runbooks, and it deliberately avoids undocumented implementation detail.

| ID | Decision | Status |
| --- | --- | --- |
| `ADR-001` | Deterministic planning engine owns scheduling decisions | Accepted |
| `ADR-002` | AI interprets and explains but does not freely mutate plans | Accepted |
| `ADR-003` | Mutation-capable product actions follow Proposal → Preview → Confirm → Apply | Accepted |
| `ADR-004` | Mutations are user-scoped | Accepted |
| `ADR-005` | Stale proposals are rejected | Accepted |
| `ADR-006` | Today tasks receive P0 protection | Accepted |
| `ADR-007` | Sanctioned study-recording paths prevent overlap | Accepted |
| `ADR-008` | Production migrations and deploys use explicit release gates | Accepted |

## `ADR-001` — Deterministic planning engine owns scheduling decisions

- Status: Accepted
- Decision: Scheduling, feasibility, placement, repair, validation, and apply eligibility belong to deterministic planning rules. The same versioned planning evidence should produce the same result wherever practical.
- Rationale: Plan behavior must be testable, reproducible, and explainable. A planner should preserve a valid plan and make the minimum necessary repair rather than churn tasks for incidental optimization.
- Consequences:
  - Planning logic consumes structured evidence and constraints.
  - Hard guarantees and validation remain deterministic.
  - Candidate scoring or interpretation cannot bypass the planning boundary.
  - Planner versions and decision reasons must be traceable.
- Existing references: [Planning Engine V2](../planning-engine-v2.md), [Phase 06 dynamic replanning](../phase-06-dynamic-replanning.md).

## `ADR-002` — AI interprets and explains but does not freely mutate plans

- Status: Accepted
- Decision: AI may interpret user language, classify evidence, suggest strategies, and explain decisions. It does not directly create, move, cancel, or apply plan tasks and does not fabricate study history or bypass deterministic validation.
- Rationale: Model output is probabilistic and untrusted; schedule mutation requires reproducible rules, current state, and safety validation.
- Consequences:
  - AI output uses bounded, structured contracts.
  - Ambiguous requests require clarification or remain evidence-only.
  - A planning-relevant interpretation becomes input to deterministic review, not an applied schedule.
- Existing references: [AI Coach Foundation V1](../ai-coach-v1.md), [Planning Engine V2 AI boundary](../planning-engine-v2.md#19-ai-boundary).

## `ADR-003` — Mutation-capable product actions follow Proposal → Preview → Confirm → Apply

- Status: Accepted
- Decision: Product actions capable of materially mutating a plan are prepared as a proposal, shown as a preview, explicitly confirmed, and applied through a distinct sanctioned path. Calculation or preview does not imply mutation.
- Rationale: The user must understand and approve consequential change, and the system must validate the exact action before committing it.
- Consequences:
  - Preview and apply are distinct operations.
  - The preview communicates the proposed changes and reasons.
  - Apply is explicit, validated, auditable, and idempotent where retries are possible.
  - Automatic or strategic planning cannot acquire mutation authority by presenting an explanation alone.
- Existing references: [Planning Engine V2 proposal and validation](../planning-engine-v2.md#15-plan-proposal), [P0 planning mutation safety contract](../../tests/plan-safety-contract.test.ts), [confirmed product action schema](../../supabase/migrations/20260821130000_confirmed_product_actions.sql).

## `ADR-004` — Mutations are user-scoped

- Status: Accepted
- Decision: Every mutation is constrained to the authenticated or securely resolved user and owned product entities. Ownership is enforced at the relevant API/database boundaries.
- Rationale: Study history, plans, resources, tasks, and proposals are user data. A valid identifier is not sufficient authority to read or mutate another user's state.
- Consequences:
  - Mutation inputs and selected records must agree on owner and profile/plan scope.
  - RLS, ownership checks, and narrow service boundaries remain release-critical.
  - Cross-user isolation is covered by integration tests for affected paths.
- Existing references: [Phase 03 RLS/security](../phase-03-planning-task-engine.md#rlssecurity), [Phase 04 security model](../phase-04-execution-results-telegram.md#security-model), [Planning Engine V2 validation](../planning-engine-v2.md#16-validation).

## `ADR-005` — Stale proposals are rejected

- Status: Accepted
- Decision: A proposal cannot be applied when the plan generation or relevant state no longer matches the snapshot from which the proposal was produced, or when the proposal is expired.
- Rationale: Confirmation of one plan state is not consent to mutate a different state. Applying stale intent can overwrite newer work or create contradictory accounting.
- Consequences:
  - Proposal freshness and current-state identity are checked at apply time.
  - Rejection is safe and leaves plan state unchanged.
  - The user must obtain a new preview before confirming a replacement proposal.
- Existing references: [Planning Engine V2 validation](../planning-engine-v2.md#16-validation), [confirmed product action schema](../../supabase/migrations/20260821130000_confirmed_product_actions.sql).

## `ADR-006` — Today tasks receive P0 protection

- Status: Accepted
- Decision: Work visible on Today represents current user intent and is protected from silent automatic removal or displacement. Only an explicit approved path or a documented hard-safety condition may change it.
- Rationale: Unexpected changes to imminent work break trust and can make completed or intended work disappear from the user's operational view.
- Consequences:
  - Repair prefers future, unrelated, or genuinely invalid work before Today.
  - Today mutation is treated as a P0-sensitive behavior and requires regression coverage.
  - An explanation alone does not authorize removal.
- Existing references: [Planning Engine V2 freeze horizon](../planning-engine-v2.md#8-freeze-horizon), [adaptive replanning implementation](../../packages/domain/src/adaptive/replan.ts), [P0 planning mutation safety contract](../../tests/plan-safety-contract.test.ts).

## `ADR-007` — Sanctioned study-recording paths prevent overlap

- Status: Accepted
- Decision: Supported study-recording paths must reject overlapping time for the same user and preserve idempotent accounting across web, Telegram, retry, and concurrent requests.
- Rationale: Double-counted time corrupts progress, plan evaluation, and replanning evidence.
- Consequences:
  - Overlap is a structured domain conflict, not a successful duplicate record.
  - Protection belongs at a shared transactional boundary rather than only in a client.
  - New recording paths must use a sanctioned protected mutation path or establish equivalent reviewed protection before release.
- Existing references: [Phase 04 actual time accounting](../phase-04-execution-results-telegram.md#actual-time-accounting), [P0 planning mutation safety contract](../../tests/plan-safety-contract.test.ts).

## `ADR-008` — Production migrations and deploys use explicit release gates

- Status: Accepted
- Decision: Production migrations, Edge deployments, automatic triggers, and planner promotion occur only through an explicit, reviewed release process with scoped artifacts, verification, stop conditions, and recovery planning.
- Rationale: Production safety cannot depend on implicit ordering or broad deploy commands, particularly when real plans and study records are involved.
- Consequences:
  - Shadow behavior remains non-mutating until promoted.
  - Only the reviewed migration/service/scope is released.
  - Before/after verification and observation are part of completion.
  - A planner-caused manual database repair is an incident and rollout failure signal.
- Existing references: [Release process](RELEASE_PROCESS.md), [Planning V2 production shadow runbook](../planning-v2-shadow-runbook.md).

## Decision maintenance

- Add a new decision when a durable boundary changes or a cross-cutting choice must be preserved.
- Update status and consequences instead of silently rewriting history; superseded decisions should point to their replacement.
- Link the backlog item, evidence, tests, and release implications.
- Product invariants in [PRODUCT_VISION.md](PRODUCT_VISION.md#planner-product-invariants) remain the higher-level constraint.
