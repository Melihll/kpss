begin;

-- PLN-002 keeps modality on study_sessions.session_mode and stores accounting
-- intent in a normalized ledger. Existing sessions deliberately receive no
-- invented allocation; their interpretation remains historical_unknown.

create unique index study_sessions_id_user_profile_unique
on public.study_sessions(id,user_id,exam_profile_id);

create table public.study_session_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_profile_id uuid not null,
  session_id uuid not null,
  accounting_intent text not null,
  target_task_id uuid null,
  subject_id uuid null references public.subjects(id),
  curriculum_node_id uuid null,
  resource_id uuid null,
  resource_unit_id uuid null,
  actual_minutes integer not null,
  planned_credit_minutes integer not null default 0,
  intent_source text not null,
  substitution_id uuid null,
  idempotency_key text not null,
  supersedes_allocation_id uuid null,
  superseded_at timestamptz null,
  reason text null,
  recorded_by text not null,
  recorded_at timestamptz not null default now(),
  constraint study_session_allocations_session_owner_fk
    foreign key(session_id,user_id,exam_profile_id)
    references public.study_sessions(id,user_id,exam_profile_id) on delete cascade,
  constraint study_session_allocations_target_task_owner_fk
    foreign key(target_task_id,user_id,exam_profile_id)
    references public.tasks(id,user_id,exam_profile_id),
  constraint study_session_allocations_supersedes_owner_fk
    foreign key(supersedes_allocation_id,user_id)
    references public.study_session_allocations(id,user_id),
  constraint study_session_allocations_intent_valid
    check(accounting_intent in ('planned','extra','unknown')),
  constraint study_session_allocations_source_valid
    check(intent_source in ('inferred_task_start','user_selected','confirmed_action','historical_unknown')),
  constraint study_session_allocations_minutes_valid
    check(actual_minutes > 0 and planned_credit_minutes >= 0 and planned_credit_minutes <= actual_minutes),
  constraint study_session_allocations_semantics_valid check(
    (accounting_intent='planned' and target_task_id is not null)
    or (accounting_intent in ('extra','unknown') and target_task_id is null and planned_credit_minutes=0)
  ),
  constraint study_session_allocations_idempotency_not_blank check(btrim(idempotency_key) <> ''),
  constraint study_session_allocations_recorded_by_not_blank check(btrim(recorded_by) <> ''),
  unique(id,user_id),
  unique(user_id,idempotency_key),
  unique(supersedes_allocation_id)
);

create index study_session_allocations_session_current_idx
on public.study_session_allocations(session_id,recorded_at desc)
where superseded_at is null;
create index study_session_allocations_user_intent_time_idx
on public.study_session_allocations(user_id,accounting_intent,recorded_at desc)
where superseded_at is null;
create index study_session_allocations_target_task_idx
on public.study_session_allocations(target_task_id)
where target_task_id is not null and superseded_at is null;

alter table public.study_session_allocations enable row level security;
revoke all on public.study_session_allocations from public,anon,authenticated;
grant select on public.study_session_allocations to authenticated;
create policy study_session_allocations_select_own
on public.study_session_allocations for select to authenticated
using(auth.uid() = user_id);

create table public.study_substitutions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_profile_id uuid not null,
  weekly_plan_id uuid not null,
  proposal_id uuid not null references public.confirmed_action_proposals(id) on delete cascade,
  source_task_id uuid not null,
  replacement_session_id uuid not null,
  replacement_task_id uuid null,
  source_minutes_replaced integer not null,
  replacement_actual_minutes integer not null,
  status text not null default 'proposed',
  reason text not null,
  initiated_by text not null,
  confirmed_by text null,
  plan_generation_version integer not null,
  snapshot_fingerprint text not null,
  idempotency_key text not null,
  proposed_at timestamptz not null default now(),
  confirmed_at timestamptz null,
  applied_at timestamptz null,
  constraint study_substitutions_profile_owner_fk
    foreign key(exam_profile_id,user_id)
    references public.exam_profiles(id,user_id) on delete cascade,
  constraint study_substitutions_plan_owner_fk
    foreign key(weekly_plan_id,user_id,exam_profile_id)
    references public.weekly_plans(id,user_id,exam_profile_id) on delete cascade,
  constraint study_substitutions_source_owner_fk
    foreign key(source_task_id,user_id,exam_profile_id)
    references public.tasks(id,user_id,exam_profile_id),
  constraint study_substitutions_replacement_session_owner_fk
    foreign key(replacement_session_id,user_id,exam_profile_id)
    references public.study_sessions(id,user_id,exam_profile_id),
  constraint study_substitutions_replacement_task_owner_fk
    foreign key(replacement_task_id,user_id,exam_profile_id)
    references public.tasks(id,user_id,exam_profile_id),
  constraint study_substitutions_status_valid check(status in ('proposed','applied','rejected','expired')),
  constraint study_substitutions_minutes_valid check(source_minutes_replaced > 0 and replacement_actual_minutes >= source_minutes_replaced),
  constraint study_substitutions_reason_not_blank check(btrim(reason) <> ''),
  constraint study_substitutions_initiator_valid check(initiated_by in ('user','approved_policy')),
  constraint study_substitutions_applied_state_valid check(
    (status='applied' and confirmed_at is not null and applied_at is not null and replacement_task_id is not null)
    or (status<>'applied' and applied_at is null)
  ),
  unique(proposal_id),
  unique(user_id,idempotency_key)
);

alter table public.study_session_allocations
add constraint study_session_allocations_substitution_fk
foreign key(substitution_id) references public.study_substitutions(id);

create index study_substitutions_user_created_idx
on public.study_substitutions(user_id,proposed_at desc);
create index study_substitutions_source_task_idx
on public.study_substitutions(source_task_id,proposed_at desc);

alter table public.study_substitutions enable row level security;
revoke all on public.study_substitutions from public,anon,authenticated;
grant select on public.study_substitutions to authenticated;
create policy study_substitutions_select_own
on public.study_substitutions for select to authenticated
using(auth.uid() = user_id);

create table public.task_carryovers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_profile_id uuid not null,
  weekly_plan_id uuid not null,
  proposal_id uuid not null references public.confirmed_action_proposals(id) on delete cascade,
  source_task_id uuid not null,
  successor_task_id uuid null,
  from_date date not null,
  to_date date not null,
  remaining_minutes integer not null,
  status text not null default 'proposed',
  reason text not null,
  initiated_by text not null,
  confirmed_by text null,
  plan_generation_version integer not null,
  snapshot_fingerprint text not null,
  idempotency_key text not null,
  proposed_at timestamptz not null default now(),
  confirmed_at timestamptz null,
  applied_at timestamptz null,
  constraint task_carryovers_profile_owner_fk
    foreign key(exam_profile_id,user_id)
    references public.exam_profiles(id,user_id) on delete cascade,
  constraint task_carryovers_plan_owner_fk
    foreign key(weekly_plan_id,user_id,exam_profile_id)
    references public.weekly_plans(id,user_id,exam_profile_id) on delete cascade,
  constraint task_carryovers_source_owner_fk
    foreign key(source_task_id,user_id,exam_profile_id)
    references public.tasks(id,user_id,exam_profile_id),
  constraint task_carryovers_successor_owner_fk
    foreign key(successor_task_id,user_id,exam_profile_id)
    references public.tasks(id,user_id,exam_profile_id),
  constraint task_carryovers_dates_valid check(to_date > from_date),
  constraint task_carryovers_minutes_valid check(remaining_minutes > 0),
  constraint task_carryovers_status_valid check(status in ('proposed','applied','rejected','expired')),
  constraint task_carryovers_reason_not_blank check(btrim(reason) <> ''),
  constraint task_carryovers_initiator_valid check(initiated_by in ('user','approved_policy')),
  constraint task_carryovers_applied_state_valid check(
    (status='applied' and confirmed_at is not null and applied_at is not null)
    or (status<>'applied' and applied_at is null)
  ),
  unique(proposal_id),
  unique(user_id,idempotency_key)
);

create index task_carryovers_user_created_idx
on public.task_carryovers(user_id,proposed_at desc);
create index task_carryovers_source_task_idx
on public.task_carryovers(source_task_id,proposed_at desc);

alter table public.task_carryovers enable row level security;
revoke all on public.task_carryovers from public,anon,authenticated;
grant select on public.task_carryovers to authenticated;
create policy task_carryovers_select_own
on public.task_carryovers for select to authenticated
using(auth.uid() = user_id);

create or replace function public.account_completed_study_session(
  p_session_id uuid,
  p_accounting_intent text,
  p_intent_source text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_session public.study_sessions;
  v_task public.tasks;
  v_allocation public.study_session_allocations;
  v_existing public.study_session_allocations;
  v_current_minutes integer := 0;
  v_remaining_minutes integer := 0;
  v_actual_minutes integer;
  v_credit_minutes integer := 0;
  v_target_task_id uuid := null;
begin
  if v_user is null then raise exception 'UNAUTHORIZED'; end if;
  if nullif(btrim(p_idempotency_key),'') is null then raise exception 'STUDY_INTENT_IDEMPOTENCY_REQUIRED'; end if;
  if p_accounting_intent not in ('planned','extra','unknown') then raise exception 'STUDY_INTENT_REQUIRED'; end if;
  if p_intent_source not in ('inferred_task_start','user_selected','confirmed_action','historical_unknown') then
    raise exception 'STUDY_INTENT_SOURCE_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text,52));

  select * into v_existing
  from public.study_session_allocations
  where user_id=v_user and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.session_id <> p_session_id then raise exception 'STUDY_INTENT_IDEMPOTENCY_CONFLICT'; end if;
    select * into v_session from public.study_sessions where id=p_session_id and user_id=v_user;
    return to_jsonb(v_session) || jsonb_build_object('allocation',to_jsonb(v_existing),'idempotent',true);
  end if;

  select * into v_session
  from public.study_sessions
  where id=p_session_id and user_id=v_user
  for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if v_session.status <> 'completed' or v_session.duration_minutes is null then raise exception 'SESSION_NOT_COMPLETED'; end if;

  select * into v_existing
  from public.study_session_allocations
  where session_id=v_session.id and user_id=v_user and superseded_at is null
  order by recorded_at desc limit 1;
  if found then
    return to_jsonb(v_session) || jsonb_build_object('allocation',to_jsonb(v_existing),'idempotent',true);
  end if;

  v_actual_minutes := v_session.duration_minutes;
  if p_accounting_intent='planned' then
    if v_session.task_id is null then raise exception 'STUDY_INTENT_TARGET_REQUIRED'; end if;
    select * into v_task
    from public.tasks
    where id=v_session.task_id and user_id=v_user and exam_profile_id=v_session.exam_profile_id
    for update;
    if not found then raise exception 'TASK_NOT_FOUND'; end if;
    select coalesce(completed_minutes,0) into v_current_minutes
    from public.task_progress
    where task_id=v_task.id and user_id=v_user
    for update;
    v_current_minutes := coalesce(v_current_minutes,0);
    v_remaining_minutes := greatest(0,v_task.estimated_minutes-v_current_minutes);
    v_credit_minutes := least(v_actual_minutes,v_remaining_minutes);
    v_target_task_id := v_task.id;
  elsif p_accounting_intent='extra' then
    v_credit_minutes := 0;
  else
    if p_intent_source <> 'historical_unknown' then raise exception 'STUDY_INTENT_UNKNOWN_NEW_RECORD'; end if;
    v_credit_minutes := 0;
  end if;

  insert into public.study_session_allocations(
    user_id,exam_profile_id,session_id,accounting_intent,target_task_id,
    subject_id,curriculum_node_id,resource_id,resource_unit_id,
    actual_minutes,planned_credit_minutes,intent_source,idempotency_key,
    reason,recorded_by
  ) values(
    v_user,v_session.exam_profile_id,v_session.id,p_accounting_intent,v_target_task_id,
    v_session.subject_id,v_session.curriculum_node_id,v_session.resource_id,v_session.resource_unit_id,
    v_actual_minutes,v_credit_minutes,p_intent_source,p_idempotency_key,
    case when p_accounting_intent='extra' then 'voluntary_extra' else 'session_accounting' end,
    v_user::text
  ) returning * into v_allocation;

  if v_session.task_id is not null then
    insert into public.task_progress(task_id,user_id,completed_minutes,actual_study_minutes)
    values(v_session.task_id,v_user,v_credit_minutes,v_actual_minutes)
    on conflict(task_id) do update set
      completed_minutes=least(
        (select estimated_minutes from public.tasks where id=v_session.task_id),
        public.task_progress.completed_minutes+v_credit_minutes
      ),
      actual_study_minutes=public.task_progress.actual_study_minutes+v_actual_minutes;
    if p_accounting_intent='planned' then
      select completed_minutes into v_current_minutes
      from public.task_progress where task_id=v_session.task_id;
      perform public.update_task_progress(v_session.task_id,v_current_minutes);
    end if;
  end if;

  if v_session.curriculum_node_id is not null then
    update public.topic_progress
    set total_study_minutes=total_study_minutes+v_actual_minutes
    where user_id=v_user
      and exam_profile_id=v_session.exam_profile_id
      and curriculum_node_id=v_session.curriculum_node_id;
  end if;

  return to_jsonb(v_session) || jsonb_build_object('allocation',to_jsonb(v_allocation),'idempotent',false);
end;
$$;

revoke all on function public.account_completed_study_session(uuid,text,text,text) from public,anon;
grant execute on function public.account_completed_study_session(uuid,text,text,text) to authenticated;

create or replace function public.start_study_session(p_task_id uuid,p_entry_source text default 'web')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare t public.tasks; s public.study_sessions;
begin
  if exists(select 1 from public.study_sessions where user_id=auth.uid() and status='active') then raise exception 'ACTIVE_SESSION_EXISTS'; end if;
  select * into t from public.tasks where id=p_task_id and user_id=auth.uid();
  if not found then raise exception 'TASK_NOT_FOUND'; end if;
  perform public.start_task(p_task_id);
  insert into public.study_sessions(user_id,exam_profile_id,task_id,subject_id,curriculum_node_id,resource_id,session_type,started_at,status,entry_source)
  values(auth.uid(),t.exam_profile_id,t.id,t.subject_id,t.curriculum_node_id,t.resource_id,'task',now(),'active',p_entry_source)
  returning * into s;
  return to_jsonb(s) || jsonb_build_object('accountingIntent','planned','intentSource','inferred_task_start');
end $$;

create or replace function public.finish_study_session(p_session_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  s public.study_sessions;
  mins integer;
  break_seconds numeric := 0;
  finished_at timestamptz := now();
begin
  select * into s from public.study_sessions where id=p_session_id and user_id=auth.uid() for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if s.status='completed' then
    return public.account_completed_study_session(s.id,'planned','inferred_task_start','session:'||s.id::text||':primary');
  end if;
  if s.status<>'active' then raise exception 'SESSION_NOT_ACTIVE'; end if;
  update public.study_session_breaks set ended_at=finished_at
  where session_id=s.id and user_id=auth.uid() and ended_at is null;
  select coalesce(sum(extract(epoch from (ended_at-started_at))),0) into break_seconds
  from public.study_session_breaks where session_id=s.id and user_id=auth.uid() and ended_at is not null;
  mins:=greatest(1,floor(greatest(0,extract(epoch from (finished_at-s.started_at))-break_seconds)/60)::integer);
  update public.study_sessions set ended_at=finished_at,duration_minutes=mins,status='completed',accounted_at=finished_at
  where id=s.id returning * into s;
  return public.account_completed_study_session(s.id,'planned','inferred_task_start','session:'||s.id::text||':primary');
end $$;

create or replace function public.record_retroactive_session(p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_user uuid:=auth.uid();
  profile_id uuid:=(p_payload->>'examProfileId')::uuid;
  task_id uuid:=nullif(p_payload->>'taskId','')::uuid;
  mins integer:=(p_payload->>'durationMinutes')::integer;
  end_time timestamptz:=coalesce((p_payload->>'endedAt')::timestamptz,now());
  start_time timestamptz;
  v_accounting_intent text:=nullif(p_payload->>'accountingIntent','');
  v_idempotency_key text:=nullif(p_payload->>'idempotencyKey','');
  s public.study_sessions;
  t public.tasks;
  existing_allocation public.study_session_allocations;
  existing_session public.study_sessions;
  v_subject_id uuid:=nullif(p_payload->>'subjectId','')::uuid;
  v_curriculum_node_id uuid:=nullif(p_payload->>'curriculumNodeId','')::uuid;
  v_resource_id uuid:=nullif(p_payload->>'resourceId','')::uuid;
  v_resource_unit_id uuid:=nullif(p_payload->>'resourceUnitId','')::uuid;
begin
  if v_user is null then raise exception 'UNAUTHORIZED'; end if;
  if mins is null or mins<=0 then raise exception 'INVALID_SESSION_DURATION'; end if;
  if v_idempotency_key is null then raise exception 'STUDY_INTENT_IDEMPOTENCY_REQUIRED'; end if;

  select * into existing_allocation from public.study_session_allocations
  where user_id=v_user and idempotency_key=v_idempotency_key;
  if found then
    select * into existing_session from public.study_sessions where id=existing_allocation.session_id and user_id=v_user;
    return to_jsonb(existing_session)||jsonb_build_object('allocation',to_jsonb(existing_allocation),'idempotent',true);
  end if;

  perform 1 from public.exam_profiles where id=profile_id and user_id=v_user;
  if not found then raise exception 'NO_ACTIVE_EXAM_PROFILE'; end if;
  if task_id is not null then
    select * into t from public.tasks where id=task_id and user_id=v_user and exam_profile_id=profile_id;
    if not found then raise exception 'TASK_NOT_FOUND'; end if;
    v_subject_id:=t.subject_id;
    v_curriculum_node_id:=t.curriculum_node_id;
    v_resource_id:=t.resource_id;
    if v_accounting_intent is null then v_accounting_intent:='planned'; end if;
  elsif v_accounting_intent is null then
    raise exception 'STUDY_INTENT_REQUIRED';
  end if;
  if v_accounting_intent not in ('planned','extra') then raise exception 'STUDY_INTENT_REQUIRED'; end if;
  if v_accounting_intent='planned' and task_id is null then raise exception 'STUDY_INTENT_TARGET_REQUIRED'; end if;

  start_time:=end_time-(mins||' minutes')::interval;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text,0));
  if exists(
    select 1 from public.study_sessions existing
    where existing.user_id=v_user and existing.status in ('active','completed')
      and existing.started_at < end_time
      and coalesce(existing.ended_at,'infinity'::timestamptz) > start_time
  ) then raise exception 'SESSION_TIME_OVERLAP'; end if;

  insert into public.study_sessions(
    user_id,exam_profile_id,task_id,subject_id,curriculum_node_id,resource_id,resource_unit_id,
    session_type,started_at,ended_at,duration_minutes,status,entry_source,note,accounted_at
  ) values(
    v_user,profile_id,task_id,v_subject_id,v_curriculum_node_id,v_resource_id,v_resource_unit_id,
    case when task_id is not null then 'task' else 'custom' end,
    start_time,end_time,mins,'completed',coalesce(p_payload->>'entrySource','retroactive'),p_payload->>'note',now()
  ) returning * into s;

  return public.account_completed_study_session(
    s.id,v_accounting_intent,
    case when task_id is not null and nullif(p_payload->>'accountingIntent','') is null
      then 'inferred_task_start' else 'user_selected' end,
    v_idempotency_key
  );
end $$;

create or replace function public.telegram_record_retroactive_session(p_user_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform set_config('request.jwt.claim.sub',p_user_id::text,true);
  return public.record_retroactive_session(p_payload||jsonb_build_object('entrySource','telegram'));
end $$;

revoke all on function public.telegram_record_retroactive_session(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.telegram_record_retroactive_session(uuid,jsonb) to service_role;

alter table public.confirmed_action_proposals
drop constraint confirmed_action_proposals_kind_valid;
alter table public.confirmed_action_proposals
add constraint confirmed_action_proposals_kind_valid
check(action_kind in ('quick_task','capacity_change','substitution','carryover'));

alter function public.create_confirmed_action_proposal(uuid,uuid,uuid,text,integer,jsonb,jsonb,text)
rename to create_confirmed_action_proposal_pre_pln002;
alter function public.apply_confirmed_action_proposal(uuid)
rename to apply_confirmed_action_proposal_pre_pln002;

revoke all on function public.create_confirmed_action_proposal_pre_pln002(uuid,uuid,uuid,text,integer,jsonb,jsonb,text)
from public,anon,authenticated,service_role;
revoke all on function public.apply_confirmed_action_proposal_pre_pln002(uuid)
from public,anon,authenticated;

create function public.create_confirmed_action_proposal(
  p_user_id uuid,
  p_exam_profile_id uuid,
  p_weekly_plan_id uuid,
  p_action_kind text,
  p_plan_generation_version integer,
  p_mutation_payload jsonb,
  p_display_payload jsonb,
  p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_plan public.weekly_plans;
  v_proposal public.confirmed_action_proposals;
  v_task public.tasks;
  v_session public.study_sessions;
  v_allocation public.study_session_allocations;
  v_completed integer:=0;
  v_remaining integer:=0;
  v_minutes integer;
  v_fingerprint text;
begin
  if current_user not in ('service_role','postgres') then raise exception 'FORBIDDEN'; end if;
  if p_action_kind in ('quick_task','capacity_change') then
    return public.create_confirmed_action_proposal_pre_pln002(
      p_user_id,p_exam_profile_id,p_weekly_plan_id,p_action_kind,p_plan_generation_version,
      p_mutation_payload,p_display_payload,p_idempotency_key
    );
  end if;
  if p_action_kind not in ('substitution','carryover') then raise exception 'ACTION_PROPOSAL_INVALID_KIND'; end if;
  if nullif(btrim(p_idempotency_key),'') is null then raise exception 'ACTION_PROPOSAL_INVALID_IDEMPOTENCY_KEY'; end if;

  select * into v_plan from public.weekly_plans
  where id=p_weekly_plan_id and user_id=p_user_id and exam_profile_id=p_exam_profile_id and status='active';
  if not found then raise exception 'WEEKLY_PLAN_NOT_FOUND'; end if;
  if v_plan.generation_version<>p_plan_generation_version then raise exception 'ACTION_PROPOSAL_STALE'; end if;
  v_fingerprint:=public.confirmation_plan_fingerprint(p_user_id,p_weekly_plan_id);

  if p_action_kind='substitution' then
    select * into v_task from public.tasks
    where id=(p_mutation_payload->>'sourceTaskId')::uuid
      and user_id=p_user_id and exam_profile_id=p_exam_profile_id and weekly_plan_id=p_weekly_plan_id
      and status in ('planned','ready','in_progress','partially_completed','rescheduled');
    if not found then raise exception 'SUBSTITUTION_SOURCE_INVALID'; end if;
    select coalesce(completed_minutes,0) into v_completed from public.task_progress
    where task_id=v_task.id and user_id=p_user_id;
    v_remaining:=greatest(0,v_task.estimated_minutes-coalesce(v_completed,0));
    v_minutes:=(p_mutation_payload->>'sourceMinutes')::integer;
    select * into v_session from public.study_sessions
    where id=(p_mutation_payload->>'replacementSessionId')::uuid
      and user_id=p_user_id and exam_profile_id=p_exam_profile_id and status='completed';
    if not found or v_session.subject_id is null or v_session.task_id=v_task.id then raise exception 'SUBSTITUTION_REPLACEMENT_INVALID'; end if;
    select * into v_allocation from public.study_session_allocations
    where session_id=v_session.id and user_id=p_user_id and accounting_intent='extra' and superseded_at is null;
    if not found or v_minutes<=0 or v_minutes>v_remaining or v_minutes>v_allocation.actual_minutes
      or nullif(btrim(p_mutation_payload->>'replacementTitle'),'') is null
    then raise exception 'SUBSTITUTION_REPLACEMENT_INVALID'; end if;
  else
    select * into v_task from public.tasks
    where id=(p_mutation_payload->>'taskId')::uuid
      and user_id=p_user_id and exam_profile_id=p_exam_profile_id and weekly_plan_id=p_weekly_plan_id
      and status in ('planned','ready','in_progress','partially_completed','rescheduled');
    if not found then raise exception 'CARRYOVER_SOURCE_STALE'; end if;
    select coalesce(completed_minutes,0) into v_completed from public.task_progress
    where task_id=v_task.id and user_id=p_user_id;
    v_remaining:=greatest(0,v_task.estimated_minutes-coalesce(v_completed,0));
    if v_task.planned_date<>(p_mutation_payload->>'fromDate')::date
      or (p_mutation_payload->>'toDate')::date<=v_task.planned_date
      or (p_mutation_payload->>'toDate')::date not between v_plan.week_start_date and v_plan.week_end_date
      or (p_mutation_payload->>'remainingMinutes')::integer<>v_remaining
      or v_remaining<=0
    then raise exception 'CARRYOVER_SOURCE_STALE'; end if;
  end if;

  select * into v_proposal from public.confirmed_action_proposals
  where user_id=p_user_id and idempotency_key=p_idempotency_key;
  if found then
    if v_proposal.action_kind<>p_action_kind then raise exception 'ACTION_PROPOSAL_IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('proposalId',v_proposal.id,'actionKind',v_proposal.action_kind,'expiresAt',v_proposal.expires_at,'planGenerationVersion',v_proposal.plan_generation_version,'idempotent',true);
  end if;

  insert into public.confirmed_action_proposals(
    user_id,exam_profile_id,weekly_plan_id,action_kind,status,plan_generation_version,
    snapshot_fingerprint,mutation_payload,display_payload,idempotency_key,expires_at
  ) values(
    p_user_id,p_exam_profile_id,p_weekly_plan_id,p_action_kind,'pending',p_plan_generation_version,
    v_fingerprint,p_mutation_payload,coalesce(p_display_payload,'{}'::jsonb),p_idempotency_key,now()+interval '20 minutes'
  ) returning * into v_proposal;

  if p_action_kind='substitution' then
    insert into public.study_substitutions(
      user_id,exam_profile_id,weekly_plan_id,proposal_id,source_task_id,replacement_session_id,
      source_minutes_replaced,replacement_actual_minutes,status,reason,initiated_by,
      plan_generation_version,snapshot_fingerprint,idempotency_key
    ) values(
      p_user_id,p_exam_profile_id,p_weekly_plan_id,v_proposal.id,v_task.id,v_session.id,
      v_minutes,v_allocation.actual_minutes,'proposed',coalesce(nullif(p_mutation_payload->>'reason',''),'user_replacement'),
      coalesce(nullif(p_mutation_payload->>'initiatedBy',''),'user'),p_plan_generation_version,v_fingerprint,p_idempotency_key
    );
  else
    insert into public.task_carryovers(
      user_id,exam_profile_id,weekly_plan_id,proposal_id,source_task_id,from_date,to_date,
      remaining_minutes,status,reason,initiated_by,plan_generation_version,snapshot_fingerprint,idempotency_key
    ) values(
      p_user_id,p_exam_profile_id,p_weekly_plan_id,v_proposal.id,v_task.id,
      (p_mutation_payload->>'fromDate')::date,(p_mutation_payload->>'toDate')::date,v_remaining,
      'proposed',coalesce(nullif(p_mutation_payload->>'reason',''),'user_could_not_finish'),
      coalesce(nullif(p_mutation_payload->>'initiatedBy',''),'user'),p_plan_generation_version,v_fingerprint,p_idempotency_key
    );
  end if;

  return jsonb_build_object('proposalId',v_proposal.id,'actionKind',v_proposal.action_kind,'expiresAt',v_proposal.expires_at,'planGenerationVersion',v_proposal.plan_generation_version);
end $$;

revoke all on function public.create_confirmed_action_proposal(uuid,uuid,uuid,text,integer,jsonb,jsonb,text)
from public,anon,authenticated;
grant execute on function public.create_confirmed_action_proposal(uuid,uuid,uuid,text,integer,jsonb,jsonb,text)
to service_role;

create function public.apply_confirmed_action_proposal(p_proposal_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_user uuid:=auth.uid();
  v_proposal public.confirmed_action_proposals;
  v_plan public.weekly_plans;
  v_substitution public.study_substitutions;
  v_carryover public.task_carryovers;
  v_source public.tasks;
  v_replacement public.tasks;
  v_session public.study_sessions;
  v_old_allocation public.study_session_allocations;
  v_new_allocation public.study_session_allocations;
  v_completed integer:=0;
  v_remaining integer:=0;
  v_source_after integer:=0;
  v_result jsonb;
begin
  if v_user is null then raise exception 'UNAUTHORIZED'; end if;
  select * into v_proposal from public.confirmed_action_proposals
  where id=p_proposal_id and user_id=v_user for update;
  if not found then raise exception 'ACTION_PROPOSAL_NOT_FOUND'; end if;
  if v_proposal.action_kind in ('quick_task','capacity_change') then
    return public.apply_confirmed_action_proposal_pre_pln002(p_proposal_id);
  end if;
  if v_proposal.status='applied' then
    return coalesce(v_proposal.result_payload,'{}'::jsonb)||jsonb_build_object('idempotent',true,'proposalId',v_proposal.id);
  end if;
  if v_proposal.status<>'pending' then raise exception 'ACTION_PROPOSAL_NOT_PENDING'; end if;
  if v_proposal.expires_at<=now() then raise exception 'ACTION_PROPOSAL_EXPIRED'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text,41));
  select * into v_plan from public.weekly_plans
  where id=v_proposal.weekly_plan_id and user_id=v_user and exam_profile_id=v_proposal.exam_profile_id and status='active'
  for update;
  if not found then raise exception 'WEEKLY_PLAN_NOT_FOUND'; end if;
  if v_plan.generation_version<>v_proposal.plan_generation_version then raise exception 'ACTION_PROPOSAL_STALE'; end if;
  if public.confirmation_plan_fingerprint(v_user,v_plan.id)<>v_proposal.snapshot_fingerprint then raise exception 'ACTION_PROPOSAL_STALE'; end if;

  if v_proposal.action_kind='substitution' then
    select * into v_substitution from public.study_substitutions
    where proposal_id=v_proposal.id and user_id=v_user for update;
    if not found or v_substitution.status<>'proposed' then raise exception 'SUBSTITUTION_SOURCE_INVALID'; end if;
    select * into v_source from public.tasks
    where id=v_substitution.source_task_id and user_id=v_user and weekly_plan_id=v_plan.id for update;
    if not found then raise exception 'SUBSTITUTION_SOURCE_INVALID'; end if;
    select coalesce(completed_minutes,0) into v_completed from public.task_progress
    where task_id=v_source.id and user_id=v_user for update;
    v_completed:=coalesce(v_completed,0);
    v_remaining:=greatest(0,v_source.estimated_minutes-v_completed);
    select * into v_session from public.study_sessions
    where id=v_substitution.replacement_session_id and user_id=v_user and status='completed' for update;
    select * into v_old_allocation from public.study_session_allocations
    where session_id=v_session.id and user_id=v_user and accounting_intent='extra' and superseded_at is null for update;
    if not found or v_substitution.source_minutes_replaced>v_remaining
      or v_substitution.source_minutes_replaced>v_old_allocation.actual_minutes
    then raise exception 'SUBSTITUTION_REPLACEMENT_INVALID'; end if;

    insert into public.tasks(
      user_id,exam_profile_id,weekly_plan_id,subject_id,curriculum_node_id,resource_id,
      task_type,title,planned_date,estimated_minutes,importance,priority_score,status,source_reason,dedupe_key,completed_at
    ) values(
      v_user,v_plan.exam_profile_id,v_plan.id,v_session.subject_id,v_session.curriculum_node_id,v_session.resource_id,
      'custom',v_proposal.mutation_payload->>'replacementTitle',v_source.planned_date,
      v_substitution.source_minutes_replaced,v_source.importance,v_source.priority_score,'completed','manual',
      'substitution:'||v_substitution.id::text,now()
    ) returning * into v_replacement;
    insert into public.task_progress(task_id,user_id,completed_minutes,actual_study_minutes)
    values(v_replacement.id,v_user,v_substitution.source_minutes_replaced,v_old_allocation.actual_minutes);

    update public.study_session_allocations set superseded_at=now()
    where id=v_old_allocation.id;
    insert into public.study_session_allocations(
      user_id,exam_profile_id,session_id,accounting_intent,target_task_id,subject_id,curriculum_node_id,
      resource_id,resource_unit_id,actual_minutes,planned_credit_minutes,intent_source,substitution_id,
      idempotency_key,supersedes_allocation_id,reason,recorded_by
    ) values(
      v_user,v_plan.exam_profile_id,v_session.id,'planned',v_replacement.id,v_session.subject_id,v_session.curriculum_node_id,
      v_session.resource_id,v_session.resource_unit_id,v_old_allocation.actual_minutes,v_substitution.source_minutes_replaced,
      'confirmed_action',v_substitution.id,'substitution:'||v_substitution.id::text||':allocation',v_old_allocation.id,
      'confirmed_substitution',v_user::text
    ) returning * into v_new_allocation;

    v_source_after:=v_source.estimated_minutes-v_substitution.source_minutes_replaced;
    if v_source_after>v_completed then
      update public.tasks set estimated_minutes=v_source_after where id=v_source.id;
    elsif v_completed>0 then
      update public.tasks set estimated_minutes=v_completed,status='completed',completed_at=coalesce(completed_at,now()) where id=v_source.id;
    else
      update public.tasks set status='cancelled' where id=v_source.id;
    end if;
    update public.weekly_plans set generation_version=generation_version+1 where id=v_plan.id;
    update public.study_substitutions set
      replacement_task_id=v_replacement.id,status='applied',confirmed_by=v_user::text,
      confirmed_at=now(),applied_at=now()
    where id=v_substitution.id;
    v_result:=jsonb_build_object(
      'proposalId',v_proposal.id,'actionKind','substitution','substitutionId',v_substitution.id,
      'sourceTaskId',v_source.id,'replacementTaskId',v_replacement.id,
      'sourceMinutesRelieved',v_substitution.source_minutes_replaced,
      'replacementAllocation',to_jsonb(v_new_allocation),'weeklyPlanId',v_plan.id,
      'refresh',jsonb_build_array('today','week','progress')
    );
  elsif v_proposal.action_kind='carryover' then
    select * into v_carryover from public.task_carryovers
    where proposal_id=v_proposal.id and user_id=v_user for update;
    if not found or v_carryover.status<>'proposed' then raise exception 'CARRYOVER_SOURCE_STALE'; end if;
    select * into v_source from public.tasks
    where id=v_carryover.source_task_id and user_id=v_user and weekly_plan_id=v_plan.id for update;
    if not found then raise exception 'CARRYOVER_SOURCE_STALE'; end if;
    select coalesce(completed_minutes,0) into v_completed from public.task_progress
    where task_id=v_source.id and user_id=v_user for update;
    v_remaining:=greatest(0,v_source.estimated_minutes-coalesce(v_completed,0));
    if v_source.planned_date<>v_carryover.from_date or v_remaining<>v_carryover.remaining_minutes then
      raise exception 'CARRYOVER_SOURCE_STALE';
    end if;
    update public.tasks set planned_date=v_carryover.to_date,status='rescheduled' where id=v_source.id;
    insert into public.task_reschedule_events(user_id,task_id,from_date,to_date,reason)
    values(v_user,v_source.id,v_carryover.from_date,v_carryover.to_date,'carryover');
    update public.weekly_plans set generation_version=generation_version+1 where id=v_plan.id;
    update public.task_carryovers set status='applied',confirmed_by=v_user::text,confirmed_at=now(),applied_at=now()
    where id=v_carryover.id;
    v_result:=jsonb_build_object(
      'proposalId',v_proposal.id,'actionKind','carryover','carryoverId',v_carryover.id,
      'sourceTaskId',v_source.id,'preservedTaskId',v_source.id,
      'fromDate',v_carryover.from_date,'toDate',v_carryover.to_date,
      'remainingMinutes',v_carryover.remaining_minutes,'weeklyPlanId',v_plan.id,
      'refresh',jsonb_build_array('today','week')
    );
  else
    raise exception 'ACTION_PROPOSAL_INVALID_KIND';
  end if;

  update public.confirmed_action_proposals
  set status='applied',applied_at=now(),result_payload=v_result
  where id=v_proposal.id;
  return v_result;
end $$;

revoke all on function public.apply_confirmed_action_proposal(uuid) from public,anon;
grant execute on function public.apply_confirmed_action_proposal(uuid) to authenticated;

commit;
