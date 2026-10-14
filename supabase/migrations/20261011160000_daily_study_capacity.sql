begin;

-- Forward-only S1-A. No existing preference, window, plan or session is rewritten.
create role kpss_capacity_writer nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
grant kpss_capacity_writer to postgres;
grant usage on schema public, kpss_s0_private to kpss_capacity_writer;
grant execute on function public.availability_actor_uid() to kpss_capacity_writer;

create function kpss_s0_private.normalize_daily_capacity(p_days jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare d jsonb; v_total integer:=0; v_result jsonb;
begin
 if jsonb_typeof(p_days) is distinct from 'array' then raise exception 'INVALID_DAILY_CAPACITY'; end if;
 if jsonb_array_length(p_days)<>7 then raise exception 'INVALID_DAILY_CAPACITY'; end if;
 for d in select value from jsonb_array_elements(p_days) loop
  if jsonb_typeof(d) is distinct from 'object' or not(d ?& array['weekday','minutes']) then raise exception 'INVALID_DAILY_CAPACITY'; end if;
  if exists(select 1 from jsonb_object_keys(d) k where k not in ('weekday','minutes')) then raise exception 'INVALID_DAILY_CAPACITY'; end if;
  if jsonb_typeof(d->'weekday') is distinct from 'number' or (d->>'weekday') !~ '^[1-7]$'
   or jsonb_typeof(d->'minutes') is distinct from 'number' or (d->>'minutes') !~ '^[0-9]{1,4}$'
   or (d->>'minutes')::integer>1440 then raise exception 'INVALID_DAILY_CAPACITY'; end if;
  v_total:=v_total+(d->>'minutes')::integer;
 end loop;
 if (select count(distinct value->>'weekday') from jsonb_array_elements(p_days))<>7 or v_total>10080 then raise exception 'INVALID_DAILY_CAPACITY'; end if;
 select jsonb_agg(jsonb_build_object('weekday',(value->>'weekday')::integer,'minutes',(value->>'minutes')::integer) order by (value->>'weekday')::integer) into v_result from jsonb_array_elements(p_days);
 return v_result;
end; $$;

create table public.study_capacity_preferences (
 exam_profile_id uuid primary key references public.exam_profiles(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 mode text not null check(mode in ('time_windows','daily_minutes')),
 days jsonb not null check(days=kpss_s0_private.normalize_daily_capacity(days)),
 revision bigint not null check(revision>0),
 updated_at timestamptz not null default now()
);
create table public.study_capacity_history (
 id bigint generated always as identity primary key,
 exam_profile_id uuid not null references public.exam_profiles(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 mode text not null check(mode in ('time_windows','daily_minutes')),
 days jsonb not null check(days=kpss_s0_private.normalize_daily_capacity(days)),
 revision bigint not null,
 created_at timestamptz not null default now(),
 unique(exam_profile_id,revision)
);
alter table public.study_capacity_preferences enable row level security;
alter table public.study_capacity_history enable row level security;
revoke all on public.study_capacity_preferences,public.study_capacity_history from public,anon,authenticated,service_role;
grant select on public.study_capacity_preferences,public.study_capacity_history to authenticated,service_role,kpss_capacity_writer;
grant select on public.study_capacity_preferences to kpss_plan_writer,kpss_baseline_writer,kpss_execution_writer,kpss_availability_writer;
grant insert,update on public.study_capacity_preferences to kpss_capacity_writer;
grant insert on public.study_capacity_history to kpss_capacity_writer;
revoke all on sequence public.study_capacity_history_id_seq from public,anon,authenticated,service_role;
grant usage on sequence public.study_capacity_history_id_seq to kpss_capacity_writer;
create policy "Owned capacity reads" on public.study_capacity_preferences for select to authenticated,kpss_capacity_writer,kpss_plan_writer,kpss_baseline_writer,kpss_execution_writer,kpss_availability_writer using(user_id=public.availability_actor_uid());
create policy "Owned capacity inserts" on public.study_capacity_preferences for insert to kpss_capacity_writer with check(user_id=public.availability_actor_uid() and exists(select 1 from public.exam_profiles p where p.id=exam_profile_id and p.user_id=public.availability_actor_uid() and p.status in ('draft','active')));
create policy "Owned capacity updates" on public.study_capacity_preferences for update to kpss_capacity_writer using(user_id=public.availability_actor_uid()) with check(user_id=public.availability_actor_uid() and exists(select 1 from public.exam_profiles p where p.id=exam_profile_id and p.user_id=public.availability_actor_uid() and p.status in ('draft','active')));
create policy "Owned capacity history reads" on public.study_capacity_history for select to authenticated,kpss_capacity_writer using(user_id=public.availability_actor_uid());
create policy "Owned capacity history inserts" on public.study_capacity_history for insert to kpss_capacity_writer with check(user_id=public.availability_actor_uid());
create trigger s0_lock_capacity_preferences before insert or update or delete on public.study_capacity_preferences for each row execute function kpss_s0_private.lock_planning_profile();

grant select on public.exam_profiles,public.weekly_availability,public.calendar_periods,public.schedule_exceptions,public.p48_daily_capacity_overrides,public.p48_week_capacity_overrides,public.study_sessions,public.study_session_allocations,public.tasks,public.task_progress to kpss_capacity_writer;
grant update(id) on public.exam_profiles to kpss_capacity_writer;
create policy "Capacity writer profile lock" on public.exam_profiles for update to kpss_capacity_writer using(user_id=public.availability_actor_uid()) with check(user_id=public.availability_actor_uid());
do $$ declare t text; begin
 foreach t in array array['exam_profiles','weekly_availability','calendar_periods','schedule_exceptions','p48_daily_capacity_overrides','p48_week_capacity_overrides','study_sessions','study_session_allocations','tasks','task_progress'] loop
  execute format('create policy "Capacity writer owned reads" on public.%I for select to kpss_capacity_writer using(user_id=public.availability_actor_uid())',t);
 end loop;
end $$;

create function kpss_s0_private.capacity_source(p_profile uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce((select jsonb_build_object('mode',mode,'days',days,'revision',revision) from public.study_capacity_preferences where exam_profile_id=p_profile and user_id=public.availability_actor_uid()),jsonb_build_object('mode','time_windows','days',(select jsonb_agg(jsonb_build_object('weekday',i,'minutes',0) order by i) from generate_series(1,7) i),'revision',0));
$$;

create function public.study_capacity_state(p_exam_profile_id uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_windows jsonb; v_source jsonb;
begin
 v_windows:=public.weekly_availability_state(p_exam_profile_id);
 v_source:=kpss_s0_private.capacity_source(p_exam_profile_id);
 return v_source||jsonb_build_object('revision',md5((v_source||jsonb_build_object('windowsRevision',v_windows->'revision'))::text),'windows',v_windows->'windows','windowsRevision',v_windows->'revision');
end; $$;

-- Read-only capacity inputs support owned drafts; this does NOT relax R2's active-profile writer check.
create function kpss_s0_private.capacity_read_inputs(p_profile uuid,p_week date)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_user uuid:=public.availability_actor_uid(); v_profile public.exam_profiles;
begin
 if v_user is null then raise exception 'UNAUTHORIZED'; end if;
 if p_week is null or extract(isodow from p_week)<>1 then raise exception 'INVALID_WEEK_START'; end if;
 select * into v_profile from public.exam_profiles where id=p_profile and user_id=v_user and status in ('draft','active');
 if not found then raise exception 'EXAM_PROFILE_NOT_FOUND'; end if;
 return jsonb_build_object('profile',to_jsonb(v_profile),'today',(now() at time zone 'Europe/Istanbul')::date,'weekStart',p_week,'capacitySource',kpss_s0_private.capacity_source(p_profile),
  'availability',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.weekly_availability t where user_id=v_user and exam_profile_id=p_profile),
  'periods',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.calendar_periods t where user_id=v_user and exam_profile_id=p_profile),
  'exceptions',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.schedule_exceptions t where user_id=v_user and exam_profile_id=p_profile and exception_date between p_week and p_week+6),
  'overrides',(select coalesce(jsonb_agg(to_jsonb(t) order by capacity_date),'[]') from public.p48_daily_capacity_overrides t where user_id=v_user and exam_profile_id=p_profile and capacity_date between p_week and p_week+6),
  'weekOverrides',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.p48_week_capacity_overrides t where user_id=v_user and exam_profile_id=p_profile and week_start_date=p_week),
  'sessions',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.study_sessions t where user_id=v_user and exam_profile_id=p_profile),
  'allocations',(select coalesce(jsonb_agg(to_jsonb(t)||jsonb_build_object('session_started_at',s.started_at) order by t.id),'[]') from public.study_session_allocations t join public.study_sessions s on s.id=t.session_id where t.user_id=v_user and t.exam_profile_id=p_profile and t.superseded_at is null),
  'tasks',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.tasks t where user_id=v_user and exam_profile_id=p_profile and planned_date between p_week and p_week+6),
  'progress',(select coalesce(jsonb_agg(to_jsonb(t) order by task_id),'[]') from public.task_progress t join public.tasks x on x.id=t.task_id where t.user_id=v_user and x.exam_profile_id=p_profile));
end; $$;

create function kpss_s0_private.capacity_readiness(p_input jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare v_days jsonb; v_gross integer; v_budget integer; v_need integer:=0; v_remaining integer:=0; v_day_need integer; d record; v_exceeded boolean:=false; v_mode text:=coalesce(p_input#>>'{capacitySource,mode}','time_windows');
begin
 if v_mode='daily_minutes' then
  select coalesce(sum((value->>'minutes')::integer),0) into v_gross from jsonb_array_elements(p_input#>'{capacitySource,days}');
 else
  select coalesce(sum(extract(epoch from ((value->>'end_time')::time-(value->>'start_time')::time))/60),0)::integer into v_gross from jsonb_array_elements(p_input->'availability') where (value->>'is_active')::boolean;
 end if;
 begin
  v_days:=kpss_s0_private.day_capacities(p_input,'p48');
  v_budget:=kpss_s0_private.weekly_remaining_budget(p_input);
 exception when raise_exception then
  if sqlerrm<>'CAPACITY_TIMED_EXCEPTION_UNSUPPORTED' then raise; end if;
  return jsonb_build_object('weekStart',p_input->'weekStart','mode',v_mode,'weeklyGrossMinutes',v_gross,'weeklyState',case when v_gross=0 then 'NO_CAPACITY_ENTERED' else 'VALID_WEEKLY_CAPACITY' end,'status','CAPACITY_TIMED_EXCEPTION_UNSUPPORTED','remainingMinutes',null,'protectedWorkExceedsCapacity',null,'legacyPlannerSupported',false,'planReady',false);
 end;
 for d in select key,value::integer minutes from jsonb_each_text(v_days) loop
  select coalesce(sum(greatest(0,(t->>'estimated_minutes')::integer-coalesce((select (p->>'completed_minutes')::integer from jsonb_array_elements(p_input->'progress') p where p->>'task_id'=t->>'id'),0))),0)::integer into v_day_need from jsonb_array_elements(p_input->'tasks') t where t->>'planned_date'=d.key and d.key>=p_input->>'today' and t->>'status' not in ('cancelled','missed','completed');
  v_need:=v_need+v_day_need; v_remaining:=v_remaining+greatest(0,d.minutes-v_day_need);
  v_exceeded:=v_exceeded or v_day_need>d.minutes;
 end loop;
 v_exceeded:=v_exceeded or v_need>v_budget;
 v_remaining:=least(v_remaining,greatest(0,v_budget-v_need));
 return jsonb_build_object('weekStart',p_input->'weekStart','mode',v_mode,'weeklyGrossMinutes',v_gross,'weeklyState',case when v_gross=0 then 'NO_CAPACITY_ENTERED' else 'VALID_WEEKLY_CAPACITY' end,
  'status',case when v_exceeded then 'PROTECTED_WORK_EXCEEDS_CAPACITY' when v_gross=0 then 'NO_CAPACITY_ENTERED' when v_remaining=0 then 'NO_USABLE_CAPACITY' else 'USABLE_CAPACITY' end,
  'dayCapacities',v_days,'weeklyBudgetMinutes',v_budget,'committedMinutes',v_need,'remainingMinutes',v_remaining,'protectedWorkExceedsCapacity',v_exceeded,'legacyPlannerSupported',v_mode='time_windows','planReady',false);
end; $$;

create function public.study_capacity_readiness(p_exam_profile_id uuid,p_week_start date,p_proposed_days jsonb default null,p_proposed_mode text default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v jsonb;
begin
 v:=kpss_s0_private.capacity_read_inputs(p_exam_profile_id,p_week_start);
 if p_proposed_mode is not null and p_proposed_mode not in ('daily_minutes','time_windows') then raise exception 'INVALID_CAPACITY_MODE'; end if;
 if p_proposed_days is not null or p_proposed_mode='daily_minutes' then
  v:=jsonb_set(v,'{capacitySource}',jsonb_build_object('mode','daily_minutes','days',kpss_s0_private.normalize_daily_capacity(p_proposed_days)));
 elsif p_proposed_mode='time_windows' then v:=jsonb_set(v,'{capacitySource}',jsonb_build_object('mode','time_windows')); end if;
 return kpss_s0_private.capacity_readiness(v);
end; $$;

create function public.set_study_capacity(p_exam_profile_id uuid,p_mode text,p_days jsonb,p_expected_revision text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=public.availability_actor_uid(); v_state jsonb; v_days jsonb; v_revision bigint; w record; v_ready jsonb; v_today date:=(now() at time zone 'Europe/Istanbul')::date;
begin
 if v_user is null then raise exception 'UNAUTHORIZED'; end if;
 perform 1 from public.exam_profiles where id=p_exam_profile_id and user_id=v_user and status in ('draft','active') for update;
 if not found then raise exception 'EXAM_PROFILE_NOT_FOUND'; end if;
 if p_mode is null or p_mode not in ('daily_minutes','time_windows') then raise exception 'INVALID_CAPACITY_MODE'; end if;
 if p_expected_revision is null or p_expected_revision !~ '^[a-f0-9]{32}$' then raise exception 'CAPACITY_REVISION_REQUIRED'; end if;
 v_state:=public.study_capacity_state(p_exam_profile_id);
 v_days:=case when p_mode='daily_minutes' then kpss_s0_private.normalize_daily_capacity(p_days) else v_state->'days' end;
 if v_state->>'mode'=p_mode and v_state->'days'=v_days then return v_state||jsonb_build_object('changed',false); end if;
 if v_state->>'revision'<>p_expected_revision then raise exception 'CAPACITY_CONFLICT'; end if;
 select coalesce(max(revision),0)+1 into v_revision from public.study_capacity_preferences where exam_profile_id=p_exam_profile_id and user_id=v_user;
 insert into public.study_capacity_preferences(exam_profile_id,user_id,mode,days,revision) values(p_exam_profile_id,v_user,p_mode,v_days,v_revision)
 on conflict(exam_profile_id) do update set mode=excluded.mode,days=excluded.days,revision=excluded.revision,updated_at=now();
 -- Validate every existing future commitment under the new recurring authority.
 -- Any rejection rolls preferences/history back; no task, session or window changes.
 for w in select distinct date_trunc('week',planned_date)::date week_start from public.tasks where user_id=v_user and exam_profile_id=p_exam_profile_id and planned_date>=v_today and status not in ('cancelled','missed','completed') loop
  v_ready:=public.study_capacity_readiness(p_exam_profile_id,w.week_start);
  if v_ready->>'status'='CAPACITY_TIMED_EXCEPTION_UNSUPPORTED' then raise exception 'CAPACITY_TIMED_EXCEPTION_UNSUPPORTED'; end if;
  if (v_ready->>'protectedWorkExceedsCapacity')::boolean then raise exception 'CAPACITY_PROTECTED_WORK_EXCEEDED'; end if;
 end loop;
 insert into public.study_capacity_history(exam_profile_id,user_id,mode,days,revision) values(p_exam_profile_id,v_user,p_mode,v_days,v_revision);
 return public.study_capacity_state(p_exam_profile_id)||jsonb_build_object('changed',true);
end; $$;

-- Explicit ACLs: only this non-login owner can write the new preferences/history.
revoke all on function kpss_s0_private.normalize_daily_capacity(jsonb),kpss_s0_private.capacity_source(uuid),kpss_s0_private.capacity_read_inputs(uuid,date),kpss_s0_private.capacity_readiness(jsonb) from public,anon;
grant execute on function kpss_s0_private.normalize_daily_capacity(jsonb),kpss_s0_private.capacity_source(uuid),kpss_s0_private.capacity_read_inputs(uuid,date),kpss_s0_private.capacity_readiness(jsonb) to authenticated,service_role,kpss_capacity_writer,kpss_plan_writer,kpss_baseline_writer,kpss_execution_writer,kpss_availability_writer;
grant execute on function kpss_s0_private.day_capacities(jsonb,text),kpss_s0_private.weekly_remaining_budget(jsonb),kpss_s0_private.lock_planning_profile() to kpss_capacity_writer;
revoke all on function public.study_capacity_state(uuid),public.study_capacity_readiness(uuid,date,jsonb,text),public.set_study_capacity(uuid,text,jsonb,text) from public,anon;
grant execute on function public.study_capacity_state(uuid),public.study_capacity_readiness(uuid,date,jsonb,text) to authenticated,service_role,kpss_capacity_writer;
grant execute on function public.weekly_availability_state(uuid) to kpss_capacity_writer;
grant execute on function public.set_study_capacity(uuid,text,jsonb,text) to authenticated,service_role;
grant create on schema public to kpss_capacity_writer;
alter function public.set_study_capacity(uuid,text,jsonb,text) owner to kpss_capacity_writer;
revoke create on schema public from kpss_capacity_writer;

-- The following full definitions preserve their accepted legacy body and ACL/owner.

CREATE OR REPLACE FUNCTION kpss_s0_private.day_capacities(p_input jsonb, p_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
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
    if p_input#>>'{capacitySource,mode}'='daily_minutes' then
      if v_date<v_today or v_date<(p_input#>>'{profile,preparation_start_date}')::date or v_date>(p_input#>>'{profile,target_exam_date}')::date then
        v_result:=v_result||jsonb_build_object(v_date::text,0); continue;
      end if;
      if exists(select 1 from jsonb_array_elements(p_input->'exceptions') where (value->>'exception_date')::date=v_date and value->>'exception_type'='unavailable' and value->>'start_time' is not null) then raise exception 'CAPACITY_TIMED_EXCEPTION_UNSUPPORTED'; end if;
      select (value->>'minutes')::integer into v_base from jsonb_array_elements(p_input#>'{capacitySource,days}') where (value->>'weekday')::integer=extract(isodow from v_date);
      if v_base is null or v_base not between 0 and 1440 then raise exception 'INVALID_DAILY_CAPACITY'; end if;
      v_removed:=0;
    else
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
    end if;
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
end; $function$;

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
    'carryovers',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.task_carryovers t where user_id=v_user and exam_profile_id=p_profile and status='applied'),
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
  if kpss_s0_private.capacity_source(p_profile)->>'mode'='daily_minutes' then
    v:=v||jsonb_build_object('capacitySource',kpss_s0_private.capacity_source(p_profile));
  end if;
  return v;
end; $function$;

CREATE OR REPLACE FUNCTION public.replace_weekly_availability(p_exam_profile_id uuid, p_windows jsonb, p_expected_revision text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := public.availability_actor_uid();
  v_item jsonb;
  v_normalized jsonb := '[]'::jsonb;
  v_current jsonb;
  v_state jsonb;
  v_capacity integer;
begin
  if v_user is null then raise exception 'UNAUTHORIZED'; end if;
  -- Serializes replacements for this owned profile, including initially empty
  -- schedules. RLS remains in force for every SELECT/DELETE/INSERT below.
  perform 1 from public.exam_profiles
  where id=p_exam_profile_id and user_id=v_user and status in ('draft','active')
  for update;
  if not found then raise exception 'EXAM_PROFILE_NOT_FOUND'; end if;
  if kpss_s0_private.capacity_source(p_exam_profile_id)->>'mode'='daily_minutes' then raise exception 'CAPACITY_MODE_CHANGE_REQUIRED'; end if;
  if p_expected_revision is null or p_expected_revision !~ '^[a-f0-9]{32}$' then
    raise exception 'AVAILABILITY_REVISION_REQUIRED';
  end if;
  if jsonb_typeof(p_windows) is distinct from 'array' then raise exception 'INVALID_AVAILABILITY'; end if;
  if jsonb_array_length(p_windows)>100 then raise exception 'INVALID_AVAILABILITY'; end if;
  for v_item in select value from jsonb_array_elements(p_windows) loop
    if jsonb_typeof(v_item) is distinct from 'object' then raise exception 'INVALID_AVAILABILITY'; end if;
    if exists(select 1 from jsonb_object_keys(v_item) k where k not in ('weekday','start_time','end_time','label','is_active')) then
      raise exception 'INVALID_AVAILABILITY';
    end if;
    if jsonb_typeof(v_item->'weekday') is distinct from 'number' or (v_item->>'weekday') !~ '^[1-7]$'
      or jsonb_typeof(v_item->'start_time') is distinct from 'string'
      or jsonb_typeof(v_item->'end_time') is distinct from 'string'
      or (v_item->>'start_time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:00)?$'
      or (v_item->>'end_time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:00)?$'
    then raise exception 'INVALID_AVAILABILITY'; end if;
    if (v_item->>'end_time')::time <= (v_item->>'start_time')::time then raise exception 'INVALID_AVAILABILITY'; end if;
    if v_item ? 'is_active' and jsonb_typeof(v_item->'is_active') is distinct from 'boolean' then raise exception 'INVALID_AVAILABILITY'; end if;
    if v_item ? 'label' and jsonb_typeof(v_item->'label') not in ('string','null') then raise exception 'INVALID_AVAILABILITY'; end if;
    if length(v_item->>'label')>500 then raise exception 'INVALID_AVAILABILITY'; end if;
    v_normalized := v_normalized || jsonb_build_array(jsonb_build_object(
      'weekday',(v_item->>'weekday')::integer,
      'start_time',((v_item->>'start_time')::time)::text,
      'end_time',((v_item->>'end_time')::time)::text,
      'label',nullif(btrim(v_item->>'label'),''),
      'is_active',coalesce((v_item->>'is_active')::boolean,true)
    ));
  end loop;
  if exists(
    select 1 from jsonb_array_elements(v_normalized) with ordinality a(w,n)
    join jsonb_array_elements(v_normalized) with ordinality b(w,n) on a.n<b.n
    where a.w->>'weekday'=b.w->>'weekday'
      and (a.w->>'start_time')::time < (b.w->>'end_time')::time
      and (b.w->>'start_time')::time < (a.w->>'end_time')::time
  ) then raise exception 'AVAILABILITY_OVERLAP'; end if;
  select coalesce(jsonb_agg(w order by (w->>'weekday')::integer,w->>'start_time',w->>'end_time'),'[]'::jsonb)
  into v_normalized from jsonb_array_elements(v_normalized) x(w);
  select coalesce(jsonb_agg(jsonb_build_object(
    'weekday',weekday,'start_time',start_time::text,'end_time',end_time::text,'label',label,'is_active',is_active
  ) order by weekday,start_time,end_time),'[]'::jsonb) into v_current
  from public.weekly_availability where user_id=v_user and exam_profile_id=p_exam_profile_id;
  v_state := public.weekly_availability_state(p_exam_profile_id);
  select coalesce(sum(extract(epoch from ((w->>'end_time')::time-(w->>'start_time')::time))/60),0)::integer
  into v_capacity from jsonb_array_elements(v_normalized) x(w) where (w->>'is_active')::boolean;
  -- A duplicate retry is safe even if its original revision is now stale.
  if v_current=v_normalized then
    return v_state || jsonb_build_object('changed',false,'capacity_minutes',v_capacity);
  end if;
  if v_state->>'revision' <> p_expected_revision then raise exception 'AVAILABILITY_CONFLICT'; end if;
  delete from public.weekly_availability where user_id=v_user and exam_profile_id=p_exam_profile_id;
  insert into public.weekly_availability(user_id,exam_profile_id,weekday,start_time,end_time,label,is_active)
  select v_user,p_exam_profile_id,(w->>'weekday')::smallint,(w->>'start_time')::time,(w->>'end_time')::time,w->>'label',(w->>'is_active')::boolean
  from jsonb_array_elements(v_normalized) x(w);
  return public.weekly_availability_state(p_exam_profile_id) || jsonb_build_object('changed',true,'capacity_minutes',v_capacity);
end;
$function$;

notify pgrst, 'reload schema';
commit;
