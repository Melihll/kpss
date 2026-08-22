# KPSS Koçu Product Backlog

Status: Active

Last updated: 2026-08-22

## Workflow

Each backlog item has exactly one status:

| Status | Meaning |
| --- | --- |
| `TODO` | Defined but not yet ready or committed for immediate execution. |
| `READY` | Clear enough to start and acceptance criteria are reviewable. |
| `IN_PROGRESS` | Work has explicitly begun and has an owner. |
| `BLOCKED` | Work began or was ready, but a named dependency prevents progress. |
| `DONE` | The relevant Definition of Done evidence is complete and reviewed. |

Status changes must be deliberate. Being listed under `NOW` does not by itself mean work has started.

## Priorities

| Priority | Meaning |
| --- | --- |
| `P0` | Data loss, incorrect plan, accounting, or safety. |
| `P1` | Core product quality. |
| `P2` | Meaningful product improvement. |
| `P3` | Nice to have. |

Priority describes impact, not implementation order. Dependencies and safety gates may determine sequence.

## Current milestone backlog

| ID | Priority | Title | Status |
| --- | --- | --- | --- |
| `PLN-001` | `P0` | Esra 7-day Planning Reality Audit | `DONE` |
| `PLN-002` | `P0` | Separate Planned Study / Extra Study / Substitution / Carryover semantics | `IN_PROGRESS` |
| `PLN-003` | `P1` | Study Block Duration Policy | `TODO` |
| `PLN-004` | `P1` | Learning Stage Model | `TODO` |
| `PLN-005` | `P1` | Resource Role Model | `TODO` |
| `PLN-006` | `P1` | Daily Fragmentation Control | `TODO` |
| `PLN-007` | `P1` | Planner Decision Trace | `TODO` |
| `PLN-008` | `P1` | Planner Simulation Suite | `TODO` |
| `PLN-009` | `P1` | Shadow Evaluation | `TODO` |
| `PLN-010` | `P1` | Controlled Production Rollout | `TODO` |

## `PLN-001` — Esra 7-day Planning Reality Audit

- Priority: `P0`
- Status: `DONE`
- Problem: Current planning behavior cannot be safely changed until important decisions from Esra's latest seven days can be reconstructed from real evidence. Unknown moves, substitutions, backlogs, or accounting effects make planner changes unsafe.
- Desired outcome: A factual, reviewable timeline that explains what was planned, what Esra actually did, what changed, which component or action caused each change, and which behavior remains unexplained.
- Acceptance criteria:
  - Planned versus actual study is reconstructed for the seven-day audit window.
  - Manual and extra study is identified separately from planned study.
  - Capacity changes are identified with their effective time and source where evidence exists.
  - Plan revisions are traced in order.
  - Task moves, carryovers, and backlog transitions are traced without treating disappearance as an explanation.
  - Resource and video usage is identified where recorded.
  - Each important planner decision is connected to evidence or explicitly listed as unexplained.
  - The audit is read-only with respect to Esra's production data; no synthetic activity or repair is introduced.
- Completion note (2026-08-22): status advanced `READY → IN_PROGRESS → DONE`. The acceptance evidence, hypotheses, sanitized observation references, and unknowns are recorded in the [PLN-001 audit](audits/PLN-001_ESRA_7_DAY_PLANNING_AUDIT.md). This item required investigation and documentation, not implementation; production remained read-only and no planner behavior was changed.

## `PLN-002` — Separate Planned Study / Extra Study / Substitution / Carryover semantics

- Priority: `P0`
- Status: `IN_PROGRESS`
- Current phase: design/specification only. The recommended semantic model, data-model alternatives, invariants, and implementation gates are defined in [PLN-002 — Study Intent Semantics](specs/PLN-002_STUDY_INTENT_SEMANTICS.md). No migration or behavior change has been implemented.
- Problem: Study outside the plan can be misinterpreted as completion or replacement of planned work, and movement across days can obscure whether work was substituted, carried over, or silently removed.
- Desired outcome: Planned study, extra study, user-confirmed substitution, and carryover are distinct concepts in product behavior, accounting, explanations, and tests.
- Acceptance criteria:
  - Each of the four concepts has an unambiguous product definition and lifecycle.
  - Extra study never silently substitutes for, completes, cancels, or removes another planned subject.
  - Substitution requires explicit user confirmation and records what replaced what.
  - Carryover preserves the identity and history of the original planned work.
  - Planned and extra minutes can be reported separately.
  - A task-linked session performed ahead of its approved date is not silently classified as planned, extra, or substitution; the user's intent or an explicit documented default determines its accounting treatment.
  - Extra/manual study does not reduce the approved-plan denominator or consume displacement capacity unless the product presents and records the user-approved consequence.
  - Existing records have a documented interpretation or are explicitly classified as ambiguous; history is not rewritten to hide ambiguity.
  - Automated tests cover extra study, confirmed substitution, rejected substitution, carryover, retry, and concurrent mutation boundaries.
  - Planner explanations state whether extra study affected a decision.
  - Regression fixtures cover the PLN-001 manual Mathematics → Finance backlog and early Turkish → Finance/Law backlog chains.

## `PLN-003` — Study Block Duration Policy

- Priority: `P1`
- Status: `TODO`
- Problem: A uniform duration assumption ignores the cognitive and practical differences between learning, practice, review, reinforcement, video, and spaced review, producing unrealistic blocks or avoidable fragments.
- Desired outcome: Estimated duration follows an explicit, configurable policy based on study stage and activity type, with sensible bounds and an explanation.
- Acceptance criteria:
  - Separate duration policies exist for new-topic learning, mathematics concept learning, primary practice, reinforcement, review, video, and spaced review.
  - The policy does not hard-code “every subject = 60 minutes.”
  - Duration inputs, defaults, minimums, maximums, and rounding behavior are documented.
  - A chosen duration can be explained using its study type/stage and relevant evidence.
  - Estimated versus actual duration is measurable using the definition in [METRICS.md](METRICS.md).
  - Real Esra examples and boundary cases cover the three 30-minute new-topic video/notes blocks, short availability, long resources, partial work, and continuation.
  - Duration calibration rejects or explicitly excludes overlapping session intervals and reports when historical per-task actual time cannot be de-overlapped reliably.
  - Policy changes are versioned or otherwise traceable so past decisions remain explainable.

## `PLN-004` — Learning Stage Model

- Priority: `P1`
- Status: `TODO`
- Problem: Planning by subject and minutes alone cannot distinguish first exposure from practice or later reinforcement, so it may order pedagogically different work as if it were interchangeable.
- Desired outcome: The planner represents and respects the progression `Learn → Practice → Review / Reinforcement`.
- Acceptance criteria:
  - Learning stages have explicit definitions, allowed transitions, and evidence requirements.
  - New-topic learning and question solving are represented as different stages.
  - Practice does not imply that required initial learning occurred unless evidence supports it.
  - Review and reinforcement do not replace required initial learning.
  - Tasks and planner decisions expose the intended learning stage as structured data rather than inferring it only from mixed prose descriptions.
  - Partial, repeated, skipped, and corrected evidence have defined stage behavior.
  - A task reaching its credited-minute estimate has a documented relationship to task status and required resource-unit evidence.
  - Tests cover valid sequencing, invalid shortcuts, unknown evidence, and stage-specific replanning.

## `PLN-005` — Resource Role Model

- Priority: `P1`
- Status: `TODO`
- Problem: A resource link does not tell the planner whether the material teaches, provides primary practice, reinforces, or supports revision. Treating resources as interchangeable can create pedagogically unsound tasks.
- Desired outcome: Resources participate in planning through explicit roles: Instruction, Primary Practice, Reinforcement, and Revision.
- Acceptance criteria:
  - Each role has a product definition and planning purpose.
  - Video courses, main question banks, and second question banks have documented role-assignment rules, including the audited İlyas Güneş instruction video, Yediiklim primary question bank, and Yargı Plus reinforcement question bank.
  - A task identifies its learning stage and resource role when a resource is required.
  - The planner does not use reinforcement material as silent replacement for instruction or primary practice.
  - Missing targets/mappings, unavailable, duplicate, and multi-role resource cases have deterministic behavior; an unmapped instruction video cannot silently disappear from the learning path.
  - Target `sequence_order` and pedagogical prerequisites are distinct, documented rules; sequence 1/2 for two question banks does not by itself prove instruction occurred.
  - Planner explanations identify why a resource and role were selected.
  - Tests cover the normal Learn → Practice → Review / Reinforcement resource path and invalid substitutions.

## `PLN-006` — Daily Fragmentation Control

- Priority: `P1`
- Status: `TODO`
- Problem: Unnecessary 20–30 minute fragments and frequent subject changes increase setup cost and reduce focus, even when the daily minute total fits.
- Desired outcome: Daily plans use coherent blocks and minimize unnecessary subject switching while retaining required review and fitting real capacity.
- Acceptance criteria:
  - Fragmentation and subject-switch count have explicit definitions.
  - The PLN-001 baseline—25 Mon–Sat blocks, 19 planned switches, and five observed actual switches—is retained as a before-state for simulations.
  - The planner has documented minimum block and split rules by study type/stage.
  - Avoidable 20–30 minute fragments are reduced without concealing capacity shortfalls.
  - Subject continuity is an explicit planning objective, subordinate to prerequisites, safety, and user intent.
  - Necessary short review activities remain possible and explainable.
  - Before/after simulations report fragment count, switch count, capacity fit, affected tasks, and whether a different-subject preference caused the sequence.
  - Tests cover tight capacity, mixed learning stages, due reviews, partial tasks, and user-fixed ordering.

## `PLN-007` — Planner Decision Trace

- Priority: `P1`
- Status: `TODO`
- Problem: A plan cannot be trusted or debugged when placements, moves, duration changes, backlog, carryover, and the effects of extra study lack a durable reason.
- Desired outcome: Every material planner decision has a human-understandable explanation backed by structured trace data.
- Acceptance criteria:
  - Every task placement records why the task is scheduled on that day.
  - Every move records origin, destination, trigger, reason, and relevant constraints.
  - Every duration change records the prior value, new value, and policy/evidence used.
  - Every backlog and carryover decision records why the work was not kept in place.
  - The trace states whether extra study, substitution, capacity, learning stage, or resource availability affected the decision.
  - No task can silently disappear; cancellation or removal requires an explicit, auditable transition.
  - Explanations are deterministic for the same decision evidence and avoid unsupported claims.
  - Traces are user-scoped and do not expose another user's data.

## `PLN-008` — Planner Simulation Suite

- Priority: `P1`
- Status: `TODO`
- Problem: Unit tests alone do not show that full-week plans remain sensible across realistic behavior changes and interacting edge cases.
- Desired outcome: A repeatable suite evaluates planner outcomes against real Esra scenarios and synthetic edge cases before production behavior changes.
- Acceptance criteria:
  - Sanitized or approved real Esra scenarios cover the failures and ambiguities found by `PLN-001`.
  - Synthetic cases cover extra study, confirmed substitution, carryover, capacity changes, missed days, partial work, duration error, resource gaps, stage prerequisites, fragmentation, and stale proposals.
  - Expected outcomes assert the planner invariants, not only snapshot shape.
  - The same input and version produce the same decision wherever determinism is required.
  - Failures display a useful decision trace and changed-task summary.
  - The suite can compare candidate behavior with the current planner without production writes.
  - P0 regressions block release.

## `PLN-009` — Shadow Evaluation

- Priority: `P1`
- Status: `TODO`
- Problem: A candidate planner cannot be judged safely from isolated tests or by applying unproven decisions to the real plan.
- Desired outcome: Candidate planning behavior is compared with the current production planner using real inputs while the candidate remains non-authoritative and does not mutate the real plan.
- Acceptance criteria:
  - Shadow execution is read-only for the real plan and cannot call an apply path.
  - Current and candidate behavior are compared on the same eligible snapshot and versioned inputs.
  - Comparison includes invariant violations, changed-task count, unexplained decisions, fragmentation, subject switches, backlog, carryover, duration fit, and execution-related metrics where available.
  - Candidate proposals and validation results are reviewable without exposing secrets or cross-user data.
  - Stale, incomplete, or ownership-mismatched snapshots are rejected.
  - Promotion thresholds and the observation window are defined before evaluation begins.
  - Any P0 invariant violation blocks promotion.

## `PLN-010` — Controlled Production Rollout

- Priority: `P1`
- Status: `TODO`
- Problem: Even a tested planner change can cause real-world plan or accounting failures when introduced without limited scope, verification, observability, and a stop path.
- Desired outcome: Approved planning behavior reaches production through explicit gates and demonstrates seven days of normal Esra usage without planner-caused manual database repair.
- Acceptance criteria:
  - `PLN-001` through `PLN-009` meet their required completion and promotion gates.
  - The release follows [RELEASE_PROCESS.md](RELEASE_PROCESS.md), including explicit scope, migration/deploy review where relevant, verification, and rollback/disable strategy.
  - Initial production exposure is limited to the approved user and scope.
  - Planner decisions, failures, moves, and manual repair events are observable.
  - Stop conditions and the responsible decision maker are named before rollout.
  - Seven consecutive days of normal Esra usage complete without manual database repair caused by planner behavior.
  - No P0 planner invariant is violated during the observation window.
  - Real-user behavior and explanations are reviewed before broader expansion.

## Definition of Done

A feature is not done because code exists. `DONE` requires the relevant combination of:

- problem and specification defined;
- implementation complete;
- automated tests pass;
- production or release verification complete;
- observability available;
- real user behavior verified.

For each item, the completion note must state which evidence applies, link to it, and explain any element that is legitimately not applicable. P0 work cannot waive safety verification. If required evidence is missing, the item remains `IN_PROGRESS` or `BLOCKED`, not `DONE`.

## Backlog maintenance

- New work receives a stable ID, priority, problem, desired outcome, acceptance criteria, and status.
- Changes to scope or criteria are recorded in version control; completed criteria are not rewritten to make an item appear done.
- The [current sprint](CURRENT_SPRINT.md) must agree with this file's status and ordering.
- Milestone sequencing belongs in [ROADMAP.md](ROADMAP.md), not in ad hoc issue lists.
- Metric impact should reference [METRICS.md](METRICS.md); architectural impact should reference [ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md).
