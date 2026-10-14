begin;
-- Close indirect identity/cascade writers and revision source freshness. No existing row rewrite.

grant select on public.revision_schedules to kpss_plan_writer;

create policy kpss_plan_writer_revision_schedules_0 on public.revision_schedules for select to kpss_plan_writer using ((( SELECT auth.uid() AS uid) = user_id));

grant select on public.topic_progress to kpss_plan_writer;

create policy kpss_plan_writer_topic_progress_0 on public.topic_progress for all to kpss_plan_writer using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));

grant select on public.revision_schedules to kpss_baseline_writer;

create policy kpss_baseline_writer_revision_schedules_0 on public.revision_schedules for select to kpss_baseline_writer using ((( SELECT auth.uid() AS uid) = user_id));

grant select on public.topic_progress to kpss_baseline_writer;

create policy kpss_baseline_writer_topic_progress_0 on public.topic_progress for all to kpss_baseline_writer using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));

CREATE OR REPLACE FUNCTION kpss_s0_private.planning_inputs(p_profile uuid, p_week date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_user uuid:=public.availability_actor_uid(); v_profile public.exam_profiles; v jsonb;
begin
  if v_user is null then raise exception 'UNAUTHORIZED'; end if;
  if p_week is null or extract(isodow from p_week)<>1 then raise exception 'INVALID_WEEK_START'; end if;
  select * into v_profile from public.exam_profiles where id=p_profile and user_id=v_user and status='active' for update;
  if not found then raise exception 'NO_ACTIVE_EXAM_PROFILE'; end if;
  select jsonb_build_object(
    'profile',to_jsonb(v_profile),'today',(now() at time zone 'Europe/Istanbul')::date,'weekStart',p_week,
    'strategies',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.p48_strategy_profiles t where user_id=v_user and exam_profile_id=p_profile),
    'subjects',(select coalesce(jsonb_agg(to_jsonb(t) order by subject_id),'[]'::jsonb) from public.user_subjects t where user_id=v_user and exam_profile_id=p_profile),
    'availability',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.weekly_availability t where user_id=v_user and exam_profile_id=p_profile),
    'periods',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.calendar_periods t where user_id=v_user and exam_profile_id=p_profile),
    'exceptions',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.schedule_exceptions t where user_id=v_user and exam_profile_id=p_profile and exception_date between p_week and p_week+6),
    'overrides',(select coalesce(jsonb_agg(to_jsonb(t) order by capacity_date),'[]'::jsonb) from public.p48_daily_capacity_overrides t where user_id=v_user and exam_profile_id=p_profile and capacity_date between p_week and p_week+6),
    'resources',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.resources t where user_id=v_user and exam_profile_id=p_profile),
    'revisions',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.revision_schedules t where user_id=v_user and exam_profile_id=p_profile),
    'topicProgress',(select coalesce(jsonb_agg(to_jsonb(t) order by curriculum_node_id),'[]'::jsonb) from public.topic_progress t where user_id=v_user and exam_profile_id=p_profile),
    'carryovers',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.task_carryovers t where user_id=v_user and exam_profile_id=p_profile),
    'weekOverrides',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.p48_week_capacity_overrides t where user_id=v_user and exam_profile_id=p_profile and week_start_date=p_week),
    'resourceUnits',(select coalesce(jsonb_agg(to_jsonb(u) order by u.id),'[]'::jsonb) from public.resource_units u join public.resources r on r.id=u.resource_id where r.user_id=v_user and r.exam_profile_id=p_profile),
    'resourceSections',(select coalesce(jsonb_agg(to_jsonb(u) order by u.id),'[]'::jsonb) from public.resource_sections u join public.resources r on r.id=u.resource_id where r.user_id=v_user and r.exam_profile_id=p_profile),
    'targets',(select coalesce(jsonb_agg(to_jsonb(t) order by resource_id),'[]'::jsonb) from public.p48_resource_targets t where user_id=v_user and exam_profile_id=p_profile),
    'sessions',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.study_sessions t where user_id=v_user and exam_profile_id=p_profile),
    'allocations',(select coalesce(jsonb_agg(to_jsonb(t)||jsonb_build_object('session_started_at',s.started_at) order by t.id),'[]'::jsonb) from public.study_session_allocations t join public.study_sessions s on s.id=t.session_id where t.user_id=v_user and t.exam_profile_id=p_profile and t.superseded_at is null),
    'plans',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.weekly_plans t where user_id=v_user and exam_profile_id=p_profile and week_start_date=p_week),
    'tasks',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.tasks t where user_id=v_user and exam_profile_id=p_profile and (planned_date between p_week and p_week+6 or weekly_plan_id in(select id from public.weekly_plans where user_id=v_user and exam_profile_id=p_profile and week_start_date=p_week))),
    'progress',(select coalesce(jsonb_agg(to_jsonb(t) order by task_id),'[]'::jsonb) from public.task_progress t join public.tasks x on x.id=t.task_id where t.user_id=v_user and x.exam_profile_id=p_profile)
  ) into v;
  return v;
end; $function$
;

create trigger s0_planning_profile_lock before insert or update or delete on public.revision_schedules for each row execute function kpss_s0_private.lock_planning_profile();

create trigger s0_planning_profile_lock before insert or update or delete on public.topic_progress for each row execute function kpss_s0_private.lock_planning_profile();

create trigger s0_planning_profile_lock before insert or update or delete on public.task_carryovers for each row execute function kpss_s0_private.lock_planning_profile();

CREATE OR REPLACE FUNCTION public.apply_plan_revision(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_before jsonb; v_after jsonb; v_id uuid; v_total integer; v_available integer;
  v_user uuid := auth.uid();
  v_plan public.weekly_plans;
  v_revision public.plan_revisions;
  v_item jsonb;
  v_task public.tasks;
  v_risk jsonb;
  v_type text;
  v_backlog public.backlog_states;
begin
  if v_user is null then raise exception 'UNAUTHORIZED'; end if;
  select exam_profile_id into v_id from public.weekly_plans where id=(p_payload->>'weeklyPlanId')::uuid and user_id=v_user;
  perform 1 from public.exam_profiles where id=v_id and user_id=v_user and status='active' for update;
  if not found then raise exception 'WEEKLY_PLAN_NOT_FOUND'; end if;
  select * into v_plan
  from public.weekly_plans
  where id=(p_payload->>'weeklyPlanId')::uuid
    and user_id=v_user
    and status='active'
  for update;
  if not found then raise exception 'WEEKLY_PLAN_NOT_FOUND'; end if;

  select * into v_revision
  from public.plan_revisions
  where user_id=v_user and dedupe_key=p_payload->>'dedupeKey';
  if found then
    return jsonb_build_object('revision',to_jsonb(v_revision),'idempotent',true);
  end if;

  if p_payload->>'intent' is distinct from 'apply_revision' then raise exception 'EXPLICIT_INTENT_REQUIRED'; end if;
  v_before:=kpss_s0_private.planning_inputs(v_plan.exam_profile_id,v_plan.week_start_date);
  if p_payload->>'expectedFingerprint' is null then raise exception 'PLANNING_FRESHNESS_REQUIRED'; end if;
  if p_payload->>'expectedFingerprint' is distinct from md5(v_before::text) then raise exception 'PLANNING_INPUT_STALE'; end if;
  for v_id in select value::uuid from jsonb_array_elements_text(coalesce(p_payload->'tasksToBacklog','[]'))
    union select (value->>'taskId')::uuid from jsonb_array_elements(coalesce(p_payload->'tasksToMove','[]'))
    union select value::uuid from jsonb_array_elements_text(coalesce(p_payload->'tasksToCancel','[]')) loop
   select * into v_task from public.tasks where id=v_id and user_id=v_user and weekly_plan_id=v_plan.id;
   if not found or v_task.status not in ('planned','ready','rescheduled') or v_task.planned_date<=(now() at time zone 'Europe/Istanbul')::date
    or v_task.source_reason not in ('curriculum_progress','resource_progress','revision_due','dynamic_replan')
    or v_task.carried_from_task_id is not null or v_task.canonical_workload_identity is not null or v_task.canonical_material_view_id is not null or v_task.canonical_boundary is not null or v_task.planner_version is not null or v_task.planner_proposal_fingerprint is not null
    or exists(select 1 from public.task_progress where task_id=v_task.id and completed_minutes>0)
    or exists(select 1 from public.task_carryovers where source_task_id=v_task.id and status='applied')
   then raise exception 'TASK_NOT_REPLANNABLE'; end if;
  end loop;
  insert into public.plan_revisions(
    user_id,exam_profile_id,weekly_plan_id,revision_type,reason_code,
    before_planned_minutes,after_planned_minutes,changed_task_count,explanation,dedupe_key
  ) values(
    v_user,v_plan.exam_profile_id,v_plan.id,p_payload->>'revisionType',p_payload->>'reasonCode',
    v_plan.planned_minutes,(p_payload->>'afterPlannedMinutes')::int,
    (p_payload->>'changedTaskCount')::int,p_payload->>'explanation',p_payload->>'dedupeKey'
  ) returning * into v_revision;

  if p_payload->>'revisionType'='strategic_proposal' then
    return jsonb_build_object('revision',to_jsonb(v_revision),'proposal',true,'idempotent',false);
  end if;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_payload->'tasksToBacklog','[]'))
  loop
    select * into v_task
    from public.tasks
    where id=(v_item#>>'{}')::uuid and user_id=v_user and weekly_plan_id=v_plan.id
    for update;
    if not found or v_task.status not in('planned','ready','rescheduled') then
      raise exception 'TASK_NOT_REPLANNABLE';
    end if;
    update public.tasks
    set planned_date=null,status='rescheduled'
    where id=v_task.id;
  end loop;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_payload->'tasksToMove','[]'))
  loop
    select * into v_task
    from public.tasks
    where id=(v_item->>'taskId')::uuid and user_id=v_user and weekly_plan_id=v_plan.id
    for update;
    if not found or v_task.status in('completed','in_progress','partially_completed') then
      raise exception 'TASK_NOT_REPLANNABLE';
    end if;
    update public.tasks
    set planned_date=(v_item->>'toDate')::date,status='rescheduled'
    where id=v_task.id;
    insert into public.task_reschedule_events(user_id,task_id,from_date,to_date,reason)
    values(v_user,v_task.id,v_task.planned_date,(v_item->>'toDate')::date,v_item->>'reason');
  end loop;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_payload->'tasksToCancel','[]'))
  loop
    update public.tasks
    set status='cancelled'
    where id=(v_item#>>'{}')::uuid and user_id=v_user and weekly_plan_id=v_plan.id
      and status not in('completed','in_progress','partially_completed');
    if not found then raise exception 'TASK_NOT_REPLANNABLE'; end if;
  end loop;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_payload->'tasksToCreate','[]'))
  loop
    if not exists(select 1 from public.revision_schedules r join public.curriculum_nodes n on n.id=r.curriculum_node_id
      where r.id=(v_item->>'revisionScheduleId')::uuid and r.user_id=v_user and r.exam_profile_id=v_plan.exam_profile_id
        and r.status in ('scheduled','due') and r.curriculum_node_id=(v_item->>'curriculumNodeId')::uuid
        and n.subject_id=(v_item->>'subjectId')::uuid and n.is_active
        and r.estimated_minutes=(v_item->>'estimatedMinutes')::integer)
    then raise exception 'INVALID_REVISION_SOURCE'; end if;
    v_task := null;
    insert into public.tasks(
      user_id,exam_profile_id,weekly_plan_id,subject_id,curriculum_node_id,revision_schedule_id,
      task_type,title,planned_date,estimated_minutes,importance,priority_score,status,source_reason,dedupe_key
    ) values(
      v_user,v_plan.exam_profile_id,v_plan.id,(v_item->>'subjectId')::uuid,
      (v_item->>'curriculumNodeId')::uuid,(v_item->>'revisionScheduleId')::uuid,
      'review_topic',v_item->>'title',(v_item->>'plannedDate')::date,
      (v_item->>'estimatedMinutes')::int,v_item->>'importance',(v_item->>'priorityScore')::int,
      'ready','revision_due',v_item->>'dedupeKey'
    )
    on conflict(user_id,revision_schedule_id) where revision_schedule_id is not null
    do nothing
    returning * into v_task;
    if v_task.id is not null then
      insert into public.task_progress(task_id,user_id)
      values(v_task.id,v_user)
      on conflict do nothing;
    end if;
  end loop;

  v_after:=kpss_s0_private.planning_inputs(v_plan.exam_profile_id,v_plan.week_start_date);
  perform kpss_s0_private.validate_plan_delta(v_before,v_after);
  select coalesce(sum(value::numeric),0)::integer into v_available from jsonb_each_text(kpss_s0_private.day_capacities(jsonb_set(jsonb_set(v_after,'{today}',to_jsonb(v_plan.week_start_date)),'{allocations}','[]'::jsonb),'p48'));
  select coalesce(sum(estimated_minutes),0)::integer into v_total from public.tasks where weekly_plan_id=v_plan.id and user_id=v_user and status not in ('cancelled','missed');
  update public.weekly_plans
  set available_minutes=v_available,
      planning_budget_minutes=v_available,
      planned_minutes=v_total,
      generation_version=generation_version+1
  where id=v_plan.id;

  insert into public.backlog_states(
    user_id,exam_profile_id,weekly_plan_id,open_task_count,open_core_count,
    open_important_count,open_optional_count,estimated_remaining_minutes,
    remaining_capacity_minutes,capacity_ratio,severity
  ) values(
    v_user,v_plan.exam_profile_id,v_plan.id,
    (p_payload#>>'{backlog,openTaskCount}')::int,
    (p_payload#>>'{backlog,openCoreCount}')::int,
    (p_payload#>>'{backlog,openImportantCount}')::int,
    (p_payload#>>'{backlog,openOptionalCount}')::int,
    (p_payload#>>'{backlog,estimatedRemainingMinutes}')::int,
    (p_payload#>>'{backlog,remainingCapacityMinutes}')::int,
    (p_payload#>>'{backlog,capacityRatio}')::numeric,
    p_payload#>>'{backlog,severity}'
  )
  on conflict(user_id,weekly_plan_id) do update set
    open_task_count=excluded.open_task_count,
    open_core_count=excluded.open_core_count,
    open_important_count=excluded.open_important_count,
    open_optional_count=excluded.open_optional_count,
    estimated_remaining_minutes=excluded.estimated_remaining_minutes,
    remaining_capacity_minutes=excluded.remaining_capacity_minutes,
    capacity_ratio=excluded.capacity_ratio,
    severity=excluded.severity
  returning * into v_backlog;

  for v_type in
    select unnest(array['capacity_shortfall','backlog_overload','syllabus_delay','revision_overload'])
  loop
    select value into v_risk
    from jsonb_array_elements(coalesce(p_payload->'risks','[]'))
    where value->>'riskType'=v_type
    limit 1;
    if v_risk is null then
      update public.plan_risks
      set status='resolved',resolved_at=now()
      where user_id=v_user and exam_profile_id=v_plan.exam_profile_id
        and risk_type=v_type and status='open';
    else
      insert into public.plan_risks(
        user_id,exam_profile_id,weekly_plan_id,risk_type,severity,
        reason_code,metric_value,message
      ) values(
        v_user,v_plan.exam_profile_id,v_plan.id,v_type,v_risk->>'severity',
        v_risk->>'reasonCode',(v_risk->>'metricValue')::numeric,v_risk->>'message'
      )
      on conflict(user_id,exam_profile_id,risk_type) where status='open'
      do update set
        severity=excluded.severity,
        reason_code=excluded.reason_code,
        metric_value=excluded.metric_value,
        message=excluded.message,
        weekly_plan_id=excluded.weekly_plan_id;
    end if;
    v_risk := null;
  end loop;

  return jsonb_build_object(
    'revision',to_jsonb(v_revision),'backlog',to_jsonb(v_backlog),'idempotent',false
  );
end
$function$
;

CREATE OR REPLACE FUNCTION public.start_task(p_task_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target public.tasks;
begin
  perform 1 from public.exam_profiles where id=(select exam_profile_id from public.tasks where id=p_task_id and user_id=public.availability_actor_uid()) and user_id=public.availability_actor_uid() for update;
  select * into target
  from public.tasks
  where id = p_task_id and user_id = public.availability_actor_uid()
  for update;

  if not found then raise exception 'TASK_NOT_FOUND'; end if;
  if target.status in ('completed', 'missed', 'cancelled') then
    raise exception 'TASK_NOT_STARTABLE';
  end if;

  if target.status <> 'in_progress' then
    update public.tasks
    set status = 'in_progress'
    where id = p_task_id and user_id = public.availability_actor_uid()
      and status in ('planned', 'ready', 'partially_completed', 'rescheduled')
    returning * into target;
  end if;

  insert into public.task_progress(task_id, user_id, completed_minutes)
  values (target.id, public.availability_actor_uid(), 0)
  on conflict (task_id) do nothing;

  if target.task_type = 'learn_topic' and target.curriculum_node_id is not null then
    update public.topic_progress
    set state = 'learning',
        first_started_at = coalesce(first_started_at, now())
    where user_id = public.availability_actor_uid()
      and exam_profile_id = target.exam_profile_id
      and curriculum_node_id = target.curriculum_node_id
      and state = 'not_started';
  end if;

  return jsonb_build_object('task_id', target.id, 'status', target.status);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_task_status(p_task_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target public.tasks;
  unit_total integer;
  completed_units integer;
  progress_minutes integer;
  next_status text;
begin
  perform 1 from public.exam_profiles where id=(select exam_profile_id from public.tasks where id=p_task_id and user_id=public.availability_actor_uid()) and user_id=public.availability_actor_uid() for update;
  select * into target from public.tasks where id = p_task_id and user_id = public.availability_actor_uid();
  if not found then raise exception 'TASK_NOT_FOUND'; end if;
  if target.status in ('cancelled','missed') then raise exception 'TASK_NOT_STARTABLE'; end if;

  select count(*), count(*) filter (where status = 'completed')
  into unit_total, completed_units
  from public.task_resource_units
  where task_id = p_task_id and user_id = public.availability_actor_uid();

  select coalesce(completed_minutes, 0) into progress_minutes
  from public.task_progress where task_id = p_task_id and user_id = public.availability_actor_uid();
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
  where id = p_task_id and user_id = public.availability_actor_uid();
  return next_status;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_task_progress(p_task_id uuid, p_completed_minutes integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target public.tasks;
  next_status text;
begin
  perform 1 from public.exam_profiles where id=(select exam_profile_id from public.tasks where id=p_task_id and user_id=public.availability_actor_uid()) and user_id=public.availability_actor_uid() for update;
  if p_completed_minutes is null or p_completed_minutes < 0 then
    raise exception 'INVALID_TASK_PROGRESS';
  end if;
  select * into target from public.tasks where id = p_task_id and user_id = public.availability_actor_uid();
  if not found then raise exception 'TASK_NOT_FOUND'; end if;
  if target.status in ('cancelled','missed') then raise exception 'TASK_NOT_STARTABLE'; end if;

  insert into public.task_progress (task_id, user_id, completed_minutes)
  values (p_task_id, public.availability_actor_uid(), p_completed_minutes)
  on conflict (task_id) do update set completed_minutes = excluded.completed_minutes;

  if p_completed_minutes >= target.estimated_minutes
    and not exists (select 1 from public.task_resource_units where task_id = p_task_id and status = 'pending') then
    update public.tasks set status = 'completed', completed_at = coalesce(completed_at, now())
    where id = p_task_id and user_id = public.availability_actor_uid();
    if target.task_type = 'learn_topic' and target.curriculum_node_id is not null then
      update public.topic_progress set state = 'practicing'
      where user_id = public.availability_actor_uid()
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
$function$
;

CREATE OR REPLACE FUNCTION public.complete_task(p_task_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target public.tasks;
begin
  perform 1 from public.exam_profiles where id=(select exam_profile_id from public.tasks where id=p_task_id and user_id=public.availability_actor_uid()) and user_id=public.availability_actor_uid() for update;
  select * into target from public.tasks where id = p_task_id and user_id = public.availability_actor_uid();
  if not found then raise exception 'TASK_NOT_FOUND'; end if;
  if target.status in ('cancelled','missed') then raise exception 'TASK_NOT_STARTABLE'; end if;
  if exists (
    select 1 from public.task_resource_units
    where task_id = p_task_id and user_id = public.availability_actor_uid() and status = 'pending'
  ) then raise exception 'TASK_HAS_PENDING_UNITS'; end if;

  update public.tasks set status = 'completed', completed_at = coalesce(completed_at, now())
  where id = p_task_id and user_id = public.availability_actor_uid();
  insert into public.task_progress (task_id, user_id, completed_minutes)
  values (p_task_id, public.availability_actor_uid(), target.estimated_minutes)
  on conflict (task_id) do update set
    completed_minutes = greatest(public.task_progress.completed_minutes, excluded.completed_minutes);

  if target.task_type = 'learn_topic' and target.curriculum_node_id is not null then
    update public.topic_progress set state = 'practicing'
    where user_id = public.availability_actor_uid()
      and exam_profile_id = target.exam_profile_id
      and curriculum_node_id = target.curriculum_node_id
      and state in ('not_started', 'learning');
  end if;
  return jsonb_build_object('task_id', p_task_id, 'status', 'completed');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.complete_task_unit(p_task_id uuid, p_resource_unit_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  changed integer;
  next_status text;
begin
  perform 1 from public.exam_profiles where id=(select exam_profile_id from public.tasks where id=p_task_id and user_id=public.availability_actor_uid()) and user_id=public.availability_actor_uid() for update;
  update public.task_resource_units
  set status = 'completed', completed_at = coalesce(completed_at, now())
  where task_id = p_task_id
    and resource_unit_id = p_resource_unit_id
    and user_id = public.availability_actor_uid()
    and status <> 'completed';
  get diagnostics changed = row_count;

  if not exists (
    select 1 from public.task_resource_units
    where task_id = p_task_id and resource_unit_id = p_resource_unit_id and user_id = public.availability_actor_uid()
  ) then raise exception 'TASK_NOT_FOUND'; end if;

  insert into public.resource_unit_progress (
    user_id, resource_unit_id, status, completed_at, attempt_count
  ) values (
    public.availability_actor_uid(), p_resource_unit_id, 'completed', now(), 1
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
$function$
;

CREATE OR REPLACE FUNCTION public.cancel_study_session(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s public.study_sessions;
  cancelled_at timestamptz := now();
begin
  perform 1 from public.exam_profiles where id=(select exam_profile_id from public.study_sessions where id=p_session_id and user_id=public.availability_actor_uid()) and user_id=public.availability_actor_uid() for update;
  select * into s
  from public.study_sessions
  where id = p_session_id and user_id = public.availability_actor_uid()
  for update;

  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if s.status = 'cancelled' then return to_jsonb(s); end if;
  if s.status <> 'active' then raise exception 'SESSION_NOT_ACTIVE'; end if;

  update public.study_session_breaks
  set ended_at = cancelled_at
  where session_id = s.id
    and user_id = public.availability_actor_uid()
    and ended_at is null;

  update public.study_sessions
  set ended_at = cancelled_at,
      status = 'cancelled'
  where id = s.id
  returning * into s;

  if s.task_id is not null then
    update public.tasks
    set status = 'ready'
    where id = s.task_id
      and user_id = public.availability_actor_uid()
      and status = 'in_progress';
  end if;

  return to_jsonb(s);
end;
$function$
;

create function kpss_s0_private.guard_planned_identity()
returns trigger language plpgsql security invoker set search_path='' as $$
declare v_changed boolean:=tg_op='DELETE';
begin
 if tg_table_name='exam_profiles' then
  if exists(select 1 from public.weekly_plans p where p.exam_profile_id=old.id) or exists(select 1 from public.tasks t where t.exam_profile_id=old.id) then raise exception 'PLANNED_PROFILE_IN_USE'; end if;
 elsif tg_table_name='resources' then
  if tg_op='UPDATE' then v_changed:=(old.id,old.user_id,old.exam_profile_id,old.subject_id) is distinct from (new.id,new.user_id,new.exam_profile_id,new.subject_id); end if;
  if v_changed and exists(select 1 from public.tasks t where t.resource_id=old.id) then raise exception 'PLANNED_RESOURCE_IN_USE'; end if;
 elsif tg_table_name='resource_units' then
  if tg_op='UPDATE' then v_changed:=(old.id,old.resource_id,old.resource_section_id,old.unit_type,old.page_start,old.page_end) is distinct from (new.id,new.resource_id,new.resource_section_id,new.unit_type,new.page_start,new.page_end); end if;
  if v_changed and exists(select 1 from public.task_resource_units l where l.resource_unit_id=old.id) then raise exception 'PLANNED_MATERIAL_IN_USE'; end if;
 elsif tg_table_name='resource_sections' then
  if tg_op='UPDATE' then v_changed:=(old.id,old.resource_id) is distinct from (new.id,new.resource_id); end if;
  if v_changed and (exists(select 1 from public.tasks t where t.resource_section_id=old.id) or exists(select 1 from public.resource_units u join public.task_resource_units l on l.resource_unit_id=u.id where u.resource_section_id=old.id)) then raise exception 'PLANNED_MATERIAL_IN_USE'; end if;
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end; $$;
revoke all on function kpss_s0_private.guard_planned_identity() from public,anon;
grant execute on function kpss_s0_private.guard_planned_identity() to authenticated,service_role,kpss_plan_writer,kpss_baseline_writer,kpss_execution_writer;
create trigger s0_r2_planned_identity before delete on public.exam_profiles for each row execute function kpss_s0_private.guard_planned_identity();
create trigger s0_r2_planned_identity before update or delete on public.resources for each row execute function kpss_s0_private.guard_planned_identity();
create trigger s0_r2_planned_identity before update or delete on public.resource_units for each row execute function kpss_s0_private.guard_planned_identity();
create trigger s0_r2_planned_identity before update or delete on public.resource_sections for each row execute function kpss_s0_private.guard_planned_identity();
notify pgrst,'reload schema';
commit;
