begin;

create table public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  event_version text not null,
  provider_attempt_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_profile_id uuid null,
  capability text not null,
  request_id text not null,
  correlation_id text not null,
  route_version text not null,
  route_catalog_version text not null,
  route_reason_code text not null,
  provider text not null,
  model_id text not null,
  model_tier text not null,
  pricing_version text not null,
  usage_availability text not null,
  input_tokens integer null,
  cached_input_tokens integer null,
  output_tokens integer null,
  total_tokens integer null,
  usage_source text not null,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  latency_ms integer not null,
  status text not null,
  retry_number integer not null,
  fallback_from_attempt_id text null,
  error_category text not null,
  native_cost_state text not null,
  native_cost_amount numeric(20,9) null,
  native_currency text null,
  native_cost_reason text null,
  uncached_input_cost numeric(20,9) null,
  cached_input_cost numeric(20,9) null,
  output_cost numeric(20,9) null,
  try_cost_state text not null,
  try_estimated_cost numeric(20,6) null,
  try_cost_reason text null,
  fx_policy_version text null,
  fx_snapshot_version text null,
  fx_source text null,
  fx_source_kind text null,
  fx_base_currency text null,
  fx_quote_currency text null,
  fx_rate numeric(20,9) null,
  fx_effective_at timestamptz null,
  accounting_month text not null,
  event_fingerprint text not null,
  created_at timestamptz not null default now(),
  constraint ai_usage_events_profile_owner_fk
    foreign key(exam_profile_id,user_id)
    references public.exam_profiles(id,user_id) on delete cascade,
  constraint ai_usage_events_attempt_unique unique(provider_attempt_id),
  constraint ai_usage_events_version_valid check(event_version = 'ai-usage-event-v1'),
  constraint ai_usage_events_identity_valid check(
    btrim(provider_attempt_id) <> '' and btrim(request_id) <> '' and btrim(correlation_id) <> ''
  ),
  constraint ai_usage_events_tier_valid check(model_tier in ('economy','standard','strong')),
  constraint ai_usage_events_usage_valid check(
    (usage_availability = 'reported'
      and input_tokens >= 0 and cached_input_tokens >= 0 and cached_input_tokens <= input_tokens
      and output_tokens >= 0 and total_tokens = input_tokens + output_tokens
      and usage_source = 'provider_response')
    or
    (usage_availability = 'unavailable'
      and input_tokens is null and cached_input_tokens is null and output_tokens is null and total_tokens is null
      and usage_source = 'provider_usage_unavailable')
  ),
  constraint ai_usage_events_execution_valid check(
    completed_at >= started_at
    and latency_ms = floor(extract(epoch from (completed_at - started_at)) * 1000)::integer
    and retry_number >= 0
    and status in ('succeeded','failed','timeout','cancelled')
    and error_category in ('none','timeout','rate_limit','provider_unavailable','invalid_response','unknown')
    and ((status = 'succeeded') = (error_category = 'none'))
  ),
  constraint ai_usage_events_native_cost_valid check(
    (native_cost_state = 'known'
      and native_cost_amount >= 0 and native_currency is not null and native_cost_reason is null
      and uncached_input_cost >= 0 and cached_input_cost >= 0 and output_cost >= 0
      and native_cost_amount = uncached_input_cost + cached_input_cost + output_cost)
    or
    (native_cost_state = 'unpriced'
      and native_cost_amount is null and uncached_input_cost is null and cached_input_cost is null and output_cost is null
      and native_cost_reason in ('pricing_entry_unavailable','authoritative_production_pricing_unavailable','cached_input_price_unavailable','usage_unavailable'))
  ),
  constraint ai_usage_events_try_cost_valid check(
    (try_cost_state = 'known'
      and native_cost_state = 'known' and try_estimated_cost >= 0 and try_cost_reason is null
      and fx_policy_version is not null and fx_snapshot_version is not null and fx_source is not null
      and fx_source_kind in ('test_fixture','authoritative_config') and fx_base_currency = native_currency
      and fx_quote_currency = 'TRY' and fx_rate > 0 and fx_effective_at is not null
      and abs(try_estimated_cost - round(native_cost_amount * fx_rate,6)) <= 0.000001)
    or
    (try_cost_state = 'unknown'
      and try_estimated_cost is null
      and try_cost_reason in ('native_cost_unpriced','fx_snapshot_unavailable','authoritative_production_fx_unavailable','fx_currency_mismatch'))
  ),
  constraint ai_usage_events_month_valid check(
    accounting_month ~ '^\d{4}-\d{2}$'
    and accounting_month = to_char(completed_at at time zone 'Europe/Istanbul','YYYY-MM')
  ),
  constraint ai_usage_events_fingerprint_valid check(btrim(event_fingerprint) <> '')
);

create index ai_usage_events_user_month_idx
on public.ai_usage_events(user_id,accounting_month,completed_at,id);

create index ai_usage_events_profile_month_idx
on public.ai_usage_events(user_id,exam_profile_id,accounting_month,completed_at,id)
where exam_profile_id is not null;

create or replace function public.reject_ai_usage_event_mutation_v1()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  raise exception 'AI_USAGE_EVENT_IMMUTABLE';
end;
$$;

create trigger ai_usage_events_immutable
before update or delete on public.ai_usage_events
for each row execute function public.reject_ai_usage_event_mutation_v1();

revoke all on function public.reject_ai_usage_event_mutation_v1() from public,anon,authenticated,service_role;

alter table public.ai_usage_events enable row level security;
revoke all on public.ai_usage_events from public,anon,authenticated;
grant select on public.ai_usage_events to authenticated;
grant select on public.ai_usage_events to service_role;

create policy ai_usage_events_select_own
on public.ai_usage_events
for select to authenticated
using((select auth.uid()) = user_id);

create or replace function public.record_ai_usage_event_v1(p_event jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_allowed constant text[] := array[
    'event_version','provider_attempt_id','user_id','exam_profile_id','capability','request_id','correlation_id',
    'route_version','route_catalog_version','route_reason_code','provider','model_id','model_tier','pricing_version',
    'usage_availability','input_tokens','cached_input_tokens','output_tokens','total_tokens','usage_source',
    'started_at','completed_at','latency_ms','status','retry_number','fallback_from_attempt_id','error_category',
    'native_cost_state','native_cost_amount','native_currency','native_cost_reason','uncached_input_cost','cached_input_cost','output_cost',
    'try_cost_state','try_estimated_cost','try_cost_reason','fx_policy_version','fx_snapshot_version','fx_source','fx_source_kind',
    'fx_base_currency','fx_quote_currency','fx_rate','fx_effective_at','accounting_month'
  ];
  v_fingerprint text;
  v_existing public.ai_usage_events;
  v_inserted public.ai_usage_events;
begin
  if current_user not in ('service_role','postgres') then raise exception 'FORBIDDEN'; end if;
  if p_event is null or jsonb_typeof(p_event) <> 'object' then raise exception 'AI_USAGE_EVENT_INVALID'; end if;
  if exists(select 1 from jsonb_object_keys(p_event) as item(key) where not (item.key = any(v_allowed))) then
    raise exception 'AI_USAGE_EVENT_UNKNOWN_FIELD';
  end if;
  if exists(select 1 from unnest(v_allowed) as item(key) where not (p_event ? item.key)) then
    raise exception 'AI_USAGE_EVENT_MISSING_FIELD';
  end if;
  if not exists(
    select 1 from public.exam_profiles p
    where p.id = nullif(p_event->>'exam_profile_id','')::uuid
      and p.user_id = (p_event->>'user_id')::uuid
  ) and nullif(p_event->>'exam_profile_id','') is not null then
    raise exception 'AI_USAGE_EVENT_PROFILE_NOT_OWNED';
  end if;

  v_fingerprint := md5(p_event::text);
  perform pg_advisory_xact_lock(hashtextextended(p_event->>'provider_attempt_id',63));
  select * into v_existing
  from public.ai_usage_events
  where provider_attempt_id = p_event->>'provider_attempt_id';
  if found then
    if v_existing.event_fingerprint <> v_fingerprint then raise exception 'AI_USAGE_ATTEMPT_CONFLICT'; end if;
    return jsonb_build_object('eventId',v_existing.id,'providerAttemptId',v_existing.provider_attempt_id,'idempotent',true);
  end if;

  insert into public.ai_usage_events(
    event_version,provider_attempt_id,user_id,exam_profile_id,capability,request_id,correlation_id,
    route_version,route_catalog_version,route_reason_code,provider,model_id,model_tier,pricing_version,
    usage_availability,input_tokens,cached_input_tokens,output_tokens,total_tokens,usage_source,
    started_at,completed_at,latency_ms,status,retry_number,fallback_from_attempt_id,error_category,
    native_cost_state,native_cost_amount,native_currency,native_cost_reason,uncached_input_cost,cached_input_cost,output_cost,
    try_cost_state,try_estimated_cost,try_cost_reason,fx_policy_version,fx_snapshot_version,fx_source,fx_source_kind,
    fx_base_currency,fx_quote_currency,fx_rate,fx_effective_at,accounting_month,event_fingerprint
  ) values(
    p_event->>'event_version',p_event->>'provider_attempt_id',(p_event->>'user_id')::uuid,nullif(p_event->>'exam_profile_id','')::uuid,
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
    p_event->>'accounting_month',v_fingerprint
  ) returning * into v_inserted;

  return jsonb_build_object('eventId',v_inserted.id,'providerAttemptId',v_inserted.provider_attempt_id,'idempotent',false);
end;
$$;

revoke all on function public.record_ai_usage_event_v1(jsonb) from public,anon,authenticated;
grant execute on function public.record_ai_usage_event_v1(jsonb) to service_role;

comment on table public.ai_usage_events is
  'Append-only server-owned AI provider-attempt usage and versioned cost ledger. Stores no raw prompt, conversation, CoachContext, or secret.';

commit;
