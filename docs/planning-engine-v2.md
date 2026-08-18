# KPSS Coach — Planning Engine V2

Status: Draft
Version: V2 Foundation
Date: 2026-08-18

## 1. Purpose

Planning Engine V2 is the adaptive learning and scheduling layer of KPSS Coach.

Its responsibility is not to constantly generate new schedules.

Its responsibility is to:

1. understand the learner's current academic state,
2. determine which learning activities are useful,
3. preserve an existing valid plan whenever possible,
4. repair only the parts of a plan that are actually invalid,
5. produce deterministic and explainable planning proposals,
6. validate those proposals,
7. apply approved changes atomically.

The primary product principle is:

> A stable valid plan is better than an unnecessarily optimized unstable plan.

---

## 2. Source of Truth

PostgreSQL is the system of record.

PostgreSQL owns:

- users and exam profiles,
- curriculum and canonical sequencing,
- resources and resource units,
- task lifecycle state,
- task progress,
- study sessions,
- question performance,
- learner state,
- availability and capacity,
- schedule exceptions,
- weekly plans,
- planning proposals,
- plan revisions,
- audit history.

Vector storage is semantic memory only.

It may store embeddings for:

- curriculum descriptions,
- resource sections,
- learner notes,
- misconception summaries,
- wrong-answer explanations,
- coach observations.

Vector search must never be the source of truth for:

- task dates,
- task status,
- completed minutes,
- capacity,
- ownership,
- prerequisite validity.

LLMs are interpretation and reasoning tools only.

LLMs may:

- classify free text,
- detect learning difficulties,
- summarize evidence,
- suggest learning strategies,
- explain planner decisions.

LLMs may not:

- directly update tasks,
- change planned dates,
- fabricate study history,
- change completed minutes,
- bypass validation,
- directly apply a plan.

The optimizer may only consume an immutable planning snapshot and return a proposal.

The optimizer may not mutate the database.

---

## 3. Planning Pipeline

The canonical V2 pipeline is:

EVENT
→ LEARNING EVIDENCE
→ LEARNER STATE
→ PLANNING SNAPSHOT
→ CURRENT PLAN FEASIBILITY
→ CANDIDATE GENERATION
→ CANDIDATE SCORING
→ LOCAL REPAIR OR OPTIMIZATION
→ PLAN PROPOSAL
→ VALIDATION
→ ATOMIC APPLY
→ AUDIT / EXPLANATION

Not every event requires every stage.

If the current plan remains feasible, the result may be NO_REPLAN.

---

## 4. Core Invariants

### 4.1 Stable Plan First

If the existing future plan is feasible, preserve it.

No task should move simply because newly available capacity exists.

Unused capacity is valid.

### 4.2 Minimum Necessary Change

If repair is required, modify the minimum number of tasks necessary to restore validity.

Prefer:

1. fewer moved tasks,
2. shorter move distance,
3. later-horizon changes,
4. preserving today's and tomorrow's schedule.

### 4.3 Completed Work Is Immutable

Completed tasks must not be rescheduled by automated planning.

Historical study evidence must never be rewritten to make a new plan look clean.

### 4.4 Active Work Is Immutable

An active study task must not be moved, cancelled, or replaced.

### 4.5 Partial Work Has Strong Preservation

Partially completed tasks retain their history.

Remaining workload is:

remaining_minutes =
max(estimated_minutes - completed_minutes, 0)

Lifecycle status must never be inferred only from remaining minutes.

### 4.6 No Global Repacking For Small Deviations

Small study-duration differences must not trigger a global weekly reshuffle.

### 4.7 Proposal Before Mutation

No planning algorithm may write directly to production schedule state.

All planning output must first become a PlanProposal.

### 4.8 Validation Before Apply

A proposal must pass validation before it can mutate production state.

### 4.9 Atomic Apply

An accepted plan revision must be applied within one PostgreSQL transaction.

Either all schedule mutations and audit records commit, or none do.

### 4.10 Determinism

Given the same:

- planning snapshot,
- planner version,
- scoring version,
- learner-state version,
- solver configuration,

the planner should produce the same proposal whenever practical.

---

## 5. Planning Triggers

Planning Engine V2 recognizes the following trigger families:

- STUDY_COMPLETED
- STUDY_DEVIATION
- CAPACITY_INCREASE
- CAPACITY_DECREASE
- MISSED_DAY
- MASTERY_CHANGE
- WEEKLY_REVIEW
- MANUAL_REPLAN

A trigger does not automatically mean the schedule must change.

Each trigger first asks whether the current plan remains feasible.

---

## 6. Replan Scopes

### NO_REPLAN

No schedule mutation.

Used when the current plan remains valid.

### LOCAL_CAPACITY_REPAIR

Repairs workload that no longer fits changed day capacity.

Affected area:

- changed day,
- directly overflowing tasks,
- nearest feasible future capacity.

### LOCAL_TASK_REPAIR

Repairs a task-specific scheduling invalidity.

### LEARNING_PATH_REPAIR

Changes work related to a curriculum branch when learner-state evidence invalidates the current learning path.

Unrelated subjects must remain stable.

### MISSED_DAY_REPAIR

Repairs unfinished work from a missed or substantially missed day.

### WEEKLY_REOPTIMIZATION

Global optimization of the remaining planning horizon.

Expected primarily at explicit weekly checkpoints.

### MANUAL_REPLAN

Explicit user-requested broader replanning.

---

## 7. Default Trigger → Scope Policy

STUDY_COMPLETED
→ NO_REPLAN unless plan becomes invalid

STUDY_DEVIATION
→ NO_REPLAN if remaining plan is feasible
→ LOCAL_TASK_REPAIR if repair is necessary

CAPACITY_INCREASE
→ NO_REPLAN by default

CAPACITY_DECREASE
→ NO_REPLAN if reserve absorbs change
→ LOCAL_CAPACITY_REPAIR otherwise

MISSED_DAY
→ MISSED_DAY_REPAIR

MASTERY_CHANGE
→ NO_REPLAN for minor changes
→ LEARNING_PATH_REPAIR for meaningful dependency changes

WEEKLY_REVIEW
→ WEEKLY_REOPTIMIZATION

MANUAL_REPLAN
→ MANUAL_REPLAN

---

## 8. Freeze Horizon

Planning stability increases as a task approaches execution.

### Today

Hard or near-hard frozen.

Automatic planner may only alter today when:

- current schedule is impossible,
- user explicitly changes availability,
- user explicitly requests a change,
- a hard curriculum constraint is violated.

### Tomorrow

Very high move cost.

### Two to Three Days Ahead

High move cost.

### Four to Seven Days Ahead

Normal move cost.

Completed and active work remains immutable regardless of horizon.

---

## 9. Learner State

Planning must distinguish knowledge state from calendar state.

Each learner × curriculum unit will eventually maintain evidence-derived state such as:

- mastery estimate,
- mastery confidence,
- question accuracy,
- evidence count,
- study minutes,
- average question speed,
- recent performance trend,
- last studied date,
- last retrieval date,
- memory stability,
- retrievability,
- difficulty estimate,
- misconception tags.

Unknown is not equivalent to weak.

A learner with insufficient evidence must have low confidence rather than an artificially low mastery score.

---

## 10. Planning Candidates

A planning candidate is a possible learning activity.

It is not yet a scheduled task.

Candidate types include:

- NEW_LEARNING
- CONTINUATION
- QUESTION_PRACTICE
- WRONG_REVIEW
- RETRIEVAL
- SPACED_REVIEW
- PREREQUISITE_REPAIR
- WEAKNESS_REPAIR
- MOCK_EXAM

Candidates are generated only when eligible.

Eligibility may depend on:

- prerequisite satisfaction,
- learner state,
- existing schedule,
- resource availability,
- exam horizon,
- previous completion,
- review due state.

---

## 11. Candidate Scoring

Candidate scoring answers:

> What is academically valuable to study next?

It does not decide the final calendar position.

Initial scoring dimensions may include:

- exam importance,
- mastery gap,
- prerequisite unlock value,
- forgetting risk,
- deadline urgency,
- continuity value,
- learner preference.

All scores must expose a breakdown.

Weights must be versioned configuration, not hidden magic constants.

---

## 12. Scheduling and Optimization

The scheduler answers:

> When should eligible learning activities occur?

V2 will support constraint-based optimization.

Hard constraints may include:

- daily capacity,
- weekly planning budget,
- reserve,
- unavailable dates,
- prerequisite order,
- completed-task immutability,
- active-task immutability,
- resource availability,
- exam-date boundary,
- task split policy,
- ownership isolation.

Soft objectives may include:

- learning value,
- plan stability,
- minimum moved-task count,
- minimum move distance,
- continuity,
- workload balance,
- reduced fragmentation,
- reduced unnecessary subject switching.

Plan stability is a first-class optimization objective.

---

## 13. Feasibility Before Optimization

Before creating a new schedule:

isCurrentPlanFeasible(snapshot)

must be evaluated.

If true and no learning-path repair is required:

result = NO_REPLAN

The optimizer should not be called merely to improve packing density.

---

## 14. Local Repair Before Global Replan

The system should repair the smallest affected region.

Examples:

+60 minutes today
→ no change if current plan is valid

-60 minutes today
→ move only actual overflow

small study deviation
→ no change if plan remains feasible

failed prerequisite
→ repair affected curriculum branch

missed day
→ repair missed workload and required future capacity

weekly checkpoint
→ global optimization allowed

---

## 15. Plan Proposal

Planner output must be represented as a pure proposal.

A proposal contains:

- proposal id,
- snapshot id,
- trigger,
- scope,
- moves,
- creates,
- cancellations,
- backlog changes,
- objective before,
- objective after,
- changed task count,
- hard constraint violations,
- reason codes,
- planner version,
- scoring version,
- learner-state version,
- apply recommendation.

The proposal is not authoritative until validated and applied.

---

## 16. Validation

Validation must reject proposals that violate system guarantees.

Required violation families include:

- DAILY_CAPACITY_EXCEEDED
- WEEKLY_BUDGET_EXCEEDED
- COMPLETED_TASK_MOVED
- ACTIVE_TASK_MOVED
- PREREQUISITE_VIOLATION
- INVALID_DATE
- DUPLICATE_ACTIVITY
- OWNERSHIP_MISMATCH
- MASS_CHANGE_GUARD
- SNAPSHOT_STALE

Mass-change guardrails are secondary protection.

They do not replace stable planning algorithms.

---

## 17. Atomic Execution

Validated proposals are applied through a database-owned transactional boundary.

The apply operation may mutate:

- tasks,
- weekly plan state,
- backlog/risk state,
- plan revisions,
- reschedule audit records.

If one mutation fails, the entire operation must roll back.

---

## 18. Planner Service Boundary

The future optimization service may use Python and OR-Tools CP-SAT.

Its contract is:

PlanningSnapshotV2
→ PlanProposalV1

The planner service:

- receives structured immutable input,
- performs no database reads,
- performs no database writes,
- has no production mutation credentials,
- returns proposal JSON only.

---

## 19. AI Boundary

AI is a bounded reasoning service.

Possible responsibilities:

- free-text interpretation,
- learning-gap classification,
- misconception classification,
- learning strategy suggestions,
- semantic resource retrieval,
- plan explanation.

AI output must use structured schemas.

AI recommendations become candidate/evidence inputs.

AI output never becomes an applied schedule without deterministic validation.

---

## 20. Retrieval Boundary

Semantic retrieval may use PostgreSQL pgvector.

Recommended retrieval combines:

- metadata filters,
- keyword search,
- vector similarity.

Typical retrievable items:

- resource sections,
- topic explanations,
- learner notes,
- wrong-answer explanations,
- misconception summaries.

Operational scheduling data remains structured SQL data.

---

## 21. Shadow Mode

Planning Engine V2 must initially run without mutating user schedules.

V1:
production plan

V2:
shadow proposal

Compare:

- hard constraint violations,
- moved-task count,
- stability,
- learning-value score,
- overload,
- prerequisite compliance.

V2 becomes authoritative only after regression and shadow evaluation.

---

## 22. Planning Evals

Required metrics include:

- hard constraint violations,
- unnecessary task moves,
- plan stability index,
- overload count,
- prerequisite violations,
- planned vs actual minutes,
- schedule adherence,
- completion rate,
- mastery gain,
- review-due coverage,
- replans per week,
- manual override rate,
- solver time.

Critical invariant:

hard_constraint_violation = 0

---

## 23. Golden Regression Scenarios

At minimum:

+60 capacity
→ 0 moves

-30 capacity absorbed by reserve
→ 0 moves

-90 capacity
→ minimum necessary moves

15 minutes early completion
→ 0 moves

20 minutes late but plan still fits
→ 0 moves

missed day
→ local repair

mastery increase
→ no unrelated churn

mastery decline
→ related learning-path repair only

completed task
→ immutable

active task
→ immutable

same snapshot
→ same proposal

solver failure
→ database unchanged

validator failure
→ database unchanged

RPC failure
→ database unchanged

retry
→ idempotent

large unexpected mass-change proposal
→ rejected or explicitly reviewed

---

## 24. Development Rule

Every V2 phase follows:

SPEC
→ TEST
→ IMPLEMENT
→ LOCAL VERIFY
→ REGRESSION
→ COMMIT

Planning Engine V1 remains production-safe until V2 passes shadow-mode gates.
