# P48 Planned-Credit Accounting Release

Status: APPROVED_FOR_DEPLOYMENT
Date: 2026-08-23

## Purpose

Correct P48 planner capacity accounting so planner scheduling budget is reduced by planned credit rather than total actual study.

This preserves the PLN-002 invariant that voluntary Extra Study may contribute to academic progress but must not silently consume planner capacity or displace unrelated planned work.

## Linked backlog

- PLN-002 — Study Intent Semantics
- PLN-003 — Study Block Duration Policy (implementation present in artifact but production-authoritative activation explicitly excluded)

## Reviewed commits

- Repository release candidate: `7dbf649`
- Behavioral implementation: `b206c8d`

## Production deployment scope

Edge Functions:
- `app-api`
- `scheduler-worker`
- `telegram-webhook`

No database migration is included in this release.

## Behavioral change

Before:
`planningCapacity - totalActualStudy`

After:
`planningCapacity - plannedCreditByDate`

`actualByResource` remains available for academic/resource progress accounting.

Extra Study with `planned_credit_minutes = 0` therefore does not consume P48 planner scheduling budget.

## Explicit exclusions

- No canonical `learning_stage` / `blockClass` production activation.
- No inference of learning stage from `work_mode` or resource role.
- No new scheduler or trigger.
- No historical data repair.
- No synthetic Esra activity.
- No capacity mutation based on voluntary over-capacity study.
- No database migration.

## Risk classification

Planner/accounting mutation + Edge production.

Primary invariants at risk:
- Extra Study must not silently substitute for or remove planned work.
- User intent must remain authoritative.
- Today work must not disappear through implicit replanning.
- Actual study and planner-capacity accounting must remain separate.

## Verification evidence

- Non-integration regression: `632/632` across `92/92` files.
- Integration/RLS: `101/101` across `10/10` files.
- TypeScript typecheck: PASS.
- P48 roadmap suite: `11/11` PASS.
- Planning bundle source sync: verified.
- Planning V2 shadow safety: `0` real mutations detected.
- Planned-study authenticated natural-use acceptance: PASS on 2026-08-23.
- Extra-study authenticated natural-use acceptance: pending.

## Production verification

After deployment, use read-only and user-scoped verification.
Do not create synthetic Esra study activity to force acceptance.

Success signals:
- Existing plan and tasks remain present.
- No unexpected plan revision or reschedule event.
- No `study_deviation` caused by normal study completion.
- Natural Extra Study records `planned_credit_minutes = 0` and does not displace unrelated planned work.

## Stop conditions

Immediately stop or contain the release if any of the following occurs:
- silent task disappearance;
- unexpected task movement;
- Extra Study consuming planned capacity or substituting without confirmation;
- unexpected mass replanning;
- planner-caused manual database repair;
- ownership or cross-user anomaly.

## Rollback / recovery

Return the affected Edge Functions to the last known safe deployed revision if a stop condition occurs.
Preserve audit evidence before corrective mutation.
Do not perform ad-hoc production SQL repair.

## Observation / close

Deployment does not close PLN-002 or PLN-003.
PLN-002 remains `IN_PROGRESS` until natural Extra Study acceptance is observed.
PLN-003 duration-policy activation remains separately gated and is not authorized by this release.

## Approval

Release owner: Melih
Release approver: Melih — explicit production deployment approval granted on 2026-08-23
