begin;
-- Daily readiness uses the same target-date fallback as the R2 writer validator.
grant select on public.p48_strategy_profiles to kpss_capacity_writer;
create policy "Capacity writer strategy reads" on public.p48_strategy_profiles for select to kpss_capacity_writer using(user_id=public.availability_actor_uid());
;
create or replace function kpss_s0_private.capacity_read_inputs(p_profile uuid,p_week date)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_user uuid:=public.availability_actor_uid(); v_profile public.exam_profiles;
begin
 if v_user is null then raise exception 'UNAUTHORIZED'; end if;
 if p_week is null or extract(isodow from p_week)<>1 then raise exception 'INVALID_WEEK_START'; end if;
 select * into v_profile from public.exam_profiles where id=p_profile and user_id=v_user and status in ('draft','active');
 if not found then raise exception 'EXAM_PROFILE_NOT_FOUND'; end if;
 return jsonb_build_object('profile',to_jsonb(v_profile),'today',(now() at time zone 'Europe/Istanbul')::date,'weekStart',p_week,'capacitySource',kpss_s0_private.capacity_source(p_profile),
  'strategies',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.p48_strategy_profiles t where user_id=v_user and exam_profile_id=p_profile),
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
create or replace function kpss_s0_private.capacity_readiness(p_input jsonb)
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
  return jsonb_build_object('weekStart',p_input->'weekStart','mode',v_mode,'weeklyGrossMinutes',v_gross,'weeklyState',case when v_gross=0 then 'NO_CAPACITY_ENTERED' else 'VALID_WEEKLY_CAPACITY' end,'status','CAPACITY_TIMED_EXCEPTION_UNSUPPORTED','remainingMinutes',null,'protectedWorkExceedsCapacity',null,'legacyPlannerSupported',false,'capacityReady',false,'planReady',false);
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
  'dayCapacities',v_days,'weeklyBudgetMinutes',v_budget,'committedMinutes',v_need,'remainingMinutes',v_remaining,'protectedWorkExceedsCapacity',v_exceeded,'legacyPlannerSupported',v_mode='time_windows','capacityReady',v_gross>0 and v_remaining>0 and not v_exceeded,'planReady',false);
end; $$;
notify pgrst, 'reload schema';
commit;
