begin;

-- The legacy planner remains the authority. Serialize its explicit first-week
-- creation so overlapping requests cannot replace each other's newly made tasks.
create or replace function public.create_p48_week_once(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_profile public.exam_profiles;
  v_plan public.weekly_plans;
  v_result jsonb;
begin
  if v_user is null then raise exception 'UNAUTHORIZED'; end if;
  if p_payload->>'intent' is distinct from 'generate_week' then raise exception 'EXPLICIT_INTENT_REQUIRED'; end if;
  select * into v_profile from public.exam_profiles
  where user_id=v_user and status='active' for update;
  if not found then raise exception 'NO_ACTIVE_EXAM_PROFILE'; end if;
  if not exists(select 1 from public.p48_strategy_profiles
    where user_id=v_user and exam_profile_id=v_profile.id and status='active') then
    raise exception 'P48_STRATEGY_NOT_CONFIGURED';
  end if;
  select * into v_plan from public.weekly_plans
  where user_id=v_user and exam_profile_id=v_profile.id
    and week_start_date=(p_payload->>'weekStartDate')::date and status='active';
  if found then return jsonb_build_object('weeklyPlanId',v_plan.id,'created',false); end if;
  -- Edge performs P48-specific planning checks; direct RPC callers must also
  -- prove real owned configuration instead of supplying a fictitious budget.
  if not exists(select 1 from public.p48_strategy_profiles
    where user_id=v_user and exam_profile_id=v_profile.id and status='active' and target_exam_date is not null) then
    raise exception 'P48_EXAM_DATE_REQUIRED';
  end if;
  if not exists(select 1 from public.user_subjects
    where user_id=v_user and exam_profile_id=v_profile.id and status='active') then
    raise exception 'P48_SUBJECTS_REQUIRED';
  end if;
  if not exists(select 1 from public.weekly_availability
    where user_id=v_user and exam_profile_id=v_profile.id and is_active and end_time>start_time)
    and not exists(select 1 from public.p48_daily_capacity_overrides
      where user_id=v_user and exam_profile_id=v_profile.id
        and capacity_date between (p_payload->>'weekStartDate')::date and (p_payload->>'weekStartDate')::date+6
        and capacity_minutes>reserve_minutes) then
    raise exception 'P48_CAPACITY_SOURCE_MISSING';
  end if;
  if not exists(select 1 from public.p48_resource_targets t
    join public.resources r on r.id=t.resource_id and r.user_id=v_user and r.exam_profile_id=v_profile.id and r.status='active'
    join public.user_subjects s on s.subject_id=r.subject_id and s.user_id=v_user and s.exam_profile_id=v_profile.id and s.status='active'
    where t.user_id=v_user and t.exam_profile_id=v_profile.id) then
    raise exception 'P48_RESOURCES_REQUIRED';
  end if;
  if jsonb_typeof(p_payload->'blocks') is distinct from 'array' or jsonb_array_length(p_payload->'blocks')=0 then
    raise exception 'INVALID_MANUAL_PLAN_MINUTES';
  end if;
  v_result := public.replace_manual_weekly_plan(p_payload);
  return v_result || jsonb_build_object('created',true);
end;
$$;
revoke all on function public.create_p48_week_once(jsonb) from public,anon;
grant execute on function public.create_p48_week_once(jsonb) to authenticated;

commit;
