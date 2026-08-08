create table public.exam_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  exam_edition_id uuid not null references public.exam_editions (id),
  preparation_start_date date not null,
  target_exam_date date null,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exam_profiles_id_user_unique unique (id, user_id),
  constraint exam_profiles_status_valid check (status in ('draft', 'active', 'paused', 'completed')),
  constraint exam_profiles_target_date_valid check (
    target_exam_date is null or target_exam_date >= preparation_start_date
  )
);

create unique index exam_profiles_one_active_per_user
on public.exam_profiles (user_id)
where status = 'active';

create table public.user_subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  exam_profile_id uuid not null,
  subject_id uuid not null references public.subjects (id),
  status text not null default 'active',
  created_at timestamptz not null default now(),
  constraint user_subjects_profile_owner_fk
    foreign key (exam_profile_id, user_id)
    references public.exam_profiles (id, user_id)
    on delete cascade,
  constraint user_subjects_profile_subject_unique unique (exam_profile_id, subject_id),
  constraint user_subjects_status_valid check (status in ('active', 'paused', 'completed'))
);

create table public.topic_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  exam_profile_id uuid not null,
  curriculum_node_id uuid not null references public.curriculum_nodes (id),
  state text not null default 'not_started',
  mastery_level text not null default 'unknown',
  first_started_at timestamptz null,
  learned_at timestamptz null,
  last_practiced_at timestamptz null,
  last_revision_at timestamptz null,
  total_study_minutes integer not null default 0,
  total_questions integer not null default 0,
  correct_questions integer not null default 0,
  wrong_questions integer not null default 0,
  blank_questions integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint topic_progress_profile_owner_fk
    foreign key (exam_profile_id, user_id)
    references public.exam_profiles (id, user_id)
    on delete cascade,
  constraint topic_progress_profile_node_unique unique (exam_profile_id, curriculum_node_id),
  constraint topic_progress_state_valid check (
    state in ('not_started', 'learning', 'practicing', 'remediation', 'learned', 'maintenance')
  ),
  constraint topic_progress_mastery_valid check (
    mastery_level in ('unknown', 'strong', 'sufficient', 'fragile', 'weak', 'critical')
  ),
  constraint topic_progress_counts_nonnegative check (
    total_study_minutes >= 0 and total_questions >= 0 and correct_questions >= 0
    and wrong_questions >= 0 and blank_questions >= 0
  ),
  constraint topic_progress_question_breakdown_valid check (
    correct_questions + wrong_questions + blank_questions <= total_questions
  )
);

create table public.weekly_availability (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  exam_profile_id uuid not null,
  weekday smallint not null,
  start_time time not null,
  end_time time not null,
  label text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint weekly_availability_profile_owner_fk
    foreign key (exam_profile_id, user_id)
    references public.exam_profiles (id, user_id)
    on delete cascade,
  constraint weekly_availability_weekday_valid check (weekday between 1 and 7),
  constraint weekly_availability_time_valid check (end_time > start_time),
  constraint weekly_availability_window_unique unique (exam_profile_id, weekday, start_time, end_time)
);

comment on column public.weekly_availability.weekday is 'ISO weekday: 1=Monday through 7=Sunday.';

create table public.calendar_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  exam_profile_id uuid not null,
  period_type text not null,
  name text not null,
  start_date date not null,
  end_date date not null,
  capacity_multiplier numeric null,
  created_at timestamptz not null default now(),
  constraint calendar_periods_profile_owner_fk
    foreign key (exam_profile_id, user_id)
    references public.exam_profiles (id, user_id)
    on delete cascade,
  constraint calendar_periods_type_valid check (
    period_type in ('normal', 'midterm', 'final', 'holiday', 'internship', 'custom')
  ),
  constraint calendar_periods_name_not_blank check (btrim(name) <> ''),
  constraint calendar_periods_date_valid check (end_date >= start_date),
  constraint calendar_periods_multiplier_valid check (
    capacity_multiplier is null or capacity_multiplier >= 0
  )
);

create table public.schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  exam_profile_id uuid not null,
  exception_date date not null,
  exception_type text not null,
  start_time time null,
  end_time time null,
  minutes_delta integer null,
  note text null,
  created_at timestamptz not null default now(),
  constraint schedule_exceptions_profile_owner_fk
    foreign key (exam_profile_id, user_id)
    references public.exam_profiles (id, user_id)
    on delete cascade,
  constraint schedule_exceptions_type_valid check (
    exception_type in ('unavailable', 'extra_available', 'custom')
  ),
  constraint schedule_exceptions_times_together check (
    (start_time is null and end_time is null)
    or (start_time is not null and end_time is not null and end_time > start_time)
  ),
  constraint schedule_exceptions_has_effect check (
    start_time is not null or minutes_delta is not null or nullif(btrim(note), '') is not null
  )
);

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  exam_profile_id uuid not null,
  subject_id uuid not null references public.subjects (id),
  name text not null,
  publisher text null,
  resource_type text not null,
  resource_role text not null,
  difficulty text not null default 'unknown',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resources_id_user_unique unique (id, user_id),
  constraint resources_profile_owner_fk
    foreign key (exam_profile_id, user_id)
    references public.exam_profiles (id, user_id)
    on delete cascade,
  constraint resources_name_not_blank check (btrim(name) <> ''),
  constraint resources_type_valid check (
    resource_type in ('question_bank', 'video_course', 'book', 'notes', 'mock_book', 'other')
  ),
  constraint resources_role_valid check (
    resource_role in ('primary', 'reinforcement', 'revision', 'advanced', 'mock')
  ),
  constraint resources_difficulty_valid check (difficulty in ('unknown', 'easy', 'normal', 'hard')),
  constraint resources_status_valid check (status in ('active', 'paused', 'completed', 'abandoned'))
);

create table public.resource_sections (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources (id) on delete cascade,
  curriculum_node_id uuid null references public.curriculum_nodes (id),
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint resource_sections_id_resource_unique unique (id, resource_id),
  constraint resource_sections_resource_name_unique unique (resource_id, name),
  constraint resource_sections_name_not_blank check (btrim(name) <> ''),
  constraint resource_sections_sort_order_nonnegative check (sort_order >= 0)
);

create table public.resource_units (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources (id) on delete cascade,
  resource_section_id uuid null,
  unit_type text not null,
  name text not null,
  sort_order integer not null default 0,
  question_count integer null,
  estimated_minutes integer null,
  created_at timestamptz not null default now(),
  constraint resource_units_section_resource_fk
    foreign key (resource_section_id, resource_id)
    references public.resource_sections (id, resource_id)
    on delete cascade,
  constraint resource_units_type_valid check (
    unit_type in ('test', 'video', 'chapter', 'reading', 'mock', 'other')
  ),
  constraint resource_units_name_not_blank check (btrim(name) <> ''),
  constraint resource_units_sort_order_nonnegative check (sort_order >= 0),
  constraint resource_units_question_count_nonnegative check (question_count is null or question_count >= 0),
  constraint resource_units_estimated_minutes_nonnegative check (estimated_minutes is null or estimated_minutes >= 0)
);

create unique index resource_units_section_name_unique
on public.resource_units (resource_section_id, name)
where resource_section_id is not null;

create unique index resource_units_without_section_name_unique
on public.resource_units (resource_id, name)
where resource_section_id is null;

create table public.resource_unit_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  resource_unit_id uuid not null references public.resource_units (id) on delete cascade,
  status text not null default 'not_started',
  completed_at timestamptz null,
  attempt_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resource_unit_progress_user_unit_unique unique (user_id, resource_unit_id),
  constraint resource_unit_progress_status_valid check (
    status in ('not_started', 'in_progress', 'completed', 'skipped')
  ),
  constraint resource_unit_progress_attempts_nonnegative check (attempt_count >= 0),
  constraint resource_unit_progress_completed_consistent check (
    status = 'completed' or completed_at is null
  )
);

create trigger exam_profiles_set_updated_at before update on public.exam_profiles
for each row execute function public.set_updated_at();
create trigger topic_progress_set_updated_at before update on public.topic_progress
for each row execute function public.set_updated_at();
create trigger resources_set_updated_at before update on public.resources
for each row execute function public.set_updated_at();
create trigger resource_unit_progress_set_updated_at before update on public.resource_unit_progress
for each row execute function public.set_updated_at();

alter table public.exam_profiles enable row level security;
alter table public.user_subjects enable row level security;
alter table public.topic_progress enable row level security;
alter table public.weekly_availability enable row level security;
alter table public.calendar_periods enable row level security;
alter table public.schedule_exceptions enable row level security;
alter table public.resources enable row level security;
alter table public.resource_sections enable row level security;
alter table public.resource_units enable row level security;
alter table public.resource_unit_progress enable row level security;

revoke all on public.exam_profiles, public.user_subjects, public.topic_progress,
  public.weekly_availability, public.calendar_periods, public.schedule_exceptions,
  public.resources, public.resource_sections, public.resource_units,
  public.resource_unit_progress from anon;
revoke all on public.exam_profiles, public.user_subjects, public.topic_progress,
  public.weekly_availability, public.calendar_periods, public.schedule_exceptions,
  public.resources, public.resource_sections, public.resource_units,
  public.resource_unit_progress from authenticated;
grant select, insert, update, delete on public.exam_profiles, public.user_subjects,
  public.topic_progress, public.weekly_availability, public.calendar_periods,
  public.schedule_exceptions, public.resources, public.resource_sections,
  public.resource_units, public.resource_unit_progress to authenticated;

create policy "Users own exam profiles" on public.exam_profiles
for all to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "Users own subject selections" on public.user_subjects
for all to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "Users own topic progress" on public.topic_progress
for all to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "Users own weekly availability" on public.weekly_availability
for all to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "Users own calendar periods" on public.calendar_periods
for all to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "Users own schedule exceptions" on public.schedule_exceptions
for all to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "Users own resources" on public.resources
for all to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users manage sections of own resources" on public.resource_sections
for all to authenticated
using (exists (
  select 1 from public.resources r
  where r.id = resource_sections.resource_id and r.user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.resources r
  where r.id = resource_sections.resource_id and r.user_id = (select auth.uid())
));

create policy "Users manage units of own resources" on public.resource_units
for all to authenticated
using (exists (
  select 1 from public.resources r
  where r.id = resource_units.resource_id and r.user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.resources r
  where r.id = resource_units.resource_id and r.user_id = (select auth.uid())
));

create policy "Users own progress for units in own resources" on public.resource_unit_progress
for all to authenticated
using (
  user_id = (select auth.uid()) and exists (
    select 1 from public.resource_units ru
    join public.resources r on r.id = ru.resource_id
    where ru.id = resource_unit_progress.resource_unit_id
      and r.user_id = (select auth.uid())
  )
)
with check (
  user_id = (select auth.uid()) and exists (
    select 1 from public.resource_units ru
    join public.resources r on r.id = ru.resource_id
    where ru.id = resource_unit_progress.resource_unit_id
      and r.user_id = (select auth.uid())
  )
);
