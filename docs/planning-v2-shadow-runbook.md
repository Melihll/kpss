# Planning V2 production shadow runbook

Production shadow means: **read real planning state, write only the three
Planning V2 shadow tables**. It never applies a proposal or changes V1 plans.

Do not execute this runbook until the planned production-shadow session.

## Safe order

1. Confirm `main` is clean, current, and contains the reviewed shadow commits.
2. Run the pre-deployment gate:

   ```powershell
   pnpm test:planning-v2-shadow
   pnpm test:planning-v2-shadow-safety
   pnpm exec vitest run supabase/functions/planning-v2-shadow/handler.test.ts
   pnpm exec vitest run packages/domain/src/planning-v2
   pnpm --filter @kpss-coach/domain typecheck
   pnpm --filter @kpss-coach/domain build
   git diff --exit-code HEAD -- supabase/functions/_shared/planning.bundle.js
   ```

3. Re-review only
   `20260818190000_create_planning_v2_shadow_persistence.sql`. Confirm it is
   additive and contains no V1 table mutations, scheduler changes, cron, or
   automatic invocation hooks.
4. Apply **only** that reviewed shadow migration using the normal controlled
   production migration procedure. Do not link a new project, push unrelated
   migrations, or expose credentials.
5. Verify the following tables exist and have RLS enabled:

   ```sql
   select relname, relrowsecurity
   from pg_class
   where relnamespace = 'public'::regnamespace
     and relname in (
       'learner_unit_states_v2',
       'planning_v2_snapshots',
       'planning_v2_proposals'
     )
   order by relname;
   ```

6. Deploy **only** the manual `planning-v2-shadow` Edge Function. Do not wire it
   to app-api, Telegram, study completion, capacity hooks, scheduler, or cron.
7. Before the first call, record read-only control values for the developer/test
   profile and current weekly plan. Use IDs resolved from the authenticated
   developer/test account, not arbitrary or fabricated user data:

   ```sql
   select id, generation_version, available_minutes,
          planning_budget_minutes, planned_minutes, status, updated_at
   from public.weekly_plans
   where id = :weekly_plan_id;

   select count(*) as task_count,
          max(updated_at) as latest_task_update
   from public.tasks
   where weekly_plan_id = :weekly_plan_id;

   select count(*) as revision_count,
          max(created_at) as latest_revision
   from public.plan_revisions
   where weekly_plan_id = :weekly_plan_id;
   ```

8. Invoke the function manually with the developer/test user's access token and
   owned active profile:

   ```json
   {
     "examProfileId": "<owned developer/test profile>",
     "trigger": "STUDY_DEVIATION",
     "currentDate": "YYYY-MM-DD"
   }
   ```

9. Inspect the returned sanitized summary and the matching
   `planning_v2_snapshots` and `planning_v2_proposals` rows. Confirm ownership,
   snapshot hash, decision, validation, changed-task count, and idempotency keys.
10. Repeat the identical invocation once. Confirm it returns the same snapshot
    identity/hash and creates no duplicate snapshot or proposal rows.
11. Re-run the three read-only control queries from step 7. Prove that the
    `weekly_plans` row, task count/latest update, and plan revision count/latest
    revision are unchanged.
12. Only after all checks pass, consider a separate Esra shadow evaluation.
    Obtain the real owned profile through the authenticated workflow; do not
    fabricate activity or alter data. Repeat the before/after controls.

## Stop conditions

Stop immediately if authentication or ownership behaves unexpectedly, a V1
control value changes, duplicate shadow rows appear, validation is inconsistent,
or any write occurs outside `planning_v2_snapshots` and
`planning_v2_proposals`. Keep V2 apply disabled: do not approve proposals and do
not call `apply_plan_revision()`.
