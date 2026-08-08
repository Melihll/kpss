# Phase 07A — V1 Pilot Closure

Phase 07A closes the local V1 pilot loop with persistent scheduled actions, daily-plan delivery, missing-study confirmation, deterministic weekly reporting, pilot usage metrics and one final product-chain smoke test.

## Scheduler architecture

`scheduled_actions` is a small persistent queue with `pending → processing → completed` and `failed` retry states. `generate_pilot_scheduled_actions` creates per-user actions with deterministic keys; `claim_due_scheduled_actions` uses `FOR UPDATE SKIP LOCKED` through an atomic update so concurrent workers cannot claim the same row.

V1 action types and calibration defaults are:

- `daily_plan`: 08:00 Europe/Istanbul
- `data_gap_check`: 09:00 Europe/Istanbul
- `weekly_report`: Sunday 19:00 Europe/Istanbul

One cron calls `scheduler-worker`; no per-user cron is required. The worker requires the Edge-only `SCHEDULER_WORKER_SECRET` header and uses the service role only inside the function. Missing Telegram linkage safely completes an action with delivery skipped.

## Daily plan

The worker loads the active profile and current weekly plan, calculates today's effective capacity, selects Next Best Task V2 deterministically, and sends the linked Telegram account a compact task/minute summary. `daily_plan:<user>:<date>` plus a notification reservation prevents duplicate action/message attempts.

## Data-gap detection

The previous Istanbul calendar day is checked against completed `study_sessions`; live-finished and retroactive sessions therefore use the same source of truth. If no session exists, one `data_gap_events` row is created for `user + gap_date + missing_study_confirmation`.

Telegram callbacks support:

- `Çalışmadım` → `confirmed_no_study`
- `Çalıştım — Ekle` → existing retroactive study form, then `study_added`

The authenticated API exposes open gaps and the no-study resolution. Web UI was intentionally not expanded.

## Weekly report

`weekly_reports` stores normal columns for planned/actual minutes, planned/completed tasks, questions, learned topics, completed/due revisions, backlog severity, projection status, plan status and explanation. Generation upserts `user + week_start_date`, so recomputation updates one row.

`interpretWeeklyReport` is pure TypeScript. It combines task completion, planned/actual time, backlog and projection signals into `good`, `attention` or `risk`; a single bad signal alone does not produce `risk`. Explanations are short templates and use no AI.

Endpoints:

- `GET /reports/weekly/current`
- `GET /reports/weekly/latest`
- `POST /reports/weekly/generate`

The dashboard renders a minimal “BU HAFTA” card. Scheduled weekly actions send the same summary through Telegram.

## Pilot metrics

`GET /pilot/metrics` derives current-user usage from tasks, sessions, results, revisions, schedule exceptions, replan history and risks. `recommendation_events` stores only the two otherwise-unmeasurable usages: Next Best Task and Minimum Plan, with channel and reason.

The endpoint returns daily-plan days, completion/reschedule/partial rates, planned-vs-actual ratio, recommendation usage, retroactive study, results, wrong-review/revision completion, Minimum Plan usage, schedule exceptions, replans and backlog risk count.

## RLS and idempotency

All four Phase 07 tables use RLS and explicit user ownership. Users can read only their rows; scheduler/data-gap creation remains service-only. Weekly report and recommendation writes require matching `auth.uid()`. Integration and final E2E tests verify User B cannot read User A reports, metrics or supporting domain data.

Deterministic action/report/gap constraints prevent duplicate database records. Notification reservation prioritizes no-spam behavior: an ambiguous transport failure is not blindly resent. Operators can inspect the failed action and retry deliberately if delivery confirmation is required.

## Local testing

```powershell
pnpm supabase:start
pnpm supabase:reset
$env:TELEGRAM_WEBHOOK_SECRET='local-test-secret'
$env:TELEGRAM_TRANSPORT_MODE='mock'
$env:TELEGRAM_BOT_USERNAME='local_test_bot'
$env:SCHEDULER_WORKER_SECRET='local-scheduler-secret'
pnpm supabase:functions:serve
pnpm test:phase07-http
pnpm test:v1-e2e
pnpm test:telegram
```

The final E2E covers signup through plan, recommendation, StudySession, TestResult, wrong review, mastery, revision, schedule exception, dynamic replan, Minimum Plan, projection, weekly report and pilot metrics in one User A context, plus critical User B isolation checks.

## Production cron manual steps

Production deployment is outside this phase. Later, set strong Edge secrets, deploy the worker and webhook, and configure one Supabase Cron/HTTP job to POST to `/functions/v1/scheduler-worker` with `X-Scheduler-Secret`. Configure Telegram bot credentials and webhook separately. Do not expose service-role, bot or scheduler secrets to Vite variables.

## Known limitations and readiness

Timing values are V1 pilot calibration defaults. There is no advanced notification preference UI, delivery analytics, monthly reporting, AI, photo analysis or production monitoring. The existing Vite chunk-size warning is non-blocking.

Phase 07A intentionally closes the V1 pilot loop. Production deployment, AI features, photo analysis and advanced polish are outside this phase.
