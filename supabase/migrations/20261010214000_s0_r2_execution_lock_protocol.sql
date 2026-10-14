begin;
-- All execution paths take the same actor/profile lock before task/session locks.

CREATE OR REPLACE FUNCTION public.start_physical_study_session(p_task_id uuid, p_resource_unit_id uuid, p_entry_source text DEFAULT 'web'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := auth.uid();
  t public.tasks;
  v_unit public.resource_units;
  v_section public.resource_sections;
  v_progress public.resource_unit_progress;
  s public.study_sessions;
  v_start_boundary integer;
  v_material_type text;
begin
  if v_user is null then raise exception 'UNAUTHORIZED'; end if;
  perform 1 from public.exam_profiles where user_id=v_user and id=(select exam_profile_id from public.tasks where id=p_task_id and user_id=v_user) for update;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user::text, 0)
  );

  if exists (
    select 1
    from public.study_sessions existing
    where existing.user_id = v_user
      and existing.status = 'active'
  ) then
    raise exception 'ACTIVE_SESSION_EXISTS';
  end if;

  select * into t
  from public.tasks
  where id = p_task_id
    and user_id = v_user
  for update;

  if not found then raise exception 'TASK_NOT_FOUND'; end if;

  select * into v_unit
  from public.resource_units
  where id = p_resource_unit_id
  for update;

  if not found then raise exception 'RESOURCE_UNIT_NOT_FOUND'; end if;

  if not exists (
    select 1
    from public.resources r
    where r.id = v_unit.resource_id
      and r.user_id = v_user
      and r.exam_profile_id = t.exam_profile_id
      and r.subject_id = t.subject_id
      and r.id = t.resource_id
  ) then
    raise exception 'RESOURCE_UNIT_OWNER_MISMATCH';
  end if;

  if not exists (
    select 1
    from public.task_resource_units tru
    where tru.task_id = t.id
      and tru.resource_unit_id = v_unit.id
      and tru.user_id = v_user
      and tru.status = 'pending'
  ) then
    raise exception 'RESOURCE_UNIT_NOT_PENDING_FOR_TASK';
  end if;

  if v_unit.is_active is not true
     or v_unit.page_start is null
     or v_unit.page_end is null
     or v_unit.page_start <= 0
     or v_unit.page_end < v_unit.page_start then
    raise exception 'PHYSICAL_RESOURCE_UNIT_RANGE_INVALID';
  end if;

  v_material_type := case
    when v_unit.unit_type = 'test' then 'test'
    else 'page_range'
  end;

  if v_unit.resource_section_id is not null then
    select * into v_section
    from public.resource_sections
    where id = v_unit.resource_section_id
      and resource_id = v_unit.resource_id;

    if not found then raise exception 'RESOURCE_SECTION_NOT_FOUND'; end if;
  end if;

  select * into v_progress
  from public.resource_unit_progress
  where user_id = v_user
    and resource_unit_id = v_unit.id
  for update;

  if not found or v_progress.status = 'not_started' then
    v_start_boundary := v_unit.page_start - 1;
  elsif v_progress.status = 'in_progress'
        and v_progress.completed_through_page is not null
        and v_progress.completed_through_page >= v_unit.page_start
        and v_progress.completed_through_page < v_unit.page_end then
    v_start_boundary := v_progress.completed_through_page;
  elsif v_progress.status = 'completed' then
    raise exception 'PHYSICAL_RESOURCE_UNIT_ALREADY_COMPLETED';
  elsif v_progress.status = 'skipped' then
    raise exception 'PHYSICAL_RESOURCE_UNIT_SKIPPED';
  else
    raise exception 'PHYSICAL_PROGRESS_BOUNDARY_UNAVAILABLE';
  end if;

  perform public.start_task(t.id);

  insert into public.study_sessions (
    user_id,
    exam_profile_id,
    task_id,
    subject_id,
    curriculum_node_id,
    resource_id,
    resource_unit_id,
    session_type,
    started_at,
    status,
    entry_source
  ) values (
    v_user,
    t.exam_profile_id,
    t.id,
    t.subject_id,
    t.curriculum_node_id,
    v_unit.resource_id,
    v_unit.id,
    'task',
    now(),
    'active',
    p_entry_source
  )
  returning * into s;

  insert into public.physical_study_activity_snapshots (
    study_session_id,
    user_id,
    exam_profile_id,
    task_id,
    subject_id,
    resource_id,
    resource_section_id,
    resource_unit_id,
    curriculum_node_id,
    material_type,
    unit_page_start,
    unit_page_end,
    start_page_boundary,
    activity_started_at
  ) values (
    s.id,
    v_user,
    t.exam_profile_id,
    t.id,
    t.subject_id,
    v_unit.resource_id,
    v_unit.resource_section_id,
    v_unit.id,
    v_section.curriculum_node_id,
    v_material_type,
    v_unit.page_start,
    v_unit.page_end,
    v_start_boundary,
    s.started_at
  );

  return to_jsonb(s) || jsonb_build_object(
    'materialType', v_material_type,
    'startPageBoundary', v_start_boundary,
    'paceEvidenceCapture', 'candidate'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.pause_physical_study_session(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := auth.uid();
  s public.study_sessions;
  v_snapshot public.physical_study_activity_snapshots;
  v_break public.physical_study_activity_breaks;
  v_common jsonb;
begin
  if v_user is null then raise exception 'UNAUTHORIZED'; end if;
  perform 1 from public.exam_profiles where user_id=v_user and id=(select exam_profile_id from public.study_sessions where id=p_session_id and user_id=v_user) for update;

  select * into s
  from public.study_sessions
  where id = p_session_id
    and user_id = v_user
  for update;

  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if s.status <> 'active' then raise exception 'SESSION_NOT_ACTIVE'; end if;

  select * into v_snapshot
  from public.physical_study_activity_snapshots
  where study_session_id = s.id
    and user_id = v_user
  for update;

  if not found then raise exception 'PHYSICAL_PACE_SESSION_REQUIRED'; end if;

  v_common := public.pause_study_session(s.id);

  select * into v_break
  from public.physical_study_activity_breaks
  where study_session_id = s.id
    and user_id = v_user
    and ended_at is null
  for update;

  if not found then
    insert into public.physical_study_activity_breaks (
      study_session_id,
      user_id,
      exam_profile_id,
      started_at
    ) values (
      s.id,
      v_user,
      v_snapshot.exam_profile_id,
      now()
    )
    returning * into v_break;
  end if;

  return v_common || jsonb_build_object(
    'physicalBreak', to_jsonb(v_break),
    'physicalPaceEvidenceCapture', true
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.resume_physical_study_session(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := auth.uid();
  s public.study_sessions;
  v_break public.physical_study_activity_breaks;
  v_common jsonb;
  v_resumed_at timestamptz := now();
begin
  if v_user is null then raise exception 'UNAUTHORIZED'; end if;
  perform 1 from public.exam_profiles where user_id=v_user and id=(select exam_profile_id from public.study_sessions where id=p_session_id and user_id=v_user) for update;

  select * into s
  from public.study_sessions
  where id = p_session_id
    and user_id = v_user
  for update;

  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if s.status <> 'active' then raise exception 'SESSION_NOT_ACTIVE'; end if;

  perform 1
  from public.physical_study_activity_snapshots
  where study_session_id = s.id
    and user_id = v_user
  for update;

  if not found then raise exception 'PHYSICAL_PACE_SESSION_REQUIRED'; end if;

  v_common := public.resume_study_session(s.id);

  select * into v_break
  from public.physical_study_activity_breaks
  where study_session_id = s.id
    and user_id = v_user
    and ended_at is null
  for update;

  if found then
    update public.physical_study_activity_breaks
    set ended_at = v_resumed_at
    where id = v_break.id
    returning * into v_break;
  end if;

  return v_common || jsonb_build_object(
    'physicalBreak', case
      when v_break.id is null then null
      else to_jsonb(v_break)
    end,
    'physicalPaceEvidenceCapture', true
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.finish_physical_study_session(p_session_id uuid, p_end_page_boundary integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := auth.uid();
  s public.study_sessions;
  v_snapshot public.physical_study_activity_snapshots;
  v_unit public.resource_units;
  v_progress public.resource_unit_progress;
  v_existing public.physical_pace_evidence;
  v_evidence public.physical_pace_evidence;
  v_current_boundary integer;
  v_active_seconds integer;
  mins integer;
  break_seconds numeric := 0;
  v_common_pause_open boolean;
  v_physical_pause_open boolean;
  finished_at timestamptz := now();
  v_accounting jsonb;
begin
  if v_user is null then raise exception 'UNAUTHORIZED'; end if;
  perform 1 from public.exam_profiles where user_id=v_user and id=(select exam_profile_id from public.study_sessions where id=p_session_id and user_id=v_user) for update;

  select * into s
  from public.study_sessions
  where id = p_session_id
    and user_id = v_user
  for update;

  if not found then raise exception 'SESSION_NOT_FOUND'; end if;

  if s.status = 'completed' then
    select * into v_existing
    from public.physical_pace_evidence
    where user_id = v_user
      and study_session_id = s.id;

    return to_jsonb(s) || jsonb_build_object(
      'evidence', case
        when v_existing.id is not null then to_jsonb(v_existing)
        else null
      end,
      'idempotent', true
    );
  end if;

  if s.status <> 'active' then raise exception 'SESSION_NOT_ACTIVE'; end if;

  select * into v_snapshot
  from public.physical_study_activity_snapshots
  where study_session_id = s.id
    and user_id = v_user
  for update;

  if not found then raise exception 'PHYSICAL_PACE_SESSION_REQUIRED'; end if;

  if s.exam_profile_id is distinct from v_snapshot.exam_profile_id
     or s.task_id is distinct from v_snapshot.task_id
     or s.subject_id is distinct from v_snapshot.subject_id
     or s.resource_id is distinct from v_snapshot.resource_id
     or s.resource_unit_id is distinct from v_snapshot.resource_unit_id then
    raise exception 'PHYSICAL_SESSION_IDENTITY_CHANGED';
  end if;

  select * into v_unit
  from public.resource_units
  where id = v_snapshot.resource_unit_id
    and resource_id = v_snapshot.resource_id
  for update;

  if not found
     or v_unit.is_active is not true
     or v_unit.page_start is distinct from v_snapshot.unit_page_start
     or v_unit.page_end is distinct from v_snapshot.unit_page_end
     or v_unit.resource_section_id is distinct from v_snapshot.resource_section_id
     or (case when v_unit.unit_type = 'test' then 'test' else 'page_range' end)
        is distinct from v_snapshot.material_type then
    raise exception 'PHYSICAL_RESOURCE_UNIT_RANGE_INVALID';
  end if;

  if p_end_page_boundary < v_snapshot.unit_page_start - 1
     or p_end_page_boundary > v_snapshot.unit_page_end then
    raise exception 'PHYSICAL_PAGE_BOUNDARY_INVALID';
  end if;

  if p_end_page_boundary < v_snapshot.start_page_boundary then
    raise exception 'PHYSICAL_PROGRESS_REVERSAL';
  end if;

  select * into v_progress
  from public.resource_unit_progress
  where user_id = v_user
    and resource_unit_id = v_snapshot.resource_unit_id
  for update;

  if not found or v_progress.status = 'not_started' then
    v_current_boundary := v_snapshot.unit_page_start - 1;
  elsif v_progress.status = 'in_progress'
        and v_progress.completed_through_page is not null
        and v_progress.completed_through_page >= v_snapshot.unit_page_start
        and v_progress.completed_through_page < v_snapshot.unit_page_end then
    v_current_boundary := v_progress.completed_through_page;
  elsif v_progress.status = 'completed' then
    v_current_boundary := v_snapshot.unit_page_end;
  else
    raise exception 'PHYSICAL_PROGRESS_BOUNDARY_UNAVAILABLE';
  end if;

  if v_current_boundary <> v_snapshot.start_page_boundary then
    raise exception 'PHYSICAL_PROGRESS_CHANGED_DURING_SESSION';
  end if;

  select exists (
    select 1
    from public.study_session_breaks
    where session_id = s.id
      and user_id = v_user
      and ended_at is null
  ) into v_common_pause_open;

  select exists (
    select 1
    from public.physical_study_activity_breaks
    where study_session_id = s.id
      and user_id = v_user
      and ended_at is null
  ) into v_physical_pause_open;

  if v_common_pause_open is distinct from v_physical_pause_open then
    raise exception 'PHYSICAL_BREAK_STATE_MISMATCH';
  end if;

  update public.study_session_breaks
  set ended_at = finished_at
  where session_id = s.id
    and user_id = v_user
    and ended_at is null;

  update public.physical_study_activity_breaks
  set ended_at = finished_at
  where study_session_id = s.id
    and user_id = v_user
    and ended_at is null;

  select coalesce(
    sum(extract(epoch from (ended_at - started_at))),
    0
  ) into break_seconds
  from public.physical_study_activity_breaks
  where study_session_id = s.id
    and user_id = v_user
    and ended_at is not null;

  v_active_seconds := floor(greatest(
    0,
    extract(epoch from (finished_at-v_snapshot.activity_started_at))-break_seconds
  ))::integer;

  if p_end_page_boundary > v_snapshot.start_page_boundary
     and v_active_seconds <= 0 then
    raise exception 'PHYSICAL_ACTIVE_TIME_REQUIRED';
  end if;

  mins := greatest(1, floor(v_active_seconds / 60.0)::integer);

  update public.study_sessions
  set ended_at = finished_at,
      duration_minutes = mins,
      status = 'completed',
      accounted_at = finished_at
  where id = s.id
    and user_id = v_user
  returning * into s;

  v_accounting := public.account_completed_study_session(
    s.id,
    'planned',
    'inferred_task_start',
    'session:' || s.id::text || ':primary'
  );

  if p_end_page_boundary = v_snapshot.start_page_boundary then
    return v_accounting || jsonb_build_object(
      'evidence',null,
      'zeroProgress',true,
      'idempotent',false
    );
  end if;

  insert into public.resource_unit_progress (
    user_id,
    resource_unit_id,
    status,
    completed_at,
    completed_through_page,
    attempt_count
  ) values (
    v_user,
    v_snapshot.resource_unit_id,
    case when p_end_page_boundary = v_snapshot.unit_page_end
      then 'completed' else 'in_progress' end,
    case when p_end_page_boundary = v_snapshot.unit_page_end
      then finished_at else null end,
    p_end_page_boundary,
    1
  )
  on conflict (user_id, resource_unit_id) do update set
    status = excluded.status,
    completed_at = excluded.completed_at,
    completed_through_page = excluded.completed_through_page,
    attempt_count = public.resource_unit_progress.attempt_count + 1;

  insert into public.physical_pace_evidence (
    user_id,
    exam_profile_id,
    study_session_id,
    subject_id,
    resource_id,
    resource_section_id,
    resource_unit_id,
    curriculum_node_id,
    material_type,
    progress_unit,
    start_page_boundary,
    end_page_boundary,
    actual_active_seconds,
    activity_started_at,
    activity_ended_at,
    evidence_status,
    evidence_provenance,
    rejection_reason
  ) values (
    v_user,
    v_snapshot.exam_profile_id,
    s.id,
    v_snapshot.subject_id,
    v_snapshot.resource_id,
    v_snapshot.resource_section_id,
    v_snapshot.resource_unit_id,
    v_snapshot.curriculum_node_id,
    v_snapshot.material_type,
    'page',
    v_snapshot.start_page_boundary,
    p_end_page_boundary,
    v_active_seconds,
    v_snapshot.activity_started_at,
    finished_at,
    'accepted',
    'atomic_physical_finish',
    null
  )
  returning * into v_evidence;

  if p_end_page_boundary = v_snapshot.unit_page_end then
    perform public.complete_task_unit(
      v_snapshot.task_id,
      v_snapshot.resource_unit_id
    );
  end if;

  return v_accounting || jsonb_build_object(
    'evidence',to_jsonb(v_evidence),
    'zeroProgress',false,
    'idempotent',false
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.account_completed_study_session(p_session_id uuid, p_accounting_intent text, p_intent_source text, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := auth.uid();
  v_session public.study_sessions;
  v_task public.tasks;
  v_allocation public.study_session_allocations;
  v_existing public.study_session_allocations;
  v_current_minutes integer := 0;
  v_remaining_minutes integer := 0;
  v_actual_minutes integer;
  v_credit_minutes integer := 0;
  v_target_task_id uuid := null;
begin
  if v_user is null then raise exception 'UNAUTHORIZED'; end if;
  perform 1 from public.exam_profiles where user_id=v_user and id=(select exam_profile_id from public.study_sessions where id=p_session_id and user_id=v_user) for update;
  if nullif(btrim(p_idempotency_key),'') is null then raise exception 'STUDY_INTENT_IDEMPOTENCY_REQUIRED'; end if;
  if p_accounting_intent not in ('planned','extra','unknown') then raise exception 'STUDY_INTENT_REQUIRED'; end if;
  if p_intent_source not in ('inferred_task_start','user_selected','confirmed_action','historical_unknown') then
    raise exception 'STUDY_INTENT_SOURCE_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text,52));

  select * into v_existing
  from public.study_session_allocations
  where user_id=v_user and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.session_id <> p_session_id then raise exception 'STUDY_INTENT_IDEMPOTENCY_CONFLICT'; end if;
    select * into v_session from public.study_sessions where id=p_session_id and user_id=v_user;
    return to_jsonb(v_session) || jsonb_build_object('allocation',to_jsonb(v_existing),'idempotent',true);
  end if;

  select * into v_session
  from public.study_sessions
  where id=p_session_id and user_id=v_user
  for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if v_session.status <> 'completed' or v_session.duration_minutes is null then raise exception 'SESSION_NOT_COMPLETED'; end if;

  select * into v_existing
  from public.study_session_allocations
  where session_id=v_session.id and user_id=v_user and superseded_at is null
  order by recorded_at desc limit 1;
  if found then
    return to_jsonb(v_session) || jsonb_build_object('allocation',to_jsonb(v_existing),'idempotent',true);
  end if;

  v_actual_minutes := v_session.duration_minutes;
  if p_accounting_intent='planned' then
    if v_session.task_id is null then raise exception 'STUDY_INTENT_TARGET_REQUIRED'; end if;
    select * into v_task
    from public.tasks
    where id=v_session.task_id and user_id=v_user and exam_profile_id=v_session.exam_profile_id
    for update;
    if not found then raise exception 'TASK_NOT_FOUND'; end if;
    select coalesce(completed_minutes,0) into v_current_minutes
    from public.task_progress
    where task_id=v_task.id and user_id=v_user
    for update;
    v_current_minutes := coalesce(v_current_minutes,0);
    v_remaining_minutes := greatest(0,v_task.estimated_minutes-v_current_minutes);
    v_credit_minutes := least(v_actual_minutes,v_remaining_minutes);
    v_target_task_id := v_task.id;
  elsif p_accounting_intent='extra' then
    v_credit_minutes := 0;
  else
    if p_intent_source <> 'historical_unknown' then raise exception 'STUDY_INTENT_UNKNOWN_NEW_RECORD'; end if;
    v_credit_minutes := 0;
  end if;

  insert into public.study_session_allocations(
    user_id,exam_profile_id,session_id,accounting_intent,target_task_id,
    subject_id,curriculum_node_id,resource_id,resource_unit_id,
    actual_minutes,planned_credit_minutes,intent_source,idempotency_key,
    reason,recorded_by
  ) values(
    v_user,v_session.exam_profile_id,v_session.id,p_accounting_intent,v_target_task_id,
    v_session.subject_id,v_session.curriculum_node_id,v_session.resource_id,v_session.resource_unit_id,
    v_actual_minutes,v_credit_minutes,p_intent_source,p_idempotency_key,
    case when p_accounting_intent='extra' then 'voluntary_extra' else 'session_accounting' end,
    v_user::text
  ) returning * into v_allocation;

  if v_session.task_id is not null then
    insert into public.task_progress(task_id,user_id,completed_minutes,actual_study_minutes)
    values(v_session.task_id,v_user,v_credit_minutes,v_actual_minutes)
    on conflict(task_id) do update set
      completed_minutes=least(
        (select estimated_minutes from public.tasks where id=v_session.task_id),
        public.task_progress.completed_minutes+v_credit_minutes
      ),
      actual_study_minutes=public.task_progress.actual_study_minutes+v_actual_minutes;
    if p_accounting_intent='planned' then
      select completed_minutes into v_current_minutes
      from public.task_progress where task_id=v_session.task_id;
      perform public.update_task_progress(v_session.task_id,v_current_minutes);
    end if;
  end if;

  if v_session.curriculum_node_id is not null then
    update public.topic_progress
    set total_study_minutes=total_study_minutes+v_actual_minutes
    where user_id=v_user
      and exam_profile_id=v_session.exam_profile_id
      and curriculum_node_id=v_session.curriculum_node_id;
  end if;

  return to_jsonb(v_session) || jsonb_build_object('allocation',to_jsonb(v_allocation),'idempotent',false);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_plan_revision(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_before jsonb; v_after jsonb; v_id uuid; v_total integer; v_available integer;
  v_user uuid := auth.uid();
  v_plan public.weekly_plans;
  v_revision public.plan_revisions;
  v_item jsonb;
  v_task public.tasks;
  v_risk jsonb;
  v_type text;
  v_backlog public.backlog_states;
begin
  if v_user is null then raise exception 'UNAUTHORIZED'; end if;
  select exam_profile_id into v_id from public.weekly_plans where id=(p_payload->>'weeklyPlanId')::uuid and user_id=v_user;
  perform 1 from public.exam_profiles where id=v_id and user_id=v_user and status='active' for update;
  if not found then raise exception 'WEEKLY_PLAN_NOT_FOUND'; end if;
  select * into v_plan
  from public.weekly_plans
  where id=(p_payload->>'weeklyPlanId')::uuid
    and user_id=v_user
    and status='active'
  for update;
  if not found then raise exception 'WEEKLY_PLAN_NOT_FOUND'; end if;

  select * into v_revision
  from public.plan_revisions
  where user_id=v_user and dedupe_key=p_payload->>'dedupeKey';
  if found then
    return jsonb_build_object('revision',to_jsonb(v_revision),'idempotent',true);
  end if;

  if p_payload->>'intent' is distinct from 'apply_revision' then raise exception 'EXPLICIT_INTENT_REQUIRED'; end if;
  v_before:=kpss_s0_private.planning_inputs(v_plan.exam_profile_id,v_plan.week_start_date);
  if p_payload->>'expectedFingerprint' is null then raise exception 'PLANNING_FRESHNESS_REQUIRED'; end if;
  if p_payload->>'expectedFingerprint' is distinct from md5(v_before::text) then raise exception 'PLANNING_INPUT_STALE'; end if;
  if p_payload->>'revisionType' is distinct from 'strategic_proposal' then
  for v_id in select value::uuid from jsonb_array_elements_text(coalesce(p_payload->'tasksToBacklog','[]'))
    union select (value->>'taskId')::uuid from jsonb_array_elements(coalesce(p_payload->'tasksToMove','[]'))
    union select value::uuid from jsonb_array_elements_text(coalesce(p_payload->'tasksToCancel','[]')) loop
   select * into v_task from public.tasks where id=v_id and user_id=v_user and weekly_plan_id=v_plan.id;
   if not found or v_task.status not in ('planned','ready','rescheduled') or v_task.planned_date<=(now() at time zone 'Europe/Istanbul')::date
    or v_task.source_reason not in ('curriculum_progress','resource_progress','revision_due','dynamic_replan')
    or v_task.carried_from_task_id is not null or v_task.canonical_workload_identity is not null or v_task.canonical_material_view_id is not null or v_task.canonical_boundary is not null or v_task.planner_version is not null or v_task.planner_proposal_fingerprint is not null
    or exists(select 1 from public.task_progress where task_id=v_task.id and completed_minutes>0)
    or exists(select 1 from public.task_carryovers where source_task_id=v_task.id and status='applied')
   then raise exception 'TASK_NOT_REPLANNABLE'; end if;
  end loop;
  end if;
  insert into public.plan_revisions(
    user_id,exam_profile_id,weekly_plan_id,revision_type,reason_code,
    before_planned_minutes,after_planned_minutes,changed_task_count,explanation,dedupe_key
  ) values(
    v_user,v_plan.exam_profile_id,v_plan.id,p_payload->>'revisionType',p_payload->>'reasonCode',
    v_plan.planned_minutes,(p_payload->>'afterPlannedMinutes')::int,
    (p_payload->>'changedTaskCount')::int,p_payload->>'explanation',p_payload->>'dedupeKey'
  ) returning * into v_revision;

  if p_payload->>'revisionType'='strategic_proposal' then
    return jsonb_build_object('revision',to_jsonb(v_revision),'proposal',true,'idempotent',false);
  end if;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_payload->'tasksToBacklog','[]'))
  loop
    select * into v_task
    from public.tasks
    where id=(v_item#>>'{}')::uuid and user_id=v_user and weekly_plan_id=v_plan.id
    for update;
    if not found or v_task.status not in('planned','ready','rescheduled') then
      raise exception 'TASK_NOT_REPLANNABLE';
    end if;
    update public.tasks
    set planned_date=null,status='rescheduled'
    where id=v_task.id;
  end loop;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_payload->'tasksToMove','[]'))
  loop
    select * into v_task
    from public.tasks
    where id=(v_item->>'taskId')::uuid and user_id=v_user and weekly_plan_id=v_plan.id
    for update;
    if not found or v_task.status in('completed','in_progress','partially_completed') then
      raise exception 'TASK_NOT_REPLANNABLE';
    end if;
    update public.tasks
    set planned_date=(v_item->>'toDate')::date,status='rescheduled'
    where id=v_task.id;
    insert into public.task_reschedule_events(user_id,task_id,from_date,to_date,reason)
    values(v_user,v_task.id,v_task.planned_date,(v_item->>'toDate')::date,v_item->>'reason');
  end loop;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_payload->'tasksToCancel','[]'))
  loop
    update public.tasks
    set status='cancelled'
    where id=(v_item#>>'{}')::uuid and user_id=v_user and weekly_plan_id=v_plan.id
      and status not in('completed','in_progress','partially_completed');
    if not found then raise exception 'TASK_NOT_REPLANNABLE'; end if;
  end loop;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_payload->'tasksToCreate','[]'))
  loop
    if not exists(select 1 from public.revision_schedules r join public.curriculum_nodes n on n.id=r.curriculum_node_id
      where r.id=(v_item->>'revisionScheduleId')::uuid and r.user_id=v_user and r.exam_profile_id=v_plan.exam_profile_id
        and r.status in ('scheduled','due') and r.curriculum_node_id=(v_item->>'curriculumNodeId')::uuid
        and n.subject_id=(v_item->>'subjectId')::uuid and n.is_active
        and r.estimated_minutes=(v_item->>'estimatedMinutes')::integer)
    then raise exception 'INVALID_REVISION_SOURCE'; end if;
    v_task := null;
    insert into public.tasks(
      user_id,exam_profile_id,weekly_plan_id,subject_id,curriculum_node_id,revision_schedule_id,
      task_type,title,planned_date,estimated_minutes,importance,priority_score,status,source_reason,dedupe_key
    ) values(
      v_user,v_plan.exam_profile_id,v_plan.id,(v_item->>'subjectId')::uuid,
      (v_item->>'curriculumNodeId')::uuid,(v_item->>'revisionScheduleId')::uuid,
      'review_topic',v_item->>'title',(v_item->>'plannedDate')::date,
      (v_item->>'estimatedMinutes')::int,v_item->>'importance',(v_item->>'priorityScore')::int,
      'ready','revision_due',v_item->>'dedupeKey'
    )
    on conflict(user_id,revision_schedule_id) where revision_schedule_id is not null
    do nothing
    returning * into v_task;
    if v_task.id is not null then
      insert into public.task_progress(task_id,user_id)
      values(v_task.id,v_user)
      on conflict do nothing;
    end if;
  end loop;

  v_after:=kpss_s0_private.planning_inputs(v_plan.exam_profile_id,v_plan.week_start_date);
  perform kpss_s0_private.validate_plan_delta(v_before,v_after);
  select coalesce(sum(value::numeric),0)::integer into v_available from jsonb_each_text(kpss_s0_private.day_capacities(jsonb_set(jsonb_set(v_after,'{today}',to_jsonb(v_plan.week_start_date)),'{allocations}','[]'::jsonb),'p48'));
  select coalesce(sum(estimated_minutes),0)::integer into v_total from public.tasks where weekly_plan_id=v_plan.id and user_id=v_user and status not in ('cancelled','missed');
  update public.weekly_plans
  set available_minutes=v_available,
      planning_budget_minutes=v_available,
      planned_minutes=v_total,
      generation_version=generation_version+1
  where id=v_plan.id;

  insert into public.backlog_states(
    user_id,exam_profile_id,weekly_plan_id,open_task_count,open_core_count,
    open_important_count,open_optional_count,estimated_remaining_minutes,
    remaining_capacity_minutes,capacity_ratio,severity
  ) values(
    v_user,v_plan.exam_profile_id,v_plan.id,
    (p_payload#>>'{backlog,openTaskCount}')::int,
    (p_payload#>>'{backlog,openCoreCount}')::int,
    (p_payload#>>'{backlog,openImportantCount}')::int,
    (p_payload#>>'{backlog,openOptionalCount}')::int,
    (p_payload#>>'{backlog,estimatedRemainingMinutes}')::int,
    (p_payload#>>'{backlog,remainingCapacityMinutes}')::int,
    (p_payload#>>'{backlog,capacityRatio}')::numeric,
    p_payload#>>'{backlog,severity}'
  )
  on conflict(user_id,weekly_plan_id) do update set
    open_task_count=excluded.open_task_count,
    open_core_count=excluded.open_core_count,
    open_important_count=excluded.open_important_count,
    open_optional_count=excluded.open_optional_count,
    estimated_remaining_minutes=excluded.estimated_remaining_minutes,
    remaining_capacity_minutes=excluded.remaining_capacity_minutes,
    capacity_ratio=excluded.capacity_ratio,
    severity=excluded.severity
  returning * into v_backlog;

  for v_type in
    select unnest(array['capacity_shortfall','backlog_overload','syllabus_delay','revision_overload'])
  loop
    select value into v_risk
    from jsonb_array_elements(coalesce(p_payload->'risks','[]'))
    where value->>'riskType'=v_type
    limit 1;
    if v_risk is null then
      update public.plan_risks
      set status='resolved',resolved_at=now()
      where user_id=v_user and exam_profile_id=v_plan.exam_profile_id
        and risk_type=v_type and status='open';
    else
      insert into public.plan_risks(
        user_id,exam_profile_id,weekly_plan_id,risk_type,severity,
        reason_code,metric_value,message
      ) values(
        v_user,v_plan.exam_profile_id,v_plan.id,v_type,v_risk->>'severity',
        v_risk->>'reasonCode',(v_risk->>'metricValue')::numeric,v_risk->>'message'
      )
      on conflict(user_id,exam_profile_id,risk_type) where status='open'
      do update set
        severity=excluded.severity,
        reason_code=excluded.reason_code,
        metric_value=excluded.metric_value,
        message=excluded.message,
        weekly_plan_id=excluded.weekly_plan_id;
    end if;
    v_risk := null;
  end loop;

  return jsonb_build_object(
    'revision',to_jsonb(v_revision),'backlog',to_jsonb(v_backlog),'idempotent',false
  );
end
$function$
;

notify pgrst,'reload schema';
commit;
