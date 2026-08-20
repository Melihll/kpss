create table public.resource_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_profile_id uuid not null,
  resource_id uuid not null,
  current_page integer not null default 0,
  total_pages integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint resource_progress_pk
    primary key (user_id, resource_id),

  constraint resource_progress_profile_owner_fk
    foreign key (exam_profile_id, user_id)
    references public.exam_profiles(id, user_id)
    on delete cascade,

  constraint resource_progress_resource_owner_fk
    foreign key (resource_id, user_id)
    references public.resources(id, user_id)
    on delete cascade,

  constraint resource_progress_total_pages_positive
    check (total_pages > 0),

  constraint resource_progress_current_page_valid
    check (current_page >= 0 and current_page <= total_pages)
);

create index resource_progress_exam_profile_idx
on public.resource_progress(user_id, exam_profile_id);

create trigger resource_progress_set_updated_at
before update on public.resource_progress
for each row execute function public.set_updated_at();

alter table public.resource_progress enable row level security;

revoke all on public.resource_progress from public, anon, authenticated;
grant select, insert, update, delete on public.resource_progress to authenticated;

create policy "Users own resource progress"
on public.resource_progress
for all
to authenticated
using (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.resources r
    where r.id = resource_progress.resource_id
      and r.user_id = (select auth.uid())
      and r.exam_profile_id = resource_progress.exam_profile_id
  )
)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.resources r
    where r.id = resource_progress.resource_id
      and r.user_id = (select auth.uid())
      and r.exam_profile_id = resource_progress.exam_profile_id
  )
);