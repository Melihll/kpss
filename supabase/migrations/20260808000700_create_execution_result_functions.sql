create function public.start_study_session(p_task_id uuid, p_entry_source text default 'web') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare t public.tasks; s public.study_sessions;
begin
  if exists(select 1 from public.study_sessions where user_id=auth.uid() and status='active') then raise exception 'ACTIVE_SESSION_EXISTS'; end if;
  select * into t from public.tasks where id=p_task_id and user_id=auth.uid();
  if not found then raise exception 'TASK_NOT_FOUND'; end if;
  perform public.start_task(p_task_id);
  insert into public.study_sessions(user_id,exam_profile_id,task_id,subject_id,curriculum_node_id,resource_id,session_type,started_at,status,entry_source)
  values(auth.uid(),t.exam_profile_id,t.id,t.subject_id,t.curriculum_node_id,t.resource_id,'task',now(),'active',p_entry_source)
  returning * into s;
  return to_jsonb(s);
end $$;

create function public.finish_study_session(p_session_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s public.study_sessions; mins integer;
begin
  select * into s from public.study_sessions where id=p_session_id and user_id=auth.uid() for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if s.status='completed' then return to_jsonb(s); end if;
  if s.status<>'active' then raise exception 'SESSION_NOT_ACTIVE'; end if;
  mins:=greatest(1,floor(extract(epoch from (now()-s.started_at))/60)::integer);
  update public.study_sessions set ended_at=now(),duration_minutes=mins,status='completed',accounted_at=now() where id=s.id returning * into s;
  if s.task_id is not null then
    update public.task_progress set actual_study_minutes=actual_study_minutes+mins where task_id=s.task_id and user_id=auth.uid();
  end if;
  if s.curriculum_node_id is not null then
    update public.topic_progress set total_study_minutes=total_study_minutes+mins where user_id=auth.uid() and exam_profile_id=s.exam_profile_id and curriculum_node_id=s.curriculum_node_id;
  end if;
  return to_jsonb(s);
end $$;

create function public.cancel_study_session(p_session_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s public.study_sessions;
begin
  select * into s from public.study_sessions where id=p_session_id and user_id=auth.uid() for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if s.status='cancelled' then return to_jsonb(s); end if;
  if s.status<>'active' then raise exception 'SESSION_NOT_ACTIVE'; end if;
  update public.study_sessions set ended_at=now(),status='cancelled' where id=s.id returning * into s;
  if s.task_id is not null then update public.tasks set status='ready' where id=s.task_id and user_id=auth.uid() and status='in_progress'; end if;
  return to_jsonb(s);
end $$;

create function public.record_retroactive_session(p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare profile_id uuid:=(p_payload->>'examProfileId')::uuid; mins integer:=(p_payload->>'durationMinutes')::integer;
  end_time timestamptz:=coalesce((p_payload->>'endedAt')::timestamptz,now()); s public.study_sessions;
begin
  if mins is null or mins<=0 then raise exception 'INVALID_SESSION_DURATION'; end if;
  insert into public.study_sessions(user_id,exam_profile_id,task_id,subject_id,curriculum_node_id,resource_id,resource_unit_id,session_type,started_at,ended_at,duration_minutes,status,entry_source,note,accounted_at)
  values(auth.uid(),profile_id,nullif(p_payload->>'taskId','')::uuid,nullif(p_payload->>'subjectId','')::uuid,nullif(p_payload->>'curriculumNodeId','')::uuid,nullif(p_payload->>'resourceId','')::uuid,nullif(p_payload->>'resourceUnitId','')::uuid,case when nullif(p_payload->>'taskId','') is not null then 'task' else 'custom' end,end_time-(mins||' minutes')::interval,end_time,mins,'completed',coalesce(p_payload->>'entrySource','retroactive'),p_payload->>'note',now()) returning * into s;
  if s.task_id is not null then update public.task_progress set actual_study_minutes=actual_study_minutes+mins where task_id=s.task_id and user_id=auth.uid(); end if;
  if s.curriculum_node_id is not null then update public.topic_progress set total_study_minutes=total_study_minutes+mins where user_id=auth.uid() and exam_profile_id=profile_id and curriculum_node_id=s.curriculum_node_id; end if;
  return to_jsonb(s);
end $$;

create function public.record_test_result(p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare existing public.test_results; r public.test_results; c integer:=(p_payload->>'correct')::integer; w integer:=(p_payload->>'wrong')::integer; b integer:=(p_payload->>'blank')::integer; total integer:=(p_payload->>'total')::integer;
begin
  if nullif(p_payload->>'idempotencyKey','') is not null then select * into existing from public.test_results where user_id=auth.uid() and idempotency_key=p_payload->>'idempotencyKey'; if found then return to_jsonb(existing); end if; end if;
  if c<0 or w<0 or b<0 or total<=0 or c+w+b<>total then raise exception 'INVALID_TEST_RESULT'; end if;
  insert into public.test_results(user_id,exam_profile_id,task_id,subject_id,curriculum_node_id,resource_id,resource_unit_id,correct_count,wrong_count,blank_count,total_questions,duration_minutes,review_status,entry_source,idempotency_key,completed_at)
  values(auth.uid(),(p_payload->>'examProfileId')::uuid,nullif(p_payload->>'taskId','')::uuid,(p_payload->>'subjectId')::uuid,nullif(p_payload->>'curriculumNodeId','')::uuid,nullif(p_payload->>'resourceId','')::uuid,nullif(p_payload->>'resourceUnitId','')::uuid,c,w,b,total,nullif(p_payload->>'durationMinutes','')::integer,case when w>0 or b>0 then 'pending' else 'reviewed' end,coalesce(p_payload->>'entrySource','web'),nullif(p_payload->>'idempotencyKey',''),coalesce((p_payload->>'completedAt')::timestamptz,now())) returning * into r;
  if r.curriculum_node_id is not null then update public.topic_progress set total_questions=total_questions+total,correct_questions=correct_questions+c,wrong_questions=wrong_questions+w,blank_questions=blank_questions+b,last_practiced_at=r.completed_at where user_id=auth.uid() and exam_profile_id=r.exam_profile_id and curriculum_node_id=r.curriculum_node_id; end if;
  if r.resource_unit_id is not null then
    if not exists(select 1 from public.resource_units where id=r.resource_unit_id and unit_type='test') then raise exception 'RESOURCE_UNIT_NOT_TEST'; end if;
    insert into public.resource_unit_progress(user_id,resource_unit_id,status,completed_at,attempt_count) values(auth.uid(),r.resource_unit_id,'completed',r.completed_at,1)
    on conflict(user_id,resource_unit_id) do update set status='completed',completed_at=coalesce(public.resource_unit_progress.completed_at,excluded.completed_at),attempt_count=case when public.resource_unit_progress.status='completed' then public.resource_unit_progress.attempt_count else public.resource_unit_progress.attempt_count+1 end;
    if r.task_id is not null and exists(select 1 from public.task_resource_units where task_id=r.task_id and resource_unit_id=r.resource_unit_id and user_id=auth.uid()) then perform public.complete_task_unit(r.task_id,r.resource_unit_id); end if;
  end if;
  return to_jsonb(r);
end $$;

create function public.update_test_result(p_result_id uuid,p_correct integer,p_wrong integer,p_blank integer,p_total integer,p_duration integer default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare old public.test_results; r public.test_results;
begin
  if p_correct<0 or p_wrong<0 or p_blank<0 or p_total<=0 or p_correct+p_wrong+p_blank<>p_total then raise exception 'INVALID_TEST_RESULT'; end if;
  select * into old from public.test_results where id=p_result_id and user_id=auth.uid() for update; if not found then raise exception 'TEST_RESULT_NOT_FOUND'; end if;
  if old.curriculum_node_id is not null then update public.topic_progress set total_questions=total_questions-old.total_questions+p_total,correct_questions=correct_questions-old.correct_count+p_correct,wrong_questions=wrong_questions-old.wrong_count+p_wrong,blank_questions=blank_questions-old.blank_count+p_blank where user_id=auth.uid() and exam_profile_id=old.exam_profile_id and curriculum_node_id=old.curriculum_node_id; end if;
  update public.test_results set correct_count=p_correct,wrong_count=p_wrong,blank_count=p_blank,total_questions=p_total,duration_minutes=p_duration,review_status=case when p_wrong>0 or p_blank>0 then case when review_status='reviewed' then 'reviewed' else 'pending' end else 'reviewed' end where id=p_result_id and user_id=auth.uid() returning * into r;
  return to_jsonb(r);
end $$;

create function public.review_test_result(p_result_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.test_results; begin update public.test_results set review_status='reviewed' where id=p_result_id and user_id=auth.uid() returning * into r; if not found then raise exception 'TEST_RESULT_NOT_FOUND'; end if; return to_jsonb(r); end $$;

create function public.consume_messaging_link_token(p_token_hash text,p_external_user_id text,p_external_chat_id text,p_username text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare tok public.messaging_link_tokens; ident public.messaging_identities;
begin
  select * into tok from public.messaging_link_tokens where provider='telegram' and token_hash=p_token_hash for update;
  if not found or tok.used_at is not null or tok.expires_at<=now() then raise exception 'INVALID_LINK_TOKEN'; end if;
  insert into public.messaging_identities(user_id,provider,external_user_id,external_chat_id,username) values(tok.user_id,'telegram',p_external_user_id,p_external_chat_id,p_username) returning * into ident;
  update public.messaging_link_tokens set used_at=now() where id=tok.id;
  return to_jsonb(ident);
end $$;

revoke all on function public.start_study_session(uuid,text),public.finish_study_session(uuid),public.cancel_study_session(uuid),public.record_retroactive_session(jsonb),public.record_test_result(jsonb),public.update_test_result(uuid,integer,integer,integer,integer,integer),public.review_test_result(uuid),public.consume_messaging_link_token(text,text,text,text) from public,anon;
grant execute on function public.start_study_session(uuid,text),public.finish_study_session(uuid),public.cancel_study_session(uuid),public.record_retroactive_session(jsonb),public.record_test_result(jsonb),public.update_test_result(uuid,integer,integer,integer,integer,integer),public.review_test_result(uuid) to authenticated;
revoke all on function public.consume_messaging_link_token(text,text,text,text) from authenticated;
grant execute on function public.consume_messaging_link_token(text,text,text,text) to service_role;

create function public.telegram_start_study_session(p_user_id uuid,p_task_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$ begin
  perform set_config('request.jwt.claim.sub',p_user_id::text,true);
  return public.start_study_session(p_task_id,'telegram');
end $$;
create function public.telegram_finish_study_session(p_user_id uuid,p_session_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$ begin
  perform set_config('request.jwt.claim.sub',p_user_id::text,true);
  return public.finish_study_session(p_session_id);
end $$;
create function public.telegram_record_retroactive_session(p_user_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$ begin
  perform set_config('request.jwt.claim.sub',p_user_id::text,true);
  return public.record_retroactive_session(p_payload || jsonb_build_object('entrySource','telegram'));
end $$;
create function public.telegram_record_test_result(p_user_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$ begin
  perform set_config('request.jwt.claim.sub',p_user_id::text,true);
  return public.record_test_result(p_payload || jsonb_build_object('entrySource','telegram'));
end $$;
create function public.telegram_review_test_result(p_user_id uuid,p_result_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$ begin
  perform set_config('request.jwt.claim.sub',p_user_id::text,true);
  return public.review_test_result(p_result_id);
end $$;
revoke all on function public.telegram_start_study_session(uuid,uuid),public.telegram_finish_study_session(uuid,uuid),public.telegram_record_retroactive_session(uuid,jsonb),public.telegram_record_test_result(uuid,jsonb),public.telegram_review_test_result(uuid,uuid) from public,anon,authenticated;
grant execute on function public.telegram_start_study_session(uuid,uuid),public.telegram_finish_study_session(uuid,uuid),public.telegram_record_retroactive_session(uuid,jsonb),public.telegram_record_test_result(uuid,jsonb),public.telegram_review_test_result(uuid,uuid) to service_role;
