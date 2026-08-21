begin;

create or replace function public.finish_study_session(p_session_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  s public.study_sessions;
  mins integer;
  estimated integer;
  progress_minutes integer;
  break_seconds numeric := 0;
  finished_at timestamptz := now();
begin
  select * into s
  from public.study_sessions
  where id = p_session_id
    and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'SESSION_NOT_FOUND';
  end if;

  if s.status = 'completed' then
    return to_jsonb(s);
  end if;

  if s.status <> 'active' then
    raise exception 'SESSION_NOT_ACTIVE';
  end if;

  update public.study_session_breaks
  set ended_at = finished_at
  where session_id = s.id
    and user_id = auth.uid()
    and ended_at is null;

  select coalesce(
    sum(extract(epoch from (ended_at - started_at))),
    0
  )
  into break_seconds
  from public.study_session_breaks
  where session_id = s.id
    and user_id = auth.uid()
    and ended_at is not null;

  mins := greatest(
    1,
    floor(
      greatest(
        0,
        extract(epoch from (finished_at - s.started_at)) - break_seconds
      ) / 60
    )::integer
  );

  update public.study_sessions
  set
    ended_at = finished_at,
    duration_minutes = mins,
    status = 'completed',
    accounted_at = finished_at
  where id = s.id
  returning * into s;

  if s.task_id is not null then
    select estimated_minutes
    into estimated
    from public.tasks
    where id = s.task_id
      and user_id = auth.uid();

    if estimated is not null then
      insert into public.task_progress(
        task_id,
        user_id,
        completed_minutes,
        actual_study_minutes
      )
      values(
        s.task_id,
        auth.uid(),
        least(estimated, mins),
        mins
      )
      on conflict(task_id) do update set
        completed_minutes = least(
          estimated,
          public.task_progress.completed_minutes + mins
        ),
        actual_study_minutes =
          public.task_progress.actual_study_minutes + mins
      returning completed_minutes into progress_minutes;

      perform public.update_task_progress(
        s.task_id,
        progress_minutes
      );
    end if;
  end if;

  if s.curriculum_node_id is not null then
    update public.topic_progress
    set total_study_minutes = total_study_minutes + mins
    where user_id = auth.uid()
      and exam_profile_id = s.exam_profile_id
      and curriculum_node_id = s.curriculum_node_id;
  end if;

  return to_jsonb(s);
end;
$$;

commit;