begin;
-- Forward correction: retain genuine grouped baseline units and strengthen protected scope.

CREATE OR REPLACE FUNCTION public.persist_p48_baseline_plan(p_exam_profile_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_before jsonb;
  v_after jsonb;
  v_user uuid := public.availability_actor_uid();
  v_week_start date := (p_payload->>'weekStartDate')::date;
  v_week_end date := v_week_start + 6;
  v_capacity integer := (p_payload->>'capacityMinutes')::integer;
  v_budget integer := (p_payload->>'planningBudgetMinutes')::integer;
  v_reserve integer := (p_payload->>'reserveMinutes')::integer;
  v_source_key text := btrim(coalesce(p_payload->>'sourceKey',''));
  v_plan public.weekly_plans;
  v_plan_found boolean := false;
  v_day jsonb;
  v_task_json jsonb;
  v_unit_json jsonb;
  v_task public.tasks;
  v_inserted integer := 0;
  v_linked integer := 0;
  v_planned integer := 0;
  v_payload_task_count integer;
begin
  if v_user is null then raise exception 'UNAUTHORIZED'; end if;
  if not exists(select 1 from public.exam_profiles where id=p_exam_profile_id and user_id=v_user and status='active') then
    raise exception 'INVALID_EXAM_PROFILE';
  end if;
  if v_week_start is null or extract(isodow from v_week_start) <> 1 then raise exception 'INVALID_WEEK_START'; end if;
  v_before:=kpss_s0_private.planning_inputs(p_exam_profile_id,v_week_start);
  if p_payload->>'expectedFingerprint' is null then raise exception 'PLANNING_FRESHNESS_REQUIRED'; end if;
  if p_payload->>'expectedFingerprint' is distinct from md5(v_before::text) then raise exception 'PLANNING_INPUT_STALE'; end if;
  if v_capacity <= 0 or v_budget < 0 or v_reserve < 0 or v_budget + v_reserve <> v_capacity then
    raise exception 'INVALID_BASELINE_CAPACITY';
  end if;
  if v_source_key = '' then raise exception 'INVALID_BASELINE_SOURCE_KEY'; end if;
  if jsonb_array_length(coalesce(p_payload->'dailyCapacity','[]'::jsonb)) <> 7 then
    raise exception 'INVALID_DAILY_CAPACITY_COUNT';
  end if;
  if (select coalesce(sum((value->>'capacityMinutes')::integer),0) from jsonb_array_elements(p_payload->'dailyCapacity')) <> v_capacity
    or (select coalesce(sum((value->>'reserveMinutes')::integer),0) from jsonb_array_elements(p_payload->'dailyCapacity')) <> v_reserve then
    raise exception 'INVALID_DAILY_CAPACITY_TOTALS';
  end if;

  if (select count(distinct value->>'date') from jsonb_array_elements(p_payload->'dailyCapacity'))<>7 then raise exception 'INVALID_DAILY_CAPACITY_COUNT'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || p_exam_profile_id::text || v_week_start::text || ':p48-baseline',0));

  insert into public.p48_week_capacity_overrides(
    user_id,exam_profile_id,week_start_date,capacity_minutes,planning_budget_minutes,reserve_minutes,source_key
  ) values(v_user,p_exam_profile_id,v_week_start,v_capacity,v_budget,v_reserve,v_source_key)
  on conflict(exam_profile_id,week_start_date) do update set
    capacity_minutes=excluded.capacity_minutes,
    planning_budget_minutes=excluded.planning_budget_minutes,
    reserve_minutes=excluded.reserve_minutes,
    source_key=excluded.source_key
  where (public.p48_week_capacity_overrides.capacity_minutes,
         public.p48_week_capacity_overrides.planning_budget_minutes,
         public.p48_week_capacity_overrides.reserve_minutes,
         public.p48_week_capacity_overrides.source_key)
    is distinct from
        (excluded.capacity_minutes,excluded.planning_budget_minutes,excluded.reserve_minutes,excluded.source_key);

  for v_day in select value from jsonb_array_elements(p_payload->'dailyCapacity')
  loop
    if (v_day->>'date')::date < v_week_start or (v_day->>'date')::date > v_week_end then
      raise exception 'INVALID_DAILY_CAPACITY_DATE';
    end if;
    insert into public.p48_daily_capacity_overrides(
      user_id,exam_profile_id,capacity_date,capacity_minutes,reserve_minutes,source_key
    ) values(
      v_user,p_exam_profile_id,(v_day->>'date')::date,
      (v_day->>'capacityMinutes')::integer,(v_day->>'reserveMinutes')::integer,v_source_key
    )
    on conflict(exam_profile_id,capacity_date) do update set
      capacity_minutes=excluded.capacity_minutes,
      reserve_minutes=excluded.reserve_minutes,
      source_key=excluded.source_key
    where (public.p48_daily_capacity_overrides.capacity_minutes,
           public.p48_daily_capacity_overrides.reserve_minutes,
           public.p48_daily_capacity_overrides.source_key)
      is distinct from (excluded.capacity_minutes,excluded.reserve_minutes,excluded.source_key);
  end loop;

  select * into v_plan from public.weekly_plans
  where user_id=v_user and exam_profile_id=p_exam_profile_id
    and week_start_date=v_week_start and status='active'
  for update;

  v_plan_found := found;

  if v_plan_found and exists(
    select 1 from public.tasks
    where weekly_plan_id=v_plan.id and user_id=v_user
      and status not in ('cancelled','missed') and source_reason <> 'baseline_import'
  ) then
    raise exception 'BASELINE_WEEK_HAS_OTHER_ACTIVE_TASKS';
  end if;

  if not v_plan_found then
    insert into public.weekly_plans(
      user_id,exam_profile_id,week_start_date,week_end_date,
      available_minutes,planning_budget_minutes,planned_minutes,status,generation_version
    ) values(v_user,p_exam_profile_id,v_week_start,v_week_end,v_capacity,v_budget,0,'active',2)
    returning * into v_plan;
  end if;

  v_payload_task_count := jsonb_array_length(coalesce(p_payload->'tasks','[]'::jsonb));
  for v_task_json in select value from jsonb_array_elements(coalesce(p_payload->'tasks','[]'::jsonb))
  loop
    if (v_task_json->>'plannedDate')::date < v_week_start or (v_task_json->>'plannedDate')::date > v_week_end then
      raise exception 'INVALID_BASELINE_TASK_DATE';
    end if;
    if (v_task_json->>'estimatedMinutes')::integer <= 0 then raise exception 'INVALID_BASELINE_TASK_MINUTES'; end if;
    if not exists(
      select 1 from public.user_subjects
      where user_id=v_user and exam_profile_id=p_exam_profile_id
        and subject_id=(v_task_json->>'subjectId')::uuid and status='active'
    ) then raise exception 'INVALID_BASELINE_SUBJECT'; end if;
    if not exists(
      select 1 from public.resources
      where id=(v_task_json->>'resourceId')::uuid and user_id=v_user
        and exam_profile_id=p_exam_profile_id and subject_id=(v_task_json->>'subjectId')::uuid and status='active'
    ) then raise exception 'INVALID_BASELINE_RESOURCE'; end if;
    if nullif(v_task_json->>'resourceSectionId','') is not null and not exists(
      select 1 from public.resource_sections
      where id=(v_task_json->>'resourceSectionId')::uuid
        and resource_id=(v_task_json->>'resourceId')::uuid and is_active=true
    ) then raise exception 'INVALID_BASELINE_SECTION'; end if;
    if jsonb_array_length(coalesce(v_task_json->'resourceUnitIds','[]'::jsonb)) = 0 then
      raise exception 'BASELINE_TASK_WITHOUT_UNITS';
    end if;
    for v_unit_json in select value from jsonb_array_elements(v_task_json->'resourceUnitIds')
    loop
      if not exists(
        select 1 from public.resource_units
        where id=(v_unit_json#>>'{}')::uuid
          and resource_id=(v_task_json->>'resourceId')::uuid and is_active=true
          and (resource_section_id is null or exists(select 1 from public.resource_sections s where s.id=public.resource_units.resource_section_id and s.resource_id=(v_task_json->>'resourceId')::uuid and s.is_active))
      ) then raise exception 'INVALID_BASELINE_UNIT'; end if;
    end loop;

    v_task.id := null;
    insert into public.tasks(
      user_id,exam_profile_id,weekly_plan_id,subject_id,curriculum_node_id,
      resource_id,resource_section_id,carried_from_task_id,task_type,work_mode,
      title,description,planned_date,estimated_minutes,importance,priority_score,
      status,source_reason,dedupe_key
    ) values(
      v_user,p_exam_profile_id,v_plan.id,(v_task_json->>'subjectId')::uuid,
      nullif(v_task_json->>'curriculumNodeId','')::uuid,
      (v_task_json->>'resourceId')::uuid,nullif(v_task_json->>'resourceSectionId','')::uuid,
      null,'solve_resource_units',nullif(v_task_json->>'workMode',''),
      v_task_json->>'title',nullif(v_task_json->>'description',''),
      (v_task_json->>'plannedDate')::date,(v_task_json->>'estimatedMinutes')::integer,
      'important',60,'ready','baseline_import',v_task_json->>'dedupeKey'
    ) on conflict(weekly_plan_id,dedupe_key) do nothing
    returning * into v_task;

    if v_task.id is not null then v_inserted := v_inserted + 1; end if;
    if v_task.id is null then
      select * into v_task from public.tasks
      where weekly_plan_id=v_plan.id and dedupe_key=v_task_json->>'dedupeKey' and user_id=v_user;
      if (v_task.subject_id,v_task.resource_id,v_task.resource_section_id,v_task.curriculum_node_id,v_task.planned_date,v_task.estimated_minutes,v_task.title,v_task.work_mode)
        is distinct from ((v_task_json->>'subjectId')::uuid,(v_task_json->>'resourceId')::uuid,nullif(v_task_json->>'resourceSectionId','')::uuid,nullif(v_task_json->>'curriculumNodeId','')::uuid,(v_task_json->>'plannedDate')::date,(v_task_json->>'estimatedMinutes')::integer,v_task_json->>'title',nullif(v_task_json->>'workMode',''))
        or (select coalesce(array_agg(resource_unit_id order by resource_unit_id),'{}') from public.task_resource_units where task_id=v_task.id and user_id=v_user)
           is distinct from (select coalesce(array_agg(distinct (value#>>'{}')::uuid order by (value#>>'{}')::uuid),'{}') from jsonb_array_elements(v_task_json->'resourceUnitIds'))
      then raise exception 'BASELINE_DEDUPE_CONFLICT'; end if;
    end if;
    if v_task.source_reason <> 'baseline_import' then raise exception 'BASELINE_DEDUPE_CONFLICT'; end if;

    insert into public.task_progress(task_id,user_id,completed_minutes,actual_study_minutes)
    values(v_task.id,v_user,0,0) on conflict(task_id) do nothing;

    for v_unit_json in select value from jsonb_array_elements(v_task_json->'resourceUnitIds')
    loop
      insert into public.task_resource_units(user_id,task_id,resource_unit_id)
      values(v_user,v_task.id,(v_unit_json#>>'{}')::uuid)
      on conflict(task_id,resource_unit_id) do nothing;
      if found then v_linked := v_linked + 1; end if;
    end loop;
  end loop;

  select count(*)::integer,coalesce(sum(estimated_minutes),0)::integer
  into v_payload_task_count,v_planned
  from public.tasks
  where user_id=v_user and weekly_plan_id=v_plan.id
    and source_reason='baseline_import' and status not in ('cancelled','missed');

  if v_planned <> v_budget then raise exception 'BASELINE_PLANNED_MINUTES_MISMATCH'; end if;
  if v_payload_task_count <> jsonb_array_length(p_payload->'tasks') then raise exception 'BASELINE_TASK_COUNT_MISMATCH'; end if;

  update public.weekly_plans set
    available_minutes=v_capacity,
    planning_budget_minutes=v_budget,
    planned_minutes=v_planned,
    generation_version=greatest(generation_version,2)
  where id=v_plan.id
    and (available_minutes,planning_budget_minutes,planned_minutes,generation_version)
      is distinct from (v_capacity,v_budget,v_planned,greatest(generation_version,2));

  v_after:=kpss_s0_private.planning_inputs(p_exam_profile_id,v_week_start);
  perform kpss_s0_private.validate_plan_delta(v_before,v_after,true);
  if exists(select 1 from public.tasks t left join public.task_progress p on p.task_id=t.id where t.weekly_plan_id=v_plan.id and t.user_id=v_user and t.status not in ('cancelled','missed','completed') group by t.planned_date having sum(greatest(0,t.estimated_minutes-coalesce(p.completed_minutes,0)))>coalesce((kpss_s0_private.day_capacities(jsonb_set(v_after,'{today}',to_jsonb(v_week_start)),'p48')->>t.planned_date::text)::integer,0)) then raise exception 'PLAN_CAPACITY_EXCEEDED'; end if;
  return jsonb_build_object(
    'weeklyPlanId',v_plan.id,'taskCount',v_payload_task_count,
    'insertedTaskCount',v_inserted,'insertedTaskUnitLinks',v_linked,
    'capacityMinutes',v_capacity,'planningBudgetMinutes',v_budget,'reserveMinutes',v_reserve
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.replace_manual_weekly_plan(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := public.availability_actor_uid();
  v_profile public.exam_profiles;
  v_plan public.weekly_plans;
  v_week_start date := (p_payload ->> 'weekStartDate')::date;
  v_week_end date := v_week_start + 6;
  v_available integer;
  v_snapshot jsonb;
  v_days jsonb;
  v_reserved integer;
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

  select * into v_profile
  from public.exam_profiles
  where user_id = v_user and status = 'active'
  limit 1 for update;
  if not found then raise exception 'NO_ACTIVE_EXAM_PROFILE'; end if;
  v_snapshot := public.planning_week_snapshot(v_profile.id,v_week_start);
  if p_payload->>'expectedFingerprint' is null then raise exception 'PLANNING_FRESHNESS_REQUIRED'; end if;
  if p_payload->>'expectedFingerprint' is distinct from v_snapshot->>'fingerprint' then raise exception 'PLANNING_INPUT_STALE'; end if;
  v_days := v_snapshot->'manualDayCapacities';
  select coalesce(sum(value::numeric),0)::integer into v_available from jsonb_each_text(v_days);
  if jsonb_typeof(p_payload->'blocks') is distinct from 'array' or jsonb_array_length(p_payload->'blocks')>100 then raise exception 'INVALID_MANUAL_PLAN_MINUTES'; end if;

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
    and t.source_reason not in ('planner_v2','baseline_import','carryover')
    and t.canonical_workload_identity is null
    and t.canonical_material_view_id is null and t.canonical_boundary is null
    and t.planner_version is null and t.planner_proposal_fingerprint is null
    and t.carried_from_task_id is null
    and not exists(select 1 from public.task_carryovers c where c.source_task_id=t.id and c.user_id=v_user and c.status='applied')
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

  -- Reserve unfinished protected commitments. Completed/historical minutes
  -- remain in the persisted plan total, not in the new-work day budget.
  for v_task in select * from public.tasks where user_id=v_user and weekly_plan_id=v_plan.id and status not in ('cancelled','missed','completed') loop
    if v_task.planned_date >= (v_snapshot->'input'->>'today')::date then
      select greatest(0,v_task.estimated_minutes-coalesce(completed_minutes,0)) into v_reserved from public.task_progress where task_id=v_task.id;
      v_reserved:=coalesce(v_reserved,v_task.estimated_minutes);
      v_days:=v_days||jsonb_build_object(v_task.planned_date::text,greatest(0,coalesce((v_days->>v_task.planned_date::text)::numeric,0)-v_reserved));
    end if;
  end loop;
  select coalesce(sum(value::numeric),0)::integer+v_preserved into v_available from jsonb_each_text(v_days);
  if v_available<=0 then raise exception 'NO_WEEKLY_AVAILABILITY'; end if;
  if exists(select 1 from jsonb_array_elements(p_payload->'blocks') b group by b->>'plannedDate' having sum((b->>'estimatedMinutes')::numeric)>coalesce((v_days->>(b->>'plannedDate'))::numeric,0)) then raise exception 'MANUAL_PLAN_OVER_CAPACITY'; end if;

  for v_block in
    select value from jsonb_array_elements(coalesce(p_payload -> 'blocks', '[]'::jsonb))
  loop
    v_date := (v_block ->> 'plannedDate')::date;
    v_minutes := (v_block ->> 'estimatedMinutes')::integer;
    v_work_mode := nullif(v_block ->> 'workMode', '');
    v_resource_id := nullif(v_block ->> 'resourceId', '')::uuid;
    v_title := btrim(coalesce(v_block ->> 'title', ''));
    v_description := nullif(btrim(coalesce(v_block ->> 'description', '')), '');

    if v_date is null or v_date < v_week_start or v_date > v_week_end or v_date < (v_snapshot->'input'->>'today')::date then
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

  perform kpss_s0_private.validate_plan_delta(v_snapshot->'input',kpss_s0_private.planning_inputs(v_profile.id,v_week_start));
  return jsonb_build_object(
    'weeklyPlanId', v_plan.id,
    'insertedTaskCount', v_inserted,
    'preservedMinutes', v_preserved,
    'plannedMinutes', v_planned,
    'availableMinutes', v_available
  );
end;
$function$
;

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

CREATE OR REPLACE FUNCTION public.apply_planner_v2_proposal_candidate(p_actor_user_id uuid, p_actor_exam_profile_id uuid, p_record_id uuid, p_planner_proposal_id text, p_proposal_fingerprint text, p_planner_snapshot_fingerprint text, p_planner_version text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_before jsonb;
  v_user uuid := p_actor_user_id;
  v_row public.confirmed_action_proposals;
  v_plan public.weekly_plans;
  v_create jsonb;
  v_task_id uuid;
  v_resource_unit_id uuid;
  v_video public.youtube_playlist_videos;
  v_watched_seconds integer := 0;
  v_created_ids uuid[] := array[]::uuid[];
  v_replaced_ids uuid[] := array[]::uuid[];
  v_expected_minutes integer := 0;
  v_actual_minutes integer := 0;
  v_new_plan_minutes integer := 0;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'FORBIDDEN'; end if;
  if v_user is null or p_actor_exam_profile_id is null then
    raise exception 'PLANNER_V2_ACTOR_BINDING_REQUIRED';
  end if;
  perform 1 from public.exam_profiles where id=p_actor_exam_profile_id and user_id=v_user and status='active' for update;
  if not found then raise exception 'PLANNER_V2_ACTOR_PROFILE_MISMATCH'; end if;
  perform set_config('request.jwt.claim.sub',v_user::text,true);
  select * into v_row from public.confirmed_action_proposals
  where id=p_record_id and user_id=v_user
    and exam_profile_id=p_actor_exam_profile_id and action_kind='planner_v2_week'
  for update;
  if not found then raise exception 'PLANNER_V2_PROPOSAL_NOT_FOUND'; end if;
  if v_row.planner_proposal_id <> p_planner_proposal_id
    or v_row.proposal_fingerprint <> p_proposal_fingerprint
    or v_row.planner_snapshot_fingerprint <> p_planner_snapshot_fingerprint
    or v_row.planner_version <> p_planner_version
  then raise exception 'PLANNER_V2_APPLY_IDENTITY_MISMATCH'; end if;
  perform 1 from public.exam_profiles ep
  where ep.id=p_actor_exam_profile_id and ep.user_id=v_user and ep.status='active';
  if not found then raise exception 'PLANNER_V2_ACTOR_PROFILE_MISMATCH'; end if;
  if v_row.status='applied' then
    return coalesce(v_row.result_payload,'{}'::jsonb)
      || jsonb_build_object('idempotent',true,'recordId',v_row.id);
  end if;
  if v_row.status <> 'confirmed' then raise exception 'PLANNER_V2_EXPLICIT_CONFIRMATION_REQUIRED'; end if;
  if v_row.expires_at <= now() then
    update public.confirmed_action_proposals
    set status='expired',confirmed_at=null
    where id=v_row.id;
    return jsonb_build_object('recordId',v_row.id,'state','expired','applied',false);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text,62));
  select * into v_plan from public.weekly_plans
  where id=v_row.weekly_plan_id and user_id=v_user
    and exam_profile_id=v_row.exam_profile_id and status='active'
  for update;
  if not found then raise exception 'WEEKLY_PLAN_NOT_FOUND'; end if;
  if v_plan.generation_version <> v_row.plan_generation_version
    or public.planner_v2_database_fingerprint(v_user,v_plan.id) <> v_row.snapshot_fingerprint
  then
    update public.confirmed_action_proposals set status='stale',confirmed_at=null where id=v_row.id;
    return jsonb_build_object('recordId',v_row.id,'state','stale','applied',false);
  end if;

  v_before:=kpss_s0_private.planning_inputs(v_plan.exam_profile_id,v_plan.week_start_date);
  if (v_row.mutation_payload->>'horizonStart')::date > (v_row.mutation_payload->>'horizonEnd')::date
    or (v_row.mutation_payload->>'userId')::uuid <> v_user
    or (v_row.mutation_payload->>'examProfileId')::uuid <> v_plan.exam_profile_id
    or coalesce((v_row.mutation_payload->>'atomicRequired')::boolean,false) is not true
    or coalesce((v_row.mutation_payload->>'applyCandidateOnly')::boolean,false) is not true
  then raise exception 'PLANNER_V2_APPLY_CONTRACT_INVALID'; end if;

  if exists (
    with creates as (
      select (value->>'plannedDate')::date as date,
        sum((value->>'estimatedMinutes')::integer)::integer as minutes
      from jsonb_array_elements(coalesce(v_row.mutation_payload->'creates','[]'::jsonb))
      group by (value->>'plannedDate')::date
    ), days as (
      select (value->>'date')::date as date,
        (value->>'proposedMinutes')::integer as proposed_minutes,
        (value->>'availableMinutes')::integer as available_minutes
      from jsonb_array_elements(coalesce(v_row.display_payload->'days','[]'::jsonb))
    )
    select 1 from creates full join days using(date)
    where coalesce(creates.minutes,0) <> coalesce(days.proposed_minutes,0)
      or coalesce(creates.minutes,0) > coalesce(days.available_minutes,0)
  ) then raise exception 'PLANNER_V2_EXACT_DAILY_CAPACITY_RECHECK_FAILED'; end if;

  if exists (
    select 1 from jsonb_array_elements_text(coalesce(v_row.mutation_payload->'replaceableTaskIds','[]'::jsonb)) x(id)
    left join public.tasks t on t.id=x.id::uuid and t.user_id=v_user and t.weekly_plan_id=v_plan.id
    where t.id is null or t.planned_date <= current_date
      or t.planned_date not between (v_row.mutation_payload->>'horizonStart')::date and (v_row.mutation_payload->>'horizonEnd')::date
      or t.status not in ('planned','ready','rescheduled')
      or t.source_reason not in ('planner_v2','curriculum_progress','resource_progress','revision_due','dynamic_replan')
      or t.carried_from_task_id is not null
      or exists(select 1 from public.task_progress p where p.task_id=t.id and (p.completed_minutes>0 or p.actual_study_minutes>0))
      or exists(select 1 from public.task_carryovers c where c.source_task_id=t.id and c.status='applied')
  ) then raise exception 'PLANNER_V2_REPLACEMENT_SCOPE_UNSAFE'; end if;

  update public.tasks t set status='cancelled',planned_date=null
  where t.user_id=v_user and t.weekly_plan_id=v_plan.id
    and t.id in (
      select value::uuid
      from jsonb_array_elements_text(coalesce(v_row.mutation_payload->'replaceableTaskIds','[]'::jsonb))
    );
  select coalesce(array_agg(value::uuid order by value),'{}') into v_replaced_ids
  from jsonb_array_elements_text(coalesce(v_row.mutation_payload->'replaceableTaskIds','[]'::jsonb));

  for v_create in select value from jsonb_array_elements(coalesce(v_row.mutation_payload->'creates','[]'::jsonb))
  loop
    if nullif(btrim(v_create->>'canonicalWorkloadIdentity'),'') is null
      or nullif(btrim(v_create->>'materialViewId'),'') is null
      or v_create->>'workloadAuthority'='unknown'
      or (v_create->>'estimatedMinutes')::integer <= 0
      or (v_create->>'plannedDate')::date <= current_date
      or (v_create->>'plannedDate')::date not between
        (v_row.mutation_payload->>'horizonStart')::date and (v_row.mutation_payload->>'horizonEnd')::date
    then raise exception 'PLANNER_V2_CREATE_UNSAFE'; end if;
    perform 1 from public.resources r
    where r.id=(v_create->>'resourceId')::uuid and r.user_id=v_user
      and r.exam_profile_id=v_plan.exam_profile_id
      and r.subject_id=(v_create->>'subjectId')::uuid and r.status='active';
    if not found then raise exception 'PLANNER_V2_RESOURCE_OWNER_MISMATCH'; end if;

    v_resource_unit_id := null;
    if v_create#>>'{boundary,kind}'='physical_pages' then
      if v_create->>'canonicalWorkloadIdentity' !~ '^physical:[0-9a-fA-F-]{36}$' then
        raise exception 'PLANNER_V2_PHYSICAL_IDENTITY_NOT_PERSISTABLE';
      end if;
      v_resource_unit_id := substring(v_create->>'canonicalWorkloadIdentity' from 10)::uuid;
      perform 1 from public.resource_units ru
      where ru.id=v_resource_unit_id and ru.resource_id=(v_create->>'resourceId')::uuid
        and ru.is_active=true
        and ru.page_start=(v_create#>>'{boundary,pageStart}')::integer
        and ru.page_end=(v_create#>>'{boundary,pageEnd}')::integer
        and (v_create#>>'{boundary,remainingPageStart}')::integer between ru.page_start and ru.page_end
        and (v_create#>>'{boundary,remainingPageEnd}')::integer between ru.page_start and ru.page_end;
      if not found then raise exception 'PLANNER_V2_PHYSICAL_BOUNDARY_STALE'; end if;
    elsif v_create#>>'{boundary,kind}'='full_video' then
      select * into v_video from public.youtube_playlist_videos
      where id=(v_create#>>'{boundary,videoId}')::uuid and user_id=v_user
        and exam_profile_id=v_plan.exam_profile_id and is_active=true;
      if not found
        or v_create->>'canonicalWorkloadIdentity' <> 'youtube:'||v_video.id::text
        or (v_create#>>'{boundary,durationSeconds}')::integer <> v_video.duration_seconds
      then raise exception 'PLANNER_V2_YOUTUBE_BOUNDARY_STALE'; end if;
      select coalesce((
        select vp.watched_seconds from public.youtube_video_progress vp
        where vp.user_id=v_user and vp.youtube_playlist_video_id=v_video.id
      ),0) into v_watched_seconds;
      if (v_create#>>'{boundary,watchedSeconds}')::integer <> v_watched_seconds
      then raise exception 'PLANNER_V2_YOUTUBE_PROGRESS_STALE'; end if;
    else raise exception 'PLANNER_V2_BOUNDARY_UNSUPPORTED'; end if;

    insert into public.tasks(
      user_id,exam_profile_id,weekly_plan_id,subject_id,curriculum_node_id,resource_id,
      task_type,work_mode,title,planned_date,estimated_minutes,importance,priority_score,status,
      source_reason,dedupe_key,canonical_workload_identity,canonical_material_view_id,
      canonical_boundary,planner_version,planner_proposal_fingerprint
    ) values(
      v_user,v_plan.exam_profile_id,v_plan.id,(v_create->>'subjectId')::uuid,
      nullif(v_create->>'curriculumNodeId','')::uuid,(v_create->>'resourceId')::uuid,
      v_create->>'taskType',v_create->>'workMode',v_create->>'title',(v_create->>'plannedDate')::date,
      (v_create->>'estimatedMinutes')::integer,'important',50,'ready','planner_v2',
      v_create->>'dedupeKey',v_create->>'canonicalWorkloadIdentity',
      v_create->>'materialViewId',v_create->'boundary',v_row.planner_version,
      v_row.proposal_fingerprint
    ) returning id into v_task_id;
    insert into public.task_progress(task_id,user_id) values(v_task_id,v_user);
    if v_resource_unit_id is not null then
      insert into public.task_resource_units(user_id,task_id,resource_unit_id)
      values(v_user,v_task_id,v_resource_unit_id);
    end if;
    v_created_ids := array_append(v_created_ids,v_task_id);
    v_actual_minutes := v_actual_minutes+(v_create->>'estimatedMinutes')::integer;
  end loop;

  v_expected_minutes := (v_row.mutation_payload->>'expectedNewMinutes')::integer;
  if v_actual_minutes <> v_expected_minutes then raise exception 'PLANNER_V2_MINUTES_MISMATCH'; end if;
  select coalesce(sum(estimated_minutes),0)::integer into v_new_plan_minutes
  from public.tasks where weekly_plan_id=v_plan.id and user_id=v_user
    and status not in ('cancelled','missed');
  if v_new_plan_minutes > v_plan.planning_budget_minutes then
    raise exception 'PLANNER_V2_EXACT_CAPACITY_RECHECK_FAILED';
  end if;

  perform kpss_s0_private.validate_plan_delta(v_before,kpss_s0_private.planning_inputs(v_plan.exam_profile_id,v_plan.week_start_date));
  update public.weekly_plans set planned_minutes=v_new_plan_minutes,
    generation_version=generation_version+1 where id=v_plan.id;
  update public.confirmed_action_proposals set status='applied',applied_at=now(),
    result_payload=jsonb_build_object(
      'recordId',v_row.id,'proposalId',v_row.planner_proposal_id,'state','applied',
      'applied',true,'createdTaskIds',to_jsonb(v_created_ids),
      'replacedTaskIds',to_jsonb(v_replaced_ids),'plannedMinutes',v_new_plan_minutes,
      'idempotent',false
    ) where id=v_row.id returning result_payload into v_row.result_payload;
  return v_row.result_payload;
end;
$function$
;

notify pgrst,'reload schema';
commit;
