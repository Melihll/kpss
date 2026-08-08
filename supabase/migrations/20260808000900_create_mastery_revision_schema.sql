alter table public.topic_progress
  add constraint topic_progress_profile_node_user_unique
  unique (exam_profile_id,curriculum_node_id,user_id);

alter table public.test_results
  add constraint test_results_id_user_profile_unique
  unique (id,user_id,exam_profile_id);

create table public.topic_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_profile_id uuid not null,
  curriculum_node_id uuid not null,
  trigger_type text not null,
  source_test_result_id uuid null,
  source_result_updated_at timestamptz null,
  sample_question_count integer not null,
  sample_correct_count integer not null,
  sample_wrong_count integer not null,
  sample_blank_count integer not null,
  accuracy numeric generated always as (sample_correct_count::numeric / sample_question_count::numeric) stored,
  previous_mastery_level text not null,
  resulting_mastery_level text not null,
  assessment_reason text not null,
  created_at timestamptz not null default now(),
  constraint topic_assessments_progress_owner_fk
    foreign key (exam_profile_id,curriculum_node_id,user_id)
    references public.topic_progress(exam_profile_id,curriculum_node_id,user_id) on delete cascade,
  constraint topic_assessments_curriculum_node_fk
    foreign key (curriculum_node_id) references public.curriculum_nodes(id),
  constraint topic_assessments_source_result_fk
    foreign key (source_test_result_id,user_id,exam_profile_id)
    references public.test_results(id,user_id,exam_profile_id) on delete cascade,
  constraint topic_assessments_trigger_valid check (trigger_type in ('test_result','revision_result','manual_recalculation')),
  constraint topic_assessments_counts_nonnegative check (
    sample_question_count>0 and sample_correct_count>=0 and sample_wrong_count>=0 and sample_blank_count>=0
  ),
  constraint topic_assessments_total_matches check (
    sample_question_count=sample_correct_count+sample_wrong_count+sample_blank_count
  ),
  constraint topic_assessments_accuracy_valid check (accuracy>=0 and accuracy<=1),
  constraint topic_assessments_previous_mastery_valid check (
    previous_mastery_level in ('unknown','strong','sufficient','fragile','weak','critical')
  ),
  constraint topic_assessments_resulting_mastery_valid check (
    resulting_mastery_level in ('unknown','strong','sufficient','fragile','weak','critical')
  ),
  constraint topic_assessments_reason_not_blank check (btrim(assessment_reason)<>''),
  constraint topic_assessments_source_consistent check (
    (source_test_result_id is null and source_result_updated_at is null)
    or (source_test_result_id is not null and source_result_updated_at is not null)
  )
);

create unique index topic_assessments_source_version_unique
  on public.topic_assessments(user_id,source_test_result_id,source_result_updated_at)
  where source_test_result_id is not null;
create index topic_assessments_user_id_idx on public.topic_assessments(user_id);
create index topic_assessments_curriculum_node_id_idx on public.topic_assessments(curriculum_node_id);
create index topic_assessments_created_at_idx on public.topic_assessments(created_at desc);

create table public.revision_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_profile_id uuid not null,
  curriculum_node_id uuid not null,
  status text not null,
  revision_number integer not null,
  scheduled_for date not null,
  revision_type text not null,
  estimated_minutes integer not null,
  source_mastery_level text not null,
  decision_reason text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null,
  constraint revision_schedules_progress_owner_fk
    foreign key (exam_profile_id,curriculum_node_id,user_id)
    references public.topic_progress(exam_profile_id,curriculum_node_id,user_id) on delete cascade,
  constraint revision_schedules_curriculum_node_fk
    foreign key (curriculum_node_id) references public.curriculum_nodes(id),
  constraint revision_schedules_status_valid check (status in ('scheduled','due','completed','cancelled','superseded')),
  constraint revision_schedules_number_positive check (revision_number>0),
  constraint revision_schedules_type_valid check (revision_type in ('short_review','wrong_review','topic_test','intensive_review')),
  constraint revision_schedules_minutes_positive check (estimated_minutes>0),
  constraint revision_schedules_mastery_valid check (source_mastery_level in ('strong','sufficient','fragile','weak','critical')),
  constraint revision_schedules_reason_not_blank check (btrim(decision_reason)<>''),
  constraint revision_schedules_completion_consistent check (
    (status='completed' and completed_at is not null) or (status<>'completed' and completed_at is null)
  ),
  constraint revision_schedules_topic_number_unique unique(user_id,exam_profile_id,curriculum_node_id,revision_number)
);

create unique index revision_schedules_one_active_per_topic
  on public.revision_schedules(user_id,exam_profile_id,curriculum_node_id)
  where status in ('scheduled','due');
create index revision_schedules_user_id_idx on public.revision_schedules(user_id);
create index revision_schedules_curriculum_node_id_idx on public.revision_schedules(curriculum_node_id);
create index revision_schedules_scheduled_for_idx on public.revision_schedules(scheduled_for);
create index revision_schedules_status_idx on public.revision_schedules(status);

create trigger revision_schedules_set_updated_at
before update on public.revision_schedules
for each row execute function public.set_updated_at();

alter table public.topic_assessments enable row level security;
alter table public.revision_schedules enable row level security;

revoke all on public.topic_assessments,public.revision_schedules from anon,authenticated;
grant select on public.topic_assessments,public.revision_schedules to authenticated;

create policy "Users own topic assessments" on public.topic_assessments for select to authenticated
using ((select auth.uid())=user_id);
create policy "Users own revision schedules" on public.revision_schedules for select to authenticated
using ((select auth.uid())=user_id);

create function public.apply_topic_mastery_assessment(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_user_id uuid := auth.uid();
  v_profile_id uuid := (p_payload->>'examProfileId')::uuid;
  v_topic_id uuid := (p_payload->>'curriculumNodeId')::uuid;
  v_source_result_id uuid := nullif(p_payload->>'sourceTestResultId','')::uuid;
  v_source_updated_at timestamptz := nullif(p_payload->>'sourceResultUpdatedAt','')::timestamptz;
  v_assessment public.topic_assessments;
  v_revision public.revision_schedules;
  v_progress public.topic_progress;
  v_revision_payload jsonb := coalesce(p_payload->'revision','{}'::jsonb);
  v_revision_number integer;
begin
  select * into v_progress from public.topic_progress
  where user_id=v_user_id and exam_profile_id=v_profile_id and curriculum_node_id=v_topic_id
  for update;
  if not found then raise exception 'TOPIC_PROGRESS_NOT_FOUND'; end if;

  insert into public.topic_assessments(
    user_id,exam_profile_id,curriculum_node_id,trigger_type,source_test_result_id,source_result_updated_at,
    sample_question_count,sample_correct_count,sample_wrong_count,sample_blank_count,
    previous_mastery_level,resulting_mastery_level,assessment_reason
  ) values(
    v_user_id,v_profile_id,v_topic_id,p_payload->>'triggerType',v_source_result_id,v_source_updated_at,
    (p_payload->>'sampleQuestionCount')::integer,(p_payload->>'sampleCorrectCount')::integer,
    (p_payload->>'sampleWrongCount')::integer,(p_payload->>'sampleBlankCount')::integer,
    p_payload->>'previousMasteryLevel',p_payload->>'resultingMasteryLevel',p_payload->>'assessmentReason'
  )
  on conflict (user_id,source_test_result_id,source_result_updated_at)
    where source_test_result_id is not null do nothing
  returning * into v_assessment;

  if not found then
    select * into v_assessment from public.topic_assessments
    where user_id=v_user_id and source_test_result_id=v_source_result_id
      and source_result_updated_at=v_source_updated_at;
    select * into v_revision from public.revision_schedules
    where user_id=v_user_id and exam_profile_id=v_profile_id and curriculum_node_id=v_topic_id
      and status in ('scheduled','due');
    return jsonb_build_object(
      'assessment',to_jsonb(v_assessment),
      'revision',case when v_revision.id is null then null else to_jsonb(v_revision) end,
      'idempotent',true
    );
  end if;

  update public.topic_progress set
    mastery_level=p_payload->>'resultingMasteryLevel',
    state=p_payload->>'resultingTopicState',
    learned_at=case when p_payload->>'resultingTopicState'='learned' then coalesce(learned_at,now()) else learned_at end
  where id=v_progress.id
  returning * into v_progress;

  select * into v_revision from public.revision_schedules
  where user_id=v_user_id and exam_profile_id=v_profile_id and curriculum_node_id=v_topic_id
    and status in ('scheduled','due') for update;

  if coalesce((v_revision_payload->>'shouldSchedule')::boolean,false) then
    if found then
      update public.revision_schedules set
        status='scheduled',
        scheduled_for=(v_revision_payload->>'scheduledFor')::date,
        revision_type=v_revision_payload->>'revisionType',
        estimated_minutes=(v_revision_payload->>'estimatedMinutes')::integer,
        source_mastery_level=p_payload->>'resultingMasteryLevel',
        decision_reason=v_revision_payload->>'reason'
      where id=v_revision.id returning * into v_revision;
    else
      select coalesce(max(revision_number),0)+1 into v_revision_number
      from public.revision_schedules
      where user_id=v_user_id and exam_profile_id=v_profile_id and curriculum_node_id=v_topic_id;
      insert into public.revision_schedules(
        user_id,exam_profile_id,curriculum_node_id,status,revision_number,scheduled_for,
        revision_type,estimated_minutes,source_mastery_level,decision_reason
      ) values(
        v_user_id,v_profile_id,v_topic_id,'scheduled',v_revision_number,
        (v_revision_payload->>'scheduledFor')::date,v_revision_payload->>'revisionType',
        (v_revision_payload->>'estimatedMinutes')::integer,p_payload->>'resultingMasteryLevel',
        v_revision_payload->>'reason'
      ) returning * into v_revision;
    end if;
  elsif found then
    update public.revision_schedules set status='superseded'
    where id=v_revision.id returning * into v_revision;
  end if;

  return jsonb_build_object(
    'assessment',to_jsonb(v_assessment),
    'revision',case when v_revision.id is null then null else to_jsonb(v_revision) end,
    'topicProgress',to_jsonb(v_progress),
    'idempotent',false
  );
end $$;

create function public.complete_revision(p_revision_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_revision public.revision_schedules;
begin
  select * into v_revision from public.revision_schedules
  where id=p_revision_id and user_id=auth.uid() for update;
  if not found then raise exception 'REVISION_NOT_FOUND'; end if;
  if v_revision.status='completed' then return to_jsonb(v_revision); end if;
  if v_revision.status not in ('scheduled','due') then raise exception 'REVISION_NOT_ACTIVE'; end if;

  update public.revision_schedules set status='completed',completed_at=now()
  where id=v_revision.id returning * into v_revision;
  update public.topic_progress set
    last_revision_at=v_revision.completed_at,
    state=case when state in ('learned','maintenance') then 'maintenance' else state end
  where user_id=auth.uid() and exam_profile_id=v_revision.exam_profile_id
    and curriculum_node_id=v_revision.curriculum_node_id;
  return to_jsonb(v_revision);
end $$;

create function public.telegram_complete_revision(p_user_id uuid,p_revision_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$ begin
  perform set_config('request.jwt.claim.sub',p_user_id::text,true);
  return public.complete_revision(p_revision_id);
end $$;

create function public.telegram_apply_topic_mastery_assessment(p_user_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$ begin
  perform set_config('request.jwt.claim.sub',p_user_id::text,true);
  return public.apply_topic_mastery_assessment(p_payload);
end $$;

revoke all on function public.apply_topic_mastery_assessment(jsonb),public.complete_revision(uuid)
from public,anon;
grant execute on function public.apply_topic_mastery_assessment(jsonb),public.complete_revision(uuid)
to authenticated;

revoke all on function public.telegram_complete_revision(uuid,uuid),public.telegram_apply_topic_mastery_assessment(uuid,jsonb)
from public,anon,authenticated;
grant execute on function public.telegram_complete_revision(uuid,uuid),public.telegram_apply_topic_mastery_assessment(uuid,jsonb)
to service_role;
