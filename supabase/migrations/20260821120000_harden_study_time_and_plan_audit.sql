begin;

alter table public.task_reschedule_events
  alter column to_date drop not null;

alter table public.task_reschedule_events
  drop constraint if exists task_reschedule_events_reason_check;

alter table public.task_reschedule_events
  add constraint task_reschedule_events_reason_check
  check (reason in ('user_request','capacity_change','replanning','carryover','backlog_replanning'));

create or replace function public.audit_task_backlog_transition()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if old.planned_date is not null
    and new.planned_date is null
    and new.status = 'rescheduled'
  then
    insert into public.task_reschedule_events(user_id,task_id,from_date,to_date,reason)
    values(new.user_id,new.id,old.planned_date,new.planned_date,'backlog_replanning');
  end if;
  return new;
end
$$;

drop trigger if exists tasks_audit_backlog_transition on public.tasks;
create trigger tasks_audit_backlog_transition
after update of planned_date on public.tasks
for each row
execute function public.audit_task_backlog_transition();

revoke all on function public.audit_task_backlog_transition() from public,anon,authenticated;

create or replace function public.record_retroactive_session(p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  profile_id uuid:=(p_payload->>'examProfileId')::uuid;
  mins integer:=(p_payload->>'durationMinutes')::integer;
  end_time timestamptz:=coalesce((p_payload->>'endedAt')::timestamptz,now());
  start_time timestamptz;
  s public.study_sessions;
  estimated integer;
  progress_minutes integer;
begin
  if mins is null or mins<=0 then raise exception 'INVALID_SESSION_DURATION'; end if;
  start_time:=end_time-(mins||' minutes')::interval;

  -- Serialize retroactive interval checks per user. This closes the race where
  -- two channels both validate before either completed session is visible.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));

  if exists(
    select 1
    from public.study_sessions existing
    where existing.user_id=auth.uid()
      and existing.status in ('active','completed')
      and existing.started_at < end_time
      and coalesce(existing.ended_at,'infinity'::timestamptz) > start_time
  ) then
    raise exception 'SESSION_TIME_OVERLAP';
  end if;

  insert into public.study_sessions(
    user_id,exam_profile_id,task_id,subject_id,curriculum_node_id,resource_id,resource_unit_id,
    session_type,started_at,ended_at,duration_minutes,status,entry_source,note,accounted_at
  ) values(
    auth.uid(),profile_id,nullif(p_payload->>'taskId','')::uuid,nullif(p_payload->>'subjectId','')::uuid,
    nullif(p_payload->>'curriculumNodeId','')::uuid,nullif(p_payload->>'resourceId','')::uuid,
    nullif(p_payload->>'resourceUnitId','')::uuid,
    case when nullif(p_payload->>'taskId','') is not null then 'task' else 'custom' end,
    start_time,end_time,mins,'completed',coalesce(p_payload->>'entrySource','retroactive'),
    p_payload->>'note',now()
  ) returning * into s;

  if s.task_id is not null then
    select estimated_minutes into estimated
    from public.tasks
    where id=s.task_id and user_id=auth.uid();

    if estimated is not null then
      insert into public.task_progress(task_id,user_id,completed_minutes,actual_study_minutes)
      values(s.task_id,auth.uid(),least(estimated,mins),mins)
      on conflict(task_id) do update set
        completed_minutes=least(estimated,public.task_progress.completed_minutes+mins),
        actual_study_minutes=public.task_progress.actual_study_minutes+mins
      returning completed_minutes into progress_minutes;

      perform public.update_task_progress(s.task_id,progress_minutes);
    end if;
  end if;

  if s.curriculum_node_id is not null then
    update public.topic_progress
    set total_study_minutes=total_study_minutes+mins
    where user_id=auth.uid()
      and exam_profile_id=profile_id
      and curriculum_node_id=s.curriculum_node_id;
  end if;

  return to_jsonb(s);
end $$;

create or replace function public.telegram_record_retroactive_session(p_user_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform set_config('request.jwt.claim.sub',p_user_id::text,true);
  return public.record_retroactive_session(p_payload || jsonb_build_object('entrySource','telegram'));
end $$;

revoke all on function public.telegram_record_retroactive_session(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.telegram_record_retroactive_session(uuid,jsonb) to service_role;

commit;
