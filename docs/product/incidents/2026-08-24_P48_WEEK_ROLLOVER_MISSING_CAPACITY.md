# P48 Week Rollover Missing Capacity Incident

Date: 2026-08-24
Status: FIX_IMPLEMENTED_LOCAL — PRODUCTION RECOVERY PENDING APPROVAL

## Impact

One active P48 user entered the 2026-08-24 week with no weekly plan. Web Today, Web Week, and Telegram all showed zero work.

## Confirmed root cause

- P48 strategy remained active with a 1,800-minute weekly target.
- `weekly_availability` contained no active recurring rows for the affected profile.
- The previous foundation week had seven date-specific daily capacity overrides totaling 1,800 minutes.
- The new week had no daily capacity overrides.
- The new week had no weekly plan.
- The scheduled `daily_plan` action still completed without error.
- `ensureP48WeekPlanForService` classified zero generated capacity as `academicGap`, hiding the missing capacity-source configuration.

## Fix

Both P48 week-generation paths now distinguish a missing capacity source from a legitimate academic gap: the scheduler/Telegram service path and the authenticated App API path.

A positive weekly strategy target with neither recurring availability nor explicit current-week capacity throws `P48_CAPACITY_SOURCE_MISSING`. The App API exposes this through the existing error contract instead of returning a false academic gap.

## Safety

- No previous-week capacity is automatically copied forward.
- No availability times are invented.
- No production user data has been mutated as part of diagnosis.
- Production recovery requires explicit approval.

## Follow-up

The affected user needs an intentional capacity source for 2026-08-24 through 2026-08-30 before the weekly plan is regenerated.

## Secondary production failure

After recovery capacity was restored, week generation reached the persistence boundary but PostgreSQL correctly rejected the generated plan with MANUAL_PLAN_OVER_CAPACITY.

The planner rounded a 1,545-minute exact capacity upward to 1,560 minutes and also rounded a 285-minute daily boundary upward to 300 minutes.

The fix preserves exact capacity as a hard upper bound. Weekly schedulable target is floored to the supported 30-minute granularity, while daily remaining capacity is never rounded upward.

The database over-capacity guard remains unchanged.

## Production recovery verification

Production recovery completed on 2026-08-24.

- Six explicit recovery capacity rows were applied for 2026-08-25 through 2026-08-30.
- Gross remaining-week capacity: 1,560 minutes.
- Reserve: 15 minutes.
- Exact planner capacity: 1,545 minutes.
- Generated weekly plan: active.
- Persisted planned workload: 1,530 minutes.
- Persisted tasks: 27.
- No task was created retroactively for 2026-08-24.
- No plan revision was created during recovery.
- Daily persisted workload stayed within every exact daily capacity boundary.
- The final 15-minute residual was intentionally left unused rather than rounded upward.

The database `MANUAL_PLAN_OVER_CAPACITY` guard remained unchanged and correctly protected production during the intermediate failed generation.
