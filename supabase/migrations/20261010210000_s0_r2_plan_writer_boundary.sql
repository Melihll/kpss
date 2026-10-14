begin;

-- S0-R2: narrow owned SQL boundaries; no existing row rewrite.

create role kpss_plan_writer nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
grant kpss_plan_writer to postgres;
grant usage,create on schema public to kpss_plan_writer;
grant usage on schema kpss_s0_private to kpss_plan_writer;
grant execute on function public.availability_actor_uid() to kpss_plan_writer;
grant select on public.exam_profiles,public.tasks,public.task_progress,public.resources,public.user_subjects,public.resource_units,public.resource_sections to kpss_plan_writer;
grant update(id) on public.exam_profiles to kpss_plan_writer;

create role kpss_execution_writer nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
grant kpss_execution_writer to postgres;
grant usage,create on schema public to kpss_execution_writer;
grant usage on schema kpss_s0_private to kpss_execution_writer;
grant execute on function public.availability_actor_uid() to kpss_execution_writer;
grant select on public.exam_profiles,public.tasks,public.task_progress,public.resources,public.user_subjects,public.resource_units,public.resource_sections to kpss_execution_writer;
grant update(id) on public.exam_profiles to kpss_execution_writer;

create role kpss_baseline_writer nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
grant kpss_baseline_writer to postgres;
grant usage,create on schema public to kpss_baseline_writer;
grant usage on schema kpss_s0_private to kpss_baseline_writer;
grant execute on function public.availability_actor_uid() to kpss_baseline_writer;
grant select on public.exam_profiles,public.tasks,public.task_progress,public.resources,public.user_subjects,public.resource_units,public.resource_sections to kpss_baseline_writer;
grant update(id) on public.exam_profiles to kpss_baseline_writer;

grant select on public.weekly_availability,public.calendar_periods,public.schedule_exceptions,public.p48_strategy_profiles,public.p48_resource_targets,public.p48_daily_capacity_overrides,public.p48_week_capacity_overrides,public.study_sessions,public.study_session_allocations,public.weekly_plans,public.subjects,public.curriculum_nodes,public.task_resource_units,public.resource_unit_progress,public.task_carryovers to kpss_plan_writer;
grant insert,update on public.weekly_plans,public.tasks to kpss_plan_writer;
grant insert on public.task_progress to kpss_plan_writer;
grant execute on function public.planning_week_snapshot(uuid,date) to kpss_plan_writer;
grant execute on function kpss_s0_private.planning_inputs(uuid,date),kpss_s0_private.day_capacities(jsonb,text),kpss_s0_private.lock_planning_profile() to kpss_plan_writer;

grant select on public.weekly_availability,public.calendar_periods,public.schedule_exceptions,public.p48_strategy_profiles,public.p48_resource_targets,public.p48_daily_capacity_overrides,public.p48_week_capacity_overrides,public.study_sessions,public.study_session_allocations,public.weekly_plans,public.subjects,public.curriculum_nodes,public.task_resource_units,public.resource_unit_progress,public.task_carryovers to kpss_baseline_writer;
grant insert,update on public.weekly_plans,public.tasks to kpss_baseline_writer;
grant insert on public.task_progress to kpss_baseline_writer;
grant execute on function public.planning_week_snapshot(uuid,date) to kpss_baseline_writer;
grant execute on function kpss_s0_private.planning_inputs(uuid,date),kpss_s0_private.day_capacities(jsonb,text),kpss_s0_private.lock_planning_profile() to kpss_baseline_writer;

grant insert,update on public.p48_week_capacity_overrides,public.p48_daily_capacity_overrides to kpss_baseline_writer;
grant insert on public.task_resource_units to kpss_baseline_writer;
grant update(status,completed_at) on public.tasks to kpss_execution_writer;
grant select,insert,update on public.task_progress,public.resource_unit_progress to kpss_execution_writer;
grant select,update on public.topic_progress,public.study_sessions,public.study_session_breaks,public.task_resource_units to kpss_execution_writer;
grant execute on function kpss_s0_private.lock_planning_profile() to kpss_execution_writer;

create policy kpss_plan_writer_exam_profiles_0 on public.exam_profiles for all to kpss_plan_writer using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));

create policy kpss_plan_writer_tasks_0 on public.tasks for all to kpss_plan_writer using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));

create policy kpss_plan_writer_weekly_plans_0 on public.weekly_plans for all to kpss_plan_writer using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));

create policy kpss_plan_writer_task_progress_0 on public.task_progress for all to kpss_plan_writer using (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM tasks task
  WHERE ((task.id = task_progress.task_id) AND (task.user_id = ( SELECT auth.uid() AS uid))))))) with check (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM tasks task
  WHERE ((task.id = task_progress.task_id) AND (task.user_id = ( SELECT auth.uid() AS uid)))))));

create policy kpss_plan_writer_resources_0 on public.resources for all to kpss_plan_writer using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));

create policy kpss_plan_writer_user_subjects_0 on public.user_subjects for all to kpss_plan_writer using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));

create policy kpss_plan_writer_resource_units_0 on public.resource_units for all to kpss_plan_writer using ((EXISTS ( SELECT 1
   FROM resources r
  WHERE ((r.id = resource_units.resource_id) AND (r.user_id = ( SELECT auth.uid() AS uid)))))) with check ((EXISTS ( SELECT 1
   FROM resources r
  WHERE ((r.id = resource_units.resource_id) AND (r.user_id = ( SELECT auth.uid() AS uid))))));

create policy kpss_plan_writer_resource_sections_0 on public.resource_sections for all to kpss_plan_writer using ((EXISTS ( SELECT 1
   FROM resources r
  WHERE ((r.id = resource_sections.resource_id) AND (r.user_id = ( SELECT auth.uid() AS uid)))))) with check ((EXISTS ( SELECT 1
   FROM resources r
  WHERE ((r.id = resource_sections.resource_id) AND (r.user_id = ( SELECT auth.uid() AS uid))))));

create policy kpss_plan_writer_weekly_availability_0 on public.weekly_availability for all to kpss_plan_writer using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));

create policy kpss_plan_writer_calendar_periods_0 on public.calendar_periods for all to kpss_plan_writer using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));

create policy kpss_plan_writer_schedule_exceptions_0 on public.schedule_exceptions for all to kpss_plan_writer using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));

create policy kpss_plan_writer_p48_strategy_profiles_0 on public.p48_strategy_profiles for all to kpss_plan_writer using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));

create policy kpss_plan_writer_p48_resource_targets_0 on public.p48_resource_targets for all to kpss_plan_writer using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));

create policy kpss_plan_writer_p48_daily_capacity_overrides_0 on public.p48_daily_capacity_overrides for all to kpss_plan_writer using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));

create policy kpss_plan_writer_p48_week_capacity_overrides_0 on public.p48_week_capacity_overrides for all to kpss_plan_writer using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));

create policy kpss_plan_writer_study_sessions_0 on public.study_sessions for all to kpss_plan_writer using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));

create policy kpss_plan_writer_study_session_allocations_0 on public.study_session_allocations for select to kpss_plan_writer using ((auth.uid() = user_id));

create policy kpss_plan_writer_subjects_0 on public.subjects for select to kpss_plan_writer using (true);

create policy kpss_plan_writer_curriculum_nodes_0 on public.curriculum_nodes for select to kpss_plan_writer using (true);

create policy kpss_plan_writer_task_resource_units_0 on public.task_resource_units for all to kpss_plan_writer using (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM tasks task
  WHERE ((task.id = task_resource_units.task_id) AND (task.user_id = ( SELECT auth.uid() AS uid))))) AND (EXISTS ( SELECT 1
   FROM (resource_units unit
     JOIN resources resource ON ((resource.id = unit.resource_id)))
  WHERE ((unit.id = task_resource_units.resource_unit_id) AND (resource.user_id = ( SELECT auth.uid() AS uid))))))) with check (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM tasks task
  WHERE ((task.id = task_resource_units.task_id) AND (task.user_id = ( SELECT auth.uid() AS uid))))) AND (EXISTS ( SELECT 1
   FROM (resource_units unit
     JOIN resources resource ON ((resource.id = unit.resource_id)))
  WHERE ((unit.id = task_resource_units.resource_unit_id) AND (resource.user_id = ( SELECT auth.uid() AS uid)))))));

create policy kpss_plan_writer_resource_unit_progress_0 on public.resource_unit_progress for all to kpss_plan_writer using (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM (resource_units ru
     JOIN resources r ON ((r.id = ru.resource_id)))
  WHERE ((ru.id = resource_unit_progress.resource_unit_id) AND (r.user_id = ( SELECT auth.uid() AS uid))))))) with check (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM (resource_units ru
     JOIN resources r ON ((r.id = ru.resource_id)))
  WHERE ((ru.id = resource_unit_progress.resource_unit_id) AND (r.user_id = ( SELECT auth.uid() AS uid)))))));

create policy kpss_plan_writer_task_carryovers_0 on public.task_carryovers for select to kpss_plan_writer using ((auth.uid() = user_id));

create policy kpss_baseline_writer_exam_profiles_0 on public.exam_profiles for all to kpss_baseline_writer using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));

create policy kpss_baseline_writer_tasks_0 on public.tasks for all to kpss_baseline_writer using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));

create policy kpss_baseline_writer_weekly_plans_0 on public.weekly_plans for all to kpss_baseline_writer using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));

create policy kpss_baseline_writer_task_progress_0 on public.task_progress for all to kpss_baseline_writer using (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM tasks task
  WHERE ((task.id = task_progress.task_id) AND (task.user_id = ( SELECT auth.uid() AS uid))))))) with check (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM tasks task
  WHERE ((task.id = task_progress.task_id) AND (task.user_id = ( SELECT auth.uid() AS uid)))))));

create policy kpss_baseline_writer_resources_0 on public.resources for all to kpss_baseline_writer using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));

create policy kpss_baseline_writer_user_subjects_0 on public.user_subjects for all to kpss_baseline_writer using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));

create policy kpss_baseline_writer_resource_units_0 on public.resource_units for all to kpss_baseline_writer using ((EXISTS ( SELECT 1
   FROM resources r
  WHERE ((r.id = resource_units.resource_id) AND (r.user_id = ( SELECT auth.uid() AS uid)))))) with check ((EXISTS ( SELECT 1
   FROM resources r
  WHERE ((r.id = resource_units.resource_id) AND (r.user_id = ( SELECT auth.uid() AS uid))))));

create policy kpss_baseline_writer_resource_sections_0 on public.resource_sections for all to kpss_baseline_writer using ((EXISTS ( SELECT 1
   FROM resources r
  WHERE ((r.id = resource_sections.resource_id) AND (r.user_id = ( SELECT auth.uid() AS uid)))))) with check ((EXISTS ( SELECT 1
   FROM resources r
  WHERE ((r.id = resource_sections.resource_id) AND (r.user_id = ( SELECT auth.uid() AS uid))))));

create policy kpss_baseline_writer_weekly_availability_0 on public.weekly_availability for all to kpss_baseline_writer using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));

create policy kpss_baseline_writer_calendar_periods_0 on public.calendar_periods for all to kpss_baseline_writer using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));

create policy kpss_baseline_writer_schedule_exceptions_0 on public.schedule_exceptions for all to kpss_baseline_writer using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));

create policy kpss_baseline_writer_p48_strategy_profiles_0 on public.p48_strategy_profiles for all to kpss_baseline_writer using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));

create policy kpss_baseline_writer_p48_resource_targets_0 on public.p48_resource_targets for all to kpss_baseline_writer using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));

create policy kpss_baseline_writer_p48_daily_capacity_overrides_0 on public.p48_daily_capacity_overrides for all to kpss_baseline_writer using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));

create policy kpss_baseline_writer_p48_week_capacity_overrides_0 on public.p48_week_capacity_overrides for all to kpss_baseline_writer using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));

create policy kpss_baseline_writer_study_sessions_0 on public.study_sessions for all to kpss_baseline_writer using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));

create policy kpss_baseline_writer_study_session_allocations_0 on public.study_session_allocations for select to kpss_baseline_writer using ((auth.uid() = user_id));

create policy kpss_baseline_writer_subjects_0 on public.subjects for select to kpss_baseline_writer using (true);

create policy kpss_baseline_writer_curriculum_nodes_0 on public.curriculum_nodes for select to kpss_baseline_writer using (true);

create policy kpss_baseline_writer_task_resource_units_0 on public.task_resource_units for all to kpss_baseline_writer using (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM tasks task
  WHERE ((task.id = task_resource_units.task_id) AND (task.user_id = ( SELECT auth.uid() AS uid))))) AND (EXISTS ( SELECT 1
   FROM (resource_units unit
     JOIN resources resource ON ((resource.id = unit.resource_id)))
  WHERE ((unit.id = task_resource_units.resource_unit_id) AND (resource.user_id = ( SELECT auth.uid() AS uid))))))) with check (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM tasks task
  WHERE ((task.id = task_resource_units.task_id) AND (task.user_id = ( SELECT auth.uid() AS uid))))) AND (EXISTS ( SELECT 1
   FROM (resource_units unit
     JOIN resources resource ON ((resource.id = unit.resource_id)))
  WHERE ((unit.id = task_resource_units.resource_unit_id) AND (resource.user_id = ( SELECT auth.uid() AS uid)))))));

create policy kpss_baseline_writer_resource_unit_progress_0 on public.resource_unit_progress for all to kpss_baseline_writer using (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM (resource_units ru
     JOIN resources r ON ((r.id = ru.resource_id)))
  WHERE ((ru.id = resource_unit_progress.resource_unit_id) AND (r.user_id = ( SELECT auth.uid() AS uid))))))) with check (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM (resource_units ru
     JOIN resources r ON ((r.id = ru.resource_id)))
  WHERE ((ru.id = resource_unit_progress.resource_unit_id) AND (r.user_id = ( SELECT auth.uid() AS uid)))))));

create policy kpss_baseline_writer_task_carryovers_0 on public.task_carryovers for select to kpss_baseline_writer using ((auth.uid() = user_id));

create policy kpss_execution_writer_exam_profiles_0 on public.exam_profiles for all to kpss_execution_writer using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));

create policy kpss_execution_writer_tasks_0 on public.tasks for all to kpss_execution_writer using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));

create policy kpss_execution_writer_task_progress_0 on public.task_progress for all to kpss_execution_writer using (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM tasks task
  WHERE ((task.id = task_progress.task_id) AND (task.user_id = ( SELECT auth.uid() AS uid))))))) with check (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM tasks task
  WHERE ((task.id = task_progress.task_id) AND (task.user_id = ( SELECT auth.uid() AS uid)))))));

create policy kpss_execution_writer_resources_0 on public.resources for all to kpss_execution_writer using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));

create policy kpss_execution_writer_user_subjects_0 on public.user_subjects for all to kpss_execution_writer using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));

create policy kpss_execution_writer_resource_units_0 on public.resource_units for all to kpss_execution_writer using ((EXISTS ( SELECT 1
   FROM resources r
  WHERE ((r.id = resource_units.resource_id) AND (r.user_id = ( SELECT auth.uid() AS uid)))))) with check ((EXISTS ( SELECT 1
   FROM resources r
  WHERE ((r.id = resource_units.resource_id) AND (r.user_id = ( SELECT auth.uid() AS uid))))));

create policy kpss_execution_writer_resource_sections_0 on public.resource_sections for all to kpss_execution_writer using ((EXISTS ( SELECT 1
   FROM resources r
  WHERE ((r.id = resource_sections.resource_id) AND (r.user_id = ( SELECT auth.uid() AS uid)))))) with check ((EXISTS ( SELECT 1
   FROM resources r
  WHERE ((r.id = resource_sections.resource_id) AND (r.user_id = ( SELECT auth.uid() AS uid))))));

create policy kpss_execution_writer_resource_unit_progress_0 on public.resource_unit_progress for all to kpss_execution_writer using (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM (resource_units ru
     JOIN resources r ON ((r.id = ru.resource_id)))
  WHERE ((ru.id = resource_unit_progress.resource_unit_id) AND (r.user_id = ( SELECT auth.uid() AS uid))))))) with check (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM (resource_units ru
     JOIN resources r ON ((r.id = ru.resource_id)))
  WHERE ((ru.id = resource_unit_progress.resource_unit_id) AND (r.user_id = ( SELECT auth.uid() AS uid)))))));

create policy kpss_execution_writer_topic_progress_0 on public.topic_progress for all to kpss_execution_writer using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));

create policy kpss_execution_writer_study_sessions_0 on public.study_sessions for all to kpss_execution_writer using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));

create policy kpss_execution_writer_study_session_breaks_0 on public.study_session_breaks for all to kpss_execution_writer using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));

create policy kpss_execution_writer_task_resource_units_0 on public.task_resource_units for all to kpss_execution_writer using (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM tasks task
  WHERE ((task.id = task_resource_units.task_id) AND (task.user_id = ( SELECT auth.uid() AS uid))))) AND (EXISTS ( SELECT 1
   FROM (resource_units unit
     JOIN resources resource ON ((resource.id = unit.resource_id)))
  WHERE ((unit.id = task_resource_units.resource_unit_id) AND (resource.user_id = ( SELECT auth.uid() AS uid))))))) with check (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM tasks task
  WHERE ((task.id = task_resource_units.task_id) AND (task.user_id = ( SELECT auth.uid() AS uid))))) AND (EXISTS ( SELECT 1
   FROM (resource_units unit
     JOIN resources resource ON ((resource.id = unit.resource_id)))
  WHERE ((unit.id = task_resource_units.resource_unit_id) AND (resource.user_id = ( SELECT auth.uid() AS uid)))))));

create or replace function kpss_s0_private.lock_planning_profile()
returns trigger language plpgsql security invoker set search_path='' as $$
declare v_old uuid; v_new uuid; v_id uuid;
begin
 if tg_table_name in ('task_progress','task_resource_units') then
  if tg_op<>'INSERT' then select exam_profile_id into v_old from public.tasks where id=old.task_id; end if;
  if tg_op<>'DELETE' then select exam_profile_id into v_new from public.tasks where id=new.task_id; end if;
 elsif tg_table_name in ('resource_units','resource_sections') then
  if tg_op<>'INSERT' then select exam_profile_id into v_old from public.resources where id=old.resource_id; end if;
  if tg_op<>'DELETE' then select exam_profile_id into v_new from public.resources where id=new.resource_id; end if;
 elsif tg_table_name='resource_unit_progress' then
  if tg_op<>'INSERT' then select r.exam_profile_id into v_old from public.resource_units u join public.resources r on r.id=u.resource_id where u.id=old.resource_unit_id; end if;
  if tg_op<>'DELETE' then select r.exam_profile_id into v_new from public.resource_units u join public.resources r on r.id=u.resource_id where u.id=new.resource_unit_id; end if;
 else
  if tg_op<>'INSERT' then v_old:=old.exam_profile_id; end if;
  if tg_op<>'DELETE' then v_new:=new.exam_profile_id; end if;
 end if;
 for v_id in select distinct x from unnest(array[v_old,v_new]) x where x is not null order by x loop
  perform 1 from public.exam_profiles where id=v_id for update;
 end loop;
 if tg_op='DELETE' then return old; else return new; end if;
end; $$;
create trigger s0_planning_profile_lock before insert or update or delete on public.p48_week_capacity_overrides for each row execute function kpss_s0_private.lock_planning_profile();
create trigger s0_planning_profile_lock before insert or update or delete on public.resource_units for each row execute function kpss_s0_private.lock_planning_profile();
create trigger s0_planning_profile_lock before insert or update or delete on public.resource_sections for each row execute function kpss_s0_private.lock_planning_profile();
create trigger s0_planning_profile_lock before insert or update or delete on public.resource_unit_progress for each row execute function kpss_s0_private.lock_planning_profile();
create trigger s0_planning_profile_lock before insert or update or delete on public.task_resource_units for each row execute function kpss_s0_private.lock_planning_profile();

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

-- Not exposed through PostgREST; callers cannot submit forged validation snapshots.
create function kpss_s0_private.validate_plan_delta(p_before jsonb,p_after jsonb,p_historical boolean default false)
returns void language plpgsql security invoker set search_path='' as $$
declare v_task jsonb; v_old jsonb; v_date date; v_days jsonb; v_user uuid:=public.availability_actor_uid(); v_profile uuid:=(p_after#>>'{profile,id}')::uuid; v_need integer;
begin
 if v_user is null or p_after#>>'{profile,user_id}' is distinct from v_user::text or p_after#>>'{profile,status}' is distinct from 'active' then raise exception 'NO_ACTIVE_EXAM_PROFILE'; end if;
 if p_historical then p_after:=jsonb_set(p_after,'{today}',p_after->'weekStart'); end if;
 v_days:=kpss_s0_private.day_capacities(p_after,'p48');
 for v_task in select value from jsonb_array_elements(p_after->'tasks') loop
  select value into v_old from jsonb_array_elements(p_before->'tasks') where value->>'id'=v_task->>'id';
  -- Execution-only changes do not author planned work or invalidate old evidence.
  if v_old is not null and (v_task-'updated_at'-'status'-'completed_at')=(v_old-'updated_at'-'status'-'completed_at') then continue; end if;
  if v_task->>'status' in ('cancelled','missed') or v_task->>'planned_date' is null then continue; end if;
  v_date:=(v_task->>'planned_date')::date;
  if v_date not between (p_after->>'weekStart')::date and (p_after->>'weekStart')::date+6 or (not p_historical and v_date<(p_after->>'today')::date) then raise exception 'INVALID_PLAN_DATE'; end if;
  if (v_task->>'estimated_minutes')::integer not between 1 and 480 then raise exception 'INVALID_PLAN_MINUTES'; end if;
  if not exists(select 1 from public.user_subjects s where s.user_id=v_user and s.exam_profile_id=v_profile and s.subject_id=(v_task->>'subject_id')::uuid and s.status='active') then raise exception 'INVALID_PLAN_SUBJECT'; end if;
  if v_task->>'resource_id' is not null and not exists(select 1 from public.resources r where r.id=(v_task->>'resource_id')::uuid and r.user_id=v_user and r.exam_profile_id=v_profile and r.subject_id=(v_task->>'subject_id')::uuid and r.status='active') then raise exception 'INVALID_PLAN_RESOURCE'; end if;
  if v_task->>'curriculum_node_id' is not null and not exists(select 1 from public.curriculum_nodes n where n.id=(v_task->>'curriculum_node_id')::uuid and n.subject_id=(v_task->>'subject_id')::uuid and n.is_active) then raise exception 'INVALID_PLAN_CURRICULUM'; end if;
  if v_task->>'status'='completed' then continue; end if;
  select coalesce(sum(greatest(0,(t->>'estimated_minutes')::integer-coalesce((select (p->>'completed_minutes')::integer from jsonb_array_elements(p_after->'progress') p where p->>'task_id'=t->>'id'),0))),0)::integer into v_need
   from jsonb_array_elements(p_after->'tasks') t where (t->>'planned_date')::date=v_date and t->>'status' not in ('cancelled','missed','completed');
  if v_need>coalesce((v_days->>v_date::text)::numeric,0) then raise exception 'PLAN_CAPACITY_EXCEEDED'; end if;
 end loop;
end; $$;
revoke all on function kpss_s0_private.validate_plan_delta(jsonb,jsonb,boolean) from public,anon,authenticated,service_role;
grant execute on function kpss_s0_private.validate_plan_delta(jsonb,jsonb,boolean) to kpss_plan_writer,kpss_baseline_writer;

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
  perform kpss_s0_private.validate_plan_delta(v_snapshot->'input',kpss_s0_private.planning_inputs(v_profile.id,v_week));
  return jsonb_build_object('weeklyPlanId',v_plan.id,'created',true,'plannedMinutes',v_total,'availableMinutes',v_available,'insertedTaskCount',jsonb_array_length(p_payload->'blocks'));
end; $function$
;

alter function public.create_p48_week_once(jsonb) owner to kpss_plan_writer;

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

alter function public.replace_manual_weekly_plan(jsonb) owner to kpss_plan_writer;

CREATE OR REPLACE FUNCTION public.start_task(p_task_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target public.tasks;
begin
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

alter function public.start_task(uuid) owner to kpss_execution_writer;
revoke all on function public.start_task(uuid) from public,anon;
grant execute on function public.start_task(uuid) to authenticated,service_role,kpss_execution_writer;

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

alter function public.sync_task_status(uuid) owner to kpss_execution_writer;
revoke all on function public.sync_task_status(uuid) from public,anon;
grant execute on function public.sync_task_status(uuid) to authenticated,service_role,kpss_execution_writer;

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

alter function public.update_task_progress(uuid,integer) owner to kpss_execution_writer;
revoke all on function public.update_task_progress(uuid,integer) from public,anon;
grant execute on function public.update_task_progress(uuid,integer) to authenticated,service_role,kpss_execution_writer;

CREATE OR REPLACE FUNCTION public.complete_task(p_task_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target public.tasks;
begin
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

alter function public.complete_task(uuid) owner to kpss_execution_writer;
revoke all on function public.complete_task(uuid) from public,anon;
grant execute on function public.complete_task(uuid) to authenticated,service_role,kpss_execution_writer;

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

alter function public.complete_task_unit(uuid,uuid) owner to kpss_execution_writer;
revoke all on function public.complete_task_unit(uuid,uuid) from public,anon;
grant execute on function public.complete_task_unit(uuid,uuid) to authenticated,service_role,kpss_execution_writer;

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

alter function public.cancel_study_session(uuid) owner to kpss_execution_writer;
revoke all on function public.cancel_study_session(uuid) from public,anon;
grant execute on function public.cancel_study_session(uuid) to authenticated,service_role,kpss_execution_writer;

-- V0 creation retired explicitly. Existing active week remains readable/idempotent.
create or replace function public.persist_weekly_plan(p_plan jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_plan public.weekly_plans;
begin
 select * into v_plan from public.weekly_plans where user_id=public.availability_actor_uid() and exam_profile_id=(p_plan->>'examProfileId')::uuid and week_start_date=(p_plan->>'weekStartDate')::date and status='active';
 if found then return jsonb_build_object('weekly_plan_id',v_plan.id,'created',false); end if;
 raise exception 'V0_PLANNING_RETIRED';
end; $$;

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
          and (nullif(v_task_json->>'resourceSectionId','') is null or resource_section_id=(v_task_json->>'resourceSectionId')::uuid)
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

alter function public.persist_p48_baseline_plan(uuid,jsonb) owner to kpss_baseline_writer;
revoke all on function public.persist_p48_baseline_plan(uuid,jsonb) from public,anon,authenticated,service_role;
-- Only the actor-binding service wrapper (existing postgres-owned definer) may call import.
grant execute on function public.persist_p48_baseline_plan(uuid,jsonb) to postgres;

CREATE OR REPLACE FUNCTION public.confirmation_plan_fingerprint(p_user_id uuid, p_weekly_plan_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_plan public.weekly_plans;
  v_value jsonb;
begin
  select * into v_plan
  from public.weekly_plans
  where id = p_weekly_plan_id
    and user_id = p_user_id;
  if not found then raise exception 'WEEKLY_PLAN_NOT_FOUND'; end if;

  select jsonb_build_object(
    'plan', jsonb_build_array(
      v_plan.id,v_plan.status,v_plan.week_start_date,v_plan.week_end_date,
      v_plan.available_minutes,v_plan.planning_budget_minutes,
      v_plan.planned_minutes,v_plan.generation_version,v_plan.updated_at
    ),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_array(
        t.id,t.subject_id,t.curriculum_node_id,t.resource_id,t.task_type,
        t.title,t.planned_date,t.estimated_minutes,t.importance,
        t.priority_score,t.status,t.dedupe_key,t.updated_at,
        coalesce(tp.completed_minutes,0),coalesce(tp.actual_study_minutes,0),tp.updated_at
      ) order by t.id)
      from public.tasks t
      left join public.task_progress tp on tp.task_id = t.id and tp.user_id = t.user_id
      where t.user_id = p_user_id and t.weekly_plan_id = p_weekly_plan_id
    ),'[]'::jsonb),
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_array(
        s.id,s.task_id,s.status,s.started_at,s.ended_at,
        s.duration_minutes,s.accounted_at,s.updated_at
      ) order by s.id)
      from public.study_sessions s
      where s.user_id = p_user_id
        and s.exam_profile_id = v_plan.exam_profile_id
        and s.started_at >= (v_plan.week_start_date::timestamp at time zone 'Europe/Istanbul')
        and s.started_at < ((v_plan.week_end_date + 1)::timestamp at time zone 'Europe/Istanbul')
    ),'[]'::jsonb),
    'availability', coalesce((
      select jsonb_agg(jsonb_build_array(
        a.id,a.weekday,a.start_time,a.end_time,a.is_active,a.created_at
      ) order by a.id)
      from public.weekly_availability a
      where a.user_id = p_user_id and a.exam_profile_id = v_plan.exam_profile_id
    ),'[]'::jsonb),
    'periods', coalesce((
      select jsonb_agg(jsonb_build_array(
        c.id,c.period_type,c.start_date,c.end_date,c.capacity_multiplier,c.created_at
      ) order by c.id)
      from public.calendar_periods c
      where c.user_id = p_user_id and c.exam_profile_id = v_plan.exam_profile_id
        and c.end_date >= v_plan.week_start_date
        and c.start_date <= v_plan.week_end_date
    ),'[]'::jsonb),
    'exceptions', coalesce((
      select jsonb_agg(jsonb_build_array(
        e.id,e.exception_date,e.exception_type,e.start_time,e.end_time,
        e.minutes_delta,e.note,e.created_at
      ) order by e.id)
      from public.schedule_exceptions e
      where e.user_id = p_user_id and e.exam_profile_id = v_plan.exam_profile_id
        and e.exception_date between v_plan.week_start_date and v_plan.week_end_date
    ),'[]'::jsonb),
    'dailyOverrides', coalesce((
      select jsonb_agg(jsonb_build_array(
        d.id,d.capacity_date,d.capacity_minutes,d.reserve_minutes,d.source_key,d.updated_at
      ) order by d.id)
      from public.p48_daily_capacity_overrides d
      where d.user_id = p_user_id and d.exam_profile_id = v_plan.exam_profile_id
        and d.capacity_date between v_plan.week_start_date and v_plan.week_end_date
    ),'[]'::jsonb),
    'weekOverrides', coalesce((
      select jsonb_agg(jsonb_build_array(
        w.id,w.week_start_date,w.capacity_minutes,w.planning_budget_minutes,
        w.reserve_minutes,w.source_key,w.updated_at
      ) order by w.id)
      from public.p48_week_capacity_overrides w
      where w.user_id = p_user_id and w.exam_profile_id = v_plan.exam_profile_id
        and w.week_start_date = v_plan.week_start_date
    ),'[]'::jsonb)
  ) into v_value;

  perform set_config('request.jwt.claim.sub',p_user_id::text,true);
  return md5((v_value||jsonb_build_object('planningInputs',kpss_s0_private.planning_inputs(v_plan.exam_profile_id,v_plan.week_start_date)))::text);
end;
$function$
;

alter function public.planner_v2_database_fingerprint(uuid,uuid) volatile;

CREATE OR REPLACE FUNCTION public.apply_confirmed_action_proposal(p_proposal_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_before jsonb;
  v_profile uuid;
  v_user uuid:=auth.uid();
  v_proposal public.confirmed_action_proposals;
  v_plan public.weekly_plans;
  v_substitution public.study_substitutions;
  v_carryover public.task_carryovers;
  v_source public.tasks;
  v_replacement public.tasks;
  v_session public.study_sessions;
  v_old_allocation public.study_session_allocations;
  v_new_allocation public.study_session_allocations;
  v_completed integer:=0;
  v_remaining integer:=0;
  v_source_after integer:=0;
  v_result jsonb;
begin
  if v_user is null then raise exception 'UNAUTHORIZED'; end if;
  select exam_profile_id into v_profile from public.confirmed_action_proposals where id=p_proposal_id and user_id=v_user;
  perform 1 from public.exam_profiles where id=v_profile and user_id=v_user and status='active' for update;
  if not found then raise exception 'ACTION_PROPOSAL_NOT_FOUND'; end if;
  select * into v_proposal from public.confirmed_action_proposals
  where id=p_proposal_id and user_id=v_user for update;
  if not found then raise exception 'ACTION_PROPOSAL_NOT_FOUND'; end if;
  if v_proposal.action_kind in ('quick_task','capacity_change') then
    return public.apply_confirmed_action_proposal_pre_pln002(p_proposal_id);
  end if;
  if v_proposal.status='applied' then
    return coalesce(v_proposal.result_payload,'{}'::jsonb)||jsonb_build_object('idempotent',true,'proposalId',v_proposal.id);
  end if;
  if v_proposal.status<>'pending' then raise exception 'ACTION_PROPOSAL_NOT_PENDING'; end if;
  if v_proposal.expires_at<=now() then raise exception 'ACTION_PROPOSAL_EXPIRED'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text,41));
  select * into v_plan from public.weekly_plans
  where id=v_proposal.weekly_plan_id and user_id=v_user and exam_profile_id=v_proposal.exam_profile_id and status='active'
  for update;
  if not found then raise exception 'WEEKLY_PLAN_NOT_FOUND'; end if;
  if v_plan.generation_version<>v_proposal.plan_generation_version then raise exception 'ACTION_PROPOSAL_STALE'; end if;
  if public.confirmation_plan_fingerprint(v_user,v_plan.id)<>v_proposal.snapshot_fingerprint then raise exception 'ACTION_PROPOSAL_STALE'; end if;

  v_before:=kpss_s0_private.planning_inputs(v_plan.exam_profile_id,v_plan.week_start_date);
  if v_proposal.action_kind='substitution' then
    select * into v_substitution from public.study_substitutions
    where proposal_id=v_proposal.id and user_id=v_user for update;
    if not found or v_substitution.status<>'proposed' then raise exception 'SUBSTITUTION_SOURCE_INVALID'; end if;
    select * into v_source from public.tasks
    where id=v_substitution.source_task_id and user_id=v_user and weekly_plan_id=v_plan.id for update;
    if not found then raise exception 'SUBSTITUTION_SOURCE_INVALID'; end if;
    select coalesce(completed_minutes,0) into v_completed from public.task_progress
    where task_id=v_source.id and user_id=v_user for update;
    v_completed:=coalesce(v_completed,0);
    v_remaining:=greatest(0,v_source.estimated_minutes-v_completed);
    select * into v_session from public.study_sessions
    where id=v_substitution.replacement_session_id and user_id=v_user and status='completed' for update;
    select * into v_old_allocation from public.study_session_allocations
    where session_id=v_session.id and user_id=v_user and accounting_intent='extra' and superseded_at is null for update;
    if not found or v_substitution.source_minutes_replaced>v_remaining
      or v_substitution.source_minutes_replaced>v_old_allocation.actual_minutes
    then raise exception 'SUBSTITUTION_REPLACEMENT_INVALID'; end if;

    insert into public.tasks(
      user_id,exam_profile_id,weekly_plan_id,subject_id,curriculum_node_id,resource_id,
      task_type,title,planned_date,estimated_minutes,importance,priority_score,status,source_reason,dedupe_key,completed_at
    ) values(
      v_user,v_plan.exam_profile_id,v_plan.id,v_session.subject_id,v_session.curriculum_node_id,v_session.resource_id,
      'custom',v_proposal.mutation_payload->>'replacementTitle',v_source.planned_date,
      v_substitution.source_minutes_replaced,v_source.importance,v_source.priority_score,'completed','manual',
      'substitution:'||v_substitution.id::text,now()
    ) returning * into v_replacement;
    insert into public.task_progress(task_id,user_id,completed_minutes,actual_study_minutes)
    values(v_replacement.id,v_user,v_substitution.source_minutes_replaced,v_old_allocation.actual_minutes);

    update public.study_session_allocations set superseded_at=now()
    where id=v_old_allocation.id;
    insert into public.study_session_allocations(
      user_id,exam_profile_id,session_id,accounting_intent,target_task_id,subject_id,curriculum_node_id,
      resource_id,resource_unit_id,actual_minutes,planned_credit_minutes,intent_source,substitution_id,
      idempotency_key,supersedes_allocation_id,reason,recorded_by
    ) values(
      v_user,v_plan.exam_profile_id,v_session.id,'planned',v_replacement.id,v_session.subject_id,v_session.curriculum_node_id,
      v_session.resource_id,v_session.resource_unit_id,v_old_allocation.actual_minutes,v_substitution.source_minutes_replaced,
      'confirmed_action',v_substitution.id,'substitution:'||v_substitution.id::text||':allocation',v_old_allocation.id,
      'confirmed_substitution',v_user::text
    ) returning * into v_new_allocation;

    v_source_after:=v_source.estimated_minutes-v_substitution.source_minutes_replaced;
    if v_source_after>v_completed then
      update public.tasks set estimated_minutes=v_source_after where id=v_source.id;
    elsif v_completed>0 then
      update public.tasks set estimated_minutes=v_completed,status='completed',completed_at=coalesce(completed_at,now()) where id=v_source.id;
    else
      update public.tasks set status='cancelled' where id=v_source.id;
    end if;
    update public.weekly_plans set generation_version=generation_version+1 where id=v_plan.id;
    update public.study_substitutions set
      replacement_task_id=v_replacement.id,status='applied',confirmed_by=v_user::text,
      confirmed_at=now(),applied_at=now()
    where id=v_substitution.id;
    v_result:=jsonb_build_object(
      'proposalId',v_proposal.id,'actionKind','substitution','substitutionId',v_substitution.id,
      'sourceTaskId',v_source.id,'replacementTaskId',v_replacement.id,
      'sourceMinutesRelieved',v_substitution.source_minutes_replaced,
      'replacementAllocation',to_jsonb(v_new_allocation),'weeklyPlanId',v_plan.id,
      'refresh',jsonb_build_array('today','week','progress')
    );
  elsif v_proposal.action_kind='carryover' then
    select * into v_carryover from public.task_carryovers
    where proposal_id=v_proposal.id and user_id=v_user for update;
    if not found or v_carryover.status<>'proposed' then raise exception 'CARRYOVER_SOURCE_STALE'; end if;
    select * into v_source from public.tasks
    where id=v_carryover.source_task_id and user_id=v_user and weekly_plan_id=v_plan.id for update;
    if not found then raise exception 'CARRYOVER_SOURCE_STALE'; end if;
    select coalesce(completed_minutes,0) into v_completed from public.task_progress
    where task_id=v_source.id and user_id=v_user for update;
    v_remaining:=greatest(0,v_source.estimated_minutes-coalesce(v_completed,0));
    if v_source.planned_date<>v_carryover.from_date or v_remaining<>v_carryover.remaining_minutes then
      raise exception 'CARRYOVER_SOURCE_STALE';
    end if;
    update public.tasks set planned_date=v_carryover.to_date,status='rescheduled' where id=v_source.id;
    insert into public.task_reschedule_events(user_id,task_id,from_date,to_date,reason)
    values(v_user,v_source.id,v_carryover.from_date,v_carryover.to_date,'carryover');
    update public.weekly_plans set generation_version=generation_version+1 where id=v_plan.id;
    update public.task_carryovers set status='applied',confirmed_by=v_user::text,confirmed_at=now(),applied_at=now()
    where id=v_carryover.id;
    v_result:=jsonb_build_object(
      'proposalId',v_proposal.id,'actionKind','carryover','carryoverId',v_carryover.id,
      'sourceTaskId',v_source.id,'preservedTaskId',v_source.id,
      'fromDate',v_carryover.from_date,'toDate',v_carryover.to_date,
      'remainingMinutes',v_carryover.remaining_minutes,'weeklyPlanId',v_plan.id,
      'refresh',jsonb_build_array('today','week')
    );
  else
    raise exception 'ACTION_PROPOSAL_INVALID_KIND';
  end if;

  perform kpss_s0_private.validate_plan_delta(v_before,kpss_s0_private.planning_inputs(v_plan.exam_profile_id,v_plan.week_start_date));

  update public.confirmed_action_proposals
  set status='applied',applied_at=now(),result_payload=v_result
  where id=v_proposal.id;
  return v_result;
end $function$
;

CREATE OR REPLACE FUNCTION public.apply_confirmed_action_proposal_pre_pln002(p_proposal_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_before jsonb;
  v_profile uuid;
  v_user uuid := auth.uid();
  v_proposal public.confirmed_action_proposals;
  v_plan public.weekly_plans;
  v_candidate jsonb;
  v_task public.tasks;
  v_existing public.tasks;
  v_schedule jsonb;
  v_revision_result jsonb;
  v_result jsonb;
  v_inserted_exception_id uuid;
begin
  if v_user is null then raise exception 'UNAUTHORIZED'; end if;
  select exam_profile_id into v_profile from public.confirmed_action_proposals where id=p_proposal_id and user_id=v_user;
  perform 1 from public.exam_profiles where id=v_profile and user_id=v_user and status='active' for update;
  if not found then raise exception 'ACTION_PROPOSAL_NOT_FOUND'; end if;

  select * into v_proposal
  from public.confirmed_action_proposals
  where id = p_proposal_id and user_id = v_user
  for update;
  if not found then raise exception 'ACTION_PROPOSAL_NOT_FOUND'; end if;

  if v_proposal.status = 'applied' then
    return coalesce(v_proposal.result_payload,'{}'::jsonb)
      || jsonb_build_object('idempotent',true,'proposalId',v_proposal.id);
  end if;
  if v_proposal.status <> 'pending' then raise exception 'ACTION_PROPOSAL_NOT_PENDING'; end if;
  if v_proposal.expires_at <= now() then
    update public.confirmed_action_proposals set status='expired'
    where id=v_proposal.id;
    raise exception 'ACTION_PROPOSAL_EXPIRED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text,41));
  select * into v_plan
  from public.weekly_plans
  where id=v_proposal.weekly_plan_id
    and user_id=v_user
    and exam_profile_id=v_proposal.exam_profile_id
    and status='active'
  for update;
  if not found then raise exception 'WEEKLY_PLAN_NOT_FOUND'; end if;
  if v_plan.generation_version <> v_proposal.plan_generation_version then
    raise exception 'ACTION_PROPOSAL_STALE';
  end if;
  if public.confirmation_plan_fingerprint(v_user,v_plan.id) <> v_proposal.snapshot_fingerprint then
    raise exception 'ACTION_PROPOSAL_STALE';
  end if;

  v_before:=kpss_s0_private.planning_inputs(v_plan.exam_profile_id,v_plan.week_start_date);
  if v_proposal.action_kind = 'quick_task' then
    v_candidate := v_proposal.mutation_payload->'candidate';
    if (v_candidate->>'plannedDate')::date < current_date
      or (v_candidate->>'plannedDate')::date not between v_plan.week_start_date and v_plan.week_end_date
    then
      raise exception 'ACTION_PROPOSAL_STALE';
    end if;
    perform 1 from public.user_subjects
    where user_id=v_user and exam_profile_id=v_plan.exam_profile_id
      and subject_id=(v_candidate->>'subjectId')::uuid and status='active';
    if not found then raise exception 'QUICK_ADD_INVALID_SUBJECT'; end if;

    insert into public.tasks(
      user_id,exam_profile_id,weekly_plan_id,subject_id,
      task_type,title,planned_date,estimated_minutes,importance,
      priority_score,status,source_reason,dedupe_key
    ) values(
      v_user,v_plan.exam_profile_id,v_plan.id,(v_candidate->>'subjectId')::uuid,
      'custom',v_candidate->>'title',(v_candidate->>'plannedDate')::date,
      (v_candidate->>'estimatedMinutes')::integer,'important',50,
      'ready','manual',v_proposal.mutation_payload->>'taskDedupeKey'
    )
    on conflict(weekly_plan_id,dedupe_key) do nothing
    returning * into v_task;

    if v_task.id is null then
      select * into v_existing from public.tasks
      where weekly_plan_id=v_plan.id
        and dedupe_key=v_proposal.mutation_payload->>'taskDedupeKey'
        and user_id=v_user;
      if not found
        or v_existing.subject_id <> (v_candidate->>'subjectId')::uuid
        or v_existing.title <> v_candidate->>'title'
        or v_existing.planned_date <> (v_candidate->>'plannedDate')::date
        or v_existing.estimated_minutes <> (v_candidate->>'estimatedMinutes')::integer
      then
        raise exception 'QUICK_ADD_DUPLICATE_CONFLICT';
      end if;
      v_task := v_existing;
    else
      insert into public.task_progress(task_id,user_id)
      values(v_task.id,v_user) on conflict do nothing;
      update public.weekly_plans
      set planned_minutes=planned_minutes+v_task.estimated_minutes,
          generation_version=generation_version+1
      where id=v_plan.id;
    end if;

    select jsonb_build_object(
      'proposalId',v_proposal.id,
      'actionKind','quick_task',
      'task',to_jsonb(v_task),
      'created',v_existing.id is null,
      'idempotent',v_existing.id is not null,
      'weeklyPlanId',v_plan.id,
      'refresh',jsonb_build_array('today','week')
    ) into v_result;
  else
    v_schedule := v_proposal.mutation_payload->'scheduleException';
    insert into public.schedule_exceptions(
      user_id,exam_profile_id,exception_date,exception_type,
      minutes_delta,note,confirmation_dedupe_key
    ) values(
      v_user,v_plan.exam_profile_id,(v_schedule->>'date')::date,
      v_schedule->>'type',(v_schedule->>'minutesDelta')::integer,
      coalesce(v_schedule->>'note','KPSS Coach confirmed capacity change'),
      v_schedule->>'dedupeKey'
    )
    on conflict(user_id,confirmation_dedupe_key)
      where confirmation_dedupe_key is not null
    do nothing
    returning id into v_inserted_exception_id;

    v_revision_result := public.apply_plan_revision(
      (v_proposal.mutation_payload->'planRevisionPayload')||jsonb_build_object('intent','apply_revision','expectedFingerprint',md5(kpss_s0_private.planning_inputs(v_plan.exam_profile_id,v_plan.week_start_date)::text))
    );
    if coalesce((v_revision_result->>'proposal')::boolean,false) then
      raise exception 'ACTION_PROPOSAL_NOT_APPLYABLE';
    end if;

    select jsonb_build_object(
      'proposalId',v_proposal.id,
      'actionKind','capacity_change',
      'scheduleExceptionCreated',v_inserted_exception_id is not null,
      'revision',v_revision_result,
      'changes',coalesce(v_proposal.display_payload->'changes','[]'::jsonb),
      'capacityEvent',coalesce(v_proposal.display_payload->'capacityEvent',v_schedule),
      'weeklyPlanId',v_plan.id,
      'refresh',jsonb_build_array('today','week','roadmap','progress')
    ) into v_result;
  end if;

  perform kpss_s0_private.validate_plan_delta(v_before,kpss_s0_private.planning_inputs(v_plan.exam_profile_id,v_plan.week_start_date));

  update public.confirmed_action_proposals
  set status='applied',applied_at=now(),result_payload=v_result
  where id=v_proposal.id;
  return v_result;
end;
$function$
;

revoke execute on function public.apply_confirmed_action_proposal_pre_pln002(uuid) from service_role;

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
    or v_task.carried_from_task_id is not null or v_task.canonical_workload_identity is not null
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
  select coalesce(sum(value::numeric),0)::integer into v_available from jsonb_each_text(kpss_s0_private.day_capacities(v_after,'p48'));
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

-- Cutover LAST, transactionally with compatible controlled functions above.
revoke insert,update,delete,truncate,references,trigger on public.weekly_plans,public.tasks,public.task_resource_units from public,anon,authenticated,service_role;
-- Column ACLs can survive table REVOKE; explicitly close every column as well.
do $$ declare v_table text; v_columns text; v_role text; begin
 foreach v_table in array array['weekly_plans','tasks','task_resource_units'] loop
  select string_agg(quote_ident(attname),',') into v_columns from pg_attribute where attrelid=('public.'||v_table)::regclass and attnum>0 and not attisdropped;
  foreach v_role in array array['public','anon','authenticated','service_role'] loop
   execute format('revoke insert (%s),update (%s),references (%s) on public.%I from %I',v_columns,v_columns,v_columns,v_table,v_role);
  end loop;
 end loop;
end $$;
revoke create on schema public from kpss_plan_writer,kpss_execution_writer,kpss_baseline_writer;
notify pgrst,'reload schema';
commit;
