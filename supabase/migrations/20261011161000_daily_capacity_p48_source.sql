begin;
-- Preserve explicit P48/configuration/freshness authority; select the persisted capacity source.
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
  if v_input#>>'{capacitySource,mode}'='daily_minutes' then
    if not exists(select 1 from jsonb_array_elements(v_input#>'{capacitySource,days}') where (value->>'minutes')::integer>0) then raise exception 'P48_CAPACITY_SOURCE_MISSING'; end if;
  else
  if not exists(select 1 from public.weekly_availability where user_id=v_user and exam_profile_id=v_profile.id and is_active and end_time>start_time)
    and not exists(select 1 from public.p48_daily_capacity_overrides where user_id=v_user and exam_profile_id=v_profile.id and capacity_date between v_week and v_week+6 and capacity_minutes>reserve_minutes) then raise exception 'P48_CAPACITY_SOURCE_MISSING'; end if;
  end if;
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
end; $function$;
notify pgrst, 'reload schema';
commit;
