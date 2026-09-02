begin;

-- A confirmed proposal that expires before Apply is no longer confirmed.
-- Keep the existing confirmation-state constraint strict by clearing the
-- current-confirmation marker in the same statement as the terminal state
-- transition. All Apply authority and transaction invariants remain unchanged.

create or replace function public.apply_planner_v2_proposal_candidate(
  p_actor_user_id uuid,
  p_actor_exam_profile_id uuid,
  p_record_id uuid,
  p_planner_proposal_id text,
  p_proposal_fingerprint text,
  p_planner_snapshot_fingerprint text,
  p_planner_version text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := p_actor_user_id;
  v_row public.confirmed_action_proposals;
  v_plan public.weekly_plans;
  v_create jsonb;
  v_task_id uuid;
  v_resource_unit_id uuid;
  v_video public.youtube_playlist_videos;
  v_watched_seconds integer := 0;
  v_created_ids uuid[] := array[]::uuid[];
  v_replaced_ids uuid[] := array[]::uuid[];
  v_expected_minutes integer := 0;
  v_actual_minutes integer := 0;
  v_new_plan_minutes integer := 0;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'FORBIDDEN'; end if;
  if v_user is null or p_actor_exam_profile_id is null then
    raise exception 'PLANNER_V2_ACTOR_BINDING_REQUIRED';
  end if;
  select * into v_row from public.confirmed_action_proposals
  where id=p_record_id and user_id=v_user
    and exam_profile_id=p_actor_exam_profile_id and action_kind='planner_v2_week'
  for update;
  if not found then raise exception 'PLANNER_V2_PROPOSAL_NOT_FOUND'; end if;
  if v_row.planner_proposal_id <> p_planner_proposal_id
    or v_row.proposal_fingerprint <> p_proposal_fingerprint
    or v_row.planner_snapshot_fingerprint <> p_planner_snapshot_fingerprint
    or v_row.planner_version <> p_planner_version
  then raise exception 'PLANNER_V2_APPLY_IDENTITY_MISMATCH'; end if;
  perform 1 from public.exam_profiles ep
  where ep.id=p_actor_exam_profile_id and ep.user_id=v_user and ep.status='active';
  if not found then raise exception 'PLANNER_V2_ACTOR_PROFILE_MISMATCH'; end if;
  if v_row.status='applied' then
    return coalesce(v_row.result_payload,'{}'::jsonb)
      || jsonb_build_object('idempotent',true,'recordId',v_row.id);
  end if;
  if v_row.status <> 'confirmed' then raise exception 'PLANNER_V2_EXPLICIT_CONFIRMATION_REQUIRED'; end if;
  if v_row.expires_at <= now() then
    update public.confirmed_action_proposals
    set status='expired',confirmed_at=null
    where id=v_row.id;
    return jsonb_build_object('recordId',v_row.id,'state','expired','applied',false);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text,62));
  select * into v_plan from public.weekly_plans
  where id=v_row.weekly_plan_id and user_id=v_user
    and exam_profile_id=v_row.exam_profile_id and status='active'
  for update;
  if not found then raise exception 'WEEKLY_PLAN_NOT_FOUND'; end if;
  if v_plan.generation_version <> v_row.plan_generation_version
    or public.planner_v2_database_fingerprint(v_user,v_plan.id) <> v_row.snapshot_fingerprint
  then
    update public.confirmed_action_proposals set status='stale',confirmed_at=null where id=v_row.id;
    return jsonb_build_object('recordId',v_row.id,'state','stale','applied',false);
  end if;

  if (v_row.mutation_payload->>'horizonStart')::date > (v_row.mutation_payload->>'horizonEnd')::date
    or (v_row.mutation_payload->>'userId')::uuid <> v_user
    or (v_row.mutation_payload->>'examProfileId')::uuid <> v_plan.exam_profile_id
    or coalesce((v_row.mutation_payload->>'atomicRequired')::boolean,false) is not true
    or coalesce((v_row.mutation_payload->>'applyCandidateOnly')::boolean,false) is not true
  then raise exception 'PLANNER_V2_APPLY_CONTRACT_INVALID'; end if;

  if exists (
    with creates as (
      select (value->>'plannedDate')::date as date,
        sum((value->>'estimatedMinutes')::integer)::integer as minutes
      from jsonb_array_elements(coalesce(v_row.mutation_payload->'creates','[]'::jsonb))
      group by (value->>'plannedDate')::date
    ), days as (
      select (value->>'date')::date as date,
        (value->>'proposedMinutes')::integer as proposed_minutes,
        (value->>'availableMinutes')::integer as available_minutes
      from jsonb_array_elements(coalesce(v_row.display_payload->'days','[]'::jsonb))
    )
    select 1 from creates full join days using(date)
    where coalesce(creates.minutes,0) <> coalesce(days.proposed_minutes,0)
      or coalesce(creates.minutes,0) > coalesce(days.available_minutes,0)
  ) then raise exception 'PLANNER_V2_EXACT_DAILY_CAPACITY_RECHECK_FAILED'; end if;

  if exists (
    select 1 from jsonb_array_elements_text(coalesce(v_row.mutation_payload->'replaceableTaskIds','[]'::jsonb)) x(id)
    left join public.tasks t on t.id=x.id::uuid and t.user_id=v_user and t.weekly_plan_id=v_plan.id
    where t.id is null or t.planned_date <= current_date
      or t.planned_date not between (v_row.mutation_payload->>'horizonStart')::date and (v_row.mutation_payload->>'horizonEnd')::date
      or t.status not in ('planned','ready','rescheduled')
      or t.source_reason not in ('planner_v2','curriculum_progress','resource_progress','revision_due','dynamic_replan')
  ) then raise exception 'PLANNER_V2_REPLACEMENT_SCOPE_UNSAFE'; end if;

  update public.tasks t set status='cancelled',planned_date=null
  where t.user_id=v_user and t.weekly_plan_id=v_plan.id
    and t.id in (
      select value::uuid
      from jsonb_array_elements_text(coalesce(v_row.mutation_payload->'replaceableTaskIds','[]'::jsonb))
    );
  select coalesce(array_agg(value::uuid order by value),'{}') into v_replaced_ids
  from jsonb_array_elements_text(coalesce(v_row.mutation_payload->'replaceableTaskIds','[]'::jsonb));

  for v_create in select value from jsonb_array_elements(coalesce(v_row.mutation_payload->'creates','[]'::jsonb))
  loop
    if nullif(btrim(v_create->>'canonicalWorkloadIdentity'),'') is null
      or nullif(btrim(v_create->>'materialViewId'),'') is null
      or v_create->>'workloadAuthority'='unknown'
      or (v_create->>'estimatedMinutes')::integer <= 0
      or (v_create->>'plannedDate')::date <= current_date
      or (v_create->>'plannedDate')::date not between
        (v_row.mutation_payload->>'horizonStart')::date and (v_row.mutation_payload->>'horizonEnd')::date
    then raise exception 'PLANNER_V2_CREATE_UNSAFE'; end if;
    perform 1 from public.resources r
    where r.id=(v_create->>'resourceId')::uuid and r.user_id=v_user
      and r.exam_profile_id=v_plan.exam_profile_id
      and r.subject_id=(v_create->>'subjectId')::uuid and r.status='active';
    if not found then raise exception 'PLANNER_V2_RESOURCE_OWNER_MISMATCH'; end if;

    v_resource_unit_id := null;
    if v_create#>>'{boundary,kind}'='physical_pages' then
      if v_create->>'canonicalWorkloadIdentity' !~ '^physical:[0-9a-fA-F-]{36}$' then
        raise exception 'PLANNER_V2_PHYSICAL_IDENTITY_NOT_PERSISTABLE';
      end if;
      v_resource_unit_id := substring(v_create->>'canonicalWorkloadIdentity' from 10)::uuid;
      perform 1 from public.resource_units ru
      where ru.id=v_resource_unit_id and ru.resource_id=(v_create->>'resourceId')::uuid
        and ru.is_active=true
        and ru.page_start=(v_create#>>'{boundary,pageStart}')::integer
        and ru.page_end=(v_create#>>'{boundary,pageEnd}')::integer
        and (v_create#>>'{boundary,remainingPageStart}')::integer between ru.page_start and ru.page_end
        and (v_create#>>'{boundary,remainingPageEnd}')::integer between ru.page_start and ru.page_end;
      if not found then raise exception 'PLANNER_V2_PHYSICAL_BOUNDARY_STALE'; end if;
    elsif v_create#>>'{boundary,kind}'='full_video' then
      select * into v_video from public.youtube_playlist_videos
      where id=(v_create#>>'{boundary,videoId}')::uuid and user_id=v_user
        and exam_profile_id=v_plan.exam_profile_id and is_active=true;
      if not found
        or v_create->>'canonicalWorkloadIdentity' <> 'youtube:'||v_video.id::text
        or (v_create#>>'{boundary,durationSeconds}')::integer <> v_video.duration_seconds
      then raise exception 'PLANNER_V2_YOUTUBE_BOUNDARY_STALE'; end if;
      select coalesce((
        select vp.watched_seconds from public.youtube_video_progress vp
        where vp.user_id=v_user and vp.youtube_playlist_video_id=v_video.id
      ),0) into v_watched_seconds;
      if (v_create#>>'{boundary,watchedSeconds}')::integer <> v_watched_seconds
      then raise exception 'PLANNER_V2_YOUTUBE_PROGRESS_STALE'; end if;
    else raise exception 'PLANNER_V2_BOUNDARY_UNSUPPORTED'; end if;

    insert into public.tasks(
      user_id,exam_profile_id,weekly_plan_id,subject_id,curriculum_node_id,resource_id,
      task_type,work_mode,title,planned_date,estimated_minutes,importance,priority_score,status,
      source_reason,dedupe_key,canonical_workload_identity,canonical_material_view_id,
      canonical_boundary,planner_version,planner_proposal_fingerprint
    ) values(
      v_user,v_plan.exam_profile_id,v_plan.id,(v_create->>'subjectId')::uuid,
      nullif(v_create->>'curriculumNodeId','')::uuid,(v_create->>'resourceId')::uuid,
      v_create->>'taskType',v_create->>'workMode',v_create->>'title',(v_create->>'plannedDate')::date,
      (v_create->>'estimatedMinutes')::integer,'important',50,'ready','planner_v2',
      v_create->>'dedupeKey',v_create->>'canonicalWorkloadIdentity',
      v_create->>'materialViewId',v_create->'boundary',v_row.planner_version,
      v_row.proposal_fingerprint
    ) returning id into v_task_id;
    insert into public.task_progress(task_id,user_id) values(v_task_id,v_user);
    if v_resource_unit_id is not null then
      insert into public.task_resource_units(user_id,task_id,resource_unit_id)
      values(v_user,v_task_id,v_resource_unit_id);
    end if;
    v_created_ids := array_append(v_created_ids,v_task_id);
    v_actual_minutes := v_actual_minutes+(v_create->>'estimatedMinutes')::integer;
  end loop;

  v_expected_minutes := (v_row.mutation_payload->>'expectedNewMinutes')::integer;
  if v_actual_minutes <> v_expected_minutes then raise exception 'PLANNER_V2_MINUTES_MISMATCH'; end if;
  select coalesce(sum(estimated_minutes),0)::integer into v_new_plan_minutes
  from public.tasks where weekly_plan_id=v_plan.id and user_id=v_user
    and status not in ('cancelled','missed');
  if v_new_plan_minutes > v_plan.planning_budget_minutes then
    raise exception 'PLANNER_V2_EXACT_CAPACITY_RECHECK_FAILED';
  end if;

  update public.weekly_plans set planned_minutes=v_new_plan_minutes,
    generation_version=generation_version+1 where id=v_plan.id;
  update public.confirmed_action_proposals set status='applied',applied_at=now(),
    result_payload=jsonb_build_object(
      'recordId',v_row.id,'proposalId',v_row.planner_proposal_id,'state','applied',
      'applied',true,'createdTaskIds',to_jsonb(v_created_ids),
      'replacedTaskIds',to_jsonb(v_replaced_ids),'plannedMinutes',v_new_plan_minutes,
      'idempotent',false
    ) where id=v_row.id returning result_payload into v_row.result_payload;
  return v_row.result_payload;
end;
$$;

revoke all on function public.apply_planner_v2_proposal_candidate(uuid,uuid,uuid,text,text,text,text)
from public,anon,authenticated;
grant execute on function public.apply_planner_v2_proposal_candidate(uuid,uuid,uuid,text,text,text,text)
to service_role;

commit;
