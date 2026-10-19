begin;

-- Independent of the LOCAL P0/S0/R2/S1 chain: only the established session/material tables and auth.uid().
create schema p0_session_integrity;
revoke all on schema p0_session_integrity from public,anon,authenticated,service_role;
create table p0_session_integrity.finish_reviews (
 session_id uuid primary key references public.study_sessions(id),
 user_id uuid not null references auth.users(id),
 prepared_at timestamptz not null,
 observed_minutes integer not null,
 revision text not null,
 original jsonb not null,
 review_history jsonb not null default '[]',
 phase text not null check(phase in ('pending','confirmed','applied')),
 actual_minutes integer,
 operation_id uuid,
 request_hash text,
 result jsonb,
 check(actual_minutes is null or actual_minutes>=0)
);
revoke all on p0_session_integrity.finish_reviews from public,anon,authenticated,service_role;
create table p0_session_integrity.retroactive_confirmations (
 user_id uuid not null references auth.users(id),operation_id uuid not null,tx_id bigint not null,
 payload jsonb not null,request_hash text not null,session_id uuid,result jsonb,
 primary key(user_id,operation_id)
);
revoke all on p0_session_integrity.retroactive_confirmations from public,anon,authenticated,service_role;

create function p0_session_integrity.context(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.study_sessions; b jsonb; physical jsonb; pages jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
 select * into s from public.study_sessions where id=p_id and user_id=auth.uid();
 if not found then raise exception 'SESSION_NOT_FOUND'; end if;
 select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') into b from public.study_session_breaks t where session_id=p_id and user_id=s.user_id;
 select to_jsonb(t) into physical from public.physical_study_activity_snapshots t where study_session_id=p_id and user_id=s.user_id;
 if physical is not null then select to_jsonb(t) into pages from public.resource_unit_progress t where user_id=s.user_id and resource_unit_id=s.resource_unit_id; end if;
 return jsonb_build_object('session',to_jsonb(s),'breaks',b,'physical',physical,'pages',pages);
end $$;

create function p0_session_integrity.observation(p_context jsonb,p_at timestamptz) returns jsonb language plpgsql immutable set search_path='' as $$
declare started timestamptz:=(p_context#>>'{session,started_at}')::timestamptz; wall numeric; pauses numeric; minutes integer; reasons jsonb:='[]';
begin
 wall:=greatest(0,extract(epoch from(p_at-started)));
 select coalesce(sum(greatest(0,extract(epoch from(least(coalesce((b->>'ended_at')::timestamptz,p_at),p_at)-greatest((b->>'started_at')::timestamptz,started))))),0) into pauses from jsonb_array_elements(p_context->'breaks') b;
 minutes:=greatest(1,floor(greatest(0,wall-pauses)/60)::integer);
 if (started at time zone 'Europe/Istanbul')::date<>(p_at at time zone 'Europe/Istanbul')::date then reasons:=reasons||'"CROSSED_STUDY_DAY"'::jsonb; end if;
 if wall>=14400 then reasons:=reasons||'"LONG_OPEN_SESSION"'::jsonb; end if;
 return jsonb_build_object('observedMinutes',minutes,'wallMinutes',floor(wall/60)::integer,'needsReview',jsonb_array_length(reasons)>0,'reasons',reasons);
end $$;

create function public.preview_study_session_finish(p_session_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c jsonb; r p0_session_integrity.finish_reviews; o jsonb;
begin
 c:=p0_session_integrity.context(p_session_id);
 select * into r from p0_session_integrity.finish_reviews where session_id=p_session_id and user_id=auth.uid();
 o:=p0_session_integrity.observation(c,now());
 return o||jsonb_build_object('contractVersion','session-duration-review-v1','sessionId',p_session_id,'status',c#>'{session,status}',
  'revision',encode(sha256(convert_to(c::text,'UTF8')),'hex'),'held',r.phase='pending','review',case when r.session_id is null then null else jsonb_build_object('phase',r.phase,'revision',r.revision,'observedMinutes',r.observed_minutes,'preparedAt',r.prepared_at) end);
end $$;

create function public.prepare_study_session_finish(p_session_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c jsonb; held jsonb; o jsonb; r p0_session_integrity.finish_reviews; rev text;
begin
 if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
 perform 1 from public.exam_profiles where user_id=auth.uid() and id=(select exam_profile_id from public.study_sessions where id=p_session_id and user_id=auth.uid()) for update;
 perform 1 from public.study_sessions where id=p_session_id and user_id=auth.uid() for update;
 c:=p0_session_integrity.context(p_session_id);
 if c#>>'{session,status}'<>'active' then raise exception 'SESSION_NOT_ACTIVE'; end if;
 o:=p0_session_integrity.observation(c,now());
 select * into r from p0_session_integrity.finish_reviews where session_id=p_session_id and user_id=auth.uid() for update;
 if r.phase='applied' then return r.result; end if;
 if c->'physical'<>'null'::jsonb then perform public.pause_physical_study_session(p_session_id); else perform public.pause_study_session(p_session_id); end if;
 held:=p0_session_integrity.context(p_session_id);rev:=encode(sha256(convert_to(held::text,'UTF8')),'hex');
 if r.phase='pending' and r.revision=rev then return public.preview_study_session_finish(p_session_id); end if;
 insert into p0_session_integrity.finish_reviews(session_id,user_id,prepared_at,observed_minutes,revision,original,phase)
 values(p_session_id,auth.uid(),now(),(o->>'observedMinutes')::integer,rev,c,'pending')
 on conflict(session_id) do update set prepared_at=excluded.prepared_at,observed_minutes=excluded.observed_minutes,revision=excluded.revision,
  review_history=p0_session_integrity.finish_reviews.review_history||jsonb_build_array(jsonb_build_object('preparedAt',p0_session_integrity.finish_reviews.prepared_at,'revision',p0_session_integrity.finish_reviews.revision)),phase='pending';
 return public.preview_study_session_finish(p_session_id);
end $$;

create function p0_session_integrity.guard_duration() returns trigger language plpgsql security definer set search_path='' as $$
declare c jsonb; r p0_session_integrity.finish_reviews; o jsonb; at_time timestamptz;
begin
 -- Offline operator fixtures/admin maintenance are not client authority. Public RPCs still always require auth.uid().
 if auth.uid() is null then
  if session_user in ('postgres','supabase_admin') then return new; end if;
  raise exception 'UNAUTHORIZED';
 end if;
 if new.user_id is distinct from auth.uid() then raise exception 'UNAUTHORIZED'; end if;
 if tg_op='UPDATE' and (new.started_at is distinct from old.started_at or new.task_id is distinct from old.task_id or new.resource_id is distinct from old.resource_id or new.resource_unit_id is distinct from old.resource_unit_id or new.exam_profile_id is distinct from old.exam_profile_id or new.user_id is distinct from old.user_id) then raise exception 'SESSION_IDENTITY_IMMUTABLE';end if;
 if tg_op='UPDATE' and old.status='completed' and (new.duration_minutes is distinct from old.duration_minutes or new.started_at is distinct from old.started_at or new.ended_at is distinct from old.ended_at or new.status is distinct from old.status) then raise exception 'SESSION_REPAIR_REQUIRED'; end if;
 if new.status<>'completed' then return new; end if;
 if tg_op='UPDATE' and old.status='completed' then return new; end if;
 if tg_op='INSERT' and exists(select 1 from p0_session_integrity.retroactive_confirmations a where a.user_id=new.user_id and a.tx_id=txid_current() and a.result is null and a.payload->>'examProfileId'=new.exam_profile_id::text and (a.payload->>'durationMinutes')::integer=new.duration_minutes and (a.payload->>'endedAt')::timestamptz=new.ended_at and nullif(a.payload->>'taskId','')::uuid is not distinct from new.task_id) then
  update p0_session_integrity.retroactive_confirmations set session_id=new.id where user_id=new.user_id and tx_id=txid_current() and result is null;return new;
 end if;
 if tg_op='UPDATE' and old.status<>'active' then raise exception 'SESSION_NOT_ACTIVE';end if;
 at_time:=case when tg_op='UPDATE' then now() else coalesce(new.ended_at,now()) end;
 select * into r from p0_session_integrity.finish_reviews where session_id=new.id and user_id=new.user_id;
 if r.phase='confirmed' then new.duration_minutes:=r.actual_minutes;return new; end if;
 if tg_op='INSERT' then c:=jsonb_build_object('session',to_jsonb(new),'breaks','[]'::jsonb);else c:=p0_session_integrity.context(new.id);end if;
 o:=p0_session_integrity.observation(c,at_time);
 if coalesce((o->>'needsReview')::boolean,false) or r.phase='pending' then raise exception 'SESSION_DURATION_CONFIRMATION_REQUIRED'; end if;
 return new;
end $$;
create trigger p0_session_duration_guard before insert or update on public.study_sessions for each row execute function p0_session_integrity.guard_duration();

create function p0_session_integrity.guard_allocation() returns trigger language plpgsql security definer set search_path='' as $$
declare c jsonb; r p0_session_integrity.finish_reviews;
begin
 if auth.uid() is null and session_user in ('postgres','supabase_admin') then return new;end if;
 c:=p0_session_integrity.context(new.session_id);
 select * into r from p0_session_integrity.finish_reviews where session_id=new.session_id and user_id=auth.uid();
 if (p0_session_integrity.observation(c,(c#>>'{session,ended_at}')::timestamptz)->>'needsReview')::boolean and coalesce(r.phase,'') not in ('confirmed','applied') and not exists(select 1 from p0_session_integrity.retroactive_confirmations a where a.user_id=auth.uid() and a.session_id=new.session_id) then raise exception 'SESSION_DURATION_CONFIRMATION_REQUIRED'; end if;
 return new;
end $$;
create trigger p0_session_allocation_guard before insert on public.study_session_allocations for each row execute function p0_session_integrity.guard_allocation();

create function p0_session_integrity.guard_physical_evidence() returns trigger language plpgsql security definer set search_path='' as $$
declare r p0_session_integrity.finish_reviews;
begin
 select * into r from p0_session_integrity.finish_reviews where session_id=new.study_session_id and user_id=new.user_id;
 if r.phase in ('confirmed','applied') then new.actual_active_seconds:=least(new.actual_active_seconds,r.actual_minutes*60);end if;
 return new;
end $$;
create trigger p0_session_physical_evidence_guard before insert on public.physical_pace_evidence for each row execute function p0_session_integrity.guard_physical_evidence();

create function public.confirm_study_session_finish(p_session_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
  update public.study_sessions set status='cancelled',ended_at=now(),duration_minutes=null where id=p_session_id and user_id=auth.uid();
  v_result:=jsonb_build_object('id',p_session_id,'status','cancelled','duration_minutes',null,'outcome','discarded_no_work','allocation',null);
 elsif c->'physical'<>'null'::jsonb then
  if page is null then raise exception 'PHYSICAL_PAGE_BOUNDARY_REQUIRED';end if;
  v_result:=public.finish_physical_study_session(p_session_id,page);
 else v_result:=public.finish_study_session(p_session_id);end if;
 v_result:=v_result||jsonb_build_object('contractVersion','session-duration-review-v1','durationVerified',true,'actualMinutes',actual,'operationId',op);
 update p0_session_integrity.finish_reviews set phase='applied',result=v_result where session_id=p_session_id;
 return v_result;
end $$;

create function public.record_confirmed_retroactive_session(p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare op uuid; v_hash text; existing p0_session_integrity.retroactive_confirmations; payload jsonb; v_result jsonb; mins integer;
begin
 if auth.uid() is null then raise exception 'UNAUTHORIZED';end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or p_payload->>'intent' is distinct from 'record_confirmed_actual_minutes' or p_payload->'confirmed' is distinct from 'true'::jsonb
  or exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('intent','confirmed','operationId','examProfileId','taskId','subjectId','curriculumNodeId','resourceId','resourceUnitId','durationMinutes','endedAt','accountingIntent','entrySource','note')) then raise exception 'INVALID_DURATION_CONFIRMATION';end if;
 begin op:=(p_payload->>'operationId')::uuid;mins:=(p_payload->>'durationMinutes')::integer;
  if op is null or mins is null or mins<=0 or p_payload->>'durationMinutes'!~'^\d+$' then raise exception 'bad';end if;
 exception when others then raise exception 'INVALID_DURATION_CONFIRMATION';end;
 v_hash:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
 perform 1 from public.exam_profiles where id=(p_payload->>'examProfileId')::uuid and user_id=auth.uid() for update;
 if not found then raise exception 'EXAM_PROFILE_NOT_FOUND';end if;
 select * into existing from p0_session_integrity.retroactive_confirmations where user_id=auth.uid() and operation_id=op for update;
 if found then if existing.request_hash<>v_hash then raise exception 'SESSION_CONFIRMATION_CONFLICT';end if;return existing.result;end if;
 payload:=(p_payload-'intent'-'confirmed'-'operationId')||jsonb_build_object('endedAt',coalesce((p_payload->>'endedAt')::timestamptz,now()),'idempotencyKey','confirmed-retro:'||op::text);
 insert into p0_session_integrity.retroactive_confirmations(user_id,operation_id,tx_id,payload,request_hash) values(auth.uid(),op,txid_current(),payload,v_hash);
 v_result:=public.record_retroactive_session(payload);
 update p0_session_integrity.retroactive_confirmations set session_id=(v_result->>'id')::uuid,result=v_result where user_id=auth.uid() and operation_id=op;
 return v_result;
end $$;

-- A time budget can be fulfilled without finishing a canonical video. Never infer watched material from minutes.
create function p0_session_integrity.guard_canonical_task_completion() returns trigger language plpgsql security definer set search_path='' as $$
declare boundary jsonb:=to_jsonb(new)->'canonical_boundary'; video_id uuid; done boolean;
begin
 if new.status='completed' and boundary->>'kind'='full_video' then
  begin video_id:=(boundary->>'videoId')::uuid;exception when others then video_id:=null;end;
  select exists(select 1 from public.youtube_playlist_videos v join public.youtube_video_progress p on p.youtube_playlist_video_id=v.id and p.user_id=v.user_id where v.id=video_id and v.user_id=new.user_id and v.duration_seconds>0 and p.watched_seconds>=ceil(v.duration_seconds*0.95)) into done;
  if not done then new.status:='partially_completed';new.completed_at:=null;end if;
 end if;return new;
end $$;
create trigger p0_canonical_task_completion_guard before insert or update on public.tasks for each row execute function p0_session_integrity.guard_canonical_task_completion();

revoke all on all functions in schema p0_session_integrity from public,anon,authenticated,service_role;
revoke all on function public.preview_study_session_finish(uuid),public.prepare_study_session_finish(uuid),public.confirm_study_session_finish(uuid,jsonb),public.record_confirmed_retroactive_session(jsonb) from public,anon;
grant execute on function public.preview_study_session_finish(uuid),public.prepare_study_session_finish(uuid),public.confirm_study_session_finish(uuid,jsonb),public.record_confirmed_retroactive_session(jsonb) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
