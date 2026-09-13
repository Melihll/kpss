begin;

alter table public.ai_usage_events
  add column provider_request_id text null,
  add column provider_request_id_source text not null default 'unavailable',
  add column fx_loaded_at timestamptz null,
  add column fx_max_age_seconds integer null;

alter table public.ai_usage_events add constraint ai_usage_events_provider_request_valid check(
  (provider_request_id is null and provider_request_id_source = 'unavailable')
  or (provider_request_id is not null and btrim(provider_request_id) <> '' and provider_request_id_source in ('response_body','response_header'))
);

alter table public.ai_usage_events drop constraint ai_usage_events_usage_valid;
alter table public.ai_usage_events add constraint ai_usage_events_usage_valid check(
  (usage_availability = 'reported'
    and input_tokens >= 0 and (cached_input_tokens is null or (cached_input_tokens >= 0 and cached_input_tokens <= input_tokens))
    and output_tokens >= 0 and total_tokens = input_tokens + output_tokens
    and usage_source = 'provider_response')
  or
  (usage_availability = 'unavailable'
    and input_tokens is null and cached_input_tokens is null and output_tokens is null and total_tokens is null
    and usage_source = 'provider_usage_unavailable')
);

alter table public.ai_usage_events drop constraint ai_usage_events_try_cost_valid;
alter table public.ai_usage_events add constraint ai_usage_events_try_cost_valid check(
  (try_cost_state = 'known'
    and native_cost_state = 'known' and try_estimated_cost >= 0 and try_cost_reason is null
    and fx_policy_version is not null and fx_snapshot_version is not null and fx_source is not null
    and fx_source_kind in ('test_fixture','authoritative_config') and fx_base_currency = native_currency
    and fx_quote_currency = 'TRY' and fx_rate > 0 and fx_effective_at is not null
    and fx_loaded_at is not null and fx_loaded_at >= fx_effective_at and fx_max_age_seconds > 0
    and abs(try_estimated_cost - round(native_cost_amount * fx_rate,6)) <= 0.000001)
  or
  (try_cost_state = 'unknown'
    and try_estimated_cost is null
    and try_cost_reason in ('native_cost_unpriced','fx_snapshot_unavailable','authoritative_production_fx_unavailable','fx_snapshot_stale','fx_currency_mismatch'))
);

create or replace function public.record_ai_usage_event_v1(p_event jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_allowed constant text[] := array[
    'event_version','provider_attempt_id','provider_request_id','provider_request_id_source','user_id','exam_profile_id','capability','request_id','correlation_id',
    'route_version','route_catalog_version','route_reason_code','provider','model_id','model_tier','pricing_version',
    'usage_availability','input_tokens','cached_input_tokens','output_tokens','total_tokens','usage_source',
    'started_at','completed_at','latency_ms','status','retry_number','fallback_from_attempt_id','error_category',
    'native_cost_state','native_cost_amount','native_currency','native_cost_reason','uncached_input_cost','cached_input_cost','output_cost',
    'try_cost_state','try_estimated_cost','try_cost_reason','fx_policy_version','fx_snapshot_version','fx_source','fx_source_kind',
    'fx_base_currency','fx_quote_currency','fx_rate','fx_effective_at','fx_loaded_at','fx_max_age_seconds','accounting_month'
  ];
  v_fingerprint text;
  v_existing public.ai_usage_events;
  v_inserted public.ai_usage_events;
begin
  if current_user not in ('service_role','postgres') then raise exception 'FORBIDDEN'; end if;
  if p_event is null or jsonb_typeof(p_event) <> 'object' then raise exception 'AI_USAGE_EVENT_INVALID'; end if;
  if exists(select 1 from jsonb_object_keys(p_event) as item(key) where not (item.key = any(v_allowed))) then raise exception 'AI_USAGE_EVENT_UNKNOWN_FIELD'; end if;
  if exists(select 1 from unnest(v_allowed) as item(key) where not (p_event ? item.key)) then raise exception 'AI_USAGE_EVENT_MISSING_FIELD'; end if;
  if not exists(select 1 from public.exam_profiles p where p.id = nullif(p_event->>'exam_profile_id','')::uuid and p.user_id = (p_event->>'user_id')::uuid)
    and nullif(p_event->>'exam_profile_id','') is not null then raise exception 'AI_USAGE_EVENT_PROFILE_NOT_OWNED'; end if;

  v_fingerprint := md5(p_event::text);
  perform pg_advisory_xact_lock(hashtextextended(p_event->>'provider_attempt_id',63));
  select * into v_existing from public.ai_usage_events where provider_attempt_id = p_event->>'provider_attempt_id';
  if found then
    if v_existing.event_fingerprint <> v_fingerprint then raise exception 'AI_USAGE_ATTEMPT_CONFLICT'; end if;
    return jsonb_build_object('eventId',v_existing.id,'providerAttemptId',v_existing.provider_attempt_id,'idempotent',true);
  end if;

  insert into public.ai_usage_events(
    event_version,provider_attempt_id,provider_request_id,provider_request_id_source,user_id,exam_profile_id,capability,request_id,correlation_id,
    route_version,route_catalog_version,route_reason_code,provider,model_id,model_tier,pricing_version,
    usage_availability,input_tokens,cached_input_tokens,output_tokens,total_tokens,usage_source,
    started_at,completed_at,latency_ms,status,retry_number,fallback_from_attempt_id,error_category,
    native_cost_state,native_cost_amount,native_currency,native_cost_reason,uncached_input_cost,cached_input_cost,output_cost,
    try_cost_state,try_estimated_cost,try_cost_reason,fx_policy_version,fx_snapshot_version,fx_source,fx_source_kind,
    fx_base_currency,fx_quote_currency,fx_rate,fx_effective_at,fx_loaded_at,fx_max_age_seconds,accounting_month,event_fingerprint
  ) values(
    p_event->>'event_version',p_event->>'provider_attempt_id',nullif(p_event->>'provider_request_id',''),p_event->>'provider_request_id_source',(p_event->>'user_id')::uuid,nullif(p_event->>'exam_profile_id','')::uuid,
    p_event->>'capability',p_event->>'request_id',p_event->>'correlation_id',p_event->>'route_version',p_event->>'route_catalog_version',
    p_event->>'route_reason_code',p_event->>'provider',p_event->>'model_id',p_event->>'model_tier',p_event->>'pricing_version',
    p_event->>'usage_availability',nullif(p_event->>'input_tokens','')::integer,nullif(p_event->>'cached_input_tokens','')::integer,
    nullif(p_event->>'output_tokens','')::integer,nullif(p_event->>'total_tokens','')::integer,p_event->>'usage_source',
    (p_event->>'started_at')::timestamptz,(p_event->>'completed_at')::timestamptz,(p_event->>'latency_ms')::integer,
    p_event->>'status',(p_event->>'retry_number')::integer,nullif(p_event->>'fallback_from_attempt_id',''),p_event->>'error_category',
    p_event->>'native_cost_state',nullif(p_event->>'native_cost_amount','')::numeric,nullif(p_event->>'native_currency',''),
    nullif(p_event->>'native_cost_reason',''),nullif(p_event->>'uncached_input_cost','')::numeric,nullif(p_event->>'cached_input_cost','')::numeric,
    nullif(p_event->>'output_cost','')::numeric,p_event->>'try_cost_state',nullif(p_event->>'try_estimated_cost','')::numeric,
    nullif(p_event->>'try_cost_reason',''),nullif(p_event->>'fx_policy_version',''),nullif(p_event->>'fx_snapshot_version',''),
    nullif(p_event->>'fx_source',''),nullif(p_event->>'fx_source_kind',''),nullif(p_event->>'fx_base_currency',''),
    nullif(p_event->>'fx_quote_currency',''),nullif(p_event->>'fx_rate','')::numeric,nullif(p_event->>'fx_effective_at','')::timestamptz,
    nullif(p_event->>'fx_loaded_at','')::timestamptz,nullif(p_event->>'fx_max_age_seconds','')::integer,p_event->>'accounting_month',v_fingerprint
  ) returning * into v_inserted;
  return jsonb_build_object('eventId',v_inserted.id,'providerAttemptId',v_inserted.provider_attempt_id,'idempotent',false);
end;
$$;

create table public.ai_budget_reservations (
  id uuid primary key default gen_random_uuid(),
  reservation_id text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_profile_id uuid null,
  accounting_month text not null,
  month_start_at timestamptz not null,
  month_end_at timestamptz not null,
  route_version text not null,
  route_catalog_version text not null,
  provider text not null,
  model_id text not null,
  model_tier text not null,
  pricing_version text not null,
  fx_policy_version text not null,
  fx_snapshot_version text not null,
  billing_bound_version text not null,
  estimated_try_max numeric(20,6) not null,
  request_id text not null,
  correlation_id text not null,
  provider_attempt_id text null unique,
  provider_attempt_state text not null default 'not_started',
  usage_event_id uuid null unique references public.ai_usage_events(id),
  actual_try_amount numeric(20,6) null,
  status text not null default 'reserved',
  reconciliation_reason text null,
  request_fingerprint text not null,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  finalized_at timestamptz null,
  updated_at timestamptz not null,
  constraint ai_budget_reservations_profile_owner_fk foreign key(exam_profile_id,user_id) references public.exam_profiles(id,user_id) on delete cascade,
  constraint ai_budget_reservations_identity_valid check(btrim(reservation_id) <> '' and btrim(request_id) <> '' and btrim(correlation_id) <> '' and btrim(provider) <> '' and btrim(model_id) <> '' and model_tier in ('economy','standard','strong')),
  constraint ai_budget_reservations_month_valid check(accounting_month ~ '^\d{4}-\d{2}$' and accounting_month = to_char(month_start_at at time zone 'Europe/Istanbul','YYYY-MM') and month_end_at > month_start_at),
  constraint ai_budget_reservations_amount_valid check(estimated_try_max > 0 and estimated_try_max <= 300 and (actual_try_amount is null or actual_try_amount >= 0)),
  constraint ai_budget_reservations_time_valid check(expires_at > created_at and updated_at >= created_at and (finalized_at is null or finalized_at >= created_at)),
  constraint ai_budget_reservations_status_valid check(status in ('reserved','settled','released','expired','reconciliation_required')),
  constraint ai_budget_reservations_attempt_state_valid check(provider_attempt_state in ('not_started','in_flight','completed','outcome_unknown')),
  constraint ai_budget_reservations_state_shape check(
    (status = 'reserved' and finalized_at is null and actual_try_amount is null and usage_event_id is null and reconciliation_reason is null)
    or (status = 'settled' and provider_attempt_state = 'completed' and finalized_at is not null and actual_try_amount is not null and usage_event_id is not null and reconciliation_reason is null)
    or (status in ('released','expired') and provider_attempt_state = 'not_started' and finalized_at is not null and actual_try_amount is null and usage_event_id is null)
    or (status = 'reconciliation_required' and provider_attempt_state in ('completed','outcome_unknown') and reconciliation_reason is not null)
  )
);

create index ai_budget_reservations_user_month_idx on public.ai_budget_reservations(user_id,accounting_month,status,expires_at);

create table public.ai_budget_reservation_events (
  id uuid primary key default gen_random_uuid(),
  reservation_id text not null references public.ai_budget_reservations(reservation_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check(event_type in ('reserved','attempt_started','settled','released','expired','reconciliation_required')),
  from_status text null,
  to_status text not null,
  provider_attempt_id text null,
  usage_event_id uuid null references public.ai_usage_events(id),
  actual_try_amount numeric(20,6) null,
  reason text null,
  created_at timestamptz not null,
  event_fingerprint text not null unique,
  constraint ai_budget_reservation_events_amount_valid check(actual_try_amount is null or actual_try_amount >= 0)
);

create trigger ai_budget_reservation_events_immutable before update or delete on public.ai_budget_reservation_events
for each row execute function public.reject_ai_usage_event_mutation_v1();

alter table public.ai_budget_reservations enable row level security;
alter table public.ai_budget_reservation_events enable row level security;
revoke all on public.ai_budget_reservations from public,anon,authenticated,service_role;
revoke all on public.ai_budget_reservation_events from public,anon,authenticated,service_role;
grant select on public.ai_budget_reservations to authenticated,service_role;
grant select on public.ai_budget_reservation_events to authenticated,service_role;

create policy ai_budget_reservations_select_own on public.ai_budget_reservations for select to authenticated using((select auth.uid()) = user_id);
create policy ai_budget_reservation_events_select_own on public.ai_budget_reservation_events for select to authenticated using((select auth.uid()) = user_id);

create or replace function public.reserve_ai_budget_v1(p_request jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_allowed constant text[] := array['reservation_id','user_id','exam_profile_id','route_version','route_catalog_version','provider','model_id','model_tier','pricing_version','fx_policy_version','fx_snapshot_version','billing_bound_version','estimated_try_max','request_id','correlation_id','requested_at','expires_at'];
  v_user uuid; v_profile uuid; v_requested timestamptz; v_expires timestamptz; v_month text; v_month_start timestamptz; v_month_end timestamptz;
  v_estimated numeric(20,6); v_spent numeric(20,6); v_reserved numeric(20,6); v_unknown integer; v_bound_violation integer; v_fingerprint text; v_existing public.ai_budget_reservations; v_inserted public.ai_budget_reservations;
begin
  if current_user not in ('service_role','postgres') then raise exception 'FORBIDDEN'; end if;
  if p_request is null or jsonb_typeof(p_request) <> 'object' then raise exception 'AI_BUDGET_RESERVATION_INVALID'; end if;
  if exists(select 1 from jsonb_object_keys(p_request) item(key) where not item.key = any(v_allowed)) then raise exception 'AI_BUDGET_RESERVATION_UNKNOWN_FIELD'; end if;
  if exists(select 1 from unnest(v_allowed) item(key) where not p_request ? item.key) then raise exception 'AI_BUDGET_RESERVATION_MISSING_FIELD'; end if;
  v_user := (p_request->>'user_id')::uuid; v_profile := nullif(p_request->>'exam_profile_id','')::uuid;
  if v_profile is not null and not exists(select 1 from public.exam_profiles where id=v_profile and user_id=v_user) then raise exception 'AI_BUDGET_PROFILE_NOT_OWNED'; end if;
  v_requested := (p_request->>'requested_at')::timestamptz; v_expires := (p_request->>'expires_at')::timestamptz; v_estimated := (p_request->>'estimated_try_max')::numeric;
  if v_estimated <= 0 or v_estimated > 300 or v_expires <= v_requested then raise exception 'AI_BUDGET_RESERVATION_INVALID'; end if;
  v_month := to_char(v_requested at time zone 'Europe/Istanbul','YYYY-MM');
  v_month_start := date_trunc('month',v_requested at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul';
  v_month_end := (date_trunc('month',v_requested at time zone 'Europe/Istanbul') + interval '1 month') at time zone 'Europe/Istanbul';
  v_fingerprint := md5(p_request::text);
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || v_month,71));
  select * into v_existing from public.ai_budget_reservations where reservation_id=p_request->>'reservation_id';
  if found then
    if v_existing.request_fingerprint <> v_fingerprint then raise exception 'AI_BUDGET_RESERVATION_CONFLICT'; end if;
    return jsonb_build_object('allowed',true,'reason','idempotent','reservationId',v_existing.reservation_id,'status',v_existing.status,'accountingMonth',v_existing.accounting_month,'committedTry',null,'idempotent',true);
  end if;

  with changed as (
    update public.ai_budget_reservations set status='expired',finalized_at=v_requested,updated_at=v_requested
    where user_id=v_user and accounting_month=v_month and status='reserved' and provider_attempt_state='not_started' and expires_at <= v_requested returning *
  ) insert into public.ai_budget_reservation_events(reservation_id,user_id,event_type,from_status,to_status,created_at,event_fingerprint)
    select reservation_id,user_id,'expired','reserved','expired',v_requested,md5(reservation_id || ':expired:' || v_requested::text) from changed on conflict do nothing;
  with changed as (
    update public.ai_budget_reservations set status='reconciliation_required',provider_attempt_state='outcome_unknown',reconciliation_reason='reservation_expired_with_in_flight_attempt',updated_at=v_requested
    where user_id=v_user and accounting_month=v_month and status='reserved' and provider_attempt_state='in_flight' and expires_at <= v_requested returning *
  ) insert into public.ai_budget_reservation_events(reservation_id,user_id,event_type,from_status,to_status,provider_attempt_id,reason,created_at,event_fingerprint)
    select reservation_id,user_id,'reconciliation_required','reserved','reconciliation_required',provider_attempt_id,reconciliation_reason,v_requested,md5(reservation_id || ':reconciliation_required:' || v_requested::text) from changed on conflict do nothing;

  select coalesce(sum(try_estimated_cost),0),count(*) filter(where try_cost_state <> 'known') into v_spent,v_unknown from public.ai_usage_events where user_id=v_user and accounting_month=v_month;
  if v_unknown > 0 then return jsonb_build_object('allowed',false,'reason','usage_cost_unknown','reservationId',null,'status',null,'accountingMonth',v_month,'committedTry',null,'idempotent',false); end if;
  select count(*) into v_bound_violation from public.ai_budget_reservations where user_id=v_user and accounting_month=v_month and status='reconciliation_required' and reconciliation_reason='actual_cost_exceeds_reservation';
  if v_bound_violation > 0 then return jsonb_build_object('allowed',false,'reason','cost_bound_invariant_violation','reservationId',null,'status',null,'accountingMonth',v_month,'committedTry',null,'idempotent',false); end if;
  select coalesce(sum(estimated_try_max),0) into v_reserved from public.ai_budget_reservations where user_id=v_user and accounting_month=v_month and status in ('reserved','reconciliation_required');
  if v_spent + v_reserved + v_estimated > 300 then return jsonb_build_object('allowed',false,'reason','hard_limit','reservationId',null,'status',null,'accountingMonth',v_month,'committedTry',round(v_spent+v_reserved,6),'idempotent',false); end if;

  insert into public.ai_budget_reservations(reservation_id,user_id,exam_profile_id,accounting_month,month_start_at,month_end_at,route_version,route_catalog_version,provider,model_id,model_tier,pricing_version,fx_policy_version,fx_snapshot_version,billing_bound_version,estimated_try_max,request_id,correlation_id,request_fingerprint,created_at,expires_at,updated_at)
  values(p_request->>'reservation_id',v_user,v_profile,v_month,v_month_start,v_month_end,p_request->>'route_version',p_request->>'route_catalog_version',p_request->>'provider',p_request->>'model_id',p_request->>'model_tier',p_request->>'pricing_version',p_request->>'fx_policy_version',p_request->>'fx_snapshot_version',p_request->>'billing_bound_version',v_estimated,p_request->>'request_id',p_request->>'correlation_id',v_fingerprint,v_requested,v_expires,v_requested) returning * into v_inserted;
  insert into public.ai_budget_reservation_events(reservation_id,user_id,event_type,from_status,to_status,created_at,event_fingerprint) values(v_inserted.reservation_id,v_user,'reserved',null,'reserved',v_requested,md5(v_inserted.reservation_id || ':reserved'));
  return jsonb_build_object('allowed',true,'reason','reserved','reservationId',v_inserted.reservation_id,'status','reserved','accountingMonth',v_month,'committedTry',round(v_spent+v_reserved+v_estimated,6),'idempotent',false);
end; $$;

create or replace function public.mark_ai_budget_attempt_started_v1(p_request jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_res public.ai_budget_reservations; v_at timestamptz; begin
  if current_user not in ('service_role','postgres') then raise exception 'FORBIDDEN'; end if;
  if p_request is null or jsonb_typeof(p_request)<>'object' or exists(select 1 from jsonb_object_keys(p_request) i(key) where i.key not in ('reservation_id','provider_attempt_id','started_at')) or not (p_request ?& array['reservation_id','provider_attempt_id','started_at']) then raise exception 'AI_BUDGET_ATTEMPT_INVALID'; end if;
  v_at := (p_request->>'started_at')::timestamptz; select * into v_res from public.ai_budget_reservations where reservation_id=p_request->>'reservation_id' for update;
  if not found then raise exception 'AI_BUDGET_RESERVATION_NOT_FOUND'; end if;
  if v_res.provider_attempt_state='in_flight' and v_res.provider_attempt_id=p_request->>'provider_attempt_id' then return jsonb_build_object('reservationId',v_res.reservation_id,'status',v_res.status,'idempotent',true); end if;
  if v_res.status<>'reserved' or v_res.provider_attempt_state<>'not_started' or v_at < v_res.created_at or v_at >= v_res.expires_at then raise exception 'AI_BUDGET_ATTEMPT_STATE_INVALID'; end if;
  update public.ai_budget_reservations set provider_attempt_id=p_request->>'provider_attempt_id',provider_attempt_state='in_flight',updated_at=v_at where id=v_res.id;
  insert into public.ai_budget_reservation_events(reservation_id,user_id,event_type,from_status,to_status,provider_attempt_id,created_at,event_fingerprint) values(v_res.reservation_id,v_res.user_id,'attempt_started','reserved','reserved',p_request->>'provider_attempt_id',v_at,md5(v_res.reservation_id || ':attempt_started:' || (p_request->>'provider_attempt_id')));
  return jsonb_build_object('reservationId',v_res.reservation_id,'status','reserved','idempotent',false);
end; $$;

create or replace function public.release_ai_budget_reservation_v1(p_request jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_res public.ai_budget_reservations; v_at timestamptz; begin
  if current_user not in ('service_role','postgres') then raise exception 'FORBIDDEN'; end if;
  if p_request is null or jsonb_typeof(p_request)<>'object' or exists(select 1 from jsonb_object_keys(p_request) i(key) where i.key not in ('reservation_id','released_at','reason')) or not (p_request ?& array['reservation_id','released_at','reason']) then raise exception 'AI_BUDGET_RELEASE_INVALID'; end if;
  v_at := (p_request->>'released_at')::timestamptz; select * into v_res from public.ai_budget_reservations where reservation_id=p_request->>'reservation_id' for update;
  if not found then raise exception 'AI_BUDGET_RESERVATION_NOT_FOUND'; end if;
  if v_res.status='released' then return jsonb_build_object('reservationId',v_res.reservation_id,'status','released','idempotent',true); end if;
  if v_res.status<>'reserved' or v_res.provider_attempt_state<>'not_started' then raise exception 'AI_BUDGET_RELEASE_REQUIRES_UNSTARTED_ATTEMPT'; end if;
  update public.ai_budget_reservations set status='released',finalized_at=v_at,updated_at=v_at where id=v_res.id;
  insert into public.ai_budget_reservation_events(reservation_id,user_id,event_type,from_status,to_status,reason,created_at,event_fingerprint) values(v_res.reservation_id,v_res.user_id,'released','reserved','released',p_request->>'reason',v_at,md5(v_res.reservation_id || ':released'));
  return jsonb_build_object('reservationId',v_res.reservation_id,'status','released','idempotent',false);
end; $$;

create or replace function public.require_ai_budget_reconciliation_v1(p_request jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_res public.ai_budget_reservations; v_at timestamptz; begin
  if current_user not in ('service_role','postgres') then raise exception 'FORBIDDEN'; end if;
  if p_request is null or jsonb_typeof(p_request)<>'object' or exists(select 1 from jsonb_object_keys(p_request) i(key) where i.key not in ('reservation_id','marked_at','reason')) or not (p_request ?& array['reservation_id','marked_at','reason']) then raise exception 'AI_BUDGET_RECONCILIATION_INVALID'; end if;
  v_at := (p_request->>'marked_at')::timestamptz; select * into v_res from public.ai_budget_reservations where reservation_id=p_request->>'reservation_id' for update;
  if not found then raise exception 'AI_BUDGET_RESERVATION_NOT_FOUND'; end if;
  if v_res.status='reconciliation_required' then return jsonb_build_object('reservationId',v_res.reservation_id,'status',v_res.status,'idempotent',true); end if;
  if v_res.status<>'reserved' or v_res.provider_attempt_state<>'in_flight' then raise exception 'AI_BUDGET_RECONCILIATION_STATE_INVALID'; end if;
  update public.ai_budget_reservations set status='reconciliation_required',provider_attempt_state='outcome_unknown',reconciliation_reason=p_request->>'reason',updated_at=v_at where id=v_res.id;
  insert into public.ai_budget_reservation_events(reservation_id,user_id,event_type,from_status,to_status,provider_attempt_id,reason,created_at,event_fingerprint) values(v_res.reservation_id,v_res.user_id,'reconciliation_required','reserved','reconciliation_required',v_res.provider_attempt_id,p_request->>'reason',v_at,md5(v_res.reservation_id || ':reconciliation_required'));
  return jsonb_build_object('reservationId',v_res.reservation_id,'status','reconciliation_required','idempotent',false);
end; $$;

create or replace function public.record_ai_usage_and_settle_reservation_v1(p_reservation_id text,p_event jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_res public.ai_budget_reservations; v_written jsonb; v_usage public.ai_usage_events; v_status text; v_reason text; v_at timestamptz; begin
  if current_user not in ('service_role','postgres') then raise exception 'FORBIDDEN'; end if;
  select * into v_res from public.ai_budget_reservations where reservation_id=p_reservation_id for update;
  if not found then raise exception 'AI_BUDGET_RESERVATION_NOT_FOUND'; end if;
  if v_res.status in ('settled','reconciliation_required') and v_res.provider_attempt_id=p_event->>'provider_attempt_id' and v_res.usage_event_id is not null then return jsonb_build_object('reservationId',v_res.reservation_id,'status',v_res.status,'usageEventId',v_res.usage_event_id,'idempotent',true); end if;
  if not (
    (v_res.status='reserved' and v_res.provider_attempt_state='in_flight')
    or (v_res.status='reconciliation_required' and v_res.provider_attempt_state='outcome_unknown' and v_res.usage_event_id is null)
  ) then raise exception 'AI_BUDGET_SETTLEMENT_STATE_INVALID'; end if;
  if v_res.user_id::text<>p_event->>'user_id' or coalesce(v_res.exam_profile_id::text,'')<>coalesce(p_event->>'exam_profile_id','') or v_res.request_id<>p_event->>'request_id' or v_res.correlation_id<>p_event->>'correlation_id' or v_res.provider_attempt_id<>p_event->>'provider_attempt_id' or v_res.route_version<>p_event->>'route_version' or v_res.route_catalog_version<>p_event->>'route_catalog_version' or v_res.provider<>p_event->>'provider' or v_res.model_id<>p_event->>'model_id' or v_res.model_tier<>p_event->>'model_tier' or v_res.pricing_version<>p_event->>'pricing_version' or v_res.fx_policy_version<>coalesce(p_event->>'fx_policy_version','') or v_res.fx_snapshot_version<>coalesce(p_event->>'fx_snapshot_version','') then raise exception 'AI_BUDGET_SETTLEMENT_SCOPE_MISMATCH'; end if;
  v_written := public.record_ai_usage_event_v1(p_event); select * into v_usage from public.ai_usage_events where id=(v_written->>'eventId')::uuid; v_at := v_usage.completed_at;
  if v_usage.try_cost_state='known' and v_usage.try_estimated_cost <= v_res.estimated_try_max then v_status:='settled'; v_reason:=null;
  elsif v_usage.try_cost_state='known' then v_status:='reconciliation_required'; v_reason:='actual_cost_exceeds_reservation';
  else v_status:='reconciliation_required'; v_reason:='provider_usage_or_cost_unknown'; end if;
  update public.ai_budget_reservations set status=v_status,provider_attempt_state=case when v_status='settled' or v_reason='actual_cost_exceeds_reservation' then 'completed' else 'outcome_unknown' end,usage_event_id=v_usage.id,actual_try_amount=case when v_usage.try_cost_state='known' then v_usage.try_estimated_cost else null end,reconciliation_reason=case when v_status='settled' then null else v_reason end,finalized_at=case when v_status='settled' then v_at else null end,updated_at=v_at where id=v_res.id;
  insert into public.ai_budget_reservation_events(reservation_id,user_id,event_type,from_status,to_status,provider_attempt_id,usage_event_id,actual_try_amount,reason,created_at,event_fingerprint) values(v_res.reservation_id,v_res.user_id,v_status,v_res.status,v_status,v_res.provider_attempt_id,v_usage.id,case when v_usage.try_cost_state='known' then v_usage.try_estimated_cost else null end,v_reason,v_at,md5(v_res.reservation_id || ':' || v_status || ':' || v_usage.id::text));
  return jsonb_build_object('reservationId',v_res.reservation_id,'status',v_status,'usageEventId',v_usage.id,'idempotent',(v_written->>'idempotent')::boolean);
end; $$;

create or replace function public.expire_ai_budget_reservations_v1(p_as_of timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_expired integer; v_reconcile integer; begin
  if current_user not in ('service_role','postgres') then raise exception 'FORBIDDEN'; end if;
  with changed as (update public.ai_budget_reservations set status='expired',finalized_at=p_as_of,updated_at=p_as_of where status='reserved' and provider_attempt_state='not_started' and expires_at<=p_as_of returning *)
  insert into public.ai_budget_reservation_events(reservation_id,user_id,event_type,from_status,to_status,created_at,event_fingerprint) select reservation_id,user_id,'expired','reserved','expired',p_as_of,md5(reservation_id || ':expired:' || p_as_of::text) from changed on conflict do nothing;
  get diagnostics v_expired = row_count;
  with changed as (update public.ai_budget_reservations set status='reconciliation_required',provider_attempt_state='outcome_unknown',reconciliation_reason='reservation_expired_with_in_flight_attempt',updated_at=p_as_of where status='reserved' and provider_attempt_state='in_flight' and expires_at<=p_as_of returning *)
  insert into public.ai_budget_reservation_events(reservation_id,user_id,event_type,from_status,to_status,provider_attempt_id,reason,created_at,event_fingerprint) select reservation_id,user_id,'reconciliation_required','reserved','reconciliation_required',provider_attempt_id,reconciliation_reason,p_as_of,md5(reservation_id || ':reconciliation_required:' || p_as_of::text) from changed on conflict do nothing;
  get diagnostics v_reconcile = row_count;
  return jsonb_build_object('expiredCount',v_expired,'reconciliationRequiredCount',v_reconcile);
end; $$;

create view public.ai_budget_reservation_health_v1 with (security_invoker=true) as
select r.user_id,r.exam_profile_id,r.reservation_id,r.accounting_month,r.status,r.provider_attempt_state,r.provider_attempt_id,r.usage_event_id,r.estimated_try_max,r.actual_try_amount,
  case when r.status='reserved' and r.expires_at<now() then 'stuck_reservation'
       when r.status='reconciliation_required' then r.reconciliation_reason
       when r.status='settled' and r.actual_try_amount > r.estimated_try_max then 'actual_cost_exceeds_reservation'
       when r.usage_event_id is not null and r.status<>'settled' then 'usage_without_settlement'
       when r.provider_attempt_state in ('in_flight','completed','outcome_unknown') and r.usage_event_id is null then 'reservation_without_usage'
       else null end as issue,
  case when r.actual_try_amount is null then null else r.actual_try_amount-r.estimated_try_max end as estimated_actual_delta,
  r.created_at,r.expires_at,r.updated_at
from public.ai_budget_reservations r;

create view public.ai_monthly_user_cost_v1 with (security_invoker=true) as
with usage_cost as (select user_id,accounting_month,sum(try_estimated_cost) filter(where try_cost_state='known') as settled_try,count(*) filter(where try_cost_state<>'known') as unknown_usage_count from public.ai_usage_events group by user_id,accounting_month),
commitment as (select user_id,accounting_month,sum(estimated_try_max) filter(where status in ('reserved','reconciliation_required')) as active_reserved_try,count(*) filter(where status='reconciliation_required') as reconciliation_count from public.ai_budget_reservations group by user_id,accounting_month)
select coalesce(u.user_id,c.user_id) user_id,coalesce(u.accounting_month,c.accounting_month) accounting_month,coalesce(u.settled_try,0) settled_try,coalesce(c.active_reserved_try,0) active_reserved_try,coalesce(u.settled_try,0)+coalesce(c.active_reserved_try,0) committed_try,coalesce(u.unknown_usage_count,0) unknown_usage_count,coalesce(c.reconciliation_count,0) reconciliation_count
from usage_cost u full join commitment c on c.user_id=u.user_id and c.accounting_month=u.accounting_month;

create view public.ai_route_model_cost_distribution_v1 with (security_invoker=true) as
select user_id,accounting_month,route_catalog_version,provider,model_id,model_tier,count(*) attempt_count,sum(try_estimated_cost) filter(where try_cost_state='known') try_cost,count(*) filter(where try_cost_state<>'known') unknown_cost_count
from public.ai_usage_events group by user_id,accounting_month,route_catalog_version,provider,model_id,model_tier;

revoke all on public.ai_budget_reservation_health_v1,public.ai_monthly_user_cost_v1,public.ai_route_model_cost_distribution_v1 from public,anon,authenticated;
grant select on public.ai_budget_reservation_health_v1,public.ai_monthly_user_cost_v1,public.ai_route_model_cost_distribution_v1 to service_role;

revoke all on function public.reserve_ai_budget_v1(jsonb),public.mark_ai_budget_attempt_started_v1(jsonb),public.release_ai_budget_reservation_v1(jsonb),public.require_ai_budget_reconciliation_v1(jsonb),public.record_ai_usage_and_settle_reservation_v1(text,jsonb),public.expire_ai_budget_reservations_v1(timestamptz) from public,anon,authenticated;
grant execute on function public.reserve_ai_budget_v1(jsonb),public.mark_ai_budget_attempt_started_v1(jsonb),public.release_ai_budget_reservation_v1(jsonb),public.require_ai_budget_reconciliation_v1(jsonb),public.record_ai_usage_and_settle_reservation_v1(text,jsonb),public.expire_ai_budget_reservations_v1(timestamptz) to service_role;

comment on table public.ai_budget_reservations is 'Server-owned user-month AI provider budget reservations. No raw prompt, evidence, conversation, or CoachContext.';
comment on table public.ai_budget_reservation_events is 'Append-only AI budget reservation lifecycle audit without raw Coach content.';

commit;
