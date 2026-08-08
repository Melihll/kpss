create table public.scheduled_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_profile_id uuid null,
  action_type text not null,
  scheduled_for timestamptz not null,
  status text not null default 'pending',
  dedupe_key text not null,
  payload jsonb not null default '{}'::jsonb,
  result_payload jsonb null,
  attempt_count integer not null default 0,
  last_error text null,
  claimed_at timestamptz null,
  processed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scheduled_actions_profile_owner_fk foreign key (exam_profile_id,user_id)
    references public.exam_profiles(id,user_id) on delete cascade,
  constraint scheduled_actions_type_valid check (action_type in ('daily_plan','data_gap_check','weekly_report')),
  constraint scheduled_actions_status_valid check (status in ('pending','processing','completed','failed','cancelled')),
  constraint scheduled_actions_dedupe_not_blank check (btrim(dedupe_key)<>''),
  constraint scheduled_actions_attempt_nonnegative check (attempt_count>=0),
  constraint scheduled_actions_dedupe_unique unique (dedupe_key)
);
create index scheduled_actions_due_idx on public.scheduled_actions(status,scheduled_for);
create index scheduled_actions_user_idx on public.scheduled_actions(user_id,created_at desc);
create trigger scheduled_actions_updated before update on public.scheduled_actions
for each row execute function public.set_updated_at();

create table public.data_gap_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_profile_id uuid not null,
  gap_date date not null,
  gap_type text not null default 'missing_study_confirmation',
  status text not null default 'open',
  resolution_result text null,
  notified_at timestamptz null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz null,
  constraint data_gap_events_profile_owner_fk foreign key (exam_profile_id,user_id)
    references public.exam_profiles(id,user_id) on delete cascade,
  constraint data_gap_events_type_valid check (gap_type='missing_study_confirmation'),
  constraint data_gap_events_status_valid check (status in ('open','resolved')),
  constraint data_gap_events_result_valid check (resolution_result is null or resolution_result in ('confirmed_no_study','study_added')),
  constraint data_gap_events_resolution_consistent check (
    (status='open' and resolved_at is null and resolution_result is null)
    or (status='resolved' and resolved_at is not null and resolution_result is not null)
  ),
  constraint data_gap_events_user_date_unique unique (user_id,gap_date,gap_type)
);
create index data_gap_events_user_status_idx on public.data_gap_events(user_id,status,gap_date desc);

create table public.weekly_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_profile_id uuid not null,
  week_start_date date not null,
  week_end_date date not null,
  planned_minutes integer not null,
  actual_minutes integer not null,
  planned_task_count integer not null,
  completed_task_count integer not null,
  question_count integer not null,
  completed_topic_count integer not null,
  revision_completed_count integer not null,
  revision_due_count integer not null,
  backlog_severity text not null,
  projection_status text not null,
  plan_status text not null,
  explanation text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekly_reports_profile_owner_fk foreign key (exam_profile_id,user_id)
    references public.exam_profiles(id,user_id) on delete cascade,
  constraint weekly_reports_week_valid check (extract(isodow from week_start_date)=1 and week_end_date=week_start_date+6),
  constraint weekly_reports_counts_nonnegative check (
    planned_minutes>=0 and actual_minutes>=0 and planned_task_count>=0 and completed_task_count>=0
    and question_count>=0 and completed_topic_count>=0 and revision_completed_count>=0 and revision_due_count>=0
  ),
  constraint weekly_reports_backlog_valid check (backlog_severity in ('normal','attention','risk','critical')),
  constraint weekly_reports_status_valid check (plan_status in ('good','attention','risk')),
  constraint weekly_reports_explanation_not_blank check (btrim(explanation)<>''),
  constraint weekly_reports_user_week_unique unique (user_id,week_start_date)
);
create index weekly_reports_user_week_idx on public.weekly_reports(user_id,week_start_date desc);
create trigger weekly_reports_updated before update on public.weekly_reports
for each row execute function public.set_updated_at();

create table public.recommendation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_profile_id uuid not null,
  task_id uuid null,
  event_type text not null,
  channel text not null,
  reason text not null,
  created_at timestamptz not null default now(),
  constraint recommendation_events_profile_owner_fk foreign key (exam_profile_id,user_id)
    references public.exam_profiles(id,user_id) on delete cascade,
  constraint recommendation_events_task_owner_fk foreign key (task_id,user_id,exam_profile_id)
    references public.tasks(id,user_id,exam_profile_id) on delete cascade,
  constraint recommendation_events_type_valid check (event_type in ('next_best_task','minimum_plan')),
  constraint recommendation_events_channel_valid check (channel in ('web','telegram','scheduler')),
  constraint recommendation_events_reason_not_blank check (btrim(reason)<>'')
);
create index recommendation_events_user_type_idx on public.recommendation_events(user_id,event_type,created_at desc);

alter table public.scheduled_actions enable row level security;
alter table public.data_gap_events enable row level security;
alter table public.weekly_reports enable row level security;
alter table public.recommendation_events enable row level security;

revoke all on public.scheduled_actions,public.data_gap_events,public.weekly_reports,public.recommendation_events from anon,authenticated;
grant select on public.scheduled_actions,public.data_gap_events,public.weekly_reports,public.recommendation_events to authenticated;
grant insert on public.recommendation_events to authenticated;
grant insert,update on public.weekly_reports to authenticated;

create policy "Users read own scheduled actions" on public.scheduled_actions for select to authenticated
using ((select auth.uid())=user_id);
create policy "Users read own data gaps" on public.data_gap_events for select to authenticated
using ((select auth.uid())=user_id);
create policy "Users read own weekly reports" on public.weekly_reports for select to authenticated
using ((select auth.uid())=user_id);
create policy "Users create own weekly reports" on public.weekly_reports for insert to authenticated
with check ((select auth.uid())=user_id);
create policy "Users update own weekly reports" on public.weekly_reports for update to authenticated
using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "Users read own recommendation events" on public.recommendation_events for select to authenticated
using ((select auth.uid())=user_id);
create policy "Users create own recommendation events" on public.recommendation_events for insert to authenticated
with check ((select auth.uid())=user_id);

create function public.generate_pilot_scheduled_actions(p_reference timestamptz default now()) returns integer
language plpgsql security definer set search_path='' as $$
declare
  v_date date := timezone('Europe/Istanbul',p_reference)::date;
  v_week date := v_date - (extract(isodow from v_date)::integer-1);
  v_count integer := 0;
  v_inserted integer := 0;
begin
  insert into public.scheduled_actions(user_id,exam_profile_id,action_type,scheduled_for,dedupe_key,payload)
  select ep.user_id,ep.id,'daily_plan',(v_date+time '08:00') at time zone 'Europe/Istanbul',
    'daily_plan:'||ep.user_id||':'||v_date,jsonb_build_object('localDate',v_date)
  from public.exam_profiles ep where ep.status='active'
  on conflict(dedupe_key) do nothing;
  get diagnostics v_inserted=row_count;
  v_count:=v_count+v_inserted;

  insert into public.scheduled_actions(user_id,exam_profile_id,action_type,scheduled_for,dedupe_key,payload)
  select ep.user_id,ep.id,'data_gap_check',(v_date+time '09:00') at time zone 'Europe/Istanbul',
    'data_gap_check:'||ep.user_id||':'||v_date,jsonb_build_object('localDate',v_date,'gapDate',v_date-1)
  from public.exam_profiles ep where ep.status='active'
  on conflict(dedupe_key) do nothing;
  get diagnostics v_inserted=row_count;
  v_count:=v_count+v_inserted;

  insert into public.scheduled_actions(user_id,exam_profile_id,action_type,scheduled_for,dedupe_key,payload)
  select ep.user_id,ep.id,'weekly_report',(v_week+6+time '19:00') at time zone 'Europe/Istanbul',
    'weekly_report:'||ep.user_id||':'||v_week,jsonb_build_object('weekStartDate',v_week)
  from public.exam_profiles ep where ep.status='active'
  on conflict(dedupe_key) do nothing;
  get diagnostics v_inserted=row_count;
  v_count:=v_count+v_inserted;
  return v_count;
end $$;

create function public.claim_due_scheduled_actions(p_limit integer default 20,p_stale_seconds integer default 300)
returns setof public.scheduled_actions language sql security definer set search_path='' as $$
  with candidates as (
    select id from public.scheduled_actions
    where scheduled_for<=now() and attempt_count<3 and (
      status in ('pending','failed') or
      (status='processing' and claimed_at<now()-make_interval(secs=>greatest(p_stale_seconds,1)))
    )
    order by scheduled_for,id for update skip locked limit greatest(1,least(p_limit,100))
  )
  update public.scheduled_actions action set
    status='processing',attempt_count=action.attempt_count+1,claimed_at=now(),last_error=null
  from candidates where action.id=candidates.id returning action.*
$$;

create function public.reserve_scheduled_action_notification(p_action_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  update public.scheduled_actions set payload=payload||jsonb_build_object('notificationReservedAt',now())
  where id=p_action_id and status='processing' and not (payload?'notificationReservedAt');
  return found;
end $$;

create function public.complete_scheduled_action(p_action_id uuid,p_result jsonb default '{}'::jsonb) returns public.scheduled_actions
language plpgsql security definer set search_path='' as $$
declare v_action public.scheduled_actions;
begin
  update public.scheduled_actions set status='completed',result_payload=p_result,processed_at=now(),claimed_at=null,last_error=null
  where id=p_action_id and status='processing' returning * into v_action;
  if not found then raise exception 'SCHEDULED_ACTION_NOT_PROCESSING'; end if;
  return v_action;
end $$;

create function public.fail_scheduled_action(p_action_id uuid,p_error text) returns public.scheduled_actions
language plpgsql security definer set search_path='' as $$
declare v_action public.scheduled_actions;
begin
  update public.scheduled_actions set status='failed',last_error=left(coalesce(p_error,'UNKNOWN'),1000),
    scheduled_for=now()+interval '5 minutes',claimed_at=null
  where id=p_action_id and status='processing' returning * into v_action;
  if not found then raise exception 'SCHEDULED_ACTION_NOT_PROCESSING'; end if;
  return v_action;
end $$;

create function public.resolve_data_gap_event(p_event_id uuid,p_result text) returns public.data_gap_events
language plpgsql security definer set search_path='' as $$
declare v_event public.data_gap_events;
begin
  if p_result not in ('confirmed_no_study','study_added') then raise exception 'INVALID_DATA_GAP_RESULT'; end if;
  select * into v_event from public.data_gap_events where id=p_event_id and user_id=auth.uid() for update;
  if not found then raise exception 'DATA_GAP_NOT_FOUND'; end if;
  if v_event.status='resolved' then return v_event; end if;
  update public.data_gap_events set status='resolved',resolution_result=p_result,resolved_at=now()
  where id=v_event.id returning * into v_event;
  return v_event;
end $$;

revoke all on function public.generate_pilot_scheduled_actions(timestamptz),
  public.claim_due_scheduled_actions(integer,integer),public.reserve_scheduled_action_notification(uuid),
  public.complete_scheduled_action(uuid,jsonb),public.fail_scheduled_action(uuid,text)
from public,anon,authenticated;
grant execute on function public.generate_pilot_scheduled_actions(timestamptz),
  public.claim_due_scheduled_actions(integer,integer),public.reserve_scheduled_action_notification(uuid),
  public.complete_scheduled_action(uuid,jsonb),public.fail_scheduled_action(uuid,text)
to service_role;

revoke all on function public.resolve_data_gap_event(uuid,text) from public,anon;
grant execute on function public.resolve_data_gap_event(uuid,text) to authenticated;
