begin;
-- Forward S1-B closure: strict work type and commitment-adjusted readiness. No data rewrite.
create or replace function kpss_s0_private.initial_plan_readiness(p_input jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare r jsonb:='[]'; warnings jsonb:='[]'; sources jsonb; days jsonb:='{}'; manual_days jsonb; common_days jsonb; budget integer:=0; d record; v_week date:=(p_input->>'weekStart')::date; v_today date:=(p_input->>'today')::date; current_week date; c jsonb; day_need integer;
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
   select coalesce(sum(greatest(0,(t->>'estimated_minutes')::integer-coalesce((select (p->>'completed_minutes')::integer from jsonb_array_elements(p_input->'progress') p where p->>'task_id'=t->>'id'),0))),0)::integer into day_need from jsonb_array_elements(p_input->'tasks') t where t->>'planned_date'=d.key and d.key>=p_input->>'today' and t->>'status' not in ('completed','cancelled','missed');
   days:=days||jsonb_build_object(d.key,case when d.key<(p_input#>>'{profile,preparation_start_date}') or d.key>(p_input#>>'{profile,target_exam_date}') then 0 else greatest(0,least(d.n,(common_days->>d.key)::integer)-day_need) end);
  end loop;
  select least(coalesce(sum(value::integer),0)::integer,greatest(0,(c->>'weeklyBudgetMinutes')::integer-(c->>'committedMinutes')::integer)) into budget from jsonb_each_text(days);
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

create or replace function kpss_s0_private.initial_plan_preview(p_input jsonb,p_blocks jsonb)
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
  elsif jsonb_typeof(b->'workMode') is distinct from 'string' or not coalesce((res->'workModes') ? (b->>'workMode'),false) then errors:=errors||jsonb_build_array(jsonb_build_object('block',i,'field','workMode','code','INVALID_WORK_MODE')); valid:=false; end if;
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

notify pgrst,'reload schema';
commit;
