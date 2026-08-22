# KPSS Koçu Product Vision

Status: Active

Last updated: 2026-08-22

## Vision

KPSS Koçu should become a personal study operating system where the candidate does not waste time deciding what to study, and where plans adapt safely to actual study behavior while preserving user intent.

The product is not merely a task list. It should connect planning, daily execution, learning resources, study evidence, progress, and safe replanning into one dependable system.

## Core product loop

```text
Plan
→ Today
→ Study
→ Resource / Video
→ Finish
→ Progress
→ Replan
```

Each step should make the next step clearer:

- **Plan:** establish an understandable, feasible commitment.
- **Today:** present the work the candidate currently intends to do.
- **Study:** support focused execution without unnecessary decisions.
- **Resource / Video:** connect the task to the right learning material and role.
- **Finish:** record what actually happened without rewriting history.
- **Progress:** turn completed work into trustworthy learning and execution evidence.
- **Replan:** preserve valid intent and repair only what evidence makes necessary.

## Product principle

> User intent is stronger than planner optimization.

A mathematically denser plan is not better when it surprises the user, silently removes work, or changes an explicit commitment. Optimization is useful only inside the boundaries set by user intent, learning prerequisites, and production safety.

## Product promise

KPSS Koçu should help a candidate answer four questions with confidence:

1. What should I study now?
2. Why is this the right work now?
3. What did I actually complete?
4. What changed in my plan, and why?

## Current product focus

The current milestone is [M1 — Planning Correctness & Study Model](ROADMAP.md#current-milestone-m1--planning-correctness--study-model). Its goal is to make Esra's daily and weekly study plans pedagogically sensible, predictable, explainable, and safe.

M1 must be completed before major new AI, gamification, multi-user, or cosmetic dashboard work. The immediate work is [Sprint 01 — Planner Reality Audit](CURRENT_SPRINT.md), beginning with `PLN-001` only after it is explicitly started.

## Planner product invariants

These constraints are permanent product requirements:

1. Extra study is not automatic substitution.
2. New-topic learning and question solving are different study stages.
3. The planner should plan topic + learning stage + resource, not only subject/minutes.
4. Avoid unnecessary subject switching.
5. Reinforcement should not replace required initial learning.
6. Every planner decision should be explainable.
7. User intent overrides automatic planner optimization.
8. No silent task disappearance.
9. Plan mutation requires explicit approved paths.
10. Production safety and P0 guarantees remain mandatory.

Any proposal that violates an invariant is not an acceptable product improvement, even if another metric improves.

## How this source of truth is used

- [ROADMAP.md](ROADMAP.md) defines milestones, sequencing, and milestone gates.
- [PRODUCT_BACKLOG.md](PRODUCT_BACKLOG.md) defines problems, outcomes, acceptance criteria, priorities, and status.
- [CURRENT_SPRINT.md](CURRENT_SPRINT.md) identifies the single current focus and the deliberately deferred work.
- [METRICS.md](METRICS.md) defines how outcomes and safety will be measured.
- [RELEASE_PROCESS.md](RELEASE_PROCESS.md) defines the gates for production change.
- [INCIDENT_PROCESS.md](INCIDENT_PROCESS.md) defines how product and production failures are handled.
- [ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md) records the high-level boundaries that product work must respect.

When these documents conflict, safety and the planner invariants take precedence. The conflict must be resolved in the documents before implementation proceeds.
