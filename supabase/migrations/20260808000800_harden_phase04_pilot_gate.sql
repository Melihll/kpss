alter table public.processed_external_events
  add column status text not null default 'completed',
  add column attempt_count integer not null default 1,
  add column started_at timestamptz not null default now(),
  add column completed_at timestamptz null,
  add column last_error text null,
  add column business_completed_at timestamptz null,
  add column result_payload jsonb null,
  add constraint processed_external_events_status_valid check (status in ('processing','completed','failed')),
  add constraint processed_external_events_attempt_count_positive check (attempt_count > 0);

update public.processed_external_events
set completed_at = processed_at
where status = 'completed' and completed_at is null;

create or replace function public.record_test_result(p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  existing public.test_results;
  r public.test_results;
  c integer := (p_payload->>'correct')::integer;
  w integer := (p_payload->>'wrong')::integer;
  b integer := (p_payload->>'blank')::integer;
  total integer := (p_payload->>'total')::integer;
  duration integer := nullif(p_payload->>'durationMinutes','')::integer;
  v_task_id uuid := nullif(p_payload->>'taskId','')::uuid;
  v_unit_id uuid := nullif(p_payload->>'resourceUnitId','')::uuid;
begin
  if nullif(p_payload->>'idempotencyKey','') is not null then
    select * into existing from public.test_results
    where user_id=auth.uid() and idempotency_key=p_payload->>'idempotencyKey';
    if found then return to_jsonb(existing); end if;
  end if;

  if c is null or w is null or b is null or c<0 or w<0 or b<0 then
    raise exception 'INVALID_TEST_RESULT_COUNTS';
  end if;
  if total is null or total<=0 or c+w+b<>total then
    raise exception 'INVALID_TEST_RESULT_TOTAL';
  end if;
  if duration is not null and duration<=0 then
    raise exception 'INVALID_TEST_RESULT';
  end if;
  if v_task_id is not null and not exists(
    select 1 from public.tasks where id=v_task_id and user_id=auth.uid()
  ) then
    raise exception 'TASK_NOT_FOUND';
  end if;
  if v_unit_id is not null and not exists(
    select 1 from public.resource_units where id=v_unit_id
  ) then
    raise exception 'RESOURCE_UNIT_NOT_FOUND';
  end if;
  if v_unit_id is not null and not exists(
    select 1 from public.resource_units where id=v_unit_id and unit_type='test'
  ) then
    raise exception 'RESOURCE_UNIT_NOT_TEST';
  end if;
  if v_task_id is not null and v_unit_id is not null and not exists(
    select 1 from public.task_resource_units
    where task_id=v_task_id and resource_unit_id=v_unit_id and user_id=auth.uid()
  ) then
    raise exception 'RESOURCE_UNIT_NOT_LINKED_TO_TASK';
  end if;

  insert into public.test_results(
    user_id,exam_profile_id,task_id,subject_id,curriculum_node_id,resource_id,resource_unit_id,
    correct_count,wrong_count,blank_count,total_questions,duration_minutes,review_status,
    entry_source,idempotency_key,completed_at
  ) values(
    auth.uid(),(p_payload->>'examProfileId')::uuid,v_task_id,(p_payload->>'subjectId')::uuid,
    nullif(p_payload->>'curriculumNodeId','')::uuid,nullif(p_payload->>'resourceId','')::uuid,
    v_unit_id,c,w,b,total,duration,
    case when w>0 or b>0 then 'pending' else 'reviewed' end,
    coalesce(p_payload->>'entrySource','web'),nullif(p_payload->>'idempotencyKey',''),
    coalesce((p_payload->>'completedAt')::timestamptz,now())
  ) returning * into r;

  if r.curriculum_node_id is not null then
    update public.topic_progress set
      total_questions=total_questions+total,
      correct_questions=correct_questions+c,
      wrong_questions=wrong_questions+w,
      blank_questions=blank_questions+b,
      last_practiced_at=r.completed_at
    where user_id=auth.uid() and exam_profile_id=r.exam_profile_id
      and curriculum_node_id=r.curriculum_node_id;
  end if;
  if r.resource_unit_id is not null then
    insert into public.resource_unit_progress(user_id,resource_unit_id,status,completed_at,attempt_count)
    values(auth.uid(),r.resource_unit_id,'completed',r.completed_at,1)
    on conflict(user_id,resource_unit_id) do update set
      status='completed',
      completed_at=coalesce(public.resource_unit_progress.completed_at,excluded.completed_at),
      attempt_count=case when public.resource_unit_progress.status='completed'
        then public.resource_unit_progress.attempt_count
        else public.resource_unit_progress.attempt_count+1 end;
    if r.task_id is not null then
      perform public.complete_task_unit(r.task_id,r.resource_unit_id);
    end if;
  end if;
  return to_jsonb(r);
end $$;

create function public.claim_external_event(
  p_provider text,
  p_external_event_id text,
  p_stale_seconds integer default 60
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  event public.processed_external_events;
  inserted boolean := false;
begin
  if p_stale_seconds < 1 or p_stale_seconds > 3600 then
    raise exception 'INVALID_STALE_LOCK_SECONDS';
  end if;

  insert into public.processed_external_events(
    provider,external_event_id,status,attempt_count,started_at,completed_at,last_error
  ) values(p_provider,p_external_event_id,'processing',1,now(),null,null)
  on conflict(provider,external_event_id) do nothing
  returning true into inserted;

  select * into event from public.processed_external_events
  where provider=p_provider and external_event_id=p_external_event_id
  for update;

  if inserted then
    return jsonb_build_object('claimed',true,'status',event.status,'attemptCount',event.attempt_count,
      'businessCompleted',false,'resultPayload',null);
  end if;
  if event.status='completed' then
    return jsonb_build_object('claimed',false,'status','completed','attemptCount',event.attempt_count,
      'businessCompleted',true,'resultPayload',event.result_payload);
  end if;
  if event.status='processing' and event.started_at > now()-make_interval(secs=>p_stale_seconds) then
    return jsonb_build_object('claimed',false,'status','processing','attemptCount',event.attempt_count,
      'businessCompleted',event.business_completed_at is not null,'resultPayload',event.result_payload);
  end if;

  update public.processed_external_events set
    status='processing',
    attempt_count=attempt_count+1,
    started_at=now(),
    completed_at=null,
    last_error=null
  where provider=p_provider and external_event_id=p_external_event_id
  returning * into event;

  return jsonb_build_object('claimed',true,'status',event.status,'attemptCount',event.attempt_count,
    'businessCompleted',event.business_completed_at is not null,'resultPayload',event.result_payload);
end $$;

create function public.checkpoint_external_event(
  p_provider text,
  p_external_event_id text,
  p_result_payload jsonb
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare event public.processed_external_events;
begin
  update public.processed_external_events set
    business_completed_at=coalesce(business_completed_at,now()),
    result_payload=p_result_payload
  where provider=p_provider and external_event_id=p_external_event_id and status='processing'
  returning * into event;
  if not found then raise exception 'EXTERNAL_EVENT_NOT_PROCESSING'; end if;
  return to_jsonb(event);
end $$;

create function public.complete_external_event(p_provider text,p_external_event_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare event public.processed_external_events;
begin
  update public.processed_external_events set
    status='completed',completed_at=now(),processed_at=now(),last_error=null
  where provider=p_provider and external_event_id=p_external_event_id and status='processing'
  returning * into event;
  if not found then raise exception 'EXTERNAL_EVENT_NOT_PROCESSING'; end if;
  return to_jsonb(event);
end $$;

create function public.fail_external_event(p_provider text,p_external_event_id text,p_last_error text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare event public.processed_external_events;
begin
  update public.processed_external_events set
    status='failed',last_error=left(p_last_error,2000)
  where provider=p_provider and external_event_id=p_external_event_id and status='processing'
  returning * into event;
  if not found then return null; end if;
  return to_jsonb(event);
end $$;

revoke all on function public.claim_external_event(text,text,integer),
  public.checkpoint_external_event(text,text,jsonb),
  public.complete_external_event(text,text),
  public.fail_external_event(text,text,text)
from public,anon,authenticated;

grant execute on function public.claim_external_event(text,text,integer),
  public.checkpoint_external_event(text,text,jsonb),
  public.complete_external_event(text,text),
  public.fail_external_event(text,text,text)
to service_role;
