create table public.task_daily_preferences (
  user_id uuid not null references auth.users (id) on delete cascade,
  task_id uuid not null,
  planned_date date not null,
  manual_order integer not null,
  pinned boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint task_daily_preferences_pk primary key (user_id, task_id, planned_date),
  constraint task_daily_preferences_task_owner_fk
    foreign key (task_id, user_id)
    references public.tasks (id, user_id)
    on delete cascade,
  constraint task_daily_preferences_manual_order_nonnegative
    check (manual_order >= 0)
);

create index task_daily_preferences_user_date_idx
  on public.task_daily_preferences (user_id, planned_date);

create index task_daily_preferences_task_idx
  on public.task_daily_preferences (task_id);

alter table public.task_daily_preferences enable row level security;

create policy task_daily_preferences_select_own
on public.task_daily_preferences
for select
using (auth.uid() = user_id);

create policy task_daily_preferences_insert_own
on public.task_daily_preferences
for insert
with check (auth.uid() = user_id);

create policy task_daily_preferences_update_own
on public.task_daily_preferences
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy task_daily_preferences_delete_own
on public.task_daily_preferences
for delete
using (auth.uid() = user_id);