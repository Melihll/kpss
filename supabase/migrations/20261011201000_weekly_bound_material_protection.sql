begin;

-- S1-C: one MVCC read snapshot. No writer role, table DML, profile activation or report persistence.
create or replace function public.weekly_study_view(p_exam_profile_id uuid,p_week_start date)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare
 u uuid:=public.availability_actor_uid(); input jsonb; all_plans jsonb; task_rows jsonb; days jsonb:='[]';
 today date:=(now() at time zone 'Europe/Istanbul')::date; current_week date; d date; historical boolean;
 declared_days jsonb:='{}'; gross_days jsonb; manual_days jsonb; credit_days jsonb; capacity_error text;
 src jsonb; windows int4multirange; win jsonb; n integer; gross_input jsonb; task_day jsonb;
 planned integer; credit integer; remaining integer; actual integer; extra integer; ledger_credit integer;
 active_count integer; completed_count integer; unknown_progress boolean; unknown_actual boolean;
 cap integer; free integer; declared integer; warnings jsonb:='[]'; notes jsonb; day_status text;
 sum_declared integer:=0; sum_effective integer:=0; sum_planned integer:=0; sum_credit integer:=0;
 sum_remaining integer:=0; sum_actual integer:=0; sum_extra integer:=0; sum_ledger integer:=0;
 sum_free integer:=0; sum_active integer:=0; sum_completed integer:=0; any_unknown_progress boolean:=false; any_unknown_actual boolean:=false;
 weekly_limit integer; weekly_remaining_limit integer; free_week integer; initial jsonb; next_initial jsonb;
 protected_work boolean; has_plan boolean; upcoming date; receipt jsonb; known_weeks jsonb; result jsonb;
begin
 if u is null then raise exception 'UNAUTHORIZED'; end if;
 input:=kpss_s0_private.capacity_read_inputs(p_exam_profile_id,p_week_start);
 current_week:=today-(extract(isodow from today)::integer-1); historical:=p_week_start<current_week;
 if p_week_start>current_week+7 or (historical and not exists(select 1 from public.weekly_plans where user_id=u and exam_profile_id=p_exam_profile_id and week_start_date=p_week_start)
  and not exists(select 1 from public.tasks where user_id=u and exam_profile_id=p_exam_profile_id and planned_date between p_week_start and p_week_start+6)) then raise exception 'UNSUPPORTED_WEEK'; end if;
 select coalesce(jsonb_agg(to_jsonb(p) order by week_start_date,id),'[]') into all_plans from public.weekly_plans p where user_id=u and exam_profile_id=p_exam_profile_id;
 has_plan:=jsonb_array_length(all_plans)>0;
 select exists(select 1 from public.tasks where user_id=u and exam_profile_id=p_exam_profile_id and status not in ('completed','cancelled','missed')) into protected_work;
 select coalesce(jsonb_agg(w order by w),'[]') into known_weeks from (select distinct date_trunc('week',v)::date w from (
  select week_start_date v from public.weekly_plans where user_id=u and exam_profile_id=p_exam_profile_id
  union select planned_date from public.tasks where user_id=u and exam_profile_id=p_exam_profile_id
 ) x where v<current_week) x;
 select to_jsonb(r) into receipt from public.initial_manual_plan_receipts r where user_id=u and exam_profile_id=p_exam_profile_id;
 select min(planned_date) into upcoming from public.tasks where user_id=u and exam_profile_id=p_exam_profile_id and planned_date>today and status not in ('completed','cancelled','missed');
 src:=input->'capacitySource';
 for i in 1..7 loop
  if src->>'mode'='daily_minutes' then
   select (value->>'minutes')::integer into n from jsonb_array_elements(src->'days') where (value->>'weekday')::integer=i;
  else
   windows:='{}'::int4multirange;
   for win in select value from jsonb_array_elements(input->'availability') where (value->>'is_active')::boolean and (value->>'weekday')::integer=i loop
    windows:=windows+int4multirange(int4range((extract(epoch from (win->>'start_time')::time)/60)::integer,(extract(epoch from (win->>'end_time')::time)/60)::integer,'[)'));
   end loop;
   select coalesce(sum(upper(r)-lower(r)),0)::integer into n from unnest(windows) r;
  end if;
  declared_days:=declared_days||jsonb_build_object(i::text,coalesce(n,0));
 end loop;
 -- Effective supply excludes earned credit/actual; remaining authoring time preserves both existing policies.
 gross_input:=jsonb_set(jsonb_set(input,'{sessions}','[]'),'{allocations}','[]');
 begin
  gross_days:=kpss_s0_private.day_capacities(gross_input,'p48');
  manual_days:=kpss_s0_private.day_capacities(input,'manual');
  credit_days:=kpss_s0_private.day_capacities(input,'p48');
  weekly_remaining_limit:=kpss_s0_private.weekly_remaining_budget(input);
 exception when raise_exception then
  if sqlerrm<>'CAPACITY_TIMED_EXCEPTION_UNSUPPORTED' then raise; end if;
  capacity_error:=sqlerrm;
 end;
 select min((value->>'planning_budget_minutes')::integer) into weekly_limit from jsonb_array_elements(input->'weekOverrides');
 select coalesce(jsonb_agg(to_jsonb(t)||jsonb_build_object(
   'subjects',case when s.id is null then null else jsonb_build_object('id',s.id,'name',s.name) end,
   'resources',case when r.id is null then null else jsonb_build_object('id',r.id,'name',r.name,'resource_type',r.resource_type,'status',r.status) end,
   'task_progress',case when p.task_id is null then '[]'::jsonb else jsonb_build_array(to_jsonb(p)) end,
   'plannedCreditMinutes',case when p.task_id is null then null else least(t.estimated_minutes,greatest(0,p.completed_minutes)) end,
   'remainingPlannedMinutes',case when t.status in ('completed','cancelled','missed') then 0 when p.task_id is null then null else greatest(0,t.estimated_minutes-p.completed_minutes) end,
   'protected',exists(select 1 from public.task_resource_units l where l.task_id=t.id and l.user_id=u) or t.source_reason in ('manual','baseline','canonical_baseline','carryover') or t.canonical_workload_identity is not null or t.curriculum_node_id is not null or t.carried_from_task_id is not null or t.status in ('in_progress','partially_completed') or coalesce(p.completed_minutes,0)>0 or coalesce(p.actual_study_minutes,0)>0,
   'eligibleToday',t.planned_date=today and t.status not in ('completed','cancelled','missed'),
   'progressMissing',p.task_id is null
  ) order by t.planned_date,t.created_at,t.id),'[]') into task_rows
 from public.tasks t left join public.subjects s on s.id=t.subject_id
 left join public.resources r on r.id=t.resource_id and r.user_id=u and r.exam_profile_id=p_exam_profile_id
 left join public.task_progress p on p.task_id=t.id and p.user_id=u
 where t.user_id=u and t.exam_profile_id=p_exam_profile_id and t.planned_date between p_week_start and p_week_start+6;
 for i in 0..6 loop
  d:=p_week_start+i; notes:='[]';
  select coalesce(jsonb_agg(value),'[]') into task_day from jsonb_array_elements(task_rows) where value->>'planned_date'=d::text;
  select coalesce(sum((value->>'estimated_minutes')::integer),0)::integer,
   coalesce(sum((value->>'plannedCreditMinutes')::integer),0)::integer,
   coalesce(sum((value->>'remainingPlannedMinutes')::integer),0)::integer,
   coalesce(bool_or((value->>'progressMissing')::boolean),false),count(*) filter(where value->>'status'='completed')::integer
  into planned,credit,remaining,unknown_progress,completed_count from jsonb_array_elements(task_day) where value->>'status'<>'cancelled';
  select coalesce(sum(duration_minutes),0)::integer,coalesce(bool_or(duration_minutes is null),false),count(*) filter(where status='active')::integer
   into actual,unknown_actual,active_count from public.study_sessions
   where user_id=u and exam_profile_id=p_exam_profile_id and (started_at at time zone 'Europe/Istanbul')::date=d and status='completed';
  select count(*)::integer into active_count from public.study_sessions where user_id=u and exam_profile_id=p_exam_profile_id and (started_at at time zone 'Europe/Istanbul')::date=d and status='active';
  select coalesce(sum(a.actual_minutes) filter(where a.accounting_intent='extra'),0)::integer,coalesce(sum(a.planned_credit_minutes),0)::integer into extra,ledger_credit
   from public.study_session_allocations a join public.study_sessions s on s.id=a.session_id and s.user_id=u and s.exam_profile_id=p_exam_profile_id
   where a.user_id=u and a.exam_profile_id=p_exam_profile_id and a.superseded_at is null and s.status='completed' and (s.started_at at time zone 'Europe/Istanbul')::date=d;
  if unknown_progress then notes:=notes||'"TASK_PROGRESS_MISSING"'::jsonb; end if;
  if unknown_actual then notes:=notes||'"SESSION_DURATION_MISSING"'::jsonb; end if;
  if extra>actual then notes:=notes||'"ACCOUNTING_INCONSISTENT"'::jsonb; unknown_actual:=true; end if;
  if exists(select 1 from jsonb_array_elements(task_day) where value->>'status'='completed' and (value->>'plannedCreditMinutes')::integer<(value->>'estimated_minutes')::integer) then notes:=notes||'"COMPLETED_WITH_PARTIAL_CREDIT"'::jsonb; end if;
  declared:=case when historical then null else (declared_days->>extract(isodow from d)::integer::text)::integer end;
  cap:=case when capacity_error is not null then null when historical then 0 when d<(input#>>'{profile,preparation_start_date}')::date or d>(input#>>'{profile,target_exam_date}')::date then 0 else (gross_days->>d::text)::integer end;
  free:=case when capacity_error is not null or unknown_progress then null when historical or d<today or d<(input#>>'{profile,preparation_start_date}')::date or d>(input#>>'{profile,target_exam_date}')::date then 0 else greatest(0,least((manual_days->>d::text)::integer,(credit_days->>d::text)::integer)-remaining) end;
  day_status:=case when capacity_error is not null then capacity_error when historical then 'HISTORICAL_CAPACITY_NOT_ARCHIVED' when d<today then 'PAST_DAY' when unknown_progress or unknown_actual then 'INCOMPLETE_DATA' when remaining>cap then 'PROTECTED_WORK_EXCEEDS_CAPACITY' else 'SUPPORTED' end;
  days:=days||jsonb_build_array(jsonb_build_object('date',d,'declaredMinutes',declared,'effectiveMinutes',cap,'plannedMinutes',planned,'plannedCreditMinutes',case when unknown_progress then null else credit end,
   'actualMinutes',case when unknown_actual then null else actual end,'extraActualMinutes',case when unknown_actual then null else extra end,'calendarPlannedCreditMinutes',ledger_credit,
   'remainingPlannedMinutes',case when unknown_progress then null else remaining end,'unallocatedMinutes',free,'activeSessionCount',active_count,'completedTaskCount',completed_count,'status',day_status,'warnings',notes,'tasks',task_day,
   'exceptions',(select coalesce(jsonb_agg(value),'[]') from jsonb_array_elements(input->'exceptions') where value->>'exception_date'=d::text),
   'overrides',(select coalesce(jsonb_agg(value),'[]') from jsonb_array_elements(input->'overrides') where value->>'capacity_date'=d::text)));
  sum_declared:=sum_declared+coalesce(declared,0); sum_effective:=sum_effective+coalesce(cap,0); sum_planned:=sum_planned+planned; sum_credit:=sum_credit+credit; sum_remaining:=sum_remaining+remaining;
  sum_actual:=sum_actual+actual;sum_extra:=sum_extra+extra;sum_ledger:=sum_ledger+ledger_credit;sum_free:=sum_free+coalesce(free,0);sum_active:=sum_active+active_count;sum_completed:=sum_completed+completed_count;
  any_unknown_progress:=any_unknown_progress or unknown_progress;any_unknown_actual:=any_unknown_actual or unknown_actual;
 end loop;
 free_week:=case when capacity_error is not null or any_unknown_progress then null else least(sum_free,greatest(0,weekly_remaining_limit-(select coalesce(sum((value->>'remainingPlannedMinutes')::integer),0)::integer from jsonb_array_elements(task_rows) where value->>'planned_date'>=today::text))) end;
 if not has_plan and not protected_work then
  initial:=public.initial_manual_plan_readiness(p_exam_profile_id,current_week);
  next_initial:=public.initial_manual_plan_readiness(p_exam_profile_id,current_week+7);
 else initial:=jsonb_build_object('ready',false,'reasons',jsonb_build_array(case when has_plan then 'PLAN_ALREADY_EXISTS' else 'PROTECTED_COMMITMENT_EXISTS' end)); end if;
 result:=jsonb_build_object('contractVersion','weekly-study-view-v1','profileId',p_exam_profile_id,'today',today,'timezone','Europe/Istanbul','weekStart',p_week_start,'weekEnd',p_week_start+6,'currentWeek',current_week,'nextWeek',current_week+7,
  'knownHistoricalWeeks',known_weeks,'mode',src->>'mode','historicalCapacityArchived',false,'capacityStatus',coalesce(capacity_error,case when historical then 'HISTORICAL_CAPACITY_NOT_ARCHIVED' else 'SUPPORTED' end),'days',days,
  'plans',(select coalesce(jsonb_agg(value),'[]') from jsonb_array_elements(all_plans) where value->>'week_start_date'=p_week_start::text),
  'hasAnyPlan',has_plan,'hasProtectedWork',protected_work,'upcomingStartDate',upcoming,'initialPlanStartDate',case when receipt is null then null else (select min(planned_date) from public.tasks where user_id=u and exam_profile_id=p_exam_profile_id and weekly_plan_id=(receipt->>'weekly_plan_id')::uuid) end,
  'firstPlan',jsonb_build_object('eligible',coalesce((initial->>'ready')::boolean,false) or coalesce((next_initial->>'ready')::boolean,false),'reasons',initial->'reasons','nextWeekReasons',next_initial->'reasons','subjectsWithoutSources',coalesce(initial->'subjectsWithoutSources','[]')),
  'totals',jsonb_build_object('declaredMinutes',case when historical then null else sum_declared end,'effectiveMinutes',case when capacity_error is not null then null else sum_effective end,
   'weeklyCeilingMinutes',weekly_limit,'plannedMinutes',sum_planned,'plannedCreditMinutes',case when any_unknown_progress then null else sum_credit end,'actualMinutes',case when any_unknown_actual then null else sum_actual end,
   'extraActualMinutes',case when any_unknown_actual then null else sum_extra end,'calendarPlannedCreditMinutes',sum_ledger,'remainingPlannedMinutes',case when any_unknown_progress then null else sum_remaining end,
   'unallocatedMinutes',free_week,'activeSessionCount',sum_active,'completedTaskCount',sum_completed,'taskCount',(select count(*) from jsonb_array_elements(task_rows) where value->>'status'<>'cancelled'),
   'planFulfillmentPercent',case when sum_planned=0 or any_unknown_progress then null else round(100.0*sum_credit/sum_planned,1) end),
  'periods',input->'periods','dataWarnings',case when any_unknown_progress or any_unknown_actual then '["INCOMPLETE_DATA"]'::jsonb else '[]'::jsonb end);
 return result||jsonb_build_object('revision',encode(sha256(convert_to(result::text,'UTF8')),'hex'));
end $$;
revoke all on function public.weekly_study_view(uuid,date) from public,anon;
grant execute on function public.weekly_study_view(uuid,date) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
