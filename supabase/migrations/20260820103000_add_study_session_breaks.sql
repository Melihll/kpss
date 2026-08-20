alter table public.study_sessions
add constraint study_sessions_id_user_unique unique (id, user_id);

create table public.study_session_breaks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_session_breaks_session_owner_fk
    foreign key (session_id, user_id)
    references public.study_sessions(id, user_id)
    on delete cascade,
  constraint study_session_breaks_dates_valid
    check (ended_at is null or ended_at >= started_at)
);

create unique index study_session_breaks_one_open_per_session
on public.study_session_breaks(session_id)
where ended_at is null;

create index study_session_breaks_session_id_idx
on public.study_session_breaks(session_id);

create index study_session_breaks_user_id_idx
on public.study_session_breaks(user_id);

create trigger study_session_breaks_set_updated_at
before update on public.study_session_breaks
for each row execute function public.set_updated_at();

alter table public.study_session_breaks enable row level security;

revoke all on public.study_session_breaks from anon, authenticated;
grant select, insert, update, delete on public.study_session_breaks to authenticated;

create policy "Users own study session breaks"
on public.study_session_breaks
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create or replace function public.pause_study_session(p_session_id uuid) returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  s public.study_sessions;
  b public.study_session_breaks;
begin
  select * into s
  from public.study_sessions
  where id = p_session_id and user_id = auth.uid()
  for update;

  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if s.status <> 'active' then raise exception 'SESSION_NOT_ACTIVE'; end if;

  select * into b
  from public.study_session_breaks
  where session_id = s.id
    and user_id = auth.uid()
    and ended_at is null
  for update;

  if found then
    return jsonb_build_object(
      'session', to_jsonb(s),
      'break', to_jsonb(b),
      'paused', true
    );
  end if;

  insert into public.study_session_breaks(user_id, session_id, started_at)
  values(auth.uid(), s.id, now())
  returning * into b;

  return jsonb_build_object(
    'session', to_jsonb(s),
    'break', to_jsonb(b),
    'paused', true
  );
end;
$$;

create or replace function public.resume_study_session(p_session_id uuid) returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  s public.study_sessions;
  b public.study_session_breaks;
begin
  select * into s
  from public.study_sessions
  where id = p_session_id and user_id = auth.uid()
  for update;

  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if s.status <> 'active' then raise exception 'SESSION_NOT_ACTIVE'; end if;

  select * into b
  from public.study_session_breaks
  where session_id = s.id
    and user_id = auth.uid()
    and ended_at is null
  for update;

  if not found then
    return jsonb_build_object(
      'session', to_jsonb(s),
      'break', null,
      'paused', false
    );
  end if;

  update public.study_session_breaks
  set ended_at = now()
  where id = b.id
  returning * into b;

  return jsonb_build_object(
    'session', to_jsonb(s),
    'break', to_jsonb(b),
    'paused', false
  );
end;
$$;

create or replace function public.finish_study_session(p_session_id uuid) returns jsonb
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
  where id = p_session_id and user_id = auth.uid()
  for update;

  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if s.status = 'completed' then return to_jsonb(s); end if;
  if s.status <> 'active' then raise exception 'SESSION_NOT_ACTIVE'; end if;

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
  set ended_at = finished_at,
      duration_minutes = mins,
      status = 'completed',
      accounted_at = finished_at
  where id = s.id
  returning * into s;

  if s.task_id is not null then
    select estimated_minutes into estimated
    from public.tasks
    where id = s.task_id and user_id = auth.uid();

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

      perform public.update_task_progress(s.task_id, progress_minutes);
    end if;
  end if;

  return to_jsonb(s);
end;
$$;

create or replace function public.cancel_study_session(p_session_id uuid) returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  s public.study_sessions;
  cancelled_at timestamptz := now();
begin
  select * into s
  from public.study_sessions
  where id = p_session_id and user_id = auth.uid()
  for update;

  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if s.status = 'cancelled' then return to_jsonb(s); end if;
  if s.status <> 'active' then raise exception 'SESSION_NOT_ACTIVE'; end if;

  update public.study_session_breaks
  set ended_at = cancelled_at
  where session_id = s.id
    and user_id = auth.uid()
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
      and user_id = auth.uid()
      and status = 'in_progress';
  end if;

  return to_jsonb(s);
end;
$$;

revoke all on function
  public.pause_study_session(uuid),
  public.resume_study_session(uuid)
from public, anon;

grant execute on function
  public.pause_study_session(uuid),
  public.resume_study_session(uuid)
to authenticated;