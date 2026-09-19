begin;

create table public.ai_coach_proactive_presentations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_profile_id uuid not null,
  signal_type text not null,
  attention_category text not null,
  fingerprint text not null,
  condition_key text not null,
  materiality_policy_version text not null,
  calendar_date date not null,
  surface_session_id text not null,
  template_version text null,
  presentation_identity text not null,
  presented_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp(),
  constraint ai_coach_proactive_presentations_profile_owner_fk
    foreign key(exam_profile_id,user_id)
    references public.exam_profiles(id,user_id) on delete cascade,
  constraint ai_coach_proactive_presentations_signal_valid check(
    signal_type in (
      'today_completed_as_planned',
      'repeated_task_miss',
      'recent_recovery',
      'planner_warning_present'
    )
  ),
  constraint ai_coach_proactive_presentations_category_valid check(
    attention_category in ('progress','consistency','capacity','material','planner','data_quality')
  ),
  constraint ai_coach_proactive_presentations_signal_category_valid check(
    (signal_type = 'today_completed_as_planned' and attention_category = 'progress')
    or (signal_type in ('repeated_task_miss','recent_recovery') and attention_category = 'consistency')
    or (signal_type = 'planner_warning_present' and attention_category = 'planner')
  ),
  constraint ai_coach_proactive_presentations_identity_valid check(
    btrim(fingerprint) <> '' and length(fingerprint) <= 4096
    and btrim(condition_key) <> '' and length(condition_key) <= 2048
    and btrim(materiality_policy_version) <> '' and length(materiality_policy_version) <= 128
    and btrim(surface_session_id) <> '' and length(surface_session_id) <= 256
    and (template_version is null or (btrim(template_version) <> '' and length(template_version) <= 128))
    and btrim(presentation_identity) <> ''
  ),
  constraint ai_coach_proactive_presentations_identity_unique
    unique(user_id,exam_profile_id,presentation_identity)
);

create index ai_coach_proactive_presentations_scope_time_idx
on public.ai_coach_proactive_presentations(user_id,exam_profile_id,presented_at desc,id);

create index ai_coach_proactive_presentations_condition_idx
on public.ai_coach_proactive_presentations(user_id,exam_profile_id,condition_key,presented_at desc);

create table public.ai_coach_proactive_user_controls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_profile_id uuid not null,
  control_kind text not null,
  fingerprint text null,
  attention_category text null,
  snoozed_until timestamptz null,
  disabled boolean null,
  scope_key text generated always as (
    case when control_kind = 'dismiss_fingerprint' then fingerprint else attention_category end
  ) stored,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint ai_coach_proactive_user_controls_profile_owner_fk
    foreign key(exam_profile_id,user_id)
    references public.exam_profiles(id,user_id) on delete cascade,
  constraint ai_coach_proactive_user_controls_kind_valid check(
    control_kind in ('dismiss_fingerprint','snooze_category','disable_category')
  ),
  constraint ai_coach_proactive_user_controls_category_valid check(
    attention_category is null
    or attention_category in ('progress','consistency','capacity','material','planner','data_quality')
  ),
  constraint ai_coach_proactive_user_controls_shape_valid check(
    (
      control_kind = 'dismiss_fingerprint'
      and fingerprint is not null and btrim(fingerprint) <> '' and length(fingerprint) <= 4096
      and attention_category is null and snoozed_until is null and disabled is null
    )
    or (
      control_kind = 'snooze_category'
      and fingerprint is null and attention_category is not null
      and snoozed_until is not null and disabled is null
      and snoozed_until > created_at
    )
    or (
      control_kind = 'disable_category'
      and fingerprint is null and attention_category is not null
      and snoozed_until is null and disabled is not null
    )
  ),
  constraint ai_coach_proactive_user_controls_scope_unique
    unique(user_id,exam_profile_id,control_kind,scope_key)
);

create index ai_coach_proactive_user_controls_scope_idx
on public.ai_coach_proactive_user_controls(user_id,exam_profile_id,control_kind,updated_at desc);

create table public.ai_coach_proactive_clear_observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_profile_id uuid not null,
  signal_type text not null,
  condition_key text not null,
  observed_at timestamptz not null,
  reason_code text not null,
  source_identity text not null,
  source_fact_paths text[] not null,
  observation_identity text not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint ai_coach_proactive_clear_observations_profile_owner_fk
    foreign key(exam_profile_id,user_id)
    references public.exam_profiles(id,user_id) on delete cascade,
  constraint ai_coach_proactive_clear_observations_signal_valid check(
    signal_type in ('repeated_task_miss','planner_warning_present')
  ),
  constraint ai_coach_proactive_clear_observations_reason_valid check(
    (signal_type = 'repeated_task_miss' and reason_code = 'same_task_completion_observed')
    or (signal_type = 'planner_warning_present' and reason_code = 'planner_warning_count_zero_observed')
  ),
  constraint ai_coach_proactive_clear_observations_identity_valid check(
    btrim(condition_key) <> '' and length(condition_key) <= 2048
    and btrim(source_identity) <> '' and length(source_identity) <= 1024
    and cardinality(source_fact_paths) between 1 and 16
    and array_position(source_fact_paths,null) is null
    and btrim(observation_identity) <> ''
    and observed_at <= created_at
  ),
  constraint ai_coach_proactive_clear_observations_identity_unique
    unique(user_id,exam_profile_id,observation_identity)
);

create index ai_coach_proactive_clear_observations_scope_time_idx
on public.ai_coach_proactive_clear_observations(user_id,exam_profile_id,observed_at desc,id);

create index ai_coach_proactive_clear_observations_condition_idx
on public.ai_coach_proactive_clear_observations(user_id,exam_profile_id,signal_type,condition_key,observed_at desc);

create or replace function public.reject_ai_coach_proactive_immutable_mutation_v1()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  raise exception 'AI_COACH_PROACTIVE_EVENT_IMMUTABLE';
end;
$$;

create trigger ai_coach_proactive_presentations_immutable
before update or delete on public.ai_coach_proactive_presentations
for each row execute function public.reject_ai_coach_proactive_immutable_mutation_v1();

create trigger ai_coach_proactive_clear_observations_immutable
before update or delete on public.ai_coach_proactive_clear_observations
for each row execute function public.reject_ai_coach_proactive_immutable_mutation_v1();

create trigger ai_coach_proactive_user_controls_set_updated_at
before update on public.ai_coach_proactive_user_controls
for each row execute function public.set_updated_at();

alter table public.ai_coach_proactive_presentations enable row level security;
alter table public.ai_coach_proactive_user_controls enable row level security;
alter table public.ai_coach_proactive_clear_observations enable row level security;

revoke all on public.ai_coach_proactive_presentations from public,anon,authenticated,service_role;
revoke all on public.ai_coach_proactive_user_controls from public,anon,authenticated,service_role;
revoke all on public.ai_coach_proactive_clear_observations from public,anon,authenticated,service_role;

grant select on public.ai_coach_proactive_presentations to authenticated,service_role;
grant select on public.ai_coach_proactive_user_controls to authenticated,service_role;
grant select on public.ai_coach_proactive_clear_observations to authenticated,service_role;

create policy ai_coach_proactive_presentations_select_own
on public.ai_coach_proactive_presentations for select to authenticated
using((select auth.uid()) = user_id);

create policy ai_coach_proactive_user_controls_select_own
on public.ai_coach_proactive_user_controls for select to authenticated
using((select auth.uid()) = user_id);

create policy ai_coach_proactive_clear_observations_select_own
on public.ai_coach_proactive_clear_observations for select to authenticated
using((select auth.uid()) = user_id);

create or replace function public.record_ai_coach_proactive_presentation_v1(
  p_user_id uuid,
  p_exam_profile_id uuid,
  p_signal_type text,
  p_attention_category text,
  p_fingerprint text,
  p_condition_key text,
  p_materiality_policy_version text,
  p_calendar_date date,
  p_surface_session_id text,
  p_template_version text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_identity text;
  v_rearm_identity text := 'initial';
  v_existing public.ai_coach_proactive_presentations;
  v_inserted public.ai_coach_proactive_presentations;
begin
  if current_user not in ('service_role','postgres') then raise exception 'FORBIDDEN'; end if;
  if not exists(
    select 1 from public.exam_profiles p
    where p.id = p_exam_profile_id and p.user_id = p_user_id
  ) then raise exception 'AI_COACH_PROACTIVE_PROFILE_NOT_OWNED'; end if;

  if p_signal_type in ('repeated_task_miss','planner_warning_present') then
    select c.observation_identity into v_rearm_identity
    from public.ai_coach_proactive_clear_observations c
    where c.user_id = p_user_id
      and c.exam_profile_id = p_exam_profile_id
      and c.signal_type = p_signal_type
      and c.condition_key = p_condition_key
    order by c.observed_at desc,c.id desc
    limit 1;
    v_rearm_identity := coalesce(v_rearm_identity,'initial');
  end if;

  v_identity := md5(concat_ws(chr(31),
    p_user_id::text,p_exam_profile_id::text,p_signal_type,p_attention_category,
    p_fingerprint,p_condition_key,p_materiality_policy_version,p_calendar_date::text,p_surface_session_id,
    coalesce(p_template_version,''),v_rearm_identity
  ));
  perform pg_advisory_xact_lock(hashtextextended(v_identity,79));

  select * into v_existing
  from public.ai_coach_proactive_presentations
  where user_id = p_user_id
    and exam_profile_id = p_exam_profile_id
    and presentation_identity = v_identity;
  if found then
    return jsonb_build_object('presentationId',v_existing.id,'idempotent',true,'presentedAt',v_existing.presented_at);
  end if;

  insert into public.ai_coach_proactive_presentations(
    user_id,exam_profile_id,signal_type,attention_category,fingerprint,condition_key,
    materiality_policy_version,calendar_date,surface_session_id,template_version,presentation_identity
  ) values(
    p_user_id,p_exam_profile_id,p_signal_type,p_attention_category,p_fingerprint,p_condition_key,
    p_materiality_policy_version,p_calendar_date,p_surface_session_id,p_template_version,v_identity
  ) returning * into v_inserted;

  return jsonb_build_object('presentationId',v_inserted.id,'idempotent',false,'presentedAt',v_inserted.presented_at);
end;
$$;

create or replace function public.dismiss_ai_coach_proactive_fingerprint_v1(
  p_exam_profile_id uuid,
  p_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.ai_coach_proactive_user_controls;
  v_inserted boolean := false;
begin
  if v_user_id is null then raise exception 'UNAUTHENTICATED'; end if;
  if nullif(btrim(p_fingerprint),'') is null or length(p_fingerprint) > 4096 then
    raise exception 'AI_COACH_PROACTIVE_FINGERPRINT_INVALID';
  end if;
  if not exists(
    select 1 from public.exam_profiles p
    where p.id = p_exam_profile_id and p.user_id = v_user_id
  ) then raise exception 'AI_COACH_PROACTIVE_PROFILE_NOT_OWNED'; end if;

  insert into public.ai_coach_proactive_user_controls(
    user_id,exam_profile_id,control_kind,fingerprint
  ) values(v_user_id,p_exam_profile_id,'dismiss_fingerprint',p_fingerprint)
  on conflict(user_id,exam_profile_id,control_kind,scope_key) do nothing
  returning * into v_row;
  v_inserted := found;
  if not v_inserted then
    select * into v_row from public.ai_coach_proactive_user_controls
    where user_id = v_user_id and exam_profile_id = p_exam_profile_id
      and control_kind = 'dismiss_fingerprint' and scope_key = p_fingerprint;
  end if;
  return jsonb_build_object('controlId',v_row.id,'idempotent',not v_inserted);
end;
$$;

create or replace function public.snooze_ai_coach_proactive_category_v1(
  p_exam_profile_id uuid,
  p_attention_category text,
  p_snoozed_until timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.ai_coach_proactive_user_controls;
begin
  if v_user_id is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_attention_category not in ('progress','consistency','capacity','material','planner','data_quality') then
    raise exception 'AI_COACH_PROACTIVE_CATEGORY_INVALID';
  end if;
  if p_snoozed_until is null or p_snoozed_until <= clock_timestamp() then
    raise exception 'AI_COACH_PROACTIVE_SNOOZE_EXPIRY_INVALID';
  end if;
  if not exists(
    select 1 from public.exam_profiles p
    where p.id = p_exam_profile_id and p.user_id = v_user_id
  ) then raise exception 'AI_COACH_PROACTIVE_PROFILE_NOT_OWNED'; end if;

  insert into public.ai_coach_proactive_user_controls(
    user_id,exam_profile_id,control_kind,attention_category,snoozed_until
  ) values(v_user_id,p_exam_profile_id,'snooze_category',p_attention_category,p_snoozed_until)
  on conflict(user_id,exam_profile_id,control_kind,scope_key) do update
    set snoozed_until = excluded.snoozed_until
  returning * into v_row;
  return jsonb_build_object('controlId',v_row.id,'snoozedUntil',v_row.snoozed_until);
end;
$$;

create or replace function public.set_ai_coach_proactive_category_disabled_v1(
  p_exam_profile_id uuid,
  p_attention_category text,
  p_disabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.ai_coach_proactive_user_controls;
begin
  if v_user_id is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_attention_category not in ('progress','consistency','capacity','material','planner','data_quality') then
    raise exception 'AI_COACH_PROACTIVE_CATEGORY_INVALID';
  end if;
  if p_disabled is null then raise exception 'AI_COACH_PROACTIVE_DISABLED_INVALID'; end if;
  if not exists(
    select 1 from public.exam_profiles p
    where p.id = p_exam_profile_id and p.user_id = v_user_id
  ) then raise exception 'AI_COACH_PROACTIVE_PROFILE_NOT_OWNED'; end if;

  insert into public.ai_coach_proactive_user_controls(
    user_id,exam_profile_id,control_kind,attention_category,disabled
  ) values(v_user_id,p_exam_profile_id,'disable_category',p_attention_category,p_disabled)
  on conflict(user_id,exam_profile_id,control_kind,scope_key) do update
    set disabled = excluded.disabled
  returning * into v_row;
  return jsonb_build_object('controlId',v_row.id,'disabled',v_row.disabled);
end;
$$;

create or replace function public.record_ai_coach_proactive_clear_observation_v1(
  p_user_id uuid,
  p_exam_profile_id uuid,
  p_signal_type text,
  p_condition_key text,
  p_observed_at timestamptz,
  p_reason_code text,
  p_source_identity text,
  p_source_fact_paths text[]
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_identity text;
  v_existing public.ai_coach_proactive_clear_observations;
  v_inserted public.ai_coach_proactive_clear_observations;
begin
  if current_user not in ('service_role','postgres') then raise exception 'FORBIDDEN'; end if;
  if p_source_fact_paths is null
    or cardinality(p_source_fact_paths) not between 1 and 16
    or exists(select 1 from unnest(p_source_fact_paths) path where nullif(btrim(path),'') is null)
  then raise exception 'AI_COACH_PROACTIVE_SOURCE_FACT_PATHS_INVALID'; end if;
  if not exists(
    select 1 from public.exam_profiles p
    where p.id = p_exam_profile_id and p.user_id = p_user_id
  ) then raise exception 'AI_COACH_PROACTIVE_PROFILE_NOT_OWNED'; end if;

  v_identity := md5(concat_ws(chr(31),
    p_user_id::text,p_exam_profile_id::text,p_signal_type,p_condition_key,
    p_observed_at::text,p_reason_code,p_source_identity,array_to_string(p_source_fact_paths,chr(30))
  ));
  perform pg_advisory_xact_lock(hashtextextended(v_identity,83));
  select * into v_existing
  from public.ai_coach_proactive_clear_observations
  where user_id = p_user_id
    and exam_profile_id = p_exam_profile_id
    and observation_identity = v_identity;
  if found then
    return jsonb_build_object('observationId',v_existing.id,'idempotent',true,'observedAt',v_existing.observed_at);
  end if;

  insert into public.ai_coach_proactive_clear_observations(
    user_id,exam_profile_id,signal_type,condition_key,observed_at,reason_code,
    source_identity,source_fact_paths,observation_identity
  ) values(
    p_user_id,p_exam_profile_id,p_signal_type,p_condition_key,p_observed_at,p_reason_code,
    p_source_identity,p_source_fact_paths,v_identity
  ) returning * into v_inserted;
  return jsonb_build_object('observationId',v_inserted.id,'idempotent',false,'observedAt',v_inserted.observed_at);
end;
$$;

revoke all on function public.reject_ai_coach_proactive_immutable_mutation_v1() from public,anon,authenticated,service_role;
revoke all on function public.record_ai_coach_proactive_presentation_v1(uuid,uuid,text,text,text,text,text,date,text,text) from public,anon,authenticated;
revoke all on function public.record_ai_coach_proactive_clear_observation_v1(uuid,uuid,text,text,timestamptz,text,text,text[]) from public,anon,authenticated;
grant execute on function public.record_ai_coach_proactive_presentation_v1(uuid,uuid,text,text,text,text,text,date,text,text) to service_role;
grant execute on function public.record_ai_coach_proactive_clear_observation_v1(uuid,uuid,text,text,timestamptz,text,text,text[]) to service_role;

revoke all on function public.dismiss_ai_coach_proactive_fingerprint_v1(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.snooze_ai_coach_proactive_category_v1(uuid,text,timestamptz) from public,anon,authenticated,service_role;
revoke all on function public.set_ai_coach_proactive_category_disabled_v1(uuid,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.dismiss_ai_coach_proactive_fingerprint_v1(uuid,text) to authenticated;
grant execute on function public.snooze_ai_coach_proactive_category_v1(uuid,text,timestamptz) to authenticated;
grant execute on function public.set_ai_coach_proactive_category_disabled_v1(uuid,text,boolean) to authenticated;

comment on table public.ai_coach_proactive_presentations is
  'Immutable server-recorded in-app proactive insight presentations. A row is not confirmation, agreement, planning, or condition resolution.';
comment on table public.ai_coach_proactive_user_controls is
  'Profile-scoped dismiss, category snooze, and category disable state mutated only by narrow authenticated RPCs.';
comment on table public.ai_coach_proactive_clear_observations is
  'Immutable server-owned canonical clear observations for persistent proactive hysteresis. Stores no raw conversation or generated prose.';

commit;
