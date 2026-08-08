create table public.weekly_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  exam_profile_id uuid not null,
  week_start_date date not null,
  week_end_date date not null,
  available_minutes integer not null,
  planning_budget_minutes integer not null,
  planned_minutes integer not null default 0,
  status text not null default 'draft',
  generation_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekly_plans_profile_owner_fk
    foreign key (exam_profile_id, user_id)
    references public.exam_profiles (id, user_id)
    on delete cascade,
  constraint weekly_plans_id_owner_profile_unique unique (id, user_id, exam_profile_id),
  constraint weekly_plans_week_monday_sunday check (
    extract(isodow from week_start_date) = 1 and week_end_date = week_start_date + 6
  ),
  constraint weekly_plans_minutes_nonnegative check (
    available_minutes >= 0 and planning_budget_minutes >= 0 and planned_minutes >= 0
  ),
  constraint weekly_plans_budget_bounds check (
    planning_budget_minutes <= available_minutes and planned_minutes <= planning_budget_minutes
  ),
  constraint weekly_plans_status_valid check (
    status in ('draft', 'active', 'completed', 'superseded', 'cancelled')
  ),
  constraint weekly_plans_generation_version_positive check (generation_version > 0)
);

create unique index weekly_plans_one_active_per_profile_week
on public.weekly_plans (exam_profile_id, week_start_date)
where status = 'active';

create index weekly_plans_user_id_idx on public.weekly_plans (user_id);
create index weekly_plans_exam_profile_id_idx on public.weekly_plans (exam_profile_id);

alter table public.resources
add constraint resources_task_owner_unique unique (id, user_id, exam_profile_id, subject_id);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  exam_profile_id uuid not null,
  weekly_plan_id uuid null,
  subject_id uuid not null references public.subjects (id),
  curriculum_node_id uuid null,
  resource_id uuid null,
  carried_from_task_id uuid null,
  task_type text not null,
  title text not null,
  description text null,
  planned_date date null,
  estimated_minutes integer not null,
  importance text not null,
  priority_score integer not null,
  status text not null default 'planned',
  source_reason text not null,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null,
  constraint tasks_id_user_unique unique (id, user_id),
  constraint tasks_id_owner_profile_unique unique (id, user_id, exam_profile_id),
  constraint tasks_profile_owner_fk
    foreign key (exam_profile_id, user_id)
    references public.exam_profiles (id, user_id)
    on delete cascade,
  constraint tasks_weekly_plan_owner_fk
    foreign key (weekly_plan_id, user_id, exam_profile_id)
    references public.weekly_plans (id, user_id, exam_profile_id)
    on delete cascade,
  constraint tasks_curriculum_subject_fk
    foreign key (curriculum_node_id, subject_id)
    references public.curriculum_nodes (id, subject_id),
  constraint tasks_resource_owner_subject_fk
    foreign key (resource_id, user_id, exam_profile_id, subject_id)
    references public.resources (id, user_id, exam_profile_id, subject_id),
  constraint tasks_carried_from_owner_fk
    foreign key (carried_from_task_id, user_id, exam_profile_id)
    references public.tasks (id, user_id, exam_profile_id),
  constraint tasks_not_self_carried check (carried_from_task_id is null or carried_from_task_id <> id),
  constraint tasks_type_valid check (task_type in ('learn_topic', 'solve_resource_units', 'review_topic', 'custom')),
  constraint tasks_title_not_blank check (btrim(title) <> ''),
  constraint tasks_estimated_minutes_positive check (estimated_minutes > 0),
  constraint tasks_importance_valid check (importance in ('core', 'important', 'optional')),
  constraint tasks_priority_score_valid check (priority_score between 0 and 100),
  constraint tasks_status_valid check (
    status in ('planned', 'ready', 'in_progress', 'partially_completed', 'completed', 'rescheduled', 'missed', 'cancelled')
  ),
  constraint tasks_source_reason_valid check (
    source_reason in ('curriculum_progress', 'resource_progress', 'carryover', 'manual')
  ),
  constraint tasks_dedupe_key_not_blank check (btrim(dedupe_key) <> ''),
  constraint tasks_completed_at_consistent check (status = 'completed' or completed_at is null),
  constraint tasks_weekly_dedupe_unique unique (weekly_plan_id, dedupe_key)
);

create index tasks_user_id_idx on public.tasks (user_id);
create index tasks_weekly_plan_id_idx on public.tasks (weekly_plan_id);
create index tasks_planned_date_idx on public.tasks (planned_date);
create index tasks_status_idx on public.tasks (status);
create index tasks_priority_score_idx on public.tasks (priority_score desc);

create table public.task_resource_units (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  task_id uuid not null,
  resource_unit_id uuid not null references public.resource_units (id),
  status text not null default 'pending',
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint task_resource_units_task_owner_fk
    foreign key (task_id, user_id)
    references public.tasks (id, user_id)
    on delete cascade,
  constraint task_resource_units_task_unit_unique unique (task_id, resource_unit_id),
  constraint task_resource_units_status_valid check (status in ('pending', 'completed', 'skipped')),
  constraint task_resource_units_completed_at_consistent check (status = 'completed' or completed_at is null)
);

create index task_resource_units_task_id_idx on public.task_resource_units (task_id);

create table public.task_progress (
  task_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  completed_minutes integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_progress_task_owner_fk
    foreign key (task_id, user_id)
    references public.tasks (id, user_id)
    on delete cascade,
  constraint task_progress_minutes_nonnegative check (completed_minutes >= 0)
);

create trigger weekly_plans_set_updated_at before update on public.weekly_plans
for each row execute function public.set_updated_at();
create trigger tasks_set_updated_at before update on public.tasks
for each row execute function public.set_updated_at();
create trigger task_progress_set_updated_at before update on public.task_progress
for each row execute function public.set_updated_at();

alter table public.weekly_plans enable row level security;
alter table public.tasks enable row level security;
alter table public.task_resource_units enable row level security;
alter table public.task_progress enable row level security;

revoke all on public.weekly_plans, public.tasks, public.task_resource_units, public.task_progress from anon;
revoke all on public.weekly_plans, public.tasks, public.task_resource_units, public.task_progress from authenticated;
grant select, insert, update, delete on public.weekly_plans, public.tasks, public.task_resource_units, public.task_progress to authenticated;

create policy "Users own weekly plans" on public.weekly_plans
for all to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users own tasks" on public.tasks
for all to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users manage units linked to own tasks and resources" on public.task_resource_units
for all to authenticated
using (
  user_id = (select auth.uid())
  and exists (select 1 from public.tasks task where task.id = task_resource_units.task_id and task.user_id = (select auth.uid()))
  and exists (
    select 1 from public.resource_units unit
    join public.resources resource on resource.id = unit.resource_id
    where unit.id = task_resource_units.resource_unit_id and resource.user_id = (select auth.uid())
  )
)
with check (
  user_id = (select auth.uid())
  and exists (select 1 from public.tasks task where task.id = task_resource_units.task_id and task.user_id = (select auth.uid()))
  and exists (
    select 1 from public.resource_units unit
    join public.resources resource on resource.id = unit.resource_id
    where unit.id = task_resource_units.resource_unit_id and resource.user_id = (select auth.uid())
  )
);

create policy "Users own task progress" on public.task_progress
for all to authenticated
using (
  user_id = (select auth.uid())
  and exists (select 1 from public.tasks task where task.id = task_progress.task_id and task.user_id = (select auth.uid()))
)
with check (
  user_id = (select auth.uid())
  and exists (select 1 from public.tasks task where task.id = task_progress.task_id and task.user_id = (select auth.uid()))
);
