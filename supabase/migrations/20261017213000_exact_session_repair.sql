begin;
-- UNAPPLIED CANDIDATE. One native-operator approval, one 1402 -> 60 repair.
-- No public RPC, client membership, JWT/GUC flag, RLS bypass or data seed.
do $$ begin
 if (select count(*) from supabase_migrations.schema_migrations)<>46
 or (select md5(prosrc) from pg_proc where oid='p0_session_integrity.guard_session_boundary()'::regprocedure)<>'232f2a67ce3b6583057da2346e179836' then
  raise exception 'EXACT_PRODUCTION46_BOUNDARY_REQUIRED';
 end if;
 if exists(select 1 from pg_roles where rolname='kpss_session_repairer') then raise exception 'REPAIR_ROLE_ALREADY_EXISTS';end if;
 create role kpss_session_repairer nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
 grant kpss_session_repairer to postgres with inherit false,set true;
end $$;
create schema p0_session_repair authorization postgres;
revoke all on schema p0_session_repair from public,anon,authenticated,service_role;
grant usage,create on schema p0_session_repair to kpss_session_repairer;
grant usage on schema public to kpss_session_repairer;

create table p0_session_repair.approval (
 singleton boolean not null default true unique check(singleton),
 operation_id uuid primary key,session_id uuid not null unique,user_id uuid not null,
 profile_id uuid not null,task_id uuid not null,resource_id uuid not null,
 week_start date not null,expected_revision text not null check(expected_revision~'^[a-f0-9]{64}$'),
 approval_hash text not null check(approval_hash~'^[a-f0-9]{64}$'),
 state text not null default 'approved' check(state in ('approved','applying','applied')),
 applying_tx bigint,applying_pid integer,created_at timestamptz not null default now()
);
create table p0_session_repair.receipt (
 operation_id uuid primary key references p0_session_repair.approval(operation_id),
 request_hash text not null,before_state jsonb not null,after_state jsonb not null,
 approval_hash text not null,operator_name text not null,applied_at timestamptz not null default now()
);
revoke all on all tables in schema p0_session_repair from public,anon,authenticated,service_role;
grant select on p0_session_repair.approval,p0_session_repair.receipt to kpss_session_repairer;
grant update(state,applying_tx,applying_pid) on p0_session_repair.approval to kpss_session_repairer;
grant insert on p0_session_repair.receipt to kpss_session_repairer;

create function p0_session_repair.scope(p_kind text,p_key uuid,p_owner uuid,p_profile uuid default null,p_started timestamptz default null)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from p0_session_repair.approval a where a.user_id=p_owner and
  (p_profile is null or a.profile_id=p_profile) and case p_kind
   when 'session_read' then p_key=a.session_id or date_trunc('week',p_started at time zone 'Europe/Istanbul')::date=a.week_start
   when 'session' then p_key=a.session_id when 'task' then p_key=a.task_id
   when 'resource' then p_key=a.resource_id when 'profile' then p_key=a.profile_id
   when 'owner' then true else false end);
$$;
grant select on public.study_sessions,public.study_session_allocations,public.task_progress,public.tasks,
 public.exam_profiles,public.resources,public.resource_progress,public.resource_units,public.resource_unit_progress,
 public.youtube_video_progress,public.youtube_playlist_videos,public.topic_resource_links,
 public.physical_pace_evidence,public.physical_study_activity_snapshots,public.task_resource_units,
 public.topic_progress,public.weekly_reports to kpss_session_repairer;
grant update(duration_minutes) on public.study_sessions to kpss_session_repairer;
grant update(actual_minutes) on public.study_session_allocations to kpss_session_repairer;
grant update(actual_study_minutes) on public.task_progress to kpss_session_repairer;
grant update(id) on public.exam_profiles,public.resources,public.tasks to kpss_session_repairer; -- row locks only
-- PostgreSQL requires an UPDATE column privilege even for FOR SHARE locks.
-- Only immutable target keys are granted; no material value is writable.
grant update(resource_id) on public.resource_progress to kpss_session_repairer;
grant update(resource_unit_id) on public.resource_unit_progress to kpss_session_repairer;
grant update(youtube_playlist_video_id) on public.youtube_video_progress to kpss_session_repairer;
grant update(actual_minutes,plan_status,explanation) on public.weekly_reports to kpss_session_repairer;
create policy repair_session_read on public.study_sessions for select to kpss_session_repairer using(p0_session_repair.scope('session_read',id,user_id,exam_profile_id,started_at));
create policy repair_session_write on public.study_sessions for update to kpss_session_repairer using(p0_session_repair.scope('session',id,user_id,exam_profile_id)) with check(p0_session_repair.scope('session',id,user_id,exam_profile_id));
create policy repair_allocation_read on public.study_session_allocations for select to kpss_session_repairer using(p0_session_repair.scope('session',session_id,user_id,exam_profile_id) or p0_session_repair.scope('task',target_task_id,user_id,exam_profile_id));
create policy repair_allocation_write on public.study_session_allocations for update to kpss_session_repairer using(p0_session_repair.scope('session',session_id,user_id,exam_profile_id)) with check(p0_session_repair.scope('session',session_id,user_id,exam_profile_id));
create policy repair_task on public.tasks for select to kpss_session_repairer using(p0_session_repair.scope('task',id,user_id,exam_profile_id));
create policy repair_task_lock on public.tasks for update to kpss_session_repairer using(p0_session_repair.scope('task',id,user_id,exam_profile_id)) with check(p0_session_repair.scope('task',id,user_id,exam_profile_id));
create policy repair_task_progress_read on public.task_progress for select to kpss_session_repairer using(p0_session_repair.scope('task',task_id,user_id));
create policy repair_task_progress_write on public.task_progress for update to kpss_session_repairer using(p0_session_repair.scope('task',task_id,user_id)) with check(p0_session_repair.scope('task',task_id,user_id));
create policy repair_profile on public.exam_profiles for all to kpss_session_repairer using(p0_session_repair.scope('profile',id,user_id,id)) with check(p0_session_repair.scope('profile',id,user_id,id));
create policy repair_resource on public.resources for all to kpss_session_repairer using(p0_session_repair.scope('resource',id,user_id,exam_profile_id)) with check(p0_session_repair.scope('resource',id,user_id,exam_profile_id));
create policy repair_pages on public.resource_progress for select to kpss_session_repairer using(p0_session_repair.scope('resource',resource_id,user_id,exam_profile_id));
create policy repair_pages_lock on public.resource_progress for update to kpss_session_repairer using(p0_session_repair.scope('resource',resource_id,user_id,exam_profile_id)) with check(p0_session_repair.scope('resource',resource_id,user_id,exam_profile_id));
create policy repair_units on public.resource_units for select to kpss_session_repairer using(exists(select 1 from p0_session_repair.approval a where a.resource_id=resource_units.resource_id));
create policy repair_unit_progress on public.resource_unit_progress for select to kpss_session_repairer using(p0_session_repair.scope('owner',null,user_id) and exists(select 1 from public.resource_units u where u.id=resource_unit_progress.resource_unit_id));
create policy repair_unit_progress_lock on public.resource_unit_progress for update to kpss_session_repairer using(p0_session_repair.scope('owner',null,user_id) and exists(select 1 from public.resource_units u where u.id=resource_unit_progress.resource_unit_id)) with check(p0_session_repair.scope('owner',null,user_id) and exists(select 1 from public.resource_units u where u.id=resource_unit_progress.resource_unit_id));
create policy repair_links on public.topic_resource_links for select to kpss_session_repairer using(p0_session_repair.scope('resource',resource_id,user_id,exam_profile_id));
create policy repair_videos on public.youtube_playlist_videos for select to kpss_session_repairer using(p0_session_repair.scope('owner',null,user_id,exam_profile_id) and exists(select 1 from public.topic_resource_links l where l.youtube_playlist_id=youtube_playlist_videos.youtube_playlist_id));
create policy repair_video_progress on public.youtube_video_progress for select to kpss_session_repairer using(p0_session_repair.scope('owner',null,user_id,exam_profile_id) and exists(select 1 from public.youtube_playlist_videos v where v.id=youtube_video_progress.youtube_playlist_video_id));
create policy repair_video_progress_lock on public.youtube_video_progress for update to kpss_session_repairer using(p0_session_repair.scope('owner',null,user_id,exam_profile_id) and exists(select 1 from public.youtube_playlist_videos v where v.id=youtube_video_progress.youtube_playlist_video_id)) with check(p0_session_repair.scope('owner',null,user_id,exam_profile_id) and exists(select 1 from public.youtube_playlist_videos v where v.id=youtube_video_progress.youtube_playlist_video_id));
create policy repair_physical on public.physical_pace_evidence for select to kpss_session_repairer using(p0_session_repair.scope('session',study_session_id,user_id,exam_profile_id));
create policy repair_physical_snapshot on public.physical_study_activity_snapshots for select to kpss_session_repairer using(p0_session_repair.scope('session',study_session_id,user_id,exam_profile_id));
create policy repair_task_units on public.task_resource_units for select to kpss_session_repairer using(exists(select 1 from p0_session_repair.approval a where a.task_id=task_resource_units.task_id));
create policy repair_topic on public.topic_progress for select to kpss_session_repairer using(p0_session_repair.scope('owner',null,user_id,exam_profile_id) and exists(select 1 from public.study_sessions s where s.curriculum_node_id=topic_progress.curriculum_node_id and s.id=(select session_id from p0_session_repair.approval)));
create policy repair_report_read on public.weekly_reports for select to kpss_session_repairer using(exists(select 1 from p0_session_repair.approval a where a.user_id=weekly_reports.user_id and a.profile_id=weekly_reports.exam_profile_id and a.week_start=weekly_reports.week_start_date));
create policy repair_report_write on public.weekly_reports for update to kpss_session_repairer using(exists(select 1 from p0_session_repair.approval a where a.user_id=weekly_reports.user_id and a.profile_id=weekly_reports.exam_profile_id and a.week_start=weekly_reports.week_start_date)) with check(exists(select 1 from p0_session_repair.approval a where a.user_id=weekly_reports.user_id and a.profile_id=weekly_reports.exam_profile_id and a.week_start=weekly_reports.week_start_date));

create function p0_session_repair.snapshot(p_session uuid) returns jsonb
language sql volatile security definer set search_path='' as $$
 with s as(select * from public.study_sessions where id=p_session and p_session=(select session_id from p0_session_repair.approval))
 select jsonb_build_object(
 'session',(select to_jsonb(s) from s),
 'allocations',(select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]') from public.study_session_allocations a join s on a.session_id=s.id),
 'task',(select to_jsonb(t) from public.tasks t join s on t.id=s.task_id and t.user_id=s.user_id),
 'taskProgress',(select to_jsonb(p) from public.task_progress p join s on p.task_id=s.task_id and p.user_id=s.user_id),
 'topicProgress',(select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]') from public.topic_progress p join s on p.user_id=s.user_id and p.exam_profile_id=s.exam_profile_id and p.curriculum_node_id=s.curriculum_node_id),
 'otherTaskAllocations',(select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]') from public.study_session_allocations a join s on a.target_task_id=s.task_id and a.user_id=s.user_id where a.session_id<>s.id and a.superseded_at is null),
 'linkedUnits',(select coalesce(jsonb_agg(to_jsonb(u) order by u.resource_unit_id),'[]') from public.task_resource_units u join s on u.task_id=s.task_id),
 'pages',(select coalesce(jsonb_agg(to_jsonb(p) order by p.resource_id),'[]') from public.resource_progress p join s on p.user_id=s.user_id and p.exam_profile_id=s.exam_profile_id and p.resource_id=s.resource_id),
 'unitProgress',(select coalesce(jsonb_agg(to_jsonb(p) order by p.resource_unit_id),'[]') from public.resource_unit_progress p join public.resource_units u on u.id=p.resource_unit_id join s on u.resource_id=s.resource_id and p.user_id=s.user_id),
 'videoProgress',(select coalesce(jsonb_agg(to_jsonb(p) order by p.youtube_playlist_video_id),'[]') from public.youtube_video_progress p join public.youtube_playlist_videos v on v.id=p.youtube_playlist_video_id join s on p.user_id=s.user_id and p.exam_profile_id=s.exam_profile_id where exists(select 1 from public.topic_resource_links l where l.resource_id=s.resource_id and l.user_id=s.user_id and l.youtube_playlist_id=v.youtube_playlist_id)),
 'physicalEvidence',(select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]') from public.physical_pace_evidence p join s on p.study_session_id=s.id),
 'physicalSnapshots',(select coalesce(jsonb_agg(to_jsonb(p) order by p.study_session_id),'[]') from public.physical_study_activity_snapshots p join s on p.study_session_id=s.id),
 'weeklyReports',(select coalesce(jsonb_agg(to_jsonb(w) order by w.id),'[]') from public.weekly_reports w join s on w.user_id=s.user_id and w.exam_profile_id=s.exam_profile_id and w.week_start_date=date_trunc('week',s.started_at at time zone 'Europe/Istanbul')::date));
$$;
create function p0_session_repair.revision(v jsonb) returns text language sql immutable set search_path='' as $$select encode(sha256(convert_to(v::text,'UTF8')),'hex')$$;
create function p0_session_repair.session_change_allowed(o public.study_sessions,n public.study_sessions)
returns boolean language sql stable security invoker set search_path='' as $$
 select o.status='completed' and o.duration_minutes=1402 and n.duration_minutes=60
 and (to_jsonb(o)-'duration_minutes'-'updated_at')=(to_jsonb(n)-'duration_minutes'-'updated_at')
 and exists(select 1 from p0_session_repair.approval a where a.session_id=o.id and a.user_id=o.user_id and a.profile_id=o.exam_profile_id and a.task_id=o.task_id and a.resource_id=o.resource_id and a.state='applying' and a.applying_tx=txid_current() and a.applying_pid=pg_backend_pid());
$$;
do $$ declare d text; begin
 select pg_get_functiondef('p0_session_integrity.guard_session_boundary()'::regprocedure) into d;
 d:=replace(d,'raise exception ''SESSION_REPAIR_REQUIRED'' using errcode=''23514'';',
  'if current_user=''kpss_session_repairer'' then
    if not p0_session_repair.session_change_allowed(old,new) then raise exception ''SESSION_REPAIR_REQUIRED'' using errcode=''23514'';end if;
   else raise exception ''SESSION_REPAIR_REQUIRED'' using errcode=''23514'';end if;');
 execute d;
end $$;
create function p0_session_repair.guard_allocation_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 -- Leave every unapproved session's existing accounting contract unchanged.
 if not exists(select 1 from p0_session_repair.approval a where a.session_id=old.session_id and a.user_id=old.user_id and a.profile_id=old.exam_profile_id) then return new;end if;
 if new.actual_minutes is distinct from old.actual_minutes or new.planned_credit_minutes is distinct from old.planned_credit_minutes then
  if old.actual_minutes<>1402 or new.actual_minutes<>60 or old.planned_credit_minutes<>60
   or (to_jsonb(old)-'actual_minutes')<>(to_jsonb(new)-'actual_minutes')
   or not exists(select 1 from p0_session_repair.approval a where a.session_id=old.session_id and a.user_id=old.user_id and a.state='applying' and a.applying_tx=txid_current() and a.applying_pid=pg_backend_pid()) then raise exception 'SESSION_REPAIR_REQUIRED';end if;
 end if;return new;
end $$;
create trigger p0_exact_allocation_repair before update on public.study_session_allocations for each row execute function p0_session_repair.guard_allocation_change();
create function p0_session_repair.immutable_receipt() returns trigger language plpgsql set search_path='' as $$begin raise exception 'REPAIR_AUDIT_IMMUTABLE';end $$;
create trigger repair_receipt_append_only before update or delete or truncate on p0_session_repair.receipt for each statement execute function p0_session_repair.immutable_receipt();

-- Existing cached report readers must see the same canonical corrected total.
-- Only the approved actor/profile/week is affected. Recompute stale in-flight
-- upserts under a fail-fast profile/accounting lock instead of accepting old sums.
create function p0_session_repair.guard_report() returns trigger
language plpgsql security definer set search_path='' as $$
declare a p0_session_repair.approval;c numeric;r numeric;br boolean;pr boolean;signals int;tail text;
begin
 select * into a from p0_session_repair.approval where user_id=new.user_id and profile_id=new.exam_profile_id and week_start=new.week_start_date;
 if not found then return new;end if;
 perform 1 from public.exam_profiles where id=a.profile_id and user_id=a.user_id for update nowait;
 if not pg_try_advisory_xact_lock(hashtextextended(a.user_id::text,52)) then raise exception 'REPAIR_REPORT_RETRY' using errcode='55P03';end if;
 select coalesce(sum(duration_minutes),0)::integer into new.actual_minutes from public.study_sessions where user_id=a.user_id and exam_profile_id=a.profile_id and status='completed' and date_trunc('week',started_at at time zone 'Europe/Istanbul')::date=a.week_start;
 c:=case when new.planned_task_count>0 then new.completed_task_count::numeric/new.planned_task_count else 1 end;
 r:=case when new.planned_minutes>0 then new.actual_minutes::numeric/new.planned_minutes else 1 end;
 br:=new.backlog_severity in ('risk','critical');pr:=upper(new.projection_status)='RISK';
 signals:=(c<0.65)::int+(r<0.65)::int+br::int+pr::int;
 new.plan_status:=case when signals>=2 then 'risk' when c>=0.8 and r>=0.8 and not br and not pr then 'good' else 'attention' end;
 tail:=case when br then 'Backlog yükseldiği için gelecek hafta açık görevler önceliklendirilmeli.' when pr then 'Müfredat projeksiyonu risk gösterdiği için haftalık kapasite yeniden gözden geçirilmeli.' when new.plan_status='good' then 'Plan ve gerçek çalışma dengesi pilot hedefiyle uyumlu.' else 'Planı yakalamak için gelecek hafta günlük gerçekleşen süre takip edilmeli.' end;
 new.explanation:=format('Bu hafta planlanan sürenin %s%s''i ve görevlerin %s%s''i tamamlandı. %s','%',floor(greatest(0,r)*100+0.5),'%',floor(greatest(0,c)*100+0.5),tail);
 return new;
end $$;
create trigger p0_exact_repair_report before insert or update on public.weekly_reports for each row execute function p0_session_repair.guard_report();

create function p0_session_repair.authorize(p_operation uuid,p_session uuid,p_user uuid,p_profile uuid,p_task uuid,p_resource uuid,p_week date,p_revision text,p_approval_hash text)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if current_user<>'postgres' or session_user<>'postgres' then raise exception 'NATIVE_OPERATOR_REQUIRED';end if;
 if exists(select 1 from p0_session_repair.approval) then raise exception 'SINGLE_REPAIR_APPROVAL_ALREADY_REGISTERED';end if;
 insert into p0_session_repair.approval(operation_id,session_id,user_id,profile_id,task_id,resource_id,week_start,expected_revision,approval_hash)
 values(p_operation,p_session,p_user,p_profile,p_task,p_resource,p_week,p_revision,p_approval_hash);
end $$;
create function p0_session_repair.apply(p_operation uuid,p_expected_revision text,p_actual_minutes integer default 60)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a p0_session_repair.approval;b jsonb;n jsonb;h text;receipt p0_session_repair.receipt;sid uuid;aid uuid;old_week_total integer;
begin
 if session_user<>'postgres' then raise exception 'NATIVE_OPERATOR_REQUIRED';end if;
 h:=p0_session_repair.revision(jsonb_build_object('operation',p_operation,'revision',p_expected_revision,'minutes',p_actual_minutes));
 select * into a from p0_session_repair.approval where operation_id=p_operation for update;
 if not found then raise exception 'REPAIR_NOT_APPROVED';end if;
 select * into receipt from p0_session_repair.receipt where operation_id=p_operation;
 if found then
  if receipt.request_hash<>h then raise exception 'REPAIR_OPERATION_CONFLICT';end if;
  return jsonb_build_object('idempotent',true,'receipt',to_jsonb(receipt));
 end if;
 if p_actual_minutes is distinct from 60 then raise exception 'REPAIR_OPERATION_CONFLICT';end if;
 if p_expected_revision is distinct from a.expected_revision then raise exception 'REPAIR_STALE';end if;
 perform 1 from public.exam_profiles where id=a.profile_id and user_id=a.user_id for update;
 if not found then raise exception 'REPAIR_SCOPE_MISMATCH';end if;
 perform pg_advisory_xact_lock(hashtextextended(a.user_id::text,52));
 perform 1 from public.study_sessions where id=a.session_id and user_id=a.user_id for update;
 perform 1 from public.tasks where id=a.task_id and user_id=a.user_id for update;
 perform 1 from public.task_progress where task_id=a.task_id and user_id=a.user_id for update;
 perform 1 from public.resources where id=a.resource_id and user_id=a.user_id for update;
 perform 1 from public.study_session_allocations where session_id=a.session_id and user_id=a.user_id for update;
 perform 1 from public.resource_progress where resource_id=a.resource_id and user_id=a.user_id for share;
 perform 1 from public.resource_unit_progress where user_id=a.user_id and exists(select 1 from public.resource_units u where u.id=resource_unit_progress.resource_unit_id and u.resource_id=a.resource_id) for share;
 perform 1 from public.youtube_video_progress where user_id=a.user_id and exam_profile_id=a.profile_id for share;
 perform 1 from public.weekly_reports where user_id=a.user_id and exam_profile_id=a.profile_id and week_start_date=a.week_start for update;
 b:=p0_session_repair.snapshot(a.session_id);
 if p0_session_repair.revision(b)<>a.expected_revision then raise exception 'REPAIR_STALE';end if;
 if b#>>'{session,status}'<>'completed' or (b#>>'{session,duration_minutes}')::integer<>1402
  or (b#>>'{taskProgress,actual_study_minutes}')::integer<>1402 or (b#>>'{taskProgress,completed_minutes}')::integer<>60
  or b#>>'{task,status}'<>'completed' or b#>>'{session,curriculum_node_id}' is not null or b#>>'{session,resource_unit_id}' is not null or b#>>'{task,curriculum_node_id}' is not null
  or jsonb_array_length(b->'linkedUnits')<>0 or jsonb_array_length(b->'otherTaskAllocations')<>0
  or jsonb_array_length(b->'allocations')<>1 or (b#>>'{allocations,0,actual_minutes}')::integer<>1402 or (b#>>'{allocations,0,planned_credit_minutes}')::integer<>60 or b#>>'{allocations,0,superseded_at}' is not null
  or jsonb_array_length(b->'physicalEvidence')<>0 or jsonb_array_length(b->'physicalSnapshots')<>0 then raise exception 'REPAIR_SCOPE_UNSUPPORTED';end if;
 if (b#>>'{session,exam_profile_id}')::uuid<>a.profile_id or (b#>>'{session,task_id}')::uuid<>a.task_id or (b#>>'{session,resource_id}')::uuid<>a.resource_id then raise exception 'REPAIR_SCOPE_MISMATCH';end if;
 aid:=(b#>>'{allocations,0,id}')::uuid;
 update p0_session_repair.approval set state='applying',applying_tx=txid_current(),applying_pid=pg_backend_pid() where operation_id=p_operation;
 update public.study_sessions set duration_minutes=60 where id=a.session_id and user_id=a.user_id;
 if not found then raise exception 'REPAIR_SESSION_WRITE_MISSING';end if;
 update public.study_session_allocations set actual_minutes=60 where id=aid and session_id=a.session_id and user_id=a.user_id and actual_minutes=1402 and planned_credit_minutes=60 and superseded_at is null;
 if not found then raise exception 'REPAIR_ALLOCATION_WRITE_MISSING';end if;
 update public.task_progress set actual_study_minutes=60 where task_id=a.task_id and user_id=a.user_id and actual_study_minutes=1402 and completed_minutes=60;
 if not found then raise exception 'REPAIR_ROLLUP_WRITE_MISSING';end if;
 update public.weekly_reports set actual_minutes=actual_minutes where user_id=a.user_id and exam_profile_id=a.profile_id and week_start_date=a.week_start;
 n:=p0_session_repair.snapshot(a.session_id);
 if (n#>>'{session,duration_minutes}')::integer<>60 or (n#>>'{taskProgress,actual_study_minutes}')::integer<>60 or (n#>>'{taskProgress,completed_minutes}')::integer<>60
  or jsonb_array_length(n->'allocations')<>1 or (n#>>'{allocations,0,actual_minutes}')::integer<>60 or (n#>>'{allocations,0,planned_credit_minutes}')::integer<>60
  or (b-'session'-'allocations'-'taskProgress'-'weeklyReports')<>(n-'session'-'allocations'-'taskProgress'-'weeklyReports')
  or ((b->'session')-'duration_minutes'-'updated_at')<>((n->'session')-'duration_minutes'-'updated_at')
  or ((b#>'{allocations,0}')-'actual_minutes')<>((n#>'{allocations,0}')-'actual_minutes')
  or ((b->'taskProgress')-'actual_study_minutes'-'updated_at')<>((n->'taskProgress')-'actual_study_minutes'-'updated_at') then raise exception 'REPAIR_POSTCONDITION_FAILED';end if;
 insert into p0_session_repair.receipt(operation_id,request_hash,before_state,after_state,approval_hash,operator_name)
 values(p_operation,h,b,n,a.approval_hash,session_user) returning * into receipt;
 update p0_session_repair.approval set state='applied',applying_tx=null,applying_pid=null where operation_id=p_operation;
 return jsonb_build_object('idempotent',false,'receipt',to_jsonb(receipt));
end $$;

-- Transfer only the restricted functions. authorize stays INVOKER/postgres.
do $$ declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='p0_session_repair' and p.proname<>'authorize' loop
  execute format('alter function %s owner to kpss_session_repairer',f.signature);
 end loop;
end $$;
revoke all on all functions in schema p0_session_repair from public,anon,authenticated,service_role;
grant execute on all functions in schema p0_session_repair to kpss_session_repairer;
revoke execute on function p0_session_repair.authorize(uuid,uuid,uuid,uuid,uuid,uuid,date,text,text) from kpss_session_repairer;
grant execute on function p0_session_repair.authorize(uuid,uuid,uuid,uuid,uuid,uuid,date,text,text),p0_session_repair.apply(uuid,text,integer),p0_session_repair.snapshot(uuid),p0_session_repair.revision(jsonb) to postgres;
revoke create on schema p0_session_repair from kpss_session_repairer;
revoke kpss_session_repairer from postgres granted by postgres;
do $$ begin
 if exists(select 1 from pg_auth_members where roleid='kpss_session_repairer'::regrole and (member<>'postgres'::regrole or inherit_option or set_option)) then raise exception 'UNSAFE_REPAIR_MEMBERSHIP';end if;
end $$;
commit;
