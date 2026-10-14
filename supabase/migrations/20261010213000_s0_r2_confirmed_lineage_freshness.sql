begin;
-- Proposed carryover is review state, not committed planned-work state.
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
  return v;
end; $function$
;
notify pgrst,'reload schema';
commit;
