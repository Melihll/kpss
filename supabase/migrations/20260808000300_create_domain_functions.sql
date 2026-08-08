create function public.initialize_subject_progress(
  p_exam_profile_id uuid,
  p_subject_id uuid
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inserted_count integer;
begin
  insert into public.topic_progress (
    user_id,
    exam_profile_id,
    curriculum_node_id
  )
  select
    auth.uid(),
    p_exam_profile_id,
    curriculum.id
  from public.curriculum_nodes as curriculum
  join public.exam_profiles as profile
    on profile.id = p_exam_profile_id
   and profile.user_id = auth.uid()
  join public.user_subjects as selected_subject
    on selected_subject.exam_profile_id = profile.id
   and selected_subject.user_id = profile.user_id
   and selected_subject.subject_id = p_subject_id
   and selected_subject.status = 'active'
  where curriculum.subject_id = p_subject_id
    and curriculum.is_active = true
  on conflict (exam_profile_id, curriculum_node_id) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create function public.create_bulk_resource_units(
  p_resource_id uuid,
  p_section_id uuid,
  p_prefix text,
  p_start integer,
  p_end integer,
  p_unit_type text
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inserted_count integer;
begin
  if nullif(btrim(p_prefix), '') is null then
    raise exception 'Unit prefix is required';
  end if;
  if p_start is null or p_end is null or p_start < 1 or p_end < p_start or p_end - p_start + 1 > 200 then
    raise exception 'Unit range must contain between 1 and 200 items';
  end if;
  if p_unit_type not in ('test', 'video', 'chapter', 'reading', 'mock', 'other') then
    raise exception 'Invalid resource unit type';
  end if;
  if not exists (
    select 1 from public.resource_sections section
    join public.resources resource on resource.id = section.resource_id
    where section.id = p_section_id
      and section.resource_id = p_resource_id
      and resource.user_id = auth.uid()
  ) then
    raise exception 'Resource section not found or not owned by current user';
  end if;

  insert into public.resource_units (
    resource_id,
    resource_section_id,
    unit_type,
    name,
    sort_order
  )
  select
    p_resource_id,
    p_section_id,
    p_unit_type,
    format('%s %s', btrim(p_prefix), unit_number),
    unit_number
  from generate_series(p_start, p_end) as unit_number
  on conflict do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.initialize_subject_progress(uuid, uuid) from public, anon;
revoke all on function public.create_bulk_resource_units(uuid, uuid, text, integer, integer, text) from public, anon;
grant execute on function public.initialize_subject_progress(uuid, uuid) to authenticated;
grant execute on function public.create_bulk_resource_units(uuid, uuid, text, integer, integer, text) to authenticated;
