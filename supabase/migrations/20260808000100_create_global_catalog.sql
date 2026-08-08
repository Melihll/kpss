create table public.exams (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  level text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint exams_code_not_blank check (btrim(code) <> ''),
  constraint exams_name_not_blank check (btrim(name) <> '')
);

create table public.exam_editions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams (id) on delete cascade,
  year integer not null,
  exam_date date null,
  status text not null default 'upcoming',
  created_at timestamptz not null default now(),
  constraint exam_editions_exam_year_unique unique (exam_id, year),
  constraint exam_editions_year_valid check (year between 2000 and 2200),
  constraint exam_editions_status_valid check (status in ('upcoming', 'active', 'completed'))
);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  category text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  constraint subjects_code_not_blank check (btrim(code) <> ''),
  constraint subjects_name_not_blank check (btrim(name) <> ''),
  constraint subjects_sort_order_nonnegative check (sort_order >= 0)
);

create table public.exam_subjects (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  is_optional boolean not null default false,
  sort_order integer not null default 0,
  constraint exam_subjects_exam_subject_unique unique (exam_id, subject_id),
  constraint exam_subjects_sort_order_nonnegative check (sort_order >= 0)
);

create table public.curriculum_nodes (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects (id) on delete cascade,
  parent_id uuid null,
  node_type text not null,
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint curriculum_nodes_id_subject_unique unique (id, subject_id),
  constraint curriculum_nodes_parent_same_subject
    foreign key (parent_id, subject_id)
    references public.curriculum_nodes (id, subject_id)
    on delete cascade,
  constraint curriculum_nodes_type_valid check (node_type in ('topic', 'subtopic')),
  constraint curriculum_nodes_name_not_blank check (btrim(name) <> ''),
  constraint curriculum_nodes_sort_order_nonnegative check (sort_order >= 0),
  constraint curriculum_nodes_not_self_parent check (parent_id is null or parent_id <> id),
  constraint curriculum_nodes_subject_name_unique unique (subject_id, parent_id, name)
);

comment on table public.curriculum_nodes is
  'Global curriculum catalog. Phase 02 seed contains representative development data, not the full official KPSS curriculum.';

alter table public.exams enable row level security;
alter table public.exam_editions enable row level security;
alter table public.subjects enable row level security;
alter table public.exam_subjects enable row level security;
alter table public.curriculum_nodes enable row level security;

revoke all on public.exams, public.exam_editions, public.subjects, public.exam_subjects, public.curriculum_nodes from anon;
revoke all on public.exams, public.exam_editions, public.subjects, public.exam_subjects, public.curriculum_nodes from authenticated;
grant select on public.exams, public.exam_editions, public.subjects, public.exam_subjects, public.curriculum_nodes to authenticated;

create policy "Authenticated users can read exams"
on public.exams for select to authenticated using (true);
create policy "Authenticated users can read exam editions"
on public.exam_editions for select to authenticated using (true);
create policy "Authenticated users can read subjects"
on public.subjects for select to authenticated using (true);
create policy "Authenticated users can read exam subjects"
on public.exam_subjects for select to authenticated using (true);
create policy "Authenticated users can read curriculum nodes"
on public.curriculum_nodes for select to authenticated using (true);
