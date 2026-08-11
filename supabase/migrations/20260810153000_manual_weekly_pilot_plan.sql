begin;

alter table public.tasks
  add column if not exists work_mode text null;

alter table public.tasks
  drop constraint if exists tasks_work_mode_valid;

alter table public.tasks
  add constraint tasks_work_mode_valid
  check (
    work_mode is null or work_mode in (
      'video', 'book', 'notes', 'questions', 'mock', 'review', 'other'
    )
  );

create or replace function public.replace_manual_weekly_plan(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_profile public.exam_profiles;
  v_plan public.weekly_plans;
  v_week_start date := (p_payload ->> 'weekStartDate')::date;
  v_week_end date := v_week_start + 6;
  v_available integer := (p_payload ->> 'availableMinutes')::integer;
  v_block jsonb;
  v_subject public.subjects;
  v_task public.tasks;
  v_planned integer;
  v_preserved integer;
  v_inserted integer := 0;
  v_work_mode text;
  v_minutes integer;
  v_date date;
  v_resource_id uuid;
  v_title text;
  v_description text;
begin
  if v_user is null then raise exception 'UNAUTHORIZED'; end if;
  if v_week_start is null or extract(isodow from v_week_start) <> 1 then
    raise exception 'INVALID_WEEK_START';
  end if;
  if v_available is null or v_available <= 0 then
    raise exception 'NO_WEEKLY_AVAILABILITY';
  end if;

  select * into v_profile
  from public.exam_profiles
  where user_id = v_user and status = 'active'
  limit 1;
  if not found then raise exception 'NO_ACTIVE_EXAM_PROFILE'; end if;

  select * into v_plan
  from public.weekly_plans
  where user_id = v_user
    and exam_profile_id = v_profile.id
    and week_start_date = v_week_start
    and status = 'active'
  for update;

  if not found then
    insert into public.weekly_plans(
      user_id, exam_profile_id, week_start_date, week_end_date,
      available_minutes, planning_budget_minutes, planned_minutes,
      status, generation_version
    ) values (
      v_user, v_profile.id, v_week_start, v_week_end,
      v_available, v_available, 0,
      'active', 1
    ) returning * into v_plan;
  end if;

  -- Replacing the manual plan must never erase work that has already started.
  update public.tasks t
  set status = 'cancelled'
  where t.user_id = v_user
    and t.weekly_plan_id = v_plan.id
    and t.status in ('planned', 'ready', 'rescheduled')
    and not exists (
      select 1
      from public.task_progress p
      where p.task_id = t.id
        and p.user_id = v_user
        and (p.completed_minutes > 0 or p.actual_study_minutes > 0)
    );

  select coalesce(sum(t.estimated_minutes), 0)::integer into v_preserved
  from public.tasks t
  where t.user_id = v_user
    and t.weekly_plan_id = v_plan.id
    and t.status not in ('cancelled', 'missed');

  for v_block in
    select value from jsonb_array_elements(coalesce(p_payload -> 'blocks', '[]'::jsonb))
  loop
    v_date := (v_block ->> 'plannedDate')::date;
    v_minutes := (v_block ->> 'estimatedMinutes')::integer;
    v_work_mode := nullif(v_block ->> 'workMode', '');
    v_resource_id := nullif(v_block ->> 'resourceId', '')::uuid;
    v_title := btrim(coalesce(v_block ->> 'title', ''));
    v_description := nullif(btrim(coalesce(v_block ->> 'description', '')), '');

    if v_date is null or v_date < v_week_start or v_date > v_week_end then
      raise exception 'INVALID_MANUAL_PLAN_DATE';
    end if;
    if v_minutes is null or v_minutes <= 0 or v_minutes > 480 then
      raise exception 'INVALID_MANUAL_PLAN_MINUTES';
    end if;
    if v_work_mode not in ('video', 'book', 'notes', 'questions', 'mock', 'review', 'other') then
      raise exception 'INVALID_WORK_MODE';
    end if;
    if v_title = '' then raise exception 'INVALID_MANUAL_PLAN_TITLE'; end if;

    select s.* into v_subject
    from public.subjects s
    join public.user_subjects us on us.subject_id = s.id
    where s.id = (v_block ->> 'subjectId')::uuid
      and us.user_id = v_user
      and us.exam_profile_id = v_profile.id
      and us.status = 'active'
    limit 1;
    if not found then raise exception 'INVALID_MANUAL_PLAN_SUBJECT'; end if;

    if v_resource_id is not null then
      perform 1
      from public.resources
      where id = v_resource_id
        and user_id = v_user
        and exam_profile_id = v_profile.id
        and subject_id = v_subject.id
        and status = 'active';
      if not found then raise exception 'INVALID_MANUAL_PLAN_RESOURCE'; end if;
    end if;

    insert into public.tasks(
      user_id, exam_profile_id, weekly_plan_id, subject_id,
      curriculum_node_id, resource_id, carried_from_task_id,
      task_type, work_mode, title, description, planned_date,
      estimated_minutes, importance, priority_score, status,
      source_reason, dedupe_key
    ) values (
      v_user, v_profile.id, v_plan.id, v_subject.id,
      null, v_resource_id, null,
      'custom', v_work_mode, v_title, v_description, v_date,
      v_minutes, 'important', 60, 'ready',
      'manual', 'manual|' || gen_random_uuid()::text
    ) returning * into v_task;

    insert into public.task_progress(task_id, user_id, completed_minutes, actual_study_minutes)
    values(v_task.id, v_user, 0, 0)
    on conflict(task_id) do nothing;

    v_inserted := v_inserted + 1;
  end loop;

  select coalesce(sum(t.estimated_minutes), 0)::integer into v_planned
  from public.tasks t
  where t.user_id = v_user
    and t.weekly_plan_id = v_plan.id
    and t.status not in ('cancelled', 'missed');

  if v_planned > v_available then
    raise exception 'MANUAL_PLAN_OVER_CAPACITY';
  end if;

  update public.weekly_plans
  set available_minutes = v_available,
      planning_budget_minutes = v_available,
      planned_minutes = v_planned,
      generation_version = generation_version + 1
  where id = v_plan.id
  returning * into v_plan;

  return jsonb_build_object(
    'weeklyPlanId', v_plan.id,
    'insertedTaskCount', v_inserted,
    'preservedMinutes', v_preserved,
    'plannedMinutes', v_planned,
    'availableMinutes', v_available
  );
end;
$$;

revoke all on function public.replace_manual_weekly_plan(jsonb) from public, anon;
grant execute on function public.replace_manual_weekly_plan(jsonb) to authenticated;

-- Telegram must be able to mark a manually planned item complete even when it
-- finishes faster than the original estimate. Completing the task preserves
-- actual_study_minutes while setting planned progress to 100%, which lets the
-- study-deviation replan detect that time was gained.
create or replace function public.telegram_complete_task(
  p_user_id uuid,
  p_task_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  return public.complete_task(p_task_id);
end;
$$;

revoke all on function public.telegram_complete_task(uuid, uuid) from public, anon, authenticated;
grant execute on function public.telegram_complete_task(uuid, uuid) to service_role;

commit;
