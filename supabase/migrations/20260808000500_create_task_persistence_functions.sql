create function public.persist_weekly_plan(p_plan jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  profile_id uuid := (p_plan ->> 'examProfileId')::uuid;
  week_start date := (p_plan ->> 'weekStartDate')::date;
  plan_id uuid;
  task_json jsonb;
  task_id uuid;
  unit_value jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || profile_id::text || week_start::text, 0));

  select id into plan_id
  from public.weekly_plans
  where exam_profile_id = profile_id
    and week_start_date = week_start
    and status = 'active'
  limit 1;

  if plan_id is not null then
    return jsonb_build_object('weekly_plan_id', plan_id, 'created', false);
  end if;

  insert into public.weekly_plans (
    user_id, exam_profile_id, week_start_date, week_end_date,
    available_minutes, planning_budget_minutes, planned_minutes,
    status, generation_version
  ) values (
    auth.uid(), profile_id, week_start, (p_plan ->> 'weekEndDate')::date,
    (p_plan ->> 'availableMinutes')::integer,
    (p_plan ->> 'planningBudgetMinutes')::integer,
    (p_plan ->> 'plannedMinutes')::integer,
    'active', (p_plan ->> 'generationVersion')::integer
  ) returning id into plan_id;

  for task_json in select value from jsonb_array_elements(coalesce(p_plan -> 'tasks', '[]'::jsonb))
  loop
    insert into public.tasks (
      user_id, exam_profile_id, weekly_plan_id, subject_id,
      curriculum_node_id, resource_id, carried_from_task_id,
      task_type, title, description, planned_date, estimated_minutes,
      importance, priority_score, status, source_reason, dedupe_key
    ) values (
      auth.uid(), profile_id, plan_id, (task_json ->> 'subjectId')::uuid,
      nullif(task_json ->> 'curriculumNodeId', '')::uuid,
      nullif(task_json ->> 'resourceId', '')::uuid,
      nullif(task_json ->> 'carriedFromTaskId', '')::uuid,
      task_json ->> 'taskType', task_json ->> 'title', task_json ->> 'description',
      (task_json ->> 'plannedDate')::date, (task_json ->> 'estimatedMinutes')::integer,
      task_json ->> 'importance', (task_json ->> 'priorityScore')::integer,
      'ready', task_json ->> 'sourceReason', task_json ->> 'dedupeKey'
    ) returning id into task_id;

    insert into public.task_progress (task_id, user_id, completed_minutes)
    values (task_id, auth.uid(), 0);

    for unit_value in select value from jsonb_array_elements(coalesce(task_json -> 'resourceUnitIds', '[]'::jsonb))
    loop
      insert into public.task_resource_units (user_id, task_id, resource_unit_id)
      values (auth.uid(), task_id, (unit_value #>> '{}')::uuid);
    end loop;
  end loop;

  return jsonb_build_object('weekly_plan_id', plan_id, 'created', true);
end;
$$;

create function public.sync_task_status(p_task_id uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.tasks;
  unit_total integer;
  completed_units integer;
  progress_minutes integer;
  next_status text;
begin
  select * into target from public.tasks where id = p_task_id and user_id = auth.uid();
  if not found then raise exception 'TASK_NOT_FOUND'; end if;

  select count(*), count(*) filter (where status = 'completed')
  into unit_total, completed_units
  from public.task_resource_units
  where task_id = p_task_id and user_id = auth.uid();

  select coalesce(completed_minutes, 0) into progress_minutes
  from public.task_progress where task_id = p_task_id and user_id = auth.uid();
  progress_minutes := coalesce(progress_minutes, 0);

  if unit_total > 0 and completed_units = unit_total then
    next_status := 'completed';
  elsif completed_units > 0 or progress_minutes > 0 then
    next_status := 'partially_completed';
  elsif target.status in ('in_progress', 'ready', 'planned', 'rescheduled') then
    next_status := target.status;
  else
    next_status := target.status;
  end if;

  update public.tasks
  set status = next_status,
      completed_at = case when next_status = 'completed' then coalesce(completed_at, now()) else null end
  where id = p_task_id and user_id = auth.uid();
  return next_status;
end;
$$;

create function public.start_task(p_task_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.tasks;
begin
  update public.tasks
  set status = 'in_progress'
  where id = p_task_id and user_id = auth.uid()
    and status in ('planned', 'ready', 'partially_completed', 'rescheduled')
  returning * into target;
  if not found then
    select * into target from public.tasks where id = p_task_id and user_id = auth.uid();
    if not found then raise exception 'TASK_NOT_FOUND'; end if;
  end if;

  if target.task_type = 'learn_topic' and target.curriculum_node_id is not null then
    update public.topic_progress
    set state = 'learning',
        first_started_at = coalesce(first_started_at, now())
    where user_id = auth.uid()
      and exam_profile_id = target.exam_profile_id
      and curriculum_node_id = target.curriculum_node_id
      and state = 'not_started';
  end if;

  return jsonb_build_object('task_id', target.id, 'status', target.status);
end;
$$;

create function public.update_task_progress(p_task_id uuid, p_completed_minutes integer)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.tasks;
  next_status text;
begin
  if p_completed_minutes is null or p_completed_minutes < 0 then
    raise exception 'INVALID_TASK_PROGRESS';
  end if;
  select * into target from public.tasks where id = p_task_id and user_id = auth.uid();
  if not found then raise exception 'TASK_NOT_FOUND'; end if;

  insert into public.task_progress (task_id, user_id, completed_minutes)
  values (p_task_id, auth.uid(), p_completed_minutes)
  on conflict (task_id) do update set completed_minutes = excluded.completed_minutes;

  if p_completed_minutes >= target.estimated_minutes
    and not exists (select 1 from public.task_resource_units where task_id = p_task_id and status = 'pending') then
    update public.tasks set status = 'completed', completed_at = coalesce(completed_at, now())
    where id = p_task_id and user_id = auth.uid();
    if target.task_type = 'learn_topic' and target.curriculum_node_id is not null then
      update public.topic_progress set state = 'practicing'
      where user_id = auth.uid()
        and exam_profile_id = target.exam_profile_id
        and curriculum_node_id = target.curriculum_node_id
        and state in ('not_started', 'learning');
    end if;
    next_status := 'completed';
  else
    next_status := public.sync_task_status(p_task_id);
  end if;
  return jsonb_build_object('task_id', p_task_id, 'status', next_status, 'completed_minutes', p_completed_minutes);
end;
$$;

create function public.complete_task_unit(p_task_id uuid, p_resource_unit_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  changed integer;
  next_status text;
begin
  update public.task_resource_units
  set status = 'completed', completed_at = coalesce(completed_at, now())
  where task_id = p_task_id
    and resource_unit_id = p_resource_unit_id
    and user_id = auth.uid()
    and status <> 'completed';
  get diagnostics changed = row_count;

  if not exists (
    select 1 from public.task_resource_units
    where task_id = p_task_id and resource_unit_id = p_resource_unit_id and user_id = auth.uid()
  ) then raise exception 'TASK_NOT_FOUND'; end if;

  insert into public.resource_unit_progress (
    user_id, resource_unit_id, status, completed_at, attempt_count
  ) values (
    auth.uid(), p_resource_unit_id, 'completed', now(), 1
  )
  on conflict (user_id, resource_unit_id) do update set
    status = 'completed',
    completed_at = coalesce(public.resource_unit_progress.completed_at, now()),
    attempt_count = case
      when public.resource_unit_progress.status = 'completed' then public.resource_unit_progress.attempt_count
      else public.resource_unit_progress.attempt_count + 1
    end;

  next_status := public.sync_task_status(p_task_id);
  return jsonb_build_object('task_id', p_task_id, 'status', next_status, 'changed', changed = 1);
end;
$$;

create function public.complete_task(p_task_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.tasks;
begin
  select * into target from public.tasks where id = p_task_id and user_id = auth.uid();
  if not found then raise exception 'TASK_NOT_FOUND'; end if;
  if exists (
    select 1 from public.task_resource_units
    where task_id = p_task_id and user_id = auth.uid() and status = 'pending'
  ) then raise exception 'TASK_HAS_PENDING_UNITS'; end if;

  update public.tasks set status = 'completed', completed_at = coalesce(completed_at, now())
  where id = p_task_id and user_id = auth.uid();
  insert into public.task_progress (task_id, user_id, completed_minutes)
  values (p_task_id, auth.uid(), target.estimated_minutes)
  on conflict (task_id) do update set
    completed_minutes = greatest(public.task_progress.completed_minutes, excluded.completed_minutes);

  if target.task_type = 'learn_topic' and target.curriculum_node_id is not null then
    update public.topic_progress set state = 'practicing'
    where user_id = auth.uid()
      and exam_profile_id = target.exam_profile_id
      and curriculum_node_id = target.curriculum_node_id
      and state in ('not_started', 'learning');
  end if;
  return jsonb_build_object('task_id', p_task_id, 'status', 'completed');
end;
$$;

revoke all on function public.persist_weekly_plan(jsonb) from public, anon;
revoke all on function public.sync_task_status(uuid) from public, anon;
revoke all on function public.start_task(uuid) from public, anon;
revoke all on function public.update_task_progress(uuid, integer) from public, anon;
revoke all on function public.complete_task_unit(uuid, uuid) from public, anon;
revoke all on function public.complete_task(uuid) from public, anon;
grant execute on function public.persist_weekly_plan(jsonb) to authenticated;
grant execute on function public.sync_task_status(uuid) to authenticated;
grant execute on function public.start_task(uuid) to authenticated;
grant execute on function public.update_task_progress(uuid, integer) to authenticated;
grant execute on function public.complete_task_unit(uuid, uuid) to authenticated;
grant execute on function public.complete_task(uuid) to authenticated;
