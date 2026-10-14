begin;

-- S1-B: human-authored initial plan only. No existing rows or legacy writers change.
create role kpss_initial_plan_writer nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
grant kpss_initial_plan_writer to postgres;
grant usage,create on schema public to kpss_initial_plan_writer;
grant usage on schema kpss_s0_private to kpss_initial_plan_writer;
grant execute on function public.availability_actor_uid() to kpss_initial_plan_writer;

create table public.initial_manual_plan_receipts (
 user_id uuid not null,
 exam_profile_id uuid not null,
 operation_id uuid not null,
 payload_hash text not null,
 request_hash text not null,
 weekly_plan_id uuid not null,
 result jsonb not null,
 created_at timestamptz not null default now(),
 primary key(user_id,exam_profile_id,operation_id),
 foreign key(exam_profile_id,user_id) references public.exam_profiles(id,user_id),
 foreign key(weekly_plan_id,user_id,exam_profile_id) references public.weekly_plans(id,user_id,exam_profile_id),
 unique(exam_profile_id),
 check(length(payload_hash)=64 and length(request_hash)=64)
);
alter table public.initial_manual_plan_receipts enable row level security;
revoke all on public.initial_manual_plan_receipts from public,anon,authenticated,service_role;
grant select on public.initial_manual_plan_receipts to authenticated,service_role,kpss_initial_plan_writer;
grant insert on public.initial_manual_plan_receipts to kpss_initial_plan_writer;
create policy initial_receipt_read on public.initial_manual_plan_receipts for select to authenticated,kpss_initial_plan_writer using(user_id=public.availability_actor_uid());
create policy initial_receipt_insert on public.initial_manual_plan_receipts for insert to kpss_initial_plan_writer with check(user_id=public.availability_actor_uid());

-- The new role can only activate an owned draft and INSERT new plan work.
grant update(id,status) on public.exam_profiles to kpss_initial_plan_writer;
create policy initial_profile_lock on public.exam_profiles for update to kpss_initial_plan_writer using(user_id=public.availability_actor_uid()) with check(user_id=public.availability_actor_uid());
grant insert on public.weekly_plans,public.tasks,public.task_progress to kpss_initial_plan_writer;
do $$ declare t text; begin
 foreach t in array array['exam_profiles','user_subjects','resources','weekly_availability','calendar_periods','schedule_exceptions','p48_strategy_profiles','p48_resource_targets','p48_daily_capacity_overrides','p48_week_capacity_overrides','study_sessions','study_session_allocations','weekly_plans','tasks','task_progress','study_capacity_preferences','revision_schedules','topic_progress','task_carryovers'] loop
  execute format('grant select on public.%I to kpss_initial_plan_writer',t);
  execute format('create policy initial_owned_read on public.%I for select to kpss_initial_plan_writer using(user_id=public.availability_actor_uid())',t);
 end loop;
 foreach t in array array['weekly_plans','tasks','task_progress'] loop
  execute format('create policy initial_owned_insert on public.%I for insert to kpss_initial_plan_writer with check(user_id=public.availability_actor_uid())',t);
 end loop;
 foreach t in array array['exams','exam_editions','exam_subjects','subjects','curriculum_nodes'] loop
  execute format('grant select on public.%I to kpss_initial_plan_writer',t);
  execute format('create policy initial_catalog_read on public.%I for select to kpss_initial_plan_writer using(true)',t);
  -- PostgreSQL row-share locks require an UPDATE column privilege; no callable body updates catalogs.
  execute format('grant update(id) on public.%I to kpss_initial_plan_writer',t);
  execute format('create policy initial_catalog_lock on public.%I for update to kpss_initial_plan_writer using(true) with check(true)',t);
 end loop;
 foreach t in array array['resource_units','resource_sections'] loop
  execute format('grant select on public.%I to kpss_initial_plan_writer',t);
  execute format('create policy initial_material_read on public.%I for select to kpss_initial_plan_writer using(exists(select 1 from public.resources r where r.id=resource_id and r.user_id=public.availability_actor_uid()))',t);
 end loop;
end $$;
grant execute on function kpss_s0_private.capacity_source(uuid),kpss_s0_private.capacity_read_inputs(uuid,date),kpss_s0_private.capacity_readiness(jsonb),kpss_s0_private.day_capacities(jsonb,text),kpss_s0_private.weekly_remaining_budget(jsonb),kpss_s0_private.planning_inputs(uuid,date),kpss_s0_private.validate_plan_delta(jsonb,jsonb,boolean),kpss_s0_private.lock_planning_profile() to kpss_initial_plan_writer;

create function kpss_s0_private.initial_plan_inputs(p_profile uuid,p_week date)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v jsonb; u uuid:=public.availability_actor_uid();
begin
 v:=kpss_s0_private.capacity_read_inputs(p_profile,p_week);
 return v||jsonb_build_object(
  'subjects',(select coalesce(jsonb_agg(to_jsonb(us)||jsonb_build_object('name',s.name,'catalogActive',s.is_active) order by us.subject_id),'[]') from public.user_subjects us join public.subjects s on s.id=us.subject_id where us.user_id=u and us.exam_profile_id=p_profile),
  'resources',(select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]') from public.resources r where user_id=u and exam_profile_id=p_profile),
  'exam',(select to_jsonb(e)||jsonb_build_object('examCode',x.code,'examActive',x.is_active) from public.exam_editions e join public.exams x on x.id=e.exam_id where e.id=(v#>>'{profile,exam_edition_id}')::uuid),
  'examSubjects',(select coalesce(jsonb_agg(to_jsonb(s) order by s.subject_id),'[]') from public.exam_subjects s join public.exam_editions e on e.exam_id=s.exam_id where e.id=(v#>>'{profile,exam_edition_id}')::uuid),
  'allPlans',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.weekly_plans t where user_id=u and exam_profile_id=p_profile),
  'allCommitments',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.tasks t where user_id=u and exam_profile_id=p_profile and status not in ('completed','cancelled','missed')),
  'otherActiveProfile',exists(select 1 from public.exam_profiles where user_id=u and status='active' and id<>p_profile));
end $$;

create function kpss_s0_private.initial_plan_modes(p_type text)
returns jsonb language sql immutable security invoker set search_path='' as $$
 select case p_type
  when 'book' then '["book","questions","review"]'::jsonb
  when 'question_bank' then '["questions","review"]'::jsonb
  when 'video_course' then '["video","review"]'::jsonb
  when 'notes' then '["notes","review"]'::jsonb
  when 'mock_book' then '["mock","review"]'::jsonb
  else '[]'::jsonb end;
$$;

create function kpss_s0_private.initial_plan_readiness(p_input jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare r jsonb:='[]'; warnings jsonb:='[]'; sources jsonb; days jsonb:='{}'; manual_days jsonb; common_days jsonb; budget integer:=0; d record; v_week date:=(p_input->>'weekStart')::date; v_today date:=(p_input->>'today')::date; current_week date; c jsonb;
begin
 current_week:=v_today-(extract(isodow from v_today)::integer-1);
 if v_week not in (current_week,current_week+7) then r:=r||'"UNSUPPORTED_WEEK"'::jsonb; end if;
 if p_input#>>'{profile,target_exam_date}' is null or (p_input#>>'{profile,target_exam_date}')::date<v_today
  or jsonb_array_length(p_input->'subjects')=0 or (p_input->>'otherActiveProfile')::boolean then r:=r||'"PROFILE_INCOMPLETE"'::jsonb; end if;
 if p_input#>>'{exam,status}' not in ('upcoming','active') or p_input#>>'{exam,examActive}' is distinct from 'true'
  or not exists(select 1 from jsonb_array_elements(p_input->'examSubjects'))
  or exists(select 1 from jsonb_array_elements(p_input->'subjects') s where s->>'status'='active' and (s->>'catalogActive' is distinct from 'true' or not exists(select 1 from jsonb_array_elements(p_input->'examSubjects') es where es->>'subject_id'=s->>'subject_id')))
 then r:=r||'"UNSUPPORTED_EXAM"'::jsonb; end if;
 if not exists(select 1 from jsonb_array_elements(p_input->'subjects') where value->>'status'='active') then r:=r||'"PROFILE_INCOMPLETE"'::jsonb; end if;
 if jsonb_array_length(p_input->'allPlans')>0 then r:=r||'"PLAN_ALREADY_EXISTS"'::jsonb; end if;
 if jsonb_array_length(p_input->'allCommitments')>0 then r:=r||'"PROTECTED_COMMITMENT_EXISTS"'::jsonb; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',res->'id','subjectId',res->'subject_id','name',res->'name','resourceType',res->'resource_type','workModes',kpss_s0_private.initial_plan_modes(res->>'resource_type'),'subjectName',s->'name') order by res->>'id'),'[]') into sources
 from jsonb_array_elements(p_input->'resources') res join jsonb_array_elements(p_input->'subjects') s on s->>'subject_id'=res->>'subject_id'
 where res->>'status'='active' and s->>'status'='active' and jsonb_array_length(kpss_s0_private.initial_plan_modes(res->>'resource_type'))>0;
 if jsonb_array_length(sources)=0 then r:=r||'"MISSING_SUITABLE_RESOURCE"'::jsonb; end if;
 select coalesce(jsonb_agg(jsonb_build_object('subjectId',s->'subject_id','name',s->'name')),'[]') into warnings from jsonb_array_elements(p_input->'subjects') s where s->>'status'='active' and not exists(select 1 from jsonb_array_elements(sources) x where x->>'subjectId'=s->>'subject_id');
 begin
  c:=kpss_s0_private.capacity_readiness(p_input);
  if c->>'status'='CAPACITY_TIMED_EXCEPTION_UNSUPPORTED' then raise exception 'CAPACITY_TIMED_EXCEPTION_UNSUPPORTED'; end if;
  manual_days:=kpss_s0_private.day_capacities(p_input,'manual'); common_days:=c->'dayCapacities';
  -- Preserve both manual actual-duration policy and the final R2 planned-credit ceiling.
  for d in select key,value::integer n from jsonb_each_text(manual_days) loop
   days:=days||jsonb_build_object(d.key,case when d.key<(p_input#>>'{profile,preparation_start_date}') or d.key>(p_input#>>'{profile,target_exam_date}') then 0 else least(d.n,(common_days->>d.key)::integer) end);
  end loop;
  select least(coalesce(sum(value::integer),0)::integer,(c->>'weeklyBudgetMinutes')::integer) into budget from jsonb_each_text(days);
  if (c->>'weeklyGrossMinutes')::integer=0 then r:=r||'"MISSING_CAPACITY"'::jsonb;
  elsif budget=0 then r:=r||'"NO_REMAINING_CAPACITY"'::jsonb; end if;
 exception when raise_exception then
  if sqlerrm<>'CAPACITY_TIMED_EXCEPTION_UNSUPPORTED' then raise; end if;
  r:=r||'"CAPACITY_TIMED_EXCEPTION_UNSUPPORTED"'::jsonb; days:='{}'; budget:=0;
 end;
 return jsonb_build_object('contractVersion','initial-manual-plan-v1','capabilityVersion',1,'profileId',p_input#>'{profile,id}','weekStartDate',v_week,'currentWeek',current_week,'nextWeek',current_week+7,'today',v_today,'timezone','Europe/Istanbul',
  'configurationRevision',encode(sha256(convert_to(p_input::text,'UTF8')),'hex'),'mode',p_input#>'{capacitySource,mode}','ready',jsonb_array_length(r)=0,'reasons',r,'subjectsWithoutSources',warnings,'resources',sources,'days',days,'weeklyBudgetMinutes',budget,
  'existingPlan',p_input->'allPlans'->0);
end $$;

create function public.initial_manual_plan_readiness(p_exam_profile_id uuid,p_week_start date)
returns jsonb language sql stable security invoker set search_path='' as $$
 select kpss_s0_private.initial_plan_readiness(kpss_s0_private.initial_plan_inputs(p_exam_profile_id,p_week_start));
$$;

create function kpss_s0_private.initial_plan_preview(p_input jsonb,p_blocks jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare ready jsonb:=kpss_s0_private.initial_plan_readiness(p_input); errors jsonb:='[]'; normalized jsonb:='[]'; totals jsonb:='{}'; b jsonb; res jsonb; i integer:=0; n integer; total integer:=0; dt date; valid boolean; hash text;
begin
 if jsonb_typeof(p_blocks) is distinct from 'array' then raise exception 'INVALID_INITIAL_PLAN_PAYLOAD'; end if;
 if jsonb_array_length(p_blocks) not between 1 and 100 then errors:=errors||jsonb_build_array(jsonb_build_object('field','blocks','code','BLOCKS_REQUIRED')); end if;
 for b in select value from jsonb_array_elements(p_blocks) loop
  valid:=true; res:=null;
  if jsonb_typeof(b) is distinct from 'object' or not(b ?& array['plannedDate','subjectId','resourceId','workMode','estimatedMinutes','detail']) then
   errors:=errors||jsonb_build_array(jsonb_build_object('block',i,'field','block','code','INVALID_BLOCK')); i:=i+1; continue;
  end if;
  if exists(select 1 from jsonb_object_keys(b) k where k not in ('plannedDate','subjectId','resourceId','workMode','estimatedMinutes','detail')) then
   errors:=errors||jsonb_build_array(jsonb_build_object('block',i,'field','block','code','UNSUPPORTED_FIELD')); valid:=false;
  end if;
  select value into res from jsonb_array_elements(ready->'resources') where value->>'id'=b->>'resourceId' and value->>'subjectId'=b->>'subjectId';
  if res is null then errors:=errors||jsonb_build_array(jsonb_build_object('block',i,'field','resourceId','code','INVALID_RESOURCE')); valid:=false;
  elsif not((res->'workModes') ? (b->>'workMode')) then errors:=errors||jsonb_build_array(jsonb_build_object('block',i,'field','workMode','code','INVALID_WORK_MODE')); valid:=false; end if;
  if jsonb_typeof(b->'estimatedMinutes') is distinct from 'number' or (b->>'estimatedMinutes') !~ '^[0-9]{1,3}$' then n:=0; else n:=(b->>'estimatedMinutes')::integer; end if;
  if n not between 1 and 480 then errors:=errors||jsonb_build_array(jsonb_build_object('block',i,'field','estimatedMinutes','code','INVALID_MINUTES')); valid:=false; end if;
  begin
   if jsonb_typeof(b->'plannedDate') is distinct from 'string' or (b->>'plannedDate') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'bad date'; end if;
   dt:=(b->>'plannedDate')::date;
   if dt not between (p_input->>'weekStart')::date and (p_input->>'weekStart')::date+6 or dt<(p_input->>'today')::date or dt<(p_input#>>'{profile,preparation_start_date}')::date or dt>(p_input#>>'{profile,target_exam_date}')::date then raise exception 'bad date'; end if;
  exception when others then errors:=errors||jsonb_build_array(jsonb_build_object('block',i,'field','plannedDate','code','INVALID_DATE')); valid:=false; end;
  if jsonb_typeof(b->'detail') is distinct from 'string' or length(b->>'detail')>500 then errors:=errors||jsonb_build_array(jsonb_build_object('block',i,'field','detail','code','INVALID_DETAIL')); valid:=false; end if;
  if valid then
   normalized:=normalized||jsonb_build_array(b||jsonb_build_object('detail',btrim(b->>'detail')));
   totals:=totals||jsonb_build_object(dt::text,coalesce((totals->>dt::text)::integer,0)+n); total:=total+n;
  end if; i:=i+1;
 end loop;
 for b in select jsonb_build_object('date',key,'minutes',value) from jsonb_each(totals) loop
  if (b->>'minutes')::integer>coalesce((ready->'days'->>(b->>'date'))::integer,0) then errors:=errors||jsonb_build_array(jsonb_build_object('field','plannedDate','date',b->'date','code','OVER_DAY_CAPACITY')); end if;
 end loop;
 if total>(ready->>'weeklyBudgetMinutes')::integer then errors:=errors||jsonb_build_array(jsonb_build_object('field','blocks','code','OVER_WEEK_CAPACITY')); end if;
 hash:=encode(sha256(convert_to(jsonb_build_object('contractVersion','initial-manual-plan-v1','profileId',p_input#>'{profile,id}','weekStartDate',p_input->'weekStart','blocks',normalized)::text,'UTF8')),'hex');
 return ready||jsonb_build_object('valid',(ready->>'ready')::boolean and jsonb_array_length(errors)=0,'errors',errors,'blocks',normalized,'dayTotals',totals,'totalMinutes',total,'reviewedPayloadHash',hash);
end $$;

create function public.preview_initial_manual_plan(p_exam_profile_id uuid,p_week_start date,p_blocks jsonb)
returns jsonb language sql stable security invoker set search_path='' as $$
 select kpss_s0_private.initial_plan_preview(kpss_s0_private.initial_plan_inputs(p_exam_profile_id,p_week_start),p_blocks);
$$;

create function public.create_initial_manual_plan(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=public.availability_actor_uid(); p uuid; op uuid; w date; receipt public.initial_manual_plan_receipts; input jsonb; review jsonb; plan public.weekly_plans; t public.tasks; b jsonb; ids jsonb:='[]'; result jsonb; request_hash text; title text;
begin
 if u is null then raise exception 'UNAUTHORIZED'; end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('intent','contractVersion','capabilityVersion','profileId','operationId','weekStartDate','expectedConfigurationRevision','reviewedPayloadHash','blocks'))
  or not(p_payload ?& array['intent','contractVersion','capabilityVersion','profileId','operationId','weekStartDate','expectedConfigurationRevision','reviewedPayloadHash','blocks']) then raise exception 'INVALID_INITIAL_PLAN_PAYLOAD'; end if;
 if p_payload->>'intent' is distinct from 'create_initial_manual_plan' or p_payload->>'contractVersion' is distinct from 'initial-manual-plan-v1' or p_payload->'capabilityVersion' is distinct from '1'::jsonb then raise exception 'INITIAL_PLAN_UNAVAILABLE'; end if;
 p:=(p_payload->>'profileId')::uuid; op:=(p_payload->>'operationId')::uuid; w:=(p_payload->>'weekStartDate')::date;
 if p is null or op is null or w is null then raise exception 'INVALID_INITIAL_PLAN_PAYLOAD'; end if;
 -- Serialize same-actor activation attempts, then use the existing profile-first protocol.
 perform pg_advisory_xact_lock(hashtextextended(u::text,18000));
 perform 1 from public.exam_profiles where id=p and user_id=u and status in ('draft','active') for update;
 if not found then raise exception 'EXAM_PROFILE_NOT_FOUND'; end if;
 request_hash:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
 select * into receipt from public.initial_manual_plan_receipts where user_id=u and exam_profile_id=p and operation_id=op;
 if found then
  if receipt.request_hash<>request_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return receipt.result;
 end if;
 -- Catalog edits do not use profile locks. Hold matching catalog rows while revalidating.
 perform 1 from public.exam_editions e join public.exams x on x.id=e.exam_id join public.exam_profiles ep on ep.exam_edition_id=e.id where ep.id=p for share of e,x;
 perform 1 from public.subjects s join public.user_subjects us on us.subject_id=s.id where us.exam_profile_id=p and us.user_id=u for share of s;
 perform 1 from public.exam_subjects es join public.exam_editions e on e.exam_id=es.exam_id join public.exam_profiles ep on ep.exam_edition_id=e.id where ep.id=p for share of es;
 input:=kpss_s0_private.initial_plan_inputs(p,w);
 review:=kpss_s0_private.initial_plan_preview(input,p_payload->'blocks');
 if review->'reasons' ? 'PLAN_ALREADY_EXISTS' then raise exception 'PLAN_ALREADY_EXISTS'; end if;
 if review->'reasons' ? 'PROTECTED_COMMITMENT_EXISTS' then raise exception 'PROTECTED_COMMITMENT_EXISTS'; end if;
 if review->>'configurationRevision' is distinct from p_payload->>'expectedConfigurationRevision' then raise exception 'FIRST_PLAN_STALE'; end if;
 if review->>'reviewedPayloadHash' is distinct from p_payload->>'reviewedPayloadHash' then raise exception 'REVIEW_PAYLOAD_MISMATCH'; end if;
 if not (review->>'valid')::boolean then raise exception 'FIRST_PLAN_NOT_READY'; end if;
 update public.exam_profiles set status='active' where id=p and user_id=u and status='draft';
 insert into public.weekly_plans(user_id,exam_profile_id,week_start_date,week_end_date,available_minutes,planning_budget_minutes,planned_minutes,status,generation_version)
 values(u,p,w,w+6,(review->>'weeklyBudgetMinutes')::integer,(review->>'weeklyBudgetMinutes')::integer,(review->>'totalMinutes')::integer,'active',1) returning * into plan;
 for b in select value from jsonb_array_elements(review->'blocks') loop
  select s.name||' · '||case b->>'workMode' when 'book' then 'Kitap çalışması' when 'video' then 'Video çalışması' when 'questions' then 'Soru çözümü' when 'notes' then 'Not çalışması' when 'mock' then 'Deneme' else 'Tekrar' end into title from public.subjects s where s.id=(b->>'subjectId')::uuid;
  insert into public.tasks(user_id,exam_profile_id,weekly_plan_id,subject_id,resource_id,task_type,work_mode,title,description,planned_date,estimated_minutes,importance,priority_score,status,source_reason,dedupe_key)
  values(u,p,plan.id,(b->>'subjectId')::uuid,(b->>'resourceId')::uuid,'custom',b->>'workMode',title,nullif(b->>'detail',''),(b->>'plannedDate')::date,(b->>'estimatedMinutes')::integer,'important',60,'ready','manual','initial|'||op::text||'|'||jsonb_array_length(ids)::text) returning * into t;
  insert into public.task_progress(task_id,user_id,completed_minutes,actual_study_minutes) values(t.id,u,0,0);
  ids:=ids||jsonb_build_array(t.id);
 end loop;
 perform kpss_s0_private.validate_plan_delta(input,kpss_s0_private.planning_inputs(p,w));
 result:=jsonb_build_object('contractVersion','initial-manual-plan-v1','operationId',op,'profileId',p,'weeklyPlanId',plan.id,'taskIds',ids,'weekStartDate',w,'blocks',review->'blocks','dayTotals',review->'dayTotals','totalMinutes',review->'totalMinutes','created',true);
 insert into public.initial_manual_plan_receipts(user_id,exam_profile_id,operation_id,payload_hash,request_hash,weekly_plan_id,result) values(u,p,op,review->>'reviewedPayloadHash',request_hash,plan.id,result);
 return result;
end $$;

create function public.initial_manual_plan_operation(p_exam_profile_id uuid,p_operation_id uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare r jsonb;
begin
 if public.availability_actor_uid() is null then raise exception 'UNAUTHORIZED'; end if;
 perform 1 from public.exam_profiles where id=p_exam_profile_id and user_id=public.availability_actor_uid();
 if not found then raise exception 'EXAM_PROFILE_NOT_FOUND'; end if;
 select result into r from public.initial_manual_plan_receipts where exam_profile_id=p_exam_profile_id and user_id=public.availability_actor_uid() and operation_id=p_operation_id;
 return jsonb_build_object('contractVersion','initial-manual-plan-v1','outcome',case when r is null then 'unknown' else 'committed' end,'result',r);
end $$;

alter function public.create_initial_manual_plan(jsonb) owner to kpss_initial_plan_writer;
revoke create on schema public from kpss_initial_plan_writer;
revoke all on function public.create_initial_manual_plan(jsonb),public.initial_manual_plan_readiness(uuid,date),public.preview_initial_manual_plan(uuid,date,jsonb),public.initial_manual_plan_operation(uuid,uuid) from public,anon;
grant execute on function public.create_initial_manual_plan(jsonb),public.initial_manual_plan_readiness(uuid,date),public.preview_initial_manual_plan(uuid,date,jsonb),public.initial_manual_plan_operation(uuid,uuid) to authenticated,service_role;
revoke all on function kpss_s0_private.initial_plan_inputs(uuid,date),kpss_s0_private.initial_plan_modes(text),kpss_s0_private.initial_plan_readiness(jsonb),kpss_s0_private.initial_plan_preview(jsonb,jsonb) from public,anon;
grant execute on function kpss_s0_private.initial_plan_inputs(uuid,date),kpss_s0_private.initial_plan_modes(text),kpss_s0_private.initial_plan_readiness(jsonb),kpss_s0_private.initial_plan_preview(jsonb,jsonb) to authenticated,service_role,kpss_initial_plan_writer;
notify pgrst,'reload schema';
commit;
