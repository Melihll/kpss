begin;

-- Compatibility check only. Ordinary navigation and old clients must never
-- re-import the legacy pilot's fixed personal choices into an existing profile.
create or replace function public.bootstrap_p48_strategy()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_profile public.exam_profiles;
  v_strategy public.p48_strategy_profiles;
begin
  if v_user is null then raise exception 'UNAUTHORIZED'; end if;
  select * into v_profile from public.exam_profiles
  where user_id=v_user and status='active' limit 1;
  if not found then raise exception 'NO_ACTIVE_EXAM_PROFILE'; end if;
  select * into v_strategy from public.p48_strategy_profiles
  where user_id=v_user and exam_profile_id=v_profile.id and status='active';
  if not found then raise exception 'P48_SETUP_REQUIRED'; end if;
  return jsonb_build_object(
    'configured',true,'initialized',false,'examProfileId',v_profile.id,
    'targetExamDate',v_strategy.target_exam_date,
    'weeklyTargetMinutes',v_strategy.weekly_target_minutes,
    'monthlyTargetMinutes',v_strategy.monthly_target_minutes,
    'resourceCount',(select count(*) from public.p48_resource_targets where user_id=v_user and exam_profile_id=v_profile.id),
    'estimatedCalendarPeriods',(select count(*) from public.calendar_periods where user_id=v_user and exam_profile_id=v_profile.id)
  );
end;
$$;
revoke all on function public.bootstrap_p48_strategy() from public,anon;
grant execute on function public.bootstrap_p48_strategy() to authenticated;

-- Read the rows and revision together. A separate browser SELECT followed by a
-- revision request could otherwise associate old rows with a newer revision.
create function public.weekly_availability_state(p_exam_profile_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_windows jsonb;
begin
  if v_user is null then raise exception 'UNAUTHORIZED'; end if;
  if not exists(select 1 from public.exam_profiles where id=p_exam_profile_id and user_id=v_user and status in ('draft','active')) then
    raise exception 'EXAM_PROFILE_NOT_FOUND';
  end if;
  select coalesce(jsonb_agg(to_jsonb(w) order by weekday,start_time,end_time,id),'[]'::jsonb)
  into v_windows from public.weekly_availability w
  where user_id=v_user and exam_profile_id=p_exam_profile_id;
  return jsonb_build_object('windows',v_windows,'revision',md5(v_windows::text));
end;
$$;
revoke all on function public.weekly_availability_state(uuid) from public,anon;
grant execute on function public.weekly_availability_state(uuid) to authenticated;

create function public.replace_weekly_availability(
  p_exam_profile_id uuid,
  p_windows jsonb,
  p_expected_revision text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
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
$$;
revoke all on function public.replace_weekly_availability(uuid,jsonb,text) from public,anon;
grant execute on function public.replace_weekly_availability(uuid,jsonb,text) to authenticated;

commit;
