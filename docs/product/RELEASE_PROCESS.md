# KPSS Koçu Release Process

Status: Active policy

Last updated: 2026-08-22

## Purpose

This process protects user intent, study accounting, and production data while allowing reviewed changes to reach production. It defines gates; it does not authorize a deployment by itself.

Production migrations and deployments must use explicit release gates. No release may depend on informal memory, an unreviewed local state, or an unrecorded manual repair.

## Release principles

- Release the smallest reviewed scope.
- A preview, test, or shadow result is not permission to apply a production mutation.
- P0 guarantees cannot be waived to meet a schedule.
- User-scoped mutations, stale-proposal rejection, Today-task protection, overlap protection, and explicit apply paths remain mandatory.
- Database changes and deployable services are reviewed and released deliberately, not as incidental side effects.
- Evidence of correctness must be proportional to risk and include real release verification where relevant.
- If a stop condition occurs, contain first and follow [INCIDENT_PROCESS.md](INCIDENT_PROCESS.md).

## Change classification

| Class | Examples | Minimum handling |
| --- | --- | --- |
| Documentation-only | Product documents, runbooks, explanatory changes with no executable behavior | Link/format validation, documentation-only diff review, normal code review. |
| Low-risk application | Isolated presentation or non-mutating behavior | Targeted tests, type/build checks as applicable, preview verification, rollback plan. |
| Planner/accounting mutation | Scheduling, task lifecycle, study accounting, proposal/apply, retry/idempotency | P0 invariant review, targeted and regression tests, simulation, explicit production verification and stop conditions. |
| Database/Edge production | Migration, RPC, RLS, Edge Function, scheduler, secrets/config | All relevant gates below; deploy only the reviewed artifact through the controlled production procedure. |

Risk is determined by potential impact, not diff size.

## Release record

Before a production release, record:

- purpose and linked backlog item;
- exact commit and reviewed change scope;
- affected users, data, surfaces, services, and migrations;
- risk class and product invariants at risk;
- test, simulation, shadow, and manual verification evidence;
- observability and success measures;
- rollback or disable strategy;
- stop conditions;
- release owner and approver;
- planned release and observation window.

## Gates

### 1. Scope gate

- The change maps to a defined problem, desired outcome, and acceptance criteria.
- The release contains no unrelated change.
- Current sprint and roadmap constraints are respected.
- Any production data access or mutation path is explicit.

### 2. Design and safety gate

- Relevant [planner invariants](PRODUCT_VISION.md#planner-product-invariants) are evaluated one by one.
- Architectural boundaries in [ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md) are preserved or deliberately amended before implementation.
- Failure, retry, concurrency, idempotency, ownership, stale input, and partial-apply cases are defined where relevant.
- Today-task and study-recording overlap protections are verified for affected paths.

### 3. Verification gate

- Relevant automated tests pass.
- Typecheck, build, lint, and integration checks run where applicable to the changed area.
- Planner changes pass the required real and synthetic simulations.
- The diff and generated artifacts, if any, are reviewed for unintended change.
- Documentation and operational instructions match the behavior being released.

### 4. Data and migration gate

When a migration is involved:

- Review the exact migration independently from unrelated files.
- Confirm ownership, RLS, constraints, transaction boundaries, compatibility, and failure behavior.
- Define backup/recovery and rollback or forward-fix strategy appropriate to the change.
- Apply only the reviewed migration through the controlled production procedure.
- Verify the resulting schema and protections with read-only checks.

This gate is not applicable to documentation-only releases.

### 5. Deployment gate

When an application or Edge deployment is involved:

- Deploy only the reviewed commit/artifact and explicitly named service scope.
- Keep shadow functionality non-mutating until its promotion gate is met.
- Do not wire new automatic triggers, schedulers, or apply paths unless they are in the reviewed scope.
- Record deployment result and version.

This gate is not applicable to documentation-only releases.

### 6. Production verification gate

- Run predefined smoke checks using an approved user and user-scoped path.
- Verify expected behavior and the absence of unintended plan, task, accounting, or cross-user changes.
- Check error and incident signals.
- For planner changes, inspect decision traces and changed-task summaries.
- Do not create or alter Esra's activity merely to make verification pass.

### 7. Observation and close gate

- Observe the release for the predefined window.
- Compare success and guardrail metrics with baseline.
- Record incidents, rejected/stale proposals, planner moves, and any manual database repair.
- Close the release only when its acceptance criteria and relevant [Definition of Done](PRODUCT_BACKLOG.md#definition-of-done) evidence are complete.

## Planner promotion sequence

Planner behavior follows this sequence:

```text
Specification
→ Automated tests
→ Simulation
→ Shadow evaluation
→ Reviewed proposal/preview
→ Explicit controlled apply path
→ Limited rollout
→ Observation
→ Wider eligibility
```

Skipping a stage requires a documented emergency rationale and incident-level approval; it cannot bypass P0 safeguards.

For Planning V2 shadow specifics, see [the existing production shadow runbook](../planning-v2-shadow-runbook.md).

## Stop conditions

Stop or disable the release and enter the incident process when any of these occurs:

- silent task disappearance or unexplained plan mutation;
- extra study automatically substitutes for planned work without confirmation;
- Today work is removed or moved through a prohibited path;
- duplicate or overlapping study accounting is accepted;
- stale or ownership-mismatched proposal is applied;
- cross-user access or mutation;
- unexpected mass change;
- partial transaction or non-idempotent retry changes state twice;
- planner-caused need for manual database repair;
- error rate or another predefined safety threshold breaches its release limit.

## Rollback and recovery

- Prefer disabling the new path or returning authority to the last known safe planner when possible.
- Preserve audit evidence before corrective mutation.
- Do not run ad hoc production SQL without an explicit, reviewed repair plan and authorization.
- Record every manual database repair as a metric and incident artifact.
- Verify recovery with read-only before/after evidence and confirm the user-visible plan/accounting state.

## Documentation-only release checklist

For a release that changes only documentation:

- validate Markdown structure and relative links;
- confirm the diff contains no application, migration, configuration, generated, or production-data change;
- verify status, priority, milestone, sprint, and NOW values agree across product documents;
- obtain normal review and merge/push through the standard repository path;
- record the commit.
