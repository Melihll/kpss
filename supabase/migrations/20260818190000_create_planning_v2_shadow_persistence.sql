begin;

-- ============================================================
-- Planning Engine V2 — Shadow Persistence
--
-- Additive only.
--
-- This migration MUST NOT:
-- - change tasks
-- - change weekly_plans
-- - replace apply_plan_revision()
-- - change scheduler behavior
-- - automatically apply V2 proposals
--
-- V2 remains shadow-only after this migration.
-- ============================================================


-- ============================================================
-- 1. Learner State V2 projection
--
-- topic_progress remains the operational/canonical progress state.
-- This table stores richer evidence-derived planning state.
-- ============================================================

create table public.learner_unit_states_v2 (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  exam_profile_id uuid not null,

  curriculum_node_id uuid not null,

  mastery_mean numeric null,
  mastery_confidence numeric not null default 0,

  question_accuracy numeric null,
  question_count integer not null default 0,
  average_question_seconds numeric null,

  study_minutes integer not null default 0,
  evidence_count integer not null default 0,

  difficulty_estimate numeric null,

  last_studied_at timestamptz null,
  last_retrieval_at timestamptz null,

  memory_stability numeric null,
  memory_difficulty numeric null,
  retrievability numeric null,

  misconception_tags text[] not null default '{}'::text[],

  state_version text not null,
  evidence_fingerprint text null,
  evidence_watermark timestamptz null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint learner_unit_states_v2_progress_owner_fk
    foreign key (
      exam_profile_id,
      curriculum_node_id,
      user_id
    )
    references public.topic_progress (
      exam_profile_id,
      curriculum_node_id,
      user_id
    )
    on delete cascade,

  constraint learner_unit_states_v2_unique
    unique (
      user_id,
      exam_profile_id,
      curriculum_node_id
    ),

  constraint learner_unit_states_v2_mastery_mean_valid
    check (
      mastery_mean is null
      or mastery_mean between 0 and 1
    ),

  constraint learner_unit_states_v2_mastery_confidence_valid
    check (
      mastery_confidence between 0 and 1
    ),

  constraint learner_unit_states_v2_accuracy_valid
    check (
      question_accuracy is null
      or question_accuracy between 0 and 1
    ),

  constraint learner_unit_states_v2_counts_valid
    check (
      question_count >= 0
      and study_minutes >= 0
      and evidence_count >= 0
    ),

  constraint learner_unit_states_v2_question_speed_valid
    check (
      average_question_seconds is null
      or average_question_seconds >= 0
    ),

  constraint learner_unit_states_v2_difficulty_valid
    check (
      difficulty_estimate is null
      or difficulty_estimate between 0 and 1
    ),

  constraint learner_unit_states_v2_memory_stability_valid
    check (
      memory_stability is null
      or memory_stability >= 0
    ),

  constraint learner_unit_states_v2_memory_difficulty_valid
    check (
      memory_difficulty is null
      or memory_difficulty between 0 and 1
    ),

  constraint learner_unit_states_v2_retrievability_valid
    check (
      retrievability is null
      or retrievability between 0 and 1
    ),

  constraint learner_unit_states_v2_version_not_blank
    check (
      btrim(state_version) <> ''
    ),

  constraint learner_unit_states_v2_fingerprint_not_blank
    check (
      evidence_fingerprint is null
      or btrim(evidence_fingerprint) <> ''
    )
);

create index learner_unit_states_v2_user_profile_idx
  on public.learner_unit_states_v2(
    user_id,
    exam_profile_id
  );

create index learner_unit_states_v2_curriculum_idx
  on public.learner_unit_states_v2(
    curriculum_node_id
  );

create index learner_unit_states_v2_retrievability_idx
  on public.learner_unit_states_v2(
    retrievability
  )
  where retrievability is not null;

create trigger learner_unit_states_v2_set_updated_at
before update on public.learner_unit_states_v2
for each row execute function public.set_updated_at();


-- ============================================================
-- 2. Immutable Planning Snapshot archive
--
-- Every V2 decision must be explainable from one immutable snapshot.
-- ============================================================

create table public.planning_v2_snapshots (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  exam_profile_id uuid not null,

  weekly_plan_id uuid null,

  external_snapshot_id text not null,
  snapshot_hash text null,
  idempotency_key text not null,

  trigger_type text not null,
  requested_scope text not null,

  "current_date" date not null,
  week_start_date date not null,
  week_end_date date not null,

  available_minutes integer not null,
  planning_budget_minutes integer not null,
  reserve_minutes integer not null,

  source_plan_generation_version integer null,

  planner_version text not null,
  scoring_version text not null,
  learner_state_version text not null,
  snapshot_schema_version text not null,

  snapshot_payload jsonb not null,

  created_at timestamptz not null default now(),

  constraint planning_v2_snapshots_profile_owner_fk
    foreign key (
      exam_profile_id,
      user_id
    )
    references public.exam_profiles(
      id,
      user_id
    )
    on delete cascade,

  constraint planning_v2_snapshots_weekly_plan_owner_fk
    foreign key (
      weekly_plan_id,
      user_id,
      exam_profile_id
    )
    references public.weekly_plans(
      id,
      user_id,
      exam_profile_id
    )
    on delete cascade,

  constraint planning_v2_snapshots_owner_unique
    unique (
      id,
      user_id,
      exam_profile_id
    ),

  constraint planning_v2_snapshots_external_unique
    unique (
      user_id,
      external_snapshot_id
    ),

  constraint planning_v2_snapshots_idempotency_unique
    unique (
      user_id,
      idempotency_key
    ),

  constraint planning_v2_snapshots_trigger_valid
    check (
      trigger_type in (
        'STUDY_COMPLETED',
        'STUDY_DEVIATION',
        'CAPACITY_INCREASE',
        'CAPACITY_DECREASE',
        'MISSED_DAY',
        'MASTERY_CHANGE',
        'WEEKLY_REVIEW',
        'MANUAL_REPLAN'
      )
    ),

  constraint planning_v2_snapshots_scope_valid
    check (
      requested_scope in (
        'NO_REPLAN',
        'LOCAL_CAPACITY_REPAIR',
        'LOCAL_TASK_REPAIR',
        'LEARNING_PATH_REPAIR',
        'MISSED_DAY_REPAIR',
        'WEEKLY_REOPTIMIZATION',
        'MANUAL_REPLAN'
      )
    ),

  constraint planning_v2_snapshots_week_valid
    check (
      week_end_date = week_start_date + 6
      and extract(isodow from week_start_date) = 1
    ),

  constraint planning_v2_snapshots_current_date_valid
    check (
      "current_date" between
        week_start_date
        and week_end_date
    ),

  constraint planning_v2_snapshots_minutes_valid
    check (
      available_minutes >= 0
      and planning_budget_minutes >= 0
      and reserve_minutes >= 0
    ),

  constraint planning_v2_snapshots_generation_valid
    check (
      source_plan_generation_version is null
      or source_plan_generation_version > 0
    ),

  constraint planning_v2_snapshots_external_id_not_blank
    check (
      btrim(external_snapshot_id) <> ''
    ),

  constraint planning_v2_snapshots_hash_not_blank
    check (
      snapshot_hash is null
      or btrim(snapshot_hash) <> ''
    ),

  constraint planning_v2_snapshots_idempotency_not_blank
    check (
      btrim(idempotency_key) <> ''
    ),

  constraint planning_v2_snapshots_versions_not_blank
    check (
      btrim(planner_version) <> ''
      and btrim(scoring_version) <> ''
      and btrim(learner_state_version) <> ''
      and btrim(snapshot_schema_version) <> ''
    )
);

create index planning_v2_snapshots_user_week_idx
  on public.planning_v2_snapshots(
    user_id,
    week_start_date,
    created_at desc
  );

create index planning_v2_snapshots_plan_idx
  on public.planning_v2_snapshots(
    weekly_plan_id,
    created_at desc
  )
  where weekly_plan_id is not null;

create index planning_v2_snapshots_hash_idx
  on public.planning_v2_snapshots(
    snapshot_hash
  )
  where snapshot_hash is not null;


-- ============================================================
-- 3. Planning Proposal archive
--
-- Proposal persistence is separate from authoritative plan mutation.
--
-- No trigger automatically applies these rows.
-- ============================================================

create table public.planning_v2_proposals (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  exam_profile_id uuid not null,

  weekly_plan_id uuid null,

  planning_snapshot_id uuid not null,

  external_proposal_id text not null,
  idempotency_key text not null,

  trigger_type text not null,
  scope text not null,

  decision text not null,
  status text not null default 'shadow',

  changed_task_count integer not null default 0,

  apply_recommended boolean not null default false,
  validation_valid boolean not null default false,

  objective_before numeric null,
  objective_after numeric null,

  reason_codes text[] not null default '{}'::text[],

  proposal_payload jsonb not null,
  validation_payload jsonb not null,

  planner_version text not null,
  scoring_version text not null,
  learner_state_version text not null,

  apply_dedupe_key text null,

  applied_plan_revision_id uuid null
    references public.plan_revisions(id)
    on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  validated_at timestamptz null,
  approved_at timestamptz null,
  applied_at timestamptz null,
  superseded_at timestamptz null,

  constraint planning_v2_proposals_profile_owner_fk
    foreign key (
      exam_profile_id,
      user_id
    )
    references public.exam_profiles(
      id,
      user_id
    )
    on delete cascade,

  constraint planning_v2_proposals_weekly_plan_owner_fk
    foreign key (
      weekly_plan_id,
      user_id,
      exam_profile_id
    )
    references public.weekly_plans(
      id,
      user_id,
      exam_profile_id
    )
    on delete cascade,

  constraint planning_v2_proposals_snapshot_owner_fk
    foreign key (
      planning_snapshot_id,
      user_id,
      exam_profile_id
    )
    references public.planning_v2_snapshots(
      id,
      user_id,
      exam_profile_id
    )
    on delete cascade,

  constraint planning_v2_proposals_external_unique
    unique (
      user_id,
      external_proposal_id
    ),

  constraint planning_v2_proposals_idempotency_unique
    unique (
      user_id,
      idempotency_key
    ),

  constraint planning_v2_proposals_trigger_valid
    check (
      trigger_type in (
        'STUDY_COMPLETED',
        'STUDY_DEVIATION',
        'CAPACITY_INCREASE',
        'CAPACITY_DECREASE',
        'MISSED_DAY',
        'MASTERY_CHANGE',
        'WEEKLY_REVIEW',
        'MANUAL_REPLAN'
      )
    ),

  constraint planning_v2_proposals_scope_valid
    check (
      scope in (
        'NO_REPLAN',
        'LOCAL_CAPACITY_REPAIR',
        'LOCAL_TASK_REPAIR',
        'LEARNING_PATH_REPAIR',
        'MISSED_DAY_REPAIR',
        'WEEKLY_REOPTIMIZATION',
        'MANUAL_REPLAN'
      )
    ),

  constraint planning_v2_proposals_decision_valid
    check (
      decision in (
        'KEEP_PLAN',
        'READY_TO_APPLY',
        'BLOCKED'
      )
    ),

  constraint planning_v2_proposals_status_valid
    check (
      status in (
        'shadow',
        'validated',
        'blocked',
        'approved',
        'applied',
        'superseded'
      )
    ),

  constraint planning_v2_proposals_changed_count_valid
    check (
      changed_task_count >= 0
    ),

  constraint planning_v2_proposals_external_id_not_blank
    check (
      btrim(external_proposal_id) <> ''
    ),

  constraint planning_v2_proposals_idempotency_not_blank
    check (
      btrim(idempotency_key) <> ''
    ),

  constraint planning_v2_proposals_apply_dedupe_not_blank
    check (
      apply_dedupe_key is null
      or btrim(apply_dedupe_key) <> ''
    ),

  constraint planning_v2_proposals_versions_not_blank
    check (
      btrim(planner_version) <> ''
      and btrim(scoring_version) <> ''
      and btrim(learner_state_version) <> ''
    ),

  constraint planning_v2_proposals_applied_consistent
    check (
      (
        status = 'applied'
        and applied_at is not null
        and applied_plan_revision_id is not null
      )
      or
      (
        status <> 'applied'
        and applied_at is null
      )
    )
);

create index planning_v2_proposals_user_status_idx
  on public.planning_v2_proposals(
    user_id,
    status,
    created_at desc
  );

create index planning_v2_proposals_snapshot_idx
  on public.planning_v2_proposals(
    planning_snapshot_id
  );

create index planning_v2_proposals_week_idx
  on public.planning_v2_proposals(
    user_id,
    weekly_plan_id,
    created_at desc
  )
  where weekly_plan_id is not null;

create unique index planning_v2_proposals_apply_dedupe_unique
  on public.planning_v2_proposals(
    user_id,
    apply_dedupe_key
  )
  where apply_dedupe_key is not null;

create trigger planning_v2_proposals_set_updated_at
before update on public.planning_v2_proposals
for each row execute function public.set_updated_at();


-- ============================================================
-- 4. RLS / privileges
--
-- End users may inspect their V2 shadow state.
-- Production writes remain server-side only.
-- ============================================================

alter table public.learner_unit_states_v2
  enable row level security;

alter table public.planning_v2_snapshots
  enable row level security;

alter table public.planning_v2_proposals
  enable row level security;


revoke all
on public.learner_unit_states_v2,
   public.planning_v2_snapshots,
   public.planning_v2_proposals
from public, anon, authenticated;


grant select
on public.learner_unit_states_v2,
   public.planning_v2_snapshots,
   public.planning_v2_proposals
to authenticated;


grant select, insert, update, delete
on public.learner_unit_states_v2,
   public.planning_v2_snapshots,
   public.planning_v2_proposals
to service_role;


create policy "Users read own V2 learner state"
on public.learner_unit_states_v2
for select
to authenticated
using (
  (select auth.uid()) = user_id
);


create policy "Users read own V2 planning snapshots"
on public.planning_v2_snapshots
for select
to authenticated
using (
  (select auth.uid()) = user_id
);


create policy "Users read own V2 planning proposals"
on public.planning_v2_proposals
for select
to authenticated
using (
  (select auth.uid()) = user_id
);


comment on table public.learner_unit_states_v2 is
  'Evidence-derived Planning Engine V2 learner-state projection. topic_progress remains authoritative operational progress.';

comment on table public.planning_v2_snapshots is
  'Immutable Planning Engine V2 input snapshots used for deterministic and explainable shadow decisions.';

comment on table public.planning_v2_proposals is
  'Planning Engine V2 shadow proposals. Rows do not mutate weekly plans or tasks automatically.';


commit;

