begin;

alter table public.recommendation_events
  drop constraint if exists recommendation_events_type_valid;

alter table public.recommendation_events
  add constraint recommendation_events_type_valid
  check (event_type in ('next_best_task','minimum_plan','daily_plan'));

create or replace function public.start_task(p_task_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.tasks;
begin
  select * into target
  from public.tasks
  where id = p_task_id and user_id = auth.uid()
  for update;

  if not found then raise exception 'TASK_NOT_FOUND'; end if;
  if target.status in ('completed', 'missed', 'cancelled') then
    raise exception 'TASK_NOT_STARTABLE';
  end if;

  if target.status <> 'in_progress' then
    update public.tasks
    set status = 'in_progress'
    where id = p_task_id and user_id = auth.uid()
      and status in ('planned', 'ready', 'partially_completed', 'rescheduled')
    returning * into target;
  end if;

  insert into public.task_progress(task_id, user_id, completed_minutes)
  values (target.id, auth.uid(), 0)
  on conflict (task_id) do nothing;

  if target.task_type = 'learn_topic' and target.curriculum_node_id is not null then
    update public.topic_progress
    set state = 'learning',
        first_started_at = coalesce(first_started_at, now())
    where user_id = auth.uid()
      and exam_profile_id = target.exam_profile_id
      and curriculum_node_id = target.curriculum_node_id
      and state = 'not_started';
  end if;

  return jsonb_build_object('task_id', target.id, 'status', target.status);
end;
$$;

create or replace function public.finish_study_session(p_session_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  s public.study_sessions;
  mins integer;
  estimated integer;
  progress_minutes integer;
begin
  select * into s from public.study_sessions where id=p_session_id and user_id=auth.uid() for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if s.status='completed' then return to_jsonb(s); end if;
  if s.status<>'active' then raise exception 'SESSION_NOT_ACTIVE'; end if;

  mins:=greatest(1,floor(extract(epoch from (now()-s.started_at))/60)::integer);
  update public.study_sessions
  set ended_at=now(),duration_minutes=mins,status='completed',accounted_at=now()
  where id=s.id
  returning * into s;

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
      and exam_profile_id=s.exam_profile_id
      and curriculum_node_id=s.curriculum_node_id;
  end if;

  return to_jsonb(s);
end $$;

create or replace function public.record_retroactive_session(p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  profile_id uuid:=(p_payload->>'examProfileId')::uuid;
  mins integer:=(p_payload->>'durationMinutes')::integer;
  end_time timestamptz:=coalesce((p_payload->>'endedAt')::timestamptz,now());
  s public.study_sessions;
  estimated integer;
  progress_minutes integer;
begin
  if mins is null or mins<=0 then raise exception 'INVALID_SESSION_DURATION'; end if;

  insert into public.study_sessions(
    user_id,exam_profile_id,task_id,subject_id,curriculum_node_id,resource_id,resource_unit_id,
    session_type,started_at,ended_at,duration_minutes,status,entry_source,note,accounted_at
  ) values(
    auth.uid(),profile_id,nullif(p_payload->>'taskId','')::uuid,nullif(p_payload->>'subjectId','')::uuid,
    nullif(p_payload->>'curriculumNodeId','')::uuid,nullif(p_payload->>'resourceId','')::uuid,
    nullif(p_payload->>'resourceUnitId','')::uuid,
    case when nullif(p_payload->>'taskId','') is not null then 'task' else 'custom' end,
    end_time-(mins||' minutes')::interval,end_time,mins,'completed',coalesce(p_payload->>'entrySource','retroactive'),
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

commit;
