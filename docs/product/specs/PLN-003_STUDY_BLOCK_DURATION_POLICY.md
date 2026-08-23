# PLN-003 — Study Block Duration Policy

Status: `IN_PROGRESS — IMPLEMENTED_LOCAL_VERIFIED — RELEASE_PENDING`

Last updated: 2026-08-23

Milestone: `M1 — Planning Correctness & Study Model`

Implementation state (2026-08-23): `pln-003-v1` is implemented and locally verified.
The policy is centralized and versioned, AI recommendations are advisory-only and deterministically normalized, genuine remainders and explicit user overrides are preserved, and Extra Study does not consume planner scheduling budget.
Production activation remains intentionally limited because normal P48 inputs do not yet provide canonical `learning_stage` / `blockClass` metadata. PLN-003 does not infer learning stage from `work_mode` or resource role; that semantic plumbing belongs to PLN-004 and related backlog work.
No PLN-003 production rollout has occurred.

This specification and its local verification evidence do not by themselves authorize production rollout, production data mutation, or historical-data rewrite.

## 1. Problem

The current planner can produce study tasks whose duration is mechanically valid but pedagogically weak or difficult to explain.

The duration policy must separate:

1. a subject's total daily study need;
2. one individual study block's duration;
3. genuine remaining work from newly generated work;
4. planner capacity from actual study time;
5. voluntary over-capacity study from plan mutation; and
6. AI recommendation from deterministic scheduling authority.

The governing rules are:

> A study block duration is not the same thing as a subject's daily study total.

> Daily capacity is the planner's scheduling budget, not the student's execution ceiling.

> AI may recommend duration. Deterministic policy owns the final schedulable duration decision.

## 2. Relationship to PLN-001 and PLN-002

PLN-001 showed that the audited plan was fragmented and that planned switching differed materially from actual study behavior.

PLN-002 established Planned Study, Extra Study, Substitution, and Carryover semantics.

PLN-003 does not redefine those semantics.

PLN-003 answers:

> Given a legitimate study need, what duration should one schedulable study block have?

Learning-stage semantics are completed by PLN-004.

Resource-role semantics are completed by PLN-005.

Subject ordering and unnecessary switching are primarily owned by PLN-006.
## 3. Subject daily need vs. block duration

A subject's total daily study need and the duration of one individual study block are different concepts.

A subject may legitimately receive multiple coherent study blocks in the same day.

Example: Mathematics may require 75 minutes of new-topic learning, 55 minutes of primary practice, and 25 minutes of error review.

The subject daily total is therefore 155 minutes.

PLN-003 does not impose a 60- or 90-minute daily maximum on a subject.

A subject may receive 120, 150, 180, or more minutes in one day when learning need and scheduling context justify it.

The policy constrains individual study blocks, not the total daily effort allowed for a subject.

For example, a 180-minute Mathematics day may consist of:

- Learn: 80 minutes
- Practice: 65 minutes
- Error Review: 35 minutes

## 4. Remainder policy

A genuine remainder is different from newly generated short work.

Example:

- Original practice obligation: 50 minutes
- Already completed: 34 minutes
- True remaining obligation: 16 minutes

A genuine 16-minute remainder is valid.

Newly generated 16-minute primary practice is invalid by default.

A genuine 16-minute remainder from an existing obligation is valid.

The duration engine should preserve the true remaining amount and may emit isRemainder=true and mergeHint=true.

mergeHint is advisory metadata only. It does not authorize task movement.

PLN-006 may later use this hint to reduce unnecessary same-subject fragmentation.

## 5. AI-assisted duration recommendation

AI is advisory. It may recommend a duration, confidence score, and rationale.

AI must not directly write task duration into the approved plan or bypass deterministic policy.

Example:

- Duration class: new_learning
- Policy minimum: 60
- Policy preferred: 75
- Policy maximum: 90
- AI recommendation: 82
- Deterministic normalized result: 80

If AI recommends 17 minutes for new_learning, the deterministic policy raises the result to the minimum viable duration.

If AI recommends 140 minutes for one new_learning block, the deterministic policy caps that block at the configured maximum.

Additional legitimate study need may become another coherent block rather than expanding one block without limit.

If AI is unavailable, invalid, or below the configured confidence threshold, the planner must continue using deterministic policy defaults.

AI failure must never prevent normal plan generation.

The final scheduling authority remains deterministic.

## 6. Capacity interaction policy

Daily capacity is the planner's scheduling budget, not the student's execution ceiling.

Actual study may legitimately exceed nominal daily capacity.

Example:

- Nominal daily capacity: 300 minutes
- Approved planned work: 300 minutes
- Voluntary additional study: 120 minutes
- Total actual study: 420 minutes

The correct interpretation is 300 planned minutes and 420 actual minutes.

The extra 120 actual minutes do not automatically become a capacity change or permission to modify the approved plan.

Over-capacity actual study must not automatically:

- reduce another subject
- remove another task
- backlog another task
- reschedule another task
- cancel another task
- create an implicit study_deviation plan revision
- create a capacity-change proposal
- change the user's stored daily capacity
- learn a new permanent capacity from one unusually productive day

Capacity overage by itself has no plan-mutation consequence.

However, real academic progress created by that study may affect future study-need calculations.

The causal distinction is important:

- Incorrect: capacity exceeded -> reduce future workload
- Correct: real learning progress increased -> future learning need may change

Any change to an already-approved active plan remains governed by explicit product semantics and confirmation requirements.

## 7. Initial duration classes

These ranges are product-policy starting points, not universal scientific limits.

| Duration class | Minimum | Preferred | Maximum | Typical purpose |
| --- | ---: | ---: | ---: | --- |
| new_learning | 60 | 75 | 90 | New topic learning, instruction and initial examples |
| guided_practice | 45 | 60 | 75 | Worked examples and scaffolded application |
| primary_practice | 40 | 50 | 60 | Main question-bank or problem-solving work |
| reinforcement | 40 | 50 | 60 | Secondary practice or reinforcement |
| error_review | 20 | 30 | 40 | Mistake analysis and misconception repair |
| spaced_review | 15 | 25 | 30 | Short review of previously learned material |

The maximum values above are block maximums, not subject-daily maximums.

These values should be centralized and versionable rather than scattered as planner magic constants.

## 8. Safety invariants

DUR-001: A subject's daily total is not capped by one block's maximum duration.
DUR-002: Newly generated work below its duration-class minimum is invalid unless an explicit exception applies.
DUR-003: A genuine remainder may be shorter than the normal class minimum.
DUR-004: Explicit user duration overrides planner optimization and is recorded as a policy deviation when needed.
DUR-005: AI recommendations are advisory and cannot bypass deterministic duration policy.
DUR-006: AI failure must not block deterministic plan generation.
DUR-007: Daily capacity constrains planner scheduling, not actual study execution.
DUR-008: Actual study above daily capacity cannot automatically mutate the user's stored capacity.
DUR-009: Over-capacity study cannot automatically reduce, backlog, cancel, remove, or reschedule unrelated planned work.
DUR-010: Over-capacity study alone cannot create an implicit study_deviation plan revision.
DUR-011: Capacity overage alone is not a valid reason to reduce future workload; only real learning evidence may affect future need.
DUR-012: Same authoritative inputs and same policy version must produce the same final duration decision.
DUR-013: PLN-002 Planned, Extra, Substitution, and Carryover semantics remain authoritative.
DUR-014: mergeHint is advisory only and cannot reorder the approved plan.

## 9. Acceptance scenarios

1. A newly generated new_learning block cannot become 16 minutes.
2. A genuine 16-minute remainder is preserved.
3. AI recommending 10 minutes for new_learning is normalized to the policy minimum.
4. AI recommending 140 minutes for one new_learning block is bounded by the policy maximum.
5. AI absence uses the deterministic preferred duration.
6. An explicit user request for 25 minutes is preserved as user_override.
7. If only 32 planner-capacity minutes remain, a new_learning block with minimum 60 is not artificially compressed to 32.
8. One subject may accumulate 120, 150, 180, or more planned daily minutes through multiple valid blocks.
9. Five-hour daily capacity plus two hours voluntary Extra Study records seven actual hours without a capacity mutation.
10. Over-capacity Extra Study does not create unrelated task reschedules or backlog transitions.
11. Over-capacity Extra Study does not create a study_deviation revision.
12. Real progress created by Extra Study remains available to later planning.
13. Same input and same policy version return the same final duration.
14. Existing PLN-002 intent and P0 safety tests continue to pass.
15. No silent plan mutation is introduced.

## 10. Non-goals

PLN-003 does not own:

- full Learn -> Practice -> Review progression
- authoritative resource-role sequencing
- exact resource selection
- subject ordering within the day
- actual merge/reordering of compatible blocks
- break timing or Pomodoro behavior
- fatigue modeling
- permanent capacity calibration from one day's behavior

These concerns belong to later backlog items unless needed for a minimal safe PLN-003 implementation.

## 11. Rollout requirements

PLN-003 follows SPEC -> TEST -> IMPLEMENT -> VERIFY -> COMMIT.

Before production rollout:

- targeted duration-policy tests must pass
- full planner and unit regression must pass
- PLN-002 intent regression must pass
- P0 safety tests must pass
- current-day task protection must pass
- no implicit plan mutation may be reintroduced
- representative schedule simulations must be reviewed

Local verification evidence (2026-08-23):

- duration-policy tests pass
- `roadmap.test.ts` passes `11/11`, including four PLN-003 duration-aware schedule scenarios
- full non-integration regression passes `632/632` across `92/92` test files
- integration/RLS regression passes `101/101`
- TypeScript typecheck passes
- V1 planning bundle is regenerated and reproducible from current domain sources
- planning V2 shadow safety reports zero real mutations
- the HTTP P48 roadmap smoke was attempted but stopped before planner assertions with local Edge `503 name resolution failed`; this is recorded as an environment limitation, not as PLN-003 schedule-policy verification evidence
