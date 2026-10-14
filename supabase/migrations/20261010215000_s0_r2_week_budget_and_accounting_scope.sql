begin;
-- Authoritative weekly ceiling complements per-day bounds, without conflating
-- actual extra study with planned credit or rewriting old diagnostic rows.
create function kpss_s0_private.weekly_remaining_budget(p_input jsonb)
returns integer language plpgsql immutable security invoker set search_path='' as $$
declare v_days integer; v_budget integer; v_credit integer;
begin
 select coalesce(sum(value::numeric),0)::integer into v_days from jsonb_each_text(kpss_s0_private.day_capacities(p_input,'p48'));
 select min((value->>'planning_budget_minutes')::integer) into v_budget from jsonb_array_elements(coalesce(p_input->'weekOverrides','[]'));
 if v_budget is null then return v_days; end if;
 select coalesce(sum((value->>'planned_credit_minutes')::integer),0)::integer into v_credit from jsonb_array_elements(p_input->'allocations') where ((value->>'session_started_at')::timestamptz at time zone 'Europe/Istanbul')::date between (p_input->>'weekStart')::date and (p_input->>'weekStart')::date+6;
 return least(v_days,greatest(0,v_budget-v_credit));
end; $$;
revoke all on function kpss_s0_private.weekly_remaining_budget(jsonb) from public,anon;
grant execute on function kpss_s0_private.weekly_remaining_budget(jsonb) to authenticated,service_role,kpss_plan_writer,kpss_baseline_writer;

CREATE OR REPLACE FUNCTION kpss_s0_private.validate_plan_delta(p_before jsonb, p_after jsonb, p_historical boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_task jsonb; v_old jsonb; v_date date; v_days jsonb; v_user uuid:=public.availability_actor_uid(); v_profile uuid:=(p_after#>>'{profile,id}')::uuid; v_need integer; v_new_work boolean:=false; v_target date;
begin
 if v_user is null or p_after#>>'{profile,user_id}' is distinct from v_user::text or p_after#>>'{profile,status}' is distinct from 'active' then raise exception 'NO_ACTIVE_EXAM_PROFILE'; end if;
 if p_historical then p_after:=jsonb_set(p_after,'{today}',p_after->'weekStart'); end if;
 v_days:=kpss_s0_private.day_capacities(p_after,'p48');
 v_target:=coalesce((p_after#>>'{profile,target_exam_date}')::date,(select min((value->>'target_exam_date')::date) from jsonb_array_elements(p_after->'strategies') where value->>'status'='active'));
 for v_task in select value from jsonb_array_elements(p_after->'tasks') loop
  select value into v_old from jsonb_array_elements(p_before->'tasks') where value->>'id'=v_task->>'id';
  -- Execution-only changes do not author planned work or invalidate old evidence.
  if v_old is not null and (v_task-'updated_at'-'status'-'completed_at')=(v_old-'updated_at'-'status'-'completed_at') then continue; end if;
  if v_task->>'status' in ('cancelled','missed') or v_task->>'planned_date' is null then continue; end if;
  -- Confirmed completed substitution is accounting evidence, not new scheduled work.
  if v_task->>'status'='completed' then continue; end if;
  -- A reviewed reduction on the same existing commitment creates no new workload,
  -- including explicit historical relief. Only the confirmed writer can reach it.
  if v_old is not null and v_old->>'status' not in ('cancelled','missed','completed')
    and (v_task-'updated_at'-'status'-'completed_at'-'estimated_minutes')=(v_old-'updated_at'-'status'-'completed_at'-'estimated_minutes')
    and (v_task->>'estimated_minutes')::integer <= (v_old->>'estimated_minutes')::integer then continue; end if;
  v_new_work:=true;
  v_date:=(v_task->>'planned_date')::date;
  if v_date not between (p_after->>'weekStart')::date and (p_after->>'weekStart')::date+6 or (not p_historical and v_date<(p_after->>'today')::date) then raise exception 'INVALID_PLAN_DATE'; end if;
  if not p_historical and (v_date<(p_after#>>'{profile,preparation_start_date}')::date or (v_target is not null and v_date>v_target)) then raise exception 'INVALID_PLAN_DATE'; end if;
  if (v_task->>'estimated_minutes')::integer not between 1 and 480 then raise exception 'INVALID_PLAN_MINUTES'; end if;
  if not exists(select 1 from public.user_subjects s where s.user_id=v_user and s.exam_profile_id=v_profile and s.subject_id=(v_task->>'subject_id')::uuid and s.status='active') then raise exception 'INVALID_PLAN_SUBJECT'; end if;
  if v_task->>'resource_id' is not null and not exists(select 1 from public.resources r where r.id=(v_task->>'resource_id')::uuid and r.user_id=v_user and r.exam_profile_id=v_profile and r.subject_id=(v_task->>'subject_id')::uuid and r.status='active') then raise exception 'INVALID_PLAN_RESOURCE'; end if;
  if v_task->>'curriculum_node_id' is not null and not exists(select 1 from public.curriculum_nodes n where n.id=(v_task->>'curriculum_node_id')::uuid and n.subject_id=(v_task->>'subject_id')::uuid and n.is_active) then raise exception 'INVALID_PLAN_CURRICULUM'; end if;
  if v_task->>'status'='completed' then continue; end if;
  select coalesce(sum(greatest(0,(t->>'estimated_minutes')::integer-coalesce((select (p->>'completed_minutes')::integer from jsonb_array_elements(p_after->'progress') p where p->>'task_id'=t->>'id'),0))),0)::integer into v_need
   from jsonb_array_elements(p_after->'tasks') t where (t->>'planned_date')::date=v_date and t->>'status' not in ('cancelled','missed','completed');
  if v_need>coalesce((v_days->>v_date::text)::numeric,0) then raise exception 'PLAN_CAPACITY_EXCEEDED'; end if;
 end loop;
 if v_new_work then
  select coalesce(sum(greatest(0,(t->>'estimated_minutes')::integer-coalesce((select (p->>'completed_minutes')::integer from jsonb_array_elements(p_after->'progress') p where p->>'task_id'=t->>'id'),0))),0)::integer into v_need
   from jsonb_array_elements(p_after->'tasks') t where (t->>'planned_date')::date between (p_after->>'today')::date and (p_after->>'weekStart')::date+6 and t->>'status' not in ('cancelled','missed','completed');
  if v_need>kpss_s0_private.weekly_remaining_budget(p_after) then raise exception 'PLAN_CAPACITY_EXCEEDED'; end if;
 end if;
end; $function$
;

CREATE OR REPLACE FUNCTION public.create_p48_week_once(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid:=public.availability_actor_uid(); v_profile public.exam_profiles; v_plan public.weekly_plans; v_task public.tasks;
  v_week date:=(p_payload->>'weekStartDate')::date; v_snapshot jsonb; v_input jsonb; v_days jsonb;
  v_block jsonb; v_subject uuid; v_resource uuid; v_date date; v_minutes integer; v_total integer:=0; v_available integer;
begin
  if v_user is null then raise exception 'UNAUTHORIZED'; end if;
  if p_payload->>'intent' is distinct from 'generate_week' then raise exception 'EXPLICIT_INTENT_REQUIRED'; end if;
  if v_week is null or extract(isodow from v_week)<>1 then raise exception 'INVALID_WEEK_START'; end if;
  select * into v_profile from public.exam_profiles where user_id=v_user and status='active' for update;
  if not found then raise exception 'NO_ACTIVE_EXAM_PROFILE'; end if;
  if not exists(select 1 from public.p48_strategy_profiles where user_id=v_user and exam_profile_id=v_profile.id and status='active') then raise exception 'P48_STRATEGY_NOT_CONFIGURED'; end if;
  select * into v_plan from public.weekly_plans where user_id=v_user and exam_profile_id=v_profile.id and week_start_date=v_week and status='active';
  if found then return jsonb_build_object('weeklyPlanId',v_plan.id,'created',false); end if;
  v_snapshot:=public.planning_week_snapshot(v_profile.id,v_week); v_input:=v_snapshot->'input'; v_days:=v_snapshot->'dayCapacities';
  if not exists(select 1 from public.p48_strategy_profiles where user_id=v_user and exam_profile_id=v_profile.id and status='active' and target_exam_date is not null) then raise exception 'P48_EXAM_DATE_REQUIRED'; end if;
  if not exists(select 1 from public.user_subjects where user_id=v_user and exam_profile_id=v_profile.id and status='active') then raise exception 'P48_SUBJECTS_REQUIRED'; end if;
  if not exists(select 1 from public.weekly_availability where user_id=v_user and exam_profile_id=v_profile.id and is_active and end_time>start_time)
    and not exists(select 1 from public.p48_daily_capacity_overrides where user_id=v_user and exam_profile_id=v_profile.id and capacity_date between v_week and v_week+6 and capacity_minutes>reserve_minutes) then raise exception 'P48_CAPACITY_SOURCE_MISSING'; end if;
  if not exists(select 1 from public.p48_resource_targets t join public.resources r on r.id=t.resource_id and r.user_id=v_user and r.exam_profile_id=v_profile.id and r.status='active'
    join public.user_subjects s on s.subject_id=r.subject_id and s.user_id=v_user and s.exam_profile_id=v_profile.id and s.status='active'
    where t.user_id=v_user and t.exam_profile_id=v_profile.id) then raise exception 'P48_RESOURCES_REQUIRED'; end if;
  if p_payload->>'expectedFingerprint' is null then raise exception 'PLANNING_FRESHNESS_REQUIRED'; end if;
  if p_payload->>'expectedFingerprint' is distinct from v_snapshot->>'fingerprint' then raise exception 'PLANNING_INPUT_STALE'; end if;
  if exists(select 1 from public.tasks where user_id=v_user and exam_profile_id=v_profile.id and planned_date between v_week and v_week+6 and status not in ('cancelled','missed')) then raise exception 'P48_EXISTING_COMMITMENTS'; end if;
  v_available:=kpss_s0_private.weekly_remaining_budget(v_input);
  if v_available<=0 then raise exception 'P48_NO_EFFECTIVE_CAPACITY'; end if;
  if jsonb_typeof(p_payload->'blocks') is distinct from 'array' or jsonb_array_length(p_payload->'blocks') not between 1 and 100 then raise exception 'INVALID_MANUAL_PLAN_MINUTES'; end if;
  for v_block in select value from jsonb_array_elements(p_payload->'blocks') loop
    v_date:=(v_block->>'plannedDate')::date; v_minutes:=(v_block->>'estimatedMinutes')::integer; v_subject:=(v_block->>'subjectId')::uuid; v_resource:=(v_block->>'resourceId')::uuid;
    if v_date is null or v_date<v_week or v_date>v_week+6 or v_date<(v_input->>'today')::date then raise exception 'INVALID_MANUAL_PLAN_DATE'; end if;
    if v_minutes is null or v_minutes not between 1 and 480 or jsonb_typeof(v_block->'estimatedMinutes') is distinct from 'number' or (v_block->>'estimatedMinutes')!~'^[0-9]+$' then raise exception 'INVALID_MANUAL_PLAN_MINUTES'; end if;
    if not exists(select 1 from public.user_subjects where user_id=v_user and exam_profile_id=v_profile.id and subject_id=v_subject and status='active') then raise exception 'INVALID_MANUAL_PLAN_SUBJECT'; end if;
    if v_resource is null or not exists(select 1 from public.resources r join public.p48_resource_targets t on t.resource_id=r.id and t.user_id=v_user and t.exam_profile_id=v_profile.id
      where r.id=v_resource and r.user_id=v_user and r.exam_profile_id=v_profile.id and r.subject_id=v_subject and r.status='active' and t.work_mode=v_block->>'workMode') then raise exception 'INVALID_MANUAL_PLAN_RESOURCE'; end if;
    if coalesce(btrim(v_block->>'title'),'')='' then raise exception 'INVALID_MANUAL_PLAN_TITLE'; end if;
    v_total:=v_total+v_minutes;
  end loop;
  if v_total>v_available or exists(select 1 from jsonb_array_elements(p_payload->'blocks') b group by b->>'plannedDate' having sum((b->>'estimatedMinutes')::integer)>coalesce((v_days->>(b->>'plannedDate'))::numeric,0)) then raise exception 'PLAN_CAPACITY_EXCEEDED'; end if;
  -- This is intentionally INSERT-only. No legacy replacement call, even on a
  -- service request whose earlier "no plan" read raced with a web creation.
  insert into public.weekly_plans(user_id,exam_profile_id,week_start_date,week_end_date,available_minutes,planning_budget_minutes,planned_minutes,status,generation_version)
    values(v_user,v_profile.id,v_week,v_week+6,v_available,v_available,v_total,'active',2) returning * into v_plan;
  for v_block in select value from jsonb_array_elements(p_payload->'blocks') loop
    insert into public.tasks(user_id,exam_profile_id,weekly_plan_id,subject_id,resource_id,task_type,work_mode,title,description,planned_date,estimated_minutes,importance,priority_score,status,source_reason,dedupe_key)
      values(v_user,v_profile.id,v_plan.id,(v_block->>'subjectId')::uuid,(v_block->>'resourceId')::uuid,'custom',v_block->>'workMode',btrim(v_block->>'title'),nullif(btrim(v_block->>'description'),''),(v_block->>'plannedDate')::date,(v_block->>'estimatedMinutes')::integer,'important',60,'ready','manual','manual|'||gen_random_uuid()::text) returning * into v_task;
    insert into public.task_progress(task_id,user_id,completed_minutes,actual_study_minutes) values(v_task.id,v_user,0,0);
  end loop;
  perform kpss_s0_private.validate_plan_delta(v_snapshot->'input',kpss_s0_private.planning_inputs(v_profile.id,v_week));
  return jsonb_build_object('weeklyPlanId',v_plan.id,'created',true,'plannedMinutes',v_total,'availableMinutes',v_available,'insertedTaskCount',jsonb_array_length(p_payload->'blocks'));
end; $function$
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
  select least(coalesce(sum(value::numeric),0)::integer,greatest(0,kpss_s0_private.weekly_remaining_budget(v_snapshot->'input')-(select coalesce(sum(greatest(0,t.estimated_minutes-coalesce(p.completed_minutes,0))),0)::integer from public.tasks t left join public.task_progress p on p.task_id=t.id where t.user_id=v_user and t.weekly_plan_id=v_plan.id and t.status not in ('cancelled','missed','completed') and t.planned_date>=(v_snapshot#>>'{input,today}')::date)))+v_preserved into v_available from jsonb_each_text(v_days);
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
  if p_payload->>'revisionType' is distinct from 'strategic_proposal' then
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
  end if;
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
  v_available:=kpss_s0_private.weekly_remaining_budget(jsonb_set(jsonb_set(v_after,'{today}',to_jsonb(v_plan.week_start_date)),'{allocations}','[]'::jsonb));
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

notify pgrst,'reload schema';
commit;
