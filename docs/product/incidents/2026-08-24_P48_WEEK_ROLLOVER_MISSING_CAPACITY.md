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

The week generator now distinguishes a missing capacity source from a legitimate academic gap.

A positive weekly strategy target with neither recurring availability nor explicit current-week capacity throws `P48_CAPACITY_SOURCE_MISSING`.

## Safety

- No previous-week capacity is automatically copied forward.
- No availability times are invented.
- No production user data has been mutated as part of diagnosis.
- Production recovery requires explicit approval.

## Follow-up

The affected user needs an intentional capacity source for 2026-08-24 through 2026-08-30 before the weekly plan is regenerated.
