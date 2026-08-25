begin;

-- W2 local release candidate. This migration is intentionally additive and
-- must not be applied to production without a separate explicit release.

create table public.physical_study_activity_snapshots (
  study_session_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_profile_id uuid not null,
  task_id uuid not null,
  subject_id uuid not null references public.subjects(id),
  resource_id uuid not null,
  resource_section_id uuid null,
  resource_unit_id uuid not null,
  curriculum_node_id uuid null,
  material_type text not null,
  unit_page_start integer not null,
  unit_page_end integer not null,
  start_page_boundary integer not null,
  activity_started_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint physical_activity_snapshot_profile_owner_fk
    foreign key (exam_profile_id, user_id)
    references public.exam_profiles(id, user_id)
    on delete cascade,

  constraint physical_activity_snapshot_session_owner_fk
    foreign key (study_session_id, user_id, exam_profile_id)
    references public.study_sessions(id, user_id, exam_profile_id)
    on delete cascade,

  constraint physical_activity_snapshot_task_owner_fk
    foreign key (task_id, user_id, exam_profile_id)
    references public.tasks(id, user_id, exam_profile_id),

  constraint physical_activity_snapshot_resource_owner_fk
    foreign key (resource_id, user_id, exam_profile_id, subject_id)
    references public.resources(id, user_id, exam_profile_id, subject_id),

  constraint physical_activity_snapshot_section_resource_fk
    foreign key (resource_section_id, resource_id)
    references public.resource_sections(id, resource_id),

  constraint physical_activity_snapshot_unit_resource_fk
    foreign key (resource_unit_id, resource_id)
    references public.resource_units(id, resource_id),

  constraint physical_activity_snapshot_curriculum_subject_fk
    foreign key (curriculum_node_id, subject_id)
    references public.curriculum_nodes(id, subject_id),

  constraint physical_activity_snapshot_owner_unique
    unique (study_session_id, user_id, exam_profile_id),

  constraint physical_activity_snapshot_material_type_valid
    check (material_type in ('page_range', 'test')),

  constraint physical_activity_snapshot_page_range_valid
    check (unit_page_start > 0 and unit_page_end >= unit_page_start),

  constraint physical_activity_snapshot_start_boundary_valid
    check (
      start_page_boundary >= unit_page_start - 1
      and start_page_boundary <= unit_page_end
    )
);

create table public.physical_study_activity_breaks (
  id uuid primary key default gen_random_uuid(),
  study_session_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_profile_id uuid not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz null,
  created_at timestamptz not null default now(),

  constraint physical_activity_break_session_owner_fk
    foreign key (study_session_id, user_id, exam_profile_id)
    references public.physical_study_activity_snapshots(
      study_session_id,
      user_id,
      exam_profile_id
    )
    on delete cascade,

  constraint physical_activity_break_interval_valid
    check (ended_at is null or ended_at >= started_at)
);

create unique index physical_activity_break_one_open_per_session
on public.physical_study_activity_breaks(study_session_id)
where ended_at is null;

create table public.physical_pace_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_profile_id uuid not null,
  study_session_id uuid not null,
  subject_id uuid not null references public.subjects(id),
  resource_id uuid not null,
  resource_section_id uuid null,
  resource_unit_id uuid not null,
  curriculum_node_id uuid null,
  material_type text not null,
  progress_unit text not null default 'page',
  start_page_boundary integer not null,
  end_page_boundary integer not null,
  progressed_pages integer generated always as
    (end_page_boundary - start_page_boundary) stored,
  actual_active_seconds integer not null,
  activity_started_at timestamptz not null,
  activity_ended_at timestamptz not null,
  evidence_status text not null default 'accepted',
  evidence_provenance text not null default 'atomic_physical_finish',
  rejection_reason text null,
  created_at timestamptz not null default now(),

  constraint physical_pace_evidence_profile_owner_fk
    foreign key (exam_profile_id, user_id)
    references public.exam_profiles(id, user_id)
    on delete cascade,

  constraint physical_pace_evidence_session_owner_fk
    foreign key (study_session_id, user_id, exam_profile_id)
    references public.study_sessions(id, user_id, exam_profile_id)
    on delete cascade,

  constraint physical_pace_evidence_resource_owner_fk
    foreign key (resource_id, user_id, exam_profile_id, subject_id)
    references public.resources(id, user_id, exam_profile_id, subject_id),

  constraint physical_pace_evidence_section_resource_fk
    foreign key (resource_section_id, resource_id)
    references public.resource_sections(id, resource_id),

  constraint physical_pace_evidence_unit_resource_fk
    foreign key (resource_unit_id, resource_id)
    references public.resource_units(id, resource_id),

  constraint physical_pace_evidence_curriculum_subject_fk
    foreign key (curriculum_node_id, subject_id)
    references public.curriculum_nodes(id, subject_id),

  constraint physical_pace_evidence_session_unique
    unique (user_id, study_session_id),

  constraint physical_pace_evidence_material_type_valid
    check (material_type in ('page_range', 'test')),

  constraint physical_pace_evidence_progress_unit_valid
    check (progress_unit = 'page'),

  constraint physical_pace_evidence_start_boundary_nonnegative
    check (start_page_boundary >= 0),

  constraint physical_pace_evidence_progress_positive
    check (progressed_pages > 0),

  constraint physical_pace_evidence_active_seconds_positive
    check (actual_active_seconds > 0),

  constraint physical_pace_evidence_activity_interval_valid
    check (
      activity_ended_at > activity_started_at
      and actual_active_seconds <= floor(
        extract(epoch from (activity_ended_at - activity_started_at))
      )::integer
    ),

  constraint physical_pace_evidence_status_valid
    check (evidence_status in ('accepted')),

  constraint physical_pace_evidence_provenance_valid
    check (evidence_provenance in ('atomic_physical_finish')),

  constraint physical_pace_evidence_accepted_has_no_rejection
    check (rejection_reason is null)
);

create index physical_pace_evidence_scope_idx
on public.physical_pace_evidence (
  user_id,
  exam_profile_id,
  resource_id,
  material_type,
  created_at
);

create or replace function public.prevent_physical_evidence_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'PHYSICAL_EVIDENCE_IMMUTABLE';
end;
$$;

create trigger physical_activity_snapshot_immutable
before update on public.physical_study_activity_snapshots
for each row
execute function public.prevent_physical_evidence_update();

create trigger physical_pace_evidence_immutable
before update on public.physical_pace_evidence
for each row
execute function public.prevent_physical_evidence_update();

alter table public.physical_study_activity_snapshots enable row level security;
alter table public.physical_study_activity_breaks enable row level security;

alter table public.physical_pace_evidence enable row level security;

revoke all on public.physical_study_activity_snapshots
from public, anon, authenticated;

revoke all on public.physical_study_activity_breaks
from public, anon, authenticated;

revoke all on public.physical_pace_evidence
from public, anon, authenticated;

grant select on public.physical_study_activity_snapshots to authenticated;
grant select on public.physical_study_activity_breaks to authenticated;
grant select on public.physical_pace_evidence to authenticated;

create policy "Users read own physical activity snapshots"
on public.physical_study_activity_snapshots
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users read own physical activity breaks"
on public.physical_study_activity_breaks
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users read own physical pace evidence"
on public.physical_pace_evidence
for select
to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.start_physical_study_session(
  p_task_id uuid,
  p_resource_unit_id uuid,
  p_entry_source text default 'web'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  t public.tasks;
  v_unit public.resource_units;
  v_section public.resource_sections;
  v_progress public.resource_unit_progress;
  s public.study_sessions;
  v_start_boundary integer;
  v_material_type text;
begin
  if v_user is null then raise exception 'UNAUTHORIZED'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user::text, 0)
  );

  if exists (
    select 1
    from public.study_sessions existing
    where existing.user_id = v_user
      and existing.status = 'active'
  ) then
    raise exception 'ACTIVE_SESSION_EXISTS';
  end if;

  select * into t
  from public.tasks
  where id = p_task_id
    and user_id = v_user
  for update;

  if not found then raise exception 'TASK_NOT_FOUND'; end if;

  select * into v_unit
  from public.resource_units
  where id = p_resource_unit_id
  for update;

  if not found then raise exception 'RESOURCE_UNIT_NOT_FOUND'; end if;

  if not exists (
    select 1
    from public.resources r
    where r.id = v_unit.resource_id
      and r.user_id = v_user
      and r.exam_profile_id = t.exam_profile_id
      and r.subject_id = t.subject_id
      and r.id = t.resource_id
  ) then
    raise exception 'RESOURCE_UNIT_OWNER_MISMATCH';
  end if;

  if not exists (
    select 1
    from public.task_resource_units tru
    where tru.task_id = t.id
      and tru.resource_unit_id = v_unit.id
      and tru.user_id = v_user
      and tru.status = 'pending'
  ) then
    raise exception 'RESOURCE_UNIT_NOT_PENDING_FOR_TASK';
  end if;

  if v_unit.is_active is not true
     or v_unit.page_start is null
     or v_unit.page_end is null
     or v_unit.page_start <= 0
     or v_unit.page_end < v_unit.page_start then
    raise exception 'PHYSICAL_RESOURCE_UNIT_RANGE_INVALID';
  end if;

  v_material_type := case
    when v_unit.unit_type = 'test' then 'test'
    else 'page_range'
  end;

  if v_unit.resource_section_id is not null then
    select * into v_section
    from public.resource_sections
    where id = v_unit.resource_section_id
      and resource_id = v_unit.resource_id;

    if not found then raise exception 'RESOURCE_SECTION_NOT_FOUND'; end if;
  end if;

  select * into v_progress
  from public.resource_unit_progress
  where user_id = v_user
    and resource_unit_id = v_unit.id
  for update;

  if not found or v_progress.status = 'not_started' then
    v_start_boundary := v_unit.page_start - 1;
  elsif v_progress.status = 'in_progress'
        and v_progress.completed_through_page is not null
        and v_progress.completed_through_page >= v_unit.page_start
        and v_progress.completed_through_page < v_unit.page_end then
    v_start_boundary := v_progress.completed_through_page;
  elsif v_progress.status = 'completed' then
    raise exception 'PHYSICAL_RESOURCE_UNIT_ALREADY_COMPLETED';
  elsif v_progress.status = 'skipped' then
    raise exception 'PHYSICAL_RESOURCE_UNIT_SKIPPED';
  else
    raise exception 'PHYSICAL_PROGRESS_BOUNDARY_UNAVAILABLE';
  end if;

  perform public.start_task(t.id);

  insert into public.study_sessions (
    user_id,
    exam_profile_id,
    task_id,
    subject_id,
    curriculum_node_id,
    resource_id,
    resource_unit_id,
    session_type,
    started_at,
    status,
    entry_source
  ) values (
    v_user,
    t.exam_profile_id,
    t.id,
    t.subject_id,
    t.curriculum_node_id,
    v_unit.resource_id,
    v_unit.id,
    'task',
    now(),
    'active',
    p_entry_source
  )
  returning * into s;

  insert into public.physical_study_activity_snapshots (
    study_session_id,
    user_id,
    exam_profile_id,
    task_id,
    subject_id,
    resource_id,
    resource_section_id,
    resource_unit_id,
    curriculum_node_id,
    material_type,
    unit_page_start,
    unit_page_end,
    start_page_boundary,
    activity_started_at
  ) values (
    s.id,
    v_user,
    t.exam_profile_id,
    t.id,
    t.subject_id,
    v_unit.resource_id,
    v_unit.resource_section_id,
    v_unit.id,
    v_section.curriculum_node_id,
    v_material_type,
    v_unit.page_start,
    v_unit.page_end,
    v_start_boundary,
    s.started_at
  );

  return to_jsonb(s) || jsonb_build_object(
    'materialType', v_material_type,
    'startPageBoundary', v_start_boundary,
    'paceEvidenceCapture', 'candidate'
  );
end;
$$;

create or replace function public.pause_physical_study_session(
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  s public.study_sessions;
  v_snapshot public.physical_study_activity_snapshots;
  v_break public.physical_study_activity_breaks;
  v_common jsonb;
begin
  if v_user is null then raise exception 'UNAUTHORIZED'; end if;

  select * into s
  from public.study_sessions
  where id = p_session_id
    and user_id = v_user
  for update;

  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if s.status <> 'active' then raise exception 'SESSION_NOT_ACTIVE'; end if;

  select * into v_snapshot
  from public.physical_study_activity_snapshots
  where study_session_id = s.id
    and user_id = v_user
  for update;

  if not found then raise exception 'PHYSICAL_PACE_SESSION_REQUIRED'; end if;

  v_common := public.pause_study_session(s.id);

  select * into v_break
  from public.physical_study_activity_breaks
  where study_session_id = s.id
    and user_id = v_user
    and ended_at is null
  for update;

  if not found then
    insert into public.physical_study_activity_breaks (
      study_session_id,
      user_id,
      exam_profile_id,
      started_at
    ) values (
      s.id,
      v_user,
      v_snapshot.exam_profile_id,
      now()
    )
    returning * into v_break;
  end if;

  return v_common || jsonb_build_object(
    'physicalBreak', to_jsonb(v_break),
    'physicalPaceEvidenceCapture', true
  );
end;
$$;

create or replace function public.resume_physical_study_session(
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  s public.study_sessions;
  v_break public.physical_study_activity_breaks;
  v_common jsonb;
  v_resumed_at timestamptz := now();
begin
  if v_user is null then raise exception 'UNAUTHORIZED'; end if;

  select * into s
  from public.study_sessions
  where id = p_session_id
    and user_id = v_user
  for update;

  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if s.status <> 'active' then raise exception 'SESSION_NOT_ACTIVE'; end if;

  perform 1
  from public.physical_study_activity_snapshots
  where study_session_id = s.id
    and user_id = v_user
  for update;

  if not found then raise exception 'PHYSICAL_PACE_SESSION_REQUIRED'; end if;

  v_common := public.resume_study_session(s.id);

  select * into v_break
  from public.physical_study_activity_breaks
  where study_session_id = s.id
    and user_id = v_user
    and ended_at is null
  for update;

  if found then
    update public.physical_study_activity_breaks
    set ended_at = v_resumed_at
    where id = v_break.id
    returning * into v_break;
  end if;

  return v_common || jsonb_build_object(
    'physicalBreak', case
      when v_break.id is null then null
      else to_jsonb(v_break)
    end,
    'physicalPaceEvidenceCapture', true
  );
end;
$$;

create or replace function public.finish_physical_study_session(
  p_session_id uuid,
  p_end_page_boundary integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  s public.study_sessions;
  v_snapshot public.physical_study_activity_snapshots;
  v_unit public.resource_units;
  v_progress public.resource_unit_progress;
  v_existing public.physical_pace_evidence;
  v_evidence public.physical_pace_evidence;
  v_current_boundary integer;
  v_active_seconds integer;
  mins integer;
  break_seconds numeric := 0;
  v_common_pause_open boolean;
  v_physical_pause_open boolean;
  finished_at timestamptz := now();
  v_accounting jsonb;
begin
  if v_user is null then raise exception 'UNAUTHORIZED'; end if;

  select * into s
  from public.study_sessions
  where id = p_session_id
    and user_id = v_user
  for update;

  if not found then raise exception 'SESSION_NOT_FOUND'; end if;

  if s.status = 'completed' then
    select * into v_existing
    from public.physical_pace_evidence
    where user_id = v_user
      and study_session_id = s.id;

    return to_jsonb(s) || jsonb_build_object(
      'evidence', case
        when v_existing.id is not null then to_jsonb(v_existing)
        else null
      end,
      'idempotent', true
    );
  end if;

  if s.status <> 'active' then raise exception 'SESSION_NOT_ACTIVE'; end if;

  select * into v_snapshot
  from public.physical_study_activity_snapshots
  where study_session_id = s.id
    and user_id = v_user
  for update;

  if not found then raise exception 'PHYSICAL_PACE_SESSION_REQUIRED'; end if;

  if s.exam_profile_id is distinct from v_snapshot.exam_profile_id
     or s.task_id is distinct from v_snapshot.task_id
     or s.subject_id is distinct from v_snapshot.subject_id
     or s.resource_id is distinct from v_snapshot.resource_id
     or s.resource_unit_id is distinct from v_snapshot.resource_unit_id then
    raise exception 'PHYSICAL_SESSION_IDENTITY_CHANGED';
  end if;

  select * into v_unit
  from public.resource_units
  where id = v_snapshot.resource_unit_id
    and resource_id = v_snapshot.resource_id
  for update;

  if not found
     or v_unit.is_active is not true
     or v_unit.page_start is distinct from v_snapshot.unit_page_start
     or v_unit.page_end is distinct from v_snapshot.unit_page_end
     or v_unit.resource_section_id is distinct from v_snapshot.resource_section_id
     or (case when v_unit.unit_type = 'test' then 'test' else 'page_range' end)
        is distinct from v_snapshot.material_type then
    raise exception 'PHYSICAL_RESOURCE_UNIT_RANGE_INVALID';
  end if;

  if p_end_page_boundary < v_snapshot.unit_page_start - 1
     or p_end_page_boundary > v_snapshot.unit_page_end then
    raise exception 'PHYSICAL_PAGE_BOUNDARY_INVALID';
  end if;

  if p_end_page_boundary < v_snapshot.start_page_boundary then
    raise exception 'PHYSICAL_PROGRESS_REVERSAL';
  end if;

  select * into v_progress
  from public.resource_unit_progress
  where user_id = v_user
    and resource_unit_id = v_snapshot.resource_unit_id
  for update;

  if not found or v_progress.status = 'not_started' then
    v_current_boundary := v_snapshot.unit_page_start - 1;
  elsif v_progress.status = 'in_progress'
        and v_progress.completed_through_page is not null
        and v_progress.completed_through_page >= v_snapshot.unit_page_start
        and v_progress.completed_through_page < v_snapshot.unit_page_end then
    v_current_boundary := v_progress.completed_through_page;
  elsif v_progress.status = 'completed' then
    v_current_boundary := v_snapshot.unit_page_end;
  else
    raise exception 'PHYSICAL_PROGRESS_BOUNDARY_UNAVAILABLE';
  end if;

  if v_current_boundary <> v_snapshot.start_page_boundary then
    raise exception 'PHYSICAL_PROGRESS_CHANGED_DURING_SESSION';
  end if;

  select exists (
    select 1
    from public.study_session_breaks
    where session_id = s.id
      and user_id = v_user
      and ended_at is null
  ) into v_common_pause_open;

  select exists (
    select 1
    from public.physical_study_activity_breaks
    where study_session_id = s.id
      and user_id = v_user
      and ended_at is null
  ) into v_physical_pause_open;

  if v_common_pause_open is distinct from v_physical_pause_open then
    raise exception 'PHYSICAL_BREAK_STATE_MISMATCH';
  end if;

  update public.study_session_breaks
  set ended_at = finished_at
  where session_id = s.id
    and user_id = v_user
    and ended_at is null;

  update public.physical_study_activity_breaks
  set ended_at = finished_at
  where study_session_id = s.id
    and user_id = v_user
    and ended_at is null;

  select coalesce(
    sum(extract(epoch from (ended_at - started_at))),
    0
  ) into break_seconds
  from public.physical_study_activity_breaks
  where study_session_id = s.id
    and user_id = v_user
    and ended_at is not null;

  v_active_seconds := floor(greatest(
    0,
    extract(epoch from (finished_at-v_snapshot.activity_started_at))-break_seconds
  ))::integer;

  if p_end_page_boundary > v_snapshot.start_page_boundary
     and v_active_seconds <= 0 then
    raise exception 'PHYSICAL_ACTIVE_TIME_REQUIRED';
  end if;

  mins := greatest(1, floor(v_active_seconds / 60.0)::integer);

  update public.study_sessions
  set ended_at = finished_at,
      duration_minutes = mins,
      status = 'completed',
      accounted_at = finished_at
  where id = s.id
    and user_id = v_user
  returning * into s;

  v_accounting := public.account_completed_study_session(
    s.id,
    'planned',
    'inferred_task_start',
    'session:' || s.id::text || ':primary'
  );

  if p_end_page_boundary = v_snapshot.start_page_boundary then
    return v_accounting || jsonb_build_object(
      'evidence',null,
      'zeroProgress',true,
      'idempotent',false
    );
  end if;

  insert into public.resource_unit_progress (
    user_id,
    resource_unit_id,
    status,
    completed_at,
    completed_through_page,
    attempt_count
  ) values (
    v_user,
    v_snapshot.resource_unit_id,
    case when p_end_page_boundary = v_snapshot.unit_page_end
      then 'completed' else 'in_progress' end,
    case when p_end_page_boundary = v_snapshot.unit_page_end
      then finished_at else null end,
    p_end_page_boundary,
    1
  )
  on conflict (user_id, resource_unit_id) do update set
    status = excluded.status,
    completed_at = excluded.completed_at,
    completed_through_page = excluded.completed_through_page,
    attempt_count = public.resource_unit_progress.attempt_count + 1;

  insert into public.physical_pace_evidence (
    user_id,
    exam_profile_id,
    study_session_id,
    subject_id,
    resource_id,
    resource_section_id,
    resource_unit_id,
    curriculum_node_id,
    material_type,
    progress_unit,
    start_page_boundary,
    end_page_boundary,
    actual_active_seconds,
    activity_started_at,
    activity_ended_at,
    evidence_status,
    evidence_provenance,
    rejection_reason
  ) values (
    v_user,
    v_snapshot.exam_profile_id,
    s.id,
    v_snapshot.subject_id,
    v_snapshot.resource_id,
    v_snapshot.resource_section_id,
    v_snapshot.resource_unit_id,
    v_snapshot.curriculum_node_id,
    v_snapshot.material_type,
    'page',
    v_snapshot.start_page_boundary,
    p_end_page_boundary,
    v_active_seconds,
    v_snapshot.activity_started_at,
    finished_at,
    'accepted',
    'atomic_physical_finish',
    null
  )
  returning * into v_evidence;

  if p_end_page_boundary = v_snapshot.unit_page_end then
    perform public.complete_task_unit(
      v_snapshot.task_id,
      v_snapshot.resource_unit_id
    );
  end if;

  return v_accounting || jsonb_build_object(
    'evidence',to_jsonb(v_evidence),
    'zeroProgress',false,
    'idempotent',false
  );
end;
$$;

revoke all on function
  public.prevent_physical_evidence_update(),
  public.start_physical_study_session(uuid, uuid, text),
  public.pause_physical_study_session(uuid),
  public.resume_physical_study_session(uuid),
  public.finish_physical_study_session(uuid, integer)
from public, anon;

grant execute on function public.start_physical_study_session(uuid, uuid, text)
to authenticated;

grant execute on function public.pause_physical_study_session(uuid)
to authenticated;

grant execute on function public.resume_physical_study_session(uuid)
to authenticated;

grant execute on function public.finish_physical_study_session(uuid, integer)
to authenticated;

comment on table public.physical_study_activity_snapshots is
  'Protected W2 server-time and material-boundary snapshots. Authenticated users have read-only access.';

comment on table public.physical_study_activity_breaks is
  'Protected W2 pause ledger used for actual active time. Ordinary editable break rows are not duration authority.';

comment on table public.physical_pace_evidence is
  'Immutable accepted W2 samples created only by an atomic physical study finish. No historical backfill.';

commit;
