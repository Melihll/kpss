begin;
-- A committed owned receipt survives later profile status changes. New creation still requires draft/active.
create or replace function public.create_initial_manual_plan(p_payload jsonb)
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
 perform 1 from public.exam_profiles where id=p and user_id=u for update;
 if not found then raise exception 'EXAM_PROFILE_NOT_FOUND'; end if;
 request_hash:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
 select * into receipt from public.initial_manual_plan_receipts where user_id=u and exam_profile_id=p and operation_id=op;
 if found then
  if receipt.request_hash<>request_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return receipt.result;
 end if;
 if not exists(select 1 from public.exam_profiles where id=p and user_id=u and status in ('draft','active')) then raise exception 'EXAM_PROFILE_NOT_FOUND'; end if;
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
notify pgrst,'reload schema';
commit;
