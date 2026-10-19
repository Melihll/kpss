begin;

-- Requires the four immutable P0 duration migrations. No existing row is changed.
-- Normal postgres runner only. No platform-owner preparation or auth GRANT.
-- SQL-standard INVOKER identity helper uses the existing auth.uid EXECUTE grant.
do $$ begin
 if to_regprocedure('public.confirm_study_session_finish(uuid,jsonb)') is null
    or to_regprocedure('public.finish_study_session_pre_p0_integrity(uuid)') is null then
  raise exception 'SESSION_DURATION_PREREQUISITES_REQUIRED';
 end if;
end $$;

-- This role is never granted to a client or authenticator, and cannot bypass RLS.
do $$ begin
 if not exists(select 1 from pg_roles where rolname='kpss_session_writer') then
  create role kpss_session_writer nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
 elsif exists(select 1 from pg_roles where rolname='kpss_session_writer' and
   (rolcanlogin or rolinherit or rolsuper or rolcreatedb or rolcreaterole or rolbypassrls))
   or exists(select 1 from pg_auth_members where roleid='kpss_session_writer'::regrole and member<>'postgres'::regrole) then
  raise exception 'UNSAFE_SESSION_WRITER_ROLE';
 end if;
end $$;
-- The creator receives role-management authority through standard PostgreSQL
-- CREATEROLE semantics. SET is needed only during ownership transfer.
do $$ begin
 if not pg_has_role('postgres','kpss_session_writer','SET') then
  grant kpss_session_writer to postgres with inherit false,set true;
 end if;
 if not has_function_privilege('kpss_session_writer','auth.uid()','EXECUTE') then
  raise exception 'AUTH_UID_EXECUTE_CONTRACT_REQUIRED';
 end if;
end $$;
grant usage on schema public,p0_session_integrity to kpss_session_writer;

-- Parsed at definition time, unlike an AS string. No privilege elevation:
-- caller still needs EXECUTE on auth.uid(), already granted by the platform.
-- No arguments, table reads, JWT decoding, GUC writes or SECURITY DEFINER.
create function p0_session_integrity.actor_uid() returns uuid
language sql stable security invoker set search_path='' return auth.uid();
revoke all on function p0_session_integrity.actor_uid() from public,anon,authenticated,service_role;
grant execute on function p0_session_integrity.actor_uid() to kpss_session_writer;

grant select,insert,update on public.study_sessions,public.study_session_breaks to kpss_session_writer;
grant select on public.tasks,public.exam_profiles,public.study_session_allocations to kpss_session_writer;
-- PostgreSQL SELECT ... FOR UPDATE requires an UPDATE privilege. This is the
-- established S0 lock-only column grant; no RPC changes a profile ID.
grant update(id) on public.exam_profiles to kpss_session_writer;
-- Grant legacy task/progress writes only when the baseline needs them.
-- LOCAL already uses its separate S0 execution writer for these operations.
do $$ begin
 if not(select prosecdef from pg_proc where oid='public.start_task(uuid)'::regprocedure)
    or not(select prosecdef from pg_proc where oid='public.cancel_study_session(uuid)'::regprocedure) then
  grant update(status) on public.tasks to kpss_session_writer;
 end if;
 if not(select prosecdef from pg_proc where oid='public.start_task(uuid)'::regprocedure) then
  grant select on public.task_progress,public.topic_progress to kpss_session_writer;
  grant insert(task_id,user_id,completed_minutes) on public.task_progress to kpss_session_writer;
  grant update(state,first_started_at) on public.topic_progress to kpss_session_writer;
 end if;
end $$;
grant execute on function public.start_task(uuid),public.account_completed_study_session(uuid,text,text,text) to kpss_session_writer;

create policy session_writer_sessions on public.study_sessions for all to kpss_session_writer
 using (user_id=(select p0_session_integrity.actor_uid())) with check (user_id=(select p0_session_integrity.actor_uid()));
create policy session_writer_breaks on public.study_session_breaks for all to kpss_session_writer
 using (user_id=(select p0_session_integrity.actor_uid())) with check (user_id=(select p0_session_integrity.actor_uid()));
create policy session_writer_tasks on public.tasks for all to kpss_session_writer
 using (user_id=(select p0_session_integrity.actor_uid())) with check (user_id=(select p0_session_integrity.actor_uid()));
create policy session_writer_profiles on public.exam_profiles for select to kpss_session_writer using (user_id=(select p0_session_integrity.actor_uid()));
create policy session_writer_profiles_lock on public.exam_profiles for update to kpss_session_writer
 using (user_id=(select p0_session_integrity.actor_uid())) with check (user_id=(select p0_session_integrity.actor_uid()));
create policy session_writer_allocations on public.study_session_allocations for select to kpss_session_writer using (user_id=(select p0_session_integrity.actor_uid()));
create policy session_writer_task_progress_read on public.task_progress for select to kpss_session_writer using (user_id=(select p0_session_integrity.actor_uid()));
create policy session_writer_task_progress_start on public.task_progress for insert to kpss_session_writer
 with check (user_id=(select p0_session_integrity.actor_uid()) and completed_minutes=0 and actual_study_minutes=0);
create policy session_writer_topic_progress on public.topic_progress for all to kpss_session_writer
 using (user_id=(select p0_session_integrity.actor_uid())) with check (user_id=(select p0_session_integrity.actor_uid()));

-- Only identity lookup changes. Preserve signatures, defaults, object OIDs,
-- ACLs and every other lifecycle statement. Unexpected bodies fail closed.
do $$ declare signature text; targets text[]:=array[
 'public.start_study_session(uuid,text)','public.pause_study_session(uuid)',
 'public.resume_study_session(uuid)','public.record_retroactive_session(jsonb)'];
 fn oid; definition text; rewritten text;
begin
 if not(select prosecdef from pg_proc where oid='public.start_task(uuid)'::regprocedure) then
  targets:=array_append(targets,'public.start_task(uuid)');
 end if;
 if not(select prosecdef from pg_proc where oid='public.cancel_study_session(uuid)'::regprocedure) then
  targets:=array_append(targets,'public.cancel_study_session(uuid)');
 end if;
 foreach signature in array targets loop
  fn:=signature::regprocedure;
  if (select pg_get_userbyid(proowner) from pg_proc where oid=fn)<>'postgres' then
   raise exception 'UNEXPECTED_LIFECYCLE_OWNER: %',signature;
  end if;
  definition:=pg_get_functiondef(fn);
  rewritten:=replace(definition,'auth.uid()','p0_session_integrity.actor_uid()');
  if rewritten=definition then raise exception 'EXPECTED_AUTH_UID_LOOKUP_MISSING: %',signature; end if;
  execute rewritten;
 end loop;
end $$;

-- Preserve lifecycle signatures, defaults and client EXECUTE grants.
-- Temporarily required to transfer function ownership; removed before commit.
grant create on schema public to kpss_session_writer;
alter function public.start_study_session(uuid,text) security definer;
alter function public.start_study_session(uuid,text) owner to kpss_session_writer;
alter function public.pause_study_session(uuid) security definer;
alter function public.pause_study_session(uuid) owner to kpss_session_writer;
alter function public.resume_study_session(uuid) security definer;
alter function public.resume_study_session(uuid) owner to kpss_session_writer;
alter function public.record_retroactive_session(jsonb) security definer;
alter function public.record_retroactive_session(jsonb) owner to kpss_session_writer;
-- The production legacy start_task is invoker and runs inside Start. The same
-- restricted writer supports its existing status/zero-progress/state writes.
do $$ begin
 if not(select prosecdef from pg_proc where oid='public.start_task(uuid)'::regprocedure) then
  alter function public.start_task(uuid) security definer;
  alter function public.start_task(uuid) owner to kpss_session_writer;
 end if;
end $$;
-- LOCAL start_task/cancel retain their existing S0 execution writer owner.
do $$ begin
 if not (select prosecdef from pg_proc where oid='public.cancel_study_session(uuid)'::regprocedure) then
  alter function public.cancel_study_session(uuid) security definer;
  alter function public.cancel_study_session(uuid) owner to kpss_session_writer;
 end if;
end $$;
revoke create on schema public from kpss_session_writer;

-- INVOKER is deliberate: current_user is the actual writing role, not the
-- trigger owner. No session_user, JWT role string, GUC or nullable-UID bypass.
create function p0_session_integrity.guard_session_boundary() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='DELETE' then
  if auth.uid() is not null or current_user not in ('postgres','supabase_admin','supabase_auth_admin') then
   raise exception 'SESSION_DELETE_REQUIRES_ADMIN' using errcode='42501';
  end if;
  return old;
 end if;
 if new.id is distinct from old.id then raise exception 'SESSION_PRIMARY_KEY_IMMUTABLE' using errcode='23514'; end if;
 if (new.user_id,new.exam_profile_id,new.task_id,new.subject_id,new.curriculum_node_id,new.resource_id,new.resource_unit_id,new.started_at,new.session_type,new.entry_source,new.created_at)
    is distinct from
    (old.user_id,old.exam_profile_id,old.task_id,old.subject_id,old.curriculum_node_id,old.resource_id,old.resource_unit_id,old.started_at,old.session_type,old.entry_source,old.created_at) then
  raise exception 'SESSION_IDENTITY_IMMUTABLE' using errcode='23514';
 end if;
 if old.status in ('completed','cancelled') and
    (new.status,new.ended_at,new.duration_minutes,new.accounted_at) is distinct from
    (old.status,old.ended_at,old.duration_minutes,old.accounted_at) then
  raise exception 'SESSION_REPAIR_REQUIRED' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function p0_session_integrity.guard_session_boundary() from public,anon,authenticated,service_role;
create trigger a_session_identity_boundary before update or delete on public.study_sessions
 for each row execute function p0_session_integrity.guard_session_boundary();

-- Close raw session, pause-time, receipt and allocation writers, including
-- service_role: BYPASSRLS does not confer a revoked table privilege.
-- Revoke column ACLs too, so historical column grants cannot retain a write.
do $$ declare t text; cols text; r text; begin
 foreach t in array array['study_sessions','study_session_breaks','study_session_allocations','physical_study_activity_breaks','physical_study_activity_snapshots','physical_pace_evidence'] loop
  execute format('revoke insert,update,delete,truncate,references,trigger on public.%I from public,anon,authenticated,service_role',t);
  select string_agg(format('%I',attname),',') into cols from pg_attribute where attrelid=format('public.%I',t)::regclass and attnum>0 and not attisdropped;
  foreach r in array array['public','anon','authenticated','service_role'] loop
   execute format('revoke insert (%s),update (%s),references (%s) on public.%I from %I',cols,cols,cols,t,r);
  end loop;
 end loop;
end $$;

-- Actual-study aggregates are accounting outputs, not client input. Retain
-- manual task-completion and topic-state interfaces without permitting them to
-- fabricate actual study time or move/delete already credited aggregates.
create function p0_session_integrity.guard_actual_study_rollup() returns trigger
language plpgsql security invoker set search_path='' as $$
declare before_row jsonb; after_row jsonb; k text; previous integer; incoming integer;
begin
 if current_user not in ('anon','authenticated','service_role') then
  if tg_op='DELETE' then return old; else return new; end if;
 end if;
 k:=case when tg_table_name='task_progress' then 'actual_study_minutes' else 'total_study_minutes' end;
 before_row:=case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
 after_row:=case when tg_op='DELETE' then '{}'::jsonb else to_jsonb(new) end;
 previous:=coalesce((before_row->>k)::integer,0);incoming:=coalesce((after_row->>k)::integer,0);
 if incoming<>previous or (previous>0 and
   (tg_op='DELETE' or (before_row->'id',before_row->'user_id',before_row->'task_id',before_row->'exam_profile_id',before_row->'curriculum_node_id')
    is distinct from (after_row->'id',after_row->'user_id',after_row->'task_id',after_row->'exam_profile_id',after_row->'curriculum_node_id'))) then
  raise exception 'permission denied: SESSION_ACCOUNTING_WRITE_REQUIRED' using errcode='42501';
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function p0_session_integrity.guard_actual_study_rollup() from public,anon,authenticated,service_role;
create trigger a_session_actual_rollup_boundary before insert or update or delete on public.task_progress
 for each row execute function p0_session_integrity.guard_actual_study_rollup();
create trigger a_session_actual_rollup_boundary before insert or update or delete on public.topic_progress
 for each row execute function p0_session_integrity.guard_actual_study_rollup();

-- Fail closed if the migration owner could not grant a required capability;
-- PostgreSQL otherwise reports some failed GRANTs only as warnings.
do $$ begin
 if not has_function_privilege('kpss_session_writer','p0_session_integrity.actor_uid()','EXECUTE')
    or has_schema_privilege('kpss_session_writer','auth','USAGE')
    or not has_table_privilege('kpss_session_writer','public.study_sessions','INSERT')
    or not has_table_privilege('kpss_session_writer','public.study_sessions','UPDATE')
    or has_schema_privilege('kpss_session_writer','public','CREATE') then
  raise exception 'SESSION_WRITER_AUTHORITY_INCOMPLETE';
 end if;
end $$;

-- Remove our temporary SET membership. The standard creator ADMIN grant is
-- retained solely for postgres to manage its own role in future migrations;
-- it has neither SET nor INHERIT and is never granted to an API/client role.
revoke kpss_session_writer from postgres granted by postgres;
do $$ begin
 if exists(select 1 from pg_auth_members where roleid='kpss_session_writer'::regrole
   and (member<>'postgres'::regrole or set_option or inherit_option)) then
  raise exception 'UNEXPECTED_RUNTIME_WRITER_MEMBERSHIP';
 end if;
end $$;
notify pgrst,'reload schema';
commit;
