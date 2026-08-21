-- R2: explicit preview -> confirm -> apply contracts for product actions.
-- Proposal rows are server-created, short-lived and immutable to clients.

-- The canonical P48 importer intentionally runs with the service role, but its
-- preflight and idempotent section/unit upserts use PostgREST table access
-- before handing the plan write to service_persist_p48_baseline_plan(). Keep
-- that access explicit and limited to the tables the importer reads/writes.
grant select on public.exam_profiles, public.p48_resource_targets, public.resources
  to service_role;
grant select, insert, update on public.resource_sections, public.resource_units
  to service_role;

alter table public.schedule_exceptions
add column confirmation_dedupe_key text null;

create unique index schedule_exceptions_confirmation_dedupe_unique
on public.schedule_exceptions(user_id, confirmation_dedupe_key)
where confirmation_dedupe_key is not null;

create table public.confirmed_action_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_profile_id uuid not null,
  weekly_plan_id uuid not null,
  action_kind text not null,
  status text not null default 'pending',
  plan_generation_version integer not null,
  snapshot_fingerprint text not null,
  mutation_payload jsonb not null,
  display_payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  result_payload jsonb null,
  expires_at timestamptz not null,
  applied_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint confirmed_action_proposals_profile_owner_fk
    foreign key(exam_profile_id,user_id)
    references public.exam_profiles(id,user_id) on delete cascade,
  constraint confirmed_action_proposals_plan_owner_fk
    foreign key(weekly_plan_id,user_id,exam_profile_id)
    references public.weekly_plans(id,user_id,exam_profile_id) on delete cascade,
  constraint confirmed_action_proposals_kind_valid
    check(action_kind in ('quick_task','capacity_change')),
  constraint confirmed_action_proposals_status_valid
    check(status in ('pending','applied','cancelled','expired')),
  constraint confirmed_action_proposals_generation_valid
    check(plan_generation_version > 0),
  constraint confirmed_action_proposals_fingerprint_not_blank
    check(btrim(snapshot_fingerprint) <> ''),
  constraint confirmed_action_proposals_idempotency_not_blank
    check(btrim(idempotency_key) <> ''),
  constraint confirmed_action_proposals_expiry_valid
    check(expires_at > created_at),
  constraint confirmed_action_proposals_applied_state_valid
    check((status = 'applied') = (applied_at is not null)),
  unique(user_id,idempotency_key)
);

create index confirmed_action_proposals_user_created_idx
on public.confirmed_action_proposals(user_id,created_at desc);

create trigger confirmed_action_proposals_set_updated_at
before update on public.confirmed_action_proposals
for each row execute function public.set_updated_at();

alter table public.confirmed_action_proposals enable row level security;
revoke all on public.confirmed_action_proposals from public,anon,authenticated;
grant select on public.confirmed_action_proposals to authenticated;

create policy confirmed_action_proposals_select_own
on public.confirmed_action_proposals
for select to authenticated
using(auth.uid() = user_id);

create or replace function public.confirmation_plan_fingerprint(
  p_user_id uuid,
  p_weekly_plan_id uuid
)
returns text
language plpgsql
security definer
stable
set search_path=''
as $$
declare
  v_plan public.weekly_plans;
  v_value jsonb;
begin
  select * into v_plan
  from public.weekly_plans
  where id = p_weekly_plan_id
    and user_id = p_user_id;
  if not found then raise exception 'WEEKLY_PLAN_NOT_FOUND'; end if;

  select jsonb_build_object(
    'plan', jsonb_build_array(
      v_plan.id,v_plan.status,v_plan.week_start_date,v_plan.week_end_date,
      v_plan.available_minutes,v_plan.planning_budget_minutes,
      v_plan.planned_minutes,v_plan.generation_version,v_plan.updated_at
    ),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_array(
        t.id,t.subject_id,t.curriculum_node_id,t.resource_id,t.task_type,
        t.title,t.planned_date,t.estimated_minutes,t.importance,
        t.priority_score,t.status,t.dedupe_key,t.updated_at,
        coalesce(tp.completed_minutes,0),coalesce(tp.actual_study_minutes,0),tp.updated_at
      ) order by t.id)
      from public.tasks t
      left join public.task_progress tp on tp.task_id = t.id and tp.user_id = t.user_id
      where t.user_id = p_user_id and t.weekly_plan_id = p_weekly_plan_id
    ),'[]'::jsonb),
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_array(
        s.id,s.task_id,s.status,s.started_at,s.ended_at,
        s.duration_minutes,s.accounted_at,s.updated_at
      ) order by s.id)
      from public.study_sessions s
      where s.user_id = p_user_id
        and s.exam_profile_id = v_plan.exam_profile_id
        and s.started_at >= (v_plan.week_start_date::timestamp at time zone 'Europe/Istanbul')
        and s.started_at < ((v_plan.week_end_date + 1)::timestamp at time zone 'Europe/Istanbul')
    ),'[]'::jsonb),
    'availability', coalesce((
      select jsonb_agg(jsonb_build_array(
        a.id,a.weekday,a.start_time,a.end_time,a.is_active,a.created_at
      ) order by a.id)
      from public.weekly_availability a
      where a.user_id = p_user_id and a.exam_profile_id = v_plan.exam_profile_id
    ),'[]'::jsonb),
    'periods', coalesce((
      select jsonb_agg(jsonb_build_array(
        c.id,c.period_type,c.start_date,c.end_date,c.capacity_multiplier,c.created_at
      ) order by c.id)
      from public.calendar_periods c
      where c.user_id = p_user_id and c.exam_profile_id = v_plan.exam_profile_id
        and c.end_date >= v_plan.week_start_date
        and c.start_date <= v_plan.week_end_date
    ),'[]'::jsonb),
    'exceptions', coalesce((
      select jsonb_agg(jsonb_build_array(
        e.id,e.exception_date,e.exception_type,e.start_time,e.end_time,
        e.minutes_delta,e.note,e.created_at
      ) order by e.id)
      from public.schedule_exceptions e
      where e.user_id = p_user_id and e.exam_profile_id = v_plan.exam_profile_id
        and e.exception_date between v_plan.week_start_date and v_plan.week_end_date
    ),'[]'::jsonb),
    'dailyOverrides', coalesce((
      select jsonb_agg(jsonb_build_array(
        d.id,d.capacity_date,d.capacity_minutes,d.reserve_minutes,d.source_key,d.updated_at
      ) order by d.id)
      from public.p48_daily_capacity_overrides d
      where d.user_id = p_user_id and d.exam_profile_id = v_plan.exam_profile_id
        and d.capacity_date between v_plan.week_start_date and v_plan.week_end_date
    ),'[]'::jsonb),
    'weekOverrides', coalesce((
      select jsonb_agg(jsonb_build_array(
        w.id,w.week_start_date,w.capacity_minutes,w.planning_budget_minutes,
        w.reserve_minutes,w.source_key,w.updated_at
      ) order by w.id)
      from public.p48_week_capacity_overrides w
      where w.user_id = p_user_id and w.exam_profile_id = v_plan.exam_profile_id
        and w.week_start_date = v_plan.week_start_date
    ),'[]'::jsonb)
  ) into v_value;

  return md5(v_value::text);
end;
$$;

revoke all on function public.confirmation_plan_fingerprint(uuid,uuid)
from public,anon,authenticated;

create or replace function public.create_confirmed_action_proposal(
  p_user_id uuid,
  p_exam_profile_id uuid,
  p_weekly_plan_id uuid,
  p_action_kind text,
  p_plan_generation_version integer,
  p_mutation_payload jsonb,
  p_display_payload jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_plan public.weekly_plans;
  v_row public.confirmed_action_proposals;
  v_candidate jsonb;
begin
  if current_user not in ('service_role','postgres') then
    raise exception 'FORBIDDEN';
  end if;
  if p_action_kind not in ('quick_task','capacity_change') then
    raise exception 'ACTION_PROPOSAL_INVALID_KIND';
  end if;
  if nullif(btrim(p_idempotency_key),'') is null then
    raise exception 'ACTION_PROPOSAL_INVALID_IDEMPOTENCY_KEY';
  end if;

  select * into v_plan
  from public.weekly_plans
  where id = p_weekly_plan_id
    and user_id = p_user_id
    and exam_profile_id = p_exam_profile_id
    and status = 'active';
  if not found then raise exception 'WEEKLY_PLAN_NOT_FOUND'; end if;
  if v_plan.generation_version <> p_plan_generation_version then
    raise exception 'ACTION_PROPOSAL_STALE';
  end if;

  if p_action_kind = 'quick_task' then
    v_candidate := p_mutation_payload->'candidate';
    if v_candidate is null
      or nullif(btrim(v_candidate->>'title'),'') is null
      or (v_candidate->>'estimatedMinutes')::integer <= 0
      or (v_candidate->>'plannedDate')::date not between v_plan.week_start_date and v_plan.week_end_date
      or (p_mutation_payload#>>'{capacity,fits}')::boolean is not true
      or (v_candidate->>'estimatedMinutes')::integer > (p_mutation_payload#>>'{capacity,remainingMinutes}')::integer
    then
      raise exception 'QUICK_ADD_PROPOSAL_INVALID';
    end if;
  elsif p_mutation_payload->'scheduleException' is null
    or p_mutation_payload->'planRevisionPayload' is null
    or p_mutation_payload#>>'{planRevisionPayload,weeklyPlanId}' <> p_weekly_plan_id::text
  then
    raise exception 'CAPACITY_PROPOSAL_INVALID';
  end if;

  insert into public.confirmed_action_proposals(
    user_id,exam_profile_id,weekly_plan_id,action_kind,
    plan_generation_version,snapshot_fingerprint,mutation_payload,
    display_payload,idempotency_key,expires_at
  ) values(
    p_user_id,p_exam_profile_id,p_weekly_plan_id,p_action_kind,
    p_plan_generation_version,
    public.confirmation_plan_fingerprint(p_user_id,p_weekly_plan_id),
    p_mutation_payload,coalesce(p_display_payload,'{}'::jsonb),
    p_idempotency_key,now() + interval '20 minutes'
  )
  on conflict(user_id,idempotency_key) do update set
    plan_generation_version = case
      when public.confirmed_action_proposals.status='applied'
        then public.confirmed_action_proposals.plan_generation_version
      else excluded.plan_generation_version end,
    snapshot_fingerprint = case
      when public.confirmed_action_proposals.status='applied'
        then public.confirmed_action_proposals.snapshot_fingerprint
      else excluded.snapshot_fingerprint end,
    mutation_payload = case
      when public.confirmed_action_proposals.status='applied'
        then public.confirmed_action_proposals.mutation_payload
      else excluded.mutation_payload end,
    display_payload = case
      when public.confirmed_action_proposals.status='applied'
        then public.confirmed_action_proposals.display_payload
      else excluded.display_payload end,
    expires_at = case
      when public.confirmed_action_proposals.status='applied'
        then public.confirmed_action_proposals.expires_at
      else excluded.expires_at end
  returning * into v_row;

  return jsonb_build_object(
    'proposalId',v_row.id,
    'actionKind',v_row.action_kind,
    'expiresAt',v_row.expires_at,
    'planGenerationVersion',v_row.plan_generation_version
  );
end;
$$;

revoke all on function public.create_confirmed_action_proposal(
  uuid,uuid,uuid,text,integer,jsonb,jsonb,text
) from public,anon,authenticated;
grant execute on function public.create_confirmed_action_proposal(
  uuid,uuid,uuid,text,integer,jsonb,jsonb,text
) to service_role;

create or replace function public.apply_confirmed_action_proposal(
  p_proposal_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_proposal public.confirmed_action_proposals;
  v_plan public.weekly_plans;
  v_candidate jsonb;
  v_task public.tasks;
  v_existing public.tasks;
  v_schedule jsonb;
  v_revision_result jsonb;
  v_result jsonb;
  v_inserted_exception_id uuid;
begin
  if v_user is null then raise exception 'UNAUTHORIZED'; end if;

  select * into v_proposal
  from public.confirmed_action_proposals
  where id = p_proposal_id and user_id = v_user
  for update;
  if not found then raise exception 'ACTION_PROPOSAL_NOT_FOUND'; end if;

  if v_proposal.status = 'applied' then
    return coalesce(v_proposal.result_payload,'{}'::jsonb)
      || jsonb_build_object('idempotent',true,'proposalId',v_proposal.id);
  end if;
  if v_proposal.status <> 'pending' then raise exception 'ACTION_PROPOSAL_NOT_PENDING'; end if;
  if v_proposal.expires_at <= now() then
    update public.confirmed_action_proposals set status='expired'
    where id=v_proposal.id;
    raise exception 'ACTION_PROPOSAL_EXPIRED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text,41));
  select * into v_plan
  from public.weekly_plans
  where id=v_proposal.weekly_plan_id
    and user_id=v_user
    and exam_profile_id=v_proposal.exam_profile_id
    and status='active'
  for update;
  if not found then raise exception 'WEEKLY_PLAN_NOT_FOUND'; end if;
  if v_plan.generation_version <> v_proposal.plan_generation_version then
    raise exception 'ACTION_PROPOSAL_STALE';
  end if;
  if public.confirmation_plan_fingerprint(v_user,v_plan.id) <> v_proposal.snapshot_fingerprint then
    raise exception 'ACTION_PROPOSAL_STALE';
  end if;

  if v_proposal.action_kind = 'quick_task' then
    v_candidate := v_proposal.mutation_payload->'candidate';
    if (v_candidate->>'plannedDate')::date < current_date
      or (v_candidate->>'plannedDate')::date not between v_plan.week_start_date and v_plan.week_end_date
    then
      raise exception 'ACTION_PROPOSAL_STALE';
    end if;
    perform 1 from public.user_subjects
    where user_id=v_user and exam_profile_id=v_plan.exam_profile_id
      and subject_id=(v_candidate->>'subjectId')::uuid and status='active';
    if not found then raise exception 'QUICK_ADD_INVALID_SUBJECT'; end if;

    insert into public.tasks(
      user_id,exam_profile_id,weekly_plan_id,subject_id,
      task_type,title,planned_date,estimated_minutes,importance,
      priority_score,status,source_reason,dedupe_key
    ) values(
      v_user,v_plan.exam_profile_id,v_plan.id,(v_candidate->>'subjectId')::uuid,
      'custom',v_candidate->>'title',(v_candidate->>'plannedDate')::date,
      (v_candidate->>'estimatedMinutes')::integer,'important',50,
      'ready','manual',v_proposal.mutation_payload->>'taskDedupeKey'
    )
    on conflict(weekly_plan_id,dedupe_key) do nothing
    returning * into v_task;

    if v_task.id is null then
      select * into v_existing from public.tasks
      where weekly_plan_id=v_plan.id
        and dedupe_key=v_proposal.mutation_payload->>'taskDedupeKey'
        and user_id=v_user;
      if not found
        or v_existing.subject_id <> (v_candidate->>'subjectId')::uuid
        or v_existing.title <> v_candidate->>'title'
        or v_existing.planned_date <> (v_candidate->>'plannedDate')::date
        or v_existing.estimated_minutes <> (v_candidate->>'estimatedMinutes')::integer
      then
        raise exception 'QUICK_ADD_DUPLICATE_CONFLICT';
      end if;
      v_task := v_existing;
    else
      insert into public.task_progress(task_id,user_id)
      values(v_task.id,v_user) on conflict do nothing;
      update public.weekly_plans
      set planned_minutes=planned_minutes+v_task.estimated_minutes,
          generation_version=generation_version+1
      where id=v_plan.id;
    end if;

    select jsonb_build_object(
      'proposalId',v_proposal.id,
      'actionKind','quick_task',
      'task',to_jsonb(v_task),
      'created',v_existing.id is null,
      'idempotent',v_existing.id is not null,
      'weeklyPlanId',v_plan.id,
      'refresh',jsonb_build_array('today','week')
    ) into v_result;
  else
    v_schedule := v_proposal.mutation_payload->'scheduleException';
    insert into public.schedule_exceptions(
      user_id,exam_profile_id,exception_date,exception_type,
      minutes_delta,note,confirmation_dedupe_key
    ) values(
      v_user,v_plan.exam_profile_id,(v_schedule->>'date')::date,
      v_schedule->>'type',(v_schedule->>'minutesDelta')::integer,
      coalesce(v_schedule->>'note','KPSS Coach confirmed capacity change'),
      v_schedule->>'dedupeKey'
    )
    on conflict(user_id,confirmation_dedupe_key)
      where confirmation_dedupe_key is not null
    do nothing
    returning id into v_inserted_exception_id;

    v_revision_result := public.apply_plan_revision(
      v_proposal.mutation_payload->'planRevisionPayload'
    );
    if coalesce((v_revision_result->>'proposal')::boolean,false) then
      raise exception 'ACTION_PROPOSAL_NOT_APPLYABLE';
    end if;

    select jsonb_build_object(
      'proposalId',v_proposal.id,
      'actionKind','capacity_change',
      'scheduleExceptionCreated',v_inserted_exception_id is not null,
      'revision',v_revision_result,
      'changes',coalesce(v_proposal.display_payload->'changes','[]'::jsonb),
      'capacityEvent',coalesce(v_proposal.display_payload->'capacityEvent',v_schedule),
      'weeklyPlanId',v_plan.id,
      'refresh',jsonb_build_array('today','week','roadmap','progress')
    ) into v_result;
  end if;

  update public.confirmed_action_proposals
  set status='applied',applied_at=now(),result_payload=v_result
  where id=v_proposal.id;
  return v_result;
end;
$$;

revoke all on function public.apply_confirmed_action_proposal(uuid)
from public,anon;
grant execute on function public.apply_confirmed_action_proposal(uuid)
to authenticated;
