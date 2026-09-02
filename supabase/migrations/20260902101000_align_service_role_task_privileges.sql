begin;

-- Reproduce the hosted Supabase privilege baseline deterministically after
-- local database resets.
--
-- Production already grants these CRUD privileges to service_role. This
-- migration therefore aligns migration-rebuilt environments with the current
-- hosted authority model; it does not broaden the existing production model.

grant select, insert, update, delete
on table
  public.weekly_plans,
  public.tasks,
  public.task_resource_units,
  public.task_progress
to service_role;

commit;
