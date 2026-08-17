begin;

alter table public.resource_sections
  add column if not exists canonical_key text null,
  add column if not exists page_start integer null,
  add column if not exists page_end integer null,
  add column if not exists physical_range text null,
  add column if not exists source_unit_type text null,
  add column if not exists basis text null,
  add column if not exists confidence text null,
  add column if not exists evidence text null,
  add column if not exists source_notes text null,
  add column if not exists planning_role text not null default 'curriculum',
  add column if not exists is_active boolean not null default true;

alter table public.resource_sections
  add constraint resource_sections_canonical_key_not_blank
    check (canonical_key is null or btrim(canonical_key) <> ''),
  add constraint resource_sections_page_start_positive
    check (page_start is null or page_start > 0),
  add constraint resource_sections_page_range_valid
    check (page_end is null or (page_start is not null and page_end >= page_start)),
  add constraint resource_sections_planning_role_valid
    check (planning_role in ('curriculum','mixed_review','review_only','reference_only')),
  add constraint resource_sections_resource_canonical_unique
    unique (resource_id, canonical_key);

alter table public.resource_units
  add column if not exists external_key text null,
  add column if not exists page_start integer null,
  add column if not exists page_end integer null,
  add column if not exists physical_range text null,
  add column if not exists slice_basis text null,
  add column if not exists is_active boolean not null default true;

alter table public.resource_units
  add constraint resource_units_external_key_not_blank
    check (external_key is null or btrim(external_key) <> ''),
  add constraint resource_units_page_start_positive
    check (page_start is null or page_start > 0),
  add constraint resource_units_page_range_valid
    check (page_end is null or (page_start is not null and page_end >= page_start)),
  add constraint resource_units_section_external_unique
    unique (resource_section_id, external_key);

do $$
begin
  if exists (
    select 1
    from public.p48_resource_targets
    where reference_resource_id is not null
    group by user_id, exam_profile_id, reference_resource_id
    having count(*) > 1
  ) then
    raise exception 'P48_REFERENCE_TARGET_DUPLICATES_REQUIRE_MANUAL_REVIEW';
  end if;
end;
$$;

create unique index p48_resource_targets_profile_reference_unique
on public.p48_resource_targets (user_id, exam_profile_id, reference_resource_id)
where reference_resource_id is not null;

do $$
declare
  candidate record;
begin
  for candidate in
    select * from (values
      ('30000000-0000-0000-0000-000000000306'::uuid, '20000000-0000-0000-0000-000000000004'::uuid, 'Su, Toprak ve Bitki Varlığı'::text, 6),
      ('30000000-0000-0000-0000-000000000307'::uuid, '20000000-0000-0000-0000-000000000004'::uuid, 'Doğal Afetler ve Çevre'::text, 7),
      ('30000000-0000-0000-0000-000000000308'::uuid, '20000000-0000-0000-0000-000000000004'::uuid, 'Bölge Kavramı ve Sistematiği'::text, 8),
      ('30000000-0000-0000-0000-000000001309'::uuid, '20000000-0000-0000-0000-000000000001'::uuid, 'Dil Bilgisi'::text, 9),
      ('30000000-0000-0000-0000-000000001310'::uuid, '20000000-0000-0000-0000-000000000001'::uuid, 'Anlatım Bilgileri'::text, 10)
    ) as approved(id, subject_id, name, sort_order)
  loop
    if exists (
      select 1 from public.curriculum_nodes node
      where node.id = candidate.id
        and (node.subject_id <> candidate.subject_id or node.name <> candidate.name)
    ) then
      raise exception 'CURRICULUM_NODE_ID_CONFLICT:%', candidate.id;
    end if;
  end loop;
end;
$$;

insert into public.curriculum_nodes(id,subject_id,parent_id,node_type,name,sort_order,is_active)
values
  ('30000000-0000-0000-0000-000000000306','20000000-0000-0000-0000-000000000004',null,'topic','Su, Toprak ve Bitki Varlığı',6,true),
  ('30000000-0000-0000-0000-000000000307','20000000-0000-0000-0000-000000000004',null,'topic','Doğal Afetler ve Çevre',7,true),
  ('30000000-0000-0000-0000-000000000308','20000000-0000-0000-0000-000000000004',null,'topic','Bölge Kavramı ve Sistematiği',8,true),
  ('30000000-0000-0000-0000-000000001309','20000000-0000-0000-0000-000000000001',null,'topic','Dil Bilgisi',9,true),
  ('30000000-0000-0000-0000-000000001310','20000000-0000-0000-0000-000000000001',null,'topic','Anlatım Bilgileri',10,true)
on conflict (id) do nothing;

insert into public.topic_progress(user_id,exam_profile_id,curriculum_node_id)
select selected.user_id,selected.exam_profile_id,node.id
from public.user_subjects selected
join public.curriculum_nodes node on node.subject_id=selected.subject_id
where selected.status='active'
  and node.id in (
    '30000000-0000-0000-0000-000000000306',
    '30000000-0000-0000-0000-000000000307',
    '30000000-0000-0000-0000-000000000308',
    '30000000-0000-0000-0000-000000001309',
    '30000000-0000-0000-0000-000000001310'
  )
on conflict(exam_profile_id,curriculum_node_id) do nothing;

create table public.p48_week_capacity_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_profile_id uuid not null,
  week_start_date date not null,
  capacity_minutes integer not null,
  planning_budget_minutes integer not null,
  reserve_minutes integer not null,
  source_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint p48_week_capacity_profile_owner_fk foreign key(exam_profile_id,user_id)
    references public.exam_profiles(id,user_id) on delete cascade,
  constraint p48_week_capacity_unique unique(exam_profile_id,week_start_date),
  constraint p48_week_capacity_monday check(extract(isodow from week_start_date)=1),
  constraint p48_week_capacity_values check(
    capacity_minutes > 0 and planning_budget_minutes >= 0 and reserve_minutes >= 0
    and planning_budget_minutes + reserve_minutes = capacity_minutes
  ),
  constraint p48_week_capacity_source_not_blank check(btrim(source_key) <> '')
);

create table public.p48_daily_capacity_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_profile_id uuid not null,
  capacity_date date not null,
  capacity_minutes integer not null,
  reserve_minutes integer not null,
  source_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint p48_daily_capacity_profile_owner_fk foreign key(exam_profile_id,user_id)
    references public.exam_profiles(id,user_id) on delete cascade,
  constraint p48_daily_capacity_unique unique(exam_profile_id,capacity_date),
  constraint p48_daily_capacity_values check(
    capacity_minutes > 0 and reserve_minutes >= 0 and reserve_minutes <= capacity_minutes
  ),
  constraint p48_daily_capacity_source_not_blank check(btrim(source_key) <> '')
);

create trigger p48_week_capacity_overrides_set_updated_at before update on public.p48_week_capacity_overrides
for each row execute function public.set_updated_at();
create trigger p48_daily_capacity_overrides_set_updated_at before update on public.p48_daily_capacity_overrides
for each row execute function public.set_updated_at();

alter table public.p48_week_capacity_overrides enable row level security;
alter table public.p48_daily_capacity_overrides enable row level security;
revoke all on public.p48_week_capacity_overrides, public.p48_daily_capacity_overrides from public,anon;
grant select,insert,update,delete on public.p48_week_capacity_overrides, public.p48_daily_capacity_overrides to authenticated;

create policy "Users own P48 week capacity overrides" on public.p48_week_capacity_overrides
for all to authenticated using((select auth.uid())=user_id)
with check((select auth.uid())=user_id);
create policy "Users own P48 daily capacity overrides" on public.p48_daily_capacity_overrides
for all to authenticated using((select auth.uid())=user_id)
with check((select auth.uid())=user_id);

alter table public.tasks
  add column if not exists resource_section_id uuid null;

alter table public.tasks
  add constraint tasks_resource_section_resource_fk
    foreign key(resource_section_id,resource_id)
    references public.resource_sections(id,resource_id),
  add constraint tasks_section_requires_resource
    check(resource_section_id is null or resource_id is not null);

alter table public.tasks drop constraint tasks_source_reason_valid;
alter table public.tasks add constraint tasks_source_reason_valid check (
  source_reason in ('curriculum_progress','resource_progress','carryover','manual','revision_due','dynamic_replan','baseline_import')
);

create function public.persist_p48_baseline_plan(
  p_exam_profile_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_week_start date := (p_payload->>'weekStartDate')::date;
  v_week_end date := v_week_start + 6;
  v_capacity integer := (p_payload->>'capacityMinutes')::integer;
  v_budget integer := (p_payload->>'planningBudgetMinutes')::integer;
  v_reserve integer := (p_payload->>'reserveMinutes')::integer;
  v_source_key text := btrim(coalesce(p_payload->>'sourceKey',''));
  v_plan public.weekly_plans;
  v_plan_found boolean := false;
  v_day jsonb;
  v_task_json jsonb;
  v_unit_json jsonb;
  v_task public.tasks;
  v_inserted integer := 0;
  v_linked integer := 0;
  v_planned integer := 0;
  v_payload_task_count integer;
begin
  if v_user is null then raise exception 'UNAUTHORIZED'; end if;
  if not exists(select 1 from public.exam_profiles where id=p_exam_profile_id and user_id=v_user and status='active') then
    raise exception 'INVALID_EXAM_PROFILE';
  end if;
  if v_week_start is null or extract(isodow from v_week_start) <> 1 then raise exception 'INVALID_WEEK_START'; end if;
  if v_capacity <= 0 or v_budget < 0 or v_reserve < 0 or v_budget + v_reserve <> v_capacity then
    raise exception 'INVALID_BASELINE_CAPACITY';
  end if;
  if v_source_key = '' then raise exception 'INVALID_BASELINE_SOURCE_KEY'; end if;
  if jsonb_array_length(coalesce(p_payload->'dailyCapacity','[]'::jsonb)) <> 7 then
    raise exception 'INVALID_DAILY_CAPACITY_COUNT';
  end if;
  if (select coalesce(sum((value->>'capacityMinutes')::integer),0) from jsonb_array_elements(p_payload->'dailyCapacity')) <> v_capacity
    or (select coalesce(sum((value->>'reserveMinutes')::integer),0) from jsonb_array_elements(p_payload->'dailyCapacity')) <> v_reserve then
    raise exception 'INVALID_DAILY_CAPACITY_TOTALS';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text || p_exam_profile_id::text || v_week_start::text || ':p48-baseline',0));

  insert into public.p48_week_capacity_overrides(
    user_id,exam_profile_id,week_start_date,capacity_minutes,planning_budget_minutes,reserve_minutes,source_key
  ) values(v_user,p_exam_profile_id,v_week_start,v_capacity,v_budget,v_reserve,v_source_key)
  on conflict(exam_profile_id,week_start_date) do update set
    capacity_minutes=excluded.capacity_minutes,
    planning_budget_minutes=excluded.planning_budget_minutes,
    reserve_minutes=excluded.reserve_minutes,
    source_key=excluded.source_key
  where (public.p48_week_capacity_overrides.capacity_minutes,
         public.p48_week_capacity_overrides.planning_budget_minutes,
         public.p48_week_capacity_overrides.reserve_minutes,
         public.p48_week_capacity_overrides.source_key)
    is distinct from
        (excluded.capacity_minutes,excluded.planning_budget_minutes,excluded.reserve_minutes,excluded.source_key);

  for v_day in select value from jsonb_array_elements(p_payload->'dailyCapacity')
  loop
    if (v_day->>'date')::date < v_week_start or (v_day->>'date')::date > v_week_end then
      raise exception 'INVALID_DAILY_CAPACITY_DATE';
    end if;
    insert into public.p48_daily_capacity_overrides(
      user_id,exam_profile_id,capacity_date,capacity_minutes,reserve_minutes,source_key
    ) values(
      v_user,p_exam_profile_id,(v_day->>'date')::date,
      (v_day->>'capacityMinutes')::integer,(v_day->>'reserveMinutes')::integer,v_source_key
    )
    on conflict(exam_profile_id,capacity_date) do update set
      capacity_minutes=excluded.capacity_minutes,
      reserve_minutes=excluded.reserve_minutes,
      source_key=excluded.source_key
    where (public.p48_daily_capacity_overrides.capacity_minutes,
           public.p48_daily_capacity_overrides.reserve_minutes,
           public.p48_daily_capacity_overrides.source_key)
      is distinct from (excluded.capacity_minutes,excluded.reserve_minutes,excluded.source_key);
  end loop;

  select * into v_plan from public.weekly_plans
  where user_id=v_user and exam_profile_id=p_exam_profile_id
    and week_start_date=v_week_start and status='active'
  for update;

  v_plan_found := found;

  if v_plan_found and exists(
    select 1 from public.tasks
    where weekly_plan_id=v_plan.id and user_id=v_user
      and status not in ('cancelled','missed') and source_reason <> 'baseline_import'
  ) then
    raise exception 'BASELINE_WEEK_HAS_OTHER_ACTIVE_TASKS';
  end if;

  if not v_plan_found then
    insert into public.weekly_plans(
      user_id,exam_profile_id,week_start_date,week_end_date,
      available_minutes,planning_budget_minutes,planned_minutes,status,generation_version
    ) values(v_user,p_exam_profile_id,v_week_start,v_week_end,v_capacity,v_budget,0,'active',2)
    returning * into v_plan;
  end if;

  v_payload_task_count := jsonb_array_length(coalesce(p_payload->'tasks','[]'::jsonb));
  for v_task_json in select value from jsonb_array_elements(coalesce(p_payload->'tasks','[]'::jsonb))
  loop
    if (v_task_json->>'plannedDate')::date < v_week_start or (v_task_json->>'plannedDate')::date > v_week_end then
      raise exception 'INVALID_BASELINE_TASK_DATE';
    end if;
    if (v_task_json->>'estimatedMinutes')::integer <= 0 then raise exception 'INVALID_BASELINE_TASK_MINUTES'; end if;
    if not exists(
      select 1 from public.user_subjects
      where user_id=v_user and exam_profile_id=p_exam_profile_id
        and subject_id=(v_task_json->>'subjectId')::uuid and status='active'
    ) then raise exception 'INVALID_BASELINE_SUBJECT'; end if;
    if not exists(
      select 1 from public.resources
      where id=(v_task_json->>'resourceId')::uuid and user_id=v_user
        and exam_profile_id=p_exam_profile_id and subject_id=(v_task_json->>'subjectId')::uuid
    ) then raise exception 'INVALID_BASELINE_RESOURCE'; end if;
    if nullif(v_task_json->>'resourceSectionId','') is not null and not exists(
      select 1 from public.resource_sections
      where id=(v_task_json->>'resourceSectionId')::uuid
        and resource_id=(v_task_json->>'resourceId')::uuid and is_active=true
    ) then raise exception 'INVALID_BASELINE_SECTION'; end if;
    if jsonb_array_length(coalesce(v_task_json->'resourceUnitIds','[]'::jsonb)) = 0 then
      raise exception 'BASELINE_TASK_WITHOUT_UNITS';
    end if;
    for v_unit_json in select value from jsonb_array_elements(v_task_json->'resourceUnitIds')
    loop
      if not exists(
        select 1 from public.resource_units
        where id=(v_unit_json#>>'{}')::uuid
          and resource_id=(v_task_json->>'resourceId')::uuid and is_active=true
      ) then raise exception 'INVALID_BASELINE_UNIT'; end if;
    end loop;

    v_task.id := null;
    insert into public.tasks(
      user_id,exam_profile_id,weekly_plan_id,subject_id,curriculum_node_id,
      resource_id,resource_section_id,carried_from_task_id,task_type,work_mode,
      title,description,planned_date,estimated_minutes,importance,priority_score,
      status,source_reason,dedupe_key
    ) values(
      v_user,p_exam_profile_id,v_plan.id,(v_task_json->>'subjectId')::uuid,
      nullif(v_task_json->>'curriculumNodeId','')::uuid,
      (v_task_json->>'resourceId')::uuid,nullif(v_task_json->>'resourceSectionId','')::uuid,
      null,'solve_resource_units',nullif(v_task_json->>'workMode',''),
      v_task_json->>'title',nullif(v_task_json->>'description',''),
      (v_task_json->>'plannedDate')::date,(v_task_json->>'estimatedMinutes')::integer,
      'important',60,'ready','baseline_import',v_task_json->>'dedupeKey'
    ) on conflict(weekly_plan_id,dedupe_key) do nothing
    returning * into v_task;

    if v_task.id is not null then v_inserted := v_inserted + 1; end if;
    if v_task.id is null then
      select * into v_task from public.tasks
      where weekly_plan_id=v_plan.id and dedupe_key=v_task_json->>'dedupeKey' and user_id=v_user;
    end if;
    if v_task.source_reason <> 'baseline_import' then raise exception 'BASELINE_DEDUPE_CONFLICT'; end if;

    insert into public.task_progress(task_id,user_id,completed_minutes,actual_study_minutes)
    values(v_task.id,v_user,0,0) on conflict(task_id) do nothing;

    for v_unit_json in select value from jsonb_array_elements(v_task_json->'resourceUnitIds')
    loop
      insert into public.task_resource_units(user_id,task_id,resource_unit_id)
      values(v_user,v_task.id,(v_unit_json#>>'{}')::uuid)
      on conflict(task_id,resource_unit_id) do nothing;
      if found then v_linked := v_linked + 1; end if;
    end loop;
  end loop;

  select count(*)::integer,coalesce(sum(estimated_minutes),0)::integer
  into v_payload_task_count,v_planned
  from public.tasks
  where user_id=v_user and weekly_plan_id=v_plan.id
    and source_reason='baseline_import' and status not in ('cancelled','missed');

  if v_planned <> v_budget then raise exception 'BASELINE_PLANNED_MINUTES_MISMATCH'; end if;
  if v_payload_task_count <> jsonb_array_length(p_payload->'tasks') then raise exception 'BASELINE_TASK_COUNT_MISMATCH'; end if;

  update public.weekly_plans set
    available_minutes=v_capacity,
    planning_budget_minutes=v_budget,
    planned_minutes=v_planned,
    generation_version=greatest(generation_version,2)
  where id=v_plan.id
    and (available_minutes,planning_budget_minutes,planned_minutes,generation_version)
      is distinct from (v_capacity,v_budget,v_planned,greatest(generation_version,2));

  return jsonb_build_object(
    'weeklyPlanId',v_plan.id,'taskCount',v_payload_task_count,
    'insertedTaskCount',v_inserted,'insertedTaskUnitLinks',v_linked,
    'capacityMinutes',v_capacity,'planningBudgetMinutes',v_budget,'reserveMinutes',v_reserve
  );
end;
$$;

revoke all on function public.persist_p48_baseline_plan(uuid,jsonb) from public,anon;
grant execute on function public.persist_p48_baseline_plan(uuid,jsonb) to authenticated;

create function public.service_persist_p48_baseline_plan(
  p_user_id uuid,
  p_exam_profile_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
begin
  if not exists(
    select 1 from public.exam_profiles
    where id=p_exam_profile_id and user_id=p_user_id and status='active'
  ) then raise exception 'INVALID_EXAM_PROFILE_OWNERSHIP'; end if;
  perform set_config('request.jwt.claim.sub',p_user_id::text,true);
  return public.persist_p48_baseline_plan(p_exam_profile_id,p_payload);
end;
$$;

revoke all on function public.service_persist_p48_baseline_plan(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.service_persist_p48_baseline_plan(uuid,uuid,jsonb) to service_role;

commit;
