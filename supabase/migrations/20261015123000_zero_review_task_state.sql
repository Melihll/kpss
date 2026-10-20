begin;
-- Explicit zero reuses native cancellation and its task-state reset atomically.
-- Earlier applied migrations/evidence are immutable. No historical rows change.
create or replace function public.confirm_study_session_finish(p_session_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r p0_session_integrity.finish_reviews; c jsonb; v_hash text; op uuid; actual integer; v_result jsonb; page integer;
begin
 if auth.uid() is null then raise exception 'UNAUTHORIZED';end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or p_payload->>'intent' is distinct from 'confirm_actual_study_minutes' or p_payload->'confirmed' is distinct from 'true'::jsonb
  or exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('intent','confirmed','operationId','expectedRevision','actualMinutes','completedThroughPage')) then raise exception 'INVALID_DURATION_CONFIRMATION';end if;
 begin op:=(p_payload->>'operationId')::uuid;actual:=(p_payload->>'actualMinutes')::integer;page:=(p_payload->>'completedThroughPage')::integer;
  if op is null or actual is null or jsonb_typeof(p_payload->'actualMinutes')<>'number' or p_payload->>'actualMinutes'!~'^\d+$' then raise exception 'bad';end if;
 exception when others then raise exception 'INVALID_DURATION_CONFIRMATION';end;
 perform 1 from public.exam_profiles where user_id=auth.uid() and id=(select exam_profile_id from public.study_sessions where id=p_session_id and user_id=auth.uid()) for update;
 perform 1 from public.study_sessions where id=p_session_id and user_id=auth.uid() for update;
 c:=p0_session_integrity.context(p_session_id);v_hash:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
 select * into r from p0_session_integrity.finish_reviews where session_id=p_session_id and user_id=auth.uid() for update;
 if not found then raise exception 'SESSION_REVIEW_REQUIRED';end if;
 if r.phase='applied' then
  if r.operation_id is distinct from op or r.request_hash is distinct from v_hash then raise exception 'SESSION_CONFIRMATION_CONFLICT';end if;return r.result;
 end if;
 if r.revision is distinct from p_payload->>'expectedRevision' or r.revision is distinct from encode(sha256(convert_to(c::text,'UTF8')),'hex') then raise exception 'SESSION_REVIEW_STALE';end if;
 if actual<0 or actual>r.observed_minutes then raise exception 'INVALID_CONFIRMED_MINUTES';end if;
 if actual=0 and c->'physical'<>'null'::jsonb and page is distinct from (c#>>'{physical,start_page_boundary}')::integer then raise exception 'ZERO_TIME_MATERIAL_PROGRESS_FORBIDDEN';end if;
 update p0_session_integrity.finish_reviews set phase='confirmed',actual_minutes=actual,operation_id=op,request_hash=v_hash where session_id=p_session_id;
 if actual=0 then
  update public.study_session_breaks set ended_at=now() where session_id=p_session_id and user_id=auth.uid() and ended_at is null;
  update public.physical_study_activity_breaks set ended_at=now() where study_session_id=p_session_id and user_id=auth.uid() and ended_at is null;
  perform public.cancel_study_session(p_session_id);
  v_result:=jsonb_build_object('id',p_session_id,'status','cancelled','duration_minutes',null,'outcome','discarded_no_work','allocation',null);
 elsif c->'physical'<>'null'::jsonb then
  if page is null then raise exception 'PHYSICAL_PAGE_BOUNDARY_REQUIRED';end if;
  v_result:=public.finish_physical_study_session(p_session_id,page);
 else v_result:=public.finish_study_session(p_session_id);end if;
 v_result:=v_result||jsonb_build_object('contractVersion','session-duration-review-v1','durationVerified',true,'actualMinutes',actual,'operationId',op);
 update p0_session_integrity.finish_reviews set phase='applied',result=v_result where session_id=p_session_id;
 return v_result;
end $$;
notify pgrst,'reload schema';
commit;
