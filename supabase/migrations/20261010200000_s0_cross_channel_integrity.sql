begin;

-- No LOGIN, membership, BYPASSRLS or schema CREATE authority is granted to callers.
create role kpss_availability_writer nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
-- Supabase's migration role is not superuser. Membership is granted only to
-- the trusted migration operator, never to authenticated/service callers.
grant kpss_availability_writer to postgres;
grant usage, create on schema public to kpss_availability_writer;
-- SQL-standard body binds auth.uid's OID at creation. The narrow owner needs
-- no auth-schema access or inherited authenticated table privileges.
create function public.availability_actor_uid() returns uuid language sql stable security invoker set search_path='' return auth.uid();
revoke all on function public.availability_actor_uid() from public,anon;
grant execute on function public.availability_actor_uid() to authenticated,service_role,kpss_availability_writer;
do $$ declare v_signature text; v_definition text; begin
  foreach v_signature in array array['public.weekly_availability_state(uuid)','public.replace_weekly_availability(uuid,jsonb,text)'] loop
    v_definition:=pg_get_functiondef(v_signature::regprocedure);
    if position('auth.uid()' in v_definition)=0 then raise exception 'EXPECTED_AVAILABILITY_DEFINITION_REQUIRED'; end if;
    execute replace(v_definition,'auth.uid()','public.availability_actor_uid()');
  end loop;
end $$;
grant select on public.exam_profiles, public.weekly_availability to kpss_availability_writer;
grant update(id) on public.exam_profiles to kpss_availability_writer;
grant insert, delete on public.weekly_availability to kpss_availability_writer;
grant execute on function public.weekly_availability_state(uuid) to kpss_availability_writer;
create policy "Atomic availability reads owned profile" on public.exam_profiles
  for select to kpss_availability_writer using ((select auth.uid())=user_id);
create policy "Atomic availability locks owned profile" on public.exam_profiles
  for update to kpss_availability_writer using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "Atomic availability owns rows" on public.weekly_availability
  for all to kpss_availability_writer using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
-- Preserve the reviewed validation/revision/idempotency body; only this narrow
-- owner may perform its DELETE/INSERT. The identical owner predicate is enforced
-- by dedicated policies for this non-login role (no RLS bypass or broad inheritance).
alter function public.replace_weekly_availability(uuid,jsonb,text) security definer;
alter function public.replace_weekly_availability(uuid,jsonb,text) owner to kpss_availability_writer;
revoke create on schema public from kpss_availability_writer;
revoke all on function public.replace_weekly_availability(uuid,jsonb,text) from public, anon;
grant execute on function public.replace_weekly_availability(uuid,jsonb,text) to authenticated, service_role;
revoke insert, update, delete, truncate, references, trigger on public.weekly_availability from public, anon, authenticated, service_role;

create function public.service_replace_weekly_availability(p_user_id uuid,p_exam_profile_id uuid,p_windows jsonb,p_expected_revision text)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
  if p_user_id is null then raise exception 'UNAUTHORIZED'; end if;
  perform set_config('request.jwt.claim.sub',p_user_id::text,true);
  return public.replace_weekly_availability(p_exam_profile_id,p_windows,p_expected_revision);
end; $$;
revoke all on function public.service_replace_weekly_availability(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.service_replace_weekly_availability(uuid,uuid,jsonb,text) to service_role;

create schema kpss_s0_private;
revoke all on schema kpss_s0_private from public,anon;
grant usage on schema kpss_s0_private to authenticated,service_role,kpss_availability_writer;

-- Every persisted input writer, including direct REST and trusted workers,
-- participates before changing a row. Profile row locks are transaction scoped.
create function kpss_s0_private.lock_planning_profile()
returns trigger language plpgsql security invoker set search_path='' as $$
declare
  v_old uuid;
  v_new uuid;
  v_id uuid;
begin
  if tg_table_name='task_progress' then
    if tg_op<>'INSERT' then select exam_profile_id into v_old from public.tasks where id=old.task_id; end if;
    if tg_op<>'DELETE' then select exam_profile_id into v_new from public.tasks where id=new.task_id; end if;
  else
    if tg_op<>'INSERT' then v_old:=old.exam_profile_id; end if;
    if tg_op<>'DELETE' then v_new:=new.exam_profile_id; end if;
  end if;
  for v_id in select distinct x from unnest(array[v_old,v_new]) x where x is not null order by x loop
    perform 1 from public.exam_profiles where id=v_id for update;
    -- A cascading delete may already have removed the profile. No new state
    -- can then be planned for it; ordinary mutations still have owner FKs/RLS.
  end loop;
  if tg_op='DELETE' then return old; else return new; end if;
end; $$;

do $$ declare v_table text; begin
  foreach v_table in array array['weekly_availability','user_subjects','resources','calendar_periods','schedule_exceptions',
    'p48_strategy_profiles','p48_resource_targets','p48_daily_capacity_overrides','study_sessions','study_session_allocations',
    'weekly_plans','tasks','task_progress'] loop
    execute format('create trigger s0_planning_profile_lock before insert or update or delete on public.%I for each row execute function kpss_s0_private.lock_planning_profile()',v_table);
  end loop;
end $$;

-- One owned snapshot under the same lock. VOLATILE callers reread after waiting
-- for the lock, rather than retaining an earlier statement's stale snapshot.
create function kpss_s0_private.planning_inputs(p_profile uuid,p_week date)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare v_user uuid:=auth.uid(); v_profile public.exam_profiles; v jsonb;
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
    'targets',(select coalesce(jsonb_agg(to_jsonb(t) order by resource_id),'[]'::jsonb) from public.p48_resource_targets t where user_id=v_user and exam_profile_id=p_profile),
    'sessions',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.study_sessions t where user_id=v_user and exam_profile_id=p_profile),
    'allocations',(select coalesce(jsonb_agg(to_jsonb(t)||jsonb_build_object('session_started_at',s.started_at) order by t.id),'[]'::jsonb) from public.study_session_allocations t join public.study_sessions s on s.id=t.session_id where t.user_id=v_user and t.exam_profile_id=p_profile and t.superseded_at is null),
    'plans',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.weekly_plans t where user_id=v_user and exam_profile_id=p_profile and week_start_date=p_week),
    'tasks',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.tasks t where user_id=v_user and exam_profile_id=p_profile and (planned_date between p_week and p_week+6 or weekly_plan_id in(select id from public.weekly_plans where user_id=v_user and exam_profile_id=p_profile and week_start_date=p_week))),
    'progress',(select coalesce(jsonb_agg(to_jsonb(t) order by task_id),'[]'::jsonb) from public.task_progress t join public.tasks x on x.id=t.task_id where t.user_id=v_user and x.exam_profile_id=p_profile)
  ) into v;
  return v;
end; $$;

-- SQL parity with domain/adaptive/capacity.ts and capacity-overrides.ts:
-- interval union/intersection, min calendar multiplier, JS rounding, exception
-- deltas, reserve and separate actual-vs-planned-credit accounting dimensions.
create function kpss_s0_private.day_capacities(p_input jsonb,p_mode text)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare
  v_date date; v_week date:=(p_input->>'weekStart')::date; v_today date:=(p_input->>'today')::date;
  v_w int4multirange; v_u int4multirange; v_row jsonb; v_override jsonb;
  v_base numeric; v_removed numeric; v_multiplier numeric; v_delta numeric;
  v_calculated numeric; v_base_calculated numeric; v_planning numeric; v_spent numeric;
  v_start integer; v_end integer; v_result jsonb:='{}'::jsonb;
begin
  if p_mode not in ('p48','manual') or p_mode is null then raise exception 'INVALID_CAPACITY_MODE'; end if;
  for i in 0..6 loop
    v_date:=v_week+i; v_w:='{}'::int4multirange; v_u:='{}'::int4multirange;
    for v_row in select value from jsonb_array_elements(p_input->'availability') where (value->>'is_active')::boolean and (value->>'weekday')::integer=extract(isodow from v_date) loop
      v_start:=extract(hour from (v_row->>'start_time')::time)::int*60+extract(minute from (v_row->>'start_time')::time)::int;
      v_end:=extract(hour from (v_row->>'end_time')::time)::int*60+extract(minute from (v_row->>'end_time')::time)::int;
      v_w:=v_w+int4multirange(int4range(v_start,v_end,'[)'));
    end loop;
    for v_row in select value from jsonb_array_elements(p_input->'exceptions') where (value->>'exception_date')::date=v_date and value->>'exception_type'='unavailable' and value->>'start_time' is not null loop
      v_start:=extract(hour from (v_row->>'start_time')::time)::int*60+extract(minute from (v_row->>'start_time')::time)::int;
      v_end:=extract(hour from (v_row->>'end_time')::time)::int*60+extract(minute from (v_row->>'end_time')::time)::int;
      v_u:=v_u+int4multirange(int4range(v_start,v_end,'[)'));
    end loop;
    select coalesce(sum(upper(r)-lower(r)),0) into v_base from unnest(v_w) r;
    select coalesce(sum(upper(r)-lower(r)),0) into v_removed from unnest(v_w*v_u) r;
    select coalesce(min((value->>'capacity_multiplier')::numeric),1) into v_multiplier from jsonb_array_elements(p_input->'periods') where (value->>'start_date')::date<=v_date and (value->>'end_date')::date>=v_date;
    select coalesce(sum((value->>'minutes_delta')::numeric),0) into v_delta from jsonb_array_elements(p_input->'exceptions') where (value->>'exception_date')::date=v_date and value->>'exception_type' in ('extra_available','custom','unavailable');
    v_base_calculated:=greatest(0,floor(v_base*greatest(0,v_multiplier)+0.5));
    v_calculated:=greatest(0,floor((v_base-v_removed)*greatest(0,v_multiplier)+v_delta+0.5));
    select value into v_override from jsonb_array_elements(p_input->'overrides') where (value->>'capacity_date')::date=v_date;
    v_planning:=case when v_override is null then v_calculated else greatest(0,(v_override->>'capacity_minutes')::numeric-(v_override->>'reserve_minutes')::numeric+v_calculated-v_base_calculated) end;
    if p_mode='p48' then
      select coalesce(sum(greatest(0,(value->>'planned_credit_minutes')::numeric)),0) into v_spent from jsonb_array_elements(p_input->'allocations') where ((value->>'session_started_at')::timestamptz at time zone 'Europe/Istanbul')::date=v_date;
    else
      select coalesce(sum(greatest(0,(value->>'duration_minutes')::numeric)),0) into v_spent from jsonb_array_elements(p_input->'sessions') where value->>'status'='completed' and ((value->>'started_at')::timestamptz at time zone 'Europe/Istanbul')::date=v_date;
    end if;
    v_result:=v_result||jsonb_build_object(v_date::text,case when v_date<v_today then 0 else greatest(0,v_planning-v_spent) end);
  end loop;
  return v_result;
end; $$;

create function public.planning_week_snapshot(p_exam_profile_id uuid,p_week_start date)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare v jsonb;
begin
  v:=kpss_s0_private.planning_inputs(p_exam_profile_id,p_week_start);
  return jsonb_build_object('input',v,'fingerprint',md5(v::text),'dayCapacities',kpss_s0_private.day_capacities(v,'p48'),'manualDayCapacities',kpss_s0_private.day_capacities(v,'manual'));
end; $$;
revoke all on function public.planning_week_snapshot(uuid,date) from public,anon;
grant execute on function public.planning_week_snapshot(uuid,date) to authenticated,service_role;

create function public.service_planning_week_snapshot(p_user_id uuid,p_exam_profile_id uuid,p_week_start date)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
  if p_user_id is null then raise exception 'UNAUTHORIZED'; end if;
  perform set_config('request.jwt.claim.sub',p_user_id::text,true);
  return public.planning_week_snapshot(p_exam_profile_id,p_week_start);
end; $$;
revoke all on function public.service_planning_week_snapshot(uuid,uuid,date) from public,anon,authenticated;
grant execute on function public.service_planning_week_snapshot(uuid,uuid,date) to service_role;

create or replace function public.create_p48_week_once(p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_user uuid:=auth.uid(); v_profile public.exam_profiles; v_plan public.weekly_plans; v_task public.tasks;
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
  select coalesce(sum(value::numeric),0)::integer into v_available from jsonb_each_text(v_days);
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
  return jsonb_build_object('weeklyPlanId',v_plan.id,'created',true,'plannedMinutes',v_total,'availableMinutes',v_available,'insertedTaskCount',jsonb_array_length(p_payload->'blocks'));
end; $$;
revoke all on function public.create_p48_week_once(jsonb) from public,anon;
grant execute on function public.create_p48_week_once(jsonb) to authenticated,service_role;

-- Keep the old service signature fail-closed for old bundles: existing weeks
-- are a no-op; absent weeks require the new fingerprint and bounded contract.
create or replace function public.service_replace_manual_weekly_plan(p_user_id uuid,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
  if p_user_id is null then raise exception 'UNAUTHORIZED'; end if;
  perform set_config('request.jwt.claim.sub',p_user_id::text,true);
  return public.create_p48_week_once(p_payload||jsonb_build_object('intent','generate_week'));
end; $$;
revoke all on function public.service_replace_manual_weekly_plan(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.service_replace_manual_weekly_plan(uuid,jsonb) to service_role;

revoke all on all functions in schema kpss_s0_private from public,anon;
grant execute on all functions in schema kpss_s0_private to authenticated,service_role;
grant execute on function kpss_s0_private.lock_planning_profile() to kpss_availability_writer;

-- Manual review authority is retained below, with the same input lock,
-- commit-time budget and explicit freshness, and canonical/baseline protection.
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

  return jsonb_build_object(
    'weeklyPlanId', v_plan.id,
    'insertedTaskCount', v_inserted,
    'preservedMinutes', v_preserved,
    'plannedMinutes', v_planned,
    'availableMinutes', v_available
  );
end;
$$;

commit;
