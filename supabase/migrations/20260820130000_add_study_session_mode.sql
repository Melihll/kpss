-- P1-14: coarse study material mode for sessions.
-- session_type remains the execution context (task/topic/resource/custom).
-- session_mode records the material modality (book/video/questions/mixed).

alter table public.study_sessions
add column session_mode text null;

create or replace function public.set_study_session_mode()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
declare
  task_work_mode text;
begin
  if new.task_id is not null then
    select t.work_mode
    into task_work_mode
    from public.tasks t
    where t.id = new.task_id
      and t.user_id = new.user_id
      and t.exam_profile_id = new.exam_profile_id;

    new.session_mode := case
      when task_work_mode = 'video' then 'video'
      when task_work_mode in ('questions', 'mock') then 'questions'
      when task_work_mode in ('book', 'notes') then 'book'
      else 'mixed'
    end;
  elsif new.session_mode is null then
    new.session_mode := 'mixed';
  end if;

  return new;
end;
$$;

update public.study_sessions s
set session_mode = case
  when t.work_mode = 'video' then 'video'
  when t.work_mode in ('questions', 'mock') then 'questions'
  when t.work_mode in ('book', 'notes') then 'book'
  else 'mixed'
end
from public.tasks t
where s.task_id = t.id
  and s.user_id = t.user_id
  and s.exam_profile_id = t.exam_profile_id;

update public.study_sessions
set session_mode = 'mixed'
where session_mode is null;

alter table public.study_sessions
alter column session_mode set not null;

alter table public.study_sessions
add constraint study_sessions_mode_valid
check (session_mode in ('book', 'video', 'questions', 'mixed'));

create trigger study_sessions_set_session_mode
before insert or update of task_id, user_id, exam_profile_id, session_mode
on public.study_sessions
for each row
execute function public.set_study_session_mode();

comment on column public.study_sessions.session_mode is
'Coarse study material mode: book, video, questions, or mixed. Distinct from session_type.';

revoke all on function public.set_study_session_mode() from public, anon, authenticated;